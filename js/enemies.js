// ============================================================
// enemies.js — ENEMY_TYPES + clase Enemy (dev-3 → dev-5)
// Enemigos que CAEN DESDE ARRIBA (planeta volcánico, corrección
// canónica del usuario). Boss Stage 1 = meteorito GIGANTE con
// WARNING + 2 fases (§6 decisión 6); jefes de stages 2..5 con
// fases data-driven (§2.9). El escalado por stage usa scaleFor()
// de stages.js (§2.4: hp ×(1+0.35(s-1)), vel ×(1+0.08(s-1))).
// Recibe referencias por parámetro — jamás importa hud/cards/main.
//
// Contratos compartidos con towers.js (dev-2): los enemigos viven
// en game.fortress.enemies (lista viva) y exponen .dead/.hp/.x/.y.
// El daño a la base usa Fortress.takeDamage() (invuln 0.4 s solo visual
// desde balance v7 — el golpe SIEMPRE se aplica, ver player.js §2.1).
// ============================================================

import { CONFIG, SCENE, LAYOUT, SPAWN_Y, clamp, rand } from './engine.js';
import { scaleFor, leakDamageFor } from './stages.js';
// dev-7 fase 26: las mecánicas de perks (remate / robo de vida /
// explosión al matar) y la señal visual+sonora se comparten con las
// torres y drones desde perks.js (antes duplicadas en ambos archivos).
import { applyPerkDamage } from './perks.js';
// dev-7 fase 32: los tipos de daño y las familias de enemigo (la matriz
// tipo × familia se aplica en Enemy.takeDamage).
import { DAMAGE_TYPES, dmgTypeFor, dmgMultiplier } from './damagetypes.js';

/** Estética v3.1 (§2.2): paleta de floats de daño por tipo de enemigo
 * (eye-of-the-void: rojos por defecto, cálidos en meteoritos). */
const DMG_FLOAT_COLORS = {
  meteor: '#FF9A3D',
  fragment: '#FFD24A',
  spore: '#FF6A4A',
  blob: '#FF4040',
  miniBlob: '#FF4040',
};

/**
 * Stats base §2.4. Números EXACTOS del doc (escalado por stage en dev-5:
 * hp×(1+0.35·(stage−1)), vel×(1+0.08·(stage−1))).
 */
export const ENEMY_TYPES = {
  meteor: {
    family: 'rock', // fase 32: familia de daño (ver js/damagetypes.js)
    name: 'Meteorito', hp: 30, vel: 60, score: 10, r: 16,
    drift: { amp: 30, freq: 0.8 }, // caída recta con deriva senoidal ±30 px
    body: '#0A0A0A', crater: '#FFFFFF', trail1: '#FF9A3D', trail2: '#FFD24A',
  },
  fragment: {
    family: 'rock', // fase 32: familia de daño
    name: 'Fragmento', hp: 12, vel: 110, score: 15, r: 11,
    angleDeg: 25, // ráfagas en ángulo ±25°
    body: '#0E0E12', crack: '#FFFFFF', trail1: '#FF9A3D',
  },
  crystal: {
    family: 'crystal', // fase 32: familia de daño
    name: 'Cristal rojo', hp: 60, vel: 45, score: 40, r: 13,
    dropXpBonusFrac: 0.15, // al morir suelta carta bonus (+15% energía, D12)
    body: '#E01818', shine: '#FFD0D0',
    incand: '#FFD24A', // núcleo incandescente: color de la estela (T1)
  },
  spore: {
    family: 'spore', // fase 32: familia de daño
    name: 'Espora', hp: 8, vel: 90, score: 5, r: 7,
    zigzag: { amp: 26, freq: 3.2 }, // grupos con formación V y zigzag
    body: '#141014', spike: '#FFFFFF', dots: '#FF9EC4',
  },
  blob: {
    family: 'virus', // fase 32: familia de daño
    name: 'Blob tanque', hp: 220, vel: 35, score: 60, r: 24,
    pushR: 70, pushSpeed: 40, // empuja a las esporas cercanas
    body: '#C81E1E', dark: '#3A0C0C',
  },
  boss: {
    family: 'rock', // fase 32: el BOSS es un meteorito gigante
    name: 'BOSS', hp: 2600, vel: 22, score: 500, r: 85,
    boss: true, phaseHpFrac: 0.5, phaseVelMul: 1.4, phaseShedCount: 6,
    drift: { amp: 90, freq: 0.25 }, // deriva lenta lateral tras entrar
    body: '#0A0A0A', crack: '#FFDD55', glow: '#FF9A3D',
    trail1: '#FF9A3D', trail2: '#FFD24A', // dev-6: estela masiva del diseño base
  },
};

// ------------------------------------------------------------
// Jefes de stages 2..5 (§2.9). `boss` hereda la maquinaria del
// jefe Stage 1 (WARNING, barra HP, fases) con stats propios.
// phases[] = umbrales HP fracción → {velMul, shed:{type,count}, spawn}
// ------------------------------------------------------------

/** Blob virus gigante — Stage 2: suelta esporas al 66% y 33% (§2.9). */
ENEMY_TYPES.blobBoss = {
  name: 'BLOB VIRUS', hp: 2800, vel: 20, score: 700, r: 78,
  family: 'virus', // fase 32: familia de daño (ver js/damagetypes.js)
  boss: true, visual: 'blob',
  drift: { amp: 80, freq: 0.28 },
  body: '#C81E1E', dark: '#3A0C0C', glow: '#FF5577',
  // dev-7 fase 47: cada fase tiene NOMBRE (el aviso del HUD), una REGLA
  // por tipo de dano (weakTo = x1,5 / resist = x0,5) y la REGENERACION
  // por esbirro vivo de la escolta (fraccion del HP maximo por segundo).
  // El jugador tiene que leer al jefe y cambiar de torre.
  phases: [
    { atFrac: 0.66, velMul: 1.2, name: 'FURIA',
      weakTo: 'light', regen: 0.008, shed: { type: 'spore', count: 6 } },
    { atFrac: 0.33, velMul: 1.4, name: 'ENJAMBRE',
      resist: 'blast', regen: 0.010, shed: { type: 'spore', count: 8 } },
  ],
};

/** Blob mediano — acompañante del jefe del Stage 3 (no es jefe). */
ENEMY_TYPES.miniBlob = {
  name: 'Blob mediano', hp: 160, vel: 42, score: 35, r: 17,
  family: 'virus', // fase 32: familia de daño
  drift: { amp: 40, freq: 1.1 },
  body: '#E05A5A', dark: '#5A1414',
};

/** Cementerio: blob jefe + 2 miniBlobs al 50% + fragmentos blindados (§2.9). */
ENEMY_TYPES.graveBlob = {
  name: 'BLOB NECRO', hp: 3700, vel: 19, score: 800, r: 82,
  family: 'virus', // fase 32: familia de daño
  boss: true, visual: 'blob',
  drift: { amp: 70, freq: 0.26 },
  body: '#8A2BE2', dark: '#2A0A3A', glow: '#C77DFF',
  phases: [
    { atFrac: 0.75, velMul: 1.15, name: 'DESCOMPOSICIÓN',
      weakTo: 'electric', regen: 0.008, shed: { type: 'fragment', count: 6 } },
    { atFrac: 0.5, velMul: 1.25, name: 'LEGION',
      resist: 'drone', regen: 0.012, spawn: { type: 'miniBlob', count: 2 } },
    { atFrac: 0.25, velMul: 1.45, name: 'ÚLTIMO ALLETO',
      weakTo: 'ballistic', regen: 0.010, shed: { type: 'fragment', count: 8 } },
  ],
};

/** Ciudad nocturna: blob gigante blindado + esporas veloces al 60%/30%. */
ENEMY_TYPES.armoredBlob = {
  name: 'BLINDADO', hp: 4600, vel: 18, score: 900, r: 88,
  family: 'rock', // fase 32: blindado de roca
  boss: true, visual: 'armored',
  drift: { amp: 64, freq: 0.24 },
  body: '#37474F', dark: '#10181C', glow: '#90CAF9',
  phases: [
    { atFrac: 0.6, velMul: 1.2, name: 'PLACAS',
      resist: 'blast', regen: 0.008, shed: { type: 'spore', count: 10 } },
    { atFrac: 0.3, velMul: 1.35, name: 'CORAZA ABIERTA',
      weakTo: 'electric', regen: 0.012, spawn: { type: 'blob', count: 1 } },
  ],
};

/** Núcleo volcánico: METEORITO-BLOB híbrido con 3 fases (§2.9). */
ENEMY_TYPES.hybridBoss = {
  name: 'HÍBRIDO', hp: 5600, vel: 20, score: 1000, r: 92,
  family: 'rock', // fase 32: cuerpo de meteoro
  boss: true, visual: 'meteor',
  drift: { amp: 76, freq: 0.27 },
  body: '#0A0A0A', crack: '#FFDD55', glow: '#FF4444',
  trail1: '#FF9A3D', trail2: '#FFD24A', // estela masiva como el meteorito
  phases: [
    { atFrac: 0.66, velMul: 1.2, name: 'METAMORFOSIS',
      weakTo: 'light', regen: 0.008, shed: { type: 'meteor', count: 5 } },
    { atFrac: 0.33, velMul: 1.35, name: 'HÍBRIDO',
      resist: 'ballistic', regen: 0.012, spawn: { type: 'blob', count: 2 } },
    { atFrac: 0.15, velMul: 1.5, name: 'APOCALIPSIS',
      weakTo: 'blast', regen: 0.010, shed: { type: 'fragment', count: 8 } },
  ],
};

// ------------------------------------------------------------
// OLEADAS DINÁMICAS — VARIANTES DE ÉLITE (design §Decisión 4).
//
// Una variante NO es un tipo nuevo: es un MODIFICADOR que se aplica a un
// tipo que ya existe (meteorito, espora, blob…) sobre sus stats YA
// escaladas. Nunca cambia el tipo, la familia ni el tipo de daño, así que
// la matriz de familias (fase 32) sigue mandando igual y NINGUNA variante
// es inmune: cualquier torre puede matarla, sólo cambia cuánto cuesta.
//
// Quién las reparte es el DIRECTOR (js/waves.js: ≤1 variante por grupo en
// la campaña, ≤35 % de la descarga, ninguna en la apertura y ninguna antes
// de su década de entrada); acá vive la MECÁNICA.
//
// fase 68 — ELITES 2.0: el catálogo pasa de 3 a 7 y cada variante declara
// `desc`/`counter` (el bestiario ya no hardcodea textos) y `scoreMul` (una
// élite PAGA más: antes daba el mismo XP/score que el enemigo normal).
// `kind` agrupa por tipo de amenaza para el bestiario y los tests.
// ------------------------------------------------------------
export const ENEMY_VARIANTS = {
  escudado: {
    name: 'Escudado', kind: 'defensa',
    desc: 'Escudo frontal de 40 % de su vida: absorbe el daño antes que el HP y no vuelve a subir.',
    counter: 'Fuego sostenido: el escudo es finito. El área no lo saltea, pero tampoco le rinde.',
    shieldFrac: 0.40, scoreMul: 1.25,
  },
  rapido: {
    name: 'Veloz', kind: 'movilidad',
    desc: 'Cae un 40 % más rápido y tiene un 30 % menos de vida.',
    counter: 'Cualquier torre de daño alto lo mata antes de llegar; el slow lo frena.',
    velMul: 1.4, hpMul: 0.7, scoreMul: 1.25,
  },
  divisor: {
    name: 'Divisor', kind: 'muerte',
    desc: 'Al morir se parte en dos crías con el 35 % de su vida. Las crías no se vuelven a dividir.',
    counter: 'Matarlo lejos de la base y con área: las dos crías entran juntas y sin afijo.',
    split: { count: 2, hpFrac: 0.35, scoreMul: 0.35 }, scoreMul: 1.35,
  },
  sanador: {
    name: 'Sanador', kind: 'support',
    desc: 'Cura un 1,5 %/s de la vida máxima a los aliados en 110 px. No se cura a sí mismo.',
    counter: 'Enfocarlo primero o burst: si no hay aliados cerca, su aura no hace nada.',
    healAura: { radius: 110, fracPerSec: 0.015 }, scoreMul: 1.35,
  },
  regenerador: {
    name: 'Regenerador', kind: 'sustain',
    desc: 'Se cura un 2 %/s de su vida máxima mientras vive.',
    counter: 'Foco sostenido o burst: si lo ignorás, se cura todo el daño que le hiciste.',
    regenFrac: 0.02, scoreMul: 1.25,
  },
  acorazado: {
    name: 'Acorazado', kind: 'armadura',
    desc: 'Resta daño PLANO a cada golpe: 2 + 0,8 × etapa (tope 60). Un golpe nunca baja de 1.',
    counter: 'Golpes grandes (Gauss, Mortar, Beam con ramp); las cadencias rápidas pierden más.',
    armor: { base: 2, perStage: 0.8, max: 60 }, scoreMul: 1.35,
  },
  tenaz: {
    name: 'Tenaz', kind: 'control',
    desc: 'Ignora el slow y el stun: no se lo puede frenar ni paralizar.',
    counter: 'Daño puro: el build de control no lo detiene, pero cualquier torre lo mata.',
    slowImmune: true, stunImmune: true, scoreMul: 1.25,
  },
};

/** Tope de afijos por enemigo (fase 68: la campaña usa 1; el Heat, 2). */
export const MAX_VARIANTS = 2;


