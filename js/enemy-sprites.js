// ============================================================
// enemy-sprites.js — atlas runtime del CUERPO de los enemigos
// (1.12.5, Fase 2 del plan de rendimiento)
//
// El arte procedural de enemigos es el mayor coste de Canvas 2D del
// juego: un frame con 100 enemigos ejecuta ~1.500 beginPath, ~1.000
// arcos y ~120 shadowBlur. La solución NO es redibujar el arte: es
// hornearlo UNA vez por tipo/fase y dibujarlo con drawImage.
//
// Este módulo no importa enemies.js (evita el ciclo): el caller
// registra una factory que crea instancias de Enemy. En Node no hay
// document → devuelve null y el juego sigue con el dibujo procedural.
// ============================================================

import { ENEMY_TYPES } from './enemies-data.js';

let makeEnemy = null;

/** Registra la factory `(type, opts) => Enemy` desde enemies.js. */
export function registerEnemyFactory(fn) {
  makeEnemy = typeof fn === 'function' ? fn : null;
}

/** Fases horneadas por tipo (12 fps → loop de ~0,67 s). */
const PHASES = 8;

/**
 * Tipos con ROTACIÓN CONTINUA del cuerpo. No se hornean como flipbook:
 * se guarda UNA pose y la rotación se aplica en vivo con ctx.rotate.
 * Hornear 8 fases de una rotación de `t*1.6` producía un salto visible
 * cada 0,67 s (el atlas volvía a la fase 0). El flipbook sirve para
 * deformaciones/pulsos, no para transforms continuos.
 */
const SPIN_TYPES = new Set([
  'meteor', 'fragment', 'spore', 'boulder', 'crystal', 'geode',
]);

/** Cantidad de fases del atlas para un tipo (1 = rotación en runtime). */
export function spritePhaseCount(type) {
  return SPIN_TYPES.has(type) ? 1 : PHASES;
}

/** Caché por `type|dpr`. */
const CACHE = new Map();

/** Limpia el atlas (tests, cambio de DPR). */
export function resetEnemySprites() {
  CACHE.clear();
}

function dprNow() {
  if (typeof window !== 'undefined' && window.devicePixelRatio) {
    return Math.min(window.devicePixelRatio || 1, 2);
  }
  return 1;
}

/**
 * Hornea una tira horizontal con las PHASES fases del cuerpo.
 * @returns {{canvas:HTMLCanvasElement, cell:number, box:number, phases:number, dpr:number}|null}
 */
function bakeSheet(type, data, dpr) {
  if (!makeEnemy || typeof document === 'undefined') return null;
  if (typeof document.createElement !== 'function') return null;
  const r = Math.max(2, Number(data?.r) || 8);
  // Caja lógica: cubre cuerpo + tentáculos/placas (hasta ~1,8 r).
  const box = Math.max(28, Math.ceil(r * 3.8));
  const cell = Math.max(24, Math.ceil(box * dpr));
  const phases = spritePhaseCount(type);
  let cv;
  try {
    cv = document.createElement('canvas');
    cv.width = cell * phases;
    cv.height = cell;
  } catch (_err) { return null; }
  let ctx;
  try { ctx = cv.getContext('2d'); } catch (_err) { return null; }
  if (!ctx) return null;

  for (let i = 0; i < phases; i++) {
    let e;
    try {
      e = makeEnemy(type, {
        game: { engine: { _t: 0 } },
        y: 0,
        icon: true,
      });
    } catch (_err) { return null; }
    // El sprite es SOLO el cuerpo: HP, estela, variantes, aura de jefe,
    // veneno y flash se dibujan vivos en Enemy.draw.
    e._bake = true;
    e.x = 0;
    e.y = 0;
    e.phase = 0;
    // 12 fps: la pose i representa t = i/12. Para spinners hay 1 sola
    // pose (la rotación va en runtime).
    e.t = phases === 1 ? 0 : i / 12;
    e.vel = 0;
    e.variants = [];
    e.flash = 0;
    e._hiveT = 0;
    e._hitT = 0;
    e._shieldFlash = 0;
    e.poisonT = 0;
    // `isBoss` es un getter (data.boss): no se asigna. Los jefes no se
    // bakean (enemySpriteFor devuelve null para ellos).
    ctx.save();
    ctx.translate(i * cell + cell / 2, cell / 2);
    ctx.scale(dpr, dpr);
    try { e.draw(ctx); } catch (_err) { /* una fase rota no rompe el resto */ }
    ctx.restore();
  }
  return { canvas: cv, cell, box, phases, dpr };
}

/**
 * Sprite del cuerpo para un enemigo vivo, o null si no aplica (Node,
 * jefe, bake en curso, canvas no disponible). La fase se elige por
 * `enemy.t` a 12 fps.
 */
export function enemySpriteFor(enemy) {
  if (!enemy || enemy._bake || enemy.isBoss) return null;
  if (typeof document === 'undefined') return null;
  const type = enemy.type;
  if (!type) return null;
  const dpr = dprNow();
  const key = `${type}|${dpr}`;
  let sheet = CACHE.get(key);
  if (!sheet) {
    sheet = bakeSheet(type, enemy.data, dpr);
    if (!sheet) return null;
    CACHE.set(key, sheet);
  }
  const t = Number.isFinite(enemy.t) ? enemy.t : 0;
  const idx = ((Math.floor(t * 12) % sheet.phases) + sheet.phases) % sheet.phases;
  return {
    canvas: sheet.canvas,
    sx: idx * sheet.cell,
    sw: sheet.cell,
    sh: sheet.cell,
    box: sheet.box,
    phases: sheet.phases,
  };
}

/**
 * Hornea por adelantado los tipos indicados (o todos los no-jefe).
 * Se llama en idle desde main.js para que el primer spawn de cada tipo
 * no pague el bake dentro del frame de gameplay.
 */
/** Diagnóstico: cantidad de hojas y bytes de backing store del atlas. */
export function enemySpriteStats() {
  let bytes = 0;
  for (const s of CACHE.values()) {
    bytes += (s.canvas.width * s.canvas.height * 4) || 0;
  }
  return { sheets: CACHE.size, bytes };
}

export function warmEnemySprites(types = null) {
  if (typeof document === 'undefined' || !makeEnemy) return 0;
  const list = Array.isArray(types) && types.length
    ? types
    : Object.keys(ENEMY_TYPES);
  const dpr = dprNow();
  let baked = 0;
  for (const type of list) {
    const data = ENEMY_TYPES[type];
    if (!data || data.boss) continue;
    const key = `${type}|${dpr}`;
    if (CACHE.has(key)) continue;
    const sheet = bakeSheet(type, data, dpr);
    if (sheet) {
      CACHE.set(key, sheet);
      baked += 1;
    }
  }
  return baked;
}
