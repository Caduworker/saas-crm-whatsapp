// Tema claro/oscuro: por defecto sigue al sistema; si la persona lo cambia
// a mano se guarda en localStorage y se aplica como data-theme en <html>
// (los tokens de index.css reaccionan a ese atributo).

export type Tema = 'claro' | 'oscuro';

const CLAVE = 'tema-ui';

function guardado(): Tema | null {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === 'claro' || v === 'oscuro' ? v : null;
  } catch {
    return null;
  }
}

export function temaActual(): Tema {
  const g = guardado();
  if (g) return g;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro';
}

function aplicar(tema: Tema) {
  document.documentElement.setAttribute('data-theme', tema === 'claro' ? 'light' : 'dark');
}

export function iniciarTema() {
  const g = guardado();
  if (g) aplicar(g);
}

export function alternarTema(): Tema {
  const nuevo: Tema = temaActual() === 'claro' ? 'oscuro' : 'claro';
  try { localStorage.setItem(CLAVE, nuevo); } catch { /* sin storage: solo esta sesión */ }
  aplicar(nuevo);
  return nuevo;
}
