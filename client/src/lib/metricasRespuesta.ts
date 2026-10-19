import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// Meta de respuesta: un cliente debería recibir respuesta humana en menos de
// esto. Es el mismo umbral "verde" que usa la lista de chats.
export const META_RESPUESTA_MIN = 5;

export interface MetricasRespuesta {
  cargando: boolean;
  /** Minutos promedio entre un mensaje del cliente y la primera respuesta de un agente. */
  promedioMin: number | null;
  /** Mediana: menos sensible a un chat olvidado que a uno atendido al instante. */
  medianaMin: number | null;
  /** % de respuestas dadas dentro de la meta. */
  pctATiempo: number | null;
  respondidos: number;
  /** Mensajes de cliente del período que todavía no tienen respuesta de un agente. */
  sinResponder: number;
}

interface FilaMensaje {
  conversacion_id: string;
  remitente: 'cliente' | 'agente';
  agente_id: string | null;
  creado_en: string;
}

// Trae los mensajes del período en páginas (Supabase corta en 1000 por consulta).
async function mensajesDelPeriodo(desde: Date, hasta: Date): Promise<FilaMensaje[]> {
  const todos: FilaMensaje[] = [];
  const PAGINA = 1000;
  for (let pagina = 0; pagina < 20; pagina++) {
    const { data, error } = await supabase
      .from('mensajes')
      .select('conversacion_id, remitente, agente_id, creado_en')
      .gte('creado_en', desde.toISOString())
      .lte('creado_en', hasta.toISOString())
      .order('creado_en', { ascending: true })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1)
      .returns<FilaMensaje[]>();
    if (error || !data) break;
    todos.push(...data);
    if (data.length < PAGINA) break;
  }
  return todos;
}

// Por conversación, recorre los mensajes en orden: el primer mensaje del
// cliente que queda sin contestar abre un "pendiente"; el siguiente mensaje de
// un agente lo cierra y la diferencia es el tiempo de respuesta. Solo cuentan
// las respuestas enviadas desde el CRM (con agente_id): el bot y lo que se
// escribe desde el celular se guardan sin agente, así que cierran el pendiente
// pero no entran al promedio (un saludo automático al instante lo falsearía).
export function calcularRespuestas(filas: FilaMensaje[]): Omit<MetricasRespuesta, 'cargando'> {
  const pendiente = new Map<string, number>();
  const tiempos: number[] = [];
  for (const f of filas) {
    const t = new Date(f.creado_en).getTime();
    if (f.remitente === 'cliente') {
      if (!pendiente.has(f.conversacion_id)) pendiente.set(f.conversacion_id, t);
    } else if (pendiente.has(f.conversacion_id)) {
      if (f.agente_id) tiempos.push((t - pendiente.get(f.conversacion_id)!) / 60000);
      pendiente.delete(f.conversacion_id);
    }
  }
  const ordenados = [...tiempos].sort((a, b) => a - b);
  const suma = tiempos.reduce((a, b) => a + b, 0);
  return {
    promedioMin: tiempos.length ? suma / tiempos.length : null,
    medianaMin: ordenados.length ? ordenados[Math.floor(ordenados.length / 2)] : null,
    pctATiempo: tiempos.length ? Math.round((tiempos.filter((m) => m <= META_RESPUESTA_MIN).length / tiempos.length) * 100) : null,
    respondidos: tiempos.length,
    sinResponder: pendiente.size,
  };
}

export function useMetricasRespuesta(desde: Date, hasta: Date): MetricasRespuesta {
  const [estado, setEstado] = useState<MetricasRespuesta>({ cargando: true, promedioMin: null, medianaMin: null, pctATiempo: null, respondidos: 0, sinResponder: 0 });
  const claveDesde = desde.getTime();
  const claveHasta = Math.floor(hasta.getTime() / 60000); // se recalcula como mucho cada minuto

  useEffect(() => {
    let vivo = true;
    mensajesDelPeriodo(new Date(claveDesde), new Date(claveHasta * 60000)).then((filas) => {
      if (vivo) setEstado({ cargando: false, ...calcularRespuestas(filas) });
    });
    return () => {
      vivo = false;
    };
  }, [claveDesde, claveHasta]);

  return estado;
}

// "3 min 12 s", "45 s", "2 h 5 min": para mostrar tiempos en pantalla.
export function formatoDuracion(minutos: number | null): string {
  if (minutos === null) return '—';
  const seg = Math.round(minutos * 60);
  if (seg < 60) return `${seg} s`;
  if (minutos < 60) return `${Math.floor(minutos)} min ${seg % 60 ? `${seg % 60} s` : ''}`.trim();
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
