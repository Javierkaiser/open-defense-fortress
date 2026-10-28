#!/usr/bin/env node
// ============================================================
// scripts/balance-sim.mjs — dev-7 fase 6 (reconstrucción) + fase 26
//   (determinismo, techo con cartas reales, ultimate, campaña completa)
//
// docs/BALANCE.md (dev-5 en adelante) documenta TODOS sus resultados con un
// simulador headless de este nombre, pero el archivo no venía en el
// proyecto (ver docs/TESTING.md — mismo problema que la suite de
// tests). Este archivo lo RECONSTRUYE desde cero, leyendo el código real
// (no re-implementa reglas de balance a mano): usa Fortress/Tower/Enemy/
// WaveManager/collideProjectiles/cards.js REALES, con un stub de
// "engine" sin canvas/DOM/audio (igual que describe docs/BALANCE.md:
// "Engine stub sin render").
//
// ------------------------------------------------------------
// DETERMINISMO (fase 26)
// ------------------------------------------------------------
// TODO el azar del juego sale de Math.random: la tabla de olas procedural
// (waves.js:392 → generateStageWaves(stage, (Math.random()*1e9)|0)), el
// spawn y la deriva de los enemigos, los crits, los stuns y las
// explosiones al matar. Antes el sim NO sembraba nada: cada corrida del
// mismo comando pasaba una tabla de olas distinta (±30 pts de win% en el
// MISMO stage) y ningún número de docs/BALANCE.md era reproducible.
//
// Ahora se siembra Math.random con un xorshift32 POR RUN (stage, seed)
// ANTES de construir el WaveManager y se RESTAURA al terminar la run.
// Las ofertas de cartas usan un flujo SEPARADO (rngCards) para que el
// sorteo de cartas no dependa de cuánto azar consumió el mundo.
//
// Mismo patrón que scripts/probe-s6.mjs (línea ~132).
//
// Cada run carga además una instancia FRESCA de js/waves.js (import con
// query): el módulo guarda a nivel de archivo la zona de entrada del jefe
// (nextBossEntry → _lastBossZone), así que reutilizar la instancia haría
// que un stage dependiera de los stages corridos antes en el mismo proceso.
//
// ------------------------------------------------------------
// ULTIMATE / BLACK HOLE (fase 26)
// ------------------------------------------------------------
// El sim representa a un jugador que USA sus medidores: cuando el ORBITAL
// STRIKE (o el Black Hole) está listo, lo dispara — como el jugador real
// (main.js: _tryFireUltimate / _tryFireBlackHole). Antes el sim solo los
// CARGABA y nunca los gastaba: 1080 de daño por ultimate quedaban sin usar
// y el "piso" de docs/BALANCE.md era un piso de un piso.
//
// ------------------------------------------------------------
// TECHO DE PODER (--cards=ceiling)
// ------------------------------------------------------------
// El techo se aplica con las CARTAS REALES de js/cards.js (applyCard)
// hasta que dejan de hacer efecto (o sea, hasta su tope real — los CAPS
// del catálogo), NO con multiplicadores escritos a mano: así los valores
// Y los contadores de aplicaciones salen de cards.js y las cartas topadas
// desaparecen del pool (isCardEligible). Con multiplicadores a mano el
// "techo" se aplicaba DOS veces (double-dip: la carta seguía elegible y
// el jugador simulado la tomaba otra vez encima del techo).
//
// Aviso (cards.js): las cartas EXCLUSIVAS por torre (dmg_missile, ...)
// no llevan la cuenta en appsOf(), así que isCardEligible() las sigue
// ofreciendo después de topadas. El sim las marca como topeadas por su
// cuenta (game._ceilingCapped) para que el techo siga siendo un techo.
//
// ------------------------------------------------------------
// USO
// ------------------------------------------------------------
//   node scripts/balance-sim.mjs                 → campaña: stages 1,2,3,4,5,6,10,20,30,50 (5 seeds)
//   node scripts/balance-sim.mjs --stages=1-50  → los 50 stages
//   node scripts/balance-sim.mjs --stages=1,5,10 → lista explícita de stages
//   node scripts/balance-sim.mjs --stage=6      → UN solo stage (igual que antes)
//   node scripts/balance-sim.mjs --mode=tardy   → modo tardy (elección de carta)
//   node scripts/balance-sim.mjs --mode=mixto   → modo mixto (desbloqueo al azar: juega el arsenal)
//   node scripts/balance-sim.mjs --mode=inteligente → el jugador que optimiza DPS
//   node scripts/balance-sim.mjs --cards=ceiling → techo de poder (cartas reales topadas)
//   node scripts/balance-sim.mjs --metalv=10    → nivel meta de las 9 torretas (1..100)
//   node scripts/balance-sim.mjs --meta=trajectory → nivel meta REAL de la campaña
//   node scripts/balance-sim.mjs --perks=optimal  → rama A/B óptima de los perks
//   node scripts/balance-sim.mjs --killrate=75   → el jugador mata como máximo el 75 %
//   node scripts/balance-sim.mjs --seeds=5       → seeds por stage
//   node scripts/balance-sim.mjs --logical-h=1195 → alto LÓGICO del canvas
//   node scripts/balance-sim.mjs --towers=tesla,mortar,beam,missile → FUERZA el arsenal
//   node scripts/balance-sim.mjs --drone=firewheel → FUERZA el dron (sin el flag: ninguno)
//   node scripts/balance-sim.mjs --variants=acorazado → todas las élites usan ese afijo (fase 68)
//   node scripts/balance-sim.mjs --protocol=II → Protocolo/Heat II (fase 69); --mods=asedio:2,leva:1 o --heat=N
//   node scripts/balance-sim.mjs --survival --seeds=5 → modo SUPERVIVENCIA: oleada alcanzada por semilla (fase 70)
//
// ------------------------------------------------------------
// FASE 59 — LA MEDICIÓN DEJA DE MEDIR EL PISO (fase 59)
// ------------------------------------------------------------
// El sim medía por defecto al jugador que NO juega: meta en Nvl.1 (nunca
// toca MEJORAR), sin perks y sin optimizar las cartas. Con ese piso la
// tabla de docs/BALANCE.md daba win 100 % en las 50 etapas — la base era una
// esponja y eso era INVISIBLE para la medición. Tres cosas nuevas:
//
//   · `--meta=trajectory`: el nivel meta se deriva del stage con la
//     política real (victoria → 60 frag por torreta, ×2 la primera vez →
//     120; se sube cada torreta en cuanto `fragCost` lo permite). Da los
//     mismos niveles que la tabla de docs/BALANCE.md (S10=14, S20=23, S50=44).
//   · `--killrate=X`: el jugador mata como máximo el X % de los enemigos de
//     la ola. Es un escenario de PRESIÓN: al agotarse el presupuesto las
//     torres dejan de hacer daño y los que quedan se escapan pagando su HP
//     máximo (fase 72). El jefe va aparte (no está en la cola de olas y
//     nunca se escapa).
//   · `--mode=inteligente`: el jugador que maximiza DPS con las cartas.
//
// NOTA sobre el reparto del presupuesto: con `--killrate` el daño se corta
// por ENEMIGO (no por daño), así que las bajas son exactas pero el HP que
// arrastran los que se escapan depende del DPS del jugador.
//
// ------------------------------------------------------------
// ARSENAL FORZADO — `--towers` / `--drone` (fase 61, tareas 3.1-3.2
// del cambio 'limite-5-torres-1-dron')
// ------------------------------------------------------------
// Con 5 slots (una sola fila) la run monta como máximo 4 torres + el
// Guardian, y CUÁLES tocan lo decide el sorteo de las cartas de
// desbloqueo. El DPS bruto de la tirada va de 120,1 (peor:
// tesla+mortar+beam+missile) a 177,7 (mejor: laser+thunderstroke+gauss+
// missile) = 1,48×: medir la campaña con el promedio esconde la cola
// mala. Estos dos flags permiten forzarla:
//
//   --towers=tesla,mortar,beam,missile   → 1..4 tipos (el Guardian ya
//                                          arranca puesto: no se nombra)
//   --drone=firewheel|wasps|forcefield   → el dron forzado. Con `--towers`
//                                          y SIN este flag el arsenal
//                                          forzado NO lleva dron (es la
//                                          peor tirada también en eso).
//
// Cómo funciona (para que la medición sea comparable entre escenarios):
//   · los desbloqueos forzados se aplican con la CARTA REAL de cards.js
//     (`unlock_*`) en el orden de la lista, uno por level-up, en los
//     PRIMEROS level-ups de la partida (los N primeros, N = torres del
//     flag + dron). Consumen su level-up igual que una carta de desbloqueo
//     real, así que la economía de cartas no se regala: lo que cambia es
//     QUÉ torres entran, no cuántas mejoras recibe el jugador;
//   · mientras el arsenal está forzado, las cartas de desbloqueo de la
//     oferta NO se eligen (si no, una torre fuera del conjunto ocuparía un
//     slot y desplazaría a una de las forzadas). `--mode` sigue decidiendo
//     el resto de las cartas;
//   · `--towers` NO simula la oferta: se salta `minStage` a propósito (el
//     arsenal extendido entra desde el S2) — es un instrumento de
//     medición, no una partida;
//   · el orden de la lista importa (la primera torre entra en el primer
//     level-up): los tres escenarios de la línea base van con missile
//     último, como los escribió el pedido;
//   · como todo desbloqueo entra POR LEVEL-UP, una corrida sin bajas
//     (p. ej. `--killrate=0`) tampoco monta el arsenal forzado: se queda
//     con el Guardian y el reporte lo avisa ("sin entrar por falta de
//     level-ups").
//
// Verificación de que el tope de 5 slots se respeta: el pie del reporte
// imprime el arsenal real de las runs (torres por run y máximo vs
// CONFIG.SLOTS) — y en modo forzado avisa si un desbloqueo no entró.
//
// ------------------------------------------------------------
// FASE 65 — MÉTRICAS DEL DIRECTOR (tarea 5.1 del cambio
// 'oleadas-dinamicas')
// ------------------------------------------------------------
// Las tablas de siempre miden el RESULTADO de la partida (win / HP fin /
// fugas / % bajas). Eso no puede ver lo que cambió el director: dos etapas
// con la misma dificultad pueden ser un plato uniforme o un arroyo con
// picos. El bloque nuevo mide lo que el director GENERA dentro del stage,
// por etapa y promediado entre las semillas:
//
//   · tipos/vent  — tipos de enemigo distintos por ventana de 20 s (media)
//                   y el cast de la etapa;
//   · HP/vent     — HP que ENTRA por ventana (media · máx · mín; cuenta el
//                   hpMax escalado + el escudo del `escudado`) y cuántas
//                   ventanas pasan de 1,15× la media (los picos de la
//                   curva de presión) + HP total por etapa (la guarda del
//                   ±10 % del diseño). Las ventanas sin spawns (el hueco de
//                   la apertura, el jefe en pantalla) no cuentan como
//                   valle: son guion, no presión;
//   · Δt/descarga — media de los saltos entre llegadas DENTRO de una
//                   descarga y % de descargas "arroyo" (Δt ≥ 0,05 s ≈ 1,5
//                   ticks a 30 Hz): 0 s = "plato" (todos en el mismo frame),
//                   el escalonado del director (`stagger`/`delay`) lo
//                   agranda;
//   · familias    — % de enemigos por familia (roca/cristal/espora/virus);
//   · arquetipos  — arquetipos distintos por etapa (`archetypeOf(wave)` del
//                   director, si el módulo lo exporta: uso defensivo);
//   · variantes   — % de enemigos con variante de élite y su desglose.
//
// Se capturan en el ÚNICO punto por el que pasa todo enemigo del juego
// (`engine.addEntity`, ver runStage) y son sumas y medias de lo que ya
// pasó: NADA de azar nuevo, el determinismo de la corrida no se toca.
// El jefe y sus esbirros quedan fuera (no son ola, igual que en las fugas).
//
// AVISO DE LECTURA: esto también es un PISO — mide la COMPOSICIÓN que
// genera el director, no la dificultad que aguanta el jugador.
//
// FASE 58 — ALTO LÓGICO (la prueba de que el cambio es neutro):
//   el sim corre en Node SIN DOM, así que no hay marco que medir. Se
//   puede forzar el alto lógico del canvas (540×h) de dos maneras:
//     · `--logical-h=1195` (flag del CLI, se aplica al empezar), o
//     · `GDF_LOGICAL_H=1195 node scripts/balance-sim.mjs` (la var de
//       entorno la lee js/engine.js al importar: sirve para TODOS los
//       scripts, no solo este).
//   Con h=880 (o sin nada) el layout es el de referencia → el juego se
//   comporta EXACTAMENTE como antes de la fase 58. Con h=1195 (el móvil)
//   el campo de caída crece un 32 %, pero la velocidad de caída se
//   compensa (LAYOUT.fallScale) → el balance debe salir IGUAL.
//
//   Diagnóstico determinista de un stage (25 semillas fijas, ANTES/DESPUÉS):
//   node scripts/probe-s6.mjs [--stage=6] [--seeds=25]
//   Smoke "Guardian solo" S5 vs S6 (distribución, no una run):
//   node scripts/probe-solo-s5s6.mjs [N]
//
// Salida: misma forma de tabla que docs/BALANCE.md (win/duración/HP fin/leaks/Lv)
// + una columna ⏱ que separa "murió" de "no terminó" (timeout del corte
// de seguridad) y un pie con el consumo de ultimate/Black Hole y un bloque
// propio de MÉTRICAS DEL DIRECTOR por etapa (ver FASE 65).
//
// AVISO DE LECTURA (mismo encuadre que docs/BALANCE.md): los números absolutos
// son un PISO de poder del jugador simulado, NUNCA un techo. El techo se
// mide aparte con --cards=ceiling (+ --metalv=100).
// ============================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONFIG, setLogicalHeight, LAYOUT } from '../js/engine.js';
import { Enemy, collideProjectiles, ENEMY_VARIANTS } from '../js/enemies.js';
import { familyFor, ENEMY_FAMILY_IDS } from '../js/damagetypes.js';
import { Fortress, ULT_BOSS_CHARGES, BLACK_HOLE_BOSS_CHARGES } from '../js/player.js';
import { TOWERS, DRONES, MAX_DRONES } from '../js/towers.js';
import {
  multForStreak, baseScoreForEnemy, speedMult, xpForKill,
  applyXp, overflowScore,
} from '../js/score.js';
import { BASE_HP_BY_STAGE, baseHpForStage } from '../js/stages.js';
import {
  heatMods, heatTotal, normalizeHeatMods, presetMods, HEAT_PRESETS,
} from '../js/heat.js';
import {
  SURVIVAL, survivalStage, survivalScale, survivalWaveChunk,
  survivalBossKind, survivalBossName,
} from '../js/survival.js';
import { rollOffer, applyCard, CATALOG } from '../js/cards.js';
import {
  saveMeta, META_TOWERS, PERKS, metaDmgMul, fragCost,
  META_FRAG_PER_VICTORY, META_FIRST_CLEAR_MULT, META_MAX_LEVEL, PERK_EVERY,
} from '../js/meta.js';

