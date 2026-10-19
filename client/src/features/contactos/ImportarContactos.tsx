import { useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { Boton } from '../../components/ui';

interface ImportarContactosProps {
  telefonosExistentes: Set<string>;
  onCerrar: () => void;
  onImportado: () => void;
}

type Campo = 'telefono' | 'nombre' | 'producto_interes' | 'origen';
const CAMPOS: { id: Campo; etiqueta: string; obligatorio?: boolean; pistas: string[] }[] = [
  { id: 'telefono', etiqueta: 'Teléfono', obligatorio: true, pistas: ['telefono', 'teléfono', 'celular', 'whatsapp', 'numero', 'número', 'phone', 'movil', 'móvil'] },
  { id: 'nombre', etiqueta: 'Nombre', pistas: ['nombre', 'name', 'cliente', 'contacto'] },
  { id: 'producto_interes', etiqueta: 'Producto de interés', pistas: ['producto', 'interes', 'interés', 'curso'] },
  { id: 'origen', etiqueta: 'Origen', pistas: ['origen', 'fuente', 'source', 'campaña', 'campana'] },
];

// Lector de CSV mínimo: separa por coma, punto y coma o tabulador (lo que
// exporte Excel según la región) y respeta comillas, saltos de línea y "" dentro de un campo.
export function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, '');
  const primeraLinea = limpio.split(/\r?\n/, 1)[0] || '';
  const separador = [',', ';', '\t'].map((s) => ({ s, n: primeraLinea.split(s).length })).sort((a, b) => b.n - a.n)[0].s;
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let enComillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i];
    if (enComillas) {
      if (ch === '"' && limpio[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') enComillas = false;
      else campo += ch;
    } else if (ch === '"') enComillas = true;
    else if (ch === separador) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((c) => c.trim() !== '')) filas.push(fila);
      fila = [];
    } else campo += ch;
  }
  fila.push(campo);
  if (fila.some((c) => c.trim() !== '')) filas.push(fila);
  return filas;
}

// Solo dígitos; si el número viene sin código de país (hasta 9 dígitos) se le agrega el elegido.
function normalizarTelefono(crudo: string, codigoPais: string): string | null {
  let d = crudo.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length <= 9) d = codigoPais + d.replace(/^0+/, '');
  return d.length >= 10 && d.length <= 15 ? d : null;
}

