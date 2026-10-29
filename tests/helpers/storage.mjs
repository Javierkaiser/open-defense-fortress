// Helpers de storage para tests (no es un archivo de test: el glob es
// tests/test-*.mjs a propósito).

/** Storage en memoria compatible con load/save de meta/progress/theme/quality. */
export function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => { data.clear(); },
    _data: data,
  };
}

/** Storage que falla al leer/escribir (modo privado, cuota llena). */
export function throwingStorage({ get = false, set = false } = {}) {
  return {
    getItem: () => {
      if (get) throw new Error('storage bloqueado');
      return null;
    },
    setItem: () => {
      if (set) throw new Error('storage lleno');
    },
  };
}
