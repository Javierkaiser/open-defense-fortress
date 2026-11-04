// ============================================================
// waves-formation.js — FORMACIONES DE ENTRADA (fase 77)
//
// El director decide QUE enemigos caen y CUANTOS; este modulo decide
// COMO entran. Separa la geometria de la composicion para que el spawn
// pueda variar sin tocar el presupuesto de HP ni el balance:
//
//   · cada grupo trae una "formacion" compacta y determinista
//     (kind, espejo, sesgo, dispersion, profundidad, jitter, seed);
//   · la posicion de cada enemigo se calcula con hash(seed, indice), asi
//     el scheduler puede soltarlos de a uno y la forma es la misma que si
//     entraran en bloque;
//   · el catalogo incluye formas nuevas (arco, ola, racimo, columnas,
//     pinza, espiral...), pero la campana conserva la FAMILIA del patron
//     y la franja: cambiarlas mueve la cobertura de las torres (medido).
//     `explore:true` habilita el catalogo completo para experimentos;
//   · la apertura mantiene y=SPAWN_Y (sin profundidad) y x dentro del
//     cono del Guardian: su modelo de matabilidad no se mueve.
//
// Sin DOM ni imports de juego: puro y testeable desde Node.
// ============================================================

import { unit, pick } from './waves-rng.js';

/** Ancho del cono de tiro de la apertura (px). */
export const CONE_W = 240;

/** Franjas de spawn (fraccion del ancho del canvas). */
export const LANES = {
  full: [0, 1],
  izq: [0, 0.42],
  centro: [0.29, 0.71],
  der: [0.58, 1],
  angosta: [0.40, 0.60],
};

/** Formaciones que entiende el spawner. */
export const FORMATION_KINDS = [
  'line', 'vee', 'wall', 'burst-diag', 'rain', 'mixed-arc', 'mixed-spread',
  'arc', 'wave', 'cluster', 'columns', 'diamond', 'flanks', 'spiral',
];

/** Formaciones seguras para la apertura (todas dentro del cono). */
const OPENING_KINDS = ['vee', 'line', 'burst-diag'];

/**
 * Familias visuales por patron semantico. La primera opcion conserva la
 * lectura historica (una V sigue siendo una V la mayoria de las veces),
 * las demas agregan variantes equivalentes en coste.
 */
const KIND_OPTIONS = {
  vee: ['vee', 'vee', 'arc', 'wave', 'diamond'],
  line: ['line', 'line', 'columns', 'wave', 'arc'],
  wall: ['wall', 'wall', 'columns', 'diamond', 'flanks'],
  'burst-diag': ['burst-diag', 'burst-diag', 'flanks', 'diamond', 'spiral'],
  rain: ['rain', 'rain', 'cluster', 'mixed-spread', 'wave'],
  'mixed-arc': ['mixed-arc', 'arc', 'wave', 'spiral', 'cluster'],
  'mixed-spread': ['mixed-spread', 'cluster', 'rain'],
  arc: ['arc', 'wave', 'vee', 'line'],
  wave: ['wave', 'arc', 'vee', 'line'],
  cluster: ['cluster', 'mixed-spread', 'rain'],
  columns: ['columns', 'wall', 'line'],
  diamond: ['diamond', 'vee', 'flanks'],
  flanks: ['flanks', 'burst-diag', 'wall'],
  spiral: ['spiral', 'mixed-arc', 'arc'],
};

/** Devuelve una formacion valida (nunca null). */
export function isFormationKind(kind) {
  return FORMATION_KINDS.includes(kind);
}

/**
 * Limites horizontales del grupo. Replica la regla del spawner:
 *  - apertura: cono centrado en la base, repartido entre los grupos;
 *  - lane explicita del arquetipo;
 *  - sin lane: el canvas repartido entre los grupos.
 *
 * @param {string|null|undefined} lane
 * @param {number} gi indice del grupo
 * @param {number} gn cantidad de grupos
 * @param {{width?:number, opening?:boolean, coneW?:number, baseX?:number}} [opts]
 * @returns {[number, number]}
 */
