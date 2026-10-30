// ============================================================
// cards.js — CATÁLOGO DE CARTAS roguelike + rollOffer + efectos
// (v3 correcciones 1/7 — BUG-001/D7, DESIGN §2.2/§2.3/§2.7/§5 dev-4)
//
// El nivel del jugador SOLO dispara la oferta de cartas (§2.7):
// kills → XP → LEVEL UP → CARD_CHOICE (3 cartas) → applyCard().
// Sin estado propio: las cartas mutan Fortress/Tower vía game.
// Módulo de datos+lógica pura testeable desde Node (rng inyectable).
// Nadie importa este archivo salvo main.js (regla §1.1: las torres/
// enemigos comunican hacia afuera vía engine.emit).
// ============================================================

import { clamp } from './engine.js';
import { MAX_DRONES, TOWERS, DRONES } from './towers.js';
// dev-7 fase 31: `perkMods` para saber si el jugador tiene el perk de
// espinas del Campo de Fuerza (sin él la carta "Burbuja Reforzada" sería
// inerte: multiplica por 1.6 un daño que es 0).
import { perkMods } from './meta.js';
// dev-7 fase 51: `addCardMods` — el CANAL de cartas: por aquí una carta
// puede dar MECÁNICAS (el vocabulario de los perks) a una unidad, no sólo
// multiplicadores. Los mods se acumulan en `unit.cardMods` y los lee
// `unitMods()` (js/towers.js), que los fusiona con los perks de meta.
import { addCardMods, cardApps } from './perks.js';
import { createComboMods } from './combo-mods.js';
import {
  GLOBAL_DMG_MUL, GLOBAL_CAD_MUL, TYPE_DMG_MUL,
} from './card-constants.js';
import {
  CARD_OFFER_COUNT, CAPS, UNIT_TAGS, TECH_CARDS, HUNT_CARDS, MAX_SWARM,
} from './cards-data.js';
// Fachada: los tests/scripts siguen importando los datos desde cards.js.
export { CARD_OFFER_COUNT, CAPS, UNIT_TAGS, TECH_CARDS, HUNT_CARDS, MAX_SWARM };

/**
 * Cartas por oferta de ESTA run. fase 69 — condición Censura: el Protocolo
 * recorta la oferta (3 → 2 → 1) vía `game.runMods.offerCount`. Sin runMods
 * (tests, balance-sim) el default sigue siendo 3.
 *
 * @param {object} [game]
 * @returns {number} 1..CARD_OFFER_COUNT
 */
function offerCountFor(game) {
  const n = Number(game?.runMods?.offerCount ?? CARD_OFFER_COUNT);
  if (!Number.isFinite(n)) return CARD_OFFER_COUNT;
  return Math.max(1, Math.min(CARD_OFFER_COUNT, Math.trunc(n)));
}

// dev-7 fase 49: los TIPOS DE DAÑO (js/damagetypes.js). Las cartas que
// suben el daño de una unidad toman SU tipo (TOWERS/DRONES) y su
// descripción dice cómo queda contra cada familia de enemigo, con los
// números REALES de la matriz (multiplicador de la carta × matriz).
import { DAMAGE_TYPES, ENEMY_FAMILIES, ENEMY_FAMILY_IDS, dmgMultiplier } from './damagetypes.js';

/** Torres canónicas desbloqueables SOLO por cartas (§6 decisión 3). */
const UNLOCKABLE_TOWERS = [
  'missile', 'thunderstroke', 'tesla', 'beam',
];

// ------------------------------------------------------------
// dev-7 fase 49 — LAS CARTAS HABLAN: tipo de daño y SINONERGIA
//
// Antes la carta decía QUÉ hace ("×1.6 de daño") pero no DE QUÉ TIPO:
// once cartas del catálogo eran casi gemelas ("×1.6 a la torre X") y el
// jugador no tenía forma de saber si la que tenía delante pegaba contra
// la roca o contra el virus. Ahora:
//
//   1) cada carta de daño declara su `dmgType` (el de la unidad que
//      mejora, sacado de la MISMA tabla que usa el combate: TOWERS/DRONES),
//   2) su descripción dice el tipo y cómo QUEDA contra cada familia,
//      con los números REALES: multiplicador de la carta × matriz.
//
// El balance NO cambia: esto es información, no efectos.
// ------------------------------------------------------------

/**
 * Multiplicador en formato español: 2.4 → "2,4".
 * @param {number} v
 * @returns {string}
 */
export function fmtDmgMul(v) {
  const r = Math.round((typeof v === 'number' && Number.isFinite(v) ? v : 1) * 100) / 100;
  return String(r).replace('.', ',');
}

/**
 * La SINONERGIA de una carta de daño: el multiplicador de la carta
 * contra CADA familia de enemigo (multiplicador de la carta × matriz de
 * js/damagetypes.js). Los números NO están escritos a mano: se calculan.
 *
 * El ▲/▼ es el mismo lenguaje que la leyenda de tipos: ▲ fortaleza
 * (×1,5 de la matriz), ▼ debilidad (×0,5). Las familias neutras (las
 * que comparten multiplicador) van agrupadas para que la línea quepa en
 * una card de móvil.
 *
 * @param {string} dmgType id del tipo de daño
 * @param {number} mul multiplicador de la carta (1.6, 1.3, 1.5…)
 * @returns {string} "▲roca ×2,4 · ▼cristal ×0,8 · espora/virus ×1,6"
 */
export function dmgSynergyText(dmgType, mul = 1) {
  const grupos = [];
  for (const f of ENEMY_FAMILY_IDS) {
    const total = mul * dmgMultiplier(dmgType, f);
    const mark = total > mul ? '▲' : total < mul ? '▼' : '';
    const nombre = ENEMY_FAMILIES[f].name.toLowerCase();
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.total === total) ultimo.nombres.push(nombre);
    else grupos.push({ total, mark, nombres: [nombre] });
  }
  return grupos
    .map((g) => `${g.mark}${g.nombres.join('/')} ×${fmtDmgMul(g.total)}`)
    .join(' · ');
}

/**
 * Descripción de una carta de daño EXCLUSIVA: el TIPO que inflige y
 * cómo queda contra cada familia (segunda línea: la sinonergia).
 *
 * @param {string} unitName nombre de la unidad (Guardian, Missile, …)
 * @param {string} dmgType id del tipo de daño
 * @param {number} mul multiplicador de la carta
 * @param {number} times cuántas veces se puede apilar
 * @param {string} per detalle de en qué se aplica (" por ráfaga")
 * @returns {string}
 */
function exclusiveDmgDesc(unitName, dmgType, mul, times, per = '') {
  const tipo = DAMAGE_TYPES[dmgType]?.name?.toUpperCase() ?? '—';
  return `${unitName}: ×${fmtDmgMul(mul)} de daño ${tipo}${per} (hasta ${times} veces).`
    + `\n${dmgSynergyText(dmgType, mul)}`;
}

// ------------------------------------------------------------
// Helpers sobre la partida (duck-typed: toleran games de test)
// ------------------------------------------------------------

/** Torre colocada de un tipo dado (o null). */
export function findTower(game, type) {
  return game?.fortress?.slots?.find((t) => t && t.type === type) ?? null;
}

/**
 * Dron colocado de un tipo dado (o null). Los drones del arsenal extendido
 * (§2.3) viven en `fortress.drones`, NO en `fortress.slots` (a diferencia
 * de las torres) — por eso las cartas exclusivas de dron usan este helper.
 */
export function findDrone(game, type) {
  return game?.fortress?.drones?.find((d) => d && d.type === type) ?? null;
}

/** fase 74 — Torre o dron por tipo (las técnicas ya pueden ir a drones). */
export function findUnit(game, type) {
  return findTower(game, type) ?? findDrone(game, type);
}

/** Tipos de torre poseídos (para exclusión de cartas de desbloqueo). */
function ownedTypes(game) {
  const out = new Set();
  for (const t of game?.fortress?.slots ?? []) {
    if (t) out.add(t.type);
  }
  return out;
}

/**
 * fase 74 — TAGS de unidad para los prerrequisitos de cartas.
 * Los tags de TIPO salen de `dmgType` de la MISMA tabla que usa el
 * combate (TOWERS/DRONES); los tags de mecánica son explícitos.
 * Usar tags en vez de ids de torre permite que una torre futura del mismo
 * tipo herede las cartas sin tocar el catálogo.
 */


/** Tipo de daño REAL de una torre o dron (duck-typed). */
function unitDmgType(unit) {
  return unit?.data?.dmgType
    ?? TOWERS[unit?.type]?.dmgType
    ?? DRONES[unit?.type]?.dmgType
    ?? null;
}

/** Todas las unidades poseídas: torres + drones. */
function allOwnedUnits(game) {
  const f = game?.fortress;
  return [
    ...(f?.slots ?? []).filter(Boolean),
    ...(f?.drones ?? []).filter(Boolean),
  ];
}

/** ¿El jugador ya eligió esta técnica/carta en alguna unidad? */
function ownsCard(game, cardId) {
  return allOwnedUnits(game).some((u) => cardApps(u, cardId) > 0);
}

/** Asegura el contenedor de flags de combos (tests duck-typed incluidos). */
function comboMods(f) {
  f.comboMods ??= createComboMods();
  return f.comboMods;
}

/** Tags que posee el jugador AHORA (tipo + mecánica). */
function ownedTags(game) {
  const out = new Set();
  for (const u of allOwnedUnits(game)) {
    const type = unitDmgType(u);
    if (type) out.add(type);
    for (const tag of UNIT_TAGS[u?.type] ?? []) out.add(tag);
  }
  return out;
}

/** Cuántas unidades poseídas tienen cada tag (para combos de 2 piezas). */
function ownedTagCounts(game) {
  const out = new Map();
  for (const u of allOwnedUnits(game)) {
    const tags = new Set();
    const type = unitDmgType(u);
    if (type) tags.add(type);
    for (const tag of UNIT_TAGS[u?.type] ?? []) tags.add(tag);
    for (const tag of tags) out.set(tag, (out.get(tag) ?? 0) + 1);
  }
  return out;
}

/** ¿La carta cumple sus prerrequisitos de tags/unidades/Black Hole? */
function meetsRequirements(card, game) {
  const f = game?.fortress;
  if (card.requiresBlackHole && !f?.blackHoleUnlocked) return false;
  if (card.requiresCards?.length
    && !card.requiresCards.every((id) => ownsCard(game, id))) return false;
  if (card.requiresAnyCards?.length
    && !card.requiresAnyCards.some((id) => ownsCard(game, id))) return false;
  const tags = ownedTags(game);
  if (card.requiresTags?.length && !card.requiresTags.some((t) => tags.has(t))) return false;
  if (card.requiresAllTags?.length && !card.requiresAllTags.every((t) => tags.has(t))) return false;
  if (card.requiresUnits?.length) {
    const owned = new Set(allOwnedUnits(game).map((u) => u.type));
    if (!card.requiresUnits.every((u) => owned.has(u))) return false;
  }
  if (card.requiresTagCount) {
    const counts = ownedTagCounts(game);
    for (const [tag, n] of Object.entries(card.requiresTagCount)) {
      if ((counts.get(tag) ?? 0) < n) return false;
    }
  }
  return true;
}

