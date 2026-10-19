import { useEffect, useMemo, useState } from 'react';
import { Flame, MessageSquare, Search } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { colorAvatar, colorEtiquetaWhatsapp, TEMPERATURA_STYLE, tinte } from '../../lib/tema';
import { Boton, Chip, EncabezadoPagina, EstadoVacio, Tarjeta } from '../../components/ui';
import type { Contacto, EtapaVenta, EtiquetaWhatsapp } from '../../lib/tipos';

interface OportunidadesProps {
  onAbrirChat: (telefono: string) => void;
}

interface ConversacionResumen {
  contacto_telefono: string;
  agente_asignado_id: string | null;
  ultima_actividad: string;
}

function tiempoRelativo(fecha: string | null): string {
  if (!fecha) return 'sin conversación';
  const min = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.floor(min / 60)} h`;
  return `hace ${Math.floor(min / 1440)} d`;
}

// Una oportunidad es un lead abierto (ni ganado ni perdido) que está caliente
// o con 70% o más de probabilidad de cierre: lo que conviene atender primero.
export default function Oportunidades({ onAbrirChat }: OportunidadesProps) {
  const { usuario } = useAuth();
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [etapas, setEtapas] = useState<EtapaVenta[]>([]);
  const [conversaciones, setConversaciones] = useState<Record<string, ConversacionResumen>>({});
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string }[]>([]);
  const [etiquetas, setEtiquetas] = useState<Record<string, EtiquetaWhatsapp[]>>({});
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargar = async () => {
      const [{ data: cont }, { data: etp }, { data: conv }, { data: usu }, { data: asoc }] = await Promise.all([
        supabase.from('contactos').select('*').or('temperatura.eq.caliente,probabilidad_cierre.gte.70').returns<Contacto[]>(),
        supabase.from('etapas_venta').select('*').order('orden').returns<EtapaVenta[]>(),
        supabase.from('conversaciones').select('contacto_telefono, agente_asignado_id, ultima_actividad').order('ultima_actividad', { ascending: false }).returns<ConversacionResumen[]>(),
        supabase.from('usuarios').select('id, nombre').returns<{ id: string; nombre: string }[]>(),
        supabase.from('contacto_etiquetas').select('contacto_id, etiquetas_whatsapp(id, nombre, color, eliminada)').returns<{ contacto_id: string; etiquetas_whatsapp: (EtiquetaWhatsapp & { eliminada: boolean }) | null }[]>(),
      ]);
      setContactos(cont || []);
      setEtapas(etp || []);
      const mapa: Record<string, ConversacionResumen> = {};
      (conv || []).forEach((c) => { if (!mapa[c.contacto_telefono]) mapa[c.contacto_telefono] = c; });
      setConversaciones(mapa);
      setUsuarios(usu || []);
      const et: Record<string, EtiquetaWhatsapp[]> = {};
      (asoc || []).forEach((a) => {
        if (a.etiquetas_whatsapp && !a.etiquetas_whatsapp.eliminada) (et[a.contacto_id] ||= []).push(a.etiquetas_whatsapp);
      });
      setEtiquetas(et);
      setCargando(false);
    };
    cargar();
  }, [usuario?.empresa_id]);

  const tipoEtapa = (c: Contacto) => etapas.find((e) => e.id === c.etapa_id)?.tipo;
  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return contactos
      .filter((c) => tipoEtapa(c) !== 'ganada' && tipoEtapa(c) !== 'perdida')
      .filter((c) => !q || (c.nombre || '').toLowerCase().includes(q) || c.telefono.includes(q) || (c.producto_interes || '').toLowerCase().includes(q))
      .sort((a, b) => (b.temperatura === 'caliente' ? 1000 : 0) + (b.probabilidad_cierre ?? 0) - ((a.temperatura === 'caliente' ? 1000 : 0) + (a.probabilidad_cierre ?? 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactos, etapas, busqueda]);

  const total = lista.reduce((t, c) => t + (c.valor_estimado || 0), 0);
  const ponderado = lista.reduce((t, c) => t + (c.valor_estimado || 0) * ((c.probabilidad_cierre ?? 0) / 100), 0);
  const nombreUsuario = (id: string | null | undefined) => usuarios.find((u) => u.id === id)?.nombre || 'Sin asignar';

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="aparecer px-4 md:px-7 py-5 md:py-6 flex flex-col gap-4">
        <EncabezadoPagina titulo="Oportunidades" subtitulo="Leads calientes o con 70% o más de probabilidad de cierre. Atiéndelos primero." />

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          <Tarjeta className="px-5 py-4 flex flex-col gap-0.5">
            <span className="text-[13px]" style={{ color: 'var(--fg-2)' }}>Oportunidades abiertas</span>
            <span className="disp font-extrabold text-[38px] leading-[1.1]" style={{ color: 'var(--warn)', letterSpacing: '-.03em' }}>{lista.length}</span>
          </Tarjeta>
          <Tarjeta className="px-5 py-4 flex flex-col gap-0.5">
            <span className="text-[13px]" style={{ color: 'var(--fg-2)' }}>Valor en juego</span>
            <span className="disp font-extrabold text-[38px] leading-[1.1]" style={{ color: 'var(--fg)', letterSpacing: '-.03em' }}>Bs. {total.toLocaleString('es-BO')}</span>
          </Tarjeta>
          <Tarjeta className="px-5 py-4 flex flex-col gap-0.5">
            <span className="text-[13px]" style={{ color: 'var(--fg-2)' }}>Pronóstico ponderado</span>
            <span className="disp font-extrabold text-[38px] leading-[1.1]" style={{ color: 'var(--ok)', letterSpacing: '-.03em' }}>Bs. {Math.round(ponderado).toLocaleString('es-BO')}</span>
          </Tarjeta>
        </div>

        <label className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ maxWidth: 420, backgroundColor: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--fg-3)' }}>
          <Search size={15} className="shrink-0" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, número o producto" aria-label="Buscar oportunidad" className="bg-transparent outline-none w-full min-w-0 text-[13.5px]" style={{ color: 'var(--fg)' }} />
        </label>

        {cargando ? (
          <div className="text-[13px]" style={{ color: 'var(--fg-3)' }}>Cargando…</div>
        ) : lista.length === 0 ? (
          <Tarjeta className="flex">
            <EstadoVacio icono={Flame} titulo="Aún no hay oportunidades" texto='Marca un contacto como "Caliente" o dale 70% o más de probabilidad de cierre en su ficha, y aparecerá aquí.' />
          </Tarjeta>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {lista.map((c) => {
              const conv = conversaciones[c.telefono];
              const etapa = etapas.find((e) => e.id === c.etapa_id);
              const tags = etiquetas[c.id] || [];
              const nombre = c.nombre || c.telefono;
              return (
                <Tarjeta key={c.id} className="p-4 flex flex-col gap-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0 disp" style={{ backgroundColor: colorAvatar(c.telefono) }}>{nombre.slice(-2)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[14.5px] truncate" style={{ color: 'var(--fg)' }}>{nombre}</div>
                      <div className="num text-[12px] truncate" style={{ color: 'var(--fg-3)' }}>{c.telefono}</div>
                    </div>
                    {c.temperatura && <Chip color={TEMPERATURA_STYLE[c.temperatura].color}>{TEMPERATURA_STYLE[c.temperatura].label}</Chip>}
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <div className="disp font-extrabold text-[24px] leading-none" style={{ color: 'var(--fg)' }}>Bs. {(c.valor_estimado || 0).toLocaleString('es-BO')}</div>
                      <div className="text-[12px] mt-1" style={{ color: 'var(--fg-2)' }}>{c.producto_interes || 'Sin producto de interés'}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="num font-bold text-[20px]" style={{ color: 'var(--warn)' }}>{c.probabilidad_cierre ?? 0}%</div>
                      <div className="text-[11px]" style={{ color: 'var(--fg-3)' }}>de cierre</div>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${c.probabilidad_cierre ?? 0}%`, background: 'linear-gradient(90deg, var(--accent-2), var(--accent))' }} />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {etapa && <Chip color={colorEtiquetaWhatsapp(etapa.color)}>{etapa.nombre}</Chip>}
                    {tags.map((t) => (
                      <span key={t.id} className="inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px] font-semibold" style={{ backgroundColor: tinte(colorEtiquetaWhatsapp(t.color), 20), color: 'var(--fg)' }}>
                        <span className="rounded-full" style={{ width: 7, height: 7, backgroundColor: colorEtiquetaWhatsapp(t.color) }} />{t.nombre}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
                    <div className="text-[12px] min-w-0 truncate" style={{ color: 'var(--fg-2)' }}>
                      {nombreUsuario(conv?.agente_asignado_id)} · {tiempoRelativo(conv?.ultima_actividad ?? null)}
                    </div>
                    <Boton tamano="sm" icono={MessageSquare} onClick={() => onAbrirChat(c.telefono)}>Abrir chat</Boton>
                  </div>
                </Tarjeta>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
