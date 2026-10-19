import type { WASocket } from '@whiskeysockets/baileys';
import { supabase } from '../supabase/client.js';
import type { ContactoRow, EtiquetaWhatsappRow } from '../types/dominio.js';
import { obtenerEmpresaIdDeLinea } from './empresa.js';
import { buscarContacto, buscarContactoPorLid } from './contactos.js';

// Nota sobre tipos: @whiskeysockets/baileys define `Label` y
// `LabelAssociation` en Types/Label.ts y Types/LabelAssociation.ts, pero no
// los reexporta desde el paquete (Types/index.ts no incluye esos archivos).
// El evento en sí sí funciona en tiempo de ejecución — TypeScript infiere
// la forma de los parámetros desde BaileysEventMap sin que hagan falta esos
// nombres importables, así que los handlers de abajo no anotan el tipo a
// mano y usan el string literal 'label_jid' en vez del enum
// LabelAssociationType.Chat (que tampoco es importable).

// El chatId de una asociación de etiqueta a veces es el número real del
// contacto y a veces su @lid (ver database/instalar.sql); si ya aprendimos
// el mapeo (vía mensajes-entrantes.ts), usamos ese contacto.
//
// Importante: nunca creamos un contacto nuevo solo porque tiene una etiqueta.
// La sincronización inicial de WhatsApp Business trae el historial completo
// de etiquetas de la cuenta — de chats que nunca le escribieron a esta línea
// del CRM — y crear un contacto por cada uno llenaba "Contactos" de fichas
// fantasma sin conversación real. Si el contacto no existe todavía (porque
// nunca conversó con esta línea), simplemente no se sincroniza su etiqueta;
// apenas escriba y se cree su ficha por una conversación real, un futuro
// cambio de etiqueta la va a sincronizar sin problema.
async function resolverContactoDeChatId(empresaId: string, chatId: string): Promise<ContactoRow | null> {
  const valor = chatId.split('@')[0];
  if (chatId.endsWith('@lid')) {
    return buscarContactoPorLid(empresaId, valor);
  }
  return buscarContacto(empresaId, valor);
}

// WhatsApp Business trae 5 etiquetas predefinidas (id "1" a "5") que el
// cliente no crea con un labelEditAction propio -- existen de fábrica en
// la cuenta y WhatsApp nunca manda el evento `labels.edit` que les pondría
// nombre. Sin este mapa, buscarOCrearEtiqueta las deja para siempre con el
// nombre provisorio "Etiqueta 1", "Etiqueta 2", etc.
const NOMBRES_ETIQUETAS_PREDEFINIDAS: Record<string, string> = {
  '1': 'Nuevo cliente',
  '2': 'Nuevo pedido',
  '3': 'Pago pendiente',
  '4': 'Pagado',
  '5': 'Pedido completado',
};

// La ráfaga de eventos de la sincronización inicial (ver más abajo) puede
// saturar momentáneamente la conexión a Supabase -- vimos miles de
// "TypeError: fetch failed" seguidos en producción cuando varias líneas
// reconectan a la vez (ver conexion.ts / index.ts). Antes, cada uno de esos
// errores se perdía en el catch de cada handler sin reintentar, así que la
// etiqueta o asociación de ese evento se descartaba para siempre. Reintentamos unas pocas
// veces con una demora corta antes de dar por perdido el evento.
async function conReintentos<T>(tarea: () => Promise<T>, intentos = 4): Promise<T> {
  let ultimoError: unknown;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await tarea();
    } catch (err) {
      ultimoError = err;
      if (intento < intentos) {
        await new Promise((resolver) => setTimeout(resolver, 500 * intento));
      }
    }
  }
  throw ultimoError;
}

