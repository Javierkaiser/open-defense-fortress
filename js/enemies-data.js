// =============================================================================
// enemies-data.js — datos puros de enemigos y variantes de élite
// -----------------------------------------------------------------------------
// Extraído de enemies.js (fase 75). No importa nada: stats, jefes, HP
// efectivo y los 7 afijos. enemies.js lo reexporta para no romper imports.
// =============================================================================

export const ENEMY_TYPES = {
  meteor: {
    family: 'rock', // fase 32: familia de daño (ver js/damagetypes.js)
    role: 'special', debut: 1,
    name: 'Meteorito', hp: 30, vel: 60, score: 10, r: 16,
    drift: { amp: 30, freq: 0.8 }, // caída recta con deriva senoidal ±30 px
    body: '#0A0A0A', crater: '#FFFFFF', trail1: '#FF9A3D', trail2: '#FFD24A',
  },
  fragment: {
    family: 'rock', // fase 32: familia de daño
    role: 'cheap', debut: 1,
    name: 'Fragmento', hp: 12, vel: 110, score: 15, r: 11,
    angleDeg: 25, // ráfagas en ángulo ±25°
    body: '#0E0E12', crack: '#FFFFFF', trail1: '#FF9A3D',
  },
  rockSwarm: {
    family: 'rock',
    role: 'swarm', debut: 1, swarm: true,
    name: 'Enjambre pétreo', hp: 12, vel: 100, score: 5, r: 10,
    desc: 'Cúmulo de esquirlas rápido y frágil. El balístico lo deshace.',
    counter: 'Fuego sostenido o área; no necesita una torre especial.',
    drift: { amp: 16, freq: 1.4 },
    body: '#5B6470', dark: '#22262C', accent: '#C9CDD3',
    trail1: '#8A8F98', trail2: '#C9CDD3', drawTrail: false,
    swarmArt: {
      bodies: 5, spread: 7, size: 0.34, shape: 'rock',
      palette: ['#4B5563', '#8B95A3', '#C9CDD3'],
    },
  },
  boulder: {
    family: 'rock',
    role: 'tank', debut: 2,
    name: 'Roca maciza', hp: 190, vel: 34, score: 60, r: 24,
    desc: 'Al morir se desmorona en 3 enjambres pétreos.',
    counter: 'El balístico la parte; matala lejos de la base o con área.',
    drift: { amp: 26, freq: 0.6 },
    body: '#4A4F57', dark: '#22262C', plate: '#8B95A3', dust: '#C9CDD3',
    trail1: '#8A8F98', trail2: '#C9CDD3', drawTrail: false,
    deathSpawn: { type: 'rockSwarm', count: 3, spread: 22, scoreMul: 0.1 },
  },
  crystal: {
    family: 'crystal', // fase 32: familia de daño
    role: 'special', debut: 1,
    name: 'Cristal rojo', hp: 60, vel: 45, score: 40, r: 13,
    dropXpBonusFrac: 0.15, // al morir suelta carta bonus (+15% energía, D12)
    body: '#E01818', shine: '#FFD0D0',
    incand: '#FFD24A', // núcleo incandescente: color de la estela (T1)
  },
  crystalSwarm: {
    family: 'crystal',
    role: 'swarm', debut: 5, swarm: true,
    name: 'Enjambre de astillas', hp: 12, vel: 70, score: 6, r: 10,
    desc: 'Astillas de cristal que giran y brillan; la electricidad las conduce.',
    counter: 'Eléctrico; el balístico rebota en el cristal.',
    drift: { amp: 14, freq: 2.0 },
    body: '#E01818', dark: '#8A1020', accent: '#FFD0D0',
    trail1: '#FF6A6A', trail2: '#FFD0D0', drawTrail: false,
    swarmArt: {
      bodies: 4, spread: 8, size: 0.34, shape: 'crystal',
      palette: ['#8A1020', '#E01818', '#FFB0B0'],
    },
  },
  spore: {
    family: 'spore', // fase 32: familia de daño
    role: 'swarm', debut: 3, swarm: true,
    name: 'Espora', hp: 8, vel: 90, score: 5, r: 7,
    zigzag: { amp: 26, freq: 3.2 }, // grupos con formación V y zigzag
    body: '#141014', spike: '#FFFFFF', dots: '#FF9EC4',
  },
  sporePod: {
    family: 'spore',
    role: 'tank', debut: 20,
    name: 'Esporocarpo', hp: 190, vel: 30, score: 55, r: 23,
    desc: 'Esporula 2 esporas cada 6 s (máx. 6) y 2 más al morir.',
    counter: 'Explosión y foco: no lo dejes madurar; sus crías dan 10 % de XP.',
    drift: { amp: 20, freq: 0.7 },
    body: '#3B1F3A', dark: '#20101F', sac: '#9C4A7A', glow: '#FF9EC4',
    trail1: '#FF9EC4', trail2: '#FFD0E4', drawTrail: false,
    spawner: {
      every: 6, type: 'spore', count: 2, maxAlive: 6, spread: 18, scoreMul: 0.1,
    },
    deathSpawn: { type: 'spore', count: 2, spread: 16, scoreMul: 0.1 },
  },
  blob: {
    family: 'virus', // fase 32: familia de daño
    role: 'tank', debut: 3,
    name: 'Blob tanque', hp: 220, vel: 35, score: 60, r: 24,
    desc: 'Cepa: acelera un 20 % a los enjambres virales en 120 px.',
    counter: 'Priorizalo: la luz lo vaporiza y, sin él, el enjambre pierde el buff.',
    pushR: 70, pushSpeed: 40, // empuja a los enjambres cercanos
    hiveAura: {
      radius: 120, family: 'virus', role: 'swarm',
      speedMul: 1.20, refresh: 0.35, color: '#7BE07B',
    },
    body: '#C81E1E', dark: '#3A0C0C',
  },
  virusSwarm: {
    family: 'virus',
    role: 'swarm', debut: 3, swarm: true,
    name: 'Enjambre viral', hp: 10, vel: 80, score: 5, r: 10,
    desc: 'Viriones erráticos que zigzaguean; la luz los vaporiza.',
    counter: 'Luz o área; si hay un blob cerca, matalo primero para cortar la Cepa.',
    zigzag: { amp: 30, freq: 3.6 },
    body: '#2E7D4F', dark: '#173B27', accent: '#9CFF7A',
    trail1: '#3FA55A', trail2: '#9CFF7A', drawTrail: false,
    swarmArt: {
      bodies: 4, spread: 8, size: 0.36, shape: 'virus',
      palette: ['#1F6B3A', '#3FA55A', '#9CFF7A'],
    },
  },
  geode: {
    family: 'crystal',
    role: 'tank', debut: 30,
    name: 'Geoda', hp: 240, vel: 28, score: 65, r: 24,
    desc: '3 placas de cristal; cada rotura la acelera un 10 %.',
    counter: 'Eléctrico y burst: rompe las placas antes de que llegue a la línea.',
    drift: { amp: 22, freq: 0.8 },
    body: '#7A1020', dark: '#3A0810', crystal: '#E01818', shine: '#FFD0D0',
    glow: '#FF6A6A',
    trail1: '#FF6A6A', trail2: '#FFD0D0', drawTrail: false,
    plates: { count: 3, hpFracEach: 0.15, speedMulPerBreak: 1.10 },
  },
  boss: {
    family: 'rock', // fase 32: el BOSS es un meteorito gigante
    role: 'boss', debut: 1,
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
  family: 'virus', role: 'boss', debut: 10, // fase 32: familia de daño (ver js/damagetypes.js)
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
  family: 'virus', role: 'tank', debut: 3, // fase 32: familia de daño
  drift: { amp: 40, freq: 1.1 },
  body: '#E05A5A', dark: '#5A1414',
};

/** Cementerio: blob jefe + 2 miniBlobs al 50% + fragmentos blindados (§2.9). */
ENEMY_TYPES.graveBlob = {
  name: 'BLOB NECRO', hp: 3700, vel: 19, score: 800, r: 82,
  family: 'virus', role: 'boss', debut: 20, // fase 32: familia de daño
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
  family: 'rock', role: 'boss', debut: 30, // fase 32: blindado de roca
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
  family: 'rock', role: 'boss', debut: 40, // fase 32: cuerpo de meteoro
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

/**
 * HP EFECTIVO de un tipo para las guardas de balance: su HP base más el HP
 * de las crías que puede aportar su `deathSpawn` y el tope de su
 * `spawner`. No es el HP que se paga de una vez, pero evita que un cambio
 * de `maxAlive`/`count` quede invisible para la sonda y los tests.
 *
 * @param {string} type id de ENEMY_TYPES
 * @returns {number} HP efectivo aproximado (0 si el tipo no existe)
 */
export function effectiveHpOf(type) {
  const d = ENEMY_TYPES[type];
  if (!d) return 0;
  let hp = d.hp;
  if (d.deathSpawn) {
    const n = Math.max(1, Math.trunc(d.deathSpawn.count ?? 1));
    hp += (ENEMY_TYPES[d.deathSpawn.type]?.hp ?? 0) * n;
  }
  if (d.spawner) {
    const n = Math.max(0, Math.trunc(d.spawner.maxAlive ?? 0));
    hp += (ENEMY_TYPES[d.spawner.type]?.hp ?? 0) * n;
  }
  return hp;
}

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
