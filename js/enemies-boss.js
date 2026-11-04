// =============================================================================
// enemies-boss.js — MECÁNICAS FIRMA DE LOS JEFES (fase 78)
// -----------------------------------------------------------------------------
// Las mecánicas de jefe que no son fases puras (lluvia de escombros, devorar
// escolta, resurrección, placas con exposición y metamorfosis) viven acá:
// funciones PURAS sobre el objeto Enemy (reciben el jefe, no lo importan).
//
// Por qué un módulo: enemies.js ya tiene el combate, las fases, la regen y el
// render del cuerpo; esto es una capa de REGLAS + un pase de dibujo. Separado
// se testea entero en Node (sin canvas ni DOM) y no engorda el archivo que
// corre en cada frame.
//
// Contrato con enemies.js (ver Enemy):
//   · initBossKit(enemy)      — estado inicial (constructor).
//   · tickBossKit(enemy, dt)  — devuelve ACCIONES que el Enemy aplica
//                               (spawn de lluvia / devorar / pare de espora).
//   · setBossExpose / bossExposeMul — ventana de vulnerabilidad.
//   · bossReviveSpec          — condición de resurrección (la aplica el Enemy).
//   · onBossPlateBroken       — abre la ventana al romper una placa.
//   · bossMechLabel / drawBossKit — lectura (barra del HUD y canvas).
//
// NO importa enemies.js (evita el ciclo): todo llega por el objeto enemy
// (data.bossMech, game, la lista viva y el engine).
//
// Los datos y su calendario están en js/enemies-data.js (`bossMech`):
//   rain   {every, first, type, count, maxAlive, hpMul, velMul, scoreMul}
//   devour {every, first, radius, maxEscorts, hpFrac, maxConsumed,
//           spawnWhenEmpty, maxEmpty, expose{seconds, weakTo, mul}}
//   revive {hpFrac, minEscorts}
//   plateExpose {seconds, weakTo, mul}   (requiere data.plates)
//   morph  {blink}                        (+ phases[].family)
// =============================================================================

import { CONFIG, clamp, rand } from './engine.js';

/** Colores de lectura de cada mecánica (canvas y avisos). */
export const BOSS_MECH_COLORS = {
  rain: '#FFB347',
  devour: '#C77DFF',
  revive: '#B07CFF',
  plate: '#90CAF9',
  expose: '#FFD24A',
  morph: '#7BE07B',
};

/** Claves canónicas del kit (el test de catálogo las exige en los 5 jefes). */
export const BOSS_KIT_KEYS = ['rain', 'devour', 'revive', 'plateExpose', 'morph'];

/** Cuánto dura el pulso visual de la metamorfosis (s). */
const MORPH_PULSE = 0.9;

const num = (v, def) => (Number.isFinite(Number(v)) ? Number(v) : def);
const atLeast = (v, def) => Math.max(0, num(v, def));
const frac = (v, def) => clamp(num(v, def), 0, 1);
const secs = (v, def) => Math.max(0.1, num(v, def));
const intAtLeast = (v, def) => Math.max(0, Math.trunc(num(v, def)));

/**
 * Normaliza la ventana de exposición de un dato: {seconds, weakTo, mul}.
 * Sin `weakTo` no hay ventana (una exposición sin tipo no se lee).
 * @param {object|null|undefined} spec
 * @returns {{seconds:number, weakTo:string, mul:number}|null}
 */
function exposeSpec(spec) {
  if (!spec || typeof spec !== 'object') return null;
  const weakTo = typeof spec.weakTo === 'string' ? spec.weakTo : null;
  if (!weakTo) return null;
  return {
    seconds: secs(spec.seconds, 2.5),
    weakTo,
    mul: Math.max(1.01, num(spec.mul, 1.5)),
  };
}

/**
 * Kit normalizado de un jefe (defaults incluidos) o null si el tipo no
 * declara `data.bossMech`. NO muta el dato: devuelve un objeto nuevo.
 *
 * @param {object} enemy jefe (Enemy)
 * @returns {object|null}
 */
