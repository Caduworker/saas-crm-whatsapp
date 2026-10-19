// Utilidades de zona horaria para los mensajes programados: la persona escribe
// la hora "como la ve ella" (en su zona) y acá se convierte al instante UTC
// exacto que se guarda en la base.

export function zonaDelNavegador(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function zonaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat('es', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

export function listaDeZonas(): string[] {
  const nativas = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone');
  if (nativas?.length) return nativas;
  return ['America/La_Paz', 'America/Lima', 'America/Bogota', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo', 'America/Mexico_City', 'America/New_York', 'Europe/Madrid', 'UTC'];
}

// Cuántos ms hay que sumarle a un instante UTC para ver la hora de pared en `zona`.
function desfaseMs(ts: number, zona: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ts));
  const v = (tipo: string) => Number(partes.find((p) => p.type === tipo)!.value);
  const comoUTC = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return comoUTC - Math.floor(ts / 1000) * 1000;
}

// '2026-10-16T09:30' escrito en `zona`  →  el instante UTC correspondiente.
export function aInstanteUTC(local: string, zona: string): Date {
  const [fecha, hora] = local.split('T');
  const [y, m, d] = fecha.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  const supuesto = Date.UTC(y, m - 1, d, hh, mm);
  let ts = supuesto - desfaseMs(supuesto, zona);
  ts = supuesto - desfaseMs(ts, zona); // segunda pasada: corrige cambios de horario
  return new Date(ts);
}

// Instante → 'YYYY-MM-DDTHH:mm' visto en `zona` (formato de <input type="datetime-local">).
export function aLocalEnZona(instante: Date, zona: string): string {
  const ms = instante.getTime() + desfaseMs(instante.getTime(), zona);
  return new Date(ms).toISOString().slice(0, 16);
}

export function formatearEnZona(iso: string, zona: string): string {
  return new Intl.DateTimeFormat('es', { timeZone: zona, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function etiquetaDeZona(zona: string): string {
  const desfase = desfaseMs(Date.now(), zona) / 3600000;
  const signo = desfase >= 0 ? '+' : '-';
  const abs = Math.abs(desfase);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `${zona.replace(/_/g, ' ')} (UTC${signo}${h}${m ? `:${String(m).padStart(2, '0')}` : ''})`;
}