// ------------------------------------------------------------
// FASE 58 — GEOMETRÍA DINÁMICA (el alto lógico sale del marco).
//
// BASE_Y y BOSS_HOVER_Y eran `const` de MÓDULO: se evaluaban al
// importar el archivo, así que con el alto dinámico (el marco ya no
// tiene proporción fija 54/88) se habrían quedado en el layout viejo.
// Ahora son FUNCIONES: se leen en runtime y siempre reflejan el alto
// lógico actual (la base y la fila de torres bajan con el marco).
// ------------------------------------------------------------

/** Y de impacto contra la base (baja con el alto lógico). */
function baseImpactY() { return CONFIG.TOWER_Y + 20; }

/** Y de asedio del jefe (baja con el alto lógico). */
function bossHoverY() { return CONFIG.TOWER_Y - 220; }

// dev-7 fase 47: tope de la REGENERACIÓN del jefe. Sin tope, una nube de
// esbirros lo haría inmortal y la pelea se iría al timeout: el 2,5 % de
// su HP máximo por segundo es el techo (el resto se descarta).
const BOSS_REGEN_CAP = 0.025;

// v3 3e/7 — entrada VARIADA de jefes: asedio a Y fija (todas las torres lo
// alcanzan), barrido lateral durante la bajada y merodeo acotado en asedio.
const BOSS_MEANDER = 55;      // ±55 px: deriva lenta del ancla durante el asedio
const BOSS_SWAY = 30;         // vaivén senoidal ±30 px en asedio (total ≈ ±85, §3)
const BOSS_SWEEP_SPEED = 9;   // px/s del barrido lateral durante la bajada
const BOSS_SWEEP_MAX = 130;   // tope ±130 px acumulados del barrido de entrada

/** fase 68 — separación entre las crías del `divisor`: con count 2 nacen en
 *  x ± 14 del cadáver (y se clampean al canvas). */
const SPLIT_STEP = 28;

/** fase 68 — tick del aura del `sanador` (s): cura en pulsos, no por frame. */
const HEAL_TICK = 0.5;

// ------------------------------------------------------------
// LECTURA VISUAL: estela incandescente, peligro por proximidad y
// presencia del jefe. Todo esto es un PASE DE LECTURA sobre la
// posición real del enemigo: no toca hp, daño, colisión ni el
// tiempo de llegada (el rojo sigue reservado al daño a la base).
// ------------------------------------------------------------

/** Y más alto de spawn posible (constructor de Enemy): origen del camino. */
const THREAT_SPAWN_Y = SPAWN_Y;
/** Desde este factor de amenaza el enemigo entra en la "zona caliente"
 *  (último 25 % de la caída: lo que ya está a punto de golpear la base). */
const THREAT_ZONE = 0.75;

/** Color del rasgo visual de cada variante de élite (aura/estela/pulso):
 *  el jugador tiene que distinguir una élite a simple vista (spec
 *  "Variantes legibles") sin arte nuevo — todo son formas del canvas. */
const VARIANT_COLORS = {
  escudado: '#7FB6FF',   // azul acero: el escudo
  rapido: '#BFE9FF',     // blanco frío: las líneas de velocidad
  regenerador: '#35E08A', // verde vida (el mismo del float de cura del jefe)
  // fase 68 — los cuatro afijos nuevos
  divisor: '#B07CFF',    // violeta: la onda de división
  sanador: '#57E6C9',    // turquesa: el aura de cura aliada (distinta del regenerador)
  acorazado: '#C9D4E0',  // acero: las placas
  tenaz: '#FF6B6B',      // rojo: las cadenas del ancla
};

/** Estela incandescente (T1): nº de cromas y sus parámetros. */
const TRAIL_GHOSTS = 3;      // cromas (fantasmas) del rastro
const TRAIL_ALPHA = 0.3;     // alfa del croma más cercano (sutil a propósito)
const TRAIL_STEP = 0.55;     // separación entre cromas, en RADIOS del enemigo
const TRAIL_STEP_MAX = 26;   // tope en píxeles (el jefe no genera una coma)

/**
 * Factor de amenaza por proximidad (0..1): 0 en el spawn, 1 al llegar a la
 * base. Función PURA — sólo lee la Y; no muta nada del enemigo. Tolera
 * valores fuera de rango (Y por encima del spawn o por debajo de la base)
 * y nunca devuelve NaN.
 * @param {number} y Y actual del enemigo
 * @param {number} [baseY] Y de la base (o de la línea de asedio del jefe)
 * @param {number} [spawnY] Y de spawn de referencia
 * @returns {number} 0..1
 */
export function threatFactor(y, baseY = baseImpactY(), spawnY = THREAT_SPAWN_Y) {
  if (!Number.isFinite(y) || !Number.isFinite(baseY) || !Number.isFinite(spawnY)) return 0;
  const span = baseY - spawnY;
  if (!(span > 0)) return y >= baseY ? 1 : 0; // span degenerado: todo o nada
  const f = (y - spawnY) / span;
  if (f <= 0) return 0;
  if (f >= 1) return 1;
  return f;
}

/**
 * Aplica (o refresca) VENENO a un enemigo (dev-7 fase 30).
 *
 * El veneno es un DOT: hace `dps` de daño por segundo durante `seconds`.
 * Se REFRESCA (no se acumula) para que dos avispas sobre el mismo
 * enemigo no multiplicen el daño por dos: el que llega más fuerte manda.
 *
 * NO dispara lifesteal ni el remate de los perks: el veneno es daño
 * continuo, no un golpe. (Decisión de diseño: el robo de vida se dispara
 * por impacto, no por tick.)
 *
 * @param {Enemy} enemy enemigo a envenenar
 * @param {number} dps daño por segundo
 * @param {number} seconds duración
 * @returns {boolean} true si se aplicó
 */
export function applyPoison(enemy, dps, seconds) {
  if (!enemy || enemy.dead) return false;
  if (!Number.isFinite(dps) || dps <= 0) return false;
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  enemy.poisonT = Math.max(enemy.poisonT ?? 0, seconds);
  enemy.poisonDps = Math.max(enemy.poisonDps ?? 0, dps);
  return true;
}

/** Rampa 0..1 dentro de la zona caliente (último 25 % de la caída). */
function threatPulse(t) {  if (t <= THREAT_ZONE) return 0;
  return (t - THREAT_ZONE) / (1 - THREAT_ZONE);
}

/** Color del núcleo incandescente (estela + realce de proximidad).
 *  Rocas (meteorito/fragmento/cristal) y jefes (trail1 o glow). Las esporas
 *  y los blobs sueltos van sin estela: son rápidos y ligeros. */
function incandColor(d) {
  return d.incand ?? d.trail1 ?? d.glow ?? null;
}

/** '#RRGGBB' + alfa → 'rgba(r,g,b,a)' (halos con caída suave). */
function withAlpha(color, a) {
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return color;
  const n = parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Polígono irregular determinista por entidad (§4.2: NO regenerar por frame). */
function makePoly(seed, verts = 9) {
  const pts = [];
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = 0; i < verts; i++) {
    const ang = (Math.PI * 2 * i) / verts;
    const rr = 0.72 + rnd() * 0.42;
    pts.push({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr });
  }
  return pts;
}

function tracePoly(ctx, poly, r) {
  ctx.beginPath();
  ctx.moveTo(poly[0].x * r, poly[0].y * r);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x * r, poly[i].y * r);
  ctx.closePath();
}

// ------------------------------------------------------------
// Enemy — una entidad de engine ({update(dt), draw(ctx), dead})
// ------------------------------------------------------------
export class Enemy {
  /**
   * @param {string} type clave de ENEMY_TYPES
   * @param {number} x X inicial
   * @param {object} [opts] {game, y, vx, angleDeg, straight, scale, variant, variants,
   *   hpMax, scoreMul, fromSplit}
   *   scale = {hpMul, velMul} de stages.scaleFor(stage) (§2.4).
   *   variant / variants = afijo(s) de ENEMY_VARIANTS (0..2, ver MAX_VARIANTS);
   *   sin ellos (o desconocidos) el enemigo es el del tipo, sin modificar.
   *   hpMax / scoreMul / fromSplit = los usa SÓLO el divisor para sus crías
   *   (HP exacto, pago reducido y la marca que corta la recursión).
   */
  constructor(type, x, opts = {}) {
    this.type = type;
    this.data = ENEMY_TYPES[type];
    if (!this.data) throw new Error(`[enemies] tipo desconocido: ${type}`);
    this.game = opts.game || null;
    this.x = x;
    this.y = opts.y ?? -40 - Math.random() * 80;
    this.baseX = x;                       // ancla de la deriva senoidal/zigzag
    this.entryX = x;                      // X de entrada (ancla del merodeo, 3e/7)
    this._wander = 0;                     // deriva acotada alrededor de entryX
    this._wanderDir = Math.random() < 0.5 ? -1 : 1;
    this._sweepAcc = 0;                   // barrido lateral acumulado en la bajada
    this._sweepDir = opts.sweepDir ?? (Math.random() < 0.5 ? -1 : 1);
    const sc = opts.scale || { hpMul: 1, velMul: 1 }; // sin escala = stats base
    // fase 68 — AFIJOS (0..2). `opts.variant` se mantiene por
    // compatibilidad (iconos, tests, spawns viejos); `opts.variants`
    // habilita el doble afijo del Protocolo/Heat. Se deduplican y se
    // cortan en MAX_VARIANTS: un id desconocido cae al enemigo base,
    // EXACTAMENTE como antes.
    const requested = Array.isArray(opts.variants) ? opts.variants : [opts.variant];
    const variants = [];
    for (const id of requested) {
      if (typeof id !== 'string') continue;
      if (!Object.hasOwn(ENEMY_VARIANTS, id)) continue;
      if (variants.includes(id)) continue;
      variants.push(id);
      if (variants.length >= MAX_VARIANTS) break;
    }
    this.variants = variants;
    this.variantName = variants.map((id) => ENEMY_VARIANTS[id].name).join(' + ') || null;
    const vdefs = variants.map((id) => ENEMY_VARIANTS[id]);

    // Las STATS se combinan: hp/vel se multiplican; escudo, regen, armadura
    // y aura toman el MAYOR (llevar dos afijos no duplica dos veces el mismo
    // estado). Sin afijos, el enemigo queda EXACTAMENTE como el de siempre.
    this.hpMax = Math.max(1, Math.round(this.data.hp * sc.hpMul));
    for (const v of vdefs) {
      if (v.hpMul) this.hpMax = Math.max(1, Math.round(this.hpMax * v.hpMul));
    }
    // fase 68: las CRÍAS del divisor nacen con un HP FIJO (`opts.hpMax`), no
    // con el del tipo. Se aplica ANTES de llenar el hp: si no, la cría
    // arrancaría con la vida llena y el 35 % no se notaría.
    if (Number.isFinite(opts.hpMax)) this.hpMax = Math.max(1, Math.round(opts.hpMax));
    this.hp = this.hpMax;
    this.vel = this.data.vel * sc.velMul;
    for (const v of vdefs) this.vel *= v.velMul ?? 1;
    this.r = this.data.r;
    this.dead = false;

    // scoreMul: una élite PAGA. El XP sale del MISMO getter (`scoreReward`),
    // así que no hay dos fuentes de verdad. Tope ×2 para el doble afijo; las
    // crías del divisor pisan el multiplicador con `opts.scoreMul`.
    let sm = 1;
    for (const v of vdefs) sm *= v.scoreMul ?? 1;
    this._scoreMul = Math.min(2, Math.max(1, sm));
    this._scoreOverride = Number.isFinite(opts.scoreMul) ? Math.max(0, opts.scoreMul) : null;

    this._phaseIdx = 0;                   // fases de jefe ya disparadas
    // dev-7 fase 47: la fase VIGENTE del jefe (sus reglas de tipo de
    // daño y su regeneración) y la escolta que lo cura.
    this._phase = null;
    this.escortOf = null;                // si es esbirro, el jefe al que sirve

    // Oleadas dinámicas — estado de las VARIANTES (ver ENEMY_VARIANTS). El
    // escudo es un pool FINITO y PLANO que absorbe antes que el hp, se rompe
    // y NO regenera. La armadura es PLANA por golpe y escala con la etapa.
    const shieldFrac = Math.max(0, ...vdefs.map((v) => v.shieldFrac ?? 0));
    this.shieldMax = shieldFrac ? Math.round(this.hpMax * shieldFrac) : 0;
    this.shieldHp = this.shieldMax;
    this._shieldFlash = 0;                // flash corto de la rotura
    // Cura por segundo del `regenerador` (fracción de su HP máximo). OJO:
    // el jefe tiene SU regeneración por fases (`_phase.regen` +
    // `_updateBossRegen`), que es otra cosa y convive con ésta.
    this._regenFrac = Math.max(0, ...vdefs.map((v) => v.regenFrac ?? 0));
    this._varRegenAcc = 0;                // reloj del float de cura

    // fase 68 — armadura del `acorazado`: 2 + 0,8 × etapa, tope 60. Se aplica
    // en `_absorbDamage` DESPUÉS del escudo y de la matriz, con mínimo 1.
    const armorDef = vdefs.find((v) => v.armor)?.armor ?? null;
    const stage = Math.max(1, Math.trunc(Number(this.game?.stageId) || 1));
    this.armor = armorDef
      ? Math.max(0, Math.min(armorDef.max ?? 60, armorDef.base + armorDef.perStage * (stage - 1)))
      : 0;
    // Inmunidades de control (`tenaz`) y mecánicas de estado nuevo.
    this._slowImmune = vdefs.some((v) => v.slowImmune);
    this._stunImmune = vdefs.some((v) => v.stunImmune);
    this._healAura = vdefs.find((v) => v.healAura)?.healAura ?? null;
    this._splitDef = vdefs.find((v) => v.split)?.split ?? null;
    this._healAcc = 0;                         // reloj del aura del `sanador`
    this.fromSplit = opts.fromSplit === true; // cría del divisor (lo leen main/sim)
    this._fromSplit = this.fromSplit;         // alias interno del guard de recursión

    // Patrón de entrada (§2.4): diagonal para fragmentos, senoidal para
    // meteoros/boss, zigzag para esporas, recto para cristal/blob.
    this.vx = 0;
    if (opts.angleDeg !== undefined) this.vx = Math.tan((opts.angleDeg * Math.PI) / 180) * this.vel;
    else if (this.data.angleDeg && opts.straight !== true) {
      const sign = Math.random() < 0.5 ? -1 : 1;
      this.vx = sign * Math.tan((this.data.angleDeg * Math.PI) / 180) * this.vel;
    }
    this.phase = Math.random() * Math.PI * 2; // desincroniza las derivas
    this.t = 0;
    this.flash = 0;       // destello blanco al recibir daño (juice D1)
    this.stun = 0;        // stun de Thunderstroke (0.2 s)
    // dev-7 fase 30: VENENO (picadura del Dron Avispas). Es un DoT: hace
    // daño por segundo durante un tiempo, así que la picadura sigue
    // rindiendo aunque el objetivo NO muera con ella (antes la picadura
    // se consumía igual y el 90 % del daño se perdía contra un jefe).
    this.poisonT = 0;      // s restantes de veneno
    this.poisonDps = 0;    // daño por segundo del veneno activo
    // dev-7 fase 32: la FAMILIA del enemigo (roca / cristal / espora /
    // virus). Decide cuánto le hace cada tipo de daño (js/damagetypes.js).
    this.family = this.data.family ?? null;
    // dev-7 fase 32: destello de impacto por TIPO de daño.
    this._hitColor = null;
    this._hitT = 0;
    this._hitWeak = false;
    this.poly = makePoly(1337 + ((Math.random() * 1e6) | 0));
    this._trailAcc = 0;   // emisión de partículas de estela
    this._pushAcc = 0;    // pulso "empuja esporas" del blob
  }

