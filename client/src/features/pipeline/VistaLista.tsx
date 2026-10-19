import { useMemo, useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { tinte, BORDE, BORDE_FILA, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO, colorEtiquetaWhatsapp } from '../../lib/tema';
import type { Contacto, EtapaVenta, EtiquetaWhatsapp } from '../../lib/tipos';

interface VistaListaProps {
  contactos: Contacto[];
  etapas: EtapaVenta[];
  etiquetasDeContacto: Record<string, EtiquetaWhatsapp[]>;
  onMoverContacto: (contactoId: string, etapaId: string) => void;
}

type CampoFecha = 'creado_en' | 'etapa_actualizada_en';

function descargarCsv(contactos: Contacto[], etapas: EtapaVenta[], etiquetasDeContacto: Record<string, EtiquetaWhatsapp[]>) {
  const nombreEtapa = (id: string | null) => etapas.find((e) => e.id === id)?.nombre || 'Sin etapa';
  const filas = [
    ['Nombre', 'Teléfono', 'Etapa', 'Etiquetas', 'Fecha de ingreso', 'Última modificación de etapa'],
    ...contactos.map((c) => [
      c.nombre || '',
      c.telefono,
      nombreEtapa(c.etapa_id),
      (etiquetasDeContacto[c.id] || []).map((e) => e.nombre).join(' | '),
      c.creado_en ? new Date(c.creado_en).toLocaleString('es-BO') : '',
      c.etapa_actualizada_en ? new Date(c.etapa_actualizada_en).toLocaleString('es-BO') : '',
    ]),
  ];
  const csv = filas.map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VistaLista({ contactos, etapas, etiquetasDeContacto, onMoverContacto }: VistaListaProps) {
  const [etapaFiltro, setEtapaFiltro] = useState('todas');
  const [etiquetaFiltro, setEtiquetaFiltro] = useState('todas');
  const [campoFecha, setCampoFecha] = useState<CampoFecha>('creado_en');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const catalogoEtiquetas = useMemo(() => {
    const mapa = new Map<string, EtiquetaWhatsapp>();
    Object.values(etiquetasDeContacto).flat().forEach((e) => mapa.set(e.id, e));
    return Array.from(mapa.values());
  }, [etiquetasDeContacto]);

  const filtrados = useMemo(() => {
    return contactos.filter((c) => {
      if (etapaFiltro !== 'todas' && c.etapa_id !== etapaFiltro) return false;
      if (etiquetaFiltro !== 'todas' && !(etiquetasDeContacto[c.id] || []).some((e) => e.id === etiquetaFiltro)) return false;
      const fecha = c[campoFecha];
      if (desde && (!fecha || new Date(fecha) < new Date(desde))) return false;
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        if (!fecha || new Date(fecha) > h) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactos, etapaFiltro, etiquetaFiltro, campoFecha, desde, hasta, etiquetasDeContacto]);

  return (
    <div className="h-full flex flex-col min-h-0 px-4 md:px-8 pb-5">
      <div className="flex flex-wrap items-center gap-2 pb-3 shrink-0">
        <div className="relative">
          <select value={etapaFiltro} onChange={(e) => setEtapaFiltro(e.target.value)} className="text-[12.5px] font-medium rounded-lg pl-2.5 pr-6 py-1.5 outline-none appearance-none" style={{ border: `1px solid ${BORDE}`, color: 'var(--fg)', backgroundColor: 'var(--surface)' }}>
            <option value="todas">Todas las etapas</option>
            {etapas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <ChevronDown size={11} color={TEXTO_SECUNDARIO} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        </div>
        <div className="relative">
          <select value={etiquetaFiltro} onChange={(e) => setEtiquetaFiltro(e.target.value)} className="text-[12.5px] font-medium rounded-lg pl-2.5 pr-6 py-1.5 outline-none appearance-none" style={{ border: `1px solid ${BORDE}`, color: 'var(--fg)', backgroundColor: 'var(--surface)' }}>
            <option value="todas">Todas las etiquetas</option>
            {catalogoEtiquetas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <ChevronDown size={11} color={TEXTO_SECUNDARIO} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        </div>
        <div className="relative">
          <select value={campoFecha} onChange={(e) => setCampoFecha(e.target.value as CampoFecha)} className="text-[12.5px] font-medium rounded-lg pl-2.5 pr-6 py-1.5 outline-none appearance-none" style={{ border: `1px solid ${BORDE}`, color: 'var(--fg)', backgroundColor: 'var(--surface)' }}>
            <option value="creado_en">Fecha de ingreso</option>
            <option value="etapa_actualizada_en">Última modificación</option>
          </select>
          <ChevronDown size={11} color={TEXTO_SECUNDARIO} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        </div>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg px-2 py-1.5 text-[12.5px] outline-none" style={{ border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO }} />
        <span className="text-xs" style={{ color: TEXTO_TERCIARIO }}>a</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg px-2 py-1.5 text-[12.5px] outline-none" style={{ border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO }} />
        <span className="flex-1" />
        <button onClick={() => descargarCsv(filtrados, etapas, etiquetasDeContacto)} className="flex items-center gap-1.5 text-[12.5px] font-semibold rounded-lg px-3 py-1.5" style={{ border: `1px solid ${BORDE}`, color: TEXTO_SECUNDARIO, backgroundColor: 'var(--surface)' }}>
          <Download size={14} />Exportar CSV ({filtrados.length})
        </button>
      </div>

      <div className="flex-1 overflow-auto rounded-2xl" style={{ border: `1px solid ${BORDE}`, backgroundColor: 'var(--surface)' }}>
        <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDE}` }}>
              {['Cliente', 'Teléfono', 'Etapa', 'Etiquetas', 'Ingreso', 'Últ. modificación'].map((h) => (
                <th key={h} className="text-[11px] font-bold uppercase tracking-wider px-3.5 py-2.5" style={{ color: TEXTO_TERCIARIO }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${BORDE_FILA}` }}>
                <td className="text-[12.5px] font-semibold px-3.5 py-2.5" style={{ color: TEXTO_PRIMARIO }}>{c.nombre || '—'}</td>
                <td className="text-[12.5px] px-3.5 py-2.5" style={{ color: TEXTO_SECUNDARIO }}>{c.telefono}</td>
                <td className="px-3.5 py-2.5">
                  <div className="relative inline-block">
                    <select
                      value={c.etapa_id || ''}
                      onChange={(e) => e.target.value && onMoverContacto(c.id, e.target.value)}
                      className="text-[12px] font-medium rounded-lg pl-2.5 pr-6 py-1 outline-none appearance-none"
                      style={{ border: `1px solid ${BORDE}`, color: 'var(--fg)', backgroundColor: 'var(--surface)' }}
                    >
                      {!c.etapa_id && <option value="">Sin etapa</option>}
                      {etapas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                    <ChevronDown size={10} color={TEXTO_SECUNDARIO} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </td>
                <td className="px-3.5 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {(etiquetasDeContacto[c.id] || []).map((e) => (
                      <span key={e.id} className="text-[9.5px] font-semibold rounded-full px-1.5 py-0.5" style={{ backgroundColor: tinte(colorEtiquetaWhatsapp(e.color)), color: colorEtiquetaWhatsapp(e.color) }}>{e.nombre}</span>
                    ))}
                  </div>
                </td>
                <td className="text-[11.5px] px-3.5 py-2.5" style={{ color: TEXTO_TERCIARIO }}>{c.creado_en ? new Date(c.creado_en).toLocaleDateString('es-BO') : '—'}</td>
                <td className="text-[11.5px] px-3.5 py-2.5" style={{ color: TEXTO_TERCIARIO }}>{c.etapa_actualizada_en ? new Date(c.etapa_actualizada_en).toLocaleDateString('es-BO') : '—'}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan={6} className="text-center text-[12px] py-8" style={{ color: TEXTO_TERCIARIO }}>Sin leads con estos filtros</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
