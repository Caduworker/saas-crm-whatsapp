import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import type { Contacto } from '../../../lib/tipos';

// Busca el contacto de este teléfono (dentro de la empresa) o lo crea si
// todavía no existe — mismo "get or create" que ya hacía PanelContacto.tsx
// a mano, ahora compartido con HiloMensajes.tsx para el selector de etapa.
export function useContacto(telefono: string | null, empresaId: string | undefined) {
  const [contacto, setContacto] = useState<Contacto | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargarOCrearContacto = async () => {
    if (!telefono || !empresaId) return;
    setCargando(true);
    let data: Contacto | null = (
      await supabase.from('contactos').select('*').eq('empresa_id', empresaId).eq('telefono', telefono).maybeSingle()
    ).data as Contacto | null;
    if (!data) {
      const { data: nuevo } = await supabase.from('contactos').insert({ empresa_id: empresaId, telefono }).select().single();
      data = nuevo as Contacto;
    }
    setContacto(data);
    setCargando(false);
  };

  useEffect(() => {
    if (telefono && empresaId) cargarOCrearContacto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telefono, empresaId]);

  useEffect(() => {
    if (!contacto?.id) return;
    const canal = supabase
      .channel(`contacto-${contacto.id}-${Math.random()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contactos', filter: `id=eq.${contacto.id}` }, (payload) => {
        setContacto(payload.new as Contacto);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [contacto?.id]);

  return { contacto, cargando, recargar: cargarOCrearContacto, setContacto };
}
