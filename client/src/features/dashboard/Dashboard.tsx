import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { tinte, NAVY, TEAL, AMBER, BORDE, FONDO_CONTENIDO, SOMBRA_CARD, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO, colorEtiquetaWhatsapp } from '../../lib/tema';
import { EncabezadoPagina } from '../../components/ui';
import { formatoDuracion, META_RESPUESTA_MIN, useMetricasRespuesta } from '../../lib/metricasRespuesta';
import type { Contacto, EtapaVenta, EtiquetaWhatsapp } from '../../lib/tipos';

interface TarjetaProps {
  etiqueta: string;
  valor: string | number;
  hint: string;
}

function Tarjeta({ etiqueta, valor, hint }: TarjetaProps) {
  return (
    <div className="rounded-2xl px-4 py-4 flex flex-col gap-2" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
      <span className="text-[12.5px] font-semibold" style={{ color: 'var(--fg-2)' }}>{etiqueta}</span>
      <span className="text-[30px] font-bold tracking-tight" style={{ color: 'var(--fg)' }}>{valor}</span>
      <span className="text-xs" style={{ color: TEXTO_TERCIARIO }}>{hint}</span>
    </div>
  );
}

interface ConversacionResumen {
  id: string;
  estado: string;
  linea_id: string;
  contacto_telefono: string;
}

interface LineaResumen {
  id: string;
  nombre: string;
}

type Rango = 'hoy' | 'semana' | 'mes' | 'personalizado';

function inicioDelDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatoFechaInput(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { usuario } = useAuth();
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>([]);
  const [lineas, setLineas] = useState<LineaResumen[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [etapas, setEtapas] = useState<EtapaVenta[]>([]);
  const [etiquetas, setEtiquetas] = useState<EtiquetaWhatsapp[]>([]);
  const [etiquetasPorContacto, setEtiquetasPorContacto] = useState<Record<string, string[]>>({});
  const [mensajesEntrantes, setMensajesEntrantes] = useState(0);

  const [rango, setRango] = useState<Rango>('hoy');
  const [desdePersonalizado, setDesdePersonalizado] = useState(formatoFechaInput(new Date()));
  const [hastaPersonalizado, setHastaPersonalizado] = useState(formatoFechaInput(new Date()));

  const { desde, hasta } = useMemo(() => {
    const ahora = new Date();
    if (rango === 'hoy') return { desde: inicioDelDia(ahora), hasta: ahora };
    if (rango === 'semana') { const d = inicioDelDia(ahora); d.setDate(d.getDate() - 6); return { desde: d, hasta: ahora }; }
    if (rango === 'mes') { const d = inicioDelDia(ahora); d.setDate(d.getDate() - 29); return { desde: d, hasta: ahora }; }
    const d = new Date(desdePersonalizado);
    const h = new Date(hastaPersonalizado);
    h.setHours(23, 59, 59, 999);
    return { desde: d, hasta: h };
  }, [rango, desdePersonalizado, hastaPersonalizado]);

  const respuesta = useMetricasRespuesta(desde, hasta);

  useEffect(() => {
    const cargar = async () => {
      const { data: conv } = await supabase.from('conversaciones').select('id, estado, linea_id, contacto_telefono').returns<ConversacionResumen[]>();
      const { data: lin } = await supabase.from('lineas_whatsapp').select('id, nombre').returns<LineaResumen[]>();
      const { data: cont } = await supabase.from('contactos').select('*').returns<Contacto[]>();
      const { data: etp } = await supabase.from('etapas_venta').select('*').order('orden').returns<EtapaVenta[]>();
      setConversaciones(conv || []);
      setLineas(lin || []);
      setContactos(cont || []);
      setEtapas(etp || []);

      const lineaIds = (lin || []).map((l) => l.id);
      if (lineaIds.length > 0) {
        const { data: etq } = await supabase.from('etiquetas_whatsapp').select('id, nombre, color').in('linea_id', lineaIds).eq('eliminada', false).returns<EtiquetaWhatsapp[]>();
        setEtiquetas(etq || []);
      }

      const contactoIds = (cont || []).map((c) => c.id);
      if (contactoIds.length > 0) {
        const { data: ce } = await supabase.from('contacto_etiquetas').select('contacto_id, etiqueta_id').in('contacto_id', contactoIds).returns<{ contacto_id: string; etiqueta_id: string }[]>();
        const mapa: Record<string, string[]> = {};
        (ce || []).forEach((fila) => {
          mapa[fila.contacto_id] = mapa[fila.contacto_id] || [];
          mapa[fila.contacto_id].push(fila.etiqueta_id);
        });
        setEtiquetasPorContacto(mapa);
      }
    };
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.empresa_id]);

  useEffect(() => {
    const cargarMensajes = async () => {
      const { count } = await supabase
        .from('mensajes')
        .select('id', { count: 'exact', head: true })
        .eq('remitente', 'cliente')
        .gte('creado_en', desde.toISOString())
        .lte('creado_en', hasta.toISOString());
      setMensajesEntrantes(count || 0);
    };
    cargarMensajes();
  }, [desde, hasta]);

  const idsEtapasGanadas = new Set(etapas.filter((e) => e.tipo === 'ganada').map((e) => e.id));
  const enRango = (fecha: string | null) => !!fecha && new Date(fecha) >= desde && new Date(fecha) <= hasta;

  const leadsNuevos = contactos.filter((c) => enRango(c.creado_en));
  const ventasRealizadas = contactos.filter((c) => c.etapa_id && idsEtapasGanadas.has(c.etapa_id) && enRango(c.etapa_actualizada_en));
  const tasaConversion = leadsNuevos.length > 0 ? Math.round((ventasRealizadas.length / leadsNuevos.length) * 100) : 0;

  const hace3Dias = new Date();
  hace3Dias.setDate(hace3Dias.getDate() - 3);
  const leadsEstancados = contactos.filter((c) => {
    const etapa = etapas.find((e) => e.id === c.etapa_id);
    return etapa && etapa.tipo === 'normal' && (!c.etapa_actualizada_en || new Date(c.etapa_actualizada_en) < hace3Dias);
  });

  const abiertas = conversaciones.filter((c) => c.estado !== 'cerrado').length;
  const resueltas = conversaciones.filter((c) => c.estado === 'cerrado').length;
  const porLinea = lineas.map((l) => ({ nombre: l.nombre, total: conversaciones.filter((c) => c.linea_id === l.id).length }));
  const maxPorLinea = Math.max(1, ...porLinea.map((l) => l.total));

  const porEtapa = etapas
    .filter((e) => e.tipo !== 'perdida')
    .map((e) => ({ etapa: e, total: contactos.filter((c) => c.etapa_id === e.id).length }));
  const maxPorEtapa = Math.max(1, ...porEtapa.map((e) => e.total));

  const porEtiqueta = etiquetas.map((et) => {
    const contactoIdsConEtiqueta = new Set(Object.entries(etiquetasPorContacto).filter(([, ids]) => ids.includes(et.id)).map(([contactoId]) => contactoId));
    const leadsEtiqueta = leadsNuevos.filter((c) => contactoIdsConEtiqueta.has(c.id));
    const ventasEtiqueta = ventasRealizadas.filter((c) => contactoIdsConEtiqueta.has(c.id));
    const tasa = leadsEtiqueta.length > 0 ? Math.round((ventasEtiqueta.length / leadsEtiqueta.length) * 100) : 0;
    return { etiqueta: et, leads: leadsEtiqueta.length, ventas: ventasEtiqueta.length, tasa };
  });

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col gap-5">
        <EncabezadoPagina titulo="Dashboard" subtitulo="Mensajes, ventas y conversión del período elegido." />

        <div className="sticky top-0 z-10 -mx-4 md:-mx-8 px-4 md:px-8 py-2 flex flex-wrap items-center gap-2" style={{ backgroundColor: FONDO_CONTENIDO, borderBottom: `1px solid ${BORDE}` }} role="group" aria-label="Período">
          {(['hoy', 'semana', 'mes', 'personalizado'] as Rango[]).map((r) => (
            <button
              key={r}
              onClick={() => setRango(r)}
              className="text-[12.5px] font-semibold rounded-lg px-3 py-1.5 capitalize"
              style={rango === r ? { backgroundColor: TEAL, color: 'var(--accent-fg)' } : { backgroundColor: 'var(--surface)', color: TEXTO_SECUNDARIO, border: `1px solid ${BORDE}` }}
            >
              {r === 'hoy' ? 'Hoy' : r === 'semana' ? 'Esta semana' : r === 'mes' ? 'Este mes' : 'Personalizado'}
            </button>
          ))}
          {rango === 'personalizado' && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={desdePersonalizado} onChange={(e) => setDesdePersonalizado(e.target.value)} className="rounded-lg px-2 py-1.5 text-[12.5px] outline-none" style={{ border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO }} />
              <span className="text-xs" style={{ color: TEXTO_TERCIARIO }}>a</span>
              <input type="date" value={hastaPersonalizado} onChange={(e) => setHastaPersonalizado(e.target.value)} className="rounded-lg px-2 py-1.5 text-[12.5px] outline-none" style={{ border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO }} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <Tarjeta valor={mensajesEntrantes} etiqueta="Mensajes entrantes" hint="En el período elegido" />
          <Tarjeta valor={ventasRealizadas.length} etiqueta="Ventas realizadas" hint="En el período elegido" />
          <Tarjeta valor={`${tasaConversion}%`} etiqueta="Tasa de conversión" hint="Ventas / leads nuevos del período" />
          <Tarjeta valor={leadsEstancados.length} etiqueta="Leads sin avanzar" hint="Más de 3 días en la misma etapa" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <Tarjeta valor={abiertas} etiqueta="Conversaciones abiertas" hint="Total al día de hoy" />
          <Tarjeta valor={resueltas} etiqueta="Conversaciones resueltas" hint="Total al día de hoy" />
          <Tarjeta valor={leadsNuevos.length} etiqueta="Leads nuevos" hint="En el período elegido" />
          <Tarjeta valor={formatoDuracion(respuesta.promedioMin)} etiqueta="Tiempo de respuesta promedio" hint={respuesta.respondidos > 0 ? `${respuesta.respondidos} respuestas desde el CRM` : 'Sin respuestas en el período'} />
          <Tarjeta valor={respuesta.pctATiempo === null ? '—' : `${respuesta.pctATiempo}%`} etiqueta={`Respondidos en ${META_RESPUESTA_MIN} min o menos`} hint="Meta de atención al cliente" />
        </div>

        <div className="rounded-2xl p-5 flex flex-col gap-3.5" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
          <span className="text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Embudo del mes</span>
          {porEtapa.length === 0 && <div className="text-xs" style={{ color: TEXTO_TERCIARIO }}>Todavía no hay etapas configuradas.</div>}
          <div className="flex flex-col gap-2.5">
            {porEtapa.map(({ etapa, total }) => (
              <div key={etapa.id} className="flex items-center gap-3">
                <span className="w-[132px] shrink-0 text-[12.5px] font-semibold truncate" style={{ color: 'var(--fg)' }}>{etapa.nombre}</span>
                <div className="flex-1 h-[10px] rounded-full overflow-hidden" style={{ backgroundColor: 'var(--line)' }}>
                  <div className="h-full rounded-full" style={{ width: `${(total / maxPorEtapa) * 100}%`, backgroundColor: etapa.tipo === 'ganada' ? TEAL : NAVY }} />
                </div>
                <span className="w-6 shrink-0 text-right text-[12.5px] font-bold" style={{ color: 'var(--fg)', fontFamily: 'var(--fuente-mono)' }}>{total}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-5">
          <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
            <span className="text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Conversaciones por línea</span>
            {porLinea.length === 0 && <div className="text-xs" style={{ color: TEXTO_TERCIARIO }}>Todavía no hay líneas creadas</div>}
            <div className="flex flex-col gap-2.5">
              {porLinea.map((l) => (
                <div key={l.nombre} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline">
                    <span className="flex-1 text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>{l.nombre}</span>
                    <span className="text-[13px] font-bold" style={{ color: 'var(--fg)' }}>{l.total}</span>
                  </div>
                  <div className="h-[9px] rounded-full overflow-hidden" style={{ backgroundColor: 'var(--line)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(l.total / maxPorLinea) * 100}%`, backgroundColor: TEAL }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl p-5 flex flex-col gap-3.5" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
            <span className="text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Por etiqueta</span>
            {porEtiqueta.length === 0 && <div className="text-xs" style={{ color: TEXTO_TERCIARIO }}>Sin etiquetas sincronizadas todavía</div>}
            <div className="flex flex-col gap-2.5">
              {porEtiqueta.map(({ etiqueta, leads, ventas, tasa }) => (
                <div key={etiqueta.id} className="flex items-center gap-2.5">
                  <span className="text-[12px] font-semibold rounded-full px-2 py-0.5 truncate max-w-[110px]" style={{ backgroundColor: tinte(colorEtiquetaWhatsapp(etiqueta.color)), color: colorEtiquetaWhatsapp(etiqueta.color) }}>{etiqueta.nombre}</span>
                  <span className="flex-1 text-[11.5px]" style={{ color: TEXTO_TERCIARIO }}>{leads} leads · {ventas} ventas</span>
                  <span className="text-[13px] font-bold shrink-0" style={{ color: AMBER }}>{tasa}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