/** Aplicaciones previas de una carta repetible (cap por torre o global). */
function appsOf(cardId, game) {
  const f = game?.fortress;
  if (!f) return 0;
  switch (cardId) {
    case 'dmg_all': return f.dmgAllStacks ?? Math.max(0, ...f.slots.filter(Boolean).map((t) => t.dmgAllApps ?? 0));
    // fase 74: daño por tipo — un stack global por tipo (no por unidad).
    case 'dmg_type_ballistic':
    case 'dmg_type_light':
    case 'dmg_type_blast':
    case 'dmg_type_electric':
    case 'dmg_type_drone': {
      const type = cardId.slice('dmg_type_'.length);
      return f.typeStacks?.[type] ?? 0;
    }
    // dev-7 fase 50: la caza de familia se aplica a TODAS las unidades,
    // asi que su conteo es el maximo de las que hay en el campo.
    case 'hunt_rock':
    case 'hunt_crystal':
    case 'hunt_spore':
    case 'hunt_virus':
      return Math.max(
        f.huntStacks?.[cardId.slice(5)] ?? 0,
        ...[
          ...f.slots.filter(Boolean).map((t) => cardApps(t, cardId)),
          ...(f.drones ?? []).map((d) => cardApps(d, cardId)),
        ],
      );
    case 'dmg_guard': return findTower(game, 'guardian')?.guardDmgApps ?? 0;
    // dev-7 fase 26 (bug corregido): las 6 cartas EXCLUSIVAS por torre se
    // auto-limitan dentro de su `apply` (comparan `exclusiveDmgApps` contra
    // su CAP), pero `appsOf` no las contaba. Resultado: seguían siendo
    // ELEGIBLES con el tope ya alcanzado, entraban al pool de oferta y al
    // elegirlas no hacían NADA (una carta inútil en la oferta, justo lo que
    // la regla de elegibilidad de arriba dice que no debe pasar). Ahora se
    // cuentan como las demás repetibles.
    case 'dmg_missile': return findTower(game, 'missile')?.exclusiveDmgApps ?? 0;
    case 'dmg_beam': return findTower(game, 'beam')?.exclusiveDmgApps ?? 0;
    case 'dmg_thunder': return findTower(game, 'thunderstroke')?.exclusiveDmgApps ?? 0;
    case 'dmg_tesla': return findTower(game, 'tesla')?.exclusiveDmgApps ?? 0;
    case 'dmg_mortar': return findTower(game, 'mortar')?.exclusiveDmgApps ?? 0;
    case 'dmg_gauss': return findTower(game, 'gauss')?.exclusiveDmgApps ?? 0;
    // dev-7: las 4 cartas del arsenal extendido (Láser + 3 drones) siguen
    // el mismo patrón (contador `exclusiveDmgApps` de la unidad).
    case 'dmg_laser': return findTower(game, 'laser')?.exclusiveDmgApps ?? 0;
    case 'dmg_firewheel': return findDrone(game, 'firewheel')?.exclusiveDmgApps ?? 0;
    case 'dmg_wasps': return findDrone(game, 'wasps')?.exclusiveDmgApps ?? 0;
    case 'dmg_forcefield': return findDrone(game, 'forcefield')?.exclusiveDmgApps ?? 0;
    // dev-7 fase 30: el contador de "Nido Ampliado" es del propio dron.
    case 'swarm_grow': return findDrone(game, 'wasps')?.swarmApps ?? 0;
    case 'rapid_bullets': return findTower(game, 'guardian')?.rapidApps ?? 0;
    // dev-7 fase 30: `cadence_up` también la aplica el Dron Mosquitos (su
    // cooldown de picadura), así que el tope se cuenta sobre torres Y
    // drones: si sólo mirara las torres, la carta se seguiría ofreciendo
    // después de 3 usos (con un dron presente) sin efecto real.
    case 'cadence_up': return f.cadAllStacks ?? Math.max(0,
      ...f.slots.filter(Boolean).map((t) => t.cadApps ?? 0),
      ...(f.drones ?? []).filter(Boolean).map((d) => d.cadApps ?? 0));
    case 'detect_up': return f.detectApps ?? 0;
    // dev-7: `pierce_up` y `ult_charge` no tenían tope (contadores nuevos).
    case 'pierce_up': return f.pierceApps ?? 0;
    case 'base_shield': return f.baseShieldApps ?? 0;
    case 'ult_charge': return f.ultChargeApps ?? 0;
    case 'ult_power': return f.orbitalPowerApps ?? 0;
    // dev-7 fase 26: contadores de las dos cartas de defensa (ver CAPS).
    case 'repair_500': return f.repairApps ?? 0;
    case 'armor_plate': return f.armorApps ?? 0;
    // fase 74: combos de dos piezas / Black Hole.
    case 'combo_singularity': return f.blackHoleMods?.singularity ? 1 : 0;
    // Fase 76 — combos de identidad: cada uno se conta por su flag.
    case 'combo_overload': return f.comboMods?.overload ? 1 : 0;
    case 'combo_prism_loop': return f.comboMods?.prismLoop ? 1 : 0;
    case 'combo_siege_sync': return f.comboMods?.siegeSync ? 1 : 0;
    case 'combo_ignition': return f.comboMods?.ignition ? 1 : 0;
    case 'combo_venom_shell': return f.comboMods?.venomShell ? 1 : 0;
    case 'combo_bubble_chain': return f.comboMods?.bubbleChain ? 1 : 0;
    case 'combo_railstorm': return f.comboMods?.railstorm ? 1 : 0;
    case 'combo_melt_rail': return f.comboMods?.meltRail ? 1 : 0;
    case 'combo_slow_siege': return f.comboMods?.slowSiege ? 1 : 0;
    case 'combo_coup': return f.comboMods?.coup ? 1 : 0;
    case 'combo_arc_guard': return f.comboMods?.arcGuard ? 1 : 0;
    case 'combo_absolute_zero': return (f.comboMods?.slowLightVuln ?? 1) > 1 ? 1 : 0;
    case 'combo_fracture': return (f.comboMods?.slowCritChanceAdd ?? 0) > 0 ? 1 : 0;
    case 'combo_glacial_wave': return (f.comboMods?.explosionSlowFrac ?? 0) > 0 ? 1 : 0;
    case 'combo_blood_pact': return (f.blackHoleMods?.drain ?? 0) > 0 ? 1 : 0;
    case 'combo_transfusion': return (f.comboMods?.poisonRegen ?? 0) > 0 ? 1 : 0;
    case 'combo_rail_mark': return f.comboMods?.railMark ? 1 : 0;
    case 'combo_shared_pierce': return f.comboMods?.pierceBleed ? 1 : 0;
    case 'bh_horizon': return (f.blackHoleMods?.durationAdd ?? 0) > 0 ? 1 : 0;
    case 'bh_collapse': return (f.blackHoleMods?.endBurst ?? 0) > 0 ? 1 : 0;
    // dev-7 fase 51: las CARTAS DE TÉCNICA cuentan sus aplicaciones en la
    // propia unidad (el contador vive en `unit.cardApps`, igual que
    // `exclusiveDmgApps`): sin esto la carta se seguiría ofreciendo con
    // el tope alcanzado y al elegirla no haría NADA.
    default: {
      const type = TECH_UNIT[cardId];
      if (type) return cardApps(findUnit(game, type), cardId);
      return 0;
    }
  }
}

/**
 * dev-7 fase 51 — Aplica una carta de TÉCNICA: acumula sus MECÁNICAS en
 * la unidad destino por el CANAL (js/perks.js: addCardMods), respetando
 * el TOPE de CAPS.
 *
 * @param {object} game
 * @param {object} tech ficha de la carta (id, unit, mods)
 * @returns {boolean} true si la carta se aplicó
 */
function applyTechCard(game, tech) {
  const unit = findUnit(game, tech.unit);
  if (!unit) return false;
  if (appsOf(tech.id, game) >= (CAPS[tech.id] ?? Infinity)) return false;
  return addCardMods(unit, tech.mods, tech.id);
}

// ------------------------------------------------------------
// dev-7 fase 64 — RELEVANCIA ≠ TOPE (dos preguntas distintas)
// ------------------------------------------------------------
// Hasta acá una sola función (`isCardEligible`) mezclaba dos preguntas:
// "¿elegir esta carta AHORA hace algo útil?" y "¿ya gastó sus
// aplicaciones?" (CAPS). El bug del reporte del S50 sale de ahí: el
// RELLENO de la oferta (`fillOffer`) no podía preguntar por la primera
// —sólo miraba `minStage`—, así que en una run larga (pool elegible
// corto) rellenaba con una carta de una unidad que el jugador NO tiene;
// y si esa carta era un desbloqueo ya gastado, con slots libres
// `addTower` volvía a colocarla: el jugador terminó con 2 torres misiles.
//
// Ahora son dos funciones, cada una con su pregunta:
//   · `isRelevant(card, game)` → ¿sirve AHORA? (unidad presente, estado
//     situacional y etapa). Es la mitad que también usa el relleno: una
//     carta de una unidad AUSENTE no debe ofrecerse NI como último
//     recurso (no haría nada, o duplicaría la torre).
//   · `isCardEligible(card, game)` → relevante Y sin alcanzar su tope.
// ------------------------------------------------------------

/** dev-7 fase 12: cartas de daño exclusivas por TORRE (ver isRelevant). */
const EXCLUSIVE_DMG_TOWER = {
  dmg_missile: 'missile', dmg_beam: 'beam', dmg_thunder: 'thunderstroke',
  dmg_tesla: 'tesla', dmg_mortar: 'mortar', dmg_gauss: 'gauss',
  dmg_laser: 'laser',
};

/** dev-7: cartas de daño exclusivas de DRON (ver isRelevant). */
const EXCLUSIVE_DMG_DRONE = {
  dmg_firewheel: 'firewheel', dmg_wasps: 'wasps', dmg_forcefield: 'forcefield',
};

/** fase 75: cartas que dependen de ultimate/Black Hole (Apagón las apaga). */
const NO_ULT_CARD_IDS = new Set([
  'ult_charge', 'ult_power', 'black_hole',
  'bh_horizon', 'bh_collapse',
  'combo_singularity', 'combo_blood_pact',
]);

/**
 * Condiciones de exclusión dinámica de RELEVANCIA (una carta inútil NUNCA
 * entra al pool: §7 QA "20+ selecciones sin efecto roto"):
 * - desbloqueo de torre ya poseída (§6 decisión 3, 1 copia cada una)
 * - desbloqueo sin ningún slot libre donde colocar la unidad
 * - arsenal extendido solo entra desde Stage 2 (§2.3, minStage 2)
 * - reparación con HP lleno / carga de ultimate SOLO con el medidor a medias
 * El TOPE de aplicaciones de las repetibles NO está acá: es la otra mitad
 * (ver isCardEligible), porque una carta topada de una unidad presente
 * sigue siendo relevante — y el relleno de la oferta necesita saberlo.
 */