// ---------- defaults del CLI (los mismos de siempre) ----------
const DEFAULT_MODE = 'greedy';   // greedy | tardy | mixto (elección de carta)
const DEFAULT_META_LV = 1;       // 1..100 (v6) — nivel meta de las 9 torretas
const DEFAULT_PERKS = 'none';    // none | optimal (rama óptima A/B, fase 17)
const DEFAULT_SEEDS = 5;
const DEFAULT_STAGES = [1, 2, 3, 4, 5, 6, 10, 20, 30, 50]; // campaña (muestra de la curva)
// fase 67: techo del parseo de --stages. La campaña son 50 etapas y el
// modo infinito no tiene fin jugable, pero el instrumento necesita un tope
// (200 = 4 decenas de profundidad, de sobra para medir la pared).
const MAX_STAGE = 200;

// Sal del flujo de azar del MUNDO (olas procedurales, enemigos, crits,
// stuns, explosiones). Distinto del flujo de cartas: así el sorteo de
// cartas no depende de cuánto azar consumió el mundo.
const WORLD_SALT = 0x9E3779B9;

// Storage falso en memoria (Node no tiene localStorage): permite fijar el
// estado meta del "veterano" sin tocar disco. Mismo patrón inyectable que
// ya usan loadMeta/saveMeta (ver meta.js, "storage inyectable, igual que
// progress.js").
const fakeStorage = (() => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
})();

/**
 * Rama de perks "óptima" por torre (fase 17): por tier elige la opción
 *  que maximiza daño, luego cadencia, luego magnitud total de mods. Se
 *  usa con --perks=optimal para medir el TECHO de poder con elecciones.
 *
 *  dev-7 fase 59 (fase 59.3): BUG ARREGLADO. Antes escribía los 10 tiers
 *  SIEMPRE, y `perkMods()` (meta.js) los aplica TODOS los que encuentra
 *  escritos — el gate de nivel solo vive en `setPerkChoice` (que el sim no
 *  usa). O sea: "meta 24 + perks" se llevaba los perks del Nvl.100 y
 *  inflaba la medición (la fila "meta 24 + perks óptimos" de docs/BALANCE.md
 *  es en realidad "meta 24 + perks de Nvl.100"). Ahora solo se escriben
 *  los tiers REALMENTE desbloqueados a ese nivel: floor(nivel / 10).
 */
export function optimalPerkChoices(type, level = META_MAX_LEVEL) {
  const table = PERKS[type];
  if (!table) return null;
  const unlocked = Math.max(0, Math.min(table.length, Math.floor(level / PERK_EVERY)));
  const score = (opt) => {
    const m = opt.mods;
    return (m.dmgMul ?? 1) * 1000
      + (1 / (m.cadMul ?? 1)) * 100
      + Object.entries(m).reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0);
  };
  const choices = Array(table.length).fill(null);
  for (let i = 0; i < unlocked; i++) {
    choices[i] = score(table[i].A) >= score(table[i].B) ? 0 : 1;
  }
  return choices;
}

/**
 * dev-7 fase 59 (fase 59.1) — NIVEL META DE LA TRAYECTORIA REAL.
 *
 * El simulador medía por defecto el "piso" (meta Nvl.1, perks none): un
 * jugador que nunca toca MEJORAR. Medía el piso, no la partida real, y por
 * eso la tabla de docs/BALANCE.md nunca vio que la base es una esponja (win
 * 100 % en las 50 etapas).
 *
 * La trayectoria es la política REAL del juego:
 *   · cada victoria da META_FRAG_PER_VICTORY fragmentos a CADA torreta;
 *   · la PRIMERA vez de cada stage, ×META_FIRST_CLEAR_MULT (o sea 120);
 *   · el jugador sube cada torreta en cuanto puede (MEJORAR).
 * O sea, antes del stage N el jugador lleva (N-1) victorias y (N-1)
 * primeras veces → 120×(N-1) fragmentos por torreta, y el nivel es el
 * máximo que puede pagar con `fragCost` (el coste REAL de meta.js).
 *
 * Verificado contra la tabla de docs/BALANCE.md (fase 59): S10 → 14, S20 → 23,
 * S25 → 28, S30 → 32, S40 → 38, S45 → 41, S50 → 44. Coincide exacto.
 *
 * @param {number} stage  1..50
 * @returns {number} nivel meta (1..100) de la trayectoria
 */
export function trajectoryMetaLevel(stage) {
  const perClear = META_FRAG_PER_VICTORY * META_FIRST_CLEAR_MULT; // 60 + 60 = 120
  const frags = perClear * Math.max(0, Math.trunc(stage) - 1);
  let lv = 1;
  let spent = 0;
  while (lv < META_MAX_LEVEL) {
    const cost = fragCost(lv); // el coste de pasar de `lv` a `lv+1`
    if (spent + cost > frags) break;
    spent += cost;
    lv += 1;
  }
  return lv;
}

/** Fija TODAS las torretas meta a `level` (100 = techo real del v6).
 *  Con perks='optimal' además elige la rama óptima A/B de cada torre. */
function setMetaLevel(level, perks = 'none') {
  const levels = {};
  const frags = {};
  const perkChoices = {};
  for (const t of META_TOWERS) {
    levels[t.key] = level;
    frags[t.key] = 0;
    perkChoices[t.key] = perks === 'optimal' ? optimalPerkChoices(t.type, level) : Array(10).fill(null);
  }
  saveMeta({ levels, frags, victories: 999, firstClear: [1, 2, 3, 4, 5], perkChoices }, fakeStorage);
}

// ---------- stub de engine: SIN canvas/DOM/audio (docs/BALANCE.md dixit) ----------
class EngineStub {
  constructor() {
    this.entities = [];
    this.effects = [];
    this.particles = [];
    this.state = 'PLAYING';
    this.timeScale = 1;
    this._t = 0;
    this._listeners = new Map();
  }

  on(name, cb) {
    if (!this._listeners.has(name)) this._listeners.set(name, []);
    this._listeners.get(name).push(cb);
  }

  emit(name, payload) {
    for (const cb of this._listeners.get(name) ?? []) cb(payload);
  }

  addEffect(fx) { this.effects.push(fx); }

  addEntity(e) { this.entities.push(e); }

  // Todo lo visual/sonoro es no-op: el sim no renderiza ni reproduce nada.
  spawnParticles() {}

  shake() {}

