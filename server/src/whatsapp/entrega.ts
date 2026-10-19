import { WAMessageStatus, type WASocket } from '@whiskeysockets/baileys';
import { supabase } from '../supabase/client.js';

// WhatsApp puede aceptar un mensaje saliente y rechazar su entrega después,
// de forma asíncrona (ack de error — ej. código 463, asociado a
// restricciones anti-spam sobre la cuenta que envía). Sin esto, el mensaje
// quedaba guardado como "enviado" para siempre y el agente nunca se
// enteraba de que no llegó. Ver database/instalar.sql.
export function registrarSeguimientoDeEntrega(sock: WASocket, lineaId: string): void {
  sock.ev.on('messages.update', async (actualizaciones) => {
    for (const { key, update } of actualizaciones) {
      if (!key.fromMe || !key.id || update.status !== WAMessageStatus.ERROR) continue;
      const codigo = update.messageStubParameters?.[0];
      try {
        await supabase
          .from('mensajes')
          .update({ estado_entrega: 'error', error_entrega: codigo ? String(codigo) : null })
          .eq('whatsapp_id', key.id);
      } catch (err) {
        console.error(`[${lineaId}] Error guardando estado de entrega:`, (err as Error).message);
      }
    }
  });
}