export function isRelevant(card, game) {
  // fase 75 — Apagón: las cartas de ultimate/Black Hole quedan inertes
  // (main corta ambos disparos con runMods.noUlt). No deben entrar al pool.
  if (game?.runMods?.noUlt && NO_ULT_CARD_IDS.has(card.id)) return false;
  const stage = game?.stageId ?? 1;
  if ((card.minStage ?? 1) > stage) return false;
  // fase 74: prerrequisitos de tags/unidades/Black Hole (combos).
  if (!meetsRequirements(card, game)) return false;

  const f = game?.fortress;
  if (card.tower) {
    if (ownedTypes(game).has(card.tower)) return false;
    if (f && !f.slots.some((s) => !s)) return false; // sin slot libre
  }
  // Arsenal §2.3: drones con cupo lleno y Black Hole con medidor lleno
  // (v4 4b/5) no entran — la carta es recarga INSTANTÁNEA, inútil a 100%.
  if (card.drone && f && (f.drones?.length ?? 0) >= MAX_DRONES) return false;
  if (card.id === 'black_hole' && f && f.blackHoleCharge >= 1) return false;
  if (card.id === 'repair_500' && f && f.hp >= f.maxHp) return false;
  // dev-7: la condición de `ult_charge` estaba INVERTIDA. Antes se
  // ofrecía solo con `f.ultReady` (medidor LLENO) — pero `chargeUltimate()`
  // no hace nada si `ultCharge >= 1` (que es justo cuando `ultReady` es
  // true), así que la carta se ofrecía exactamente cuando no podía hacer
  // NADA. Ahora se ofrece con el medidor a medias, donde +35% de carga sí
  // sirve (y con tope 1: una sola recarga extra por partida).
  if (card.id === 'ult_charge' && f && (f.ultCharge ?? 0) >= 1) return false;
  // Mejora de Guardian inútil si no existe o ya está a máximo nivel (§2.2)
  if (card.id === 'bullets_5') {
    const gw = findTower(game, 'guardian');
    if (!gw || gw.level >= 5) return false;
  }
  // dev-7 (docs/BALANCE.md): Sensores Ampliados (detect_up) NO
  // hace nada en Guardian/Missile/Mortar/Gauss/Láser - todas quedaron con
  // detectHalfWidth: Infinity en rebalances posteriores (v4 4a en
  // adelante) y detectWidthNow() ignora el multiplicador cuando el ancho
  // no es finito. fase 73: el Thunderstroke también pasó a alcance global;
  // solo Beam (columnHalfWidth) y Tesla (banda reachY) siguen usando
  // detectMul. Sin este chequeo, la carta podía ofrecerse con CERO efecto
  // si el jugador no tiene ninguna de esas 2 — viola la regla propia del
  // catálogo (línea ~75: "una carta inútil NUNCA entra al pool").
  if (card.id === 'detect_up') {
    const hasFiniteRangeTower = ['beam', 'tesla']
      .some((type) => ownedTypes(game).has(type));
    if (!hasFiniteRangeTower) return false;
  }
  // dev-7 fase 12: cartas de daño exclusivas por torre — no entran al
  // pool si el jugador no tiene esa torre puesta (mismo criterio que
  // bullets_5 con Guardian arriba).
  if (card.id in EXCLUSIVE_DMG_TOWER) {
    if (!findTower(game, EXCLUSIVE_DMG_TOWER[card.id])) return false;
  }
  // dev-7: las cartas de daño exclusivas de DRON (arsenal extendido) —
  // mismo criterio, pero el dron vive en `fortress.drones`, no en los slots.
  if (card.id in EXCLUSIVE_DMG_DRONE) {
    if (!findDrone(game, EXCLUSIVE_DMG_DRONE[card.id])) return false;
  }
  // dev-7 fase 51: las CARTAS DE TÉCNICA exigen POSEER su unidad (el
  // Guardian o el Misil). Sin ella la carta no da NINGUNA mecánica
  // (mismo criterio que `pierce_up` con el Guardian): sería una carta
  // inútil en el pool, justo lo que el catálogo prohíbe.
  const techType = TECH_UNIT[card.id];
  if (techType && !findUnit(game, techType)) return false;
  // dev-7 fase 30: "Nido Ampliado" sólo si el jugador tiene el dron
  // Mosquitos y su enjambre no está al tope.
  if (card.id === 'swarm_grow') {
    const d = findDrone(game, 'wasps');
    if (!d) return false;
    // El tope de aplicaciones (CAPS.swarm_grow) lo cuenta `appsOf` en
    // `isCardEligible`: acá sólo queda el tope REAL del enjambre.
    if ((d.waspCount?.() ?? 0) >= MAX_SWARM) return false;
  }
  // dev-7 fase 31: "Burbuja Reforzada" sólo si el Campo de Fuerza tiene
  // ALGO de daño. El dron no tiene daño base: su único daño son las
  // espinas del perk de meta ("Campo de espinas", tier 1 A). Sin ese
  // perk la carta multiplicaba 0 × 1.6 = 0: era INERTE (y el jugador
  // pagaba una carta por nada). Mismo criterio que `detect_up` (que se
  // gatea si no tienes ninguna unidad de rango finito).
  if (card.id === 'dmg_forcefield') {
    if (!findDrone(game, 'forcefield')) return false;
    if ((perkMods('forcefield').thornDps ?? 0) <= 0) return false;
  }  // dev-7 fase 12: la carta de desbloqueo del Black Hole no debe volver
  // a ofrecerse una vez ya elegida (mismo criterio que unlock_* arriba).
  if (card.id === 'black_hole' && game.fortress?.blackHoleUnlocked) return false;
  return true;
}

/**
 * ¿La carta puede entrar al pool de la oferta? (§5 dev-4)
 *
 * fase 64: es RELEVANTE y además no alcanzó su tope de aplicaciones
 * (`CAPS`, anti-stack infinito). Las cartas de un solo uso (desbloqueos,
 * Black Hole) no están en CAPS → su único tope es la relevancia.
 */
export function isCardEligible(card, game) {
  if (!isRelevant(card, game)) return false;
  return appsOf(card.id, game) < (CAPS[card.id] ?? Infinity);
}

/**
 * fase 64 — ¿La carta está ATADA a una unidad concreta del arsenal?
 *
 * Es el filtro del ÚLTIMO RECURSO de `fillOffer`: si el pool elegible se
 * agota, la oferta se rellena, pero una carta de una unidad que el
 * jugador NO tiene no entra NI con el pool vacío. Su `apply` no haría
 * nada y, si fuera un desbloqueo ya gastado, `addTower` —que no deduplica
 * por tipo, sólo busca el primer slot libre— podría colocar una torre
 * DUPLICADA (el reporte del S50: 2 torres misiles).
 *
 * Son las cartas que este archivo ya gatea por unidad: las que OTORGAN
 * una unidad (`unlock_*` y el Black Hole) o la EXIGEN (exclusivas de
 * torre/dron, cartas de técnica, `swarm_grow`, `bullets_5`, `detect_up`).
 */
function needsUnit(card) {
  return !!(card.tower || card.drone || card.id === 'black_hole'
    || EXCLUSIVE_DMG_TOWER[card.id] || EXCLUSIVE_DMG_DRONE[card.id]
    || TECH_UNIT[card.id] || card.id === 'swarm_grow'
    || card.id === 'bullets_5' || card.id === 'detect_up'
    // fase 74: combos y cartas condicionadas por tags/unidades/BH.
    || card.requiresTags?.length || card.requiresAllTags?.length
    || card.requiresUnits?.length || card.requiresTagCount
    || card.requiresCards?.length || card.requiresAnyCards?.length
    || card.requiresBlackHole);
}

// ------------------------------------------------------------
// dev-7 fase 51 — CARTAS DE TÉCNICA (mecánicas en una partida)
// ------------------------------------------------------------
//
// Hasta aquí las CARTAS sólo tocaban multiplicadores y contadores
// sueltos (`dmgMul`, `cadMul`, `fortress.pierce`…): NO podían dar
// MECÁNICAS. Los PERKS de meta (js/meta.js) sí: son el vocabulario
// completo (remate, rebote, perforación, explosión al morir,
// ralentizar, crítico, robo de vida, aturdir).
//
// Estas cartas usan EXACTAMENTE ese vocabulario: `mods` es el mismo
// formato que los perks, y el efecto lo aplica el MISMO código
// (`unitMods()` en js/towers.js → perks.js). No hay una segunda
// implementación de "rebote" ni de "explosión al morir": una carta de
// técnica y el perk equivalente se comportan IGUAL.
//
// Cada carta va a UNA unidad (`unit`): sin esa torre no entra al pool
// (isCardEligible), igual que las cartas de daño exclusivo. Los mods
// se ACUMULAN en la unidad (canal de js/perks.js) y el tope es el de
// CAPS (×2): la 2ª aplicación dobla el efecto, la 3ª no se ofrece.
//
// OJO — `executeThreshold` es un UMBRAL y la política de perks lo
// compone por "el mejor" (meta.js MOD_POLICY): si el jugador ya tiene
// el perk de remate del Misil (0.12–0.15), la 1ª Cabeza Nuclear puede
// no mover el umbral (la 2ª sí: 24 %).
;

/** Carta de técnica → tipo de unidad que la lleva (tope y elegibilidad). */
const TECH_UNIT = Object.fromEntries(TECH_CARDS.map((c) => [c.id, c.unit]));

// ------------------------------------------------------------
// ------------------------------------------------------------
// dev-7 fase 50 - CARTAS DE CAZA (multiplicador contra una familia)
// ------------------------------------------------------------
//
// El sistema de tipos (fase 32) hace que el DAÑo dependa de la familia
// del enemigo. Estas cartas añaden un multiplicador EXTRA contra una
// familia concreta: solo rinden si esa familia aparece, asi que el
// jugador tiene que mirar el bestiario del stage antes de elegir. Se
// aplican a TODAS las unidades (torres y drones).
;

/** Aplica una carta de caza a todas las unidades del campo. */
function applyHuntCard(game, hunt) {
  const f = game?.fortress;
  if (!f) return false;
  if (appsOf(hunt.id, game) >= (CAPS[hunt.id] ?? Infinity)) return false;
  const key = `fam${hunt.family[0].toUpperCase()}${hunt.family.slice(1)}Mul`;
  const mods = { [key]: hunt.mul };
  f.huntStacks ??= {};
  f.huntStacks[hunt.family] = (f.huntStacks[hunt.family] ?? 0) + 1;
  let ok = false;
  for (const t of f.slots ?? []) {
    if (!t) continue;
    if (addCardMods(t, mods, hunt.id)) ok = true;
  }
  for (const d of f.drones ?? []) {
    if (!d) continue;
    if (addCardMods(d, mods, hunt.id)) ok = true;
  }
  return ok;
}

/**
 * fase 74 — daño por TIPO: afecta a todas las unidades del tipo, ahora y
 * a las que se desbloqueen después (`Fortress.applyGlobalCardMods`).
 */
function applyTypeDamage(game, card) {
  const f = game?.fortress;
  if (!f) return false;
  const type = card.type;
  const cur = f.typeStacks?.[type] ?? 0;
  if (cur >= (CAPS[card.id] ?? Infinity)) return false;
  f.typeStacks ??= {};
  f.typeStacks[type] = cur + 1;
  for (const u of allOwnedUnits(game)) {
    if (unitDmgType(u) === type) u.dmgMul = (u.dmgMul ?? 1) * TYPE_DMG_MUL;
  }
  return true;
}

/** fase 74 — Munición Reforzada global, con stacks persistentes. */
function applyGlobalDamage(game) {
  const f = game?.fortress;
  if (!f) return false;
  const cur = f.dmgAllStacks ?? 0;
  if (cur >= CAPS.dmg_all) return false;
  f.dmgAllStacks = cur + 1;
  for (const u of allOwnedUnits(game)) {
    u.dmgAllApps = Math.max(u.dmgAllApps ?? 0, f.dmgAllStacks);
    u.dmgMul = (u.dmgMul ?? 1) * GLOBAL_DMG_MUL;
  }
  return true;
}

/** fase 74 — Servos Acelerados global, con stacks persistentes. */
function applyGlobalCadence(game) {
  const f = game?.fortress;
  if (!f) return false;
  const cur = f.cadAllStacks ?? 0;
  if (cur >= CAPS.cadence_up) return false;
  f.cadAllStacks = cur + 1;
  for (const u of allOwnedUnits(game)) {
    u.cadApps = Math.max(u.cadApps ?? 0, f.cadAllStacks);
    u.cadMul = (u.cadMul ?? 1) * GLOBAL_CAD_MUL;
  }
  return true;
}

/** fase 74 — combos de dos piezas. */
/**
 * Fase 76 — REACTOR DE CADENA → SOBRECARGA.
 * Antes sólo sumaba +1 salto/+1 mini rayo (dos técnicas juntas). Ahora la
 * Tesla conduce el Juicio del Thunder y viceversa: el ión del racimo
 * refuerza el estallido del Thunder y la cadena gana un eslabón.
 */
function applyComboOverload(game) {
  const f = game?.fortress;
  if (!f || !findTower(game, 'thunderstroke') || !findTower(game, 'tesla')) return false;
  comboMods(f).overload = 1;
  return true;
}

/**
 * Fase 76 — PRISMA COMPUESTO → BUCLE DE PRISMA.
 * El Láser activo mantiene el foco del Beam: cambiar de blanco ya no
 * reinicia el ramp mientras un rayo del Láser esté encendido.
 */
function applyComboPrismLoop(game) {
  const f = game?.fortress;
  if (!f || !findTower(game, 'beam') || !findTower(game, 'laser')) return false;
  comboMods(f).prismLoop = 1;
  return true;
}