  sfxSafe() {}

  floatText() {}
}

// ---------- RNG determinista (xorshift32, inyectable en rollOffer) ----------
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return (s % 1_000_000_007) / 1_000_000_007;
  };
}

// ============================================================
// Techo de poder con las CARTAS REALES de cards.js
// ============================================================

const CARD_BY_ID = new Map(CATALOG.map((c) => [c.id, c]));

/**
 * Cartas del "techo" de poder: las multiplicativas al máximo real del
 * catálogo (CAPS en cards.js) + las exclusivas por torre que se Added en
 * dev-7 fase 12. Los TIMES NO están escritos aquí a propósito: la carta
 * se aplica HASTA QUE DEJE DE HACER EFECTO (o sea, hasta su tope real en
 * cards.js), así el simulador no puede quedar obsoleto si el catálogo se
 * rebalancea.
 */
export const CEILING_CARD_IDS = [
  'dmg_all',        // todas las torres
  'cadence_up',     // todas las torres
  'dmg_guard',      // solo Guardian
  'rapid_bullets',  // solo Guardian
  'dmg_missile', 'dmg_beam', 'dmg_thunder', 'dmg_tesla', 'dmg_mortar', 'dmg_gauss',
];

/** Estado de modificadores de las torres (para ver si una carta aún hace algo). */
function modsSnapshot(game) {
  return game.fortress.slots
    .filter(Boolean)
    .map((t) => [
      t.type, t.dmgMul ?? 1, t.cadMul ?? 1, t.bulletSpeedMul ?? 1,
      t.dmgAllApps ?? 0, t.cadApps ?? 0, t.guardDmgApps ?? 0,
      t.rapidApps ?? 0, t.exclusiveDmgApps ?? 0,
    ].join(':'))
    .join('|');
}

/**
 * Aplica una carta REAL hasta que deja de hacer efecto (su tope en
 * cards.js). Así los valores y los contadores de aplicaciones salen del
 * catálogo: si una carta está topada, su contador impide que la oferta
 * la vuelva a ofrecer (isCardEligible → appsOf).
 */
function applyCardToCap(card, game, maxTries = 8) {
  for (let i = 0; i < maxTries; i++) {
    const before = modsSnapshot(game);
    applyCard(card, game);
    if (modsSnapshot(game) === before) return; // ya está topada
  }
}

/**
 * Aplica el TECHO de poder al game (docs/BALANCE.md Plan integral §2, riesgo A):
 * las cartas multiplicativas al máximo real, tal cual las define
 * cards.js. Se combina con META_LV (nivel meta REAL vía meta.js, no un
 * stub) para medir el techo verdadero, algo que docs/BALANCE.md nunca midió.
 *
 * @param {object} game — la partida (mutada)
 */
export function applyCeilingCards(game) {
  game._ceiling = true;
  game._ceilingCapped = game._ceilingCapped ?? new Set();
  game._ceilingTowers = -1; // forzar el primer sync
  syncCeiling(game);
  return game;
}

/**
 * Re-topa el techo cuando aparecen torres nuevas (las cartas exclusivas
 * por torre —dmg_missile, dmg_beam...— solo aplican si la torre está
 * puesta). Llamar tras cada carta que pueda añadir una torre.
 */
function syncCeiling(game) {
  if (!game._ceiling) return;
  const towers = game.fortress.slots.filter(Boolean);
  if (towers.length === game._ceilingTowers) return; // nada nuevo
  game._ceilingTowers = towers.length;
  for (const id of CEILING_CARD_IDS) {
    const card = CARD_BY_ID.get(id);
    if (!card) continue;
    applyCardToCap(card, game);
    game._ceilingCapped.add(id);
  }
}

// ---------- economía de kill (réplica de Game._onKill, main.js, SOLO números) ----------
// dev-7 fase 59.3: `stage` — el XP por kill y el precio del nivel escalan
// con la etapa (score.js: xpForKill / xpForLevel).
//
// dev-7 fase 64: el bucle de level-up NO se replica acá. Lo resuelve
// score.js (`applyXp`), que es la fuente de verdad, y el XP que ya no cabe
// en el tope de la etapa (`MAX_LEVEL_PER_STAGE`) se cobra con
// `overflowScore`, igual que main.js. Este es el instrumento de medición de
// la calibración de `LEVEL_PRICE_PER_STAGE`: si tuviera su propia copia del
// bucle mediría una curva que el juego no usa.
function gainXp(game, amount) {
  const stage = game.stageId;
  const r = applyXp(game.lv, game.xp, amount, stage, game.maxLevel);
  game.lv = r.lv;
  game.xp = r.xp;
  if (r.overflow > 0) game.score += overflowScore(r.overflow, stage);
  return r.ups;
}

function onKill(game, enemy) {
  game.kills += 1;
  const base = baseScoreForEnemy(enemy);
  game.score += Math.max(1, Math.round(
    base * game.mult * speedMult(game.engine.timeScale) * (game.fortress.scoreMul ?? 1),
  ));
  game.streak += 1;
  game.mult = multForStreak(game.streak);
  const bonusFrac = enemy?.data?.dropXpBonusFrac ?? 0;
  // dev-7 fase 59.3: el XP escala con el stage (xpForKill) — el SCORE
  // sigue plano (leaderboard). Es la línea que hay que cablear también
  // en main.js (`this._gainXp(xpForKill(enemy, this.stageId) * ...)`).
  const xp = xpForKill(enemy, game.stageId);
  const levels = gainXp(game, xp * (1 + bonusFrac) * (game.fortress.xpMul ?? 1));
  game.fortress.chargeUltimate(enemy?.isBoss ? ULT_BOSS_CHARGES : 1);
  game.fortress.chargeBlackHole(enemy?.isBoss ? BLACK_HOLE_BOSS_CHARGES : 1);
  return levels;
}

// ---------- heurística de elección de carta (ver docs/BALANCE.md v3-2/7) ----------
// dev-7 fase 34: modo 'mixto' — el desbloqueo se elige AL AZAR entre los
// que haya en la oferta. El modo 'greedy' cogía SIEMPRE el primer
// desbloqueo del catálogo (missile, beam, thunderstroke, tesla...), así que
// el ARSENAL de la fila trasera (mortero, gauss, láser) — que va después en
// el catálogo — NUNCA se desbloqueaba: medido, 0 morteros en 12 partidas.
// Con el simulador ciego al mortero y al haz, sus cambios de balance eran
// invisibles para la medición. El modo 'mixto' jugaba el arsenal de verdad.
function pickCard(offer, lv, mode, game, rng = Math.random) {
  if (!offer.length) return null;
  // En modo techo, las cartas ya topadas NO se ofrecen (cards.js no lleva
  // la cuenta de las exclusivas por torre — ver cabecera). Si TODAS las
  // cartas de la oferta fueran topadas, el jugador igual elige una (no
  // queremos que el sim se quede sin level-ups).
  let pool = offer;
  if (game?._ceilingCapped) {
    const filtered = offer.filter((c) => !game._ceilingCapped.has(c.id));
    if (filtered.length) pool = filtered;
  }
  // dev-7 fase 30 (fidelidad del simulador): la heurística priorizaba
  // desbloqueos de TORRE (`c.tower`) y NUNCA los de DRON (`c.drone`):
  // el jugador simulado no cogía jamás el dron Avispas (0 en 42 partidas)
  // y la Rueda de Fuego salía 0,17 veces por partida. O sea: el
  // simulador estaba midiendo "el juego sin drones", y cualquier cambio
  // en los drones era invisible para la medición.
  // Ahora un desbloqueo de dron cuenta como desbloqueo (el dron es una
  // unidad del arsenal igual que una torre).
  const esDesbloqueo = (c) => !!(c.tower || c.drone);
  const unlock = pool.find(esDesbloqueo);
  if (mode === 'tardy') {
    const unlockLevels = [2, 4, 6, 8];
    if (unlock && unlockLevels.includes(lv)) return unlock;
    return pool.find((c) => !esDesbloqueo(c)) ?? pool[0];
  }
  // dev-7 fase 34: 'mixto' — desbloqueo al azar entre los de la oferta
  // (así entran el mortero/gauss/láser y el beam). Sin desbloqueo en la
  // oferta: la primera carta no desbloqueante.
  if (mode === 'mixto') {
    const unlocks = pool.filter(esDesbloqueo);
    if (unlocks.length) return unlocks[Math.floor(rng() * unlocks.length) % unlocks.length];
    return pool[0];
  }
  // greedy (default): prioriza desbloqueos apenas aparecen en la oferta
  return unlock ?? pool[0];
}

// ------------------------------------------------------------
// dev-7 fase 59 (fase 59.4) — EL JUGADOR QUE OPTIMIZA
// ------------------------------------------------------------
// Los tres modos anteriores miden jugadores que NO optimizan: 'greedy'
// cogía siempre el primer desbloqueo (y por eso el arsenal de la fila
// trasera nunca entraba), 'mixto' elige al azar y 'tardy' solo desbloquea
// en los niveles 2/4/6/8. Ninguno busca DAÑO: miden el piso.
//
// El modo 'inteligente' puntúa cada carta de la oferta por su aportación
// al DPS y coge la mejor. Los pesos salen del catálogo REAL (cards.js):
//   · una torre/dron nueva = una fuente de DPS entera (la mayor);
//   · las multiplicativas de daño (dmg_*) y la cadencia = daño global;
//   · las cartas de caza (hunt_*) = ×1,8 contra una familia;
//   · las tech_* = mods del Guardian (crítico, perforación, explosión);
//   · el resto (reparación, prima de score, escudo de racha...) no suma
//     DPS: puntúan bajo.
const DAMAGE_CARDS = new Set([
  'dmg_all', 'dmg_guard', 'dmg_missile', 'dmg_beam', 'dmg_thunder', 'dmg_tesla',
  'dmg_mortar', 'dmg_gauss', 'dmg_laser', 'dmg_firewheel', 'dmg_wasps', 'dmg_forcefield',
  'cadence_up', 'rapid_bullets', 'bullets_5',
  'hunt_rock', 'hunt_crystal', 'hunt_spore', 'hunt_virus',
  'tech_crit', 'tech_exec_missile', 'tech_explode', 'tech_pierce', 'tech_bounce',
  'tech_stun_missile', 'tech_lifesteal',
  'ult_power', 'black_hole',
]);

