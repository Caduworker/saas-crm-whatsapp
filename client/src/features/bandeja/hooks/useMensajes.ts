import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import type { Mensaje } from '../../../lib/tipos';

export function useMensajes(conversacionId: string | null) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);

  const cargarMensajes = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('mensajes')
      .select('*')
      .eq('conversacion_id', id)
      .order('creado_en', { ascending: true })
      .returns<Mensaje[]>();
    setMensajes(data || []);
  }, []);

  useEffect(() => {
    if (conversacionId) cargarMensajes(conversacionId);
    else setMensajes([]);
  }, [conversacionId, cargarMensajes]);

  const agregarMensaje = (mensaje: Mensaje) => {
    setMensajes((prev) => (prev.some((m) => m.id === mensaje.id) ? prev : [...prev, mensaje]));
  };

  // Un mensaje ya insertado puede cambiar después (ej. WhatsApp rechaza la
  // entrega de forma asíncrona y le actualizamos el estado_entrega) — esto
  // reemplaza esa fila en el estado local sin tocar el resto.
  const actualizarMensaje = (mensaje: Mensaje) => {
    setMensajes((prev) => prev.map((m) => (m.id === mensaje.id ? mensaje : m)));
  };

  return { mensajes, agregarMensaje, actualizarMensaje };
}
