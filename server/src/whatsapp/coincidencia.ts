// Motor de coincidencia de las respuestas automáticas: decide si el texto del
// cliente "empata" con las palabras clave de una regla. Es una función pura
// (sin base de datos) para poder probarla sola.

export type ModoCoincidencia = 'contiene' | 'exacta' | 'empieza_con';

export interface ReglaCoincidencia {
  palabras_clave: string[];
  modo_coincidencia: ModoCoincidencia;
  tolerancia_errores: boolean;
}

// Saca tildes, mayúsculas, signos de puntuación y espacios repetidos, para que
// "¡PRECIO!", "Precio" y "précio" queden iguales.
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Distancia de Levenshtein (cantidad mínima de letras a cambiar/agregar/quitar).
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(anterior[j] + 1, actual[j - 1] + 1, anterior[j - 1] + costo);
    }
    anterior = actual;
  }
  return anterior[b.length];
}

// Cuántos errores de tipeo se perdonan según el largo de la palabra: en
// palabras cortas ("hola", "si") no se tolera nada para no confundirlas con otras.
function erroresPermitidos(largo: number): number {
  if (largo < 5) return 0;
  if (largo < 9) return 1;
  return 2;
}

function parecidos(a: string, b: string): boolean {
  return distancia(a, b) <= erroresPermitidos(Math.max(a.length, b.length));
}

function coincideUnaPalabra(texto: string, clave: string, modo: ModoCoincidencia, tolerancia: boolean): boolean {
  if (!clave) return false;

  if (modo === 'exacta') {
    return texto === clave || (tolerancia && parecidos(texto, clave));
  }

  if (modo === 'empieza_con') {
    if (texto.startsWith(clave)) return true;
    if (!tolerancia) return false;
    const nTokens = clave.split(' ').length;
    return parecidos(texto.split(' ').slice(0, nTokens).join(' '), clave);
  }

  // 'contiene'
  if (texto.includes(clave)) return true;
  if (!tolerancia) return false;
  const tokens = texto.split(' ');
  const n = clave.split(' ').length;
  for (let i = 0; i + n <= tokens.length; i++) {
    if (parecidos(tokens.slice(i, i + n).join(' '), clave)) return true;
  }
  return false;
}

// Devuelve la palabra clave que empató (para poder loguearla) o null.
export function palabraQueCoincide(textoCliente: string, regla: ReglaCoincidencia): string | null {
  const texto = normalizar(textoCliente);
  if (!texto) return null;
  for (const palabra of regla.palabras_clave) {
    const clave = normalizar(palabra);
    if (coincideUnaPalabra(texto, clave, regla.modo_coincidencia, regla.tolerancia_errores)) return palabra;
  }
  return null;
}

// Reemplaza {nombre} y {telefono} en los textos del bot. Si no se conoce el
// nombre, se saca la variable (y el espacio que la acompaña) en vez de dejar
// "{nombre}" visible al cliente.
export function aplicarVariables(texto: string, variables: Record<string, string>): string {
  return texto
    .replace(/\{(\w+)\}/g, (completo, nombre: string) => {
      const clave = nombre.toLowerCase();
      return clave in variables ? variables[clave] : completo;
    })
    .replace(/[ \t]+([,.!?;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