/** Puntuación de DPS de una carta (mayor = mejor para matar enemigos). */
// dev-7 fase 59.3 — DIAGNÓSTICO DESCARTADO: puntuar las cartas por su
// aportación REAL al DPS (las globales por encima de las de una sola
// torre) NO mejoró la tasa de bajas: al revés, la bajó (S35 64 % → 52 %,
// S45 70 % → 60 %). O sea: el hueco NO era la elección de cartas del
// jugador simulado sino CUÁNDO llegan (el arsenal tarda). Por eso la
// puntuación se queda como estaba.
export function cardDpsScore(card) {
  if (!card) return -1;
  if (card.tower || card.drone) return 950;   // una torre/dron nueva
  if (card.id === 'dmg_all') return 900;       // ×1,3 a TODO
  if (DAMAGE_CARDS.has(card.id)) return 800;
  if (String(card.id).startsWith('tech_')) return 600;
  if (String(card.id).startsWith('hunt_')) return 750;
  return 100;                                  // utility (reparación, score…)
}

/** Elige la carta que más DAÑO aporta (modo 'inteligente'). */
function pickCardSmart(offer) {
  if (!offer.length) return null;
  let best = null;
  let bestScore = -1;
  for (const c of offer) {
    const s = cardDpsScore(c);
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best;
}

// ------------------------------------------------------------
// fase 61 — ARSENAL FORZADO (`--towers` / `--drone`)
// ------------------------------------------------------------
// Ver la cabecera ("ARSENAL FORZADO") para el porqué y las reglas. Aquí
// viven el parser del flag, la validación y la aplicación del desbloqueo.

/** Torres desbloqueables por carta: las del catálogo menos el Guardian,
 *  que arranca puesto (§6 decisión 3). Los tipos de `--towers` salen de
 *  acá — un typo en el flag falla con un error, no con una medición
 *  silenciosa de otro arsenal. */
export const UNLOCKABLE_TOWERS = Object.keys(TOWERS).filter((k) => k !== 'guardian');

/** Tope de torres forzables: los slots de la partida menos el del Guardian
 *  (fase 61: 5 − 1 = 4). Sale de CONFIG.SLOTS — si el núcleo vuelve a
 *  mover el tope, este flag lo sigue solo. */
export const MAX_FORCED_TOWERS = CONFIG.SLOTS.length - 1;

/**
 * "--towers=tesla,mortar,beam,missile" → ['tesla','mortar','beam','missile'].
 * Valida cada tipo contra `TOWERS` (el Guardian no vale: ya está puesto) y
 * el largo contra el tope del arsenal. Lanza un Error con el motivo — el
 * CLI lo imprime y sale con código 1 (una medición con un arsenal que no
 * es el pedido es peor que no medir).
 *
 * @param {string} spec lista separada por comas
 * @returns {string[]} tipos validados (en el orden del flag)
 */
export function parseTowerList(spec) {
  const out = [];
  for (const part of String(spec).split(',')) {
    const t = part.trim().toLowerCase();
    if (!t) continue;
    if (!TOWERS[t]) {
      throw new Error(`--towers: torre desconocida "${t}" (válidas: ${UNLOCKABLE_TOWERS.join(', ')})`);
    }
    if (t === 'guardian') throw new Error('--towers: el Guardian ya arranca puesto, no se fuerza');
    if (!out.includes(t)) out.push(t);
  }
  if (!out.length) throw new Error('--towers: la lista está vacía');
  if (out.length > MAX_FORCED_TOWERS) {
    throw new Error(`--towers: ${out.length} torres no caben en el arsenal `
      + `(${MAX_FORCED_TOWERS} desbloqueables + el Guardian en ${CONFIG.SLOTS.length} slots)`);
  }
  return out;
}

/**
 * "--drone=firewheel" → 'firewheel'; sin flag (o "none"/"ninguno") → null.
 * @param {string|null} spec
 * @returns {string|null} tipo de dron validado
 */
export function parseDroneArg(spec) {
  if (spec == null || spec === true) return null;
  const d = String(spec).trim().toLowerCase();
  if (d === '' || d === 'none' || d === 'ninguno') return null;
  if (!DRONES[d]) {
    throw new Error(`--drone: dron desconocido "${d}" (válidos: ${Object.keys(DRONES).join(', ')})`);
  }
  return d;
}

/**
 * Construye el arsenal forzado del CLI. `null` = sin flags: el simulador
 * juega como siempre (los desbloqueos los elige la heurística del modo).
 *
 * Semántica de `--towers` sin `--drone`: el arsenal forzado NO lleva dron
 * (la tirada también incluye "no me salió dron"). `--drone` solo (sin
 * `--towers`) fuerza el dron y deja las torres a la heurística.
 *
 * @param {object} args resultado de parseArgs()
 * @returns {{towers: string[]|null, drone: string|null}|null}
 */
export function parseForcedArsenal(args) {
  if (args.towers == null && args.drone == null) return null;
  return {
    towers: args.towers != null ? parseTowerList(args.towers) : null,
    drone: parseDroneArg(args.drone),
  };
}

/**
 * Aplica un desbloqueo forzado con la CARTA REAL del catálogo
 * (`unlock_missile`, `unlock_drone_wasps`...): así el camino es el mismo
 * que en la partida (`cards.js: apply` → `Fortress.addTower/addDrone`, con
 * su tope de slots y su cupo de drones) y el sim no puede inventar una
 * unidad que el juego no dejaría entrar.
 *
 * `--towers` se SALTA la elegibilidad a propósito (el `minStage: 2` del
 * arsenal extendido incluido): el flag responde "¿y si me hubiera tocado
 * este arsenal?", no "¿qué ofrece la oferta?".
 *
 * @param {{kind:'tower'|'drone', type:string}} spec
 * @param {object} game
 * @returns {boolean} true si la unidad quedó en el arsenal (false = no
 *   había lugar: el tope de 5 slots / 1 dron la dejó fuera)
 */
export function applyForcedUnlock(spec, game) {
  const id = spec.kind === 'drone' ? `unlock_drone_${spec.type}` : `unlock_${spec.type}`;
  const card = CARD_BY_ID.get(id);
  if (!card) return false;
  applyCard(card, game);
  return spec.kind === 'drone'
    ? game.fortress.drones.some((d) => d.type === spec.type)
    : game.fortress.slots.some((t) => t?.type === spec.type);
}

// ---------- partida mínima (fortaleza + Guardian de arranque) ----------
/**
 * Crea el game del sim (engine stub, Fortaleza y el Guardian inicial).
 * Exportado para que los tests puedan construir la partida y medir el
 * techo sin correr una run entera.
 */
export function createGame(stageId, { metaLv = DEFAULT_META_LV, perks = DEFAULT_PERKS, runMods = null } = {}) {
  setMetaLevel(metaLv, perks); // v6 real: afecta metaDmgMul()/perkCount() en towers.js
  const engine = new EngineStub();
  const game = {
    engine, stageId, lv: 1, xp: 0, score: 0, streak: 0, mult: 1, kills: 0,
    timer: 0, _leaks: 0, _ultFires: 0, _bhFires: 0,
    runMods, // fase 69: Protocolo/Heat (null = heat 0)
  };
  game.fortress = new Fortress(game);
  // fase 69: Arsenal — un slot menos ANTES de colocar al Guardian.
  if (runMods?.slotDelta < 0) game.fortress.dropLastSlot?.();
  // fase 67: la base del infinito (51+) sale de la CURVA REAL de stages.js,
  // no de un fallback fijo. Antes era `BASE_HP_BY_STAGE[id] ?? 3000` y el
  // S51 medía 3000 HP (la base del S2) en vez de los 26000 de la curva:
  // todas las filas 51+ del sim eran ficción.
  // OJO: la campaña conserva el valor MANUAL de STAGES (S3 2900 / S5 3800,
  // mientras que la curva da 3000 / 3900), así que primero se consulta la
  // tabla de etapas definidas y sólo después la curva — es la definición
  // REAL de la etapa (misma que `stageDef()` de endless.js).
  game.fortress.maxHp = Math.max(1, Math.round(
    (BASE_HP_BY_STAGE[stageId] ?? baseHpForStage(stageId)) * (runMods?.baseHpMul ?? 1),
  ));
  game.fortress.hp = game.fortress.maxHp;
  game.fortress.addTower('guardian'); // arranque real: SOLO Guardian (§6 decisión 3)
  return game;
}

// ---------- ultimate / Black Hole (fase 26: el sim los USA) ----------
/**
 * Dispara el ORBITAL STRIKE y el Black Hole cuando el medidor está listo.
 * Espeja al jugador real (main.js: _tryFireUltimate / _tryFireBlackHole):
 * solo con la carga completa. El ultimate espera a que termine la lluvia
 * anterior (si no, reiniciaría el timer y cancelaría los impactos
 * pendientes).
 */
function fireSpecials(game) {
  // fase 69: Apagón — sin Ultimate ni Black Hole.
  if (game?.runMods?.noUlt) return;
  const f = game.fortress;
  if (f.canFireUltimate() && (f._orbitalTimer ?? 0) <= 0) {
    if (f.fireUltimate(game)) game._ultFires = (game._ultFires ?? 0) + 1;
  }
  if (f.canFireBlackHole()) {
    if (f.fireBlackHole(game)) game._bhFires = (game._bhFires ?? 0) + 1;
  }
}

// ------------------------------------------------------------
// dev-7 fase 59 (fase 59.2) — EL PRESUPUESTO DE BAJAS
// ------------------------------------------------------------

/**
 * Enemigos que trae la cola de olas del stage (sin el jefe: el jefe no
 * está en la cola, lo mete `_spawnBoss` aparte y nunca se escapa).
 */
function countWaveEnemies(queue, waveGroups) {
  let n = 0;
  for (const w of queue) {
    for (const g of waveGroups(w)) {
      if (g.type === 'boss' || g.pattern === 'boss') continue;
      n += g.count ?? 1;
    }
  }
  return n;
}

/**
 * Envuelve el `takeDamage` de los enemigos VIVOS: cuando el presupuesto de
 * bajas se agota, las torres dejan de hacer daño (takeDamage devuelve false
 * sin tocar el HP). Los enemigos que ya estaban a medias se escapan con el
 * HP que les quedaba — como en la partida real.
 * El jefe queda fuera (no cuenta ni consume presupuesto).
 */
function armKillBudget(game, budget) {
  for (const e of game.fortress.enemies) {
    if (!e || e.__simKillCapped || e.isBoss) continue;
    e.__simKillCapped = true;
    const orig = e.takeDamage.bind(e);
    e.takeDamage = (n, kind, dmgType) => {
      if (game._waveKills >= budget) return false;
      return orig(n, kind, dmgType);
    };
  }
}

// Contador de runs: cada run carga una instancia FRESCA de js/waves.js
// (ver runStage) — el import estático no sirve porque waves.js guarda
// estado a nivel de módulo (la zona de entrada del jefe: nextBossEntry).
let runCounter = 0;

/**
 * Corre un stage completo con la lógica REAL del juego.
 *
 * @param {number} stageId
 * @param {string} mode  greedy | tardy | mixto | inteligente
 * @param {number} seed  semilla (determinismo total de la run)
 * @param {object} opts  { metaLv, perks, ceiling, autoUlt, killRate, forcedArsenal }
 * @returns {Promise<object>} métricas de la run
 */
export async function runStage(stageId, mode = DEFAULT_MODE, seed = 1, opts = {}) {
  const { ceiling = false, autoUlt = true } = opts;
  // fase 61: ARSENAL FORZADO (--towers / --drone). null = heurística normal.
  // La cola se arma en orden: las torres del flag y después el dron (si lo
  // hay). Cada entrada consume un level-up al entrar (ver el bucle de
  // cartas), así que el orden de la lista ES el orden de llegada.
  const forced = opts.forcedArsenal ?? null;
  const forcedQueue = forced
    ? [
      ...(forced.towers ?? []).map((type) => ({ kind: 'tower', type })),
      ...(forced.drone ? [{ kind: 'drone', type: forced.drone }] : []),
    ]
    : [];
  // Qué desbloqueos descarta la oferta (ver el bucle de cartas): las torres
  // solo si hay un conjunto de torres forzado, y los drones siempre que el
  // arsenal esté forzado (el dron es "el del flag o ninguno").
  const filtraTorres = forced?.towers != null;
  const filtraDrones = forced != null;
  let forcedMissed = 0;

  // --- DETERMINISMO: un stream para el mundo, otro para las cartas ---
  const rngCards = makeRng(seed);
  const rngWorld = makeRng((seed ^ WORLD_SALT) >>> 0);
  const realRandom = Math.random;
  Math.random = rngWorld; // ← TODO el azar del juego sale de aquí

  try {
    // Instancia FRESCA de waves.js por run: el módulo guarda a nivel de
    // archivo la zona de entrada del jefe (nextBossEntry → _lastBossZone),
    // así que reutilizar la instancia haría que el stage N dependiera de
    // los stages corridos antes (no reproducible al comparar dos órdenes
    // de corrida distintos).
    const wavesMod = await import(`../js/waves.js?run=${++runCounter}`);
    const { WaveManager, waveGroups } = wavesMod;
    // fase 65 (tarea 5.1): el ARQUETIPO de una descarga lo etiqueta el
    // director (`archetypeOf`, contrato del cambio 'oleadas-dinamicas').
    // Uso DEFENSIVO: si el módulo todavía no lo exporta, la métrica queda
    // en [] y la corrida sigue — el sim no puede dejar de medir por una
    // etiqueta.
    const archetypeOf = typeof wavesMod.archetypeOf === 'function' ? wavesMod.archetypeOf : null;
    // dev-7 fase 28: la apertura se modela con la potencia REAL del
    // Guardian (multiplicador de meta). El nivel meta se fija ANTES de
    // construir el WaveManager para que el modelo de la apertura use el
    // mismo meta que las torres (createGame lo vuelve a fijar, es
    // idempotente).
    // dev-7 fase 59 (54.1): `metaLv` puede ser el número fijo de siempre o
    // la palabra 'trajectory' → el nivel meta REAL de la campaña.
    const metaLv = opts.metaLv === 'trajectory'
      ? trajectoryMetaLevel(stageId)
      : (opts.metaLv ?? DEFAULT_META_LV);
    setMetaLevel(metaLv, opts.perks ?? DEFAULT_PERKS);
    // La tabla de olas se construye PRIMERO: para los stages 6..50 su
    // semilla es (Math.random()*1e9)|0 (waves.js:392) — el primer sorteo
    // del stream, reproducible.
    const wm = new WaveManager(stageId, {
      powerMul: metaDmgMul('guardian'),
      runMods: opts.runMods ?? null,
      survival: opts.survival === true,
      extend: opts.survival === true ? (m) => {
        const from = (m.survivalWave ?? 0) + 1;
        const chunk = survivalWaveChunk(from, SURVIVAL.chunk, seed, { runMods: opts.runMods ?? null });
        const base = m.t + 1.5;
        for (const w of chunk) w.t += base;
        m.queue.push(...chunk);
        m.queue.sort((a, b) => a.t - b.t);
        const last = from + SURVIVAL.chunk - 1;
        m.stage = survivalStage(last);
        m.scale = survivalScale(last, opts.runMods ?? null);
        m.bossKind = survivalBossKind(last);
        m.bossName = survivalBossName(last);
        return true;
      } : null,
    });
    if (opts.survival === true) {
      wm.bossKind = survivalBossKind(SURVIVAL.chunk);
      wm.bossName = survivalBossName(SURVIVAL.chunk);
      wm.extendNow?.();
    }
    // fase 68: --variants=ID → todas las élites de la etapa usan ese afijo.
    // Se mutan los GRUPOS de la cola antes de que el manager los despache
    // (el conteo de élites no cambia; sólo el modificador).
    if (typeof opts.forceVariant === 'string' && Object.hasOwn(ENEMY_VARIANTS, opts.forceVariant)) {
      for (const w of wm.queue) {
        for (const g of waveGroups(w)) {
          if (g.variant) g.variant = opts.forceVariant;
        }
      }
    }
    // fase 65: copia de la cola ORIGINAL de la etapa (el manager la consume
    // con shift()). Es la fuente de los arquetipos despachados cuando el
    // despacho no se pudo envolver (ver el bloque de métricas).
    const colaOriginal = [...wm.queue];
    const game = createGame(stageId, { ...opts, metaLv });
    if (opts.survival === true) {
      // fase 70: la base de supervivencia (25 500) y el tope de 30 cartas.
      game.fortress.maxHp = Math.max(1, Math.round(
        SURVIVAL.baseHp * (opts.runMods?.baseHpMul ?? 1),
      ));
      game.fortress.hp = game.fortress.maxHp;
      game.maxLevel = SURVIVAL.maxLevel;
    }
    if (ceiling) applyCeilingCards(game);

    // dev-7 fase 59 (54.2): PRESUPUESTO DE BAJAS. Con `--killrate=X` el
    // jugador mata como máximo el X % de los enemigos del stage: es el
    // escenario LITERAL de la regla que se quiere verificar ("si no mato
    // al 75 %, no gano"). Al agotarse el presupuesto, las torres dejan de
    // hacer daño: los enemigos que quedan se escapan con el HP que les
    // quedaba (como en la partida real).
    // El JEFE va aparte: no está en la cola de olas (lo clava `_spawnBoss`)
    // y nunca se escapa, así que no cuenta ni consume presupuesto.
    const totalEnemies = countWaveEnemies(wm.queue, waveGroups);
    const killBudget = Number.isFinite(opts.killRate)
      ? Math.max(0, totalEnemies - Math.floor(totalEnemies * (1 - opts.killRate / 100)))
      : Infinity;
    game._waveKills = 0;
    game._waveLeaks = 0;
    game._spawnKills = 0;
    game._spawnLeaks = 0;
    game._splitLeaks = 0;

    // ------------------------------------------------------------
    // fase 65 (tarea 5.1) — MÉTRICAS DEL DIRECTOR
    // ------------------------------------------------------------
    // Las tablas de siempre miden el RESULTADO de la partida; esto mide lo
    // que el DIRECTOR GENERA dentro del stage (ver la cabecera). Se captura
    // en el ÚNICO punto por el que pasa todo enemigo del juego:
    // `engine.addEntity` — ahí anota el WaveManager a cada enemigo, tanto el
    // de una descarga entera como el que suelta el scheduler `pending[]` en
    // un tick posterior (el escalonado). El jefe y sus esbirros (`escortOf`)
    // quedan FUERA: no son ola, mismo criterio que las fugas.
    //
    // Nada de azar nuevo: son sumas y medias de lo que ya pasó, así que el
    // determinismo de la corrida no se toca.
    const VENTANA = 20;      // s — el mismo corte que la línea de tiempo
    const PEAK_MUL = 1.15;   // × la media de HP/ventana = "ventana pico"
    const STAGGER_S = 0.05;  // Δt medio ≥ esto = descarga "arroyo" (1,5 ticks a 30 Hz)
    const spawns = [];           // {t, d, type, family, hp, variant}
    const descargas = [];        // {idx, wave} por descarga despachada
    const arrivals = new Map();  // descarga → [t, t, …] en orden de llegada
    let descargaCtx = null;      // la descarga que está soltando enemigos ahora
    let simT = 0;                // reloj del sim en el instante del spawn

    const arrivalList = (d) => {
      let a = arrivals.get(d);
      if (!a) { a = []; arrivals.set(d, a); }
      return a;
    };

    // Un enemigo se reconoce por la clase real (la MISMA instancia de
    // módulo que la de este archivo) o por su ficha. Las balas, los
    // proyectiles y los efectos NO pasan este filtro.
    const esEnemigo = (e) => e instanceof Enemy
      || (!!e && typeof e.hpMax === 'number' && typeof e.type === 'string'
        && !!e.data && typeof e.data.hp === 'number');

    // HP con el que ENTRA un enemigo: su hpMax ya escalado + el escudo de la
    // variante `escudado` (es HP que el presupuesto del director paga, así
    // que suma a la presión).
    const hpDeEntrada = (e) => e.hpMax + (Number.isFinite(e.shieldMax) ? e.shieldMax : 0);

    const registrarSpawn = (e) => {
      if (e.isBoss || e.escortOf) return;
      // Descarga de la que sale: el contexto del despacho (ver abajo) o, si
      // el director renombra `_spawnWave`, el contador público `dispatched`
      // (mismo orden, sin contexto: la métrica no rompe).
      const d = descargaCtx ? descargaCtx.idx : (wm.dispatched ?? 0);
      arrivalList(d).push(simT);
      spawns.push({
        t: simT,
        d,
        type: e.type,
        // La familia la trae el enemigo (enemies.js); `familyFor` es la red
        // por si una variante futura no la copia.
        family: e.family ?? familyFor(e.type) ?? 'otra',
        hp: hpDeEntrada(e),
        variant: typeof e.variant === 'string' ? e.variant : null,
      });
    };

    // El despacho de UNA descarga abre contexto: todo enemigo que salga
    // hasta el siguiente despacho se le atribuye, incluidos los que el
    // scheduler `pending[]` suelta en ticks posteriores (stagger/delay). Eso
    // es lo que permite medir la dispersión DENTRO de la descarga ("plato"
    // vs "arroyo") — justo lo que no se veía desde fuera.
    const spawnWaveOrig = typeof wm._spawnWave === 'function' ? wm._spawnWave.bind(wm) : null;
    if (spawnWaveOrig) {
      wm._spawnWave = (wave, g) => {
        descargaCtx = { idx: descargas.length, wave };
        descargas.push(descargaCtx);
        return spawnWaveOrig(wave, g);
      };
    }

    const addEntityOrig = game.engine.addEntity.bind(game.engine);
    game.engine.addEntity = (e) => {
      if (esEnemigo(e)) registrarSpawn(e);
      return addEntityOrig(e);
    };

    let bossDead = false;
    wm.onBossDead(() => { if (opts.survival !== true) bossDead = true; });
    wm.onWavesDone(() => { if (opts.survival !== true) bossDead = true; });
    // fase 72: no hay presupuesto de fugas; todas cuentan para la
    // estadística (igual que main.js).
    const pendingLevels = [];
    // DIAGNÓSTICO (fase 59.3): línea de tiempo de las bajas y las fugas
    // por tramos de 20 s — para ver si el jugador pierde enemigos AL
    // PRINCIPIO (antes de tener cartas) o al final.
    const TIMELINE = process.env.GDF_TIMELINE === '1';
    const buckets = [];
    const bucketOf = (tt) => {
      const i = Math.floor(tt / 20);
      while (buckets.length <= i) buckets.push({ t: buckets.length * 20, kills: 0, leaks: 0, lv: 1 });
      return buckets[i];
    };
    // fase 72: la base sólo cae por daño. `_leaks` es estadística; las
    // crías/escoltas también cuentan (igual que main.js).
    game.engine.on('enemy:reached', (e) => {
      game._leaks += 1;
      // Las crías de mecánicas (deathSpawn/spawner) son presión EXTRA:
      // cuentan para la base y el timeline, pero no contra la cola del
      // director (mismo criterio que las crías del divisor).
      if (e?.fromSpawn) game._spawnLeaks += 1;
      else if (e?.fromSplit) game._splitLeaks += 1;
      else game._waveLeaks += 1;
      if (TIMELINE) bucketOf(game.timer).leaks += 1;
    });

    game.engine.on('enemy:killed', (e) => {
      // fase 68: las crías del divisor no son "bajas de la ola" (el
      // denominador es la cola del director). Las crías de mecánicas
      // tampoco: son extra. Igual dan score/XP (al 10 %).
      if (e?.fromSpawn) game._spawnKills += 1;
      else if (!e?.isBoss && !e?.fromSplit) game._waveKills += 1;
      if (TIMELINE) bucketOf(game.timer).kills += 1;
      pendingLevels.push(...onKill(game, e));
    });

    const DT = 1 / 30;
    const MAX_T = 700; // corte de seguridad (~11.6 min)
    let t = 0;
    let dead = false;

    while (!bossDead && !dead && t < MAX_T) {
      t += DT;
      game.timer = t;
      simT = t; // fase 65: reloj de las métricas del director (spawns)
      // Orden real (engine.js update() → Game.update(), main.js): primero
      // TODAS las entidades (enemigos+proyectiles, ambos en engine.entities)
      // avanzan su .update(dt) y se podan las muertas; recién después el
      // waveManager/colisiones/fortress (main.js llama esto desde
      // engine.onFrame, que se dispara AL FINAL de engine.update()).
      for (const e of game.engine.entities) e.update(DT);
      for (let i = game.engine.entities.length - 1; i >= 0; i--) {
        if (game.engine.entities[i].dead) game.engine.entities.splice(i, 1);
      }
      wm.update(DT, game);
      wm.checkBossDead();
      // dev-7 fase 59 (54.2): si el presupuesto de bajas se agotó, las
      // torres dejan de dañar. Se envuelve el takeDamage de CADA enemigo
      // vivo (una vez por enemigo) justo después del spawn y ANTES de las
      // colisiones: el jefe queda fuera (nunca se escapa y su muerte no
      // consume presupuesto).
      if (killBudget !== Infinity) armKillBudget(game, killBudget);
      collideProjectiles(game.engine, game.fortress.enemies);
      game.fortress.enemies = game.fortress.enemies.filter((e) => !e.dead);
      if (autoUlt) fireSpecials(game);
      game.fortress.update(DT);
      if (game.fortress.hp <= 0) dead = true;

      while (pendingLevels.length) {
        const lv = pendingLevels.shift();
        // fase 61 — ARSENAL FORZADO: el desbloqueo sale del flag, no de la
        // oferta, y consume su level-up igual que la carta de desbloqueo
        // que el jugador habría elegido (la economía de cartas no se regala).
        if (forcedQueue.length) {
          const spec = forcedQueue.shift();
          if (!applyForcedUnlock(spec, game)) forcedMissed += 1;
          continue;
        }
        let offer = rollOffer(game, rngCards);
        // En modo forzado los desbloqueos FORZADOS no se eligen de la oferta
        // (si no, una torre fuera del conjunto ocuparía un slot y dejaría
        // fuera a una de las forzadas). Solo se filtra lo que el flag MANDA:
        // con `--drone` solo, las torres siguen saliendo de la heurística.
        if (forced) {
          offer = offer.filter((c) => !((c.tower && filtraTorres) || (c.drone && filtraDrones)));
        }
        const card = mode === 'inteligente'
          ? pickCardSmart(offer)
          : pickCard(offer, lv, mode, game, rngCards);
        if (card) applyCard(card, game);
      }
      syncCeiling(game); // torres nuevas → topar sus cartas de techo
      if (TIMELINE) {
        const b = bucketOf(game.timer);
        b.lv = game.lv;
        b.towers = game.fortress.slots.filter(Boolean).length
          + (game.fortress.drones?.length ?? 0);
      }
    }

    // --- Agregado de las métricas del director (fase 65) ---
    // Ventanas de 20 s cortadas del PRIMER al ÚLTIMO spawn: después de la
    // última descarga la run sigue corriendo (se limpia lo que quedó en
    // pantalla) y esa cola no es director. La lista puede traer ventanas
    // VACÍAS (el hueco entre la apertura y el tramo clásico, el jefe en
    // pantalla): quedan en `windows[]` para poder mirarlas, pero la media y
    // los picos se calculan sólo sobre las activas (ver PRESIÓN).
    const windows = [];
    const ventanaDe = (tt) => {
      const i = Math.floor(tt / VENTANA);
      while (windows.length <= i) {
        windows.push({ t: windows.length * VENTANA, types: new Set(), hp: 0, enemies: 0 });
      }
      return windows[i];
    };
    const families = { rock: 0, crystal: 0, spore: 0, virus: 0, otra: 0 };
    const typesSeen = new Set();
    const variantKinds = {};
    let hpTotal = 0;
    let variants = 0;
    for (const s of spawns) {
      const v = ventanaDe(s.t);
      v.types.add(s.type);
      v.hp += s.hp;
      v.enemies += 1;
      typesSeen.add(s.type);
      families[s.family] = (families[s.family] ?? 0) + 1;
      hpTotal += s.hp;
      if (s.variant) {
        variants += 1;
        variantKinds[s.variant] = (variantKinds[s.variant] ?? 0) + 1;
      }
    }

    // PRESIÓN: HP que ENTRA por ventana. Media y picos se leen juntos: una
    // etapa plana tiene el máximo pegado a la media; una ventana > 1,15× la
    // media es un pico (la "ola de choque" de la curva de presión).
    //
    // Las ventanas VACÍAS quedan FUERA de la media y de los picos: el hueco
    // entre la apertura y el tramo clásico (t < OPEN_T) o el silencio
    // mientras el jefe está en pantalla son artefactos del guion, no
    // respiros de la curva de presión (el respiro del diseño es una descarga
    // CHICA, no 20 s de silencio). Siguen en `windows[]` para poder mirarlas.
    const activas = windows.filter((v) => v.enemies > 0);
    const hpPorVentana = activas.map((v) => v.hp);
    const hpMedia = hpPorVentana.length
      ? hpPorVentana.reduce((a, b) => a + b, 0) / hpPorVentana.length : 0;
    const peaks = hpPorVentana.filter((h) => h > hpMedia * PEAK_MUL).length;

    // DISPERSIÓN (plato vs arroyo): por descarga con ≥2 enemigos, la media
    // de los saltos entre llegadas consecutivas (Δt) y el vano total
    // (primera → última). Δt = 0 s = todo entró en el mismo frame ("plato");
    // Δt ≥ STAGGER_S = "arroyo" (el escalonado del director suelta los
    // enemigos de a uno, en ticks distintos: hasta el stagger más fino,
    // 0,06 s, supera el umbral).
    let dtSum = 0;
    let spanSum = 0;
    let staggered = 0;
    let measured = 0;
    for (const times of arrivals.values()) {
      if (times.length < 2) continue;
      const ord = [...times].sort((a, b) => a - b);
      let dt = 0;
      for (let i = 1; i < ord.length; i++) dt += ord[i] - ord[i - 1];
      dt /= (ord.length - 1);
      dtSum += dt;
      spanSum += ord[ord.length - 1] - ord[0];
      if (dt >= STAGGER_S) staggered += 1;
      measured += 1;
    }

    // ARQUETIPOS despachados: la etiqueta del director por descarga. Se
    // recorren las descargas realmente despachadas (por el contexto del
    // despacho, o por la cola original si `_spawnWave` cambió de nombre).
    // Las descargas de jefe no son arquetipo. Sin `archetypeOf` en waves.js,
    // la lista queda vacía y la corrida sigue igual.
    const archetypes = new Set();
    if (archetypeOf) {
      const despachadas = descargas.length
        ? descargas.map((x) => x.wave)
        : colaOriginal.slice(0, Math.max(0, wm.dispatched ?? 0));
      for (const wave of despachadas) {
        if (!wave) continue;
        const grupos = waveGroups(wave);
        if (grupos.some((g) => g.type === 'boss' || g.pattern === 'boss')) continue;
        const etiqueta = archetypeOf(wave);
        if (etiqueta) archetypes.add(etiqueta);
      }
    }

    return {
      win: opts.survival === true ? false : (bossDead && !dead),
      survival: opts.survival === true,
      wave: wm.survivalWave ?? 0,
      timeout: !bossDead && !dead, // se agotó el corte de seguridad
      duration: t,
      hpFrac: Math.max(0, game.fortress.hp) / game.fortress.maxHp,
      leaks: game._leaks,
      lv: game.lv,
      kills: game.kills,
      score: game.score,
      ultFires: game._ultFires,
      bhFires: game._bhFires,
      buckets,
      // fase 72: las fugas son estadística; la base cae por daño acumulado.
      enemies: totalEnemies,
      spawns: game.engine.__spawns ?? 0,
      waveKills: game._waveKills,     // bajas de la ola (sin jefe)
      spawnKills: game._spawnKills,   // bajas de crías de mecánicas
      waveLeaks: game._waveLeaks,     // fugas de la ola (sin crías)
      spawnLeaks: game._spawnLeaks,   // fugas de crías de mecánicas
      splitLeaks: game._splitLeaks,   // fugas de crías del divisor
      killPct: totalEnemies > 0 ? game._waveKills / totalEnemies : 0,
      leakPct: totalEnemies > 0 ? game._waveLeaks / totalEnemies : 0,
      // Daño NETO que las fugas hicieron en la base (fase 72: la fuga vale
      // el HP MÁXIMO del enemigo). Es el dato con el que se calibra la vida
      // de la base por etapa (js/stages.js).
      leakDamage: Math.max(0, game.fortress.maxHp - game.fortress.hp),
      // fase 61 — verificación del arsenal limitado: el arsenal REAL al
      // final de la run (nunca más de CONFIG.SLOTS torres ni MAX_DRONES
      // drones) y cuántos desbloqueos forzados no entraron (0 = el flag se
      // respetó; >0 = no había lugar, o sea el tope de 5 slots hizo efecto).
      towers: game.fortress.slots.filter(Boolean).map((t) => t.type),
      drones: game.fortress.drones.map((d) => d.type),
      forcedMissed,
      // Desbloqueos forzados que quedaron SIN ENTRAR por falta de level-ups
      // (corner case: `--killrate=0` → 0 bajas → 0 level-ups → solo Guardian).
      forcedPending: forcedQueue.length,
      // fase 65 (tarea 5.1) — MÉTRICAS DEL DIRECTOR: qué GENERA el director
      // dentro del stage (composición), no el resultado de la partida. El
      // bloque del CLI las imprime por etapa; ver la cabecera para leerlas.
      waves: {
        window: VENTANA,
        // Una fila por ventana de 20 s: tipos DISTINTOS que entraron, HP que
        // entró y enemigos.
        windows: windows.map((v) => ({
          t: v.t, types: v.types.size, hp: Math.round(v.hp), enemies: v.enemies,
        })),
        enemies: spawns.length,            // enemigos de ola contados (sin jefe)
        variety: activas.length
          ? activas.reduce((s, v) => s + v.types.size, 0) / activas.length
          : 0,                             // tipos distintos medios por ventana
        types: [...typesSeen].sort(),      // el cast de la etapa
        pressure: {
          mean: Math.round(hpMedia),
          max: Math.round(hpPorVentana.length ? Math.max(...hpPorVentana) : 0),
          min: Math.round(hpPorVentana.length ? Math.min(...hpPorVentana) : 0),
          peaks,
          measured: activas.length,
          peakMul: PEAK_MUL,
        },
        hpTotal: Math.round(hpTotal),      // la guarda del ±10 % por etapa
        families,                          // conteo de enemigos por familia
        archetypes: [...archetypes].sort(),
        variants: { total: variants, byKind: variantKinds },
        dispersion: {
          mean: measured ? dtSum / measured : 0,   // Δt medio dentro de la descarga
          span: measured ? spanSum / measured : 0, // vano medio primera→última
          staggered,
          measured,                  // descargas con ≥2 llegadas (Δt medible)
          dispatched: descargas.length, // descargas que soltaron enemigos
          threshold: STAGGER_S,
        },
      },
    };
  } finally {
    Math.random = realRandom; // no dejar el mono-patch global puesto
  }
}

// ---------- CLI ----------
function parseArgs(argv) {
  return Object.fromEntries(argv.map((a) => {
    const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }));
}

/** "1-50" | "1,5,10" | "6" | "51-60" → lista de stages (1..200: campaña +
 *  modo infinito). Un spec inválido (o sin etapas válidas) devuelve la lista
 *  por defecto (campaña). */
export function parseStages(spec) {
  const out = [];
  for (const part of String(spec).split(',')) {
    const s = part.trim();
    if (!s) continue;
    const range = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = clampStage(range[1]);
      const b = clampStage(range[2]);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
    } else if (/^\d+$/.test(s)) {
      const n = Number(s);
      if (n >= 1 && n <= MAX_STAGE) out.push(n);
    }
  }
  return out.length ? out : DEFAULT_STAGES;
}