  get isBoss() { return !!this.data.boss; }

  /**
   * Primer afijo (compatibilidad): el render, los iconos y los tests viejos
   * leen `enemy.variant`. El modelo real es `variants[]` (fase 68).
   */
  get variant() { return this.variants[0] ?? null; }

  /**
   * FASE 58 — Velocidad vertical EFECTIVA de la caída.
   *
   * Con el marco más alto (móvil), el campo de caída crece (de 970 a
   * ~1285 lógicos). Sin compensación el enemigo tardaría un 32 % más en
   * llegar y el juego se volvería más fácil. La compensación es esta:
   * el tramo LIBRE (por encima del alcance de las torres — donde NINGUNA
   * torre puede disparar al enemigo) se recorre MÁS RÁPIDO, y el tramo
   * "bajo fuego" se recorre a la velocidad NOMINAL.
   *
   * Resultado: el tiempo de spawn→base y el tiempo bajo fuego de cada
   * torre son EXACTAMENTE los mismos que con el marco de 54:88 → el
   * balance no cambia (es la prueba de la fase 58).
   */
  get effVel() {
    return this.vel * (this.y < LAYOUT.bandY ? LAYOUT.fallScale : 1);
  }

  /**
   * Aplica (o refresca) VENENO (dev-7 fase 30).
   *
   * El veneno es un DOT: hace `dps` de daño por segundo durante
   * `seconds`. Se refresca (no se acumula) para que dos avispas al
   * mismo enemigo no multiplicen el daño por dos: el que llega más
   * fuerte manda.
   *
   * NO dispara lifesteal ni el remate de los perks: el veneno es daño
   * continuo, no un golpe. (Es una decisión de diseño: el robo de vida
   * se dispara por impacto, no por tick.)
   *
   * @param {Enemy} enemy enemigo a envenenar
   * @param {number} dps daño por segundo
   * @param {number} seconds duración
   * @returns {boolean} true si se aplicó
   */
  static poison(enemy, dps, seconds) {
    return applyPoison(enemy, dps, seconds);
  }

  /** ¿Está envenenado ahora mismo? (para el render) */
  get poisoned() { return (this.poisonT ?? 0) > 0; }

  /** Puntos internos al morir (score/XP reales se integran en main.js). */
  get scoreReward() {
    const base = this.isBoss ? this.data.score + 200 : this.data.score;
    // fase 68: una élite PAGA. El XP sale de este mismo getter
    // (`baseScoreForEnemy` → `xpForKill`), así que score y XP no divergen.
    const mul = this._scoreOverride ?? this._scoreMul ?? 1;
    return base * mul;
  }

  /**
   * Daño entrante (balas/misiles/rayo/cadena).
   *
   * dev-7 fase 32: aquí se aplica el MULTIPLICADOR DE TIPO. El `kind`
   * dice qué tipo de daño llega (o lo trae el proyectil en `p.dmgType`) y
   * la FAMILIA del enemigo (roca / cristal / espora / virus) decide
   * cuánto se le hace: ×1,5 (fortaleza), ×0,5 (debilidad) o ×1,0.
   *
   * Es el ÚNICO punto donde se aplica: todos los caminos de daño
   * (percutiles, haces, arcos, picaduras,Chain) pasan por aquí.
   *
   * El daño ya viene multiplicado por el crítico y el remate (se
   * calculan antes), así que un crítico contra una debilidad da
   * ×1,5 × ×1,5 = ×2,25: la sinergia es real, no un extra escondido.
   *
   * @param {number} n daño base
   * @param {string} [kind] tipo de daño ('bullet' | 'laser' | 'bolt' | 'drone' | …)
   * @param {string} [dmgType] tipo explícito (el que lleva el proyectil)
   */
  takeDamage(n, _kind = 'bullet', dmgType = null) {
    // dev-7 fase 26: rechazo de valores no finitos. `n <= 0` es FALSE para
    // NaN, así que un solo NaN dejaba el hp en NaN y el `hp <= 0` posterior
    // tampoco era true: el enemigo quedaba INMORTAL y el NaN se propagaba
    // al HUD (bossHpFrac) y a la selección de blanco (towers.js).
    if (this.dead || !Number.isFinite(n) || n <= 0) return false;
    // dev-7 fase 32: el multiplicador de tipo (familia del enemigo).
    const type = dmgType ?? dmgTypeFor(_kind);
    const family = this.data.family ?? null;
    // dev-7 fase 47: la REGLA DE LA FASE del jefe se multiplica con la
    // matriz (familia): en una fase el jefe puede ser vulnerable a un
    // tipo (×1,5) y resistente a otro (×0,5). Aquí es el único punto
    // donde se aplica el daño.
    const mul = dmgMultiplier(type, family) * this._phaseTypeMul(type);
    const total = n * mul;
    // Oleadas dinámicas — variante `escudado`: el escudo ABSORBE ANTES que
    // el hp. El daño (y su multiplicador de familia) es el de siempre:
    // una variante no cambia la matriz, sólo cuánto cuesta bajarla.
    // fase 68: el float muestra el daño EFECTIVO (escudo + hp, ya pasado
    // por la armadura del `acorazado`): el jugador tiene que ver lo que
    // entró de verdad, no el número que pidió el proyectil.
    const applied = this._absorbDamage(total);
    const shown = Number.isFinite(applied) ? applied : total;
    // Estética v3.1 (eye-of-the-void / bullet-hell): números de daño ROJOS
    // flotantes sobre el enemigo golpeado — solo si sobra presupuesto de
    // partículas (MAX_PARTICLES 400 §4, jamás se supera).
    // dev-7 fase 32: el float se pinta con el color del TIPO de daño (no
    // del enemigo): así se ve QUIÉN pegó, y un golpe de fortaleza
    // (×1,5) se lee al instante. Un golpe de debilidad (×0,5) va
    // atenuado + con el glifo del tipo.
    const engDmg = this.game?.engine;
    if ((engDmg?.particles?.length ?? 0) < 330) {
      const t = DAMAGE_TYPES[type];
      const weak = mul > 1;
      const resist = mul < 1;
      const color = t?.color ?? DMG_FLOAT_COLORS[this.type] ?? '#FF5555';
      const txt = `${weak ? t?.glyph ?? '' : ''}-${Math.round(shown)}`;
      engDmg.floatText(this.x + rand(-8, 8), this.y - this.r - 10, txt, color,
        weak ? 1.35 : resist ? 0.8 : 1);
    }
    this.flash = 1;
    // dev-7 fase 32: el destello de impacto toma el color del tipo (y
    // más fuerte si fue una fortaleza) para que el golpe se lea de un
    // vistazo.
    if (type) {
      this._hitColor = DAMAGE_TYPES[type]?.color ?? null;
      this._hitT = 0.16;
      this._hitWeak = mul > 1;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return true; // kill
    }
    return false;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    // fase 68 — el `divisor` se parte ANTES de la explosión y del
    // `enemy:killed`, así las crías ya existen en la lista viva cuando
    // main contabiliza la baja de la madre.
    this._spawnSplit();
    this.explode();
    this.game?.engine?.emit('enemy:killed', this);
  }

  /**
   * fase 68 — el `divisor` suelta sus CRÍAS al morir.
   *
   * Las crías son del MISMO tipo, con `hpFrac` del HP máximo de la madre
   * (35 %), sin ningún afijo heredado y con el pago reducido (`scoreMul`
   * del afijo): el premio total de una élite no se multiplica por tres.
   * Nacen a los costados (x ± 14, contenidas en el canvas) y en la misma Y,
   * así el jugador ve que "se abrió" y no que apareció otra oleada.
   *
   * SIN RECURSIÓN: llevan `_fromSplit` y un `divisor` cría no se vuelve a
   * partir. Un jefe nunca se divide (`isBoss`), ni siquiera con el afijo.
   * Sin engine/fortaleza (tests, iconos del bestiario) no hace nada: las
   * crías necesitan la lista viva para existir de verdad.
   */
  _spawnSplit() {
    const def = this._splitDef;
    if (!def || this.isBoss || this._fromSplit) return;
    const list = this.game?.fortress?.enemies;
    const eng = this.game?.engine;
    if (!Array.isArray(list) || !eng || typeof eng.addEntity !== 'function') return;
    const count = Math.max(1, Math.trunc(def.count ?? 2));
    const hpMax = Math.max(1, Math.round(this.hpMax * def.hpFrac));
    const half = (count - 1) / 2;
    for (let i = 0; i < count; i++) {
      // Separación de 28 px entre crías contiguas: con 2 quedan en x ± 14.
      const x = clamp(this.x + (i - half) * SPLIT_STEP, 4, CONFIG.CANVAS_W - 4);
      const cria = new Enemy(this.type, x, {
        game: this.game,
        y: this.y,
        hpMax,
        scoreMul: def.scoreMul,
        fromSplit: true,
        straight: true, // sin la diagonal del tipo: las dos entran juntas
      });
      eng.addEntity(cria);
      list.push(cria);
    }
  }

