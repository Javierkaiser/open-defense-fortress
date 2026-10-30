// ============================================================
// theme.js — dev-7 fase 13 (pedido del usuario: "themes intercambiables
// desde la pantalla principal — Cyberpunk, Neon, Aqua, Cielo, etc.")
//
// Alcance: reskinea la INTERFAZ (HUD, paneles, botones, títulos, cartas —
// variables CSS del :root, ver css/style.css) y, desde la fase 76.5,
// avisa al engine el tema de UI para que las torres y drones resuelvan su
// skin vectorial (js/tower-skins.js). El MUNDO DE JUEGO sigue mandando:
// el planeta y el fondo cambian por STAGE (engine.THEMES), no por este
// módulo. Mismo patrón que progress.js: funciones puras + storage
// inyectable, testeable desde Node.
// ============================================================

import { safeLocalStorage } from './storage.js';

const KEY = 'gdf_theme';

/**
 * Catálogo de temas — agregar uno nuevo es sumar una entrada acá +
 *  su bloque `[data-theme="id"]` en css/style.css (mismas 11 variables).
 *
 * dev-7 fase 55: `swatch` sigue siendo la pareja (acento, dorado) de antes,
 * pero la MINIATURA del selector se arma con 4 muestras (acento · dorado
 * · fondo · rojo) para que el jugador vea de verdad cómo se ve el tema
 * y no solo dos colores. `preview` es el degradado de 4 paradas de la
 * miniatura.
 */
export const THEMES = [
  {
    id: 'volcanico', name: 'Volcánico',
    swatch: ['#35E0C8', '#FFD24A'],
    preview: ['#35E0C8', '#FFD24A', '#0F2A28', '#FF5555'],
  }, // volcánico
  {
    id: 'cyberpunk', name: 'Cyberpunk',
    swatch: ['#00F0FF', '#FF2E97'],
    preview: ['#00F0FF', '#FF2E97', '#140A22', '#FF3860'],
  },
  {
    id: 'neon', name: 'Neón',
    swatch: ['#00FFF0', '#FFEE00'],
    preview: ['#00FFF0', '#FFEE00', '#120820', '#FF0060'],
  },
  {
    id: 'aqua', name: 'Aqua',
    swatch: ['#2BD9E0', '#FFD166'],
    preview: ['#2BD9E0', '#FFD166', '#0A222A', '#FF6B6B'],
  },
  {
    id: 'cielo', name: 'Cielo',
    swatch: ['#6FC6FF', '#FFC94A'],
    preview: ['#6FC6FF', '#FFC94A', '#101C2C', '#FF7A7A'],
  },
];
const THEME_IDS = new Set(THEMES.map((t) => t.id));
const DEFAULT_THEME = 'volcanico';

/** Normaliza cualquier valor guardado — tolera datos viejos/corruptos. */
export function normalizeTheme(raw) {
  return THEME_IDS.has(raw) ? raw : DEFAULT_THEME;
}

/** Lee el tema guardado (o el default si no hay/nada válido). */
export function loadTheme(storage = safeLocalStorage()) {
  try {
    return normalizeTheme(storage.getItem(KEY));
  } catch (_err) {
    return DEFAULT_THEME;
  }
}

/** Guarda el tema elegido (normalizado); devuelve lo guardado. */
export function saveTheme(id, storage = safeLocalStorage()) {
  const t = normalizeTheme(id);
  try {
    storage.setItem(KEY, t);
  } catch (_err) { /* storage lleno/bloqueado: el tema sigue aplicado igual */ }
  return t;
}

/**
 * Aplica el tema al documento (atributo `data-theme` en <html>, que es
 * lo que lee css/style.css). No hace nada en Node (sin `document`).
 *
 * OJO: NO aplica el tinte de ESCENA (el que tiñe el canvas del juego):
 * eso vive en `applyThemeToGame()`, que necesita el engine. Aquí solo
 * se aplica el DOM.
 */
export function applyTheme(id) {
  if (typeof document === 'undefined') return;
  const t = normalizeTheme(id);
  if (t === DEFAULT_THEME) {
    document.documentElement.removeAttribute('data-theme'); // usa :root tal cual
  } else {
    document.documentElement.setAttribute('data-theme', t);
  }
}

/**
 * dev-7 fase 54 — El tinte de ESCENA del tema activo.
 *
 * Se LEE del CSS (`--scene-tint` / `--scene-tint-alpha`), no se duplica en
 * JS: el color vive junto a los demás tokens del tema, así que agregar un
 * tema es solo tocar su bloque en css/style.css.
 *
 * @returns {{color: string, alpha: number}|null} null si el tema no tiñe
 *   (o si no hay DOM, como en los tests de Node)
 */
export function readSceneTint(root = undefined) {
  if (typeof document === 'undefined') return null;
  const el = root ?? document.documentElement;
  if (!el || typeof getComputedStyle !== 'function') return null;
  let cs;
  try { cs = getComputedStyle(el); } catch (_err) { return null; }
  if (!cs) return null;
  const color = (cs.getPropertyValue('--scene-tint') ?? '').trim();
  const alpha = parseFloat(cs.getPropertyValue('--scene-tint-alpha'));
  if (!color || !Number.isFinite(alpha) || alpha <= 0) return null;
  return { color, alpha: Math.min(1, alpha) };
}

/**
 * dev-7 fase 54 — Aplica el tema COMPLETO: el DOM (atributo
 * `data-theme`) y el tinte de escena del canvas.
 *
 * @param {string} id id del tema
 * @param {?object} engine el engine del juego (opcional: en Node o en
 *   pruebas no hay canvas) — si no, solo se aplica el DOM.
 */
export function applyThemeToGame(id, engine = null, skinId = 'auto') {
  const themeId = normalizeTheme(id);
  applyTheme(themeId);
  const tint = readSceneTint();
  if (engine && typeof engine.setSceneTint === 'function') {
    engine.setSceneTint(tint?.color ?? null, tint?.alpha ?? 0);
  }
  // Las torres leen `engine.uiTheme` en render/fire; no hay polling de DOM.
  engine?.setUiTheme?.(themeId, skinId);
}


