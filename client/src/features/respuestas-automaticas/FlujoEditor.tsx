import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Clock, FileText, Flag, HelpCircle, Image as ImageIcon, MessageSquare, Play, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { tinte, TEAL, BLUE, BORDE, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../../lib/tema';
import type { FlujoBot, NodoFlujo, OpcionPregunta, RespuestaAutomatica } from '../../lib/tipos';

type Disparador = RespuestaAutomatica['disparador'];
type Modo = RespuestaAutomatica['modo_coincidencia'];
type TipoNodo = NodoFlujo['type'];

interface DatosNodo extends Record<string, unknown> {
  contenido?: string | null;
  media_url?: string | null;
  duracion_segundos?: number | null;
  opciones?: OpcionPregunta[];
}

const inputStyle = { border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO } as const;
const VARIABLES = ['{nombre}', '{telefono}'];

const DISPARADORES: { valor: Disparador; etiqueta: string }[] = [
  { valor: 'palabra_clave', etiqueta: 'Por palabra clave en el mensaje' },
  { valor: 'primer_mensaje', etiqueta: 'Primer mensaje del cliente' },
  { valor: 'primer_mensaje_del_dia', etiqueta: 'Primer mensaje del cliente en el día' },
  { valor: 'cualquier_mensaje', etiqueta: 'Cualquier mensaje recibido' },
];

const MODOS: { valor: Modo; etiqueta: string }[] = [
  { valor: 'contiene', etiqueta: 'Contiene la palabra' },
  { valor: 'empieza_con', etiqueta: 'Empieza con la palabra' },
  { valor: 'exacta', etiqueta: 'Es exactamente la palabra' },
];

const idNuevo = () => Math.random().toString(36).slice(2, 9);

// ---------- Nodos ----------

function Tarjeta({ titulo, icono: Icono, color, children, onQuitar }: { titulo: string; icono: typeof Play; color: string; children?: React.ReactNode; onQuitar?: () => void }) {
  return (
    <div className="rounded-xl bg-[var(--surface)]" style={{ border: `1.5px solid ${color}`, minWidth: 240, maxWidth: 280, boxShadow: '0 2px 8px rgba(15,30,60,0.08)' }}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-t-[10px]" style={{ backgroundColor: tinte(color, 9) }}>
        <span className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color }}>
          <Icono size={14} /> {titulo}
        </span>
        {onQuitar && (
          <button onClick={onQuitar} aria-label="Quitar bloque" className="nodrag"><Trash2 size={13} color={TEXTO_TERCIARIO} /></button>
        )}
      </div>
      {children && <div className="p-2.5 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

function useDatos(id: string) {
  const { updateNodeData, deleteElements } = useReactFlow();
  return {
    actualizar: (patch: Partial<DatosNodo>) => updateNodeData(id, patch),
    quitar: () => deleteElements({ nodes: [{ id }] }),
  };
}

function NodoInicio() {
  return (
    <>
      <Tarjeta titulo="Inicio" icono={Play} color="var(--ok)">
        <span className="text-[11.5px]" style={{ color: TEXTO_SECUNDARIO }}>Acá empieza el flujo cuando se cumple el disparador.</span>
      </Tarjeta>
      <Handle type="source" position={Position.Right} />
    </>
  );
}

function CampoTexto({ id, datos, placeholder }: { id: string; datos: DatosNodo; placeholder: string }) {
  const { actualizar } = useDatos(id);
  return (
    <>
      <textarea
        value={datos.contenido || ''}
        onChange={(e) => actualizar({ contenido: e.target.value })}
        placeholder={placeholder}
        rows={3}
        className="nodrag nowheel rounded-md px-2 py-1.5 outline-none text-[12.5px] resize-y leading-relaxed"
        style={inputStyle}
      />
      <div className="flex items-center gap-1.5">
        <span className="text-[10.5px]" style={{ color: TEXTO_TERCIARIO }}>Insertar:</span>
        {VARIABLES.map((v) => (
          <button key={v} onClick={() => actualizar({ contenido: `${datos.contenido || ''}${v}` })} className="nodrag rounded-md px-1.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: 'var(--surface-2)', color: BLUE }}>{v}</button>
        ))}
      </div>
    </>
  );
}

function NodoTexto({ id, data }: NodeProps) {
  const { quitar } = useDatos(id);
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <Tarjeta titulo="Enviar texto" icono={MessageSquare} color={BLUE} onQuitar={quitar}>
        <CampoTexto id={id} datos={data as DatosNodo} placeholder="Escribí el mensaje… Ej. Hola {nombre}" />
      </Tarjeta>
      <Handle type="source" position={Position.Right} />
    </>
  );
}

function NodoArchivo({ id, data, tipo }: NodeProps & { tipo: 'imagen' | 'pdf' }) {
  const { usuario } = useAuth();
  const { actualizar, quitar } = useDatos(id);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const datos = data as DatosNodo;

  const subir = async (file: File) => {
    setSubiendo(true);
    setError('');
    try {
      const ext = file.name.split('.').pop();
      const ruta = `${usuario!.empresa_id}/bot/${Date.now()}.${ext}`;
      const { error: errorSubida } = await supabase.storage.from('media').upload(ruta, file);
      if (errorSubida) throw errorSubida;
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(ruta);
      actualizar({ media_url: urlData.publicUrl, contenido: tipo === 'pdf' ? file.name : datos.contenido || '' });
    } catch {
      setError('No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <Tarjeta titulo={tipo === 'imagen' ? 'Enviar imagen' : 'Enviar PDF'} icono={tipo === 'imagen' ? ImageIcon : FileText} color={tipo === 'imagen' ? 'var(--ok)' : 'var(--warn)'} onQuitar={quitar}>
        <input ref={inputRef} type="file" hidden accept={tipo === 'imagen' ? 'image/*' : 'application/pdf'} onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])} />
        {tipo === 'imagen' && datos.media_url && <img src={datos.media_url} alt="Vista previa" className="rounded-md max-h-28 object-cover self-start" />}
        <button onClick={() => inputRef.current?.click()} disabled={subiendo} className="nodrag rounded-md px-2 py-1.5 text-[12px] font-semibold self-start" style={{ backgroundColor: 'var(--surface-2)', color: BLUE }}>
          {subiendo ? 'Subiendo…' : datos.media_url ? 'Cambiar archivo' : 'Subir archivo'}
        </button>
        {tipo === 'pdf' && datos.media_url && <span className="text-[11.5px] truncate" style={{ color: TEXTO_SECUNDARIO }}>{datos.contenido}</span>}
        {tipo === 'imagen' && (
          <input value={datos.contenido || ''} onChange={(e) => actualizar({ contenido: e.target.value })} placeholder="Descripción (opcional)" className="nodrag rounded-md px-2 outline-none text-[12.5px]" style={{ ...inputStyle, height: 32 }} />
        )}
        {error && <span className="text-[11px]" style={{ color: 'var(--bad)' }}>{error}</span>}
      </Tarjeta>
      <Handle type="source" position={Position.Right} />
    </>
  );
}

