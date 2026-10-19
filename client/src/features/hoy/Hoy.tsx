import { useEffect, useMemo, useState } from 'react';
import { Inbox, User } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { formatoDuracion, META_RESPUESTA_MIN, useMetricasRespuesta } from '../../lib/metricasRespuesta';
import { inicialesDe, nombreConversacion, tieneNombre } from '../bandeja/utils';
import type { UltimoMensaje } from '../bandeja/hooks/useConversaciones';
import { colorEspera, minutosEsperando, textoEspera } from '../bandeja/ListaConversaciones';
import { Boton } from '../../components/ui';
import type { Contacto, Conversacion, EtapaVenta, Tarea } from '../../lib/tipos';

interface HoyProps {
  conversaciones: Conversacion[];
  ultimosMensajes: Record<string, UltimoMensaje>;
  onResponderAhora: () => void;
  onAbrirConversacion: (c: Conversacion) => void;
  onAbrirChat: (telefono: string) => void;
}

// Un seguimiento del día: viene de Programados (mensaje que va a salir) o de
// Agenda (tarea con hora).
interface Seguimiento {
  id: string;
  cuando: Date;
  titulo: string;
  detalle: string;
  telefono: string | null;
}

interface ProgramadoHoy {
  id: string;
  contenido: string;
  enviar_en: string;
  conversaciones: { contacto_nombre: string | null; contacto_telefono: string } | null;
}

function inicioDeHoy(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function finDeHoy(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

const hora = (d: Date) => d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });

