import { createContext, useCallback, useContext, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X, type LucideIcon } from 'lucide-react';
import { BLUE, BORDE, FONDO_CARD, SOMBRA_CARD, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../lib/tema';

// Piezas compartidas del rediseño: botón, chip, tarjeta, estado vacío y toast.
// Usan los tokens de tema.ts (que a su vez salen de las variables CSS de
// index.css) para que toda la app se vea igual sin repetir estilos sueltos.

type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro';

interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  icono?: LucideIcon;
  /** 'sm' = 32px, 'md' = 36px (por defecto) */
  tamano?: 'sm' | 'md';
}

const ESTILO_BOTON: Record<VarianteBoton, React.CSSProperties> = {
  primario: { backgroundColor: BLUE, color: 'var(--accent-fg)', border: `1px solid ${BLUE}` },
  secundario: { backgroundColor: FONDO_CARD, color: TEXTO_PRIMARIO, border: `1px solid ${BORDE}` },
  fantasma: { backgroundColor: 'transparent', color: TEXTO_SECUNDARIO, border: '1px solid transparent' },
  peligro: { backgroundColor: FONDO_CARD, color: 'var(--c-peligro, var(--bad))', border: '1px solid var(--c-peligro, var(--bad))' },
};

export function Boton({ variante = 'secundario', icono: Icono, tamano = 'md', children, style, className = '', ...resto }: BotonProps) {
  return (
    <button
      {...resto}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap ${className}`}
      style={{ height: tamano === 'sm' ? 32 : 36, padding: tamano === 'sm' ? '0 10px' : '0 14px', fontSize: tamano === 'sm' ? 12.5 : 13, ...ESTILO_BOTON[variante], ...style }}
    >
      {Icono && <Icono size={tamano === 'sm' ? 13 : 15} />}
      {children}
    </button>
  );
}

export function Chip({ children, color = BLUE, fondo, icono: Icono }: { children: ReactNode; color?: string; fondo?: string; icono?: LucideIcon }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full text-[11.5px] font-semibold px-2 py-0.5 shrink-0"
      style={{ color, backgroundColor: fondo || `color-mix(in srgb, ${color} 12%, white)` }}
    >
      {Icono && <Icono size={11} />}
      {children}
    </span>
  );
}

export function Tarjeta({ children, className = '', style, onClick }: { children: ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl ${className}`}
      style={{ backgroundColor: FONDO_CARD, border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD, ...style }}
    >
      {children}
    </div>
  );
}

export function Interruptor({ activo, onCambiar, etiqueta, deshabilitado }: { activo: boolean; onCambiar: (v: boolean) => void; etiqueta: string; deshabilitado?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => onCambiar(!activo)}
      className="relative shrink-0 rounded-full"
      style={{ width: 36, height: 20, backgroundColor: activo ? 'var(--c-exito, var(--ok))' : 'var(--line-2)', transition: 'background-color 120ms' }}
    >
      <span className="absolute rounded-full bg-[var(--surface)]" style={{ width: 16, height: 16, top: 2, left: activo ? 18 : 2, transition: 'left 120ms' }} />
    </button>
  );
}

export function EstadoVacio({ icono: Icono, titulo, texto, accion }: { icono: LucideIcon; titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--c-accion, var(--accent)) 10%, white)' }}>
        <Icono size={20} color={BLUE} />
      </div>
      <div className="text-sm font-semibold" style={{ color: TEXTO_PRIMARIO }}>{titulo}</div>
      {texto && <div className="text-xs max-w-xs" style={{ color: TEXTO_TERCIARIO }}>{texto}</div>}
      {accion && <div className="mt-1">{accion}</div>}
    </div>
  );
}

export function EncabezadoPagina({ titulo, subtitulo, accion }: { titulo: string; subtitulo?: string; accion?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-[17px] font-semibold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>{titulo}</h1>
        {subtitulo && <p className="text-[12.5px] mt-0.5" style={{ color: TEXTO_SECUNDARIO }}>{subtitulo}</p>}
      </div>
      {accion}
    </div>
  );
}

// ---------- Toast (reemplaza a alert()) ----------

type TipoToast = 'ok' | 'error' | 'info';
interface ToastItem { id: number; tipo: TipoToast; texto: string }

const ToastContext = createContext<(texto: string, tipo?: TipoToast) => void>(() => {});
export const useToast = () => useContext(ToastContext);

const ICONO_TOAST = { ok: CheckCircle2, error: AlertCircle, info: Info } as const;
const COLOR_TOAST = { ok: 'var(--c-exito, var(--ok))', error: 'var(--c-peligro, var(--bad))', info: BLUE } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const contador = useRef(0);

  const quitar = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);
  const mostrar = useCallback((texto: string, tipo: TipoToast = 'info') => {
    const id = ++contador.current;
    setItems((prev) => [...prev, { id, tipo, texto }]);
    setTimeout(() => quitar(id), 4500);
  }, [quitar]);

  return (
    <ToastContext.Provider value={mostrar}>
      {children}
      <div className="fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-6 z-50 flex flex-col gap-2 items-center pointer-events-none px-4" role="status" aria-live="polite">
        {items.map((t) => {
          const Icono = ICONO_TOAST[t.tipo];
          return (
            <div key={t.id} className="aparecer pointer-events-auto flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px]" style={{ backgroundColor: FONDO_CARD, border: `1px solid ${BORDE}`, boxShadow: '0 8px 24px rgba(16,24,40,.14)', color: TEXTO_PRIMARIO }}>
              <Icono size={16} color={COLOR_TOAST[t.tipo]} className="shrink-0" />
              <span>{t.texto}</span>
              <button onClick={() => quitar(t.id)} aria-label="Cerrar aviso" className="ml-1"><X size={13} color={TEXTO_TERCIARIO} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