function NodoEspera({ id, data }: NodeProps) {
  const { actualizar, quitar } = useDatos(id);
  const datos = data as DatosNodo;
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <Tarjeta titulo="Esperar" icono={Clock} color="#7C3AED" onQuitar={quitar}>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={3600}
            value={datos.duracion_segundos ?? 5}
            onChange={(e) => actualizar({ duracion_segundos: Math.max(1, Number(e.target.value) || 1) })}
            className="nodrag rounded-md px-2 outline-none text-[12.5px]"
            style={{ ...inputStyle, height: 32, width: 80 }}
          />
          <span className="text-[11.5px]" style={{ color: TEXTO_TERCIARIO }}>segundos</span>
        </div>
      </Tarjeta>
      <Handle type="source" position={Position.Right} />
    </>
  );
}

function NodoPregunta({ id, data }: NodeProps) {
  const { actualizar, quitar } = useDatos(id);
  const actualizarInternos = useUpdateNodeInternals();
  const datos = data as DatosNodo;
  const opciones = datos.opciones || [];

  const cambiarOpciones = (nuevas: OpcionPregunta[]) => {
    actualizar({ opciones: nuevas });
    // Los puntos de conexión cambian de lugar: hay que avisarle a React Flow.
    setTimeout(() => actualizarInternos(id), 0);
  };

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div className="rounded-xl bg-[var(--surface)]" style={{ border: '1.5px solid var(--warn)', minWidth: 300, maxWidth: 340, boxShadow: '0 2px 8px rgba(15,30,60,0.08)' }}>
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-t-[10px]" style={{ backgroundColor: '#D9770618' }}>
          <span className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: 'var(--warn)' }}><HelpCircle size={14} /> Preguntar y esperar respuesta</span>
          <button onClick={quitar} aria-label="Quitar bloque" className="nodrag"><Trash2 size={13} color={TEXTO_TERCIARIO} /></button>
        </div>
        <div className="p-2.5 flex flex-col gap-2">
          <CampoTexto id={id} datos={datos} placeholder="Ej. Hola {nombre}, ¿qué te interesa? 1) Precios 2) Horarios" />
          <span className="text-[11px] font-semibold" style={{ color: 'var(--fg-2)' }}>Según lo que responda el cliente:</span>
          {opciones.map((o, i) => (
            <div key={o.id} className="relative rounded-md p-2 flex flex-col gap-1.5" style={{ border: `1px solid ${BORDE}`, backgroundColor: 'var(--surface-2)' }}>
              <div className="flex items-center gap-1.5">
                <input
                  value={o.etiqueta}
                  onChange={(e) => cambiarOpciones(opciones.map((x, j) => (j === i ? { ...x, etiqueta: e.target.value } : x)))}
                  placeholder="Nombre de la opción (Ej. Precios)"
                  className="nodrag flex-1 rounded-md px-2 outline-none text-[12px] font-semibold"
                  style={{ ...inputStyle, height: 28 }}
                />
                <button onClick={() => cambiarOpciones(opciones.filter((_, j) => j !== i))} aria-label="Quitar opción"><X size={12} color={TEXTO_TERCIARIO} /></button>
              </div>
              <input
                value={o.palabras.join(', ')}
                onChange={(e) => cambiarOpciones(opciones.map((x, j) => (j === i ? { ...x, palabras: e.target.value.split(',').map((p) => p.trimStart()) } : x)))}
                onBlur={(e) => cambiarOpciones(opciones.map((x, j) => (j === i ? { ...x, palabras: e.target.value.split(',').map((p) => p.trim()).filter(Boolean) } : x)))}
                placeholder="Palabras que la activan: 1, precio, costo"
                className="nodrag rounded-md px-2 outline-none text-[11.5px]"
                style={{ ...inputStyle, height: 28 }}
              />
              <Handle type="source" id={o.id} position={Position.Right} style={{ right: -9, top: '50%' }} />
            </div>
          ))}
          <button onClick={() => cambiarOpciones([...opciones, { id: `op_${idNuevo()}`, etiqueta: '', palabras: [] }])} className="nodrag flex items-center gap-1 self-start text-[11.5px] font-semibold rounded-md px-2 py-1" style={{ backgroundColor: 'var(--surface-2)', color: BLUE }}>
            <Plus size={12} /> Agregar opción
          </button>
          <div className="relative rounded-md px-2 py-1.5 text-[11.5px]" style={{ backgroundColor: '#F4F4F5', color: TEXTO_SECUNDARIO }}>
            Cualquier otra respuesta
            <Handle type="source" id="otro" position={Position.Right} style={{ right: -9, top: '50%' }} />
          </div>
          <span className="text-[10.5px]" style={{ color: TEXTO_TERCIARIO }}>Si la respuesta no coincide con ninguna opción y no conectás "otra respuesta", el bot se detiene y lo atiende una persona.</span>
        </div>
      </div>
    </>
  );
}