async function buscarOCrearEtiqueta(lineaId: string, whatsappId: string, nombreProvisorio: string): Promise<EtiquetaWhatsappRow> {
  const { data: existente } = await supabase
    .from('etiquetas_whatsapp')
    .select('id, linea_id, whatsapp_id, nombre, color, eliminada, actualizado_en')
    .eq('linea_id', lineaId)
    .eq('whatsapp_id', whatsappId)
    .maybeSingle();
  if (existente) return existente;

  // Puede llegar una asociación antes que la edición de la etiqueta que la
  // define (orden no garantizado durante la sincronización inicial): creamos
  // un registro provisorio que se corrige solo apenas llegue el labels.edit.
  const { data: nueva, error } = await supabase
    .from('etiquetas_whatsapp')
    .insert({ linea_id: lineaId, whatsapp_id: whatsappId, nombre: nombreProvisorio, color: null, eliminada: false })
    .select('id, linea_id, whatsapp_id, nombre, color, eliminada, actualizado_en')
    .single();
  if (!error) return nueva;

  // Dos eventos `labels.association` casi simultáneos para la misma
  // etiqueta nueva pueden chocar acá: el segundo pierde la carrera del
  // insert (unique en linea_id+whatsapp_id) — en ese caso no es un error
  // real, solo llegamos tarde; usamos la fila que ya insertó el otro.
  if (error.code === '23505') {
    const { data: existenteAhora, error: errorRelectura } = await supabase
      .from('etiquetas_whatsapp')
      .select('id, linea_id, whatsapp_id, nombre, color, eliminada, actualizado_en')
      .eq('linea_id', lineaId)
      .eq('whatsapp_id', whatsappId)
      .single();
    if (errorRelectura) throw errorRelectura;
    return existenteAhora;
  }
  throw error;
}

// La sincronización inicial de una cuenta de WhatsApp Business con mucho
// historial dispara cientos de eventos `labels.edit`/`labels.association`
// casi simultáneos. Sin este freno, cada uno salía en paralelo a Supabase y
// esa ráfaga de requests concurrentes terminaba saturándolo — vimos miles de
// "fetch failed"/"upstream request timeout" seguidos en producción, que
// dejaban etiquetas sin su nombre real ("Etiqueta 123") y probablemente
// contribuían a tirar abajo la conexión de WhatsApp de esa línea. Encolamos
// el trabajo de cada línea para que se procese de a uno.
const colasPorLinea = new Map<string, Promise<void>>();

function encolar(lineaId: string, tarea: () => Promise<void>): void {
  const cola = (colasPorLinea.get(lineaId) ?? Promise.resolve()).then(tarea);
  colasPorLinea.set(lineaId, cola);
}

// Cuentas de WhatsApp Business con mucha antigüedad acumulan etiquetas
// viejas que el cliente ya borró (o dejó de usar) mucho antes de conectar
// la línea a este CRM; WhatsApp a veces nunca reenvía el `labels.edit` con
// el nombre real de esas etiquetas históricas, y quedan para siempre como "Etiqueta N" en `etiquetas_whatsapp`.
// Mientras esa fila no tenga ningún contacto asignado en
// `contacto_etiquetas`, es pura basura invisible (ninguna pantalla del CRM
// la muestra, todas filtran por esa tabla) — la barremos sola en vez de
// necesitar una limpieza manual por SQL cada vez que se conecta una cuenta
// grande nueva.
async function limpiarEtiquetasHuerfanas(lineaId: string): Promise<void> {
  try {
    const { data: candidatas, error } = await supabase
      .from('etiquetas_whatsapp')
      .select('id, whatsapp_id, nombre')
      .eq('linea_id', lineaId);
    if (error || !candidatas?.length) return;

    const huerfanas = candidatas.filter((e) => e.nombre === `Etiqueta ${e.whatsapp_id}`);
    if (!huerfanas.length) return;

    const { data: usos } = await supabase
      .from('contacto_etiquetas')
      .select('etiqueta_id')
      .in('etiqueta_id', huerfanas.map((e) => e.id));
    const usadas = new Set((usos ?? []).map((u) => u.etiqueta_id));
    const aBorrar = huerfanas.filter((e) => !usadas.has(e.id)).map((e) => e.id);
    if (!aBorrar.length) return;

    await supabase.from('etiquetas_whatsapp').delete().in('id', aBorrar);
    console.log(`[${lineaId}] Limpiadas ${aBorrar.length} etiquetas de WhatsApp huérfanas (sin nombre real y sin contactos)`);
  } catch (err) {
    console.error(`[${lineaId}] Error limpiando etiquetas huérfanas:`, (err as Error).message);
  }
}

