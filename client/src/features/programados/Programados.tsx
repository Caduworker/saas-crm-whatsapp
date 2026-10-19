import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { AMBER, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../../lib/tema';
import { formatearEnZona, zonaDelNavegador } from '../../lib/zonaHoraria';
import { Boton, Chip, EncabezadoPagina, EstadoVacio, Tarjeta, useToast } from '../../components/ui';
import type { MensajeProgramado } from '../../lib/tipos';

type Fila = MensajeProgramado & { conversaciones: { contacto_nombre: string | null; contacto_telefono: string } | null };

const ESTADO: Record<string, { texto: string; color: string }> = {
  pendiente: { texto: 'Pendiente', color: AMBER },
  enviando: { texto: 'Enviando', color: 'var(--c-accion, var(--accent))' },
  error: { texto: 'Error', color: 'var(--c-peligro, var(--bad))' },
  cancelado: { texto: 'Cancelado', color: TEXTO_TERCIARIO },
};

// Vista general de los mensajes programados de toda la empresa (los de una
// conversación puntual se ven y se crean desde el propio chat).
export default function Programados() {
  const { usuario } = useAuth();
  const toast = useToast();
  const zona = usuario?.zona_horaria || zonaDelNavegador();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('mensajes_programados')
      .select('id, conversacion_id, contenido, enviar_en, estado, cancelar_si_responde, motivo, creado_en, conversaciones(contacto_nombre, contacto_telefono)')
      .in('estado', ['pendiente', 'enviando', 'error', 'cancelado'])
      .order('enviar_en')
      .returns<Fila[]>();
    setFilas(data || []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 30000);
    return () => clearInterval(intervalo);
  }, [cargar]);

  const cancelar = async (id: string) => {
    const { error } = await supabase.from('mensajes_programados').update({ estado: 'cancelado', motivo: 'Cancelado por un agente' }).eq('id', id).eq('estado', 'pendiente');
    if (error) toast('No se pudo cancelar el mensaje.', 'error');
    else toast('Mensaje cancelado', 'ok');
    cargar();
  };

  const quitar = async (id: string) => {
    await supabase.from('mensajes_programados').delete().eq('id', id);
    cargar();
  };

  return (
    <div className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6 flex flex-col gap-4">
      <EncabezadoPagina titulo="Mensajes programados" subtitulo="Lo que está por salir. Para programar uno nuevo, abrí un chat y usá el botón + del cuadro de mensaje." />
      {cargando ? (
        <div className="text-xs" style={{ color: TEXTO_TERCIARIO }}>Cargando…</div>
      ) : filas.length === 0 ? (
        <Tarjeta className="flex">
          <EstadoVacio icono={CalendarClock} titulo="No hay mensajes programados" texto="Cuando programes un mensaje desde un chat, lo vas a ver acá hasta que se envíe." />
        </Tarjeta>
      ) : (
        <div className="flex flex-col gap-2">
          {filas.map((f) => {
            const est = ESTADO[f.estado];
            const nombre = f.conversaciones?.contacto_nombre || f.conversaciones?.contacto_telefono.split('@')[0] || 'Contacto';
            return (
              <Tarjeta key={f.id} className="px-4 py-3 flex items-start gap-3">
                <Clock size={16} className="mt-0.5 shrink-0" color={est.color} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13.5px] font-semibold" style={{ color: TEXTO_PRIMARIO }}>{nombre}</span>
                    <Chip color={est.color}>{est.texto}</Chip>
                    <span className="text-[12px]" style={{ color: TEXTO_SECUNDARIO }}>{formatearEnZona(f.enviar_en, zona)}</span>
                  </div>
                  <div className="text-[13px] mt-1 break-words" style={{ color: TEXTO_SECUNDARIO }}>{f.contenido}</div>
                  {f.motivo && f.estado !== 'pendiente' && <div className="text-[12px] mt-1" style={{ color: est.color }}>{f.motivo}</div>}
                  {f.estado === 'pendiente' && f.cancelar_si_responde && <div className="text-[11.5px] mt-1" style={{ color: TEXTO_TERCIARIO }}>Se cancela si el cliente responde</div>}
                </div>
                {f.estado === 'pendiente' ? (
                  <Boton tamano="sm" variante="peligro" onClick={() => cancelar(f.id)}>Cancelar</Boton>
                ) : (
                  <Boton tamano="sm" variante="fantasma" onClick={() => quitar(f.id)}>Quitar</Boton>
                )}
              </Tarjeta>
            );
          })}
        </div>
      )}
    </div>
  );
}