/** Nº de etapa del CLI recortado a [1, MAX_STAGE]. */
function clampStage(raw) {
  return Math.min(MAX_STAGE, Math.max(1, Number(raw)));
}

/**
 * Protocolo del CLI (fase 69):
 *   --protocol=I|II|III|IV|V  → preset curado
 *   --mods=asedio:2,leva:1   → personalizado (rangos crudos, se normalizan)
 *   --heat=N                 → el preset más alto cuyo heat no supere N
 * Sin flags devuelve null (heat 0).
 *
 * @param {object} args resultado de parseArgs()
 * @returns {Record<string, number>|null}
 */
export function parseProtocol(args = {}) {
  if (args.protocol != null) {
    const id = String(args.protocol).toUpperCase();
    if (!HEAT_PRESETS.some((p) => p.id === id)) {
      throw new Error(`protocolo desconocido: ${id}`);
    }
    return presetMods(id);
  }
  if (args.mods != null) {
    const mods = {};
    for (const part of String(args.mods).split(',')) {
      const [id, raw] = part.split(':');
      if (!id) continue;
      mods[id] = Number(raw ?? 1);
    }
    return normalizeHeatMods(mods);
  }
  if (args.heat != null) {
    const n = Math.max(0, Number(args.heat) || 0);
    const fit = HEAT_PRESETS
      .map((p) => ({ id: p.id, heat: heatTotal(p.mods) }))
      .filter((x) => x.heat <= n)
      .sort((a, b) => b.heat - a.heat)[0];
    return fit ? presetMods(fit.id) : {};
  }
  return null;
}

