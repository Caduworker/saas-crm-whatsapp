import { MessageCircle, User } from 'lucide-react';
import { useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { tinte, FONDO_COLUMNA_ETAPA, TEMPERATURA_STYLE, colorEtiquetaWhatsapp } from '../../lib/tema';
import { esNombreGenerico, formatoTelefono, inicialesDe } from '../bandeja/utils';
import type { Contacto, EtapaVenta, EtiquetaWhatsapp } from '../../lib/tipos';

interface VistaEmbudoProps {
  contactos: Contacto[];
  etapas: EtapaVenta[];
  etiquetasDeContacto: Record<string, EtiquetaWhatsapp[]>;
  onMoverContacto: (contactoId: string, etapaId: string) => void;
  onAbrirLead: (telefono: string) => void;
  onAbrirChat: (telefono: string) => void;
}

function diasEnEtapa(fecha: string | null): number | null {
  if (!fecha) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000));
}

function textoAntiguedad(dias: number | null): string | null {
  if (dias === null) return null;
  if (dias === 0) return 'entró hoy';
  if (dias === 1) return 'hace 1 día en esta etapa';
  return `hace ${dias} días en esta etapa`;
}

// Contenido de la tarjeta, sin lógica de arrastre: se usa tanto en la columna
// como en la copia flotante (DragOverlay) que sigue al puntero.
function ContenidoTarjeta({ contacto, etiquetas, onAbrirChat }: { contacto: Contacto; etiquetas: EtiquetaWhatsapp[]; onAbrirChat: () => void }) {
  const dias = diasEnEtapa(contacto.etapa_actualizada_en);
  const estancado = dias !== null && dias >= 3;
  const tieneNombre = !esNombreGenerico(contacto.nombre);
  const nombre = tieneNombre ? (contacto.nombre as string) : formatoTelefono(contacto.telefono);
  const iniciales = tieneNombre ? inicialesDe(nombre) : '';
  const temp = contacto.temperatura ? TEMPERATURA_STYLE[contacto.temperatura] : null;
  const prob = contacto.probabilidad_cierre;

  return (
    <>
      <div className="flex items-center gap-2.5">
        <span
          className="w-8 h-8 rounded-full flex items-center justify-center text-[11.5px] font-bold shrink-0"
          style={{ backgroundColor: iniciales ? 'var(--accent-soft)' : 'var(--surface-2)', color: iniciales ? 'var(--accent)' : 'var(--fg-3)', border: iniciales ? 'none' : '1px solid var(--line)' }}
        >
          {iniciales || <User size={15} aria-label="Sin nombre" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--fg)' }} title={nombre}>{nombre}</div>
          <div className="text-[12px] truncate" style={{ color: 'var(--fg-2)' }}>{contacto.producto_interes || 'Sin producto de interés'}</div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAbrirChat();
          }}
          aria-label="Ir al chat"
          title="Ir al chat"
          className="shrink-0 rounded-full flex items-center justify-center"
          style={{ width: 26, height: 26, backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <MessageCircle size={14} />
        </button>
      </div>

      {(contacto.valor_estimado != null || prob != null || temp) && (
        <div className="flex items-center gap-2">
          {contacto.valor_estimado != null && (
            <span className="num text-[13px] font-bold" style={{ color: 'var(--fg)' }}>Bs. {contacto.valor_estimado.toLocaleString('es-BO')}</span>
          )}
          <span className="flex-1" />
          {temp && <span className="text-[11px] font-bold rounded-full px-2 py-px" style={{ color: temp.color, backgroundColor: temp.bg }}>{temp.label}</span>}
          {prob != null && <span className="num text-[11.5px] font-semibold" style={{ color: 'var(--fg-2)' }}>{prob}%</span>}
        </div>
      )}
      {prob != null && (
        <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-2)' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, prob)}%`, background: 'linear-gradient(90deg, var(--accent-2), var(--accent))' }} />
        </div>
      )}

      {etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {etiquetas.slice(0, 3).map((e) => (
            <span key={e.id} className="text-[11px] font-semibold rounded-full px-2 py-px" style={{ backgroundColor: tinte(colorEtiquetaWhatsapp(e.color), 20), color: 'var(--fg)' }}>{e.nombre}</span>
          ))}
          {etiquetas.length > 3 && <span className="text-[11px]" style={{ color: 'var(--fg-3)' }}>+{etiquetas.length - 3}</span>}
        </div>
      )}
      {dias !== null && (
        <span className="text-[11.5px]" style={{ color: estancado ? 'var(--warn)' : 'var(--fg-3)', fontWeight: estancado ? 600 : 400 }}>{textoAntiguedad(dias)}</span>
      )}
    </>
  );
}

const ESTILO_TARJETA = { backgroundColor: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 1px 2px rgba(16,24,40,.07)' } as const;

function Tarjeta({ contacto, etiquetas, onAbrir, onAbrirChat }: { contacto: Contacto; etiquetas: EtiquetaWhatsapp[]; onAbrir: () => void; onAbrirChat: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: contacto.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onAbrir}
      style={{ ...ESTILO_TARJETA, opacity: isDragging ? 0.35 : 1, borderStyle: isDragging ? 'dashed' : 'solid', touchAction: 'none' }}
      className="rounded-xl p-3 flex flex-col gap-2 cursor-grab"
    >
      <ContenidoTarjeta contacto={contacto} etiquetas={etiquetas} onAbrirChat={onAbrirChat} />
    </div>
  );
}

