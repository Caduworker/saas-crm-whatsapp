import { useMemo, useState } from 'react';
import { Globe, KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { llamarBackend } from '../../lib/backend';
import { TEAL, BORDE, SOMBRA_CARD, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../../lib/tema';
import { etiquetaDeZona, formatearEnZona, listaDeZonas, zonaDelNavegador } from '../../lib/zonaHoraria';

// Configuración personal de cada perfil (hoy: la zona horaria que se usa para
// escribir la hora de los mensajes programados).
export default function Configuracion() {
  const { usuario, sesion, recargarUsuario } = useAuth();
  const zonaNavegador = zonaDelNavegador();
  const [zona, setZona] = useState(usuario?.zona_horaria || zonaNavegador);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const zonas = useMemo(() => {
    const todas = new Set([...listaDeZonas(), zonaNavegador, zona]);
    return [...todas].sort((a, b) => a.localeCompare(b));
  }, [zonaNavegador, zona]);

  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordRepetida, setPasswordRepetida] = useState('');
  const [guardandoPassword, setGuardandoPassword] = useState(false);
  const [mensajePassword, setMensajePassword] = useState('');
  const [errorPassword, setErrorPassword] = useState('');

  const cambiarPassword = async () => {
    setMensajePassword('');
    setErrorPassword('');
    if (!passwordActual) return setErrorPassword('Escribí tu contraseña actual.');
    if (passwordNueva.length < 6) return setErrorPassword('La nueva contraseña necesita al menos 6 caracteres.');
    if (passwordNueva !== passwordRepetida) return setErrorPassword('Las contraseñas nuevas no coinciden.');
    if (passwordNueva === passwordActual) return setErrorPassword('La nueva contraseña tiene que ser distinta de la actual.');
    const email = sesion?.user.email;
    if (!email) return setErrorPassword('No se pudo identificar tu cuenta. Volvé a iniciar sesión.');

    setGuardandoPassword(true);
    try {
      // Confirma que quien está al teclado conoce la contraseña actual.
      const { error: errorActual } = await supabase.auth.signInWithPassword({ email, password: passwordActual });
      if (errorActual) throw new Error('La contraseña actual no es correcta.');
      const { error: errorCambio } = await supabase.auth.updateUser({ password: passwordNueva });
      if (errorCambio) throw new Error(errorCambio.message);
      setPasswordActual('');
      setPasswordNueva('');
      setPasswordRepetida('');
      setMensajePassword('Contraseña actualizada.');
    } catch (err) {
      setErrorPassword((err as Error).message || 'No se pudo cambiar la contraseña.');
    } finally {
      setGuardandoPassword(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    setMensaje('');
    setError('');
    try {
      const { ok, error: errorApi } = await llamarBackend('/usuarios/mi-zona-horaria', { zona_horaria: zona }, 'PATCH');
      if (!ok) throw new Error(errorApi || 'No se pudo guardar');
      await recargarUsuario();
      setMensaje('Guardado');
    } catch (err) {
      setError((err as Error).message || 'No se pudo guardar. Revisá que el backend esté corriendo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[22px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Configuración</h1>
          <p className="m-0 text-[13.5px]" style={{ color: TEXTO_SECUNDARIO }}>Preferencias de tu perfil{usuario ? ` (${usuario.nombre})` : ''}.</p>
        </div>

        <div className="rounded-2xl p-5 flex flex-col gap-3.5 max-w-xl" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
          <span className="flex items-center gap-2 text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>
            <Globe size={16} color={TEAL} /> Zona horaria
          </span>
          <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: TEXTO_SECUNDARIO }}>
            Es la zona en la que escribís la hora cuando programás un mensaje desde el chat. Cada persona del equipo puede tener la suya.
          </p>
          <select
            value={zona}
            onChange={(e) => setZona(e.target.value)}
            className="rounded-lg px-2.5 outline-none text-[13.5px] bg-[var(--surface)]"
            style={{ border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO, height: 40 }}
          >
            {zonas.map((z) => <option key={z} value={z}>{etiquetaDeZona(z)}</option>)}
          </select>
          <span className="text-[12px]" style={{ color: TEXTO_TERCIARIO }}>
            Ahora en esa zona: {formatearEnZona(new Date().toISOString(), zona)}
            {zona !== zonaNavegador && <> · Tu navegador está en {zonaNavegador}</>}
          </span>
          {mensaje && <span className="text-[12px]" style={{ color: 'var(--ok)' }}>{mensaje}</span>}
          {error && <span className="text-[12px]" style={{ color: 'var(--bad)' }}>{error}</span>}
          <button onClick={guardar} disabled={guardando} className="self-start text-[13.5px] font-semibold rounded-lg px-4" style={{ height: 40, backgroundColor: TEAL, color: 'var(--accent-fg)' }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        <div className="rounded-2xl p-5 flex flex-col gap-3.5 max-w-xl" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
          <span className="flex items-center gap-2 text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>
            <KeyRound size={16} color={TEAL} /> Cambiar contraseña
          </span>
          {[
            { etiqueta: 'Contraseña actual', valor: passwordActual, set: setPasswordActual, auto: 'current-password' },
            { etiqueta: 'Nueva contraseña (mínimo 6 caracteres)', valor: passwordNueva, set: setPasswordNueva, auto: 'new-password' },
            { etiqueta: 'Repetir nueva contraseña', valor: passwordRepetida, set: setPasswordRepetida, auto: 'new-password' },
          ].map((c) => (
            <label key={c.etiqueta} className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
              {c.etiqueta}
              <input
                type="password"
                value={c.valor}
                autoComplete={c.auto}
                onChange={(e) => c.set(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && cambiarPassword()}
                className="rounded-lg px-2.5 outline-none text-[13.5px] font-normal"
                style={{ border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO, height: 40 }}
              />
            </label>
          ))}
          {mensajePassword && <span className="text-[12px]" style={{ color: 'var(--ok)' }}>{mensajePassword}</span>}
          {errorPassword && <span className="text-[12px]" style={{ color: 'var(--bad)' }}>{errorPassword}</span>}
          <button onClick={cambiarPassword} disabled={guardandoPassword} className="self-start text-[13.5px] font-semibold rounded-lg px-4" style={{ height: 40, backgroundColor: TEAL, color: 'var(--accent-fg)' }}>
            {guardandoPassword ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
        </div>
      </div>
    </div>
  );
}