function fmtPct(v) { return `${Math.round(v * 100)}%`; }

/**
 * Agrega las métricas del DIRECTOR de un stage (fase 65, tarea 5.1),
 * promediando sobre las semillas como el resto de la tabla. Los CONTEOS
 * (enemigos, picos, variantes) se suman; las medias por ventana/descarga se
 * promedian. Ver `directorBlock()` para cómo se lee cada columna.
 */
function directorRow(runs, stage) {
  const w = runs.map((r) => r.waves);
  const avg = (f) => w.reduce((s, x) => s + f(x), 0) / w.length;
  const sum = (f) => w.reduce((s, x) => s + f(x), 0);
  const fams = {};
  const varKinds = {};
  for (const x of w) {
    for (const [k, v] of Object.entries(x.families)) fams[k] = (fams[k] ?? 0) + v;
    for (const [k, v] of Object.entries(x.variants.byKind)) varKinds[k] = (varKinds[k] ?? 0) + v;
  }
  const ventanas = sum((x) => x.pressure.measured);
  const medidas = sum((x) => x.dispersion.measured);
  const despachadas = sum((x) => x.dispersion.dispatched);
  return {
    stage,
    enemies: sum((x) => x.enemies),
    variantes: sum((x) => x.variants.total),
    types: avg((x) => x.variety),
    cast: [...new Set(w.flatMap((x) => x.types))].sort(),
    hpMean: avg((x) => x.pressure.mean),
    hpMax: avg((x) => x.pressure.max),
    hpMin: avg((x) => x.pressure.min),
    peaks: sum((x) => x.pressure.peaks),
    ventanas,
    hpTotal: avg((x) => x.hpTotal),
    dt: avg((x) => x.dispersion.mean),
    span: avg((x) => x.dispersion.span),
    medidas,
    despachadas,
    arroyo: medidas ? sum((x) => x.dispersion.staggered) / medidas : 0,
    fams,
    arq: [...new Set(w.flatMap((x) => x.archetypes))].sort(),
    varKinds,
  };
}

