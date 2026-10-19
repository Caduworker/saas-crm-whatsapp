import { supabase } from '../supabase/client.js';
import type { ContactoRow } from '../types/dominio.js';

export async function buscarContacto(empresaId: string, telefono: string): Promise<ContactoRow | null> {
  const { data } = await supabase
    .from('contactos')
    .select('id, empresa_id, telefono, lid')
    .eq('empresa_id', empresaId)
    .eq('telefono', telefono)
    .maybeSingle();
  return data ?? null;
}

export async function buscarOCrearContacto(empresaId: string, telefono: string): Promise<ContactoRow> {
  const { data: existente } = await supabase
    .from('contactos')
    .select('id, empresa_id, telefono, lid')
    .eq('empresa_id', empresaId)
    .eq('telefono', telefono)
    .maybeSingle();
  if (existente) return existente;

  const { data: nuevo, error } = await supabase
    .from('contactos')
    .insert({ empresa_id: empresaId, telefono })
    .select('id, empresa_id, telefono, lid')
    .single();
  if (error) throw error;
  return nuevo;
}

// Busca el contacto al que WhatsApp ya le conoce este @lid (ver database/instalar.sql).
export async function buscarContactoPorLid(empresaId: string, lid: string): Promise<ContactoRow | null> {
  const { data } = await supabase
    .from('contactos')
    .select('id, empresa_id, telefono, lid')
    .eq('empresa_id', empresaId)
    .eq('lid', lid)
    .maybeSingle();
  return data ?? null;
}

// Aprende la relación @lid ↔ teléfono real de un contacto, para que las
// etiquetas de WhatsApp Business que lleguen referenciando el chat por su
// @lid caigan en el mismo contacto que el que ya tiene por teléfono.
export async function registrarLidDeContacto(empresaId: string, telefono: string, lid: string): Promise<void> {
  const contacto = await buscarOCrearContacto(empresaId, telefono);
  if (contacto.lid === lid) return;
  await supabase.from('contactos').update({ lid }).eq('id', contacto.id);
}
