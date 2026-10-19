// "Ding" corto tipo WhatsApp para avisar de un mensaje entrante nuevo.
// Se genera con Web Audio API (dos tonos cortos) para no depender de un
// archivo de audio ni de assets adicionales en /public.
let contextoAudio: AudioContext | null = null;
let desbloqueado = false;

function obtenerContexto(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!contextoAudio) contextoAudio = new AudioContextCtor();
  return contextoAudio;
}

// Los navegadores solo permiten arrancar/reanudar el AudioContext dentro de
// un gesto del usuario (click, tecla, tap) — si se llama recién cuando llega
// el mensaje por WebSocket (sin gesto), resume() queda colgado y no suena
// nunca. Por eso hay que "desbloquearlo" una vez con la primera interacción
// real de la sesión, y desde ahí queda listo para sonar en segundo plano.
export function inicializarSonidoNotificacion() {
  if (typeof window === 'undefined' || desbloqueado) return;
  const desbloquear = () => {
    const ctx = obtenerContexto();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    desbloqueado = true;
    window.removeEventListener('pointerdown', desbloquear);
    window.removeEventListener('keydown', desbloquear);
  };
  window.addEventListener('pointerdown', desbloquear);
  window.addEventListener('keydown', desbloquear);
}

export function reproducirSonidoNotificacion() {
  const ctx = obtenerContexto();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const tocarTono = (frecuencia: number, inicio: number, duracion: number) => {
    const osc = ctx.createOscillator();
    const ganancia = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frecuencia;
    osc.connect(ganancia);
    ganancia.connect(ctx.destination);
    const t0 = ctx.currentTime + inicio;
    ganancia.gain.setValueAtTime(0, t0);
    ganancia.gain.linearRampToValueAtTime(0.2, t0 + 0.01);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
    osc.start(t0);
    osc.stop(t0 + duracion + 0.02);
  };

  tocarTono(880, 0, 0.12);
  tocarTono(1175, 0.1, 0.15);
}