export default function Hoy({ conversaciones, ultimosMensajes, onResponderAhora, onAbrirConversacion, onAbrirChat }: HoyProps) {
  const { usuario } = useAuth();
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [ventasMes, setVentasMes] = useState<Contacto[]>([]);
  const [ahora, setAhora] = useState(() => Date.now());
  const desdeHoy = useMemo(() => inicioDeHoy(), []);
  const metricas = useMetricasRespuesta(desdeHoy, new Date(ahora));

  const esAdmin = usuario?.rol === 'supervisor' || usuario?.rol === 'dueno';

  useEffect(() => {
    const cargar = async () => {
      const [{ data: tareas }, { data: programados }] = await Promise.all([
        supabase
          .from('tareas')
          .select('*, contactos(nombre, telefono)')
          .eq('completada', false)
          .gte('fecha', inicioDeHoy().toISOString())
          .lte('fecha', finDeHoy().toISOString())
          .returns<Tarea[]>(),
        supabase
          .from('mensajes_programados')
          .select('id, contenido, enviar_en, conversaciones(contacto_nombre, contacto_telefono)')
          .eq('estado', 'pendiente')
          .gte('enviar_en', inicioDeHoy().toISOString())
          .lte('enviar_en', finDeHoy().toISOString())
          .returns<ProgramadoHoy[]>(),
      ]);
      const lista: Seguimiento[] = [
        ...(tareas || []).filter((t) => t.fecha).map((t): Seguimiento => ({
          id: `t-${t.id}`,
          cuando: new Date(t.fecha as string),
          titulo: t.titulo,
          detalle: `${t.contactos?.nombre || t.contactos?.telefono || 'Contacto'} · Agenda`,
          telefono: t.contactos?.telefono ?? null,
        })),
        ...(programados || []).map((p): Seguimiento => ({
          id: `p-${p.id}`,
          cuando: new Date(p.enviar_en),
          titulo: `Se envía a ${p.conversaciones?.contacto_nombre || p.conversaciones?.contacto_telefono.split('@')[0] || 'un contacto'}`,
          detalle: `${p.contenido} · Programado`,
          telefono: p.conversaciones?.contacto_telefono ?? null,
        })),
      ].sort((a, b) => a.cuando.getTime() - b.cuando.getTime());
      setSeguimientos(lista);
    };
    cargar();

    // Ventas del mes: hoy no hay "vendedor" por venta, así que es de toda la
    // empresa y solo se muestra a quienes administran.
    const cargarVentas = async () => {
      const { data: etapas } = await supabase.from('etapas_venta').select('*').eq('tipo', 'ganada').returns<EtapaVenta[]>();
      const ids = (etapas || []).map((e) => e.id);
      if (ids.length === 0) return;
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      const { data } = await supabase.from('contactos').select('*').in('etapa_id', ids).gte('etapa_actualizada_en', inicioMes.toISOString()).returns<Contacto[]>();
      setVentasMes(data || []);
    };
    cargarVentas();

    const intervalo = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(intervalo);
  }, [usuario?.empresa_id]);

  // Mis chats que esperan respuesta, del más antiguo al más reciente.
  const esperando = conversaciones
    .filter((c) => c.agente_asignado_id === usuario?.id)
    .map((c) => ({ c, min: minutosEsperando(c, ultimosMensajes[c.id], ahora) }))
    .filter((x): x is { c: Conversacion; min: number } => x.min !== null)
    .sort((a, b) => b.min - a.min);
  const masAntiguo = esperando[0];

  const fechaLarga = new Date().toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' });
  const fechaHoy = fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1);
  const primerNombre = (usuario?.nombre || '').split(' ')[0];
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches';

  const totalVentas = ventasMes.reduce((t, c) => t + (c.valor_estimado || 0), 0);

  const abrirSeguimiento = (s: Seguimiento) => {
    if (s.telefono) onAbrirChat(s.telefono);
  };

  const colorHora = (d: Date) => {
    const falta = d.getTime() - ahora;
    if (falta < 0) return 'var(--bad)';
    if (falta < 3600000) return 'var(--warn)';
    return 'var(--fg)';
  };

  const tarjeta = 'rounded-2xl overflow-hidden';
  const estiloTarjeta = { backgroundColor: 'var(--surface)', border: '1px solid var(--line)' } as const;

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="aparecer px-4 md:px-[30px] py-6 flex flex-col gap-5">
        <div className="flex items-end justify-between gap-5 flex-wrap">
          <div>
            <div className="text-[14.5px]" style={{ color: 'var(--fg-2)' }}>{fechaHoy}</div>
            <h1 className="disp font-bold m-0 mt-1" style={{ fontSize: 'clamp(24px, 3.4vw, 30px)', lineHeight: 1.15, color: 'var(--fg)' }}>
              {saludo}{primerNombre ? `, ${primerNombre}` : ''}.
              <span className="block" style={{ color: esperando.length > 0 ? 'var(--bad)' : 'var(--ok)' }}>
                {esperando.length === 0 ? 'No hay nadie esperando respuesta.' : esperando.length === 1 ? 'Hay 1 persona esperando.' : `Hay ${esperando.length} personas esperando.`}
              </span>
            </h1>
          </div>
          <Boton variante="primario" icono={Inbox} onClick={onResponderAhora} style={{ height: 40, borderRadius: 10 }}>Responder ahora</Boton>
        </div>

        <div className="grid gap-[18px] grid-cols-1 min-[1280px]:[grid-template-columns:1.5fr_1fr] items-start">
          <div className="flex flex-col gap-[18px] min-w-0">
            {esAdmin && ventasMes.length > 0 && (
              <div className={`${tarjeta} px-5 py-[18px] flex items-center justify-between gap-4`} style={estiloTarjeta}>
                <div>
                  <small style={{ color: 'var(--fg-2)' }}>Ventas del mes · toda la empresa</small>
                  <span className="block text-[30px] font-bold leading-tight num" style={{ color: 'var(--fg)' }}>Bs {totalVentas.toLocaleString('es-BO')}</span>
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--ok)' }}>{ventasMes.length} {ventasMes.length === 1 ? 'venta' : 'ventas'} este mes</span>
                </div>
              </div>
            )}

            <div className={tarjeta} style={estiloTarjeta}>
              <h3 className="m-0 px-5 pt-4 pb-1 text-[16px] font-bold" style={{ color: 'var(--fg)' }}>Seguimientos de hoy</h3>
              <p className="m-0 px-5 pb-3 text-[13px]" style={{ color: 'var(--fg-2)' }}>Salen de Programados y Agenda.</p>
              {seguimientos.length === 0 && <div className="px-5 py-5 text-[13.5px]" style={{ borderTop: '1px solid var(--line)', color: 'var(--fg-2)' }}>No tienes seguimientos para hoy.</div>}
              {seguimientos.map((s) => (
                <div key={s.id} className="flex items-center gap-3.5 px-5 py-3" style={{ borderTop: '1px solid var(--line)' }}>
                  <span className="font-bold w-12 shrink-0 num" style={{ color: colorHora(s.cuando) }}>{hora(s.cuando)}</span>
                  <div className="flex-1 min-w-0">
                    <b className="block truncate" style={{ color: 'var(--fg)' }}>{s.titulo}</b>
                    <span className="block truncate text-[13px]" style={{ color: 'var(--fg-2)' }}>{s.detalle}</span>
                  </div>
                  {s.telefono && <Boton tamano="sm" onClick={() => abrirSeguimiento(s)}>Abrir chat</Boton>}
                </div>
              ))}
            </div>
          </div>

          <div className={tarjeta} style={estiloTarjeta}>
            <h3 className="m-0 px-5 pt-4 pb-1 text-[16px] font-bold" style={{ color: 'var(--fg)' }}>Esperando respuesta</h3>
            <p className="m-0 px-5 pb-3 text-[13px]" style={{ color: 'var(--fg-2)' }}>
              {metricas.pctATiempo !== null ? `${metricas.pctATiempo} % respondido en menos de ${META_RESPUESTA_MIN} min` : `Meta: responder en menos de ${META_RESPUESTA_MIN} min`}
              {metricas.promedioMin !== null && ` · promedio ${formatoDuracion(metricas.promedioMin)}`}
              {masAntiguo && ` · el más antiguo espera ${textoEspera(masAntiguo.min)}`}
            </p>
            {esperando.length === 0 && <div className="px-5 py-5 text-[13.5px]" style={{ borderTop: '1px solid var(--line)', color: 'var(--fg-2)' }}>Todo al día. Ningún chat tuyo espera respuesta.</div>}
            {esperando.map(({ c, min }) => {
              const nombre = nombreConversacion(c);
              const iniciales = tieneNombre(c) ? inicialesDe(nombre) : '';
              return (
                <button key={c.id} onClick={() => onAbrirConversacion(c)} className="flex items-center gap-3.5 px-5 py-3 w-full text-left" style={{ borderTop: '1px solid var(--line)' }}>
                  <span className="shrink-0 rounded-full flex items-center justify-center font-semibold text-[13px]" style={{ width: 36, height: 36, backgroundColor: iniciales ? 'var(--accent-soft)' : 'var(--surface-2)', color: iniciales ? 'var(--accent)' : 'var(--fg-3)', border: iniciales ? 'none' : '1px solid var(--line)' }}>
                    {iniciales || <User size={17} aria-label="Sin nombre" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <b className="block truncate" style={{ color: 'var(--fg)' }}>{nombre}</b>
                    <span className="block truncate text-[13px]" style={{ color: 'var(--fg-2)' }}>{ultimosMensajes[c.id]?.contenido || 'Archivo adjunto'}</span>
                  </span>
                  <span className="font-semibold text-[13px] shrink-0" style={{ color: colorEspera(min) }}>{textoEspera(min)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