export function bossKit(enemy) {
  const raw = enemy?.data?.bossMech;
  if (!raw || typeof raw !== 'object') return null;
  const kit = {};
  if (raw.rain) {
    const r = raw.rain;
    kit.rain = {
      every: secs(r.every, 8),
      first: atLeast(r.first, 6),
      type: typeof r.type === 'string' ? r.type : 'fragment',
      count: Math.max(1, Math.min(8, intAtLeast(r.count, 3))),
      maxAlive: intAtLeast(r.maxAlive, 6),
      hpMul: Math.max(0.1, num(r.hpMul, 1)),
      velMul: Math.max(0.1, num(r.velMul, 1)),
      scoreMul: frac(r.scoreMul, 0.1),
    };
  }
  if (raw.devour) {
    const d = raw.devour;
    kit.devour = {
      every: secs(d.every, 6),
      first: atLeast(d.first, 4),
      radius: Math.max(1, num(d.radius, 180)),
      maxEscorts: Math.max(1, intAtLeast(d.maxEscorts, 3)),
      hpFrac: Math.max(0, num(d.hpFrac, 0.015)),
      maxConsumed: intAtLeast(d.maxConsumed, 6),
      // null = no pare nada cuando no hay escolta; string = tipo de la cría.
      spawnWhenEmpty: typeof d.spawnWhenEmpty === 'string' ? d.spawnWhenEmpty : null,
      maxEmpty: intAtLeast(d.maxEmpty, 4),
      expose: exposeSpec(d.expose),
    };
  }
  if (raw.revive) {
    const r = raw.revive;
    kit.revive = {
      hpFrac: clamp(num(r.hpFrac, 0.3), 0.01, 0.95),
      minEscorts: Math.max(1, intAtLeast(r.minEscorts, 1)),
    };
  }
  if (raw.plateExpose) {
    const ex = exposeSpec(raw.plateExpose);
    if (ex) kit.plateExpose = ex;
  }
  if (raw.morph) kit.morph = { blink: raw.morph.blink !== false };
  return Object.keys(kit).length ? kit : null;
}

/**
 * Arma el estado de la mecánica en el jefe (lo llama el constructor).
 * Sin kit deja los campos en valores neutros: las demás ramas del Enemy
 * (takeDamage, update, draw) consultan `_bossKit` y no tocan nada.
 *
 * @param {object} enemy
 * @returns {object|null} el kit normalizado
 */
export function initBossKit(enemy) {
  const kit = bossKit(enemy);
  enemy._bossKit = kit;
  enemy._kitSeen = {};
  enemy._expose = null;        // {weakTo, mul, until} (t del enemigo)
  enemy._revived = false;      // ya usó su resurrección
  enemy._reviveReady = false;  // hay escolta suficiente AHORA
  enemy._consumedEscorts = 0;  // escolta comida (tope del dato)
  enemy._emptySpawns = 0;      // esporas paridas sin escolta (tope)
  enemy._rainT = 0;
  enemy._rainVolleys = 0;
  enemy._devourT = 0;
  enemy._devourTicks = 0;
  enemy._devourFlash = 0;
  enemy._morphT = 0;
  return kit;
}

/** Tiempo propio del jefe para las ventanas (nunca NaN). */
function clockOf(enemy) {
  return Number.isFinite(enemy?.t) ? enemy.t : 0;
}

/** Escoltas vivas del jefe (las marca `escortOf`), opcionalmente en radio. */
function escortsNear(enemy, radius = 0, max = Infinity) {
  const list = enemy?.game?.fortress?.enemies;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const e of list) {
    if (out.length >= max) break;
    if (!e || e === enemy || e.dead || e.escortOf !== enemy) continue;
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
    if (radius > 0 && Math.hypot(e.x - enemy.x, e.y - enemy.y) > radius) continue;
    out.push(e);
  }
  return out;
}

/** ¿Cuántas escoltas vivas tiene el jefe? (corta en `cap` si se pasa). */
function countEscorts(enemy, cap = Infinity) {
  return escortsNear(enemy, 0, cap).length;
}

/**
 * Condición de RESURRECCIÓN del jefe.
 * `null` si no aplica (sin kit, ya revivió, muerto o sin escolta).
 * Se evalúa ANTES de morir: el Enemy la aplica en `_resolveHpDepleted()`.
 *
 * @param {object} enemy
 * @returns {{hpFrac:number, minEscorts:number}|null}
 */
export function bossReviveSpec(enemy) {
  const rev = enemy?._bossKit?.revive;
  if (!rev || enemy._revived || enemy.dead) return null;
  const need = Math.max(0, Math.trunc(rev.minEscorts ?? 1));
  if (need > 0 && countEscorts(enemy, need) < need) return null;
  return { hpFrac: rev.hpFrac, minEscorts: need };
}

/**
 * Abre (o refresca) la ventana de EXPOSICIÓN: durante `seconds` el jefe
 * recibe `mul` de daño del tipo `weakTo`. No apila: gana el fin más lejano
 * y el multiplicador mayor para el mismo tipo.
 *
 * @param {object} enemy
 * @param {object|null} spec {seconds, weakTo, mul}
 * @returns {boolean}
 */
