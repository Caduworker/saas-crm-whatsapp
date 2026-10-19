import { Router } from 'express';
import { obtenerSesion } from '../whatsapp/sesiones.js';
import { buscarOCrearConversacion } from '../whatsapp/mensajes-entrantes.js';
import { convertirAOggOpus } from '../whatsapp/audio.js';
import { marcarEnviadoPorCRM } from '../whatsapp/mensajes-enviados-por-crm.js';
import { supabase } from '../supabase/client.js';

export const enviarRouter = Router();

enviarRouter.post('/enviar', async (req, res) => {
  const { telefono, tipo = 'texto', texto, media_url, agente_id, linea_id, mimetype } = req.body;

  if (!telefono) return res.status(400).json({ error: 'Falta telefono' });
  if (!linea_id) return res.status(400).json({ error: 'Falta linea_id' });
  if (tipo === 'texto' && !texto) return res.status(400).json({ error: 'Falta texto' });
  if (tipo !== 'texto' && !media_url) return res.status(400).json({ error: 'Falta media_url' });

  const sesion = obtenerSesion(linea_id);
  if (!sesion || sesion.estado !== 'activo') {
    return res.status(503).json({ error: 'Esa línea de WhatsApp no está conectada' });
  }

  try {
    const jid = telefono.includes('@') ? telefono : `${telefono}@s.whatsapp.net`;

    let contenidoWA;
    if (tipo === 'texto') {
      contenidoWA = { text: texto };
    } else if (tipo === 'imagen') {
      contenidoWA = { image: { url: media_url }, caption: texto || undefined };
    } else if (tipo === 'pdf') {
      contenidoWA = { document: { url: media_url }, mimetype: 'application/pdf', fileName: texto || 'documento.pdf' };
    } else if (tipo === 'documento') {
      // Cualquier archivo (zip, Excel, Word, PPT...), no solo PDF — a
      // diferencia de 'pdf', acá el mimetype real viene del navegador
      // (input.files[0].type) porque puede ser cualquier cosa.
      contenidoWA = { document: { url: media_url }, mimetype: mimetype || 'application/octet-stream', fileName: texto || 'archivo' };
    } else if (tipo === 'audio') {
      // El navegador graba en el contenedor que soporte (WebM/Opus,
      // MP4/AAC en Safari, etc.) — para que WhatsApp lo muestre como nota
      // de voz de verdad hay que mandarlo como OGG/Opus. Lo que queda
      // guardado en `mensajes` sigue siendo el archivo original (el
      // navegador lo reproduce bien tal cual); esta conversión es solo
      // para el envío por WhatsApp.
      const original = await fetch(media_url);
      if (!original.ok) throw new Error('No se pudo descargar el audio grabado');
      const bufferOriginal = Buffer.from(await original.arrayBuffer());
      const bufferOgg = await convertirAOggOpus(bufferOriginal);
      contenidoWA = { audio: bufferOgg, mimetype: 'audio/ogg; codecs=opus', ptt: true };
    } else {
      return res.status(400).json({ error: 'Tipo no soportado' });
    }

    const resultado = await sesion.sock.sendMessage(jid, contenidoWA);
    if (resultado?.key?.id) marcarEnviadoPorCRM(resultado.key.id);

    const conversacion = await buscarOCrearConversacion(linea_id, telefono);

    await supabase.from('mensajes').insert({
      conversacion_id: conversacion.id,
      remitente: 'agente',
      agente_id: agente_id || null,
      tipo,
      contenido: texto || null,
      media_url: tipo !== 'texto' ? media_url : null,
      // Guardamos el id de WhatsApp para poder marcar el mensaje si más
      // adelante llega un ack de error (entrega rechazada) — ver
      // server/src/whatsapp/entrega.ts.
      whatsapp_id: resultado?.key?.id || null,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Error enviando mensaje:', (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});