/**
 * Bloque de MÉTRICAS DEL DIRECTOR (fase 65, tarea 5.1): lo que el director
 * GENERA dentro del stage, por etapa y promediado sobre las semillas. Va
 * aparte de la tabla de resultados porque mide otra cosa (composición) y se
 * lee con otros ojos:
 *   · tipos/vent — tipos de enemigo distintos por ventana de 20 s (media);
 *   · HP/vent    — HP que ENTRA por ventana (media · máx · mín) y cuántas
 *                  ventanas pasan de 1,15× la media (los picos de la curva
 *                  de presión) + HP/etapa (la guarda del ±10 % del diseño).
 *                  Las ventanas SIN spawns (hueco de la apertura, jefe en
 *                  pantalla) no cuentan: son guion, no presión.
 *   · Δt/desc    — media de los saltos entre llegadas DENTRO de una descarga
 *                  y % de descargas "arroyo" (Δt ≥ 0,05 s): 0 s = "plato";
 *   · la fila ↳ desglosa familias, cast, arquetipos, variantes de élite,
 *     descargas (y en cuántas se pudo medir el Δt) y el vano medio.
 * AVISO DE LECTURA: esto también es un PISO — mide la composición, no la
 * dificultad que aguanta el jugador.
 */
function directorBlock(rows) {
  console.log('\nMÉTRICAS DEL DIRECTOR por etapa (media de las semillas) — composición, no dificultad:');
  console.log('| Stage | tipos/vent | HP/vent media | HP/vent máx | HP/vent mín | ventanas pico (>1,15×) | HP/etapa | Δt/descarga | descargas arroyo |');
  console.log('|-------|-----------|---------------|-------------|-------------|------------------------|----------|-------------|------------------|');
  const pct = (n, tot) => fmtPct(n / Math.max(1, tot));
  for (const d of rows) {
    const familias = ENEMY_FAMILY_IDS.map((f) => `${f} ${pct(d.fams[f] ?? 0, d.enemies)}`).join(' · ')
      + ((d.fams.otra ?? 0) > 0 ? ` · sin familia ${pct(d.fams.otra, d.enemies)}` : '');
    const variantes = Object.entries(d.varKinds)
      .map(([k, v]) => `${k} ${pct(v, d.enemies)}`).join(' · ') || 'ninguna';
    console.log(`| ${d.stage} | ${d.types.toFixed(1)} | ${Math.round(d.hpMean)} | ${Math.round(d.hpMax)} | `
      + `${Math.round(d.hpMin)} | ${d.peaks}/${d.ventanas} (${pct(d.peaks, d.ventanas)}) | `
      + `${Math.round(d.hpTotal / 1000)}k | ${d.dt.toFixed(2)} s | ${pct(d.arroyo, 1)} |`);
    console.log(`|   ↳ familias: ${familias} · enemigos medidos: ${d.enemies} · cast: ${d.cast.length} tipos `
      + `(${d.cast.join(', ') || '—'}) · arquetipos: `
      + `${d.arq.length ? `${d.arq.length} (${d.arq.join(', ')})` : 'sin archetypeOf() en waves.js'} `
      + `· variantes: ${pct(d.variantes, d.enemies)} (${variantes}) · descargas: ${d.despachadas} `
      + `(Δt medido en ${d.medidas}) · vano medio: ${d.span.toFixed(1)} s |`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const MODE = args.mode ?? DEFAULT_MODE;         // greedy | tardy | mixto | inteligente
  const CEILING_CARDS = args.cards === 'ceiling'; // cartas al tope (cartas REALES)
  const SEEDS = Number(args.seeds ?? DEFAULT_SEEDS);
  const PERKS_MODE = args.perks ?? DEFAULT_PERKS; // none | optimal
  // dev-7 fase 59 (54.1): --meta=trajectory deriva el nivel meta del stage
  // con la política real de la campaña. Por defecto sigue siendo el "piso"
  // (meta 1) para no romper la comparación con las tablas de docs/BALANCE.md.
  const META_ARG = args.meta === 'trajectory' ? 'trajectory' : Number(args.metalv ?? DEFAULT_META_LV);
  // dev-7 fase 59 (54.2): --killrate=X → el jugador mata como máximo el X %
  // de los enemigos (escenario de presión; ya no hay una "regla del 75 %").
  const KILL_RATE = args.killrate != null ? Number(args.killrate) : null;
  // fase 68: --variants=ID fuerza a que TODAS las élites de la etapa usen ese
  // afijo (mide el peor caso de un afijo concreto sin cambiar cuántas élites
  // hay). Sin flag, el reparto normal del director.
  const FORCED_VARIANT = args.variants ?? null;
  if (FORCED_VARIANT != null && !Object.hasOwn(ENEMY_VARIANTS, FORCED_VARIANT)) {
    console.error(`balance-sim: variante desconocida: ${FORCED_VARIANT}`);
    process.exit(1);
  }
  // fase 69: --protocol=I..V / --mods=asedio:2,leva:1 / --heat=N → Protocolo.
  let PROTOCOL_MODS = null;
  let RUN_MODS = null;
  try {
    PROTOCOL_MODS = parseProtocol(args);
    RUN_MODS = PROTOCOL_MODS ? heatMods(PROTOCOL_MODS) : null;
  } catch (err) {
    console.error(`balance-sim: ${err.message}`);
    process.exit(1);
  }
  // fase 61: --towers=a,b,c,d / --drone=x → ARSENAL FORZADO (ver cabecera).
  // Un spec inválido (tipo que no existe, más torres que slots) corta la
  // corrida con un error: medir otro arsenal en silencio sería peor.
  let FORCED = null;
  try {
    FORCED = parseForcedArsenal(args);
  } catch (err) {
    console.error(`balance-sim: ${err.message}`);
    process.exit(1);
  }
  const STAGES_TO_RUN = args.stage
    ? [Number(args.stage)] // --stage=N: un solo stage (comportamiento original)
    : (args.stages ? parseStages(args.stages) : DEFAULT_STAGES);

  // FASE 58 — alto lógico del canvas (540×h). Sin esto: 880 (referencia).
  const LOGICAL_H = Number(args['logical-h'] ?? 0);
  if (Number.isFinite(LOGICAL_H) && LOGICAL_H > 0) setLogicalHeight(LOGICAL_H);

  const arsenalTxt = FORCED
    ? ` · arsenal FORZADO: ${FORCED.towers ? FORCED.towers.join('+') : 'torres al azar'}`
      + ` + ${FORCED.drone ?? 'sin dron'}`
    : '';
  console.log(`balance-sim (reconstruido dev-7) - modo=${MODE} cartas=${CEILING_CARDS ? 'ceiling' : 'normal'} `
    + `meta=${META_ARG === 'trajectory' ? 'trayectoria' : META_ARG} perks=${PERKS_MODE} `
    + `killrate=${KILL_RATE ?? 'libre'} seeds=${SEEDS} logicalH=${LAYOUT.h} heat=${RUN_MODS?.heat ?? 0}${arsenalTxt}\n`);

  // fase 70 — MODO SUPERVIVENCIA: una run por semilla, sin etapas. Se mide
  // la oleada alcanzada (la base a 0), no el win de una etapa.
  if (args.survival === true) {
    console.log('| Seed | oleada | score | duración | Lv | HP fin | timeout |');
    console.log('|------|--------|-------|----------|----|--------|---------|');
    let totalWaves = 0;
    let best = 0;
    let timeouts = 0;
    for (let s = 1; s <= SEEDS; s++) {
      const r = await runStage(SURVIVAL.baseStage, MODE, s * 7919 + 70, {
        ceiling: CEILING_CARDS, metaLv: META_ARG, perks: PERKS_MODE,
        runMods: RUN_MODS, survival: true,
      });
      totalWaves += r.wave;
      best = Math.max(best, r.wave);
      if (r.timeout) timeouts += 1;
      console.log(`| ${s} | ${r.wave} | ${r.score} | ${r.duration.toFixed(0)} s | Lv.${r.lv} | ${(r.hpFrac * 100).toFixed(0)}% | ${r.timeout ? 'sí' : '—'} |`);
    }
    console.log(`\noleada media ${(totalWaves / SEEDS).toFixed(1)} · mejor ${best} · timeouts ${timeouts}/${SEEDS}`);
    return;
  }

  console.log('| Stage | meta | win | duración | HP fin | leaks | % bajas | daño fugas | Lv fin | ⏱ timeout |');
  console.log('|-------|------|-----|----------|--------|-------|---------|------------|--------|-------------|');

  let ultTotal = 0;
  let bhTotal = 0;
  let runsTotal = 0;
  // fase 61 — verificación del arsenal limitado (tarea 3.2): el sim usa la
  // Fortress REAL, así que el tope de CONFIG.SLOTS torres / MAX_DRONES
  // drones sale del núcleo; estos contadores lo comprueban en cada corrida
  // (máximo observado + composición final del arsenal).
  let maxTowers = 0;
  let maxDrones = 0;
  let forcedMisses = 0;
  const towersSeen = new Set();
  const dronesSeen = new Set();
  const dirRows = []; // fase 65: bloque de métricas del director (por etapa)
  for (const stageId of STAGES_TO_RUN) {
    const runs = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      runs.push(await runStage(stageId, MODE, seed * 7919 + stageId, {
        ceiling: CEILING_CARDS, metaLv: META_ARG, perks: PERKS_MODE,
        killRate: KILL_RATE, forcedArsenal: FORCED,
        forceVariant: FORCED_VARIANT, runMods: RUN_MODS,
      }));
    }
    const wins = runs.filter((r) => r.win).length;
    const timeouts = runs.filter((r) => r.timeout).length;
    const avg = (key) => runs.reduce((s, r) => s + r[key], 0) / runs.length;
    ultTotal += runs.reduce((s, r) => s + r.ultFires, 0);
    bhTotal += runs.reduce((s, r) => s + r.bhFires, 0);
    runsTotal += runs.length;
    for (const r of runs) {
      maxTowers = Math.max(maxTowers, r.towers.length);
      maxDrones = Math.max(maxDrones, r.drones.length);
      forcedMisses += r.forcedMissed ?? 0;
      r.towers.forEach((t) => towersSeen.add(t));
      r.drones.forEach((d) => dronesSeen.add(d));
    }
    const metaUsado = META_ARG === 'trajectory' ? trajectoryMetaLevel(stageId) : META_ARG;
    console.log(`| ${stageId} | ${metaUsado} | ${fmtPct(wins / runs.length)} | ${avg('duration').toFixed(0)} s | `
      + `${fmtPct(avg('hpFrac'))} | ${avg('leaks').toFixed(1)} | ${fmtPct(avg('killPct'))} | `
      + `${avg('leakDamage').toFixed(0)} | ${avg('lv').toFixed(1)} | `
      + `${timeouts ? `${timeouts}/${runs.length}` : '—'} |`);
    // fase 61: en modo forzado, el arsenal que de verdad quedó en el campo
    // (tarea 3.1: comprobar que el flag se respetó, no sólo que la tabla se
    // movió) + los desbloqueos que no entraron (tope de 5 slots) y los que
    // ni se intentaron (sin level-ups: p. ej. --killrate=0).
    if (FORCED) {
      const torres = [...new Set(runs.flatMap((r) => r.towers))].join(',');
      const drones = [...new Set(runs.flatMap((r) => r.drones))].join(',') || 'ninguno';
      const fallos = runs.reduce((s, r) => s + (r.forcedMissed ?? 0), 0);
      const pendientes = runs.reduce((s, r) => s + (r.forcedPending ?? 0), 0);
      console.log(`|   ↳ arsenal final: ${torres} · dron: ${drones} · `
        + `desbloqueos forzados que no entraron: ${fallos}`
        + `${pendientes ? ` · sin entrar por falta de level-ups: ${pendientes}` : ''} |`);
    }
    // DIAGNÓSTICO: línea de tiempo (kills/fugas por tramo de 20 s).
    if (process.env.GDF_TIMELINE === '1') {
      const maxB = runs[0].buckets?.length ?? 0;
      for (let b = 0; b < maxB; b++) {
        const k = runs.reduce((s, r) => s + (r.buckets[b]?.kills ?? 0), 0);
        const l = runs.reduce((s, r) => s + (r.buckets[b]?.leaks ?? 0), 0);
        if (k + l === 0) continue;
        console.log(`|   t=${b * 20}-${b * 20 + 20}s | kills ${k} | fugas ${l} | lv ${runs[0].buckets[b]?.lv ?? '?'} | torres ${runs[0].buckets[b]?.towers ?? '?'} |`);
      }
    }
    // fase 65 (tarea 5.1): el agregado del director se imprime al final, en
    // su propio bloque (ver directorBlock), para no partir la tabla de
    // resultados con las filas del timeline.
    dirRows.push(directorRow(runs, stageId));
  }
  directorBlock(dirRows);
  console.log(`\nUltimate (ORBITAL) disparado: ${(ultTotal / Math.max(1, runsTotal)).toFixed(2)} por run · `
    + `Black Hole: ${(bhTotal / Math.max(1, runsTotal)).toFixed(2)} por run`);
  // fase 61 — el tope del arsenal (tarea 3.2): el máximo observado tiene que
  // quedar dentro de lo que declara el núcleo (CONFIG.SLOTS / MAX_DRONES).
  console.log(`Arsenal (por run): máx ${maxTowers} torres de ${CONFIG.SLOTS.length} slots · `
    + `máx ${maxDrones} drones de ${MAX_DRONES} · torres vistas: ${[...towersSeen].join(',') || '—'}`
    + `${dronesSeen.size ? ` · drones vistos: ${[...dronesSeen].join(',')}` : ''}`
    + `${maxTowers > CONFIG.SLOTS.length || maxDrones > MAX_DRONES ? ' ← ¡TOPE ROTO!' : ''}`);
  if (FORCED && forcedMisses) {
    console.log(`AVISO: ${forcedMisses} desbloqueo(s) forzado(s) no entraron (arsenal lleno): `
      + 'el flag pide más unidades de las que caben en la partida.');
  }
}

// La CLI solo corre si este archivo es el entry point (los tests lo
// importan como módulo).
const ES_MODULO = fileURLToPath(import.meta.url);
const ES_MAIN = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ES_MODULO);
if (ES_MAIN) await main();
