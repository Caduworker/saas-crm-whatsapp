import fs from 'node:fs';
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import type { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import { actualizarEstadoLinea, borrarSesion, carpetaAuth, guardarSesion, obtenerSesion } from './sesiones.js';
import { procesarMensajeEntrante, procesarMensajeSaliente } from './mensajes-entrantes.js';
import { programarLimpiezaDeEtiquetasHuerfanas, registrarEventosDeEtiquetas } from './etiquetas.js';
import { registrarSeguimientoDeEntrega } from './entrega.js';
import { fueEnviadoPorCRM } from './mensajes-enviados-por-crm.js';

// Cuántas veces seguidas se reintentó reconectar cada línea sin éxito. Con
// esto evitamos un loop infinito cuando el problema es persistente (ej. un
// QR que nadie escanea nunca — Baileys tira "QR refs attempts ended" y sin
// este freno se reintentaría para siempre, cada vez más rápido de lo que
// conviene). Se resetea apenas la conexión abre bien.
const intentosReconexion = new Map<string, number>();
const MAX_INTENTOS_RECONEXION = 5;
const ESPERA_BASE_MS = 3000;
const ESPERA_MAXIMA_MS = 60000;

export async function iniciarConexion(lineaId: string): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState(carpetaAuth(lineaId));
  // La versión de WhatsApp Web que trae Baileys por defecto se queda vieja y
  // WhatsApp empieza a rechazar el vínculo ("No se pudo conectar") aunque el
  // QR escanee bien. Pedimos la vigente; si falla la consulta usamos la default.
  const version = await fetchLatestBaileysVersion()
    .then((r) => r.version)
    .catch(() => undefined);
  const sock = makeWASocket({ auth: state, printQRInTerminal: false, ...(version ? { version } : {}) });

  guardarSesion(lineaId, { sock, estado: 'conectando', qrDataUrl: null });

  sock.ev.on('creds.update', saveCreds);
  // Si la línea es un WhatsApp Business, esto trae la sincronización inicial
  // de etiquetas que el cliente ya tenía cargadas, y después los cambios en
  // vivo. Si no es Business, estos eventos simplemente nunca se disparan.
  registrarEventosDeEtiquetas(sock, lineaId);
  registrarSeguimientoDeEntrega(sock, lineaId);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const sesionActual = obtenerSesion(lineaId);

    if (qr) {
      const qrDataUrl = await qrcode.toDataURL(qr);
      guardarSesion(lineaId, { ...sesionActual, sock, qrDataUrl, estado: 'conectando' });
      await actualizarEstadoLinea(lineaId, 'conectando');
    }

    if (connection === 'close') {
      const codigo = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      // Una línea que nunca llegó a vincularse y cuyo QR venció (408) no se
      // reconecta sola: cada reintento generaba un QR nuevo cada pocos segundos
      // y el que el cliente escaneaba ya pertenecía a un socket muerto, así que
      // el celular decía "No se pudo conectar". Se reinicia a mano con "Ver QR".
      // OJO: `creds.registered` NO sirve acá — para una línea vinculada con QR
      // queda en false, así que una caída de red (408 "Connection was lost")
      // se confundía con "QR vencido", no se reconectaba y, peor, se borraba la
      // carpeta de credenciales (pasó el 2026-10-15: se cayeron todas las
      // líneas a la vez y hubo que reescanear todos los QR). Una línea ya
      // vinculada siempre tiene `creds.me`.
      const qrVencidoSinVincular = codigo === DisconnectReason.timedOut && !state.creds.me;
      const debeReconectar = codigo !== DisconnectReason.loggedOut && !qrVencidoSinVincular;
      console.log(`[${lineaId}] Conexión cerrada (código ${codigo ?? 'desconocido'}: ${(lastDisconnect?.error as Error | undefined)?.message ?? 'sin detalle'}).`, debeReconectar ? 'Reconectando...' : qrVencidoSinVincular ? 'QR vencido sin vincular, esperando que se pida uno nuevo.' : 'Sesión cerrada.');
      if (debeReconectar) {
        const intentos = (intentosReconexion.get(lineaId) ?? 0) + 1;
        intentosReconexion.set(lineaId, intentos);
        if (intentos > MAX_INTENTOS_RECONEXION) {
          console.error(`[${lineaId}] ${intentos} intentos de reconexión seguidos sin éxito — dejo de reintentar para no crashear el proceso. Reconectá manualmente desde Conexiones.`);
          intentosReconexion.delete(lineaId);
          borrarSesion(lineaId);
          await actualizarEstadoLinea(lineaId, 'desconectado');
        } else {
          const espera = Math.min(ESPERA_BASE_MS * 2 ** (intentos - 1), ESPERA_MAXIMA_MS);
          console.log(`[${lineaId}] Reintento ${intentos}/${MAX_INTENTOS_RECONEXION} en ${espera}ms...`);
          setTimeout(() => {
            // Sin este .catch(), un rechazo acá tira abajo TODO el proceso —
            // y con él, las líneas de WhatsApp de todas las demás empresas.
            iniciarConexion(lineaId).catch((err) => console.error(`[${lineaId}] Error reconectando:`, err.message));
          }, espera);
        }
      } else {
        intentosReconexion.delete(lineaId);
        borrarSesion(lineaId);
        await actualizarEstadoLinea(lineaId, 'desconectado');
        // Solo un cierre de sesión real (el usuario desvinculó el dispositivo)
        // invalida las credenciales; un QR vencido sin vincular no tiene nada
        // que perder pero tampoco hace falta borrarlo.
        if (codigo === DisconnectReason.loggedOut) fs.rmSync(carpetaAuth(lineaId), { recursive: true, force: true });
      }
    } else if (connection === 'open') {
      intentosReconexion.delete(lineaId);
      const numero = sock.user?.id?.split(':')[0] || null;
      guardarSesion(lineaId, { sock, estado: 'activo', qrDataUrl: null });
      await actualizarEstadoLinea(lineaId, 'activo', numero);
      console.log(`[${lineaId}] ✔ Conectado a WhatsApp correctamente. Escuchando mensajes...`);
      programarLimpiezaDeEtiquetasHuerfanas(lineaId);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      // Ignoramos grupos y estados, pero aceptamos tanto @s.whatsapp.net (número real)
      // como @lid (el identificador anónimo que WhatsApp usa cada vez más seguido).
      if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) continue;
      if (msg.key.fromMe) {
        // Si lo mandó el CRM (routes/enviar.ts), ya está guardado con su
        // whatsapp_id; lo ignoramos acá para no duplicarlo. Si no, es un
        // mensaje mandado a mano desde el teléfono y hay que guardarlo para
        // que la conversación se vea igual en ambos lados.
        if (msg.key.id && fueEnviadoPorCRM(msg.key.id)) continue;
        await procesarMensajeSaliente(msg, lineaId);
        continue;
      }
      await procesarMensajeEntrante(msg, sock, lineaId);
    }
  });

  return sock;
}
