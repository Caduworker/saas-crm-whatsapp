import { supabase } from '../supabase/client.js';

// Empresa de cada línea, cacheada en memoria — no cambia mientras el
// backend está corriendo, así que evitamos una consulta por cada evento
// (pueden llegar varias decenas juntas en la sincronización inicial).
const empresaPorLinea = new Map<string, string>();

export async function obtenerEmpresaIdDeLinea(lineaId: string): Promise<string | null> {
  const cacheada = empresaPorLinea.get(lineaId);
  if (cacheada) return cacheada;
  const { data } = await supabase.from('lineas_whatsapp').select('empresa_id').eq('id', lineaId).maybeSingle();
  if (!data) return null;
  empresaPorLinea.set(lineaId, data.empresa_id);
  return data.empresa_id;
}