/**
 * Fase 76 — COSECHA EXPLOSIVA → SINCRONÍA DE ASEDIO.
 * El cráter del Mortar marca `siege`; el Misil suma +1 misil por cada
 * marcado en el campo (máx. +2). No es un +X%: cambia la cantidad de
 * proyectiles y premia combinar las dos artillerías.
 */
function applyComboSiegeSync(game) {
  const f = game?.fortress;
  if (!f || !findTower(game, 'missile') || !findTower(game, 'mortar')) return false;
  comboMods(f).siegeSync = 1;
  return true;
}

/**
 * Fase 76 — REBOTE CONDUCTOR → ARCO DEL GUARDIAN.
 * La Tesla marca `charged` al encadenar; la bala del Guardian consume la
 * marca y descarga 40 % eléctrico a 2 vecinos + 0,2 s de stun.
 */
function applyComboArcGuard(game) {
  const f = game?.fortress;
  if (!f || !findTower(game, 'guardian') || !findTower(game, 'tesla')) return false;
  comboMods(f).arcGuard = 1;
  return true;
}

/**
 * Fase 76 — JUICIO FINAL → GOLPE DE GRACIA.
 * El stun del Thunder marca `judgment`; el Misil sube su umbral de remate
 * a 30 % contra ese blanco (en vez de 6-20 %).
 */
function applyComboCoup(game) {
  const f = game?.fortress;
  if (!f || !findTower(game, 'missile') || !findTower(game, 'thunderstroke')) return false;
  comboMods(f).coup = 1;
  return true;
}

/**
 * Fase 76 — IGNICIÓN: Firewheel prende `burn`; la bala del Guardian lo
 * detona en un pequeño estallido de fuego sobre 2 vecinos.
 */
function applyComboIgnition(game) {
  const f = game?.fortress;
  if (!f || !findTower(game, 'guardian') || !findDrone(game, 'firewheel')) return false;
  comboMods(f).ignition = 1;
  return true;
}

/**
 * Fase 76 — CONCHA DE VENENO: el cráter del Mortar propaga el veneno de
 * los Mosquitos a todo lo que sigue dentro de la zona.
 */
function applyComboVenomShell(game) {
  const f = game?.fortress;
  if (!f || !findTower(game, 'mortar') || !findDrone(game, 'wasps')) return false;
  comboMods(f).venomShell = 1;
  return true;
}

/**
 * Fase 76 — CADENA DE BURBUJA: la cadena de la Tesla salta a cualquier
 * enemigo marcado por la burbuja sin límite de distancia y sin falloff.
 */
function applyComboBubbleChain(game) {
  const f = game?.fortress;
  if (!f || !findTower(game, 'tesla') || !findDrone(game, 'forcefield')) return false;
  comboMods(f).bubbleChain = 1;
  return true;
}

/**
 * Fase 76 — TORMENTA DE RIEL: el rayo del Thunder consume la marca `rail`
 * del Gauss y abre +2 mini rayos con 0,35 s extra de stun.
 */
function applyComboRailstorm(game) {
  const f = game?.fortress;
  if (!f || !findTower(game, 'gauss') || !findTower(game, 'thunderstroke')) return false;
  comboMods(f).railstorm = 1;
  return true;
}

/**
 * Fase 76 — FUSIÓN DEL RIEL: el Gauss contra un blanco con `melt` propaga
 * la marca `rail` a 2 vecinos (anti-blindaje en dos pasos).
 */
function applyComboMeltRail(game) {
  const f = game?.fortress;
  if (!f || !findTower(game, 'beam') || !findTower(game, 'gauss')) return false;
  comboMods(f).meltRail = 1;
  return true;
}

/**
 * Fase 76 — ASEDIO LENTO: con ≥2 enemigos en la burbuja, el Mortar apunta
 * al centro de la burbuja en vez de a un enemigo suelto.
 */
function applyComboSlowSiege(game) {
  const f = game?.fortress;
  if (!f || !findTower(game, 'mortar') || !findDrone(game, 'forcefield')) return false;
  comboMods(f).slowSiege = 1;
  return true;
}

/** fase 74.2 — combos de frío. */
function applyComboAbsoluteZero(game) {
  const f = game?.fortress;
  if (!f) return false;
  comboMods(f).slowLightVuln = 1.2;
  return true;
}

function applyComboFracture(game) {
  const f = game?.fortress;
  if (!f) return false;
  const cm = comboMods(f);
  cm.slowCritChanceAdd = 0.2;
  cm.slowCritDmgAdd = 0.3;
  cm.slowFreezeChance = 0.2;
  return true;
}

function applyComboGlacialWave(game) {
  const f = game?.fortress;
  if (!f) return false;
  const cm = comboMods(f);
  cm.explosionSlowFrac = 0.25;
  cm.explosionSlowTime = 2;
  cm.slowBlastVuln = 1.2;
  return true;
}

/** fase 74.2 — combos de lifesteal. */
function applyComboBloodPact(game) {
  const f = game?.fortress;
  if (!f || !f.blackHoleUnlocked) return false;
  f.blackHoleMods ??= {};
  f.blackHoleMods.drain = (f.blackHoleMods.drain ?? 0) + 0.10;
  f.blackHoleMods.durationAdd = (f.blackHoleMods.durationAdd ?? 0) + 1;
  return true;
}

function applyComboTransfusion(game) {
  const f = game?.fortress;
  if (!f) return false;
  comboMods(f).poisonRegen = 0.5;
  return true;
}

/** fase 74.2 — combos por tipo/mecánica. */
function applyComboRailMark(game) {
  const f = game?.fortress;
  if (!f) return false;
  comboMods(f).railMark = 1;
  return true;
}

function applyComboSharedPierce(game) {
  const f = game?.fortress;
  if (!f) return false;
  comboMods(f).pierceBleed = 1;
  return true;
}