export function setBossExpose(enemy, spec) {
  const ex = exposeSpec(spec);
  if (!ex || !enemy) return false;
  const now = clockOf(enemy);
  const cur = enemy._expose;
  const alive = cur && cur.until > now && cur.weakTo === ex.weakTo;
  enemy._expose = {
    weakTo: ex.weakTo,
    mul: Math.max(ex.mul, alive ? cur.mul : 1),
    until: Math.max(now + ex.seconds, alive ? cur.until : 0),
  };
  return true;
}

/**
 * Multiplicador EXTRA de la ventana de exposición para un tipo de daño.
 * `1` si no hay ventana viva o el tipo no es el declarado.
 *
 * @param {object} enemy
 * @param {string} dmgType
 * @returns {number}
 */
export function bossExposeMul(enemy, dmgType) {
  const ex = enemy?._expose;
  if (!ex || !dmgType || ex.weakTo !== dmgType) return 1;
  return clockOf(enemy) < ex.until ? ex.mul : 1;
}

/**
 * Tick del kit: avanza los relojes y devuelve las ACCIONES del frame.
 * Sólo DECIDE; el Enemy es el que spawnea, cura y emite.
 *
 * Acciones:
 *   {kind:'rain', xList}          — columnas donde caen los escombros
 *   {kind:'devour', targets, hpFrac, expose} — escolta a devorar
 *   {kind:'empty', type}          — pare una cría (sin escolta que comer)
 *
 * @param {object} enemy
 * @param {number} dt
 * @returns {Array<object>}
 */
export function tickBossKit(enemy, dt) {
  const kit = enemy?._bossKit;
  if (!kit || enemy.dead || !(dt > 0)) return [];
  const out = [];
  if (enemy._morphT > 0) enemy._morphT = Math.max(0, enemy._morphT - dt);
  if (enemy._devourFlash > 0) enemy._devourFlash = Math.max(0, enemy._devourFlash - dt);
  // La resurrección se evalúa una vez por tick: la barra del HUD y el dibujo
  // (que corren más seguido) leen el flag y no recorren la lista viva.
  enemy._reviveReady = !!bossReviveSpec(enemy);

  if (kit.rain) {
    enemy._rainT += dt;
    const wait = (enemy._rainVolleys ?? 0) === 0 ? kit.rain.first : kit.rain.every;
    if (enemy._rainT >= wait) {
      enemy._rainT = 0;
      enemy._rainVolleys = (enemy._rainVolleys ?? 0) + 1;
      const alive = countEscorts(enemy);
      const room = Math.max(0, kit.rain.maxAlive - alive);
      const n = Math.min(kit.rain.count, room);
      if (n > 0) {
        const xList = [];
        const minX = 24;
        const maxX = Math.max(minX, CONFIG.CANVAS_W - 24);
        for (let i = 0; i < n; i++) xList.push(clamp(rand(minX, maxX), minX, maxX));
        out.push({ kind: 'rain', xList });
      }
    }
  }

  if (kit.devour) {
    enemy._devourT += dt;
    const wait = (enemy._devourTicks ?? 0) === 0 ? kit.devour.first : kit.devour.every;
    if (enemy._devourT >= wait) {
      enemy._devourT = 0;
      enemy._devourTicks = (enemy._devourTicks ?? 0) + 1;
      const targets = escortsNear(enemy, kit.devour.radius, kit.devour.maxEscorts);
      const room = Math.max(0, kit.devour.maxConsumed - (enemy._consumedEscorts ?? 0));
      if (targets.length && room > 0) {
        out.push({
          kind: 'devour',
          targets: targets.slice(0, room),
          hpFrac: kit.devour.hpFrac,
          expose: kit.devour.expose,
        });
      } else if (kit.devour.spawnWhenEmpty
        && (enemy._emptySpawns ?? 0) < kit.devour.maxEmpty) {
        out.push({ kind: 'empty', type: kit.devour.spawnWhenEmpty });
      }
    }
  }

  return out;
}

/**
 * Efecto de una PLACA ROTA: abre la ventana de exposición y devuelve el
 * payload para el aviso. `null` si el jefe no declara `plateExpose`.
 *
 * @param {object} enemy
 * @returns {{kind:string,left:number,weakTo:string,mul:number,seconds:number}|null}
 */
export function onBossPlateBroken(enemy) {
  const spec = enemy?._bossKit?.plateExpose;
  if (!spec) return null;
  if (!setBossExpose(enemy, spec)) return null;
  return {
    kind: 'plate',
    left: enemy.platesLeft ?? 0,
    weakTo: spec.weakTo,
    mul: spec.mul,
    seconds: spec.seconds,
  };
}

