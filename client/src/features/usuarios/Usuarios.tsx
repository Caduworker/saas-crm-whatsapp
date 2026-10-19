import { useEffect, useState } from 'react';
import { KeyRound, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { llamarBackend } from '../../lib/backend';
import { BORDE, BORDE_FILA, CHIP_LINEA, NAVY, SOMBRA_CARD, SOMBRA_CARD_ELEVADA, TEAL, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO, colorAvatar } from '../../lib/tema';
import type { RolUsuario, Usuario } from '../../lib/tipos';

const ROL_LABEL: Record<RolUsuario, string> = {
  vendedor: 'Vendedor',
  atendedor_online: 'Atendedor online',
  supervisor: 'Supervisor',
  dueno: 'Dueño',
};

const inputStyle = { height: 40, border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO } as const;

interface LineaSimple {
  id: string;
  nombre: string;
}

export default function Usuarios() {
  const { usuario } = useAuth();

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [lineas, setLineas] = useState<LineaSimple[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');
  const [cambiandoPassword, setCambiandoPassword] = useState<Usuario | null>(null);
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [guardandoPassword, setGuardandoPassword] = useState(false);
  const [errorPassword, setErrorPassword] = useState('');
  const [avisoPassword, setAvisoPassword] = useState('');

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<RolUsuario>('vendedor');
  const [lineaId, setLineaId] = useState('');

  const cargar = async () => {
    const { data: u } = await supabase.from('usuarios').select('*').order('nombre').returns<Usuario[]>();
    const { data: l } = await supabase.from('lineas_whatsapp').select('id, nombre').order('nombre').returns<LineaSimple[]>();
    setUsuarios(u || []);
    setLineas(l || []);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.empresa_id]);

  const alternarActivo = async (u: Usuario) => {
    await supabase.from('usuarios').update({ activo: !u.activo }).eq('id', u.id);
    cargar();
  };

  const cambiarRol = async (u: Usuario, nuevoRol: RolUsuario) => {
    await supabase.from('usuarios').update({ rol: nuevoRol, linea_id: nuevoRol === 'vendedor' ? u.linea_id : null }).eq('id', u.id);
    cargar();
  };

  // Misma jerarquía que el backend (routes/usuarios.ts): el servidor es quien manda.
  const puedeCambiarPassword = (u: Usuario) => {
    if (u.id === usuario!.id) return false;
    if (usuario!.rol === 'supervisor') return u.rol === 'vendedor' || u.rol === 'atendedor_online';
    return true;
  };

  const guardarPassword = async () => {
    if (!cambiandoPassword) return;
    setErrorPassword('');
    if (nuevaPassword.length < 6) {
      setErrorPassword('La contraseña necesita al menos 6 caracteres');
      return;
    }
    setGuardandoPassword(true);
    try {
      const { ok, error: errorApi } = await llamarBackend(`/usuarios/${cambiandoPassword.id}/password`, { password: nuevaPassword }, 'PATCH');
      if (!ok) throw new Error(errorApi || 'No se pudo cambiar la contraseña');
      setAvisoPassword(`Contraseña de ${cambiandoPassword.nombre} actualizada. Pasásela por un canal seguro.`);
      setCambiandoPassword(null);
      setNuevaPassword('');
    } catch (err) {
      setErrorPassword((err as Error).message || 'No se pudo cambiar la contraseña. Revisá que el backend esté corriendo.');
    } finally {
      setGuardandoPassword(false);
    }
  };

  const crearAgente = async () => {
    setError('');
    if (!nombre.trim() || !email.trim() || !password.trim()) {
      setError('Completá nombre, email y contraseña');
      return;
    }
    setCreando(true);
    try {
      const { ok, error: errorApi } = await llamarBackend('/usuarios', {
        email,
        password,
        nombre,
        rol,
        empresa_id: usuario!.empresa_id,
        linea_id: rol === 'vendedor' ? lineaId || null : null,
      });
      if (!ok) throw new Error(errorApi || 'No se pudo crear el usuario');

      setNombre('');
      setEmail('');
      setPassword('');
      setRol('vendedor');
      setLineaId('');
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError((err as Error).message || 'No se pudo crear el usuario. Revisá que el backend esté corriendo.');
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto">
      <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          <div className="flex-1 flex flex-col gap-1">
            <h1 className="m-0 text-[22px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Usuarios</h1>
            <p className="m-0 text-[13.5px]" style={{ color: TEXTO_SECUNDARIO }}>{usuarios.length} agentes con acceso a la bandeja.</p>
          </div>
          <button onClick={() => setMostrarForm(!mostrarForm)} className="flex items-center justify-center gap-2 text-[13.5px] font-semibold rounded-lg px-4 self-start" style={{ height: 40, backgroundColor: NAVY, color: 'white' }}>
            <Plus size={15} />
            Nuevo agente
          </button>
        </div>

        {avisoPassword && (
          <div className="flex items-start justify-between gap-2 rounded-lg px-3.5 py-2.5 text-[12.5px]" style={{ backgroundColor: 'var(--ok-soft)', color: 'var(--ok)' }}>
            <span>{avisoPassword}</span>
            <button onClick={() => setAvisoPassword('')} aria-label="Cerrar aviso"><X size={14} /></button>
          </div>
        )}

        {cambiandoPassword && (
          <div className="rounded-2xl p-5 flex flex-col gap-3.5" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD_ELEVADA }}>
            <span className="text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Cambiar contraseña de {cambiandoPassword.nombre}</span>
            <label className="flex flex-col gap-1.5 text-xs font-semibold max-w-sm" style={{ color: 'var(--fg-2)' }}>
              Nueva contraseña (mínimo 6 caracteres)
              <input value={nuevaPassword} onChange={(e) => setNuevaPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && guardarPassword()} type="text" autoComplete="off" className="rounded-lg px-2.5 outline-none text-[13.5px] font-normal" style={inputStyle} />
            </label>
            {errorPassword && <div className="text-[12.5px]" style={{ color: 'var(--bad)' }}>{errorPassword}</div>}
            <div className="flex gap-2.5">
              <button onClick={guardarPassword} disabled={guardandoPassword} className="text-[13.5px] font-semibold rounded-lg px-4" style={{ height: 40, backgroundColor: TEAL, color: 'var(--accent-fg)', opacity: guardandoPassword ? 0.6 : 1 }}>
                {guardandoPassword ? 'Guardando...' : 'Guardar contraseña'}
              </button>
              <button onClick={() => setCambiandoPassword(null)} className="text-[13.5px] font-semibold rounded-lg px-3.5" style={{ height: 40, border: `1px solid ${BORDE}`, color: 'var(--fg-2)' }}>Cancelar</button>
            </div>
          </div>
        )}

        {mostrarForm && (
          <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD_ELEVADA }}>
            <span className="text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Nuevo agente</span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
                Nombre completo
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Camila Ortiz" className="rounded-lg px-2.5 outline-none text-[13.5px] font-normal" style={inputStyle} />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
                Email
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="camila@ejemplo.com" type="email" className="rounded-lg px-2.5 outline-none text-[13.5px] font-normal" style={inputStyle} />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
                Contraseña temporal
                <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" type="text" className="rounded-lg px-2.5 outline-none text-[13.5px] font-normal" style={inputStyle} />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
                Rol
                <select value={rol} onChange={(e) => setRol(e.target.value as RolUsuario)} className="rounded-lg px-2.5 outline-none text-[13.5px] font-normal" style={{ ...inputStyle, backgroundColor: 'var(--surface)' }}>
                  <option value="vendedor">Vendedor</option>
                  <option value="atendedor_online">Atendedor online</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="dueno">Dueño</option>
                </select>
              </label>
              {rol === 'vendedor' && (
                <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
                  Línea asignada
                  <select value={lineaId} onChange={(e) => setLineaId(e.target.value)} className="rounded-lg px-2.5 outline-none text-[13.5px] font-normal" style={{ ...inputStyle, backgroundColor: 'var(--surface)' }}>
                    <option value="">Elegí su línea...</option>
                    {lineas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  </select>
                </label>
              )}
              <div className="flex items-end gap-2.5">
                <button onClick={crearAgente} disabled={creando} className="text-[13.5px] font-semibold rounded-lg px-4" style={{ height: 40, backgroundColor: TEAL, color: 'var(--accent-fg)', opacity: creando ? 0.6 : 1 }}>
                  {creando ? 'Creando...' : 'Crear agente'}
                </button>
                <button onClick={() => setMostrarForm(false)} className="text-[13.5px] font-semibold rounded-lg px-3.5" style={{ height: 40, border: `1px solid ${BORDE}`, color: 'var(--fg-2)' }}>Cancelar</button>
              </div>
            </div>
            {error && <div className="text-[12.5px]" style={{ color: 'var(--bad)' }}>{error}</div>}
          </div>
        )}

        <div className="rounded-2xl overflow-x-auto shrink-0" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
          <div style={{ minWidth: 560 }}>
          <div className="grid gap-3 px-[18px] py-2.5 text-[11px] font-bold tracking-wider uppercase" style={{ gridTemplateColumns: '2fr 1.4fr 1.2fr 150px', backgroundColor: 'var(--surface-2)', borderBottom: `1px solid ${BORDE}`, color: TEXTO_TERCIARIO }}>
            <span>Agente</span><span>Línea asignada</span><span>Rol</span><span />
          </div>
          {usuarios.map((u) => (
            <div key={u.id} className="grid items-center gap-3 px-[18px] py-3" style={{ gridTemplateColumns: '2fr 1.4fr 1.2fr 150px', borderBottom: `1px solid ${BORDE_FILA}` }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ width: 34, height: 34, backgroundColor: colorAvatar(u.id) }}>
                  {u.nombre.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[13.5px] font-semibold truncate" style={{ color: TEXTO_PRIMARIO }}>{u.nombre}{u.id === usuario!.id ? ' (vos)' : ''}</span>
                  <span className="text-[11.5px] truncate" style={{ color: TEXTO_TERCIARIO }}>{ROL_LABEL[u.rol]}</span>
                </div>
              </div>
              {u.rol === 'vendedor' && lineas.find((l) => l.id === u.linea_id) ? (
                <span className="text-[12.5px] font-semibold rounded px-2.5 py-1 justify-self-start truncate max-w-full" style={{ backgroundColor: CHIP_LINEA.bg, color: CHIP_LINEA.color }}>
                  {lineas.find((l) => l.id === u.linea_id)!.nombre}
                </span>
              ) : <span />}
              <span className="text-[13px]" style={{ color: 'var(--fg-2)' }}>{ROL_LABEL[u.rol]}</span>
              {u.id !== usuario!.id ? (
                <div className="flex items-center gap-1.5 justify-self-end">
                  {puedeCambiarPassword(u) && (
                    <button
                      onClick={() => { setCambiandoPassword(u); setNuevaPassword(''); setErrorPassword(''); setAvisoPassword(''); }}
                      aria-label={`Cambiar contraseña de ${u.nombre}`}
                      title="Cambiar contraseña"
                      className="rounded-lg flex items-center justify-center shrink-0"
                      style={{ width: 28, height: 28, border: `1px solid ${BORDE}` }}
                    >
                      <KeyRound size={13} color="var(--fg-2)" />
                    </button>
                  )}
                  <select value={u.rol} onChange={(e) => cambiarRol(u, e.target.value as RolUsuario)} className="text-[11px] rounded-lg px-1.5 py-1 outline-none" style={{ border: `1px solid ${BORDE}`, color: 'var(--fg-2)' }}>
                    <option value="vendedor">Vendedor</option>
                    <option value="atendedor_online">Atendedor</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="dueno">Dueño</option>
                  </select>
                  <button onClick={() => alternarActivo(u)} className="text-[10.5px] font-semibold rounded-full px-2 py-1 shrink-0 whitespace-nowrap" style={{ backgroundColor: u.activo ? 'rgba(48,140,162,0.14)' : 'var(--bad-soft)', color: u.activo ? TEAL : 'var(--bad)' }}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </button>
                </div>
              ) : <span />}
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}