function applyBlackHoleCard(game, key, value) {
  const f = game?.fortress;
  if (!f || !f.blackHoleUnlocked) return false;
  f.blackHoleMods ??= {};
  if (key === 'durationAdd') f.blackHoleMods.durationAdd = (f.blackHoleMods.durationAdd ?? 0) + value;
  if (key === 'radiusMul') f.blackHoleMods.radiusMul = (f.blackHoleMods.radiusMul ?? 1) * value;
  if (key === 'endBurst') f.blackHoleMods.endBurst = (f.blackHoleMods.endBurst ?? 0) + value;
  if (key === 'drain') f.blackHoleMods.drain = (f.blackHoleMods.drain ?? 0) + value;
  if (key === 'singularity') f.blackHoleMods.singularity = 1;
  return true;
}
// CATÁLOGO (81 cartas, schema §5 dev-4)
// {id, name, desc, weight, rarity, dmgType?, minStage?, tower?, apply(game)}
// dev-7 fase 49 - `dmgType` lo declara la carta que MEJORA EL DAÑO de una
// unidad (sale de TOWERS/DRONES, la tabla que usa el combate). El HUD lo
// pinta como glifo junto al nombre y la descripción dice la SINONERGIA con
// cada familia (multiplicador de la carta × matriz de js/damagetypes.js).
// Las cartas que no suben el daño (ni una unidad concreta) NO tienen tipo.
// weight entero positivo (sorteo ponderado estable/testeable).
//
// dev-7 fase 39 — `rarity` la DECLARA cada carta y mide su POTENCIA
// ("Legendario" = una unidad o una habilidad nueva; "Raro" = un buff general
// muy potente; "Poco común" = un buff sólido; "Común" = un ajuste puntual).
// Antes la rareza se DERIVABA del `weight` (la probabilidad de sorteo), así
// que el jugador leía "LEGENDARIO" en cartas que no eran tan fuertes (y al
// revés): la etiqueta no decía nada. `weight` = qué tan seguido sale;
// `rarity` = cuánto vale.
// Las cartas repetibles tienen tope en CAPS (anti-stack infinito);
// las demas son de un solo uso (desbloqueos + Black Hole) o están
// limitadas por su propio estado (Cañón de Ráfaga → Lv.5).
// las 12 restantes son de un solo uso (desbloqueos + Black Hole) o
// están limitadas por su propio estado (Cañón de Ráfaga → Lv.5).
// ============================================================
export const CATALOG = [

  // ---------- Mejoras de torres (§2.2: cada carta suma +1 nivel) ----------
  {
    id: 'bullets_5',
    rarity: 'uncommon',
    name: 'Cañón de Ráfaga',
    // dev-7 fase 49: la carta sube el daño del Guardian → declara su
    // TIPO de daño (el de la torre, no el de la carta).
    dmgType: TOWERS.guardian.dmgType,
    desc: 'Guardian +1 nivel: +1 bala en la ráfaga (tope de 3), +25% daño, -8% recarga. Desde Lv.4 las 3 balas van a 3 enemigos distintos; en Lv.5 atraviesan +1.',
    weight: 10,
    apply: (g) => { findTower(g, 'guardian')?.upgrade(); },
  },
  {
    id: 'dmg_all',
    rarity: 'rare',
    name: 'Munición Reforzada',
    // fase 74: carta GLOBAL. +10% por stack (×1,1² = ×1,21 al tope).
    // El stack vive en la fortaleza y se reaplica a las unidades que se
    // desbloqueen DESPUÉS (Fortress.applyGlobalCardMods).
    desc: '+10% de daño en TODAS las torres y drones, del tipo que sea (acumulable hasta 2 veces).',
    weight: 12,
    apply: (g) => { applyGlobalDamage(g); },
  },
  // fase 74 — DAÑO POR TIPO: más angostas que dmg_all (+20% vs +10% por
  // stack) y afectan a todas las unidades de ese tipo, presentes y futuras.
  {
    id: 'dmg_type_ballistic',
    rarity: 'uncommon',
    name: 'Munición Balística',
    dmgType: 'ballistic',
    desc: `+20% de daño BALÍSTICO a todas las unidades de ese tipo (hasta 2 veces).\n${dmgSynergyText('ballistic', 1.2)}`,
    weight: 9,
    type: 'ballistic',
    requiresTags: ['ballistic'],
    apply: (g) => applyTypeDamage(g, CARD_BY_ID.get('dmg_type_ballistic')),
  },
  {
    id: 'dmg_type_light',
    rarity: 'uncommon',
    name: 'Prisma de Luz',
    dmgType: 'light',
    desc: `+20% de daño de LUZ a todas las unidades de ese tipo (hasta 2 veces).\n${dmgSynergyText('light', 1.2)}`,
    weight: 9,
    type: 'light',
    requiresTags: ['light'],
    apply: (g) => applyTypeDamage(g, CARD_BY_ID.get('dmg_type_light')),
  },
  {
    id: 'dmg_type_blast',
    rarity: 'uncommon',
    name: 'Cargas de Demolición',
    dmgType: 'blast',
    desc: `+20% de daño de EXPLOSIÓN a todas las unidades de ese tipo (hasta 2 veces).\n${dmgSynergyText('blast', 1.2)}`,
    weight: 9,
    type: 'blast',
    requiresTags: ['blast'],
    apply: (g) => applyTypeDamage(g, CARD_BY_ID.get('dmg_type_blast')),
  },
  {
    id: 'dmg_type_electric',
    rarity: 'uncommon',
    name: 'Sobrecarga de Red',
    dmgType: 'electric',
    desc: `+20% de daño ELÉCTRICO a todas las unidades de ese tipo (hasta 2 veces).\n${dmgSynergyText('electric', 1.2)}`,
    weight: 9,
    type: 'electric',
    requiresTags: ['electric'],
    apply: (g) => applyTypeDamage(g, CARD_BY_ID.get('dmg_type_electric')),
  },
  {
    id: 'dmg_type_drone',
    rarity: 'uncommon',
    name: 'Núcleo de Dron',
    dmgType: 'drone',
    desc: `+20% de daño de DRON a todas las unidades de ese tipo (hasta 2 veces).\n${dmgSynergyText('drone', 1.2)}`,
    weight: 9,
    type: 'drone',
    requiresTags: ['drone'],
    apply: (g) => applyTypeDamage(g, CARD_BY_ID.get('dmg_type_drone')),
  },
  {
    id: 'dmg_guard',
    rarity: 'uncommon',
    name: 'Cañones Potenciados',
    // dev-7 fase 49: el tipo sale de la MISMA tabla que usa el combate
    // (TOWERS.guardian.dmgType) y la descripción dice cómo queda contra
    // cada familia, con los números calculados.
    dmgType: TOWERS.guardian.dmgType,
    desc: exclusiveDmgDesc(TOWERS.guardian.name, TOWERS.guardian.dmgType, 1.6, 2, ' por ráfaga'),
    weight: 9,
    apply: (g) => {
      const gw = findTower(g, 'guardian');
      if (gw && (gw.guardDmgApps ?? 0) < CAPS.dmg_guard) {
        gw.guardDmgApps = (gw.guardDmgApps ?? 0) + 1;
        gw.dmgMul = (gw.dmgMul ?? 1) * 1.6;
      }
    },
  },
  // dev-7 fase 12 (pedido del usuario: "incluir cartas para torres
  // específicas") — mismo patrón que Cañones Potenciados (arriba) pero
  // una por cada torre además de Guardian. Cada una exige POSEER esa
  // torre (isCardEligible más abajo) — si no, no entra al pool, igual
  // que bullets_5 con Guardian.
  {
    id: 'dmg_missile',
    rarity: 'uncommon',
    name: 'Ojivas Perforantes',
    dmgType: TOWERS.missile.dmgType,
    desc: exclusiveDmgDesc(TOWERS.missile.name, TOWERS.missile.dmgType, 1.6, 2, ' por impacto'),
    weight: 9,
    apply: (g) => {
      const t = findTower(g, 'missile');
      if (t && (t.exclusiveDmgApps ?? 0) < CAPS.dmg_missile) {
        t.exclusiveDmgApps = (t.exclusiveDmgApps ?? 0) + 1;
        t.dmgMul = (t.dmgMul ?? 1) * 1.6;
      }
    },
  },
  {
    id: 'dmg_beam',
    rarity: 'uncommon',
    name: 'Foco Intensificado',
    dmgType: TOWERS.beam.dmgType,
    desc: exclusiveDmgDesc(TOWERS.beam.name, TOWERS.beam.dmgType, 1.6, 2, ' por segundo'),
    weight: 9,
    apply: (g) => {
      const t = findTower(g, 'beam');
      if (t && (t.exclusiveDmgApps ?? 0) < CAPS.dmg_beam) {
        t.exclusiveDmgApps = (t.exclusiveDmgApps ?? 0) + 1;
        t.dmgMul = (t.dmgMul ?? 1) * 1.6;
      }
    },
  },
  {
    id: 'dmg_thunder',
    rarity: 'uncommon',
    name: 'Descarga Sobrecargada',
    dmgType: TOWERS.thunderstroke.dmgType,
    desc: exclusiveDmgDesc(TOWERS.thunderstroke.name, TOWERS.thunderstroke.dmgType, 1.6, 2, ' por golpe'),
    weight: 9,
    apply: (g) => {
      const t = findTower(g, 'thunderstroke');
      if (t && (t.exclusiveDmgApps ?? 0) < CAPS.dmg_thunder) {
        t.exclusiveDmgApps = (t.exclusiveDmgApps ?? 0) + 1;
        t.dmgMul = (t.dmgMul ?? 1) * 1.6;
      }
    },
  },
  {
    id: 'dmg_tesla',
    rarity: 'uncommon',
    name: 'Bobina Amplificada',
    dmgType: TOWERS.tesla.dmgType,
    desc: exclusiveDmgDesc(TOWERS.tesla.name, TOWERS.tesla.dmgType, 1.6, 2, ' por salto de cadena'),
    weight: 9,
    apply: (g) => {
      const t = findTower(g, 'tesla');
      if (t && (t.exclusiveDmgApps ?? 0) < CAPS.dmg_tesla) {
        t.exclusiveDmgApps = (t.exclusiveDmgApps ?? 0) + 1;
        t.dmgMul = (t.dmgMul ?? 1) * 1.6;
      }
    },
  },
  {
    id: 'dmg_mortar',
    rarity: 'uncommon',
    name: 'Ojiva Pesada',
    dmgType: TOWERS.mortar.dmgType,
    desc: exclusiveDmgDesc(TOWERS.mortar.name, TOWERS.mortar.dmgType, 1.6, 2, ' por impacto'),
    weight: 9,
    apply: (g) => {
      const t = findTower(g, 'mortar');
      if (t && (t.exclusiveDmgApps ?? 0) < CAPS.dmg_mortar) {
        t.exclusiveDmgApps = (t.exclusiveDmgApps ?? 0) + 1;
        t.dmgMul = (t.dmgMul ?? 1) * 1.6;
      }
    },
  },
  {
    id: 'dmg_gauss',
    rarity: 'uncommon',
    name: 'Riel Sobrecargado',
    dmgType: TOWERS.gauss.dmgType,
    desc: exclusiveDmgDesc(TOWERS.gauss.name, TOWERS.gauss.dmgType, 1.6, 2, ' por disparo'),
    weight: 9,
    apply: (g) => {
      const t = findTower(g, 'gauss');
      if (t && (t.exclusiveDmgApps ?? 0) < CAPS.dmg_gauss) {
        t.exclusiveDmgApps = (t.exclusiveDmgApps ?? 0) + 1;
        t.dmgMul = (t.dmgMul ?? 1) * 1.6;
      }
    },
  },
  // dev-7: el arsenal extendido (Láser + los 3 drones) NO tenía carta de
  // daño exclusiva — invertir en el Láser rendía 25% menos que en el
  // Gauss. Estas 4 cartas igualan el catálogo: mismo ×1.6, mismo tope ×2,
  // mismo contador (`exclusiveDmgApps`) y la MISMA exigencia de POSEER la
  // unidad (isCardEligible) que las 6 exclusivas de torre.
  // TODO (dev-7): el multiplicador se guarda en `dmgMul` de la unidad. La
  // torre Láser ya lo lee (`Tower.damage`), pero los DRONES todavía no:
  // su daño sale de `data.dps` (Rueda de Fuego) / `data.stingDamage`
  // (Mosquitos) / las espinas del perk (Campo de Fuerza) en towers.js. Hasta
  // que esas rutas multipliquen por `this.dmgMul`, las 3 cartas de dron no
  // tienen efecto numérico (las de torre sí).
  {
    id: 'dmg_laser',
    rarity: 'uncommon',
    name: 'Haz Concentrado',
    dmgType: TOWERS.laser.dmgType,
    desc: exclusiveDmgDesc(TOWERS.laser.name, TOWERS.laser.dmgType, 1.6, 2, ' por segundo'),
    weight: 9,
    apply: (g) => {
      const t = findTower(g, 'laser');
      if (t && (t.exclusiveDmgApps ?? 0) < CAPS.dmg_laser) {
        t.exclusiveDmgApps = (t.exclusiveDmgApps ?? 0) + 1;
        t.dmgMul = (t.dmgMul ?? 1) * 1.6;
      }
    },
  },
  {
    id: 'dmg_firewheel',
    rarity: 'uncommon',
    name: 'Rueda Incandescente',
    dmgType: DRONES.firewheel.dmgType,
    desc: exclusiveDmgDesc(DRONES.firewheel.name, DRONES.firewheel.dmgType, 1.6, 2, ' por segundo'),
    weight: 9,
    apply: (g) => {
      const d = findDrone(g, 'firewheel');
      if (d && (d.exclusiveDmgApps ?? 0) < CAPS.dmg_firewheel) {
        d.exclusiveDmgApps = (d.exclusiveDmgApps ?? 0) + 1;
        d.dmgMul = (d.dmgMul ?? 1) * 1.6;
      }
    },
  },
  {
    id: 'dmg_wasps',
    rarity: 'uncommon',
    name: 'Aguijón Afilado',
    dmgType: DRONES.wasps.dmgType,
    desc: exclusiveDmgDesc(DRONES.wasps.name, DRONES.wasps.dmgType, 1.6, 2, ' por picadura'),
    weight: 9,
    apply: (g) => {
      const d = findDrone(g, 'wasps');
      if (d && (d.exclusiveDmgApps ?? 0) < CAPS.dmg_wasps) {
        d.exclusiveDmgApps = (d.exclusiveDmgApps ?? 0) + 1;
        d.dmgMul = (d.dmgMul ?? 1) * 1.6;
      }
    },
  },
  {
    // dev-7 fase 30 (rework del Dron Mosquitos): con el enjambre continuo,
    // más mosquitos = más picaduras = más DPS. Es la palanca de carta
    // natural del dron (el equivalente de su perk de meta "+1 mosquito"),
    // y antes el dron NO tenía ninguna carta de crecimiento de cantidad.
    id: 'swarm_grow',
    rarity: 'common',
    name: 'Nido Ampliado',
    desc: 'Dron Mosquitos: +1 mosquito en el enjambre (hasta 2 veces).',
    weight: 8,
    apply: (g) => {
      const d = findDrone(g, 'wasps');
      if (d && (d.swarmApps ?? 0) < CAPS.swarm_grow) {
        d.swarmApps = (d.swarmApps ?? 0) + 1;
        d.extraWasps = (d.extraWasps ?? 0) + 1;
        d.rebuildSwarm?.();
      }
    },
  },
  {
    id: 'dmg_forcefield',
    rarity: 'uncommon',
    name: 'Burbuja Reforzada',
    // dev-7 fase 31: el Campo de Fuerza NO tiene daño base: su daño son
    // las espinas del perk de meta ("Campo de espinas", tier 1 A). Antes
    // esta carta se ofrecía siempre y multiplicaba 0 × 1.6 = 0 (inerte)
    // si el jugador no tenía ese perk (22 860 fragmentos de distancia).
    // Ahora se gatea (ver isCardEligible) y el texto lo dice.
    // dev-7 fase 49: tipo de daño DRON (el de las espinas) + sinonergia.
    dmgType: DRONES.forcefield.dmgType,
    desc: exclusiveDmgDesc(DRONES.forcefield.name, DRONES.forcefield.dmgType, 1.6, 2, ' de las espinas')
      + '\nRequiere el perk "Campo de espinas".',
    weight: 9,
    apply: (g) => {
      const d = findDrone(g, 'forcefield');
      if (d && (d.exclusiveDmgApps ?? 0) < CAPS.dmg_forcefield) {
        d.exclusiveDmgApps = (d.exclusiveDmgApps ?? 0) + 1;
        d.dmgMul = (d.dmgMul ?? 1) * 1.6;
      }
    },
  },
  {
    id: 'cadence_up',
    rarity: 'uncommon',
    // dev-7 fase 49: el nombre viejo ("Servomecanismos") no decía qué
    // hacía: son los servos que ACELERAN la recarga.
    name: 'Servos Acelerados',
    // dev-7 fase 12: antes −15%/stack (×0.85³≈0.614, −38.6% al tope).
    // Ahora −10%/stack (×0.9³≈0.729, −27.1% al tope) — más suave.
    desc: '-10% de tiempo de recarga en todas las torres y en el Dron Mosquitos (hasta 3 veces).',
    weight: 10,
    apply: (g) => { applyGlobalCadence(g); },
  },
  {
    id: 'pierce_up',
    rarity: 'uncommon',
    name: 'Núcleos Perforantes',
    // dev-7: sin tope esta carta se ofrecía en cada level-up y el
    // Guardian atravesaba enemigos sin límite. Tope 3 (CAPS.pierce_up).
    desc: 'Las balas del Guardian atraviesan +1 enemigo antes de disiparse (hasta 3 veces).',
    weight: 7,
    apply: (g) => {
      const f = g.fortress;
      if ((f.pierceApps ?? 0) >= CAPS.pierce_up) return;
      f.pierceApps = (f.pierceApps ?? 0) + 1;
      f.pierce += 1;
    },
  },
  {
    // v5 5c/5 (corrección canónica JK 27-08): carta de PUNTERÍA — balas
    // más rápidas = menos tiempo para esquivarlas (el lead del disparo se
    // recalcula con la velocidad efectiva, así que gana coherencia).
    id: 'rapid_bullets',
    rarity: 'common',
    name: 'Balas Hipersónicas',
    desc: 'Las balas del Guardian vuelan +25% más rápido (mejora la puntería: menos tiempo para esquivarlas). Hasta 2 veces.',
    weight: 8,
    apply: (g) => {
      const gw = findTower(g, 'guardian');
      if (gw && (gw.rapidApps ?? 0) < CAPS.rapid_bullets) {
        gw.rapidApps = (gw.rapidApps ?? 0) + 1;
        gw.bulletSpeedMul = (gw.bulletSpeedMul ?? 1) * 1.25;
      }
    },
  },
  {
    id: 'detect_up',
    rarity: 'uncommon',
    name: 'Sensores Ampliados',
    desc: 'Alcance de detección del Beam y la banda de la Tesla ×1.4 (hasta 2 veces).',
    weight: 4,
    apply: (g) => {
      const f = g.fortress;
      if ((f.detectApps ?? 0) < CAPS.detect_up) {
        f.detectApps = (f.detectApps ?? 0) + 1;
        f.detectMul *= 1.4;
      }
    },
  },

  // ---------- Desbloqueo de TORRES (§2.2/§6 decisión 3: 1 copia) ----------
  {
    id: 'unlock_missile',
    rarity: 'legendary',
    name: 'Torre MISSILE',
    desc: 'Misil homing con explosión en área. Entra en el slot izquierdo (S1).',
    // dev-7 fase 59.3: peso SUBIDO (9 → 13) — las torres son la mitad del
    // DPS del jugador y sólo entran por carta: con el peso viejo (5-9) el
    // sorteo las enterraba y en las etapas tardías el jugador peleaba con
    // 1-2 torres (medido: 5 unidades al final del S35, 9 en el S50).
    // dev-7 fase 64: la BASE vuelve a 10 (los desbloqueos eran las cartas
    // más comunes del catálogo y el usuario los siente "demasiado
    // comunes"), pero la urgencia la pone el PESO EFECTIVO del sorteo
    // (`unlockWeightMul`): ×1.5 con el Guardian solo, ×0.7 con el arsenal
    // armado. Lo que la 59.3 arregló (el arsenal entra temprano) sigue en
    // pie, y además la oferta GARANTIZA 1 desbloqueo con el Guardian solo.
    // Ver el bloque de comentario de la carta "unlock_beam".
    weight: 10,
    tower: 'missile',
    apply: (g) => { g.fortress.addTower('missile'); },
  },
  {
    id: 'unlock_thunderstroke',
    rarity: 'legendary',
    name: 'Torre THUNDERSTROKE',
    desc: 'Descarga instantánea al enemigo con MÁS HP en rango, con stun. Slot S2.',
    weight: 10,
    tower: 'thunderstroke',
    apply: (g) => { g.fortress.addTower('thunderstroke'); },
  },
  {
    id: 'unlock_tesla',
    rarity: 'legendary',
    name: 'Torre TESLA',
    desc: 'Cadena eléctrica púrpura entre varios enemigos. Anti-enjambre. Slot S4.',
    weight: 10,
    tower: 'tesla',
    apply: (g) => { g.fortress.addTower('tesla'); },
  },
  {
    id: 'unlock_beam',
    rarity: 'legendary',
    name: 'Torre BEAM',
    // dev-7 fase 34: el haz ya no es una columna: alcanza 260 px a cada
    // lado y a toda altura, y se clava en el enemigo más duro de su
    // alcance, en cualquier dirección.
    desc: 'Láser verde CONTINUO: alcanza 260 px a cada lado, a toda altura, y se clava en el enemigo más duro de su alcance, en cualquier dirección. Slot derecho (S5).',
    // dev-7 fase 59.3 — POR QUÉ LAS TORRES PESAN MÁS QUE ANTES.
    //
    // El Arsenal es la mitad del DPS del jugador y sólo entra POR CARTA
    // (§6 decisión 3: la run arranca con el Guardian solo). Medido en la
    // fase 59: con los pesos viejos el sorteo enterraba las cartas de
    // desbloqueo (leyenda, peso 5-9) y el jugador llegaba al S35 con UNA
    // torre en el campo y al S50 con nueve — y con la curva de daño del
    // meta (que sólo multiplica las torres QUE ESTÁN en el campo) el
    // nivel meta invertido se queda a medias.
    //
    // Subir el peso de las 10 cartas de desbloqueo + el Black Hole
    // (5-9 → 8-13) hace que aparezcan en la oferta con más frecuencia:
    // el jugador monta su arsenal en las primeras ofertas en vez de
    // gastarse 20 niveles en cartas de daño sobre una sola torre.
    // NO se tocan los topes (CAPS): una torre sigue siendo de una vez.
    //
    // dev-7 fase 64 — EL PESO ADAPTATIVO. Aquella subida dejó a los
    // desbloqueos como las cartas MÁS COMUNES del catálogo (12-13, por
    // encima de dmg_all) y el usuario lo reporta al revés: "las cartas de
    // torre deberían ser un poco más raras". El problema de la 59.3 no era
    // el peso, era CUÁNDO llegan, así que ahora son dos piezas:
    //   · la BASE vuelve a 10 (una torre sigue siendo de lo más pesado:
    //     sólo dmg_all (12) y las exclusivas (9) se le acercan),
    //   · y el sorteo multiplica el peso por `unlockWeightMul(game)`:
    //     ×1.5 con ≤1 torre, ×1.25 con 2, ×1.0 con 3 y ×0.7 con 4-5
    //     (arsenal armado: una torre más interesa menos que invertir en
    //     lo que ya hay). Con el Guardian solo la oferta además GARANTIZA
    //     1 carta de desbloqueo y nunca trae 2 (fase 64, `rollOffer`).
    weight: 10,
    tower: 'beam',
    apply: (g) => { g.fortress.addTower('beam'); },
  },

  // ---------- ARSENAL EXTENDIDO (§2.3: SOLO desde Stage 2) ----------
  {
    id: 'unlock_mortar',
    rarity: 'legendary',
    name: 'ARSENAL: Mortero',
    desc: 'Obús en arco que estalla dañando TODA el área (r=150). Ocupa uno de los 5 slots de la plataforma.',
    weight: 10,
    minStage: 2,
    tower: 'mortar',
    apply: (g) => { g.fortress.addTower('mortar'); },
  },
  {
    id: 'unlock_gauss',
    rarity: 'legendary',
    name: 'ARSENAL: Cañón Gauss',
    desc: 'Perdigón hiper-rápido perforante: atraviesa TODO lo que encuentra en su línea. Ocupa uno de los 5 slots.',
    weight: 10,
    minStage: 2,
    tower: 'gauss',
    apply: (g) => { g.fortress.addTower('gauss'); },
  },
  {
    id: 'unlock_laser',
    rarity: 'legendary',
    name: 'ARSENAL: Torre Láser',
    desc: 'Apunta al enemigo y dispara un láser recto que dura unos segundos: estático y penetrante, daña todo lo que toca. Ocupa uno de los 5 slots.',
    weight: 10,
    minStage: 2,
    tower: 'laser',
    apply: (g) => { g.fortress.addTower('laser'); },
  },
  {
    id: 'unlock_drone_firewheel',
    rarity: 'legendary',
    name: 'ARSENAL: Dron Rueda de Fuego',
    desc: 'Rueda incandescente que orbita la base (r=120) quemando 25/s todo lo que toca. Un dron por partida.',
    weight: 10,
    minStage: 2,
    drone: 'firewheel',
    apply: (g) => { g.fortress.addDrone('firewheel'); },
  },
  {
    id: 'unlock_drone_wasps',
    rarity: 'legendary',
    name: 'ARSENAL: Dron Mosquitos',
    desc: '3 mosquitos que persiguen enemigos, pican e inyectan veneno; sus perks de hematofagia drenan vida al escudo. Un dron por partida.',
    weight: 10,
    minStage: 2,
    drone: 'wasps',
    apply: (g) => { g.fortress.addDrone('wasps'); },
  },
  {
    id: 'unlock_drone_forcefield',
    rarity: 'legendary',
    name: 'ARSENAL: Dron Campo de Fuerza',
    desc: 'Burbuja r=140 que frena los enemigos dentro: −30% de velocidad de caída. Un dron por partida.',
    weight: 10,
    minStage: 2,
    drone: 'forcefield',
    apply: (g) => { g.fortress.addDrone('forcefield'); },
  },
  {
    id: 'black_hole',
    rarity: 'legendary',
    name: 'DESBLOQUEA: Black Hole',
    // dev-7 fase 12 (pedido del usuario: "no tiene que estar disponible
    // siempre, solo cuando uno elige la carta, ahí queda disponible para
    // toda la partida"): antes el medidor cargaba solo desde el arranque
    // sin que el jugador pidiera nada; ahora esta carta lo DESBLOQUEA
    // (y de regalo lo deja listo al instante) — antes de elegirla el
    // botón [B] ni siquiera se ve en el HUD (ver hud.js).
    desc: 'Desbloquea el vórtice Black Hole para el resto de la partida y arranca con el medidor LISTO. El vórtice succiona 4 s desintegrando a 10/s.',
    // dev-7 fase 64: 7 → 6 (mismo ajuste que los desbloqueos de unidad: el
    // arsenal pesaba demasiado en el sorteo). Con el peso adaptativo queda
    // en ×1.5·6 = 9 con el Guardian solo.
    weight: 6,
    minStage: 2,
    apply: (g) => {
      g.fortress.blackHoleUnlocked = true;
      g.fortress.blackHoleCharge = 1; // regalo de bienvenida: listo al instante
      g.fortress.bhReady = true;
    },
  },

  // ---------- Defensa y economía (§5 dev-4) ----------
  {
    id: 'repair_500',
    rarity: 'common',
    name: 'Reparación de Campo',
    desc: 'Restaura +500 de HP del escudo de la base al instante (hasta 3 veces).',
    weight: 5,
    apply: (g) => {
      const f = g.fortress;
      // dev-7 fase 26: tope explícito (antes era ilimitada).
      if ((f.repairApps ?? 0) >= CAPS.repair_500) return;
      f.repairApps = (f.repairApps ?? 0) + 1;
      f.hp = Math.min(f.maxHp, f.hp + 500);
    },
  },
  {
    id: 'armor_plate',
    rarity: 'rare',
    name: 'Blindaje de Base',
    // dev-7 (recalibración): era +800 de HP máximo con tope 2 → +1 600
    // sobre una base de 3 000 (+53%). Con LEAK_DMG_CAP = 50 por leak eso
    // toleraba 32 leaks extra: la base quedaba prácticamente inmatable y
    // se anulaba el cambio de balance v7 (los leaks tienen que doler).
    // Ahora: +600 y UNA sola vez (+20% de la base) — un empujón real sin
    // volver la base imposible de matar.
    desc: '+600 de HP máximo del escudo (y lo repara de inmediato). Solo se puede elegir una vez.',
    weight: 4,
    apply: (g) => {
      const f = g.fortress;
      // dev-7 fase 26: tope explícito (antes era ilimitada y hacía la base
      // prácticamente inmatable por leaks).
      if ((f.armorApps ?? 0) >= CAPS.armor_plate) return;
      f.armorApps = (f.armorApps ?? 0) + 1;
      f.maxHp += 600;
      f.hp += 600;
    },
  },
  {
    id: 'base_shield',
    rarity: 'uncommon',
    name: 'Escudo de Base',
    desc: 'Bloquea el próximo golpe que recibiría la base (máx 2 cargas).',
    weight: 4,
    apply: (g) => {
      const f = g.fortress;
      if ((f.baseShieldApps ?? 0) < CAPS.base_shield) {
        f.baseShieldApps = (f.baseShieldApps ?? 0) + 1;
        f.baseShields = Math.min(CAPS.base_shield, f.baseShields + 1);
      }
    },
  },
  {
    id: 'ult_charge',
    rarity: 'uncommon',
    name: 'Carga Orbital',
    // dev-7: sin tope esta carta se ofrecía en CADA level-up de la run.
    // Tope 1 (CAPS.ult_charge): una sola recarga extra del ultimate.
    desc: 'Suma 35% de carga del ORBITAL STRIKE al instante (una sola vez).',
    weight: 5,
    apply: (g) => {
      const f = g.fortress;
      if ((f.ultChargeApps ?? 0) >= CAPS.ult_charge) return;
      f.ultChargeApps = (f.ultChargeApps ?? 0) + 1;
      f.chargeUltimate?.(14); // 14/40 ≈ 35%
    },
  },
  {
    id: 'ult_power',
    rarity: 'uncommon',
    name: 'Impacto Orbital+',
    // dev-7 fase 49: el ORBITAL STRIKE es un impacto en ÁREA (el
    // proyectil va con splashR → el combate lo resuelve como 'blast'),
    // así que la carta declara ese tipo de daño.
    dmgType: 'blast',
    desc: 'Los impactos del ORBITAL STRIKE hacen +50% de daño de EXPLOSIÓN (hasta 2 veces).',
    weight: 8,
    apply: (g) => {
      const f = g.fortress;
      if ((f.orbitalPowerApps ?? 0) < CAPS.ult_power) {
        f.orbitalPowerApps = (f.orbitalPowerApps ?? 0) + 1;
        f.orbitalDmgMul *= 1.5;
      }
    },
  },

  // ---------- CARTAS DE TÉCNICA (dev-7 fase 51) ----------
  // Mecánicas de verdad, no multiplicadores: cada una da a su unidad
  // los MISMOS mods que usa el perk equivalente (ver TECH_CARDS) y los
  // aplica el mismo código (unitMods → perks.js).
  // dev-7 fase 50 - LA CAZA DE FAMILIA.
  ...HUNT_CARDS.map((hunt) => ({
    ...hunt,
    apply: (g) => { applyHuntCard(g, hunt); },
  })),
  ...TECH_CARDS.map((tech) => ({
    ...tech,
    apply: (g) => { applyTechCard(g, tech); },
  })),
  // fase 74 — COMBOS de dos piezas y cartas de Black Hole. No son
  // repetibles: CAPS = 1. `requiresUnits`/`requiresTags`/`requiresBlackHole`
  // los saca del pool si falta la pareja (no hay cartas muertas).
  {
    id: 'combo_overload',
    rarity: 'rare',
    name: 'Sobrecarga',
    desc: 'La Tesla conduce el Juicio del Thunderstroke: +1 salto de cadena y +2 objetivos de área contra el racimo ionizado. Requiere ambas torres.',
    weight: 5,
    requiresUnits: ['thunderstroke', 'tesla'],
    apply: (g) => applyComboOverload(g),
  },
  {
    id: 'combo_prism_loop',
    rarity: 'rare',
    name: 'Bucle de Prisma',
    desc: 'Mientras un Láser esté encendido, el Beam no pierde su ramp al cambiar de blanco y su tope sube +0,5. Requiere Beam y Láser.',
    weight: 5,
    requiresUnits: ['beam', 'laser'],
    apply: (g) => applyComboPrismLoop(g),
  },
  {
    id: 'combo_singularity',
    rarity: 'legendary',
    name: 'Singularidad',
    desc: 'Las explosiones de Missile, Mortar y Balas Detonantes dejan un mini agujero negro que atrae y quema. Requiere Black Hole y una torre explosiva.',
    weight: 4,
    requiresBlackHole: true,
    requiresTags: ['blast'],
    apply: (g) => applyBlackHoleCard(g, 'singularity', 1),
  },
  {
    id: 'bh_horizon',
    rarity: 'rare',
    name: 'Horizonte de Sucesos',
    desc: 'El Black Hole dura +1,5 s y tiene +20% de radio. Requiere Black Hole desbloqueado.',
    weight: 5,
    requiresBlackHole: true,
    apply: (g) => {
      applyBlackHoleCard(g, 'durationAdd', 1.5);
      applyBlackHoleCard(g, 'radiusMul', 1.2);
    },
  },
  {
    id: 'bh_collapse',
    rarity: 'rare',
    name: 'Colapso',
    desc: 'Al terminar, el Black Hole explota por 150 de daño en su radio. Requiere Black Hole desbloqueado.',
    weight: 5,
    requiresBlackHole: true,
    apply: (g) => applyBlackHoleCard(g, 'endBurst', 150),
  },
  // fase 74.2 — combos de frío, lifesteal y tipo/mecánica.
  {
    id: 'combo_absolute_zero',
    rarity: 'rare',
    name: 'Cero Absoluto',
    desc: 'Los enemigos ralentizados reciben +20% de daño de LUZ. Requiere Balas Gélidas y Beam o Láser.',
    weight: 5,
    requiresCards: ['tech_slow'],
    requiresTags: ['light'],
    apply: (g) => applyComboAbsoluteZero(g),
  },
  {
    id: 'combo_fracture',
    rarity: 'rare',
    name: 'Fractura Criogénica',
    desc: 'Contra enemigos ralentizados: +20% de crítico, +30% de daño crítico y 20% de congelarlos 0,5 s. Requiere Balas Gélidas y Ojo de Halcón.',
    weight: 5,
    requiresCards: ['tech_slow', 'tech_crit'],
    apply: (g) => applyComboFracture(g),
  },
  {
    id: 'combo_glacial_wave',
    rarity: 'rare',
    name: 'Onda Glacial',
    desc: 'Las explosiones de Missile/Mortar aplican 25% de slow por 2 s; los ralentizados reciben +20% de daño de explosión. Requiere Balas Gélidas y Missile o Mortar.',
    weight: 5,
    requiresCards: ['tech_slow'],
    requiresTags: ['blast'],
    apply: (g) => applyComboGlacialWave(g),
  },
  {
    id: 'combo_siege_sync',
    rarity: 'rare',
    name: 'Sincronía de Asedio',
    desc: 'El cráter del Mortar marca 2 s; el Misil dispara +1 misil por cada marcado (máx. +2). Requiere Misil y Mortar.',
    weight: 5,
    requiresUnits: ['missile', 'mortar'],
    apply: (g) => applyComboSiegeSync(g),
  },
  {
    id: 'combo_ignition',
    rarity: 'rare',
    name: 'Ignición Compartida',
    desc: 'La Rueda de Fuego prende burn; las balas del Guardian lo detonan en un estallido de fuego sobre 2 vecinos. Requiere Guardian y Rueda de Fuego.',
    weight: 5,
    requiresUnits: ['guardian'],
    requiresTags: ['contact'],
    apply: (g) => applyComboIgnition(g),
  },
  {
    id: 'combo_venom_shell',
    rarity: 'rare',
    name: 'Concha de Veneno',
    desc: 'El cráter del Mortar propaga el veneno de los Mosquitos a todo lo que queda dentro de la zona. Requiere Mortar y Mosquitos.',
    weight: 5,
    requiresUnits: ['mortar'],
    requiresTags: ['swarm'],
    apply: (g) => applyComboVenomShell(g),
  },
  {
    id: 'combo_bubble_chain',
    rarity: 'rare',
    name: 'Cadena de Burbuja',
    desc: 'La cadena de la Tesla salta a cualquier enemigo atrapado por la burbuja, sin límite de distancia y sin falloff. Requiere Tesla y Campo de Fuerza.',
    weight: 5,
    requiresUnits: ['tesla'],
    requiresTags: ['shield'],
    apply: (g) => applyComboBubbleChain(g),
  },
  {
    id: 'combo_railstorm',
    rarity: 'rare',
    name: 'Tormenta de Riel',
    desc: 'El rayo del Thunderstroke consume la marca de riel del Gauss: +2 mini rayos y +0,35 s de stun. Requiere Gauss y Thunderstroke.',
    weight: 5,
    requiresUnits: ['gauss', 'thunderstroke'],
    apply: (g) => applyComboRailstorm(g),
  },
  {
    id: 'combo_melt_rail',
    rarity: 'rare',
    name: 'Fusión del Riel',
    desc: 'El Gauss contra un blanco fundido por el Beam propaga la marca de riel a 2 vecinos. Requiere Beam y Gauss.',
    weight: 5,
    requiresUnits: ['beam', 'gauss'],
    apply: (g) => applyComboMeltRail(g),
  },
  {
    id: 'combo_slow_siege',
    rarity: 'rare',
    name: 'Asedio Lento',
    desc: 'Con 2 o más enemigos en la burbuja, el Mortar apunta al centro de la burbuja en vez de a un blanco suelto. Requiere Mortar y Campo de Fuerza.',
    weight: 5,
    requiresUnits: ['mortar'],
    requiresTags: ['shield'],
    apply: (g) => applyComboSlowSiege(g),
  },
  {
    id: 'combo_blood_pact',
    rarity: 'rare',
    name: 'Pacto de Sangre',
    desc: 'El Black Hole cura 10% del daño que hace y dura +1 s. Requiere Drenaje del Haz, Beam y Black Hole desbloqueado.',
    weight: 5,
    requiresCards: ['tech_lifesteal'],
    requiresUnits: ['beam'],
    requiresBlackHole: true,
    apply: (g) => applyComboBloodPact(g),
  },
  {
    id: 'combo_transfusion',
    rarity: 'rare',
    name: 'Transfusión',
    desc: 'Cada enemigo envenenado por los Mosquitos regenera 0,5 HP/s al escudo (tope 5 HP/s). Requiere Drenaje del Haz, Beam y el dron Mosquitos.',
    weight: 5,
    requiresCards: ['tech_lifesteal'],
    requiresUnits: ['beam', 'wasps'],
    apply: (g) => applyComboTransfusion(g),
  },
  {
    id: 'combo_rail_mark',
    rarity: 'rare',
    name: 'Marca de Riel',
    desc: 'Los impactos del Gauss marcan 2 s; las balas del Guardian hacen +25% a los marcados. Requiere Guardian y Gauss.',
    weight: 5,
    requiresUnits: ['guardian', 'gauss'],
    apply: (g) => applyComboRailMark(g),
  },
  {
    id: 'combo_coup',
    rarity: 'rare',
    name: 'Golpe de Gracia',
    desc: 'El stun del Thunderstroke marca Juicio; el Misil remata bajo el 30% contra un marcado. Requiere Misil y Thunderstroke.',
    weight: 5,
    requiresUnits: ['missile', 'thunderstroke'],
    apply: (g) => applyComboCoup(g),
  },
  {
    id: 'combo_arc_guard',
    rarity: 'rare',
    name: 'Arco del Guardian',
    desc: 'La Tesla marca charged al encadenar; la bala del Guardian consume la marca y descarga 40% eléctrico a 2 vecinos con 0,2 s de stun. Requiere Guardian y Tesla.',
    weight: 5,
    requiresUnits: ['guardian', 'tesla'],
    apply: (g) => applyComboArcGuard(g),
  },
  {
    id: 'combo_shared_pierce',
    rarity: 'rare',
    name: 'Perforación Compartida',
    desc: 'Los enemigos atravesados por Guardian o Gauss sangran 0,5% de su HP máximo por segundo durante 2 s. Requiere Núcleos Perforantes y Gauss.',
    weight: 5,
    requiresCards: ['tech_pierce'],
    requiresUnits: ['gauss'],
    apply: (g) => applyComboSharedPierce(g),
  },
];