export default function ImportarContactos({ telefonosExistentes, onCerrar, onImportado }: ImportarContactosProps) {
  const { usuario } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [filas, setFilas] = useState<string[][]>([]);
  const [mapa, setMapa] = useState<Record<Campo, number>>({ telefono: -1, nombre: -1, producto_interes: -1, origen: -1 });
  const [codigoPais, setCodigoPais] = useState('591');
  const [error, setError] = useState('');
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ nuevos: number; omitidos: number } | null>(null);

  const encabezados = filas[0] || [];
  const datos = filas.slice(1);

  const alElegir = async (file: File) => {
    setError('');
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError('Por ahora se aceptan archivos CSV. En Excel usa "Guardar como" y elige "CSV (delimitado por comas)".');
      return;
    }
    const leidas = leerCsv(await file.text());
    if (leidas.length < 2) {
      setError('El archivo no tiene filas de datos. La primera fila debe ser el encabezado.');
      return;
    }
    setNombreArchivo(file.name);
    setFilas(leidas);
    // Adivina las columnas por el nombre del encabezado.
    const nuevo: Record<Campo, number> = { telefono: -1, nombre: -1, producto_interes: -1, origen: -1 };
    CAMPOS.forEach((c) => {
      nuevo[c.id] = leidas[0].findIndex((h) => c.pistas.some((p) => h.trim().toLowerCase().includes(p)));
    });
    setMapa(nuevo);
  };

  // Clasifica cada fila: nueva, repetida (ya existe o está dos veces en el archivo) o inválida.
  const analisis = useMemo(() => {
    const vistos = new Set<string>();
    const nuevos: { telefono: string; nombre: string | null; producto_interes: string | null; origen: string | null }[] = [];
    let repetidos = 0;
    let invalidos = 0;
    if (mapa.telefono < 0) return { nuevos, repetidos, invalidos };
    for (const f of datos) {
      const tel = normalizarTelefono(f[mapa.telefono] || '', codigoPais);
      if (!tel) { invalidos++; continue; }
      if (telefonosExistentes.has(tel) || vistos.has(tel)) { repetidos++; continue; }
      vistos.add(tel);
      const val = (i: number) => (i >= 0 ? (f[i] || '').trim() || null : null);
      nuevos.push({ telefono: tel, nombre: val(mapa.nombre), producto_interes: val(mapa.producto_interes), origen: val(mapa.origen) });
    }
    return { nuevos, repetidos, invalidos };
  }, [datos, mapa, codigoPais, telefonosExistentes]);

  const importar = async () => {
    if (!usuario || analisis.nuevos.length === 0) return;
    setImportando(true);
    setError('');
    try {
      const TAMANO = 200;
      for (let i = 0; i < analisis.nuevos.length; i += TAMANO) {
        const lote = analisis.nuevos.slice(i, i + TAMANO).map((c) => ({ ...c, empresa_id: usuario.empresa_id }));
        const { error: errorBD } = await supabase.from('contactos').upsert(lote, { onConflict: 'empresa_id,telefono', ignoreDuplicates: true });
        if (errorBD) throw errorBD;
      }
      setResultado({ nuevos: analisis.nuevos.length, omitidos: analisis.repetidos + analisis.invalidos });
      onImportado();
    } catch (err) {
      console.error(err);
      setError('No se pudo completar la importación. Revisa el archivo e inténtalo de nuevo.');
    } finally {
      setImportando(false);
    }
  };

  const selectCampo = (c: (typeof CAMPOS)[number]) => (
    <label key={c.id} className="flex flex-col gap-1 text-[12.5px] font-semibold" style={{ color: 'var(--fg-2)' }}>
      {c.etiqueta}{c.obligatorio && ' *'}
      <select
        value={mapa[c.id]}
        onChange={(e) => setMapa((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))}
        className="rounded-lg px-2 outline-none font-normal text-[13.5px]"
        style={{ height: 38, border: `1px solid ${c.obligatorio && mapa[c.id] < 0 ? 'var(--bad)' : 'var(--line-2)'}`, backgroundColor: 'var(--surface-2)', color: 'var(--fg)' }}
      >
        <option value={-1}>{c.obligatorio ? 'Elige una columna' : 'No importar'}</option>
        {encabezados.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
      </select>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(2,8,20,.6)', backdropFilter: 'blur(4px)' }} onClick={onCerrar}>
      <div role="dialog" aria-label="Importar contactos" onClick={(e) => e.stopPropagation()} className="aparecer w-full flex flex-col" style={{ maxWidth: 640, maxHeight: '90dvh', backgroundColor: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 18, boxShadow: 'var(--shadow)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <h2 className="disp font-bold text-[18px] m-0" style={{ color: 'var(--fg)' }}>Importar contactos</h2>
          <button onClick={onCerrar} aria-label="Cerrar"><X size={18} color="var(--fg-2)" /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {resultado ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 size={38} color="var(--ok)" />
              <div className="disp font-bold text-[20px]" style={{ color: 'var(--fg)' }}>{resultado.nuevos} {resultado.nuevos === 1 ? 'contacto importado' : 'contactos importados'}</div>
              {resultado.omitidos > 0 && <div className="text-[13.5px]" style={{ color: 'var(--fg-2)' }}>{resultado.omitidos} filas se omitieron (repetidas o con teléfono inválido).</div>}
              <Boton variante="primario" onClick={onCerrar} style={{ marginTop: 8 }}>Listo</Boton>
            </div>
          ) : (
            <>
              <input ref={inputRef} type="file" accept=".csv,.txt,text/csv" hidden onChange={(e) => e.target.files?.[0] && alElegir(e.target.files[0])} />
              {filas.length === 0 ? (
                <button onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-2 rounded-2xl py-10 px-4 text-center" style={{ border: '2px dashed var(--line-2)', backgroundColor: 'var(--surface-2)' }}>
                  <Upload size={26} color="var(--accent)" />
                  <span className="font-semibold text-[15px]" style={{ color: 'var(--fg)' }}>Elige tu archivo CSV</span>
                  <span className="text-[12.5px] max-w-sm" style={{ color: 'var(--fg-2)' }}>La primera fila debe tener los títulos de las columnas (teléfono, nombre…). Si tienes un Excel, guárdalo como CSV.</span>
                </button>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-[13.5px]" style={{ color: 'var(--fg-2)' }}>
                    <FileSpreadsheet size={16} color="var(--accent)" />
                    <b style={{ color: 'var(--fg)' }}>{nombreArchivo}</b> · {datos.length} filas
                    <button onClick={() => { setFilas([]); setNombreArchivo(''); }} className="ml-auto text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>Cambiar archivo</button>
                  </div>
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">{CAMPOS.map(selectCampo)}</div>
                  <label className="flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--fg-2)' }}>
                    Código de país para números sin él
                    <input value={codigoPais} onChange={(e) => setCodigoPais(e.target.value.replace(/\D/g, ''))} className="num rounded-lg px-2 outline-none text-center" style={{ width: 64, height: 32, border: '1px solid var(--line-2)', backgroundColor: 'var(--surface-2)', color: 'var(--fg)' }} />
                  </label>
                  {mapa.telefono >= 0 && (
                    <div className="rounded-xl px-4 py-3 flex flex-col gap-1 text-[13.5px]" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                      <span style={{ color: 'var(--fg)' }}><b className="num" style={{ color: 'var(--ok)' }}>{analisis.nuevos.length}</b> contactos nuevos para importar</span>
                      {analisis.repetidos > 0 && <span style={{ color: 'var(--fg-2)' }}><b className="num">{analisis.repetidos}</b> ya existen o están repetidos en el archivo (no se tocan)</span>}
                      {analisis.invalidos > 0 && <span style={{ color: 'var(--warn)' }}><b className="num">{analisis.invalidos}</b> con teléfono vacío o inválido (se omiten)</span>}
                      {analisis.nuevos.slice(0, 3).map((c) => (
                        <span key={c.telefono} className="num text-[12px]" style={{ color: 'var(--fg-3)' }}>+{c.telefono} · {c.nombre || 'sin nombre'}</span>
                      ))}
                    </div>
                  )}
                </>
              )}
              {error && <div className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--bad)' }}><AlertCircle size={15} className="mt-0.5 shrink-0" />{error}</div>}
            </>
          )}
        </div>

        {!resultado && (
          <div className="flex justify-end gap-2 px-5 py-3.5" style={{ borderTop: '1px solid var(--line)' }}>
            <Boton onClick={onCerrar}>Cancelar</Boton>
            <Boton variante="primario" onClick={importar} disabled={importando || analisis.nuevos.length === 0}>
              {importando ? 'Importando…' : `Importar ${analisis.nuevos.length || ''}`.trim()}
            </Boton>
          </div>
        )}
      </div>
    </div>
  );
}