function NodoFin({ id }: NodeProps) {
  const { quitar } = useDatos(id);
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <Tarjeta titulo="Fin (atiende una persona)" icono={Flag} color="var(--bad)" onQuitar={quitar}>
        <span className="text-[11.5px]" style={{ color: TEXTO_SECUNDARIO }}>El bot termina acá.</span>
      </Tarjeta>
    </>
  );
}

const nodeTypes = {
  inicio: NodoInicio,
  texto: NodoTexto,
  imagen: (p: NodeProps) => <NodoArchivo {...p} tipo="imagen" />,
  pdf: (p: NodeProps) => <NodoArchivo {...p} tipo="pdf" />,
  espera: NodoEspera,
  pregunta: NodoPregunta,
  fin: NodoFin,
};

const PALETA: { tipo: Exclude<TipoNodo, 'inicio'>; etiqueta: string; icono: typeof Play; color: string }[] = [
  { tipo: 'texto', etiqueta: 'Texto', icono: MessageSquare, color: BLUE },
  { tipo: 'imagen', etiqueta: 'Imagen', icono: ImageIcon, color: 'var(--ok)' },
  { tipo: 'pdf', etiqueta: 'PDF', icono: FileText, color: 'var(--warn)' },
  { tipo: 'espera', etiqueta: 'Esperar', icono: Clock, color: '#7C3AED' },
  { tipo: 'pregunta', etiqueta: 'Preguntar', icono: HelpCircle, color: 'var(--warn)' },
  { tipo: 'fin', etiqueta: 'Fin', icono: Flag, color: 'var(--bad)' },
];

