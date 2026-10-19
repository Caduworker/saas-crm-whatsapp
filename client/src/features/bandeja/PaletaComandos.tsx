import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, LogOut, MessageSquare, Moon, Search, Sun } from 'lucide-react';
import { colorAvatar } from '../../lib/tema';
import { nombreConversacion } from './utils';
import type { Conversacion } from '../../lib/tipos';
import type { Seccion } from './constantes';

interface PaletaComandosProps {
  abierta: boolean;
  onCerrar: () => void;
  secciones: Seccion[];
  conversaciones: Conversacion[];
  temaClaro: boolean;
  onIrSeccion: (id: string) => void;
  onAbrirConversacion: (c: Conversacion) => void;
  onTema: () => void;
  onCerrarSesion: () => void;
}

interface Opcion {
  id: string;
  grupo: 'Ir a' | 'Chats' | 'Acciones';
  titulo: string;
  detalle?: string;
  icono: React.ReactNode;
  ejecutar: () => void;
}

// Buscador global (Ctrl/Cmd + K): saltar a una sección, abrir un chat por
// nombre o número, o ejecutar una acción rápida, todo desde el teclado.
export default function PaletaComandos({ abierta, onCerrar, secciones, conversaciones, temaClaro, onIrSeccion, onAbrirConversacion, onTema, onCerrarSesion }: PaletaComandosProps) {
  const [consulta, setConsulta] = useState('');
  const [indice, setIndice] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierta) {
      setConsulta('');
      setIndice(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [abierta]);

  const opciones = useMemo<Opcion[]>(() => {
    const q = consulta.trim().toLowerCase();
    const todas: Opcion[] = [
      ...secciones.map((s): Opcion => {
        const Icono = s.icon;
        return { id: `s-${s.id}`, grupo: 'Ir a', titulo: s.label, detalle: s.grupo, icono: <Icono size={16} />, ejecutar: () => onIrSeccion(s.id) };
      }),
      ...(q.length >= 2
        ? conversaciones
            .filter((c) => nombreConversacion(c).toLowerCase().includes(q) || c.contacto_telefono.includes(q))
            .slice(0, 8)
            .map((c): Opcion => ({
              id: `c-${c.id}`,
              grupo: 'Chats',
              titulo: nombreConversacion(c),
              detalle: c.contacto_telefono.split('@')[0],
              icono: <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: colorAvatar(c.id) }}>{nombreConversacion(c).slice(-2)}</span>,
              ejecutar: () => onAbrirConversacion(c),
            }))
        : []),
      { id: 'a-tema', grupo: 'Acciones', titulo: temaClaro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro', icono: temaClaro ? <Moon size={16} /> : <Sun size={16} />, ejecutar: onTema },
      { id: 'a-salir', grupo: 'Acciones', titulo: 'Cerrar sesión', icono: <LogOut size={16} />, ejecutar: onCerrarSesion },
    ];
    if (!q) return todas.filter((o) => o.grupo !== 'Chats');
    return todas.filter((o) => o.grupo === 'Chats' || o.titulo.toLowerCase().includes(q) || (o.detalle || '').toLowerCase().includes(q));
  }, [consulta, secciones, conversaciones, temaClaro, onIrSeccion, onAbrirConversacion, onTema, onCerrarSesion]);

  useEffect(() => setIndice(0), [consulta]);

  if (!abierta) return null;

  const ejecutar = (o: Opcion | undefined) => {
    if (!o) return;
    onCerrar();
    o.ejecutar();
  };

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCerrar();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIndice((i) => Math.min(i + 1, opciones.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndice((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); ejecutar(opciones[indice]); }
  };

  let grupoAnterior = '';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4" style={{ backgroundColor: '#02081499', backdropFilter: 'blur(6px)', paddingTop: '12vh' }} onClick={onCerrar}>
      <div
        role="dialog"
        aria-label="Buscar"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={alTeclear}
        className="aparecer w-full overflow-hidden"
        style={{ maxWidth: 560, backgroundColor: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 18, boxShadow: 'var(--shadow)' }}
      >
        <div className="flex items-center gap-3 px-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <Search size={17} color="var(--fg-3)" />
          <input
            ref={inputRef}
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Busca un chat, una persona o una sección"
            aria-label="Buscar"
            className="w-full bg-transparent outline-none py-4 text-[16px]"
            style={{ color: 'var(--fg)' }}
          />
        </div>
        <div className="overflow-y-auto pb-2" style={{ maxHeight: '50vh' }}>
          {opciones.length === 0 && <div className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--fg-3)' }}>No encontré nada con "{consulta}".</div>}
          {opciones.map((o, i) => {
            const encabezado = o.grupo !== grupoAnterior;
            grupoAnterior = o.grupo;
            return (
              <div key={o.id}>
                {encabezado && <div className="eyebrow px-4 pt-3 pb-1">{o.grupo}</div>}
                <button
                  onClick={() => ejecutar(o)}
                  onMouseMove={() => setIndice(i)}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-left"
                  style={{ backgroundColor: i === indice ? 'var(--accent-soft)' : 'transparent', color: 'var(--fg)' }}
                >
                  <span className="shrink-0 flex items-center justify-center w-6" style={{ color: 'var(--fg-2)' }}>{o.icono}</span>
                  <span className="flex-1 truncate text-[14px] font-semibold">{o.titulo}</span>
                  {o.detalle && <span className="text-[12px] truncate" style={{ color: 'var(--fg-3)' }}>{o.detalle}</span>}
                  {i === indice && <CornerDownLeft size={13} color="var(--fg-3)" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 px-4 py-2 text-[11.5px]" style={{ borderTop: '1px solid var(--line)', color: 'var(--fg-3)' }}>
          <span className="inline-flex items-center gap-1"><MessageSquare size={11} /> Escribe 2 letras para buscar chats</span>
          <span className="ml-auto num">↑↓ moverse · Enter abrir · Esc cerrar</span>
        </div>
      </div>
    </div>
  );
}
