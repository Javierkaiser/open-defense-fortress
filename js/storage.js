// =============================================================================
// storage.js — acceso tolerante a localStorage
// -----------------------------------------------------------------------------
// meta.js, progress.js, theme.js y quality.js repetían la MISMA función
// `safeLocalStorage()`. Centralizarla evita que una mejora (p. ej. manejar
// `localStorage` bloqueado) se aplique en un solo módulo y deje a los otros
// con la versión vieja.
//
// En Node/tests no existe `localStorage`: se devuelve un stub no-op para que
// las funciones puras sigan siendo testeables con storage inyectable.
// =============================================================================

export function safeLocalStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch (_err) { /* acceso denegado (modo privado) */ }
  return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}