// Se corre una vez por conexión, con demora, para no competir con la ráfaga
// de inserts que dispara la sincronización inicial (ver el freno de
// `colasPorLinea` más abajo) — si a esa altura una etiqueta todavía no
// tiene nombre real ni contactos, no lo va a tener nunca.
export function programarLimpiezaDeEtiquetasHuerfanas(lineaId: string): void {
  setTimeout(() => {
    void limpiarEtiquetasHuerfanas(lineaId);
  }, 2 * 60 * 1000);
}

export function registrarEventosDeEtiquetas(sock: WASocket, lineaId: string): void {
  sock.ev.on('labels.edit', (label) => encolar(lineaId, async () => {
    try {
      await conReintentos(async () => {
        const nombre = label.name || NOMBRES_ETIQUETAS_PREDEFINIDAS[label.id];
        if (nombre) {
          await supabase.from('etiquetas_whatsapp').upsert(
            {
              linea_id: lineaId,
              whatsapp_id: label.id,
              nombre,
              color: label.color ?? null,
              eliminada: !!label.deleted,
              actualizado_en: new Date().toISOString(),
            },
            { onConflict: 'linea_id,whatsapp_id' },
          );
          return;
        }

        // WhatsApp a veces manda una edición parcial (ej. solo avisa que se
        // borró la etiqueta) sin repetir el nombre. Si ya existe la fila,
        // actualizamos color/eliminada pero NUNCA pisamos un nombre ya
        // guardado con el placeholder "Etiqueta N" (antes de este chequeo,
        // eso le pasó a etiquetas de la línea "Fernando Morón 76661675": el
        // labels.edit de borrado llegaba sin nombre y dejaba la etiqueta
        // pegada en el placeholder para siempre). Si es la primera vez que
        // vemos este id, no queda otra que insertarla con el placeholder.
        const { data: existente } = await supabase
          .from('etiquetas_whatsapp')
          .select('id')
          .eq('linea_id', lineaId)
          .eq('whatsapp_id', label.id)
          .maybeSingle();

        if (existente) {
          await supabase
            .from('etiquetas_whatsapp')
            .update({ color: label.color ?? null, eliminada: !!label.deleted, actualizado_en: new Date().toISOString() })
            .eq('id', existente.id);
        } else {
          await supabase.from('etiquetas_whatsapp').insert({
            linea_id: lineaId,
            whatsapp_id: label.id,
            nombre: `Etiqueta ${label.id}`,
            color: label.color ?? null,
            eliminada: !!label.deleted,
          });
        }
      });
    } catch (err) {
      console.error(`[${lineaId}] Error guardando etiqueta de WhatsApp:`, (err as Error).message);
    }
  }));

  sock.ev.on('labels.association', (evento) => encolar(lineaId, async () => {
    // Solo nos interesan las etiquetas puestas en el chat completo (el
    // contacto), no las que WhatsApp permite poner en un mensaje suelto.
    if (evento.association.type !== 'label_jid') return;

    try {
      await conReintentos(async () => {
        const empresaId = await obtenerEmpresaIdDeLinea(lineaId);
        if (!empresaId) return;

        const [contacto, etiqueta] = await Promise.all([
          resolverContactoDeChatId(empresaId, evento.association.chatId),
          buscarOCrearEtiqueta(
            lineaId,
            evento.association.labelId,
            NOMBRES_ETIQUETAS_PREDEFINIDAS[evento.association.labelId] ?? `Etiqueta ${evento.association.labelId}`,
          ),
        ]);

        if (!contacto) return; // chat sin conversación real en esta línea: no se crea un contacto fantasma

        if (evento.type === 'add') {
          await supabase.from('contacto_etiquetas').upsert(
            { contacto_id: contacto.id, etiqueta_id: etiqueta.id },
            { onConflict: 'contacto_id,etiqueta_id', ignoreDuplicates: true },
          );
        } else {
          await supabase
            .from('contacto_etiquetas')
            .delete()
            .eq('contacto_id', contacto.id)
            .eq('etiqueta_id', etiqueta.id);
        }
      });
    } catch (err) {
      console.error(`[${lineaId}] Error sincronizando asociación de etiqueta:`, (err as Error).message);
    }
  }));
}