export function laneBounds(lane, gi, gn, opts = {}) {
  const width = Number.isFinite(opts.width) ? opts.width : 540;
  const total = Math.max(1, Math.trunc(gn) || 1);
  const idx = Math.max(0, Math.min(total - 1, Math.trunc(gi) || 0));
  if (opts.opening) {
    const coneW = Math.max(1, Math.min(width, Number.isFinite(opts.coneW) ? opts.coneW : CONE_W));
    const baseX = Number.isFinite(opts.baseX) ? opts.baseX : width / 2;
    const x0 = Math.max(0, baseX - coneW / 2);
    return [x0 + (coneW / total) * idx, x0 + (coneW / total) * (idx + 1)];
  }
  const spec = lane && LANES[lane];
  if (spec) return [width * spec[0], width * spec[1]];
  return [(width / total) * idx, (width / total) * (idx + 1)];
}

/**
 * Crea la formacion de un grupo.
 *
 * @param {() => number} rnd stream de la ola/formacion
 * @param {string} pattern patron semantico del grupo
 * @param {{opening?:boolean, crystal?:boolean, type?:string, explore?:boolean}} [opts]
 *   `explore: true` habilita el catálogo completo de formas; por defecto
 *   se conserva la familia del patrón (balance medido).
 * @returns {object} formacion compacta y serializable
 */
export function makeFormation(rnd, pattern, opts = {}) {
  const opening = opts.opening === true;
  const options = opening ? OPENING_KINDS : (KIND_OPTIONS[pattern] ?? KIND_OPTIONS.line);
  // Por defecto se conserva la FAMILIA del patrón (una V sigue siendo una
  // V, una línea sigue siendo una línea) y se randomizan espejo, sesgo,
  // dispersión, jitter y ritmo. Cambiar de familia mueve la cobertura de
  // las torres y baja las bajas de la etapa (medido con balance-sim);
  // `explore: true` queda para experimentos de diseño, no para la campaña.
  const keep = opts.explore !== true && isFormationKind(pattern) ? pattern : null;
  const kind = opts.crystal ? 'vee' : (keep ?? pick(rnd, options) ?? 'line');
  const seed = ((rnd() * 0xffffffff) >>> 0) || 1;
  const spread = opening
    ? 0.82 + rnd() * 0.30
    : 0.68 + rnd() * 0.64;
  const columns = kind === 'columns' ? 2 + ((rnd() * 2) | 0) : 0;
  return {
    kind,
    mirror: rnd() < 0.5 ? -1 : 1,
    bias: (rnd() * 2 - 1) * (opening ? 0.14 : 0.38),
    spread,
    // dy = altura EXTRA sobre SPAWN_Y. Se mantiene CHICO (±14 px): el
    // enemigo tiene que entrar dentro de la misma ventana de tiro que
    // antes. Una profundidad grande lo spawnearía mas arriba, fuera del
    // alcance de las torres, y bajaría las bajas de la etapa.
    depth: opening ? 0 : 2 + rnd() * 10,
    ySpread: opening ? 0 : 0.5 + rnd() * 3.5,
    jitterX: opening ? 2 + rnd() * 6 : 3 + rnd() * 12,
    jitterY: opening ? 0 : 0.5 + rnd() * 4.5,
    phase: rnd(),
    columns,
    seed,
  };
}
/**
 * Posicion de UN enemigo dentro de su grupo.
 *
 * La Y devuelta es un OFFSET POSITIVO sobre SPAWN_Y: se resta en el
 * spawner. Nunca baja al enemigo hacia la base (0 = borde superior), asi
 * que las formaciones no acortan la caida ni mueven el balance.
 *
 * @param {object} formation
 * @param {number} index indice dentro del grupo
 * @param {number} count total del grupo
 * @param {[number, number]} bounds [x0, x1]
 * @param {{width?:number, margin?:number}} [opts]
 * @returns {{x:number, dy:number, kind:string}} posicion final
 */
