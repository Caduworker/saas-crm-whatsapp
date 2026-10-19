import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import type { EtapaVenta } from '../../../lib/tipos';

// Etapas del pipeline de ventas de la empresa, ordenadas — usadas por el
// selector de etapa en el chat (HiloMensajes), el Kanban y el Dashboard.
export function useEtapasVenta(empresaId: string | undefined) {
  const [etapas, setEtapas] = useState<EtapaVenta[]>([]);

  const cargar = async () => {
    if (!empresaId) return;
    const { data } = await supabase.from('etapas_venta').select('*').order('orden').returns<EtapaVenta[]>();
    setEtapas(data || []);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) return;
    const canal = supabase
      .channel(`etapas-venta-${empresaId}-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etapas_venta' }, () => cargar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  return etapas;
}
