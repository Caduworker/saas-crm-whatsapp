import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { NAVY, TEAL, BORDE, SOMBRA_CARD, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO, colorAvatar } from '../../lib/tema';
import { EncabezadoPagina } from '../../components/ui';
import type { Contacto, EtapaVenta } from '../../lib/tipos';

interface ConversacionResumen {
  id: string;
  estado: string;
  agente_asignado_id: string | null;
}

interface UsuarioResumen {
  id: string;
  nombre: string;
}

type Tab = 'origen' | 'vendedor';

export default function Reportes() {
  const { usuario } = useAuth();
  const [tab, setTab] = useState<Tab>('origen');
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [etapas, setEtapas] = useState<EtapaVenta[]>([]);
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioResumen[]>([]);

  useEffect(() => {
    const cargar = async () => {
      const { data: cont } = await supabase.from('contactos').select('*').returns<Contacto[]>();
      const { data: etp } = await supabase.from('etapas_venta').select('*').order('orden').returns<EtapaVenta[]>();
      const { data: conv } = await supabase.from('conversaciones').select('id, estado, agente_asignado_id').returns<ConversacionResumen[]>();
      const { data: usr } = await supabase.from('usuarios').select('id, nombre').eq('activo', true).returns<UsuarioResumen[]>();
      setContactos(cont || []);
      setEtapas(etp || []);
      setConversaciones(conv || []);
      setUsuarios(usr || []);
    };
    cargar();
  }, [usuario?.empresa_id]);

  const idsEtapasGanadas = new Set(etapas.filter((e) => e.tipo === 'ganada').map((e) => e.id));
  const ventas = contactos.filter((c) => c.etapa_id && idsEtapasGanadas.has(c.etapa_id));
  const totalVentas = ventas.length;
  const totalLeads = contactos.length;
  const totalCobrado = ventas.reduce((suma, c) => suma + (c.valor_estimado || 0), 0);

  const porOrigen = Array.from(new Set(contactos.map((c) => c.origen || 'Sin origen'))).map((origen) => {
    const leads = contactos.filter((c) => (c.origen || 'Sin origen') === origen);
    const ventasOrigen = leads.filter((c) => c.etapa_id && idsEtapasGanadas.has(c.etapa_id));
    const tasa = leads.length > 0 ? Math.round((ventasOrigen.length / leads.length) * 100) : 0;
    return { origen, leads: leads.length, ventas: ventasOrigen.length, tasa };
  }).sort((a, b) => b.leads - a.leads);
  const maxLeadsOrigen = Math.max(1, ...porOrigen.map((o) => o.leads));

  const porVendedor = usuarios.map((u) => {
    const chats = conversaciones.filter((c) => c.agente_asignado_id === u.id);
    const resueltas = chats.filter((c) => c.estado === 'cerrado').length;
    return { usuario: u, chats: chats.length, resueltas };
  }).sort((a, b) => b.chats - a.chats);

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col gap-5">
        <EncabezadoPagina titulo="Reportes" subtitulo={`${totalLeads} leads · ${totalVentas} ventas${totalCobrado > 0 ? ` · Bs. ${totalCobrado.toLocaleString('es-BO')}` : ''}`} />

        <div className="flex items-center gap-2">
          {(['origen', 'vendedor'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="text-[12.5px] font-semibold rounded-lg px-3 py-1.5 capitalize"
              style={tab === t ? { backgroundColor: NAVY, color: 'white' } : { backgroundColor: 'var(--surface)', color: TEXTO_SECUNDARIO, border: `1px solid ${BORDE}` }}
            >
              {t === 'origen' ? 'Por origen' : 'Por vendedor'}
            </button>
          ))}
        </div>

        {tab === 'origen' && (
          <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
            <span className="text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Rendimiento por origen</span>
            {porOrigen.length === 0 && <div className="text-xs" style={{ color: TEXTO_TERCIARIO }}>Todavía no hay contactos con origen cargado.</div>}
            <div className="flex flex-col gap-3">
              {porOrigen.map((o) => (
                <div key={o.origen} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="flex-1 text-[13px] font-semibold truncate" style={{ color: 'var(--fg)' }}>{o.origen}</span>
                    <span className="text-[12px]" style={{ color: TEXTO_TERCIARIO }}>{o.leads} leads · {o.ventas} ventas</span>
                    <span className="text-[13px] font-bold" style={{ color: 'var(--fg)', fontFamily: 'var(--fuente-mono)' }}>{o.tasa}%</span>
                  </div>
                  <div className="h-[10px] rounded-full overflow-hidden" style={{ backgroundColor: 'var(--line)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(o.leads / maxLeadsOrigen) * 100}%`, backgroundColor: TEAL }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'vendedor' && (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
            <div className="px-5 py-4" style={{ borderBottom: `1px solid ${BORDE}` }}>
              <span className="text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Equipo de ventas</span>
            </div>
            <div className="grid grid-cols-[1.6fr_1fr_1fr] px-5 py-2.5 text-[11px] font-bold tracking-wide uppercase" style={{ color: TEXTO_TERCIARIO, borderBottom: `1px solid ${BORDE}` }}>
              <span>Vendedor</span>
              <span className="text-right">Chats</span>
              <span className="text-right">Resueltos</span>
            </div>
            {porVendedor.length === 0 && <div className="px-5 py-4 text-xs" style={{ color: TEXTO_TERCIARIO }}>Todavía no hay usuarios activos.</div>}
            {porVendedor.map(({ usuario: u, chats, resueltas }) => (
              <div key={u.id} className="grid grid-cols-[1.6fr_1fr_1fr] items-center px-5 py-2.5" style={{ borderBottom: `1px solid var(--line)` }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0" style={{ backgroundColor: colorAvatar(u.id) }}>
                    {u.nombre.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-[13px] font-medium truncate" style={{ color: TEXTO_PRIMARIO }}>{u.nombre}</span>
                </div>
                <span className="text-right text-[13px] font-bold" style={{ color: 'var(--fg)', fontFamily: 'var(--fuente-mono)' }}>{chats}</span>
                <span className="text-right text-[13px] font-bold" style={{ color: TEAL, fontFamily: 'var(--fuente-mono)' }}>{resueltas}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