export function formationPosition(formation, index, count, bounds, opts = {}) {
  const f = formation && typeof formation === 'object' ? formation : {};
  const kind = isFormationKind(f.kind) ? f.kind : 'line';
  const width = Number.isFinite(opts.width) ? opts.width : 540;
  const x0 = Number.isFinite(bounds?.[0]) ? bounds[0] : 0;
  const x1 = Number.isFinite(bounds?.[1]) ? bounds[1] : width;
  const laneW = Math.max(1, x1 - x0);
  const n = Math.max(1, Math.trunc(count) || 1);
  const i = Math.max(0, Math.min(n - 1, Math.trunc(index) || 0));
  const u = n > 1 ? i / (n - 1) : 0.5;
  const c = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0;
  const seed = Number.isFinite(f.seed) ? (f.seed >>> 0) : 0x9e3779b9;
  const noise = (salt) => unit(seed, i, salt);
  const mirror = f.mirror === -1 ? -1 : 1;
  const spread = Number.isFinite(f.spread) ? f.spread : 1;
  const bias = Number.isFinite(f.bias) ? f.bias : 0;
  const phase = Number.isFinite(f.phase) ? f.phase : 0.5;
  const m = 0.06;
  let nx = 0.5;
  let ny = 0;

  switch (kind) {
    case 'vee':
      nx = 0.5 + c * 0.42 * spread + bias * 0.08;
      ny = Math.abs(c) * 0.62;
      break;
    case 'line':
      nx = m + u * (1 - 2 * m);
      ny = 0;
      break;
    case 'wall': {
      const col = i % 2;
      const rank = Math.floor(i / 2);
      const dir = col === 0 ? -1 : 1;
      nx = 0.5 + dir * (0.17 + Math.min(0.24, rank * 0.012)) * spread;
      ny = rank * 0.05 + col * 0.08;
      break;
    }
    case 'burst-diag': {
      const slot = (i * 0.61803398875 + phase) % 1;
      nx = m + slot * (1 - 2 * m);
      ny = u * 0.72 + Math.abs(slot - 0.5) * 0.25;
      break;
    }
    case 'rain':
      nx = m + noise(1) * (1 - 2 * m);
      ny = noise(2) * 0.85;
      break;
    case 'mixed-arc':
      nx = m + u * (1 - 2 * m);
      ny = Math.sin(Math.PI * u) * 0.85;
      break;
    case 'mixed-spread':
      nx = m + noise(3) * (1 - 2 * m);
      ny = noise(4) * 0.95;
      break;
    case 'arc':
      nx = m + u * (1 - 2 * m);
      ny = Math.sin(Math.PI * u) * 0.62;
      break;
    case 'wave':
      nx = m + u * (1 - 2 * m);
      ny = 0.48 + Math.sin((u * 2 + phase) * Math.PI * 2) * 0.38;
      break;
    case 'cluster': {
      const ang = noise(5) * Math.PI * 2;
      const rad = Math.sqrt(noise(6)) * 0.36;
      nx = 0.5 + Math.cos(ang) * rad * spread + bias * 0.14;
      ny = 0.40 + Math.sin(ang) * rad * 0.90;
      break;
    }
    case 'columns': {
      const cols = Math.max(2, Math.min(4, Math.trunc(f.columns) || 2));
      const col = i % cols;
      const rank = Math.floor(i / cols);
      const base = cols === 1 ? 0.5 : m + (col / (cols - 1)) * (1 - 2 * m);
      nx = base + (noise(7) - 0.5) * 0.035;
      ny = (rank % 4) * 0.10 + phase * 0.08;
      break;
    }
    case 'diamond':
      nx = 0.5 + c * 0.38 * spread + bias * 0.06;
      ny = 0.72 - Math.abs(c) * 0.58;
      break;
    case 'flanks': {
      const half = Math.ceil(n / 2);
      const left = i < half;
      const rank = left ? i : i - half;
      const side = (left ? -1 : 1) * mirror;
      nx = 0.5 + side * (0.20 + Math.min(0.24, rank * 0.018)) * spread;
      ny = Math.min(0.75, (rank / Math.max(1, half)) * 0.65 + phase * 0.10);
      break;
    }
    case 'spiral': {
      const ang = u * Math.PI * 4 + phase * Math.PI * 2;
      const rad = 0.07 + u * 0.33;
      nx = 0.5 + Math.cos(ang) * rad * spread + bias * 0.05;
      ny = 0.45 + Math.sin(ang) * rad * 0.85;
      break;
    }
    default:
      nx = m + u * (1 - 2 * m);
      ny = 0;
      break;
  }

  // Espejo horizontal del patron (las columnas/pinzas ya lo usan arriba).
  if (kind !== 'flanks' && mirror === -1) nx = 1 - nx;

  // Jitter: X en px, Y tambien en px. Se calcula por indice, no por orden
  // de llamada, asi el scheduler sigue siendo determinista.
  const jitterX = Number.isFinite(f.jitterX) ? f.jitterX : 0;
  const jitterY = Number.isFinite(f.jitterY) ? f.jitterY : 0;
  nx += (noise(21) - 0.5) * (jitterX / Math.max(1, laneW));
  ny += (noise(22) - 0.5) * (jitterY / 120);

  let x = x0 + Math.max(0, Math.min(1, nx)) * laneW;
  // Se mantiene dentro de la franja (no invade al grupo vecino).
  x = Math.max(x0 + 2, Math.min(x0 + laneW - 2, x));
  x = Math.max(4, Math.min(width - 4, x));

  const depth = Number.isFinite(f.depth) ? Math.max(0, f.depth) : 0;
  const ySpread = Number.isFinite(f.ySpread) ? Math.max(0, f.ySpread) : 0;
  let dy = Math.max(0, ny) * (depth + ySpread);
  dy = Math.max(0, Math.min(180, dy));
  return { x, dy, kind };
}

