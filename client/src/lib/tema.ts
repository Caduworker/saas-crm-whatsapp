import type { EstadoConversacion, EstadoLinea, Temperatura, TipoEtapa } from './tipos';

// NAVY y TEAL son la marca de cada empresa: cada dueño puede elegir su
// propio color primario/acento desde "Mi empresa". El segundo valor de
// var() es el fallback — si la empresa no configuró nada, se ve igual que
// siempre. Ver AuthContext.tsx (setea las custom properties) y
// features/mi-empresa/MiEmpresa.tsx (donde se editan).
export const NAVY = 'var(--accent-2)';
export const TEAL = 'var(--accent)';
// BLUE y AMBER quedan fijos: son colores de sistema, no de marca (BLUE es
// el azul de acción — botones primarios, links, selección; AMBER
// significa "pendiente"/advertencia en toda la app).
export const BLUE = 'var(--accent)';
export const AMBER = 'var(--warn)';

// Fondo de contenido y de las cards blancas sobre ese fondo (rediseño
// "Consola de operación", sept. 2026) — fijos, no son marca.
export const FONDO_CONTENIDO = 'transparent';
export const FONDO_CARD = 'var(--surface)';

export const PALETA_LINEAS = ['var(--accent)', '#8b6bd6', 'var(--accent-2)', 'var(--warn)', '#2aa7c4'];

// Paleta de avatares rotativa (en vez de un color fijo para todos): se indexa
// de forma determinística por posición/hash para que un mismo contacto o
// agente siempre caiga en el mismo color entre renders.
export const PALETA_AVATARES = ['#44679B', '#308CA2', '#5C6E91', '#2E7D6E', '#7A5EA6', '#B06A4A', '#3D7EA6', '#6B7F3F'];

export function colorAvatar(semilla: string): string {
  let hash = 0;
  for (let i = 0; i < semilla.length; i++) hash = (hash * 31 + semilla.charCodeAt(i)) >>> 0;
  return PALETA_AVATARES[hash % PALETA_AVATARES.length];
}

// Tokens del sistema de diseño (rediseño Claude Design, sept. 2026): bordes,
// texto y sombras neutrales que se repiten en cards/tablas de toda la app.
export const BORDE = 'var(--line)';
export const BORDE_FILA = 'var(--line)';
export const BORDE_SUTIL = 'var(--line)';
export const BORDE_INPUT = 'var(--line-2)';
export const TEXTO_PRIMARIO = 'var(--fg)';
export const TEXTO_SECUNDARIO_FUERTE = 'var(--fg)';
export const TEXTO_SECUNDARIO = 'var(--fg-2)';
export const TEXTO_TERCIARIO = 'var(--fg-3)';
export const SOMBRA_CARD = 'none';
export const SOMBRA_CARD_ELEVADA = 'var(--shadow)';
export const FOCO_INPUT = '0 0 0 3px var(--glow)';

// Chip de línea: un mismo tono fijo para el "tag" de línea en tablas/filas
// (Contactos, Usuarios, Agenda) — distinto del acento por-línea que usa el
// borde izquierdo de la lista de chats (PALETA_LINEAS/colorLinea).
export const CHIP_LINEA = { bg: 'var(--surface-2)', color: 'var(--accent-2)' };

// Paleta aproximada de los 20 colores predefinidos que ofrece WhatsApp
// Business para etiquetas (no hay una lista oficial de hex publicada; son
// los tonos visualmente más parecidos). `color` en EtiquetaWhatsapp es el
// índice 0-19 que manda WhatsApp.
export const PALETA_ETIQUETAS_WHATSAPP = [
  '#FF9485', '#FFB273', '#FFE482', '#A8E296', '#7AD1CF',
  '#7AC0E0', '#6FA0E0', '#9E9EE8', '#C994E8', '#EE8FDB',
  '#E88FA8', '#D8AA8C', '#BFBFBF', '#8FA3BF', '#8FBFA3',
  '#BFA88F', '#A38FBF', '#8FBF8F', '#BF8FA3', '#A3A38F',
];

export function colorEtiquetaWhatsapp(indice: number | null): string {
  if (indice === null || indice < 0) return '#BFBFBF';
  return PALETA_ETIQUETAS_WHATSAPP[indice % PALETA_ETIQUETAS_WHATSAPP.length];
}

export const TEMPERATURA_STYLE: Record<Temperatura, { label: string; color: string; bg: string; border: string }> = {
  frio: { label: 'Frío', color: 'var(--accent-2)', bg: 'color-mix(in srgb, var(--accent-2) 16%, transparent)', border: 'color-mix(in srgb, var(--accent-2) 40%, transparent)' },
  tibio: { label: 'Tibio', color: 'var(--warn)', bg: 'var(--warn-soft)', border: 'color-mix(in srgb, var(--warn) 40%, transparent)' },
  caliente: { label: 'Caliente', color: 'var(--bad)', bg: 'var(--bad-soft)', border: 'color-mix(in srgb, var(--bad) 40%, transparent)' },
};

export const ESTADO_CONVERSACION_STYLE: Record<EstadoConversacion, { label: string; color: string }> = {
  abierto: { label: 'Abierto', color: TEAL },
  pendiente: { label: 'Pendiente', color: AMBER },
  cerrado: { label: 'Cerrado', color: 'var(--fg-3)' },
};

// Fondo pastel de columna en el Embudo según el tipo de etapa (no el color
// que el dueño le puso a la etapa, que es por-etapa y se usa en la bolita
// del header de columna) — sólo distingue abierta/ganada/perdida.
export const FONDO_COLUMNA_ETAPA: Record<TipoEtapa, string> = {
  normal: 'var(--surface-2)',
  ganada: 'var(--ok-soft)',
  perdida: 'var(--bad-soft)',
};

export const ESTADO_LINEA_STYLE: Record<EstadoLinea, { label: string; color: string }> = {
  desconectado: { label: 'Desconectado', color: 'var(--fg-3)' },
  conectando: { label: 'Conectando...', color: AMBER },
  activo: { label: 'Conectado', color: TEAL },
};

// Fondo translúcido de un color (sirve con colores en hex o con var(--x)).
// Reemplaza el viejo `color + '1A'`, que no funciona con variables CSS.
export function tinte(color: string, porcentaje = 14): string {
  return `color-mix(in srgb, ${color} ${porcentaje}%, transparent)`;
}
