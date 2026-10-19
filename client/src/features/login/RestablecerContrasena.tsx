import { useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { NAVY, TEAL } from '../../lib/tema';

const fondo = {
  background: `linear-gradient(160deg, ${NAVY} 0%, #0A2A57 100%)`,
  minHeight: '480px',
  fontFamily: 'Inter, system-ui, sans-serif',
};

export default function RestablecerContrasena() {
  const { actualizarContrasena } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('La contraseña necesita al menos 6 caracteres');
      return;
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setEnviando(true);
    const { error } = await actualizarContrasena(password);
    setEnviando(false);
    if (error) {
      setError('No se pudo actualizar la contraseña. Pedí un nuevo link de recuperación.');
    } else {
      setListo(true);
    }
  };

  if (listo) {
    return (
      <div className="w-full h-full flex items-center justify-center px-4" style={fondo}>
        <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ backgroundColor: 'var(--surface)', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-base font-medium mb-3 mx-auto" style={{ backgroundColor: TEAL, color: 'var(--accent-fg)' }}>
            ✓
          </div>
          <div className="text-base font-medium mb-1" style={{ color: 'var(--fg)' }}>Contraseña actualizada</div>
          <div className="text-xs" style={{ color: 'var(--fg-3)' }}>Ya podés cerrar esta pestaña y volver a entrar con tu contraseña nueva.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center px-4" style={fondo}>
      <form onSubmit={enviar} className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'var(--surface)', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
        <div className="flex flex-col items-center mb-6">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-base font-medium mb-2" style={{ backgroundColor: TEAL, color: 'var(--accent-fg)' }}>
            M
          </div>
          <div className="text-base font-medium" style={{ color: 'var(--fg)' }}>Elegí una contraseña nueva</div>
        </div>

        <label className="text-xs font-medium block mb-1" style={{ color: 'var(--fg-2)' }}>Contraseña nueva</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="mínimo 6 caracteres"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-3"
          style={{ backgroundColor: 'var(--surface-2)', color: 'var(--fg)', border: '1px solid var(--line)' }}
        />

        <label className="text-xs font-medium block mb-1" style={{ color: 'var(--fg-2)' }}>Confirmá la contraseña</label>
        <input
          type="password"
          required
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          placeholder="repetila"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-4"
          style={{ backgroundColor: 'var(--surface-2)', color: 'var(--fg)', border: '1px solid var(--line)' }}
        />

        {error && <div className="text-xs mb-3" style={{ color: 'var(--bad)' }}>{error}</div>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-lg py-2.5 text-sm font-medium"
          style={{ backgroundColor: TEAL, color: 'var(--accent-fg)', opacity: enviando ? 0.7 : 1 }}
        >
          {enviando ? 'Guardando...' : 'Guardar contraseña'}
        </button>
      </form>
    </div>
  );
}