  /** Explosión simple (partículas básicas + anillo; D5 juice barato). */
  explode() {
    const eng = this.game?.engine;
    if (!eng) return;
    const big = this.isBoss || this.r >= 20;
    const n = this.isBoss ? 46 : this.r >= 20 ? 22 : 10;
    eng.spawnParticles(this.x, this.y, this.data.trail1 ?? this.data.body, n, {
      speedMin: big ? 60 : 30, speedMax: big ? 260 : 130,
      lifeMin: 0.25, lifeMax: big ? 0.8 : 0.5,
      sizeMin: 1.5, sizeMax: big ? 5 : 3,
    });
    eng.spawnParticles(this.x, this.y, this.data.trail2 ?? '#FFFFFF', Math.ceil(n / 2), {
      speedMin: 20, speedMax: 120, lifeMin: 0.2, lifeMax: 0.45, sizeMin: 1, sizeMax: 2.5,
    });
    // Estética v3 4/7 (diseño base): los enemigos rojos (cristal/blob) mueren
    // con SALPIDERO de partículas rojas — la gema estalla en esquirlas.
    if (this.type === 'crystal' || this.type === 'blob' || this.data.visual === 'blob') {
      eng.spawnParticles(this.x, this.y, '#FF4040', big ? 14 : 9, {
        speedMin: 60, speedMax: big ? 240 : 160,
        lifeMin: 0.25, lifeMax: 0.6, sizeMin: 1.4, sizeMax: 3.2,
      });
      eng.spawnParticles(this.x, this.y, '#B01010', big ? 8 : 5, {
        speedMin: 30, speedMax: 120, gravity: 90,
        lifeMin: 0.35, lifeMax: 0.75, sizeMin: 1.6, sizeMax: 3,
      });
    }
    if (big) eng.shake(this.isBoss ? 8 : 4, this.isBoss ? 450 : 250); // D5: shake
    const R = this.r;
    const col = this.data.trail1 ?? this.data.body;
    eng.addEffect({ life: 0.25, draw: (ctx, t) => {
      ctx.save();
      ctx.globalAlpha = t * 0.85;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, R * (0.6 + (1 - t) * 1.6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } });
    // Destello radial blanco + chispas (dev-6, D5): flash central y motas
    // brillantes que hacen el kill "satisfyingly impactful".
    eng.addEffect({ life: 0.16, draw: (ctx, t) => {
      ctx.save();
      ctx.globalAlpha = t * 0.85;
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(this.x, this.y, R * (0.15 + (1 - t) * 0.85), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } });
    eng.spawnParticles(this.x, this.y, '#FFFFFF', big ? 10 : 5, {
      speedMin: 60, speedMax: big ? 260 : 150,
      lifeMin: 0.15, lifeMax: 0.4, sizeMin: 1, sizeMax: 2.4,
    });
    // Estética v3.1: explosión con MÁS partículas y anillo expansivo
    // adicional (bullet-hell) — siempre dentro del presupuesto (§4).
    eng.spawnParticles(this.x, this.y, col, big ? 12 : 7, {
      speedMin: 40, speedMax: big ? 220 : 120,
      lifeMin: 0.3, lifeMax: 0.6, sizeMin: 1.2, sizeMax: big ? 3.6 : 2.6,
    });
    eng.addEffect({ life: 0.3, draw: (ctx2, t2) => {
      ctx2.save();
      ctx2.globalAlpha = t2 * 0.5;
      ctx2.strokeStyle = '#FFE9B0';
      ctx2.shadowColor = '#FFD24A';
      ctx2.shadowBlur = 12;
      ctx2.lineWidth = 2;
      ctx2.beginPath(); // anillo secundario tardío de la deflagración
      ctx2.arc(this.x, this.y, R * (0.3 + (1 - t2) * 2.1), 0, Math.PI * 2);
      ctx2.stroke();
      ctx2.restore();
    } });
  }

  update(dt) {
    if (dt <= 0) return;
    // dev-7 fase 59 — UN ENEMIGO MUERTO NO SE MUEVE.
    //
    // El engine actualiza TODAS las entidades y poda las muertas DESPUÉS
    // (engine.js: `for (e of entities) e.update(dt)` y luego el splice).
    // Un enemigo que muere por un proyectil cerca de la base seguía
    // cayendo ese frame: al cruzar la línea de impacto disparaba
    // 'enemy:reached' y se contaba como FUGA (además de baja). Con la
    // regla del 25 % de fugas eso hacía perder al jugador por fugas que
    // no eran fugas: medido, 2-3 enemigos de más por partida.
    if (this.dead) return;
    this.t += dt;
    // fase 68 — `tenaz`: neutraliza el CONTROL externo al inicio del frame.
    // El slow y el stun los escriben towers.js y los drones desde fuera; se
    // borran ANTES de consumirlos (unas líneas más abajo), así el afijo los
    // ignora sin tocar esas torres ni el comportamiento de las otras élites.
    if (this._slowImmune) this.slowFactor = undefined;
    if (this._stunImmune) this.stun = 0;
    // dev-7 fase 32: decaimiento del destello de impacto por tipo.
    if (this._hitT > 0) this._hitT = Math.max(0, this._hitT - dt);
    // dev-7 fase 30: VENENO (picadura del Dron Avispas). Se consume
    // ANTES del movimiento: el daño por segundo es continuo y la muerte
    // pasa por `die()` (el MISMO camino que un golpe normal: score, XP,
    // partículas y el evento 'enemy:killed').
    if (this.poisonT > 0 && !this.dead) {
      this.poisonT -= dt;
      // Oleadas dinámicas: el veneno es daño, así que también pasa por el
      // escudo del `escudado` (que absorbe TODO el daño antes que el hp).
      // fase 68: `{ armor: false }` — la armadura del `acorazado` es PLANA
      // POR GOLPE; aplicada al DoT por frame lo anularía (cada tick caería
      // bajo el mínimo de 1), o sea una inmunidad escondida al veneno.
      this._absorbDamage(this.poisonDps * dt, { armor: false });
      if (this.hp <= 0) {
        this.hp = 0;
        this.die();
      }
    }
    // Slow del Dron Campo de Fuerza (§2.3): el dron marca slowFactor=0.7
    // cada frame a quien está dentro; aquí se consume y se resetea.
    const sf = this.slowFactor ?? 1;
    this.slowFactor = undefined;
    if (this.stun > 0) this.stun -= dt; // paralizado: no avanza este frame
    else {
      // FASE 58: la velocidad vertical EFFECTIVA (ver effVel) compensa
      // el campo de caída más alto del marco móvil.
      this.y += this.effVel * dt * sf;
      this.x += this.vx * dt * sf;
    }
    // Los JEFES hacen sitio sobre la base (dev-5): asedian a Y fija y
    // merodean lateralmente hasta ser destruidos. NO llegan a la plataforma
    // (evita la "victoria" por suicidio del jefe y su daño masivo de un hit).
    // v3 3e/7: durante la BAJADA el jefe barre lateral (dirección alternada
    // entre bosses, waves.js) en lugar de caer siempre por el mismo X.
    if (this.isBoss) {
      const hoverY = bossHoverY();
      if (this.y > hoverY) this.y = hoverY;
      if (this.y < hoverY) {
        this._sweepAcc = clamp(this._sweepAcc + this._sweepDir * BOSS_SWEEP_SPEED * dt,
          -BOSS_SWEEP_MAX, BOSS_SWEEP_MAX);
      }
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5);
    // Oleadas dinámicas: el flash de la ROTURA del escudo (variante
    // `escudado`) es un destello propio, más corto que el de daño.
    if (this._shieldFlash > 0) this._shieldFlash = Math.max(0, this._shieldFlash - dt * 4);

    // Deriva senoidal / zigzag alrededor del ancla baseX (§2.4).
    // v3 3e/7: el ancla YA NO marcha siempre en +X (eso clavaba al jefe en la
    // misma esquina durante un asedio largo). Ahora el merodeo rebota
    // simétrico alrededor de la X de entrada; en asedio se aplana (±55 de
    // ancla + vaivén ±30) para que el paneo total quede ~±85 px y legible.
    const d = this.data;
    if (d.drift) {
      const siege = this.isBoss && this.y >= bossHoverY();
      const lim = siege ? BOSS_MEANDER : d.drift.amp;
      this._wander += this._wanderDir * d.drift.freq * d.drift.amp * dt * 0.5;
      if (this._wander > lim) { this._wander = lim; this._wanderDir = -1; }
      else if (this._wander < -lim) { this._wander = -lim; this._wanderDir = 1; }
      this.baseX = this.entryX + this._sweepAcc + this._wander;
    }
    if (d.zigzag) {
      this.x = clamp(
        this.baseX + Math.sin(this.t * d.zigzag.freq + this.phase) * d.zigzag.amp,
        12, CONFIG.CANVAS_W - 12,
      );
    } else if (d.drift) {
      const swayAmp = this.isBoss && this.y >= bossHoverY() ? BOSS_SWAY : d.drift.amp;
      this.x = clamp(
        this.baseX + Math.sin(this.t * d.drift.freq + this.phase) * swayAmp,
        this.r + 4, CONFIG.CANVAS_W - this.r - 4,
      );
    }

    // Estela de fuego (meteorito/fragmento/boss; el cristal no tiene)
    if (d.trail1) {
      this._trailAcc += dt;
      while (this._trailAcc >= 1 / 45) {
        this._trailAcc -= 1 / 45;
        const eng = this.game?.engine;
        if (eng) {
          eng.spawnParticles(
            this.x + (Math.random() * 2 - 1) * this.r * 0.5,
            this.y - this.r * 0.5,
            Math.random() < 0.5 ? d.trail1 : (d.trail2 ?? d.trail1),
            2, // dev-6: estela más densa y viva (del diseño base)
            // v3.1: estelas MÁS LARGAS (vida ↑, gravedad ↓) — bullet-hell
            { speedMin: 8, speedMax: 40, gravity: -22,
              lifeMin: 0.35, lifeMax: this.isBoss ? 1.05 : 0.85,
              sizeMin: 1.6, sizeMax: this.isBoss ? 5 : 3.6 },
          );
          // Humo gris tenue intercalado (v3.1): estela con cuerpo, como la
          // referencia (fuego naranja + humo). Presupuesto-guard 330.
          if (Math.random() < 0.3 && eng.particles.length < 330) {
            eng.spawnParticles(
              this.x + (Math.random() * 2 - 1) * this.r * 0.4,
              this.y - this.r * 0.9,
              'rgba(120, 120, 130, 0.5)', 1,
              { speedMin: 5, speedMax: 18, gravity: -12, lifeMin: 0.5, lifeMax: 0.9,
                sizeMin: 2.2, sizeMax: 4 },
            );
          }
        }
      }
    }

    // FASES de jefes (§2.4/§2.9, data-driven): al cruzar cada umbral
    // HP acelera y suelta (shed) o convoca (spawn) acompañantes.
    if (this.isBoss) this._updateBossPhases();
    // dev-7 fase 47: mientras su escolta esté viva, el jefe se regenera.
    if (this.isBoss) this._updateBossRegen(dt);
    // Oleadas dinámicas: la variante `regenerador` se cura MIENTRAS vive
    // (independiente de la regeneración de fase del jefe: conviven).
    if (this._regenFrac) this._updateVariantRegen(dt);
    // fase 68: el `sanador` cura a los ALIADOS del radio (no a sí mismo).
    if (this._healAura) this._updateHealAura(dt);

    // Blob: empuje periódico hacia abajo de las esporas cercanas (§2.4)
    if (d.pushR) {
      this._pushAcc += dt;
      if (this._pushAcc >= 0.5) {
        this._pushAcc = 0;
        for (const e of this.game?.fortress?.enemies || []) {
          if (!e || e === this || e.dead || e.type !== 'spore') continue;
          if (Math.hypot(e.x - this.x, e.y - this.y) <= d.pushR) {
            e.y += d.pushSpeed * 0.5; // medio pulso
          }
        }
      }
    }

    // CONTENCIÓN LATERAL (§2.4): nadie sale del campo por un costado.
    //
    // El FRAGMENTO era el único tipo que se movía en diagonal sin ningún
    // clampeo lateral: nace con `angleDeg: 25` y avanza con `x += vx·dt`, así
    // que en una caída larga recorría ~250 px de costado y el que salía
    // apuntando hacia afuera terminaba fuera del canvas — donde el matado de
    // seguridad de abajo lo borraba SIN fuga y SIN daño (un encuentro que
    // desaparecía del balance sin que nadie lo viera). La deriva y el zigzag
    // ya se clampeaban arriba; esta es la RED GENERAL, y cubre además lo que
    // mueva la X sin pasar por esos clamps (empuje del blob, succión del
    // Black Hole, empujes futuros).
    //
    // Al tocar el lateral se fija en el margen (los MISMOS `r + 4` de la
    // deriva) y se REFLEJA vx en vez de dejarlo pegado al borde: el rastro
    // (estela incandescente, líneas del `rapido`) se calcula desde vx, así
    // que invertido mira hacia adentro y el enemigo vuelve al centro
    // conservando su caída diagonal. La Y no se toca: el rebote es SOLO
    // lateral.
    //
    // Guardas `Number.isFinite`: con una X o una vx corruptas (NaN) no hay
    // nada que contener y no se inventa una coordenada.
    if (Number.isFinite(this.x) && Number.isFinite(this.vx)) {
      const minX = this.r + 4;
      const maxX = CONFIG.CANVAS_W - this.r - 4;
      if (this.x < minX) {
        this.x = minX;
        this.vx = Math.abs(this.vx); // hacia adentro: a la derecha
      } else if (this.x > maxX) {
        this.x = maxX;
        this.vx = -Math.abs(this.vx); // hacia adentro: a la izquierda
      }
    }

    // Impacto contra la plataforma/base (§2.1/§2.4): desde la fase 72 duele
    // el HP MÁXIMO del enemigo (`leakDamageFor`), no el que le quedaba:
    // dejar pasar un tanque maltrecho ya no es gratis y la base cae por
    // daño acumulado, sin la regla del 25 %. Fortress aplica flash + invuln
    // visual (0.4 s); la invuln NO anula el golpe.
    if (this.y >= baseImpactY()) {
      this.explode(); // chispa visual del impacto (la lógica de escudo vive en player.js)
      this.game?.fortress?.takeDamage(leakDamageFor(this));
      this.dead = true;
      this.game?.engine?.emit('enemy:reached', this);
    }
    // Red defensiva: con la contención de arriba (margen `r + 4`) salir del
    // campo por un costado ya NO es alcanzable en condiciones normales: esto
    // sólo puede dispararse con una X corrupta o si algún día un empuje
    // moviera al enemigo más de 60 px en un frame. NO borrar — sin él, un
    // enemigo perdido fuera del canvas quedaría vivo para siempre.
    if (this.x < -60 || this.x > CONFIG.CANVAS_W + 60) this.dead = true; // safety
  }

  /**
   * dev-7 fase 47: la REGENERACIÓN del jefe.
   *
   * Cada fase puede declarar `regen` = la FRACCIÓN de su HP máximo que se
   * regenera por segundo y POR CADA esbirro vivo de su escolta. Así la
   * escolta de élite (los miniBlob/blob, que viven varios segundos) lo
   * cura de verdad y la chaff (esporas/fragmentos, que mueren de un
   * tiro) apenas raspa: el jugador tiene que decidir si limpia la
   * escolta o sigue pegándole al jefe.
   *
   * El tope global evita que una nube de esbirros lo haga inmortal.
   */
  _updateBossRegen(dt) {
    const ph = this._phase;
    if (!ph || !ph.regen || this.dead || this.hp <= 0) return;
    const list = this.game?.fortress?.enemies;
    if (!Array.isArray(list)) return;
    let rate = 0;
    for (const e of list) {
      if (!e || e.dead) continue;
      if (e.escortOf !== this) continue;
      rate += ph.regen;
    }
    if (rate <= 0) return;
    const frac = Math.min(rate, BOSS_REGEN_CAP);
    const heal = this.hpMax * frac * dt;
    if (heal <= 0) return;
    this.hp = Math.min(this.hpMax, this.hp + heal);
    // Feedback: la vida vuelve y el jugador tiene que verlo (un float
    // verde cada 0,4 s, no en cada frame).
    this._regenAcc = (this._regenAcc ?? 0) + dt;
    if (this._regenAcc >= 0.4) {
      this._regenAcc = 0;
      this.game?.engine?.floatText(
        this.x + rand(-10, 10), this.y - this.r - 14,
        `+${Math.round(this.hpMax * frac * 0.4)}`, '#35E08A', 0.9,
      );
    }
  }

  /**
   * Oleadas dinámicas — reparte `n` de daño entre el ESCUDO (variante
   * `escudado`) y el hp.
   *
   * El escudo es lo PRIMERO: mientras le quede pool, el hp no baja. Al
   * llegar a 0 se rompe (`_breakShield`) y no vuelve nunca más (no hay
   * regeneración de escudo: eso lo distingue del `regenerador`, que cura
   * HP). Sin escudo —todo enemigo normal— esto es la resta histórica del
   * hp, sin tope ni clamp: el `hp <= 0` lo resuelve el llamante.
   *
   * fase 68: el `acorazado` suma un segundo paso —`armor` de daño PLANO
   * por golpe— DESPUÉS del escudo (el escudo absorbe el golpe entero: la
   * armadura no lo recorta) y con MÍNIMO 1: ningún golpe se anula del todo,
   * porque la armadura es una contrapartida, no una inmunidad. `opts.armor
   * === false` lo saltea: el VENENO es un DoT por frame y con la armadura
   * encima caería siempre en el mínimo de 1 (un bypass escondido).
   *
   * @param {number} n daño ya multiplicado por la matriz de tipos
   * @param {object} [opts] {armor: false} para saltarse la armadura
   *   (el veneno: es daño continuo, no un golpe)
   * @returns {number} daño EFECTIVO aplicado (escudo + hp), el que se ve
   *   en el float de daño
   */
  _absorbDamage(n, opts = {}) {
    let rest = n;
    let applied = 0;
    if (this.shieldHp > 0 && rest > 0) {
      const absorbed = Math.min(this.shieldHp, rest);
      this.shieldHp -= absorbed;
      rest -= absorbed;
      applied += absorbed;
      if (this.shieldHp <= 0) this._breakShield();
    }
    if (rest > 0 && this.armor > 0 && opts.armor !== false) {
      rest = Math.max(1, rest - this.armor);
    }
    if (rest > 0) {
      this.hp -= rest;
      applied += rest;
    }
    return applied;
  }

  /**
   * Rotura del escudo (`escudado`): pool a 0 para siempre + feedback
   * VISIBLE reusando el lenguaje de `explode()` — esquirlas del color del
   * escudo, un anillo expansivo (`addEffect`) y un flash corto sobre el
   * cuerpo (el dibujo lo pinta en `draw`). Sin engine (tests, iconos) el
   * escudo igual se rompe: los efectos son decorativos.
   */
  _breakShield() {
    this.shieldHp = 0;
    this._shieldFlash = 1;
    const eng = this.game?.engine;
    if (!eng) return;
    const col = VARIANT_COLORS.escudado;
    eng.spawnParticles?.(this.x, this.y, col, 12, {
      speedMin: 50, speedMax: 190, lifeMin: 0.2, lifeMax: 0.5, sizeMin: 1.2, sizeMax: 3,
    });
    const R = this.r;
    eng.addEffect?.({ life: 0.28, draw: (ctx, t) => {
      ctx.save();
      ctx.globalAlpha = t * 0.8;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, R * (0.9 + (1 - t) * 1.1), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } });
  }

  /**
   * Oleadas dinámicas — la REGENERACIÓN de la variante `regenerador`:
   * `regenFrac` de su HP máximo por segundo MIENTRAS vive, con tope en
   * hpMax. Es más lenta que cualquier daño del juego (2 %/s): el
   * contra-juego es enfocarlo, no ignorarlo.
   *
   * No pisa la regeneración del jefe (`_updateBossRegen`): ésa depende de
   * la escolta viva y su tope es `BOSS_REGEN_CAP`; ésta es del enemigo y
   * usa su propio contador (no comparten `_regenAcc`).
   */
  _updateVariantRegen(dt) {
    if (!this._regenFrac || this.dead || this.hp <= 0 || this.hp >= this.hpMax) return;
    this.hp = Math.min(this.hpMax, this.hp + this.hpMax * this._regenFrac * dt);
    // Pulso visible: un +N verde cada 0,4 s (como el del jefe, fase 47).
    this._varRegenAcc += dt;
    if (this._varRegenAcc < 0.4) return;
    this._varRegenAcc = 0;
    this.game?.engine?.floatText?.(
      this.x + rand(-10, 10), this.y - this.r - 14,
      `+${Math.round(this.hpMax * this._regenFrac * 0.4)}`, VARIANT_COLORS.regenerador, 0.9,
    );
  }

  /**
   * fase 68 — el `sanador` cura a los ALIADOS que tiene cerca.
   *
   * Cada `HEAL_TICK` (0,5 s) recorre la lista viva y cura a los enemigos
   * dentro del radio (110 px) que estén por debajo de su máximo:
   * `min(faltante, hpMax · fracPerSec · tick)`. Nunca a sí mismo y nunca
   * por encima del máximo del aliado.
   *
   * El aura no apila "sin control": cada sanador cura SU fracción y el tope
   * es el HP máximo del curado, así dos sanadores sobre el mismo aliado
   * curan el doble pero no lo hacen inmortal ni lo sobre-curan. El coste es
   * O(aliados) por sanador y sólo cada 0,5 s (no por frame).
   */
  _updateHealAura(dt) {
    const aura = this._healAura;
    if (!aura || this.dead || this.hp <= 0) return;
    this._healAcc += dt;
    if (this._healAcc < HEAL_TICK) return;
    // Un tick por update, no una ráfaga de ticks atrasados: tras un parón
    // largo el aura cura UNA vez y vuelve a contar (nunca una cura masiva).
    this._healAcc = 0;
    const list = this.game?.fortress?.enemies;
    if (!Array.isArray(list)) return;
    const eng = this.game?.engine;
    for (const e of list) {
      if (!e || e === this || e.dead || !(e.hp < e.hpMax)) continue;
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > aura.radius) continue;
      const heal = Math.min(e.hpMax - e.hp, e.hpMax * aura.fracPerSec * HEAL_TICK);
      if (!(heal > 0)) continue;
      e.hp = Math.min(e.hpMax, e.hp + heal);
      // Feedback tenue sobre el aliado curado (no sobre el sanador): así se
      // lee QUIÉN recibe la vida y de dónde viene el vínculo del aura.
      eng?.floatText?.(e.x + rand(-6, 6), e.y - e.r - 10, `+${Math.round(heal)}`,
        VARIANT_COLORS.sanador, 0.7);
    }
  }

  /**
   * dev-7 fase 47: la regla de la FASE actual sobre el tipo de daño.
   *
   * Una fase puede declarar `weakTo` (un tipo de daño que le hace ×1,5) y
   * `resist` (otro que le hace ×0,5): el jugador tiene que haber
   * mejorado la torreta del tipo bueno, porque en la fase mala la otra no
   * le hace casi nada. Se multiplica con la matriz de tipos (familia) en
   * `takeDamage`, que es el único punto donde se aplica el daño.
   *
   * @param {string} type id del tipo de daño ('light' | 'ballistic' | …)
   * @returns {number} 1.5 / 0.5 / 1
   */
  _phaseTypeMul(type) {
    const ph = this._phase;
    if (!ph || !type) return 1;
    if (ph.weakTo && ph.weakTo === type) return 1.5;
    if (ph.resist && ph.resist === type) return 0.5;
    return 1;
  }

  /**
   * Fases de jefes data-driven (§2.9): recorre `phases[]` en orden y
   * dispara cada umbral HP una sola vez. Compatibilidad: el jefe del
   * Stage 1 conserva sus campos planos phaseHpFrac/phaseVelMul/
   * phaseShedCount (2 fases, §2.4).
   *
   * dev-7 fase 47: cada fase puede declarar además `name` (el rótulo
   * del aviso), `weakTo`/`resist` (el tipo de daño que le hace más o
   * menos) y `regen` (la regeneración por escolta). El jefe del stage 1
   * NO los declara: sigue siendo el jefe sencillo de la primera partida.
   */
  _updateBossPhases() {
    const d = this.data;
    if (!this._phaseList) {
      // Se arma UNA vez: lista canónica de umbrales {atFrac, velMul, shed, spawn}
      if (Array.isArray(d.phases)) {
        this._phaseList = d.phases;
      } else if (d.phaseHpFrac !== undefined) {
        this._phaseList = [{
          atFrac: d.phaseHpFrac, velMul: d.phaseVelMul ?? 1.4,
          shed: { type: 'fragment', count: d.phaseShedCount ?? 6 },
        }];
      } else {
        this._phaseList = [];
      }
    }
    while (this._phaseIdx < this._phaseList.length
      && this.hp <= this.hpMax * this._phaseList[this._phaseIdx].atFrac) {
      const ph = this._phaseList[this._phaseIdx];
      this._phaseIdx += 1;
      this.vel *= ph.velMul ?? 1;
      // dev-7 fase 47: la fase vigente (la regla de tipo y la
      // regeneración la leen de aquí).
      this._phase = ph;
      this.game?.engine?.emit('boss:phase2', this); // nombre canónico dev-3
      this._summon(ph.shed, true);
      this._summon(ph.spawn, false);
    }
  }

  /** Crea acompañantes a la altura del jefe y los anota en la lista viva. */
  _summon(spec, diagonal = false) {
    if (!spec || !this.game) return;
    const list = this.game?.fortress?.enemies;
    if (!list) return;
    for (let i = 0; i < (spec.count ?? 1); i++) {
      const fx = clamp(
        this.x + (i - ((spec.count ?? 1) - 1) / 2) * 34,
        30, CONFIG.CANVAS_W - 30,
      );
      const e = new Enemy(spec.type, fx, { game: this.game, y: this.y });
      if (diagonal) e.phase = Math.random() * Math.PI * 2; // entradas variadas
      // dev-7 fase 47: el esbirro queda marcado como escolta de ESTE
      // jefe: mientras viva, lo regenera (ver _updateBossRegen).
      e.escortOf = this;
      this.game.engine.addEntity(e);
      list.push(e);
    }
  }

  /**
   * T1 — Estela incandescente: 3 "cromas" hacia atrás calculadas con la
   * posición y la velocidad ACTUALES. NO guarda historial (ni arrays ni
   * basura por frame): el rastro se deriva del estado presente. El paso se
   * mide en RADIOS para que se lea igual en un fragmento y en un jefe.
   */
  _drawTrail(ctx) {
    const col = incandColor(this.data);
    if (!col || this.stun > 0) return; // congelado: no hay estela
    // FASE 58: la dirección de la estela usa la velocidad EFECTIVA (la
    // que de verdad mueve al enemigo).
    const speed = Math.hypot(this.vx, this.effVel);
    if (speed < 1e-3) return;
    const ux = this.vx / speed; // dirección de la caída (el rastro va detrás)
    const uy = this.effVel / speed;
    const step = Math.min(this.r * TRAIL_STEP, TRAIL_STEP_MAX);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = col;
    for (let i = 1; i <= TRAIL_GHOSTS; i++) {
      const back = step * i;
      ctx.globalAlpha = TRAIL_ALPHA * (1 - (i - 1) / TRAIL_GHOSTS);
      ctx.beginPath();
      ctx.arc(this.x - ux * back, this.y - uy * back,
        this.r * (0.7 - 0.1 * (i - 1)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * T3 — Presencia del jefe: halo pulsante del color del jefe (radio ~1.6×
   * su tamaño) + anillo de aviso (arco giratorio tipo radar). Sólo para los
   * jefes (data.boss): los sub-jefes (miniBlob) NO lo llevan.
   */
  /**
   * Veneno activo (fase 30): tinte verde + burbujas.
   * El jugador tiene que ver que el enemigo está envenenado: es lo que
   * explica que siga perdiendo vida sin que nadie lo golpee.
   */
  _drawPoison(ctx) {
    const p = 0.5 + 0.5 * Math.sin(this.t * 5 + this.phase);
    ctx.save();
    // Tinte verde (aditivo): la superficie del enemigo se vuelve ácida.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16 + 0.08 * p;
    ctx.fillStyle = '#6BFF5A';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 0.92, 0, Math.PI * 2);
    ctx.fill();
    // Burbujas: 3 motas que suben, sin estado por frame.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#9CFF7A';
    for (let i = 0; i < 3; i++) {
      const a = this.t * 1.6 + this.phase + i * 2.1;
      const bx = this.x + Math.cos(a) * this.r * 0.7;
      const by = this.y - ((this.t * 26 + i * 9) % (this.r * 2));
      ctx.beginPath();
      ctx.arc(bx, by, 1.6 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawBossAura(ctx) {
    const d = this.data;
    const col = d.glow ?? d.trail1 ?? '#FF9A3D';
    const p = 0.5 + 0.5 * Math.sin(this.t * 2.2 + this.phase);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Halo pulsante (caída suave: un disco plano se leería como un círculo
    // duro pegado al jefe). 1 gradiente por frame y sólo para el jefe.
    const haloR = this.r * (1.6 + 0.06 * p);
    const g = ctx.createRadialGradient(this.x, this.y, this.r * 0.5, this.x, this.y, haloR);
    g.addColorStop(0, withAlpha(col, 0.26 + 0.1 * p));
    g.addColorStop(0.55, withAlpha(col, 0.12 + 0.05 * p));
    g.addColorStop(1, withAlpha(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, haloR, 0, Math.PI * 2);
    ctx.fill();
    // Anillo de aviso
    ctx.globalAlpha = 0.22 + 0.16 * p;
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 1.28, this.t * 1.2, this.t * 1.2 + Math.PI * 0.7);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Rasgo del `escudado`: el escudo SE VE.
   *
   * Dos lecturas en una sola forma: una CRESTA frontal (el arco de abajo,
   * el lado que da a la base) que dice "esto está protegido", y un ANILLO
   * de integridad que se acorta con el pool restante — el jugador ve
   * cuánto le queda sin números. Con `shieldHp` en 0 (roto) no dibuja
   * nada: nunca vuelve.
   */
  _drawShieldRing(ctx) {
    if (this.shieldMax <= 0 || this.shieldHp <= 0) return;
    const frac = clamp(this.shieldHp / this.shieldMax, 0, 1);
    const p = 0.5 + 0.5 * Math.sin(this.t * 3 + this.phase);
    const col = VARIANT_COLORS.escudado;
    const R = this.r * 1.3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    // Cresta frontal (mitad inferior: el enemigo cae hacia la base).
    ctx.globalAlpha = 0.42 + 0.3 * p;
    ctx.lineWidth = Math.max(2, this.r * 0.18);
    ctx.beginPath();
    ctx.arc(this.x, this.y, R, Math.PI * 0.12, Math.PI * 0.88);
    ctx.stroke();
    // Anillo de integridad: arco proporcional al pool que le queda.
    ctx.globalAlpha = 0.3 + 0.4 * frac;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(this.x, this.y, R * 1.16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Rasgo del `rapido` (Veloz): líneas de velocidad hacia atrás, derivadas
   * de la posición y la velocidad ACTUALES (sin historial, igual que
   * `_drawTrail`). Va aparte de la estela incandescente porque el veloz
   * puede ser un tipo SIN estela de fuego (espora, blob).
   */
  _drawSpeedStreaks(ctx) {
    const speed = Math.hypot(this.vx, this.effVel);
    if (speed < 1e-3) return; // quieto (stun, slow a 0): no hay rastro
    const ux = this.vx / speed;
    const uy = this.effVel / speed;
    const p = 0.5 + 0.5 * Math.sin(this.t * 12 + this.phase);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = VARIANT_COLORS.rapido;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const back = this.r * (1.6 + i * 0.7 + 0.5 * p);
      const side = (i - 1) * this.r * 0.55;
      // Paralela a la caída y desplazada al costado: el rastro va DETRÁS
      // (por encima, ya que el enemigo cae).
      const x0 = this.x - ux * back - uy * side;
      const y0 = this.y - uy * back + ux * side;
      ctx.globalAlpha = 0.4 - i * 0.1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 - ux * this.r * 1.3, y0 - uy * this.r * 1.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Rasgo del `regenerador`: aura verde pulsante + motas que suben (el
   * pulso de vida). El aura va SIEMPRE encendida —es lo que lo hace
   * legible a simple vista—; los números de la cura los pone el float de
   * `_updateVariantRegen` sólo cuando de verdad se está curando.
   */
  _drawRegenAura(ctx) {
    const p = 0.5 + 0.5 * Math.sin(this.t * 2.6 + this.phase);
    const col = VARIANT_COLORS.regenerador;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.16 + 0.12 * p;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * (1.32 + 0.1 * p), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 3; i++) {
      const bx = this.x + Math.cos(this.t * 1.4 + this.phase + i * 2.1) * this.r * 0.8;
      const by = this.y - ((this.t * 22 + i * 7) % (this.r * 2.2));
      ctx.beginPath();
      ctx.arc(bx, by, 1.4 + (i % 2) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * fase 68 — rasgo del `acorazado`: tres PLACAS de acero superpuestas sobre
   * la mitad que da a la base (la que recibe el fuego) + sus remaches. Se
   * lee como blindaje: el jugador entiende que los golpes chicos no entran
   * sin necesidad de un tooltip.
   */
  _drawArmorPlates(ctx) {
    const col = VARIANT_COLORS.acorazado;
    const p = 0.5 + 0.5 * Math.sin(this.t * 2.2 + this.phase);
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const R = this.r * (0.78 + i * 0.22); // hasta 1,22 radios: dentro de la caja del icono
      ctx.globalAlpha = 0.5 - i * 0.11;
      ctx.lineWidth = Math.max(1.4, this.r * (0.18 - i * 0.03));
      ctx.beginPath();
      ctx.arc(this.x, this.y, R, Math.PI * (0.16 + i * 0.04), Math.PI * (0.84 - i * 0.04));
      ctx.stroke();
    }
    // Remaches de la placa exterior (dos puntos, sin arte nuevo).
    ctx.globalAlpha = 0.35 + 0.15 * p;
    for (let i = 0; i < 2; i++) {
      const a = Math.PI * (0.3 + i * 0.4);
      ctx.beginPath();
      ctx.arc(this.x + Math.cos(a) * this.r * 1.22, this.y + Math.sin(a) * this.r * 1.22,
        Math.max(1, this.r * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * fase 68 — rasgo del `tenaz`: dos cadenas rojas cruzadas sobre el cuerpo
   * con sus eslabones. Es la lectura de "no se lo puede atar": el stun y el
   * slow rebotan, el ancla se ve pero está rota.
   */
  _drawTenzChains(ctx) {
    const col = VARIANT_COLORS.tenaz;
    const p = 0.5 + 0.5 * Math.sin(this.t * 4.2 + this.phase);
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, this.r * 0.1);
    for (let i = 0; i < 2; i++) {
      const dir = i === 0 ? 1 : -1;
      // Arco que cruza el cuerpo en diagonal (una cadena por lado).
      ctx.globalAlpha = 0.34 + 0.18 * p;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * (0.62 + 0.08 * p),
        dir > 0 ? Math.PI * 0.15 : Math.PI * 1.15, dir > 0 ? Math.PI * 0.85 : Math.PI * 1.85);
      ctx.stroke();
      // Eslabones: dos trazos cortos sobre el arco.
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = Math.max(1, this.r * 0.07);
      for (let k = 0; k < 2; k++) {
        const a = Math.PI * (0.32 + k * 0.22) + (dir > 0 ? 0 : Math.PI);
        const cx = this.x + Math.cos(a) * this.r * 0.66;
        const cy = this.y + Math.sin(a) * this.r * 0.66;
        ctx.beginPath();
        ctx.moveTo(cx - this.r * 0.1, cy);
        ctx.lineTo(cx + this.r * 0.1, cy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * fase 68 — rasgo del `divisor`: dos LÓBULOS violetas que laten juntos,
   * como una célula a punto de partirse. Con el pulso el jugador ve que ese
   * enemigo todavía va a dar trabajo cuando muera.
   */
  _drawSplitPulse(ctx) {
    const col = VARIANT_COLORS.divisor;
    const p = 0.5 + 0.5 * Math.sin(this.t * 3.2 + this.phase);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.2, this.r * 0.12);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      ctx.globalAlpha = 0.24 + 0.2 * p;
      ctx.beginPath();
      ctx.arc(this.x + side * this.r * (0.4 + 0.1 * p), this.y, this.r * (0.5 + 0.08 * p),
        0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * fase 68 — rasgo del `sanador`: aura turquesa SIEMPRE visible (para
   * distinguirlo del `regenerador`, que es verde y se cura a sí mismo) y un
   * VÍNCULO tenue con cada aliado herido dentro del radio: el jugador ve de
   * quién es la culpa de que ese grupo no caiga.
   */
  _drawHealAura(ctx) {
    const aura = this._healAura;
    if (!aura) return;
    const col = VARIANT_COLORS.sanador;
    const p = 0.5 + 0.5 * Math.sin(this.t * 2.4 + this.phase);
    ctx.save();
    ctx.strokeStyle = col;
    ctx.globalCompositeOperation = 'lighter';
    // Aura propia (dentro de la caja del icono: 1,6 radios).
    ctx.globalAlpha = 0.14 + 0.1 * p;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * (1.36 + 0.14 * p), 0, Math.PI * 2);
    ctx.stroke();
    // Vínculos: sólo a los aliados HERIDOS del radio (los sanos no se curan).
    const list = this.game?.fortress?.enemies;
    if (!Array.isArray(list)) {
      ctx.restore();
      return;
    }
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.1 + 0.08 * p;
    for (const e of list) {
      if (!e || e === this || e.dead) continue;
      if (!(e.hp < e.hpMax)) continue;
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > aura.radius) continue;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  draw(ctx) {
    const d = this.data;
    ctx.save();

    // Barra de HP sobre enemigos GRANDES (blob/boss; jefes completos dev-5)
    const showBar = this.r >= 20;
    if (showBar) {
      const w = this.r * 1.6;
      const frac = clamp(this.hp / this.hpMax, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(this.x - w / 2, this.y - this.r - 12, w, 4);
      ctx.fillStyle = '#FF5555';
      ctx.fillRect(this.x - w / 2, this.y - this.r - 12, w * frac, 4);
    }

    // --- T2: PELIGRO por proximidad (PASE PURO de lectura) --------------
    // Sale de la Y REAL del enemigo: 0 en el spawn, 1 en la base. No toca
    // hp, daño, colisión ni el tiempo de llegada. El jefe hace sitio en
    // BOSS_HOVER_Y: su "base" es esa línea, no BASE_Y.
    const baseRef = this.isBoss ? bossHoverY() : baseImpactY();
    const threat = threatPulse(threatFactor(this.y, baseRef, THREAT_SPAWN_Y));

    // --- T1: estela incandescente (cromas hacia atrás, SIN historial) ---
    this._drawTrail(ctx);

    // --- Oleadas dinámicas: rasgo de las VARIANTES de élite (spec "Variantes
    // legibles"): escudo, líneas de velocidad o pulso de vida. Es un pase de
    // LECTURA como los de arriba — no toca hp, daño, colisión ni llegada.
    // fase 68: `variants[]` — con doble afijo se dibujan LOS DOS rasgos.
    for (const id of this.variants) {
      if (id === 'escudado') this._drawShieldRing(ctx);
      else if (id === 'rapido') this._drawSpeedStreaks(ctx);
      else if (id === 'regenerador') this._drawRegenAura(ctx);
      else if (id === 'acorazado') this._drawArmorPlates(ctx);
      else if (id === 'tenaz') this._drawTenzChains(ctx);
      else if (id === 'divisor') this._drawSplitPulse(ctx);
      else if (id === 'sanador') this._drawHealAura(ctx);
    }

    // --- T3: el jefe se siente grande: halo + anillo de aviso ----------
    if (this.isBoss) this._drawBossAura(ctx);

    // dev-7 fase 30: VENENO activo (picadura del Dron Avispas). Un tinte
    // verde + burbujas: el jugador tiene que VER que el enemigo está
    // envenenado (y que por eso sigue perdiendo vida).
    if ((this.poisonT ?? 0) > 0) this._drawPoison(ctx);

    // Estela de fuego DIBUJADA (dev-6): teardrop cálido tras la roca, visible
    // en el render aunque no haya partículas — fiel a los meteoros del diseño base.
    if (d.trail1 && this.vel > 20) {
      const w = this.r * 0.75;
      const len = this.r * (1.7 + 0.35 * Math.sin(this.t * 13 + this.phase));
      const tipY = this.y - len; // arriba (opuesto a la caída)
      const gr = ctx.createLinearGradient(0, this.y, 0, tipY);
      gr.addColorStop(0, d.trail1);
      gr.addColorStop(0.55, d.trail2 ?? d.trail1);
      gr.addColorStop(1, 'rgba(255, 150, 40, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(this.x - w * 0.5, this.y);
      ctx.quadraticCurveTo(this.x - w * 0.22, (this.y + tipY) * 0.55, this.x, tipY);
      ctx.quadraticCurveTo(this.x + w * 0.22, (this.y + tipY) * 0.55, this.x + w * 0.5, this.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Clave de render: los jefes nuevos reutilizan la silueta del
    // tipo indicado en data.visual (blob/meteor/armored).
    const visKey = this.data.boss ? (this.data.visual ?? 'boss') : this.type;
    // --- T2: leve pulso de escala (±4 %) al acercarse a la base ---------
    const scale = 1 + 0.04 * Math.sin(this.t * 6 + this.phase) * threat;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(scale, scale);
    ctx.translate(-this.x, -this.y);
    ctx.save();
    switch (visKey) {
      case 'crystal': { // diamante #E01818 con brillo #FFD0D0 y estela propia
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.sin(this.t * 1.5 + this.phase) * 0.2);
        const r = this.r;
        // Estética v3 4/7 (diseño base): halo pulsante que hace a la gema
        // "brillante" incluso sobre el fondo cálido del volcán.
        ctx.globalCompositeOperation = 'lighter';
        const haloR = r * (1.9 + 0.22 * Math.sin(this.t * 4 + this.phase));
        const gemHalo = ctx.createRadialGradient(0, 0, 0, 0, 0, haloR);
        gemHalo.addColorStop(0, 'rgba(255, 90, 90, 0.34)');
        gemHalo.addColorStop(0.6, 'rgba(224, 24, 24, 0.16)');
        gemHalo.addColorStop(1, 'rgba(224, 24, 24, 0)');
        ctx.fillStyle = gemHalo;
        ctx.beginPath();
        ctx.arc(0, 0, haloR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        // Halo BRILLANTE reforzado (estética v3.1): la gema "arde" como en
        // la referencia (brillo #FFD0D0 marcado alrededor del diamante).
        ctx.globalCompositeOperation = 'lighter';
        const haloR2 = r * (2.15 + 0.25 * Math.sin(this.t * 4 + this.phase));
        const gemHalo2 = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, haloR2);
        gemHalo2.addColorStop(0, 'rgba(255, 208, 208, 0.28)');
        gemHalo2.addColorStop(0.65, 'rgba(255, 48, 48, 0.13)');
        gemHalo2.addColorStop(1, 'rgba(255, 48, 48, 0)');
        ctx.fillStyle = gemHalo2;
        ctx.beginPath();
        ctx.arc(0, 0, haloR2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowColor = d.shine;
        ctx.shadowBlur = 12;
        ctx.fillStyle = d.body;
        ctx.beginPath();
        ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = d.shine;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#FFECEC';
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.28, 0); ctx.lineTo(0, r * 0.2); ctx.lineTo(-r * 0.28, 0);
        ctx.closePath();
        ctx.fill();
        // Núcleo AMARILLO brillante (dev-6): "gema roja brillante con centro
        // amarillo" del diseño base, con glow y destello en la punta.
        ctx.shadowColor = '#FFD24A';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#FFD24A';
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.30); ctx.lineTo(r * 0.14, 0); ctx.lineTo(0, r * 0.12); ctx.lineTo(-r * 0.14, 0);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.72); ctx.lineTo(0, -r * 0.42);
        ctx.moveTo(-r * 0.12, -r * 0.57); ctx.lineTo(r * 0.12, -r * 0.57);
        ctx.stroke();
        break;
      }
      case 'spore': { // bolita negra con púas + puntos rosados
        ctx.translate(this.x, this.y);
        ctx.rotate(this.t * 2 + this.phase);
        ctx.fillStyle = d.body;
        ctx.beginPath();
        ctx.arc(0, 0, this.r * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = d.spike;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 * i) / 6;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * this.r * 0.8, Math.sin(a) * this.r * 0.8);
          ctx.lineTo(Math.cos(a) * this.r * 1.25, Math.sin(a) * this.r * 1.25);
          ctx.stroke();
        }
        ctx.fillStyle = d.dots;
        for (let i = 0; i < 3; i++) {
          const a = (Math.PI * 2 * i) / 3;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * this.r * 0.35, Math.sin(a) * this.r * 0.35, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
        // Cara ENCENDIDA blanco-amarilla (dev-6): cejas V enojadas, ojos con
        // pupila, boca fruncida — orbe negro con cara gruñona.
        const r = this.r;
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(1, r * 0.09);
        ctx.lineCap = 'round';
        // Cejas en V (enojo)
        ctx.beginPath();
        ctx.moveTo(-r * 0.36, -r * 0.34); ctx.lineTo(-r * 0.13, -r * 0.20);
        ctx.moveTo(r * 0.36, -r * 0.34); ctx.lineTo(r * 0.13, -r * 0.20);
        ctx.stroke();
        // Ojos blancos + pupilas
        ctx.beginPath();
        ctx.arc(-r * 0.24, -r * 0.10, r * 0.13, 0, Math.PI * 2);
        ctx.arc(r * 0.24, -r * 0.10, r * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#141014';
        ctx.beginPath();
        ctx.arc(-r * 0.26, -r * 0.08, r * 0.06, 0, Math.PI * 2);
        ctx.arc(r * 0.22, -r * 0.08, r * 0.06, 0, Math.PI * 2);
        ctx.fill();
        // Boca fruncida (arco ∩: comisuras abajo, centro arriba)
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(1, r * 0.08);
        ctx.beginPath();
        ctx.arc(0, r * 0.14, r * 0.15, 0, Math.PI, true);
        ctx.stroke();
        break;
      }
      case 'blob': { // masa roja/negra con protuberancias pulsantes
        ctx.translate(this.x, this.y);
        const pulse = 1 + 0.06 * Math.sin(this.t * 4 + this.phase);
        ctx.shadowColor = d.body;
        ctx.shadowBlur = 14;
        ctx.fillStyle = d.dark;
        ctx.beginPath();
        ctx.arc(0, 0, this.r * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Parches ROJOS internos brillantes (v3.1, boss Stage 10): venas
        // internas del virus visibles bajo la piel oscura.
        for (let i = 0; i < 3; i++) {
          const a = (Math.PI * 2 * i) / 3 + this.t * 0.35 + this.phase;
          ctx.globalAlpha = 0.55 + 0.30 * Math.sin(this.t * 3 + i * 2);
          ctx.fillStyle = d.body ?? '#C81E1E';
          ctx.beginPath();
          ctx.arc(Math.cos(a) * this.r * 0.34, Math.sin(a) * this.r * 0.34,
            this.r * 0.20, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Protuberancias bulbosas periféricas (v3.1): bultos que respiran.
        ctx.fillStyle = d.dark ?? '#3A0C0C';
        for (let i = 0; i < 7; i++) {
          const a = (Math.PI * 2 * i) / 7 + this.phase;
          const rr = this.r * (0.16 + 0.06 * Math.sin(this.t * 2.6 + i * 1.9));
          ctx.beginPath();
          ctx.arc(Math.cos(a) * this.r * pulse * 0.86,
            Math.sin(a) * this.r * pulse * 0.86, rr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = d.body;
        for (let i = 0; i < 5; i++) {
          const a = (Math.PI * 2 * i) / 5 + this.t * 0.6;
          const rr = this.r * (0.32 + 0.1 * Math.sin(this.t * 3 + i * 1.7));
          ctx.beginPath();
          ctx.arc(Math.cos(a) * this.r * 0.55, Math.sin(a) * this.r * 0.55, rr, 0, Math.PI * 2);
          ctx.fill();
        }
        // CÚMULO DE OJOS blancos con pupila roja (v3.1, boss Stage 10).
        const rE = Math.max(9, this.r * 0.42);
        const eyeA = this.t * 0.5 + this.phase;
        for (let i = 0; i < 5; i++) {
          const a = eyeA + (Math.PI * 2 * i) / 5;
          const ex = Math.cos(a) * rE * (i === 0 ? 0 : 0.62);
          const ey = Math.sin(a) * rE * (i === 0 ? 0 : 0.62);
          const er = i === 0 ? rE * 0.46 : rE * 0.24; // ojo central dominante
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(ex, ey, er, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#E01818';
          ctx.beginPath();
          ctx.arc(ex, ey, er * 0.42, 0, Math.PI * 2);
          ctx.fill();
        }
        // TENTÁCULOS cortos ondulantes en la base del blob (v3.1).
        ctx.strokeStyle = d.dark ?? '#3A0C0C';
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2, this.r * 0.09);
        for (let i = 0; i < 5; i++) {
          const a = Math.PI / 2 + ((i - 2) * 0.38); // abanico hacia abajo
          const sw = Math.sin(this.t * 3.2 + i * 1.4) * 0.16;
          const bx = Math.cos(a) * this.r * 0.9;
          const by = Math.sin(a) * this.r * 0.9;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(
            bx + Math.cos(a + sw) * this.r * 0.5,
            by + Math.sin(a + sw) * this.r * 0.5,
            bx + Math.cos(a + sw * 2) * this.r * 0.95,
            by + Math.sin(a + sw * 2) * this.r * 0.95,
          );
          ctx.stroke();
        }
        break;
      }
      case 'armored': { // masa blindada: placas grises + núcleo brillante
        ctx.translate(this.x, this.y);
        ctx.rotate(this.t * 0.2);
        const pulseA = 1 + 0.04 * Math.sin(this.t * 3 + this.phase);
        ctx.shadowColor = d.glow;
        ctx.shadowBlur = 16;
        ctx.fillStyle = d.dark;
        tracePoly(ctx, this.poly, this.r * pulseA);
        ctx.fill();
        ctx.strokeStyle = d.body;
        ctx.lineWidth = 5; // placas de blindaje
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = d.glow;
        ctx.globalAlpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.t * 4 + this.phase));
        ctx.beginPath();
        ctx.arc(0, 0, this.r * 0.3, 0, Math.PI * 2); // núcleo pulsante
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'boss': { // meteorito GIGANTE con grietas incandescentes + estela masiva
        ctx.translate(this.x, this.y);
        ctx.rotate(this.t * 0.15);
        ctx.shadowColor = d.glow;
        ctx.shadowBlur = 26;
        ctx.fillStyle = d.body;
        tracePoly(ctx, this.poly, this.r);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineCap = 'round';
        ctx.strokeStyle = d.crack;
        ctx.shadowColor = d.crack;
        ctx.shadowBlur = 10;
        ctx.globalAlpha = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(this.t * 3));
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 5; i++) {
          const a = (Math.PI * 2 * i) / 5 + this.phase;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * this.r * 0.15, Math.sin(a) * this.r * 0.15);
          ctx.lineTo(Math.cos(a + 0.5) * this.r * 0.75, Math.sin(a + 0.5) * this.r * 0.75);
          ctx.stroke();
        }
        break;
      }
      default: { // meteorito / fragmento: polígono irregular + cráteres/grietas blancas
        ctx.translate(this.x, this.y);
        ctx.rotate(this.t * (this.type === 'fragment' ? 1.6 : 0.5) + this.phase);
        ctx.fillStyle = d.body;
        tracePoly(ctx, this.poly, this.r);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (this.type === 'meteor') { // 2–3 cráteres blancos + calavera (dev-6)
          // Cráteres blancos (§4.2) — marcas de roca espacial
          ctx.fillStyle = d.crater;
          ctx.globalAlpha = 0.85;
          for (let i = 0; i < 3; i++) {
            const a = (Math.PI * 2 * i) / 3 + this.phase;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * this.r * 0.4, Math.sin(a) * this.r * 0.4,
              this.r * 0.14, 0, Math.PI * 2);
            ctx.fill();
          }
          // Calavera blanca motívica (rocas con calavera): ojos + orificio
          // nasal + boca con diente. Se mantiene al rotar (cara "viva").
          const s = this.r / 16; // escala relativa al radio
          ctx.fillStyle = 'rgba(235, 248, 255, 0.92)';
          ctx.beginPath();
          ctx.arc(-4.4 * s, -1.5 * s, 3.4 * s, 0, Math.PI * 2);
          ctx.arc(4.4 * s, -1.5 * s, 3.4 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(10, 10, 10, 0.95)';
          ctx.beginPath();
          ctx.arc(-4.4 * s, -1.5 * s, 1.7 * s, 0, Math.PI * 2);
          ctx.arc(4.4 * s, -1.5 * s, 1.7 * s, 0, Math.PI * 2);
          ctx.fill();
          // Orificio nasal (triángulo invertido)
          ctx.fillStyle = 'rgba(235, 248, 255, 0.85)';
          ctx.beginPath();
          ctx.moveTo(-1.6 * s, 1.2 * s);
          ctx.lineTo(1.6 * s, 1.2 * s);
          ctx.lineTo(0, 3.2 * s);
          ctx.closePath();
          ctx.fill();
          // Boca: barra con un diente central
          ctx.fillRect(-4.4 * s, 3.8 * s, 8.8 * s, 2.6 * s);
          ctx.fillStyle = 'rgba(10, 10, 10, 0.85)';
          ctx.fillRect(-0.8 * s, 3.8 * s, 1.6 * s, 3.4 * s);
          ctx.globalAlpha = 1;
        } else { // fragmento: grietas blancas
          ctx.strokeStyle = d.crack;
          ctx.lineWidth = 1;
          for (let i = 0; i < 2; i++) {
            const a = (Math.PI * i) + this.phase;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * this.r * 0.7, Math.sin(a) * this.r * 0.7);
            ctx.lineTo(-Math.cos(a) * this.r * 0.5, -Math.sin(a) * this.r * 0.5);
            ctx.stroke();
          }
        }
        break;
      }
    }

    // --- T2: realce del núcleo incandescente (alfa +0.15 en zona caliente)
    // El centro local (0,0) es el centro del enemigo: el translate del
    // caso sigue vivo, así que el realce cae justo sobre el núcleo.
    if (threat > 0) {
      const col = incandColor(d);
      if (col) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.15 * threat;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(0, 0, this.r * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Destello blanco al recibir daño (D1)
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash * 0.75;
      ctx.fillStyle = '#FFFFFF';
      tracePoly(ctx, this.poly, this.r * 1.05);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // dev-7 fase 32: el destello de impacto toma el color del TIPO de
    // daño (y es más fuerte si fue una fortaleza): el jugador ve de un
    // vistazo si su torre pegó donde debía.
    if (this._hitT > 0 && this._hitColor) {
      ctx.globalAlpha = Math.min(1, this._hitT / 0.16) * (this._hitWeak ? 0.55 : 0.32);
      ctx.fillStyle = this._hitColor;
      tracePoly(ctx, this.poly, this.r * (this._hitWeak ? 1.22 : 1.12));
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Oleadas dinámicas: el flash de la ROTURA del escudo (variante
    // `escudado`) — el mismo lenguaje del destello de daño, con el color
    // del escudo.
    if (this._shieldFlash > 0) {
      ctx.globalAlpha = this._shieldFlash * 0.6;
      ctx.fillStyle = VARIANT_COLORS.escudado;
      tracePoly(ctx, this.poly, this.r * 1.15);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore(); // fin de la silueta
    ctx.restore(); // fin del pulso de escala
    ctx.restore(); // fin de draw()
  }
}

// ------------------------------------------------------------
// Colisiones proyectil↔enemigo (dev-3, tarea 3 de la card)
// ------------------------------------------------------------

/** Radio efectivo de un proyectil (towers.js no expone uno). */
export function projectileRadius(p) {
  if (typeof p.splashR === 'number') return p.splashR;      // HomingMissile (área)
  if (typeof p.radius === 'number') return p.radius;         // Bullet con radio explícito (Gauss)
  return p.damage != null && p.color ? 4 : 6;               // Bullet vs genérico
}

/** Daño crítico propio de un proyectil (perks sistemáticos, fase 17):
 *  critChance × critMul, compuesto SOLO en el proyectil (el bonus global
 *  del meta es aparte). Sin critChance → daño tal cual. */
function rollProjectileCrit(p) {
  const chance = p.critChance ?? 0;
  if (chance <= 0) return p.damage;
  return Math.random() < chance ? Math.round(p.damage * (p.critMul ?? 2)) : p.damage;
}

/** Debuffs de impacto de un proyectil (perks sistemáticos, fase 17):
 *  slowOnHit como slowFactor visual/existente del enemigo (nunca sube el
 *  slow actual) y stunChance con una base de 0.5 s (piso sobre el stun
 *  previo). Sin claves → no toca nada (comportamiento histórico). */
function applyProjectileDebuffs(p, e) {
  if ((p.slowOnHit ?? 0) > 0 && typeof e.slowFactor === 'number') {
    e.slowFactor = Math.min(e.slowFactor ?? 1, 1 - p.slowOnHit);
  }
  if ((p.stunChance ?? 0) > 0 && typeof e.stun === 'number' && Math.random() < p.stunChance) {
    e.stun = Math.max(e.stun ?? 0, 0.5);
  }
}

/** dev-7 fase 25: señal visible/sonora cuando se activa un perk raro
 *  (remate / explosión al matar). Texto flotante + evento 'perk:proc' que
 *  main.js traduce a sonido (las torres no importan audio). Limitado a
 *  1 señal cada 0.15 s por tipo para no saturar pantalla ni audio.
 *  dev-7 fase 26: la implementación vive en perks.js (antes estaba
 *  COPIADA acá y en towers.js — dos copias que podían divergir). */

/** Golpe de un proyectil sobre un enemigo, con las 3 mecánicas nuevas de
 *  perks (dev-7 fase 23). La implementación real vive en perks.js
 *  (applyPerkDamage) — la MISMA que usan las torres y drones, así que
 *  ambas rutas comparten exactamente la misma semántica:
 *  p.executeThreshold (remate bajo ese % de HP máx), p.lifesteal (cura al
 *  escudo de la base), p.explodeOnKillChance/Dmg/Radius (explosión al
 *  matar). `p.game` da acceso a fortress/engine. Ausentes → idéntico a
 *  takeDamage(rollProjectileCrit(p)). Devuelve true si el golpe mató.
 *
 *  NOTA sobre el lifesteal en splash: `applyProjectileHit` llama a esta
 *  función UNA VEZ POR ENEMIGO dentro del radio. Cada llamada cura su
 *  propio daño efectivo, así que el total curado es el % del daño TOTAL
 *  del área (no el % por enemigo) — que es lo que promete el perk.
 */
function projectileStrike(p, e, kind, list) {
  const dmg = rollProjectileCrit(p);
  // dev-7 fase 32: el proyectil lleva su TIPO de daño (`p.dmgType`), que
  // es el que decide el multiplicador contra la familia del enemigo
  // (se aplica en takeDamage). El `kind` ('bullet'/'splash') es sólo el
  //Fallback para los proyectiles sin tipo explícito.
  const dmgKind = p.dmgType ?? kind;
  // Los mods viajan en el propio proyectil (onHitOpts) — se pasan tal cual.
  return applyPerkDamage(e, dmg, dmgKind, p, p.game, list);
}

/**
 * Aplica el daño de un proyectil sobre la lista viva de enemigos.
 * Bala recta: primer enemigo alcanzado (más cercano a la torre).
 * Splash (missile/mortar): TODOS los enemigos dentro del radio.
 * Devuelve true si el proyectil debe morir.
 * Helper puro testeable — main.js lo enchufa vía onFrame (§1.2 orden).
 * Perks sistemáticos (fase 17): p.bounce (rebotes restantes, re-apunta al
 * enemigo vivo más cercano al impacto, sin repetir el último), p.slowOnHit,
 * p.stunChance, p.critChance/critMul — ausentes = comportamiento histórico.
 */
export function applyProjectileHit(p, enemies, radiusOverride = undefined) {
  if (!p || p.dead || typeof p.x !== 'number') return false;
  if (typeof p.damage !== 'number') return false; // un enemigo NO es proyectil
  const list = Array.isArray(enemies) ? enemies : [];
  if (!list.length) return false;

  // Splash: daña área (misil ya explota al alcanzar la Y del blanco)
  if (typeof p.splashR === 'number' || radiusOverride !== undefined) {
    const R = radiusOverride ?? p.splashR;
    let hitAny = false;
    for (const e of list) {
      if (!e || e.dead) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) <= R + (e.r ?? 10)) {
        hitAny = true;
        projectileStrike(p, e, 'splash', list);
        applyProjectileDebuffs(p, e);
      }
    }
    return hitAny;
  }

  // Impacto directo: el más cercano al origen del disparo (Y mayor)
  let best = null;
  for (const e of list) {
    if (!e || e.dead || e === p._lastHit) continue; // fase 17: no repetir tras rebote
    if (Math.hypot(e.x - p.x, e.y - p.y) > (e.r ?? 10) + projectileRadius(p)) continue;
    if (!best || e.y > best.y) best = e;
  }
  if (!best) return false;
  projectileStrike(p, best, 'bullet', list);
  applyProjectileDebuffs(p, best);
  // dev-7 fase 26 (bug corregido): perforación y rebote son contadores
  // INDEPENDIENTES. Antes el `pierce` se consumía y salía ANTES de mirar
  // el rebote, así que con pierce>0 (Gauss: 999, o el perk de perforación
  // del Guardian) el rebote NUNCA ocurría: los perks "Rebote magnético",
  // "Rebote II" y "DEFINITIVO Rebote infinito" eran CÓDIGO MUERTO.
  //
  // Ahora: se consume una carga de perforación (si queda) y, aparte, se
  // re-apunta si queda rebote. El proyectil sobrevive si tiene cargas de
  // cualquiera de los dos.
  const hasPierce = (p.pierce ?? 0) > 0;
  if (hasPierce) {
    p.pierce -= 1;
    // Marca el último golpeado también en perforación: el perk dice
    // "atraviesa +N ENEMIGOS" — debe ser N enemigos DISTINTOS, no N golpes
    // al mismo (si no, una bala lenta re-golpearía al mismo blanco).
    p._lastHit = best;
  }
  // Rebote (perks fase 17): sigue viva y se re-apunta al enemigo vivo más
  // cercano al punto de impacto distinto del último golpeado.
  if ((p.bounce ?? 0) > 0) {
    let nxt = null;
    let bestD = Infinity;
    for (const e of list) {
      if (!e || e.dead || e === best) continue;
      const dd = Math.hypot(e.x - p.x, e.y - p.y);
      if (dd < bestD) { bestD = dd; nxt = e; }
    }
    if (nxt) {
      p.bounce -= 1;
      p._lastHit = best;
      const spd = Math.hypot(p.vx, p.vy);
      if (spd > 0) {
        const ang = Math.atan2(nxt.x - p.x, -(nxt.y - p.y));
        p.vx = Math.sin(ang) * spd;
        p.vy = -Math.cos(ang) * spd;
      }
      return false;
    }
  }
  // Sobrevive si le queda carga de perforación (atraviesa enemigos).
  return !hasPierce;
}

/**
 * Paso de colisiones por frame (orden §1.2): recorre los proyectiles
 * vivos del engine y aplica daño. Los FX instantáneos (beam/bolt/chain)
 * NO pasan por acá: sus torres aplican takeDamage() directo al disparar.
 */
export function collideProjectiles(engine, enemies) {
  for (const p of engine.entities) {
    if (p instanceof Enemy) continue; // los enemigos son blanco, no proyectil
    if (applyProjectileHit(p, enemies)) p.dead = true;
  }
}

// ------------------------------------------------------------
// BESTIARIO (dev-7 fase 40) — el icono de un enemigo en un canvas
// chico. Igual que `renderTowerIcon` de js/meta.js para las torres:
// el ícono REUSA el draw real del juego, así que no puede quedar
// desincronizado del enemigo que se ve caer en pantalla.
// ------------------------------------------------------------

/** Lado (en px lógicos) del canvas cuadrado del icono del bestiario. */
export const ENEMY_ICON_SIZE = 64;

/**
 * Caja que ocupa el DRAW de un enemigo, en unidades de mundo, para
 * poder ENCUADRARLO en el canvas del icono.
 *
 * No alcanza con el radio `r`: al enemigo le cuelgan cosas que no son
 * su cuerpo —
 *   · la estela de fuego (teardrop) sube ~1,8 radios por encima;
 *   · los enemigos grandes (r >= 20) dibujan barra de HP encima;
 *   · el polígono irregular (makePoly) llega a 1,14 radios.
 *   · el rasgo de una VARIANTE (aro del escudo, aura del regenerador)
 *     llega a ~1,5 radios: sin ensanchar la caja, el icono lo recortaría.
 * Con sólo `r` el jefe se salía del canvas y la esporita ocupaba un
 * píxel: por eso la caja se calcula por tipo.
 *
 * @param {object} data entrada de ENEMY_TYPES
 * @param {string} [variant] id de ENEMY_VARIANTS (icono de una élite)
 * @returns {{w:number, h:number, cx:number, cy:number}} caja en mundo
 */
function enemyIconBox(data, variant = null) {
  const r = Math.max(1, data.r ?? 8);
  const hasTrail = !!data.trail1;
  const aura = r * (variant ? 1.6 : 1.2);      // holgura lateral y de abajo
  const halfW = aura;                          // polígono + tentáculos + aro
  const bottom = aura;
  // Arriba manda la estela de fuego, salvo que el rasgo de la variante
  // suba más (esporas/blobs sin estela).
  let top = -(r * Math.max(hasTrail ? 1.85 : 1.25, variant ? 1.6 : 0));
  if (r >= 20) top = Math.min(top, -(r + 13)); // barra de HP (4 px de alto)
  return { w: halfW * 2, h: bottom - top, cx: 0, cy: (top + bottom) / 2 };
}

/**
 * Dibuja el ENEMIGO DE VERDAD (su `draw` real) dentro de un canvas
 * cuadrado y chico: el ícono del bestiario es el mismo sprite que se
 * ve caer, no un dibujo aparte que puede desincronizarse.
 *
 * Igual que `renderTowerIcon` (js/meta.js): se instancia la entidad con
 * un `game` de mentira (el draw del enemigo no lo necesita, pero así es
 * un Enemy de verdad) y se ajusta translate/scale para que la silueta
 * quede centrada y encuadrada.
 *
 * TOLERANTE: si el tipo no existe, si el canvas no es un canvas o si el
 * draw revienta (contexto raro, navegador sin 2d), devuelve false sin
 * romper nada — el bestiario es informativo, no gameplay.
 *
 * @param {HTMLCanvasElement} canvas canvas destino (se reescanea a 64×64)
 * @param {string} type clave de ENEMY_TYPES
 * @param {string} [variant] id de ENEMY_VARIANTS: el icono muestra el RASGO
 *   de la variante (escudo/estela/aura), que es como se ve en el juego
 * @returns {boolean} true si se dibujó
 */
export function renderEnemyIcon(canvas, type, variant = null) {
  if (!canvas || canvas.tagName !== 'CANVAS') return false;
  const data = ENEMY_TYPES[type];
  if (!data) return false;
  let ctx;
  try { ctx = canvas.getContext('2d'); } catch (_e) { return false; }
  if (!ctx) return false;
  try {
    canvas.width = ENEMY_ICON_SIZE;
    canvas.height = ENEMY_ICON_SIZE;
    ctx.clearRect(0, 0, ENEMY_ICON_SIZE, ENEMY_ICON_SIZE);
    const e = new Enemy(type, 0, { game: { engine: { _t: 0 } }, y: 0, variant });
    const box = enemyIconBox(data, variant);
    const pad = 3;
    const avail = ENEMY_ICON_SIZE - pad * 2;
    const s = Math.min(avail / box.w, avail / box.h);
    ctx.save();
    // El centro de la CAJA (no el del enemigo) al centro del canvas: así
    // la estela y la barra de HP también quedan dentro.
    ctx.translate(ENEMY_ICON_SIZE / 2 - box.cx * s, ENEMY_ICON_SIZE / 2 - box.cy * s);
    ctx.scale(s, s);
    e.draw(ctx);
    ctx.restore();
    return true;
  } catch (_err) {
    return false;
  }
}