function flujoInicial(): { nodes: Node[]; edges: Edge[] } {
  return { nodes: [{ id: 'inicio', type: 'inicio', position: { x: 40, y: 140 }, data: {} }], edges: [] };
}

// Bloques que no se alcanzan desde "Inicio": nunca se van a ejecutar.
function bloquesSueltos(nodes: Node[], edges: Edge[]): string[] {
  const alcanzados = new Set<string>(['inicio']);
  const cola = ['inicio'];
  while (cola.length) {
    const actual = cola.pop()!;
    for (const e of edges) {
      if (e.source === actual && !alcanzados.has(e.target)) {
        alcanzados.add(e.target);
        cola.push(e.target);
      }
    }
  }
  return nodes.filter((n) => !alcanzados.has(n.id)).map((n) => n.id);
}

interface BurbujaVista { quien: 'bot' | 'info'; texto: string; opciones?: string[] }

// Recorre el flujo desde "Inicio" por el camino principal (hasta la primera
// pregunta) para mostrar cómo lo vería el cliente.
function vistaPrevia(nodes: Node[], edges: Edge[]): BurbujaVista[] {
  const salida: BurbujaVista[] = [];
  let actual = edges.find((e) => e.source === 'inicio')?.target;
  const visitados = new Set<string>();
  while (actual && !visitados.has(actual) && salida.length < 12) {
    visitados.add(actual);
    const nodo = nodes.find((n) => n.id === actual);
    if (!nodo) break;
    const d = nodo.data as DatosNodo;
    if (nodo.type === 'texto') salida.push({ quien: 'bot', texto: d.contenido?.trim() || '(mensaje vacío)' });
    else if (nodo.type === 'imagen') salida.push({ quien: 'bot', texto: 'Imagen enviada' });
    else if (nodo.type === 'pdf') salida.push({ quien: 'bot', texto: 'PDF enviado' });
    else if (nodo.type === 'espera') salida.push({ quien: 'info', texto: `Espera ${d.duracion_segundos ?? 0} s` });
    else if (nodo.type === 'pregunta') {
      salida.push({ quien: 'bot', texto: d.contenido?.trim() || '(pregunta vacía)', opciones: (d.opciones || []).map((o) => o.etiqueta || '(opción vacía)') });
      break;
    } else if (nodo.type === 'fin') {
      salida.push({ quien: 'info', texto: 'Fin del flujo' });
      break;
    }
    actual = edges.find((e) => e.source === nodo.id)?.target;
  }
  return salida;
}

// ---------- Editor ----------

interface FlujoEditorProps {
  regla: RespuestaAutomatica | null;
  onCerrar: () => void;
  onGuardado: () => void;
}