const CARD_BY_ID = new Map(CATALOG.map((c) => [c.id, c]));



// ------------------------------------------------------------
// rollOffer (§5 dev-4): 3 cartas SIN repetir, respetando minStage,
// pesos y exclusiones dinámicas. rng inyectable = testeable.
// ------------------------------------------------------------

/**
 * Sorteo ponderado clásico sobre los ítems aún disponibles. `weightOf`
 * permite que el peso EFECTIVO dependa de la partida (fase 64) sin tocar
 * el `weight` de la ficha del catálogo (el dato que leen los tests de
 * invariantes: el HUD pinta `rarity`, no el peso).
 */
function weightedPick(items, rnd, weightOf = (c) => c.weight) {
  const total = items.reduce((s, c) => s + weightOf(c), 0);
  let r = rnd() * total;
  for (const it of items) {
    r -= weightOf(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/**
 * Carta de DESBLOQUEO: otorga una unidad nueva (torre o dron) o el Black
 * Hole. Es el grupo que la fase 64 limita a UNA por oferta (dos
 * desbloqueos juntos = media docena de "torres" que el usuario ve como
 * demasiado comunes) y el que acelera el peso con el arsenal vacío.
 */
function isUnlockCard(c) {
  return !!(c.tower || c.drone || c.id === 'black_hole');
}

/**
 * fase 64 — PESO ADAPTATIVO de las cartas de desbloqueo: cuánto pesa un
 * desbloqueo depende de cuántas torres ya tenés.
 *
 * POR QUÉ: la fase 59.3 les subió el peso BASE (5-9 → 8-13) porque con
 * los pesos viejos el jugador llegaba al S35 con UNA torre (§6 decisión 3:
 * el arsenal entra sólo por carta, ver el bloque de "unlock_beam"). Eso
 * los dejó como las cartas más comunes del catálogo y el usuario lo
 * reporta: "las cartas de torre deberían ser un poco más raras". El
 * problema real de la 59.3 era CUÁNDO llegan (ver docs/BALANCE.md), no el
 * peso, así que ahora la base baja a 10 y la urgencia la pone este
 * multiplicador:
 *
 *   · ≤1 torre (sólo el Guardian) → ×1.5: hay que montar el arsenal YA
 *     (ese era el error de la 59.3: el jugador terminaba el S35 con una
 *     sola torre),
 *   · 2 torres → ×1.25 · 3 torres → ×1.0 (peso base),
 *   · 4-5 torres → ×0.7: el arsenal ya está armado (y con 5 no hay slot),
 *     así que una torre más interesa menos que invertir en lo que hay.
 *
 * @param {object} game
 * @returns {number} multiplicador (1 = peso base del catálogo)
 */
export function unlockWeightMul(game) {
  const torres = ownedTypes(game).size;
  if (torres <= 1) return 1.5;
  if (torres === 2) return 1.25;
  if (torres === 3) return 1;
  return 0.7;
}

/** Peso EFECTIVO de una carta en el sorteo (fase 64). */
function weightOf(card, game) {
  if (!isUnlockCard(card)) return card.weight;
  let mul = unlockWeightMul(game);
  // El cupo de drones es 1 (fase 61) y un dron nunca "sobra": mientras el
  // jugador no tenga ninguno, su carta no pierde peso aunque el arsenal
  // de torres ya esté armado.
  if (card.drone && !(game?.fortress?.drones?.length ?? 0)) mul = Math.max(mul, 1);
  return card.weight * mul;
}

/**
 * Carta de un solo uso ya consumida: la torre que desbloquea ya está
 * puesta, el dron no tiene cupo o el Black Hole ya fue desbloqueado.
 * (Una carta así volvería a ofrecerse sin efecto real.)
 */
function isSpentOneShot(card, game) {
  const f = game?.fortress;
  // fase 61: una torre está "gastada" si ya la tenés O si no queda ningún
  // slot donde ponerla. Sin la segunda mitad, `fillOffer` podía re-ofrecer
  // una torre con el arsenal lleno: el jugador la elegía y no pasaba nada
  // (la colocación falla), que es exactamente el soft-look silencioso que
  // esta red de seguridad debe evitar.
  if (card.tower) return ownedTypes(game).has(card.tower) || !f?.slots?.some((s) => !s);
  if (card.drone) return (f?.drones?.length ?? 0) >= MAX_DRONES;
  if (card.id === 'black_hole') return !!f?.blackHoleUnlocked;
  return false;
}

/**
 * Rellena la oferta cuando el pool elegible no alcanza para 3 cartas.
 *
 * POR QUÉ hace falta: el modal de cartas no se puede cerrar sin elegir
 * (hud.js) → una oferta de 0 o 1 cartas deja la run TRABADA en
 * CARD_CHOICE (soft-lock). Con los topes de CAPS el pool elegible se
 * puede quedar corto (run larga: todas las repetibles agotadas + todas
 * las unidades ya compradas), así que la oferta se completa con:
 *   1) las repetibles YA AGOTADAS pero RELEVANTES — elegirlas es inocuo
 *      (su `apply` respeta el tope y no hace nada),
 *   2) los desbloqueos que el jugador todavía no usó (dan una unidad o
 *      el Black Hole: siempre otorgan algo),
 *   3) cualquier carta RELEVANTE del catálogo (su tope ya no importa),
 *   4) último recurso para no dejar el modal vacío: cualquier carta
 *      GENÉRICA (sin unidad).
 *
 * ⚠ REGLA DE LA FASE 64: una carta de una UNIDAD AUSENTE no entra a la
 * oferta NI como último recurso. Antes el relleno miraba sólo `minStage`,
 * así que en una run larga podía re-ofrecer un desbloqueo YA GASTADO: con
 * slots libres `addTower` lo colocaba de nuevo y el jugador quedaba con
 * dos torres del mismo tipo (el reporte del S50: 2 torres misiles).
 * En los estados normales (pool ≥ 3) esta función no hace nada.
 */
function fillOffer(game, picks) {
  const stage = game?.stageId ?? 1;
  const count = offerCountFor(game);
  const out = [...picks];
  const push = (c) => {
    if (out.length >= count) return;
    if (out.includes(c)) return;
    out.push(c);
  };
  // 1) repetibles agotadas (y relevantes: de una unidad que el jugador
  //    tiene — su carta sigue sirviendo "en teoría", sólo la topó).
  for (const c of CATALOG) {
    if (CAPS[c.id] === undefined) continue;
    if (isRelevant(c, game)) push(c);
  }
  // 2) desbloqueos pendientes (torre/dron/Black Hole que aún no se usó).
  for (const c of CATALOG) {
    if (!isUnlockCard(c)) continue;
    if (!isRelevant(c, game)) continue;
    if (!isSpentOneShot(c, game)) push(c);
  }
  // 3) cualquier carta relevante del catálogo.
  for (const c of CATALOG) {
    if (isRelevant(c, game)) push(c);
  }
  // 4) último recurso: una carta GENÉRICA (sin unidad) del catálogo,
  //    aunque su tope esté gastado. Nunca una de una unidad que el
  //    jugador NO tiene (ver el aviso de arriba).
  for (const c of CATALOG) {
    if ((c.minStage ?? 1) > stage) continue;
    if (needsUnit(c)) continue;
    push(c);
  }
  return out;
}

/**
 * Oferta de LEVEL UP: [card, card, card].
 *
 * fase 64 — DOS REGLAS NUEVAS sobre el sorteo ponderado de siempre:
 *   · como MÁXIMO 1 carta de desbloqueo por oferta (dos juntas son la
 *     mitad de las "torres demasiado comunes" del reporte: el jugador
 *     elegía el Misil en la 1ª oferta y le volvía a salir en la 2ª),
 *   · y con el Guardian SOLO (≤1 torre) la oferta GARANTIZA exactamente
 *     1 desbloqueo: sin arsenal el jugador pelea con una sola torre
 *     hasta el final de la run (ver `unlockWeightMul`).
 * Si al restringir el pool no queda ninguna carta no-desbloqueo, la regla
 * cede: antes una oferta corta que el modal que no se puede cerrar.
 *
 * @param {object} game — usa game.stageId y game.fortress
 * @param {()=>number} rng — generador [0,1) inyectable (tests)
 */
export function rollOffer(game, rng = Math.random) {
  const pool = CATALOG.filter((c) => isCardEligible(c, game));
  const weigh = (c) => weightOf(c, game);
  // fase 69: la oferta puede venir RECORTADA por el Protocolo (Censura).
  const count = offerCountFor(game);
  const picks = [];
  let allowUnlock = true;
  const forceUnlock = ownedTypes(game).size <= 1 && pool.some(isUnlockCard);
  while (pool.length > 0 && picks.length < count) {
    let candidatos = allowUnlock ? pool : pool.filter((c) => !isUnlockCard(c));
    if (forceUnlock && picks.length === 0) candidatos = pool.filter(isUnlockCard);
    if (candidatos.length === 0) candidatos = pool; // resto sólo de desbloqueos
    const pick = weightedPick(candidatos, rng, weigh);
    pool.splice(pool.indexOf(pick), 1);
    picks.push(pick);
    if (isUnlockCard(pick)) allowUnlock = false;
  }
  // dev-7: la oferta NUNCA puede quedar corta (soft-lock en CARD_CHOICE).
  if (picks.length < count) return fillOffer(game, picks);
  return picks;
}

// ------------------------------------------------------------
// applyCard (§5 dev-4): aplica efectos REALES sobre game.
// Devuelve la carta aplicada (null si id desconocido).
// ------------------------------------------------------------
export function applyCard(card, game) {
  const c = typeof card === 'string' ? CARD_BY_ID.get(card) : card;
  if (!c || typeof c.apply !== 'function') return null;
  // fase 75: los combos y las cartas de Black Hole se aplican UNA vez.
  // `fillOffer` puede reofrecer una carta topada como relleno; antes su
  // `apply` no miraba `appsOf` y apilar combo_swarm_link/bh_horizon dos
  // veces seguía sumando pese al CAPS. Las cartas globales conservan su
  // comportamiento histórico (su apply ya respeta el tope).
  const cap = CAPS[c.id];
  if (cap !== undefined && (c.id.startsWith('combo_') || c.id.startsWith('bh_'))
    && appsOf(c.id, game) >= cap) {
    return null;
  }
  c.apply(game);
  return c;
}

// ------------------------------------------------------------
// comboSummary (BUG-005): datos reales para el panel 🃏 del HUD
// (torres poseídas + niveles + modificadores activos, §1.5/§4.4).
// Puro: sin DOM — hud.js lo formatea.
// ------------------------------------------------------------
export function comboSummary(game) {
  const f = game?.fortress;
  const towers = (f?.slots ?? [])
    .filter(Boolean)
    .map((t) => ({
      type: t.type,
      name: t.data?.name ?? t.type,
      level: t.level,
      slot: t.slotIndex,
      dmgMul: t.dmgMul ?? 1,
      cadMul: t.cadMul ?? 1,
      // dev-7 fase 32: el TIPO de daño de la unidad (balístico / luz /
      // explosión / eléctrico / dron). El panel de combos lo muestra para
      // que el jugador sepa contra qué familia de enemigos rinde cada una.
      dmgType: t.data?.dmgType ?? null,
      // dev-7 fase 30: sin `pips` - el dato estaba muerto (el HUD pintaba
      // las estrellas desde `t.level`, no desde aquí) y además mentía:
      // el nivel de torre sólo lo sube la carta "Abanico Ampliado" del
      // Guardian, así que las demás mostraban siempre "★☆☆☆☆".
    }));
  return {
    towers,
    drones: (f?.drones ?? []).map((d) => ({
      type: d.type,
      name: d.data?.name ?? d.type,
      dmgType: d.data?.dmgType ?? null,
    })),
    blackHoleCharge: f?.blackHoleCharge ?? 0, // 0..1 - medidor por kills (v4 4b/5)
    blackHoleUnlocked: !!f?.blackHoleUnlocked,
    blackHoleMods: f?.blackHoleMods ?? null,
    // fase 74: tags activos para que el panel de combos muestre qué
    // sinergias están disponibles (eléctrico, explosivo, etc.).
    tags: [...ownedTags(game)].sort(),
    pierce: f?.pierce ?? 0,
    baseShields: f?.baseShields ?? 0,
    orbitalDmgMul: f?.orbitalDmgMul ?? 1,
    lv: game?.lv ?? 1,
    kills: game?.kills ?? 0,
  };
}