function Columna({ etapa, contactos, etiquetasDeContacto, onAbrirLead, onAbrirChat }: { etapa: EtapaVenta; contactos: Contacto[]; etiquetasDeContacto: Record<string, EtiquetaWhatsapp[]>; onAbrirLead: (telefono: string) => void; onAbrirChat: (telefono: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  const totalEtapa = contactos.reduce((suma, c) => suma + (c.valor_estimado || 0), 0);
  const colorEtapa = colorEtiquetaWhatsapp(etapa.color);
  return (
    <div
      ref={setNodeRef}
      className="flex flex-col gap-2.5 rounded-2xl p-3 shrink-0 overflow-hidden relative"
      style={{ width: 280, backgroundColor: isOver ? 'var(--accent-soft)' : FONDO_COLUMNA_ETAPA[etapa.tipo], border: `1px solid ${isOver ? 'var(--accent)' : 'var(--line)'}`, boxShadow: isOver ? '0 0 0 3px var(--glow)' : 'none', minHeight: 220, transition: 'background-color .12s, box-shadow .12s, border-color .12s' }}
    >
      <span className="absolute left-0 right-0 top-0" style={{ height: 3, backgroundColor: colorEtapa }} aria-hidden="true" />
      <div className="flex items-center gap-2 px-1 pt-1">
        <span className="flex-1 text-[14px] font-bold truncate" style={{ color: 'var(--fg)' }}>{etapa.nombre}</span>
        <span className="num text-[12px] font-semibold rounded-full px-2 py-px" style={{ backgroundColor: tinte(colorEtapa, 18), color: 'var(--fg)' }}>{contactos.length}</span>
      </div>
      <span className="num text-[12.5px] px-1 -mt-1.5" style={{ color: 'var(--fg-2)' }}>{totalEtapa > 0 ? `Bs. ${totalEtapa.toLocaleString('es-BO')}` : 'Sin monto'}</span>
      <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 330px)' }}>
        {contactos.map((c) => <Tarjeta key={c.id} contacto={c} etiquetas={etiquetasDeContacto[c.id] || []} onAbrir={() => onAbrirLead(c.telefono)} onAbrirChat={() => onAbrirChat(c.telefono)} />)}
        {contactos.length === 0 && <div className="text-[12.5px] text-center py-5 rounded-xl" style={{ color: 'var(--fg-3)', border: '1px dashed var(--line-2)' }}>Arrastra un lead hasta aquí</div>}
      </div>
    </div>
  );
}

export default function VistaEmbudo({ contactos, etapas, etiquetasDeContacto, onMoverContacto, onAbrirLead, onAbrirChat }: VistaEmbudoProps) {
  // Sin esto, el sensor por defecto arranca el drag apenas hay 1px de
  // movimiento — cualquier click (aunque tiemble un poco la mano) se
  // interpreta como arrastre y dnd-kit cancela el evento click nativo.
  // Con un umbral de distancia, un click de verdad sigue siendo click, y
  // recién a partir de esos pixels de movimiento se activa el drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [activoId, setActivoId] = useState<string | null>(null);
  const activo = contactos.find((c) => c.id === activoId) || null;

  // Soltar sobre cualquier parte de la columna cuenta: primero lo que está bajo
  // el puntero, y si no hay nada, la columna que más se solapa con la tarjeta.
  const colision: CollisionDetection = (args) => {
    const bajoPuntero = pointerWithin(args);
    return bajoPuntero.length > 0 ? bajoPuntero : rectIntersection(args);
  };

  const handleDragStart = (e: DragStartEvent) => setActivoId(e.active.id as string);

  const handleDragEnd = (e: DragEndEvent) => {
    setActivoId(null);
    const contactoId = e.active.id as string;
    const etapaId = e.over?.id as string | undefined;
    const actual = contactos.find((c) => c.id === contactoId)?.etapa_id;
    if (etapaId && etapaId !== actual) onMoverContacto(contactoId, etapaId);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={colision} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActivoId(null)} autoScroll>
      <div className="h-full overflow-x-auto px-4 md:px-8 pb-5">
        <div className="flex gap-3.5 h-full items-start">
          {etapas.map((etapa) => (
            <Columna key={etapa.id} etapa={etapa} contactos={contactos.filter((c) => c.etapa_id === etapa.id)} etiquetasDeContacto={etiquetasDeContacto} onAbrirLead={onAbrirLead} onAbrirChat={onAbrirChat} />
          ))}
          {etapas.length === 0 && <div className="text-sm" style={{ color: 'var(--fg-3)' }}>Todavía no hay etapas configuradas.</div>}
        </div>
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.7,.2,1)' }}>
        {activo && (
          <div className="rounded-xl p-3 flex flex-col gap-2 cursor-grabbing" style={{ ...ESTILO_TARJETA, width: 256, boxShadow: '0 14px 32px rgba(7,26,56,.28)', transform: 'rotate(1.5deg)', border: '1px solid var(--accent)' }}>
            <ContenidoTarjeta contacto={activo} etiquetas={etiquetasDeContacto[activo.id] || []} onAbrirChat={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