function Editor({ regla, onCerrar, onGuardado }: FlujoEditorProps) {
  const { usuario } = useAuth();
  const { screenToFlowPosition } = useReactFlow();
  const inicial = useMemo(() => {
    if (regla?.flujo) return { nodes: regla.flujo.nodes as unknown as Node[], edges: regla.flujo.edges as unknown as Edge[] };
    return flujoInicial();
  }, [regla]);

  const [nodes, setNodes, onNodesChange] = useNodesState(inicial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(inicial.edges);
  const [nombre, setNombre] = useState(regla?.nombre || '');
  const [disparador, setDisparador] = useState<Disparador>(regla?.disparador || 'palabra_clave');
  const [palabras, setPalabras] = useState((regla?.palabras_clave || []).join(', '));
  const [modo, setModo] = useState<Modo>(regla?.modo_coincidencia || 'contiene');
  const [tolerancia, setTolerancia] = useState(regla ? !!regla.tolerancia_errores : true);
  const [demora, setDemora] = useState(String(regla?.demora_segundos ?? 0));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const sueltos = useMemo(() => bloquesSueltos(nodes, edges), [nodes, edges]);
  const previa = useMemo(() => vistaPrevia(nodes, edges), [nodes, edges]);

  const onConnect = useCallback((c: Connection) => {
    // Cada salida tiene una sola conexión: al conectar de nuevo, reemplaza la anterior.
    setEdges((prev) => addEdge({ ...c, id: `e_${idNuevo()}` }, prev.filter((e) => !(e.source === c.source && (e.sourceHandle ?? null) === (c.sourceHandle ?? null)))));
  }, [setEdges]);

  const agregarNodo = (tipo: Exclude<TipoNodo, 'inicio'>) => {
    const data: DatosNodo =
      tipo === 'espera' ? { duracion_segundos: 5 }
      : tipo === 'pregunta' ? { contenido: '', opciones: [{ id: `op_${idNuevo()}`, etiqueta: '', palabras: [] }] }
      : tipo === 'texto' ? { contenido: '' }
      : {};

    // Si hay un bloque seleccionado, el nuevo va a su derecha y se une solo
    // (cuando ese bloque tiene una salida simple todavía sin conectar). Así se
    // puede armar una cadena tocando "Texto", "Texto", "Esperar"…
    const seleccionado = nodes.find((n) => n.selected) ?? null;
    const id = `n_${idNuevo()}`;
    let posicion = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    let conexion: Edge | null = null;

    if (seleccionado) {
      posicion = { x: seleccionado.position.x + 360, y: seleccionado.position.y };
      const salidaSimple = seleccionado.type !== 'pregunta' && seleccionado.type !== 'fin';
      if (salidaSimple && !edges.some((e) => e.source === seleccionado.id)) {
        conexion = { id: `e_${idNuevo()}`, source: seleccionado.id, target: id };
      }
    }

    setNodes((prev) => [
      ...prev.map((n) => ({ ...n, selected: false })),
      { id, type: tipo, position: posicion, data, selected: true },
    ]);
    if (conexion) setEdges((prev) => [...prev, conexion!]);
  };

  const guardar = async () => {
    setError('');
    if (!nombre.trim()) return setError('Poné un nombre al flujo.');
    const listaPalabras = palabras.split(',').map((p) => p.trim()).filter(Boolean);
    if (disparador === 'palabra_clave' && listaPalabras.length === 0) return setError('Agregá al menos una palabra clave para activar el flujo.');
    const inicio = nodes.find((n) => n.type === 'inicio');
    if (!inicio || !edges.some((e) => e.source === inicio.id)) return setError('Conectá el bloque "Inicio" con el primer paso del flujo.');
    const preguntaVacia = nodes.find((n) => n.type === 'pregunta' && !((n.data as DatosNodo).contenido || '').trim());
    if (preguntaVacia) return setError('Una pregunta no tiene texto.');

    const flujo: FlujoBot = {
      nodes: nodes.map((n) => ({ id: n.id, type: n.type as TipoNodo, position: n.position, data: n.data as NodoFlujo['data'] })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
    };
    const datos = {
      tipo: 'flujo' as const,
      nombre: nombre.trim(),
      flujo,
      pasos: [],
      disparador,
      palabras_clave: disparador === 'palabra_clave' ? listaPalabras : [],
      palabra_clave: disparador === 'palabra_clave' ? listaPalabras.join(', ') : nombre.trim(),
      modo_coincidencia: modo,
      tolerancia_errores: tolerancia,
      demora_segundos: Math.max(0, Number(demora) || 0),
    };

    setGuardando(true);
    const { error: errorBD } = regla
      ? await supabase.from('respuestas_automaticas').update(datos).eq('id', regla.id)
      : await supabase.from('respuestas_automaticas').insert({ ...datos, empresa_id: usuario!.empresa_id, creado_por: usuario!.id });
    setGuardando(false);
    if (errorBD) return setError('No se pudo guardar el flujo.');
    onGuardado();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--surface)]">
      <style>{`
        .react-flow__handle { width: 20px; height: 20px; border: 3px solid #fff; background: ${TEAL}; box-shadow: 0 0 0 1.5px ${TEAL}; transition: scale .12s; cursor: crosshair; }
        .react-flow__handle:hover, .react-flow__handle.connectingfrom, .react-flow__handle.connectingto { scale: 1.35; background: ${BLUE}; box-shadow: 0 0 0 1.5px ${BLUE}; }
        .react-flow__node { cursor: grab; }
        .react-flow__node.dragging { cursor: grabbing; }
        .react-flow__edge-path { stroke-width: 2.5; stroke: var(--fg-3); }
        .react-flow__edge.selected .react-flow__edge-path { stroke: ${BLUE}; stroke-width: 3.5; }
        .react-flow__connection-path { stroke: ${TEAL}; stroke-width: 3; }
      `}</style>
      <div className="flex flex-wrap items-end gap-3 px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${BORDE}` }}>
        <label className="flex flex-col gap-1 text-[11px] font-semibold" style={{ color: 'var(--fg-2)' }}>
          Nombre del flujo
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Bienvenida y consultas" className="rounded-lg px-2.5 outline-none text-[13px] font-normal" style={{ ...inputStyle, height: 36, width: 220 }} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold" style={{ color: 'var(--fg-2)' }}>
          Se activa
          <select value={disparador} onChange={(e) => setDisparador(e.target.value as Disparador)} className="rounded-lg px-2 outline-none text-[13px] font-normal bg-[var(--surface)]" style={{ ...inputStyle, height: 36 }}>
            {DISPARADORES.map((d) => <option key={d.valor} value={d.valor}>{d.etiqueta}</option>)}
          </select>
        </label>
        {disparador === 'palabra_clave' && (
          <>
            <label className="flex flex-col gap-1 text-[11px] font-semibold" style={{ color: 'var(--fg-2)' }}>
              Palabras clave (separadas por coma)
              <input value={palabras} onChange={(e) => setPalabras(e.target.value)} placeholder="hola, buenas, información" className="rounded-lg px-2.5 outline-none text-[13px] font-normal" style={{ ...inputStyle, height: 36, width: 240 }} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold" style={{ color: 'var(--fg-2)' }}>
              Coincidencia
              <select value={modo} onChange={(e) => setModo(e.target.value as Modo)} className="rounded-lg px-2 outline-none text-[13px] font-normal bg-[var(--surface)]" style={{ ...inputStyle, height: 36 }}>
                {MODOS.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[12px] font-normal cursor-pointer pb-2" style={{ color: 'var(--fg-2)' }}>
              <input type="checkbox" checked={tolerancia} onChange={(e) => setTolerancia(e.target.checked)} /> Aceptar errores de tipeo
            </label>
          </>
        )}
        <label className="flex flex-col gap-1 text-[11px] font-semibold" style={{ color: 'var(--fg-2)' }}>
          Demora inicial (seg)
          <input type="number" min={0} max={3600} value={demora} onChange={(e) => setDemora(e.target.value)} className="rounded-lg px-2.5 outline-none text-[13px] font-normal" style={{ ...inputStyle, height: 36, width: 90 }} />
        </label>
        <div className="flex items-center gap-2 ml-auto">
          {error && <span className="text-[12px]" style={{ color: 'var(--bad)' }}>{error}</span>}
          <button onClick={onCerrar} className="text-[13px] font-semibold rounded-lg px-3" style={{ height: 36, border: `1px solid ${BORDE}`, color: TEXTO_SECUNDARIO }}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="text-[13px] font-semibold rounded-lg px-4" style={{ height: 36, backgroundColor: TEAL, color: 'var(--accent-fg)' }}>{guardando ? 'Guardando…' : 'Guardar flujo'}</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="w-[130px] shrink-0 p-2.5 flex flex-col gap-2 overflow-y-auto" style={{ borderRight: `1px solid ${BORDE}`, backgroundColor: 'var(--surface-2)' }}>
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: TEXTO_TERCIARIO }}>Bloques</span>
          {PALETA.map((p) => (
            <button key={p.tipo} onClick={() => agregarNodo(p.tipo)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold bg-[var(--surface)]" style={{ border: `1px solid ${BORDE}`, color: p.color }}>
              <p.icono size={15} /> {p.etiqueta}
            </button>
          ))}
          <span className="text-[10.5px] leading-snug mt-1" style={{ color: TEXTO_TERCIARIO }}>Tocá un bloque para agregarlo: si hay uno seleccionado, el nuevo se coloca a su derecha y se une solo. Arrastralos de donde quieras; unilos desde el punto de la derecha al de la izquierda. Seleccioná una línea y apretá Supr para borrarla.</span>
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          {sueltos.length > 0 && (
            <div role="alert" className="px-3 py-1.5 text-[12px] font-medium shrink-0" style={{ backgroundColor: 'var(--warn-soft)', color: '#92400E', borderBottom: '1px solid var(--warn-soft)' }}>
              {sueltos.length === 1 ? '1 bloque no está conectado' : `${sueltos.length} bloques no están conectados`} al inicio y no se va a ejecutar (se ven atenuados). Unilos con una línea o borralos.
            </div>
          )}
          <div className="flex-1 min-h-0">
          <ReactFlow
            nodes={nodes.map((n) => (sueltos.includes(n.id) ? { ...n, style: { ...n.style, opacity: 0.55 } } : n))}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
            connectionRadius={45}
            connectOnClick
            snapToGrid
            snapGrid={[10, 10]}
            deleteKeyCode={['Backspace', 'Delete']}
            defaultEdgeOptions={{ type: 'smoothstep', animated: true, interactionWidth: 30, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--fg-3)' } }}
          >
            <Background gap={18} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
          </div>
        </div>
        <aside className="hidden lg:flex w-[260px] shrink-0 flex-col" style={{ borderLeft: `1px solid ${BORDE}`, backgroundColor: 'var(--surface-2)' }} aria-label="Vista previa del chat">
          <span className="px-3 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: TEXTO_TERCIARIO }}>Vista previa</span>
          <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-2">
            {previa.length === 0 && <span className="text-[12px]" style={{ color: TEXTO_TERCIARIO }}>Conectá "Inicio" con un bloque para ver cómo lo recibe el cliente.</span>}
            {previa.map((b, i) =>
              b.quien === 'info' ? (
                <span key={i} className="self-center text-[11px] rounded-full px-2.5 py-0.5" style={{ backgroundColor: '#E8EDF4', color: TEXTO_SECUNDARIO }}>{b.texto}</span>
              ) : (
                <div key={i} className="self-start max-w-[92%] rounded-2xl rounded-tl-sm px-3 py-2 text-[12.5px] bg-[var(--surface)] break-words" style={{ border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO }}>
                  {b.texto}
                  {b.opciones && b.opciones.length > 0 && (
                    <div className="flex flex-col gap-1 mt-2">
                      {b.opciones.map((o, j) => <span key={j} className="rounded-lg px-2 py-1 text-[11.5px] font-semibold" style={{ backgroundColor: 'var(--surface-2)', color: BLUE }}>{j + 1}. {o}</span>)}
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function FlujoEditor(props: FlujoEditorProps) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}