/**
 * Latido de la METAMORFOSIS (lo llama el Enemy al disparar una fase con
 * `family`): marca el pulso visual y devuelve true si hay que teletransportar.
 *
 * @param {object} enemy
 * @returns {boolean} true si el kit pide blink
 */
export function onBossMorph(enemy) {
  const morph = enemy?._bossKit?.morph;
  if (!morph) return false;
  enemy._morphT = MORPH_PULSE;
  return morph.blink === true;
}

/**
 * Texto de estado de la mecánica para la barra del HUD ('' → null).
 * Prioridad: placas → resurrección lista → exposición viva.
 *
 * @param {object} enemy
 * @returns {string|null}
 */
export function bossMechLabel(enemy) {
  if (!enemy?._bossKit) return null;
  const left = Math.trunc(Number(enemy.platesLeft) || 0);
  const total = Math.trunc(Number(enemy.plateCount) || 0);
  if (left > 0 && total > 0) return `PLACAS ${left}/${total}`;
  if (enemy._reviveReady && !enemy._revived) return 'VA A RESUCITAR';
  if (bossExposeMul(enemy, enemy._expose?.weakTo) > 1) return 'EXPUESTO';
  return null;
}

/**
 * Pase de DIBUJO del kit (formas baratas, sin gradientes nuevos): aro de
 * exposición, placas orbitando, marca de resurrección, boca del devorar y
 * onda de metamorfosis. Lo llama Enemy.draw sólo para jefes vivos y nunca
 * en el bake/icono del bestiario.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} enemy
 */
export function drawBossKit(ctx, enemy) {
  if (!ctx || !enemy?._bossKit) return;
  const kit = enemy._bossKit;
  if (enemy.dead) return;
  const x = enemy.x;
  const y = enemy.y;
  const r = enemy.r;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r)) return;
  const t = clockOf(enemy);
  const pulse = 0.5 + 0.5 * Math.sin(t * 4 + (enemy.phase ?? 0));
  ctx.save();

  // 1) Placas vivas: un arco por placa (se van apagando de a una).
  const left = Math.trunc(Number(enemy.platesLeft) || 0);
  const total = Math.trunc(Number(enemy.plateCount) || 0);
  if (left > 0 && total > 0) {
    ctx.globalAlpha = 0.55 + 0.30 * pulse;
    ctx.strokeStyle = BOSS_MECH_COLORS.plate;
    ctx.lineWidth = 3;
    for (let i = 0; i < left; i++) {
      const a0 = -Math.PI / 2 + (i / total) * Math.PI * 2 + t * 0.35;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.14, a0, a0 + 0.62);
      ctx.stroke();
    }
  }

  // 2) Exposición viva: aro dorado que dice "ahora sí".
  const ex = enemy._expose;
  if (ex && t < ex.until) {
    ctx.globalAlpha = 0.30 + 0.28 * pulse;
    ctx.strokeStyle = BOSS_MECH_COLORS.expose;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.20, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 3) Resurrección disponible: doble aro violeta (el jefe "no cae").
  if (kit.revive && !enemy._revived) {
    const ready = enemy._reviveReady === true;
    ctx.globalAlpha = ready ? 0.30 + 0.28 * pulse : 0.16 + 0.10 * pulse;
    ctx.strokeStyle = BOSS_MECH_COLORS.revive;
    ctx.lineWidth = ready ? 2.4 : 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.30, t * 0.7, t * 0.7 + Math.PI * 1.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 1.30, t * 0.7 + Math.PI, t * 0.7 + Math.PI * 2.1);
    ctx.stroke();
  }

  // 4) Boca del devorar: un arco "muerde" mientras dura el bocado.
  if ((enemy._devourFlash ?? 0) > 0) {
    const k = clamp(enemy._devourFlash / 0.6, 0, 1);
    ctx.globalAlpha = 0.45 + 0.35 * k;
    ctx.strokeStyle = BOSS_MECH_COLORS.devour;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, r * (0.55 + 0.35 * (1 - k)), 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  // 5) Onda de metamorfosis: anillo que se expande y se apaga.
  if ((enemy._morphT ?? 0) > 0) {
    const k = 1 - clamp(enemy._morphT / MORPH_PULSE, 0, 1); // 0 → 1
    ctx.globalAlpha = 0.65 * (1 - k);
    ctx.strokeStyle = BOSS_MECH_COLORS.morph;
    ctx.lineWidth = 3 + 3 * (1 - k);
    ctx.beginPath();
    ctx.arc(x, y, r * (0.9 + 1.4 * k), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}