/** Posiciones de todo un grupo (atajo de tests y herramientas). */
export function formationPositions(formation, count, bounds, opts = {}) {
  const n = Math.max(1, Math.trunc(count) || 1);
  const out = [];
  for (let i = 0; i < n; i++) out.push(formationPosition(formation, i, n, bounds, opts));
  return out;
}
/**
 * POSICION DE LA APERTURA (compatibilidad de balance).
 *
 * La apertura es la ventana donde el jugador SOLO tiene al Guardian y su
 * modelo de matabilidad se calibró con estas X. Para no mover el XP ni
 * las bajas, mantiene la geometría histórica de vee/line/burst-diag y
 * sólo acepta un jitter mínimo (±3 px) y el micro-escalonado.
 *
 * @param {string} pattern
 * @param {number} index
 * @param {number} count
 * @param {[number, number]} bounds
 * @param {number} [seed]
 * @returns {{x:number, dy:number, kind:string}}
 */
export function openingPosition(pattern, index, count, bounds, seed = 0) {
  const x0 = Number.isFinite(bounds?.[0]) ? bounds[0] : 0;
  const x1 = Number.isFinite(bounds?.[1]) ? bounds[1] : 540;
  const laneW = Math.max(1, x1 - x0);
  const n = Math.max(1, Math.trunc(count) || 1);
  const i = Math.max(0, Math.min(n - 1, Math.trunc(index) || 0));
  let x;
  switch (pattern) {
    case 'line':
      x = x0 + ((i + 0.5) / n) * laneW;
      break;
    case 'burst-diag':
      x = x0 + 10 + ((i * 97) % Math.max(1, Math.floor(laneW - 20)));
      break;
    case 'mixed-arc': {
      const t = n > 1 ? i / (n - 1) : 0.5;
      x = x0 + laneW * (0.5 + Math.cos(t * Math.PI - Math.PI / 2) * 0.5);
      break;
    }
    case 'vee':
    default: {
      const step = Math.min(46, (laneW - 20) / Math.max(1, n));
      const half = (n - 1) / 2;
      x = x0 + laneW / 2 + (i - half) * step;
      break;
    }
  }
  // La apertura usa la geometría EXACTA histórica (sin jitter de X): es
  // la ventana donde el modelo de matabilidad/XP se midió y cualquier
  // corrimiento cambia las bajas del Guardian.
  x = Math.max(4, Math.min(536, x));
  return { x, dy: 0, kind: pattern || 'vee' };
}
