// ============================================================
// towers.js — datos TOWERS + clase Tower (dev-2, §2.2/§2.3)
// Torres de la plataforma (5 slots, fase 61; colocación libre, fase 63):
// disparo AUTOMÁTICO hacia arriba, sin apuntado (§1.5).
// Recibe referencias por parámetro — jamás importa hud/cards/main.
//
// Proyectiles son entidades del engine ({update(dt), draw(ctx),
// dead}); obtienen los enemigos vía game.fortress.enemies (lista
// viva, vacía hasta dev-3 — tolerada). Colisiones: NO aquí (dev-3).
// ============================================================

import { CONFIG, LAYOUT, clamp, dist, rand, fallYAfter } from './engine.js';
import { closestPointOnSegment, pointSegmentDistance, withAlpha } from './geometry.js';
import { applyStun, rollCrit, tryFreeze } from './combat-crit.js';
import { applyProjectileHit, applyPoison, applySlow, applyMark } from './enemies.js';
// dev-7 fase 28: `perkDmgFor` (DPS real de las espinas = thornDps del
// perk × metaDmgMul) y `META_SLOW_CAP` (tope COMBINADO del slow del
// Campo de Fuerza) viven en meta.js — se importan acá para no duplicar
// las constantes ni volver a leerlas como números sueltos.
import { metaDmgMul, metaSlowFrac, perkMods, perkDmgFor, mergeMods, META_SLOW_CAP } from './meta.js';
// dev-7 fase 26: la lógica de perks (remate / robo de vida / explosión al
// matar) y la señal visual+sonora vivían DUPLICADAS en towers.js y en
// enemies.js — dos copias que ya habían divergido (el lifesteal se
// aplicaba por enemigo en el splash pero no en el resto). Ahora hay UNA
// sola implementación en perks.js y las dos rutas la comparten.
import { applyPerkDamage, onHitOpts, pickOnHit } from './perks.js';
import { healBase } from './base-heal.js';
// dev-7 fase 32: los tipos de daño (para el glifo bajo la torre y el
// color del feedback). La MATRIZ se aplica en enemies.js (takeDamage).
import { DAMAGE_TYPES } from './damagetypes.js';
// fase 60: el ARTE de las torres vive en su propio módulo (datos del rig
// + renderizador). Antes era un switch de 537 líneas acá dentro.
import {
  TOWER_RIGS, TOWER_PAD, PAD_GLYPH, TOWER_VISUAL_SCALE,
  renderTowerRig, rigHotPoint, rigHotRadius, drawGlow,
} from './tower-art.js';

/**
 * dev-7 fase 51 — MODS EFECTIVOS de una unidad: la FUSIÓN de los perks
 * de meta (`perkMods(type)`) y los mods que la unidad haya ganado por
 * CARTAS (`unit.cardMods`, el canal de js/perks.js).
 *
 * POR QUÉ vive acá y no en perks.js: la composición usa `mergeMods` de
 * meta.js (la MISMA política por clave que usan los perks entre sí:
 * producto para multiplicadores, "se queda con el mejor" para umbrales,
 * suma con tope para probabilidades) y perks.js NO puede importar
 * meta.js (regla de dependencias de su cabecera).
 *
 * ANTES: las torres leían `perkMods('x')` en ~24 sitios, o sea que el
 * vocabulario de mecánicas venía SIEMPRE del meta-juego y una carta
 * no podía dar MECÁNICAS. Ahora toda esa lectura pasa por aquí: una
 * carta de técnica (rebote, perforación, explosión al morir,
 * ralentizar, crítico, robo de vida, aturdir, remate) se comporta
 * EXACTAMENTE como el perk equivalente — es el mismo código, no una
 * copia.
 *
 * @param {object} unit torre o dron (duck-typed)
 * @returns {object} mods fusionados (nunca null)
 */
export function unitMods(unit) {
  if (!unit) return {};
  const pm = unit.type ? perkMods(unit.type) : {};
  const cm = unit.cardMods;
  if (!cm || typeof cm !== 'object' || Object.keys(cm).length === 0) return pm;
  return mergeMods([{ mods: pm }, { mods: cm }]);
}

/** Daño a un blanco duck-typed (tolera dummies de test sin takeDamage). */
function hurt(enemy, n, kind) {
  if (enemy && !enemy.dead && typeof enemy.takeDamage === 'function') {
    return enemy.takeDamage(n, kind);
  }
  return false;
}

/**
 * dev-7 fase 23: aplicador de las mecánicas de perks para las torres y
 * drones (beam, tesla, cadena, láser, espinas, picaduras). La
 * implementación real vive en perks.js — acá solo se le pasa el contexto
 * de juego para que pueda curar al escudo y emitir las señales.
 */
function hurtP(enemy, n, kind, mods, game, enemies) {
  return applyPerkDamage(enemy, n, kind, mods, game, enemies);
}

/** fase 74.2 — Onda Glacial: las explosiones dejan slow en el área. */
function applyExplosionCombo(game, x, y, R) {
  const cm = game?.fortress?.comboMods;
  if (!(cm?.explosionSlowFrac > 0)) return;
  const list = game?.fortress?.enemies;
  if (!Array.isArray(list)) return;
  for (const e of list) {
    if (!e || e.dead) continue;
    if (dist(e.x, e.y, x, y) <= R + (e.r ?? 10)) {
      applySlow(e, cm.explosionSlowFrac, cm.explosionSlowTime ?? 2, 'explosion');
    }
  }
}

// ---------- dev-7 fase 3: chasis reales por tipo de torre (sprites
// recoloreados a cada acento, ver assets/sprites/ui_tinted/). Carga
// perezosa y tolerante a fallos: si un sprite no cargó todavía o falla,
// Tower.render() simplemente no lo dibuja — nunca rompe el loop. Solo
// aplica a las 5 torres básicas; mortar/gauss/laser (arsenal
// extendido) quedan 100% procedurales como hasta ahora. ----------
function _loadChassis(src) {
  // Guard typeof (mismo patrón que engine.js _bindInput): permite
  // importar towers.js desde Node (tests, scripts/balance-sim.mjs)
  // sin el global Image del navegador — hallazgo dev-7 fase 6 al
  // reconstruir el simulador de balance.
  if (typeof Image === 'undefined') return { img: null, ready: false };
  const img = new Image();
  const entry = { img, ready: false };
  img.onload = () => { entry.ready = true; };
  img.src = src;
  return entry;
}
const TOWER_CHASSIS_SPRITES = {
  fan: _loadChassis('assets/sprites/ui_tinted/tower_guardian.png'),
  homing: _loadChassis('assets/sprites/ui_tinted/tower_missile.png'),
  beam: _loadChassis('assets/sprites/ui_tinted/tower_beam.png'),
  bolt: _loadChassis('assets/sprites/ui_tinted/tower_thunder.png'),
  chain: _loadChassis('assets/sprites/ui_tinted/tower_tesla.png'),
};

/** Stats base §2.2 + arsenal extendido §2.3. Números EXACTOS del doc. */
export const TOWERS = {
  guardian: {
    name: 'Guardian',
    dmgType: 'ballistic', // fase 32: tipo de daño (js/damagetypes.js)
    kind: 'fan',
    cooldown: 0.23, damage: 8, spreadDeg: 14, detectHalfWidth: Infinity, // v4 4a: cadencia rápida + tracking GLOBAL (cualquier enemigo izq/der)
    bulletSpeed: 920, bulletColor: '#35C8FF', // v5 5c/5: balas 920 px/s (vuelo a fondo ~0.3-0.4 s; antes 780)
    bodyColor: '#0E1216', accent: '#35C8FF',
    // v3 3b/7 (corrección canónica JK 26-08): el Guardian NO dispara en
    // abanico siempre. Lv.1 → 1 bala DIRIGIDA al enemigo más cercano;
    // cada mejora (+1 nivel) suma 1 bala PARALELA (spread 0); desde Lv.4
    // el disparo se abre en ABANICO con spread proporcional al nivel.
  },
  missile: {
    name: 'Missile',
    dmgType: 'blast', // fase 32: tipo de daño
    kind: 'homing',
    cooldown: 1.2, damage: 35, splashR: 60,
    speed: 260, turnRate: 4.5, detectHalfWidth: Infinity, // homing global
    bodyColor: '#141A22', accent: '#FFB36A', trailColor: '#FFB36A',
  },
  beam: {
    name: 'Beam',
    dmgType: 'light', // fase 32: tipo de daño
    kind: 'beam',
    // dev-7 fase 34: el haz alcanza 260 px A CADA LADO y TODO el alto
    // (el "rango" del juego es un ancho de detección; las torres disparan
    // hacia arriba sin límite de Y). Antes era una columna de 20 px con
    // ventana de caza de ±80 px: el haz sólo se activaba para lo que
    // pasaba por su carril y el jugador lo veía "limitado por un ángulo".
    // OJO: un radio CIRCULAR de 260 px medido desde la torre (y=830) NO
    // serviría: dejaría fuera la parte alta de la pantalla (el jefe a
    // 800 px) y el haz perdería alcance.
    // El ancho NO reparte daño: el haz lastima SOLO al blanco elegido y
    // `columnHalfWidth` es la ventana de adquisición (y el grosor visual).
    // fase 66 — CICLO DEL HAZ (antes: 24 DPS continuos, techo ×3 = 72):
    // entra con el damagePerSec BAJO de la tabla y el RAMP de foco lo lleva
    // a ×4,5 (10 → 45 DPS a los ~4,4 s sobre el MISMO blanco). Dispara en
    // VENTANAS de beamBurst y, al cerrarse una, entra un cooldown de
    // beamCooldown con el haz APAGADO y sin adquirir: 4,5 s encendido +
    // 2,5 s apagado = 64 % de servicio. Dentro de la ventana el haz PUEDE
    // cambiar de blanco (si el enemigo muere re-adquiere y sigue, con el
    // ramp reiniciado): el cooldown castiga CERRAR la ventana, no matar.
    damagePerSec: 10, columnHalfWidth: 260,
    beamRampPerSec: 0.8, beamRampMax: 4.5, beamBurst: 4.5, beamCooldown: 2.5,
    coreColor: '#E8FFE8', beamColor: '#39FF6A',
    bodyColor: '#10161A', accent: '#39FF6A',
  },
  thunderstroke: {
    name: 'Thunderstroke',
    dmgType: 'electric', // fase 32: tipo de daño
    kind: 'bolt',
    // fase 73 — TIRO LARGO GLOBAL: mismo patrón que Gauss/Mortar/Láser
    // (`detectHalfWidth: Infinity`), sin el círculo de 260 px que lo
    // limitaba a la mitad de la pantalla. Sigue apuntando al MÁS LEJANO
    // (farthest, sticky).
    // DIFERENCIA CON LA TESLA: la Tesla ENCADENA saltos de enemigo a
    // enemigo (falloff); el Thunderstroke dispara UN rayo principal al
    // blanco elegido y, en el punto de impacto, abre MINI RAYOS de área
    // a los vecinos. `areaR`/`areaFrac`/`areaTargets`/`areaStun` son ese
    // estallido; los perks extraCount/chainFork suman mini rayos, no
    // rayos principales.
    cooldown: 1.6, damage: 65, stun: 0.2,
    areaR: 130, areaFrac: 0.5, areaTargets: 3, areaStun: 0.1,
    detectHalfWidth: Infinity,
    color: '#B48CFF', coreColor: '#FFFFFF',
    bodyColor: '#12101C', accent: '#B48CFF',
  },
  tesla: {
    name: 'Tesla',
    dmgType: 'electric', // fase 32: tipo de daño
    kind: 'chain',
    // fase 66 — BANDA DE COBERTURA + ENJAMBRE: el alcance deja de ser un
    // círculo de 260 px medido desde la torre (un enjambre que caía por
    // la esquina OPUESTA quedaba fuera — justo el caso que esta torre
    // tiene que resolver) y pasa a ser una BANDA horizontal: sin tope de
    // X y 330 px de alto sobre la fila (`reachY`; ver targetInRange,
    // rangeBand). Con la cobertura la cadencia sube y el daño por golpe
    // baja: 5+3,75+2,8+2,1+1,6 = 15,25 por 0,7 s ≈ 22 DPS repartidos en 5
    // blancos (antes 22+16,5+12,4 = 50,9 por 1,9 s ≈ 27 DPS en 3) y a UN
    // solo blanco baja (11,6 → 7,1). La CALIBRACIÓN de la fase 66 movió las
    // dos palancas del daño: `damage` 6 → 5 y `cooldown` 0,6 → 0,7 s. Con
    // 0,6 el escenario Guardian+Tesla quedaba en 92 % de bajas en el S50 y
    // la campaña en 93 % (contra el 73 % y el 80 % del cierre de la 65);
    // con 0,8 el escenario caía a 77 % y perdía el S50. El ALCANCE no se
    // toca: es la identidad de la torre (anti-enjambre de banda).
    cooldown: 0.7, damage: 5, falloff: 0.75, jumps: 5,
    rangeBand: true, reachY: 330,
    // `detectHalfWidth: Infinity`: la banda no tiene tope de X. Sin esto
    // `detectWidth()` caería al respaldo de 60 px (ya no hay `range`) y la
    // banda quedaría tan angosta como la vieja ventana del Beam.
    detectHalfWidth: Infinity,
    color: '#9A6CFF', coreColor: '#FFFFFF',
    bodyColor: '#12101C', accent: '#9A6CFF',
  },
  // Arsenal extendido (§2.3) — entran al pool de cartas desde Stage 2
  mortar: {
    name: 'Mortar',
    dmgType: 'blast', // fase 32: tipo de daño
    kind: 'mortar',
    // dev-7 fase 34: el radio de la explosión pasa de 110 a 150 px. Con
    // 110 sólo entraban los enemigos a ≤122 px del blanco (radio + r del
    // enemigo): dos enemigos separados 150 px (lo normal en una oleada)
    // veían cómo el obús mataba a UNO solo.
    cooldown: 2.2, damage: 45, blastR: 150,
    speed: 300, bodyColor: '#16181D', accent: '#FFD24A',
    detectHalfWidth: Infinity, // artillería anti-área: apunta a TODO el campo
  },
  gauss: {
    name: 'Gauss',
    dmgType: 'ballistic', // fase 32: tipo de daño
    kind: 'gauss',
    cooldown: 3.5, damage: 120,
    speed: 1400, bodyColor: '#12141A', accent: '#7FDFFF',
    detectHalfWidth: Infinity, // v5: el riel apunta a CUALQUIER X (elige al
    // enemigo más avanzado y rota — corrección JK "apuntar antes de disparar")
  },
  laser: {
    // v4 4c/5 (corrección canónica JK 27-08): torre LÁSER NUEVA — un
    // DISPARO CON DURACIÓN: rayo recto hacia el enemigo que queda
    // ESTÁTICO unos segundos, dañando (penetrante) todo lo que toque.
    name: 'Láser',
    dmgType: 'light', // fase 32: tipo de daño
    kind: 'laser',
    cooldown: 4.0, damagePerSec: 45, laserDuration: 3.2, // arranque: ver docs/BALANCE.md "v4 4c"
    // fase 66: el par se mueve JUNTO (duración 2,5 → 3,2 y cooldown 3,2 →
    // 4,0). Con el cooldown viejo la duración nueva lo empataba y el rayo
    // quedaba SIEMPRE encendido (100 % de servicio = buff gratis): así el
    // DPS medio se mantiene (~36) y el haz dura más y se lee mejor.
    // dev-7 fase 29: el rayo pasa a LIMA (#9DFF3C, la firma de su boca) —
    // antes era #3DFC5A, un verde casi igual al del Beam (#39FF6A) y las
    // dos torres parecían la misma. Solo es color: el daño y el ancho del
    // rayo (LASER_WIDTH) no cambian.
    beamColor: '#9DFF3C', coreColor: '#E8FFE8',
    bodyColor: '#10161A', accent: '#3DFC5A',
    detectHalfWidth: Infinity, // apunta al enemigo más avanzado SIN límite de X
  },
};

/**
 * fase 63 — SLOT del Guardian al arrancar la partida. Es la ÚNICA torre con
 * lugar fijo, y no por un slot canónico por tipo (eso se eliminó: cualquier
 * torre puede ocupar cualquier bahía libre) sino porque el centro es el eje
 * de la base — la cúpula, el arco de HP y el núcleo están ahí. Lo pide
 * `main.js` de forma EXPLÍCITA al sembrar la torre inicial.
 */
export const GUARDIAN_SLOT = 2;

/**
 * dev-7 fase 28 — FIRMA VISUAL del arsenal avanzado. El Láser, el
 * Thunderstroke, el Tesla y el Gauss se confundían en pantalla: todos
 * "una torre con un rayo", y además el Láser compartía un verde casi
 * idéntico al del Beam (#3DFC5A vs #39FF6A) y el Thunderstroke un violeta
 * casi idéntico al del Tesla (#B48CFF vs #9A6CFF).
 *
 * Cada uno de los 4 recibe ahora un color de BOCA (muzzle) PROPIO, que
 * tiñe su elemento "caliente" (lente / orbe / chispa / boca del riel), su
 * fogonazo y su pulso de reposo — NO el cuerpo ni el proyectil, que
 * siguen con su color propio. Paleta de los 4 acentos:
 *   · LÁSER         → LIMA        #9DFF3C  (rayo focal verde)
 *   · THUNDERSTROKE → ÁMBAR       #FFB347  (rayo seco de tormenta)
 *   · TESLA         → CIAN PLASMA #33E0FF  (cadena de plasma)
 *   · GAUSS         → MAGENTA     #FF5CC8  (perdigón de alta energía)
 * Los 4 se distinguen a simple vista entre sí y del resto del arsenal.
 *
 * Las claves son los `kind` de TOWERS (los que usa el render): 'bolt' =
 * Thunderstroke, 'chain' = Tesla.
 *
 * fase 60: la BOCA de cada torre (dónde sale el fogonazo) ya no es una
 * tabla paralela — vive en el propio rig (`hot` de js/tower-art.js), así
 * que el punto de disparo y la pieza que dispara son la MISMA fuente.
 * Antes `MUZZLE_AT` solo cubría 3 torres y el resto caía a un (0,-52)
 * fijo: el Missile y el Mortar dejaban el fogonazo flotando en el aire.
 */
export const MUZZLE_ACCENT = {
  laser: '#9DFF3C',
  bolt: '#FFB347',
  chain: '#33E0FF',
  gauss: '#FF5CC8',
};

// ------------------------------------------------------------
// dev-7 fase 29 — PRESENCIA DE LAS TORRES en pantalla.
//
// En el diseño base de la Etapa 1 las torres se leían "chicas y apagadas":
// flotaban sobre la plataforma sin apoyo y todas disparaban con el
// mismo azul. Esta fase es SOLO de render: ni la tabla de stats, ni el
// daño, ni la cadencia, ni la hitbox de los proyectiles cambian (todo
// eso está calibrado por el balance — ver docs/BALANCE.md).
// ------------------------------------------------------------

/**
 * fase 60 — PRESENCIA de las torres. La escala de dibujo de la silueta
 * vive en js/tower-art.js junto al pad (el encaje de los slots vacíos de
 * js/player.js la usa para medir lo mismo). Acá solo se importa.
 */

/** Duración del REALCE de disparo (flash del color de acento), en s. */
const TOWER_FLASH_TIME = 0.12;

/**
 * fase 60 — CONSTANTES DE ANIMACIÓN del rig (ver js/tower-art.js).
 * El RETROCESO es un desplazamiento del cañón hacia atrás que decae en
 * ~0.17 s (1/6) y el CALOR es el tinte que se queda en la boca ~1.7 s
 * después de disparar (1/0.6). Los dos son SOLO render: no tocan daño,
 * cadencia ni hitbox.
 */
const RECOIL_DECAY = 6;
const HEAT_DECAY = 0.6;

/**
 * fase 66 — Color de la BOCA del Beam durante el cooldown: el haz apagado
 * se lee como "este emisor está enfriando" (gris verdoso, sin pulso), en
 * vez de latir como si estuviera listo. Solo render.
 */
const BEAM_COOLDOWN_COLOR = '#4A5A52';

/**
 * Nivel máximo de una torreta dentro de la RUN (1-5). El nivel de META
 * (1-100) es otra cosa y vive en meta.js.
 */
export const MAX_TOWER_LEVEL = 5;

/**
 * fase 66 — Cuánto sube la banda de la Tesla POR ENCIMA del borde del
 * "bajo fuego" del layout (`LAYOUT.bandY`), en px del layout de
 * referencia. Se multiplica por `fallScale` para que el TIEMPO bajo fuego
 * sea el mismo con el marco alto (fase 58): en la referencia
 * (fila en 830, bandY 570) el techo queda en 570 − 70 = 500, o sea una
 * banda de 330 px sobre la fila (= `TOWERS.tesla.reachY`), el 38 %
 * inferior de los 880 del campo.
 */
const TESLA_ABOVE_BAND = 70;

/**
 * fase 66 — Radio LOCAL del salto de la cadena de la Tesla: cada nodo
 * siguiente se elige por cercanía al ANTERIOR (no a la torre), así la
 * descarga sigue al enjambre donde esté.
 */
const TESLA_CHAIN_RADIUS = 170;

/**
 * fase 73 — Tope de objetivos del estallido del Thunderstroke. El árbol
 * de perks suma +1 mini rayo por `extraCount`/`chainFork`; con los valores
 * actuales el máximo natural es 3 (base) + 5 + 4 = 12. El tope evita que
 * datos corruptos o futuros perks generen una lista patológica.
 */
const THUNDER_AREA_MAX = 12;

/**
 * fase 74.1 — VENTANA del enlace de carga del Thunderstroke: el rayo
 * suave solo aparece en los últimos 0,5 s antes del disparo, NO durante
 * todo el cooldown. El orbe del rig sigue creciendo aparte.
 */
const THUNDER_LINK_WINDOW = 0.5;

/**
 * dev-7 fase 29 — COLOR DEL PROYECTIL de cada torre: el tiro dice de
 * qué torre salió. Se usa la FIRMA visual de la fase 28 (MUZZLE_ACCENT)
 * cuando existe y, si no, el `accent` canónico de la torre:
 *   Guardian → #35C8FF · Missile → #FFB36A · Beam → #39FF6A
 *   Mortar → #FFD24A · Thunderstroke → #FFB347 · Tesla → #33E0FF
 *   Gauss → #FF5CC8 · Láser → #9DFF3C
 */
export function projectileColor(type) {
  const d = TOWERS[type];
  if (!d) return '#FFFFFF';
  return MUZZLE_ACCENT[d.kind] ?? d.accent;
}

/**
 * dev-7 fase 29 — Cuántos pips de nivel se dibujan bajo la torre (el
 * jugador nunca veía el nivel de sus torres en partida). La run va de 1
 * a 5: 0 (o menos) no dibuja ninguno y nunca se pasa de 5.
 */
export function levelPips(level) {
  const n = Math.floor(Number(level));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_TOWER_LEVEL);
}

/**
 * dev-7 fase 33 — POLÍTICA DE TARGETING por unidad.
 *
 * `nearest`  = el más avanzado a la torre (mayor Y: el que está a punto
 *              de tocar la base). Es el "más cercano" de un TD vertical.
 * `farthest` = el más lejano (menor Y: el que acaba de aparecer arriba).
 * `toughest` = el de más vida (dentro de la ventana de adquisición).
 * `varying`  = los drones: re-eligen sin esperar a que el blanco muera.
 *
 * El blanco NO cambia hasta que se destruye: la torre concentra el
 * fuego en vez de repartirlo (esa es la decisión de diseño).
 */
export const TARGETING = {
  // Las 4 de la "frente": pegan en lo que viene.
  guardian: 'nearest',
  missile: 'nearest',
  tesla: 'nearest',
  laser: 'nearest',
  // Las 3 de "tiro largo": barren la pantalla de lejos.
  gauss: 'farthest',
  mortar: 'farthest',
  thunderstroke: 'farthest',
  // El haz se clava en el más duro (dentro de su ventana).
  beam: 'toughest',
  // Los drones van variando.
  firewheel: 'varying',
  wasps: 'varying',
  forcefield: 'varying',
};

/** El criterio de targeting de una unidad (por tipo de torre o dron). */
export function targetingFor(type) {
  return TARGETING[type] ?? 'nearest';
}

/**
 * dev-7 fase 33 — ¿sigue siendo válido este blanco?
 * Vive y está dentro del alcance de la torre (según su tipo).
 * @param {object} e enemigo
 * @param {object} game
 * @returns {boolean}
 */
export function targetInRange(e, game, tower) {
  if (!e || e.dead) return false;
  const d = tower?.data ?? {};
  if (d.rangeBand) {
    // fase 66 — BANDA de la Tesla: SIN tope de X (cualquier columna,
    // incluida la esquina opuesta a la torre) y con el techo vertical
    // atado al layout. `reachY` (330) es el alto nominal de la banda sobre
    // la fila y `detectMul` (Sensores Ampliados) la sube — la carta sigue
    // sirviendo, como el ancho del Beam. El techo NUNCA baja del borde del
    // "bajo fuego" (LAYOUT.bandY) más los 70 px que la Tesla se permite
    // subir, escalados por `fallScale`: en la referencia 570 − 70 = 500
    // (la banda de 330 px que declara la tabla) y en el marco alto el
    // borde se corre para que el TIEMPO bajo fuego no dependa del marco.
    const mul = game?.fortress?.detectMul ?? 1;
    const top = Math.min(
      tower.y - (d.reachY ?? 0) * mul,
      LAYOUT.bandY - TESLA_ABOVE_BAND * LAYOUT.fallScale,
    );
    if (e.y < top) return false;
  } else if (typeof d.range === 'number') {
    // Mecanismo genérico de alcance circular. Hoy NINGUNA torre lo usa:
    // el Thunderstroke pasó a alcance global (fase 73) y la Tesla usa la
    // banda de `rangeBand`. Queda disponible para futuras torres.
    const range = d.range * (game?.fortress?.detectMul ?? 1);
    if (dist(e.x, e.y, tower.x, tower.y) > range) return false;
  }
  // El ancho de detección (el MISMO que usa el disparo: incluye el
  // detectMul de la fortaleza y los sensores ampliados).
  const w = tower?.detectWidthNow?.(game);
  if (typeof w === 'number' && Number.isFinite(w)
    && Math.abs(e.x - tower.x) > w) return false;
  return true;
}

/**
 * dev-7 fase 33 — Elige un blanco NUEVO según la política de la torre.
 * @param {Array} enemies lista viva
 * @param {object} game
 * @param {object} tower la torre (para su posición y alcance)
 * @param {Array} [exclude] blancos ya tomados (multi-blanco)
 * @returns {object|null}
 */
export function pickByPolicy(enemies, game, tower, exclude = []) {
  const policy = targetingFor(tower?.type);
  const d = tower?.data ?? {};
  const taken = new Set(exclude);
  let best = null;
  for (const e of enemies || []) {
    if (!e || e.dead) continue;
    if (taken.has(e)) continue;
    if (!targetInRange(e, game, tower)) continue;
    if (!best) { best = e; continue; }
    if (policy === 'farthest') {
      // El más lejano = el de menor Y (el más arriba de la pantalla).
      if (e.y < best.y) best = e;
    } else if (policy === 'toughest') {
      // La geoda esconde el cuerpo detrás de las placas: para el targeting
      // "más vida" cuenta el HP visible (cuerpo + placas).
      if ((e.hpDisplay ?? e.hp) > (best.hpDisplay ?? best.hp)) best = e;
    } else {
      // 'nearest' = el más avanzado a la torre (mayor Y).
      if (e.y > best.y) best = e;
    }
  }
  return best;
}

/**
 * dev-7 fase 34 — ÁNGULO con el que la LENTE del haz mira a su blanco.
 * 0 = vertical (sin blanco), positivo = a la derecha. Se calcula con el
 * ángulo REAL hacia el blanco (no con la aproximación `dx/70` de antes,
 * que topaba a ±0,5 rad y dejaba a la lente "mirando a otro lado" cuando
 * el haz apuntaba en diagonal). El tope de ±1 rad es un seguro visual.
 * @param {object} tower la torre del haz
 * @param {object|null} target el blanco actual
 * @returns {number} radianes
 */
export function beamAimAngle(tower, target) {
  if (!target) return 0;
  const mx = tower?.x ?? 0;
  const my = (tower?.y ?? 0) - 40; // boca de la torre
  return clamp(Math.atan2(target.x - mx, Math.max(1, my - target.y)), -1, 1);
}

/**
 * fase 60 — Ángulo de TRAVERSE de una torre hacia su blanco: el giro que
 * el jugador VE en el cañón.
 *
 * POR QUÉ NO ES EL ÁNGULO CRUDO: los enemigos caen desde arriba, así que
 * `beamAimAngle` da 0.2-0.5 rad en el caso normal y la punta del cañón se
 * mueve 7-12 px. El reporte del usuario fue literalmente "no gira, está
 * quieto". Amplificar es lo que hace legible que la torre está siguiendo
 * a un blanco; el disparo NO usa este ángulo (solo el render), así que no
 * toca el balance.
 *
 * POR QUÉ `tanh` Y NO `raw * mul`: con amplificación lineal + tope, un
 * blanco a más de ~0.3 rad satura y el cañón se queda CLAVADO en el tope
 * (medido: el mortero en el slot de la derecha pasaba el 95 % del tiempo
 * pegado a -0.6, que se ve tan muerto como no girar). `tanh` amplifica el
 * caso común (raw ≈ 0.1-0.3) y comprime el extremo sin llegar nunca a
 * saturar, así que el cañón sigue respondiendo en todo el rango.
 *
 * @param {object} tower
 * @param {object|null} target
 * @param {{limit?: number, gain?: number}} [opts] `limit` = giro máximo
 *   (rad); `gain` = cuánto se amplifica el ángulo en la zona central.
 * @returns {number} rad (0 = vertical)
 */
export function traverseAim(tower, target, opts = {}) {
  if (!target) return 0;
  const limit = opts.limit ?? 0.55;
  const gain = opts.gain ?? 1.5;
  const raw = beamAimAngle(tower, target);
  return limit * Math.tanh((gain * raw) / limit);
}

/**
 * fase 60 — Cuánto gira (`limit`) y cuánto se amplifica (`gain`) el cañón
 * de cada torre que APUNTA. Las que no están acá no giran a propósito: el
 * Tesla y el Thunderstroke son bobinas omnidireccionales (girarlas no
 * significaría nada) y el Guardian y el Gauss usan el adelanto balístico
 * de `guardianLeadAim`, no el traverse.
 */
const TRAVERSE = {
  beam: { limit: 0.60, gain: 1.5 },
  homing: { limit: 0.60, gain: 1.6 },
  mortar: { limit: 0.60, gain: 1.5 },
  laser: { limit: 0.40, gain: 1.5 },
};

/** La tabla de traverse, exportada para los tests (fuente única). */
export const TRAVERSE_AIM = TRAVERSE;

/**
 * dev-7 fase 29 — Gradiente longitudinal de un haz: el color se apaga en
 * los DOS EXTREMOS (los últimos ~2 px) y va pleno en el centro. Da
 * "cuerpo" al rayo en vez de una línea plana de un solo color.
 */
function beamGradient(ctx, x, y, ex, ey, color) {
  // Contexto sin gradientes (mock de test): color plano, nunca rompe.
  if (typeof ctx.createLinearGradient !== 'function') return withAlpha(color, 1);
  const len = Math.hypot(ex - x, ey - y) || 1;
  const fade = Math.min(0.4, 2 / len); // ~2 px de desvanecido en cada punta
  const g = ctx.createLinearGradient(x, y, ex, ey);
  g.addColorStop(0, withAlpha(color, 0));
  g.addColorStop(fade, withAlpha(color, 1));
  g.addColorStop(1 - fade, withAlpha(color, 1));
  g.addColorStop(1, withAlpha(color, 0));
  return g;
}

/** Ancho de detección horizontal según mecánica (§2.2). */
function detectWidth(d) {
  return d.columnHalfWidth ?? d.detectHalfWidth ?? d.range ?? 60;
}

// v4 4d/5 — el Beam YA NO barre un pilar horizontal: el rayo es un
// SEGMENTO dirigido base → enemigo, redibujado cada frame con ramp-up
// de daño (ver Tower._updateBeamAcquire + fire() case 'beam').

// ------------------------------------------------------------
// Proyectiles
// ------------------------------------------------------------

/** Bala recta: sube con ángulo fijo, muere fuera de pantalla.
 *  opts.pierce = enemigos que atraviesa antes de disiparse (§2.2 cartas
 *  + perdigón del Gauss). Con pierce>0 la colisión NO la mata: consume.
 *  Perks sistemáticos (fase 17): opts.bounce (rebotes), opts.slowOnHit,
 *  opts.stunChance, opts.critChance/critMul — aplicados en
 *  applyProjectileHit (enemies.js); ausentes = comportamiento histórico. */
export class Bullet {
  constructor(x, y, angleRad, opts = {}) {
    this.x = x; this.y = y;
    // CCD (colisión barrida): posición del frame ANTERIOR. `applyProjectileHit`
    // (enemies.js) testea el segmento _px/_py→x/y contra el enemigo, no sólo
    // el punto final. Sin esto, una bala a 920 px/s avanza ~31 px por frame a
    // 30 fps (61 a 2×) y puede saltarse una espora (r 7 + bala 4 = 22 px de
    // diámetro de captura). Se inicializa en el spawn para que el primer
    // chequeo (si ocurre antes del primer update) siga siendo puntual.
    this._px = x; this._py = y;
    const spd = opts.speed ?? TOWERS.guardian.bulletSpeed;
    this.vx = Math.sin(angleRad) * spd;
    this.vy = -Math.cos(angleRad) * spd;
    this.damage = opts.damage ?? TOWERS.guardian.damage;
    this.color = opts.color ?? TOWERS.guardian.bulletColor;
    this.pierce = opts.pierce ?? 0; // atravesamientos restantes (999 = Gauss)
    this.radius = opts.radius ?? null;
    this.bounce = opts.bounce ?? 0;           // fase 17: rebotes restantes
    this.slowOnHit = opts.slowOnHit ?? 0;     // fase 17: slow al impactar
    this.stunChance = opts.stunChance ?? 0;   // fase 17: chance de stun 0.5 s
    this.critChance = opts.critChance ?? 0;   // fase 17: crítico propio
    // fase 74.2: fuente y marcas de combo (Marca de Riel / Enlace).
    this.source = opts.source ?? null;
    this.markOnHit = opts.markOnHit ?? null;
    this.markDuration = opts.markDuration ?? 2;
    Object.assign(this, pickOnHit(opts)); // fase 23
    this.critMul = opts.critMul ?? 2;
    // dev-7 fase 32: el TIPO de daño que lleva el proyectil (el
    // multiplicador contra la familia del enemigo se aplica en
    // enemies.js takeDamage).
    this.dmgType = opts.dmgType ?? null;
    this.dead = false;
  }

  update(dt) {
    this._px = this.x;
    this._py = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < -30 || this.x < -30 || this.x > CONFIG.CANVAS_W + 30) this.dead = true;
  }

  draw(ctx) {
    ctx.save();
    // Estética v3 4/7 (diseño base): glow neón intenso + cola luminosa más
    // larga en las balas azules del abanico.
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.035, this.y - this.vy * 0.035); // cola larga
    ctx.stroke();
    // Núcleo interior claro (look láser del diseño base)
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(235, 252, 255, 0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.018, this.y - this.vy * 0.018);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF'; // destello blanco en la punta
    ctx.beginPath();
    ctx.arc(this.x, this.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Obús en arco del Mortero (§2.3): curva parabólica hacia el blanco,
 *  estalla al llegar con daño en área r=150 a TODOS los enemigos.
 *  `damage` opcional: daño de la torre que lo lanzó (nivel × cartas ×
 *  meta v3.5); sin él usa la stat base (compat tests). */
export class MortarShell {
  constructor(x, y, target, game, damage = null, blastR = null, hitOpts = null) {
    this.x = x; this.y = y;
    this.hitOpts = hitOpts ? { ...pickOnHit(hitOpts), slowOnHit: hitOpts.slowOnHit ?? 0,
      stunChance: hitOpts.stunChance ?? 0, critChance: hitOpts.critChance ?? 0,
      critMul: hitOpts.critMul ?? 2 } : null; // fase 23
    this.target = target || null;
    this.game = game;
    // Arco: sube rápido y cae sobre el blanco (parábola temporal t∈[0,1])
    this.sx = x; this.sy = y;
    this.t = 0;
    this.duration = TOWERS.mortar.cooldown * 0.72; // ~1.6 s de vuelo
    this.damage = damage ?? TOWERS.mortar.damage;
    this.blastR = blastR ?? TOWERS.mortar.blastR; // v6 perk: radio +15%
    // dev-7 fase 29: el obús se pinta con el ACENTO de la torre (ámbar),
    // igual que el resto de los proyectiles (antes, color fijo). La clave
    // se llama `tint` y NO `color` a propósito: enemies.js:projectileRadius
    // usa la presencia de `p.color` para elegir el radio de impacto (4 vs
    // 6) — ponerla cambiaría la hitbox del obús (y el balance).
    this.tint = TOWERS.mortar.accent;
    this.dead = false;
    // fase 75: el obús NO colisiona como una bala. Detona en `_explode()`
    // con splash; antes `collideProjectiles` lo consumía al primer roce y
    // el mortero perdía el área, el crítico y los perks.
    this.areaProjectile = true;
    this._trail = 0;
    // dev-7 fase 34: último punto apuntado (si el blanco muere en vuelo,
    // el obús sigue su curso y estalla ahí, no en otro enemigo).
    this._aimX = null;
    this._aimY = null;
  }

  /** Punto final: posición actual del blanco (persigue su X).
   *  dev-7 fase 34: si el blanco muere en vuelo, el obús CAE donde iba
   *  (se recuerda el último punto apuntado). Antes tomaba "el primer
   *  enemigo vivo de la lista", que podía estar en el otro extremo del
   *  campo: el obús saltaba de golpe y estallaba lejos de su objetivo. */
  _end() {
    const tg = this.target && !this.target.dead ? this.target : null;
    if (tg) { this._aimX = tg.x; this._aimY = tg.y; }
    const x = tg?.x ?? this._aimX;
    const y = tg?.y ?? this._aimY;
    // El aterrizaje nunca baja del domo (v3 3h/7: TOWER_Y-80 como antes)
    return { x: x ?? CONFIG.BASE_X + rand(-80, 80), y: Math.min(y ?? 420, CONFIG.TOWER_Y - 80) };
  }

  update(dt) {
    this.t += dt / this.duration;
    if (this.t >= 1) { this._explode(); return; }
    const end = this._end();
    this.ex = end.x; this.ey = end.y; // para el render
    // Parábola: interpola X/Y y suma altura -h·sin(π·t)
    const h = 220;
    this.x = this.sx + (end.x - this.sx) * this.t;
    this.y = this.sy + (end.y - this.sy) * this.t - h * Math.sin(Math.PI * this.t);
    this._trail -= dt;
    if (this._trail <= 0 && this.game) { // humo del obús (juice)
      this._trail = 0.05;
      this.game.engine.spawnParticles(this.x, this.y, this.tint, 1, {
        speedMin: 4, speedMax: 14, gravity: -8, lifeMin: 0.2, lifeMax: 0.4,
        sizeMin: 1, sizeMax: 2.2,
      });
    }
  }

  _explode() {
    this.dead = true;
    if (!this.game) return;
    const g = this.game.engine;
    const R = this.blastR;
    g.spawnParticles(this.x, this.y, this.tint, 16, {
      speedMin: 50, speedMax: 200, lifeMin: 0.25, lifeMax: 0.6,
      sizeMin: 1.5, sizeMax: 4,
    });
    g.shake(3, 200);
    g.addEffect({ life: 0.3, draw: (ctx, tt) => {
      ctx.save();
      ctx.globalAlpha = tt * 0.85;
      ctx.strokeStyle = this.tint;
      ctx.shadowColor = this.tint;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, R * (1.15 - tt * 0.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } });
    // Daño en área §2.3: TODOS los enemigos dentro del radio
    applyProjectileHit(
      { x: this.x, y: this.y, damage: this.damage, splashR: R, dead: false,
        ...(this.hitOpts ?? {}) },
      Array.isArray(this.game.fortress?.enemies) ? this.game.fortress.enemies : [],
      R,
    );
    // fase 74.2 — Singularidad + Onda Glacial.
    applyExplosionCombo(this.game, this.x, this.y, R);
    this.game.fortress?.spawnMiniBlackHole?.(this.x, this.y, this.game);
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.tint;
    ctx.shadowColor = this.tint;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Misil homing (§2.2): curva hacia el enemigo más cercano ARRIBA.
 *  `damage` opcional: daño de la torre que lo lanzó (nivel × cartas ×
 *  meta v3.5); sin él usa la stat base (compat tests). */
export class HomingMissile {
  constructor(x, y, target, game, damage = null, opts = {}) {
    this.x = x; this.y = y;
    this.angle = -Math.PI / 2 + (Math.random() < 0.5 ? -0.9 : 0.9); // lanzamiento en arco
    this.speed = TOWERS.missile.speed;
    this.homing = opts.homing ?? 0; // fase 17: homingStrength del perk (fuerza de seguimiento)
    this.turnRate = TOWERS.missile.turnRate * (1 + this.homing * 0.35); // 0 → histórico
    this.damage = damage ?? TOWERS.missile.damage;
    this.target = target || null;
    this.game = game;
    // fase 17: perks sistemáticos del Penetrador (splash los propaga)
    this.slowOnHit = opts.slowOnHit ?? 0;
    this.stunChance = opts.stunChance ?? 0;
    this.critChance = opts.critChance ?? 0;
    Object.assign(this, pickOnHit(opts)); // fase 23
    this.critMul = opts.critMul ?? 2;
    this.dead = false;
    // fase 75: igual que el obús, el misil detona en `_explode()`; no debe
    // ser consumido por la colisión directa de proyectiles.
    this.areaProjectile = true;
    this._smoke = 0;
  }

  /** Enemigos vivos desde la lista viva de la fortaleza (vacía hasta dev-3). */
  _enemies() {
    const list = this.game?.fortress?.enemies;
    return Array.isArray(list) ? list : [];
  }

  _pickTarget() {
    let best = null;
    for (const e of this._enemies()) {
      if (!e || e.dead || e.y >= this.y) continue;      // solo por encima del misil
      if (!best || e.y < best.y) best = e;              // el más cercano a la base
    }
    return best;
  }

  update(dt) {
    if (!this.target || this.target.dead) this.target = this._pickTarget();
    if (this.target) {
      const want = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      let dAng = want - this.angle;
      while (dAng > Math.PI) dAng -= Math.PI * 2;
      while (dAng < -Math.PI) dAng += Math.PI * 2;
      this.angle += Math.max(-this.turnRate * dt, Math.min(this.turnRate * dt, dAng));
    }
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    // Estela de humo (juice barato D8)
    this._smoke -= dt;
    if (this._smoke <= 0 && this.game) {
      this._smoke = 0.03;
      this.game.engine.spawnParticles(this.x, this.y, TOWERS.missile.trailColor, 1, {
        speedMin: 5, speedMax: 20, gravity: -10, lifeMin: 0.25, lifeMax: 0.45,
        sizeMin: 1.2, sizeMax: 2.4,
      });
    }

    // Destello de impacto al alcanzar la Y del blanco (daño real en dev-3)
    if (this.target && !this.target.dead && this.y <= this.target.y) this._explode();
    if (this.y < -40 || this.x < -40 || this.x > CONFIG.CANVAS_W + 40) this.dead = true;
  }

  _explode() {
    this.dead = true;
    if (!this.game) return;
    const g = this.game.engine;
    g.spawnParticles(this.x, this.y, '#FFB36A', 12, {
      speedMin: 40, speedMax: 160, lifeMin: 0.25, lifeMax: 0.55, sizeMin: 1.5, sizeMax: 3.5,
    });
    const r = TOWERS.missile.splashR / 2;
    const mx = this.x, my = this.y;
    g.addEffect({ life: 0.18, draw: (ctx, t) => {
      ctx.save();
      ctx.globalAlpha = t * 0.8;
      ctx.strokeStyle = '#FFB36A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, r * (1.4 - t * 0.4), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } });

    // Daño en área §2.2: splash 50% a TODOS los enemigos del radio
    const list = this.game.fortress?.enemies;
    if (Array.isArray(list) && list.length) {
      applyProjectileHit(
        { x: mx, y: my, damage: Math.round(this.damage * 0.5),
          splashR: TOWERS.missile.splashR, dead: false,
          slowOnHit: this.slowOnHit, stunChance: this.stunChance, // fase 17
          critChance: this.critChance, critMul: this.critMul,
          ...pickOnHit(this) },
        list,
        TOWERS.missile.splashR,
      );
      // fase 74.2 — Singularidad + Onda Glacial.
      applyExplosionCombo(this.game, mx, my, TOWERS.missile.splashR);
      this.game.fortress?.spawnMiniBlackHole?.(mx, my, this.game);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);
    // dev-7 fase 29: el misil se pinta con el ACENTO de la torre
    // (naranja) y glow — antes era una gris clara y no decía de qué
    // torre había salido.
    ctx.fillStyle = TOWERS.missile.accent;
    ctx.shadowColor = TOWERS.missile.accent;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(2.5, 2); ctx.lineTo(0, 5); ctx.lineTo(-2.5, 2);
    ctx.closePath();
    ctx.fill();
    // Punta clara (núcleo de la ojiva)
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#FFE8CE';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(1.4, -1.5); ctx.lineTo(-1.4, -1.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// ------------------------------------------------------------
// Drones del arsenal extendido (§2.3): entidades ORBITALES que
// flotan sobre la base (Y≈700), render simple con glow, máximo
// MAX_DRONES simultáneos (Fortress.addDrone lo garantiza).
//
// fase 61: 2 → 1. Los drones NO ocupan slots de torre (vuelan), así que
// su cupo es una constante propia y no el número de slots: con 5 torres
// + 1 dron, una partida nunca puede tener el arsenal entero andando.
// Los otros dos drones siguen existiendo como carta y como unidad del
// meta-juego; simplemente no entran en la misma partida.
// ------------------------------------------------------------

export const MAX_DRONES = 1;
/**
 * Altura de vuelo de los drones (§2.3: flotan sobre la base).
 * FASE 58: es DINÁMICA (baja con el alto lógico del marco): era una
 * `const` de módulo y se habría quedado en el layout viejo.
 */
function droneY() { return CONFIG.TOWER_Y - 80; } // 700 (v3 3h/7: sigue a la base baja)
/**
 * dev-7 fase 28 — Separación mínima entre dos 'drone:fire' del MISMO
 * dron (s). Los drones continuos (rueda de fuego quemando, campo de
 * espinas)-superan el sample cada frame si no se limitan; 0.2 s está por
 * debajo del throttle del audio para el sample 'drone' (140 ms), así que
 * el limitador de towers.js no se come pulsos que el audio sí oiría.
 */
const DRONE_SFX_GAP = 0.2;

/** Stats canónicas §2.3 — números EXACTOS del doc. */
export const DRONES = {
  firewheel: {
    name: 'Dron Rueda de Fuego', kind: 'firewheel',
    dmgType: 'drone', // fase 32: tipo de daño
    radius: 120, dps: 25, accent: '#FF7A3D', bodyColor: '#1C1410',
  },
  wasps: {
    name: 'Dron Avispas', kind: 'wasps',
    dmgType: 'drone', // fase 32: tipo de daño
    // dev-7 fase 30 (rework del dron): antes la avispa picaba UNA vez y
    // desaparecía `respawnTime` (4 s). Eso la convertía en 3 × 12 dmg /
    // 4 s = 9 DPS: el peor del arsenal (la Rueda da 25) y con el 75 % del
    // tiempo muerta. Ahora la avispa pica, entra en COOLDOWN y sigue
    // volando: el DPS lo marca el ritmo de picadura, no el downtime.
    count: 3,
    stingDamage: 14,
    stingCooldown: 1.9,   // s entre picaduras de la misma avispa
  // dev-7 fase 33: los drones VARIAN. Cada avispa re-elige blanco cada
    // VENENO: la picadura envenena al objetivo (D0T). Así la picadura
    // sigue rindiendo aunque el objetivo NO muera con ella (antes se
    // consumía igual: contra un jefe el 90 % del daño se perdía).
    venomDps: 2,
    venomTime: 2.5,
    accent: '#FFE24A', bodyColor: '#1C1A0E',
  },
  forcefield: {
    name: 'Dron Campo de Fuerza', kind: 'forcefield',
    dmgType: 'drone', // fase 32: tipo de daño
    bubbleR: 140, slowFrac: 0.30, // reduce 30% la velocidad de caída
    accent: '#7FDFFF', bodyColor: '#10181C',
  },
};

/**
 * dev-7 fase 30 (rework del Dron Avispas) — ENJAMBRE CONTINUO.
 *
 * Antes (fase 21): cada avispa era un "misil" de un solo uso — volaba al
 * enemigo más avanzado, le clavaba la picadura y desaparecía 4 s. El
 * resultado medido eran 8,1 DPS por dron (3 × 12 dmg / 4 s): el peor
 * del arsenal, con dos problemas:
 *   - el DPS estaba gateado por el TIEMPO MUERTO, no por el daño;
 *   - la picadura se consumía aunque el objetivo sobreviviera (contra un
 *     jefe de 44 032 HP, las 3 avispas quemaban sus picaduras contra un
 *     blanco que no moría).
 *
 * Ahora la avispa es una unidad persistente: pica, entra en cooldown y
 * sigue volando. Y la picadura aplica VENENO (D0T), de modo que sigue
 * haciendo daño aunque no mate.
 */
export const WASPS = {
  speed: 240,         // px/s de vuelo hacia el blanco
  stingRange: 6,      // px extra de alcance de la picadura
  returnSpeed: 300,   // px/s de regreso al panal (sin enemigos)
  swarmRadius: 9,     // px: separación del enjambre alrededor del blanco
  stingCooldown: 1.9, // s entre picaduras (fallback si falta en la tabla)
  // dev-7 fase 33: los drones VARIAN. Cada avispa re-elige blanco cada
  // WASPS.retarget segundos (o antes si el suyo se aleja más de
  // WASPS.retargetDist px), sin esperar a que muera.
  retarget: 1.4,        // s entre re-elegir blanco
  retargetDist: 220,     // px: si el blanco se aleja más, se cambia ya
  // dev-7 fase 33: los drones VARIAN. Cada avispa re-elige blanco cada
  // Tope del enjambre: 3 avispas de base + hasta 3 del perk de meta
  // ("+1 avispa" ×4 y el capstone "+3"). Con el enjambre continuo cada
  // avispa extra vale 4× más que antes (ya no hay 4 s de tiempo muerto),
  // así que sin tope el dron endgame valía más que una torre entera.
  maxSwarm: 6,
};

/**
 * v3 3f/7 — DRON RUEDA DE FUEGO: comportamiento del diseño base. La rueda NO
 * se queda orbitando la base: con enemigos vivos SALE hacia el más avanzado
 * (mayor Y, el que está más cerca de la base), lo sobrevuela con un barrido
 * circular chico (daño por contacto) y luego elige el siguiente. Sin
 * enemigos en pantalla vuelve a la base y retoma la órbita clásica.
 * Números: avance ~140 px/s (spec 120-160), barrido a r = r_enemigo + 8
 * (contacto garantizado: toca a r ≤ r+14), 0.9 s por sobrevuelo.
 */
export const FIREWHEEL = {
  // dev-7 fase 31: la velocidad de vuelo subió de 140 a 180 px/s. El
  // trayecto era la mayor causa del DPS perdido: la rueda pasa el
  // 31-47 % de su vida volando (medido en una etapa real) y ese tiempo
  // no es daño. Con 180 el DPS realizado sube del 74-83 % al 88-99 %
  // del nominal.
  speed: 180,        // px/s de avance hacia el blanco
  returnSpeed: 170,  // px/s de regreso a la base (sin blancos)
  sweepOmega: 3.4,   // rad/s del barrido circular sobre el blanco
  // dev-7 fase 31: `sweepTime` (0.9 s) era el tiempo MÁXIMO que la rueda
  // pasaba con cada blanco: al cumplirse, la abandonaba AUNQUE SIGUIERA
  // VIVO (towers.js: fwTarget = null) y volaba al siguiente. Su salida
  // real no era "25 DPS" sino "0,9 s de daño por viaje", y el hueco
  // CRECÍA con el meta (80 % a 74 % realizado): al matar más rápido
  // re-elegía blanco más a menudo y pasaba más tiempo volando.
  // Ahora la rueda se queda con el blanco HASTA MATARLO (maxDwell es el
  // tope de seguridad para no clavarse con un jefe de 44 032 HP).
  maxDwell: 6,       // s máximos con un mismo blanco antes de cambiar
  sweepPad: 8,       // radio del barrido = r del blanco + pad
  engageRange: 22,   // dist. blanco que dispara el barrido (= r + pad)
  orbitEps: 26,      // dist. al centro de la base para retomar la órbita
  // dev-7 fase 31: si aparece un enemigo claramente MÁS AVANZADO
  // (más cerca de la base) mientras la rueda quema a otro, cambia de
  // blanco: si no, podía terminar con un blob lento mientras un fragmento
  // se le acercaba a la base.
  switchMargin: 70,  // px de ventaja que justifican cambiar de blanco
};

/**
 * Un dron orbital: orbita la base (radio propio por tipo), aplica su
 * efecto cada frame con dt real y se dibuja con glow. update(dt)
 * recibe los enemigos vía game.fortress.enemies (lista viva).
 *
 * dev-7 fase 28: `dmgMul` (multiplicador de daño de CARTA) NO se
 * inicializa acá, a diferencia de `Tower`: lo crea la carta cuando se
 * elige (`d.dmgMul = (d.dmgMul ?? 1) * 1.6` en cards.js) y las rutas
 * de daño lo leen con `?? 1`. Un dron sin carta se comporta igual que
 * antes; con carta, el daño escala de verdad.
 */
export class Drone {
  constructor(type, game, slotIdx = 0) {
    this.type = type;
    this.data = DRONES[type];
    this.game = game;
    this.slotIdx = slotIdx;          // 0|1: separa las órbitas/fases
    this.angle = slotIdx === 0 ? 0 : Math.PI / 2; // desincroniza
    this.x = CONFIG.BASE_X; this.y = droneY();
    this.dead = false;
    // dev-7 fase 28: reloj del sample 'drone:fire' (ver DRONE_SFX_GAP).
    this._sfxAcc = 0;
    // Avispas: enjambre CONTINUO (fase 30). Antes eran {null|{enemy}} con
    // un "respawn" de 4 s (la avispa moría tras picar). Ahora cada avispa
    // es una unidad persistente: {x, y, target, cd} — `cd` es el cooldown
    // entre picaduras.
    // dev-7 fase 21: +1/+2 avispas simultáneas vía perk (extraCount,
    // mismo campo genérico que ya usan Guardian/Missile/etc.).
    // dev-7 fase 30: + la carta "Nido Ampliado" (extraWasps) y un tope
    // de enjambre (WASPS.maxSwarm).
    this.extraWasps = 0;      // avispas extra por carta
    // dev-7 fase 51: canal de CARTAS (mods de mecánicas por partida).
    this.cardMods = {};
    this.cardApps = {};
    this.wasps = [];
    this.rebuildSwarm();
    this._hitAcc = new Map();        // rueda de fuego: DPS continuo por blanco
    this._bobT = Math.random() * Math.PI * 2;
    this._glowAcc = 0;
    // v3 3f/7 — rueda de fuego: máquina de vuelo hacia los enemigos.
    this.fwState = 'orbit';          // orbit | advance | sweep | return
    this.fwTarget = null;            // enemigo vivo elegido (el más avanzado)
    this._sweepT = 0;                // s restantes de sobrevuelo
    this._sweepA = 0;                // ángulo del barrido sobre el blanco
  }

  /** Centro de la órbita: la base (§2.3: orbita la base). */
  _center() {
    return { x: CONFIG.BASE_X, y: droneY() };
  }

  /**
   * (Re)construye el enjambre de avispas (fase 30).
   *
   * Tamaño = base (3) + perk de meta (`extraCount`) + carta "Nido
   * Ampliado" (`extraWasps`), con un tope de diseño (WASPS.maxSwarm):
   * con el enjambre continuo cada avispa extra vale 4× más que antes
   * (ya no hay 4 s de tiempo muerto), así que sin tope el dron endgame
   * valía más que una torre entera.
   *
   * Se llama al construir el dron y cada vez que se aplica la carta.
   */
  rebuildSwarm() {
    if (this.type !== 'wasps') return;
    const base = this.data.count ?? 0;
    const perkExtra = unitMods(this).extraCount ?? 0;
    const cardExtra = this.extraWasps ?? 0;
    const want = Math.min(WASPS.maxSwarm, base + perkExtra + cardExtra);
    // Conserva las avispas que ya existían (con su blanco y su cooldown)
    // y añade las nuevas desde el panal.
    const prev = this.wasps ?? [];
    this.wasps = [];
    for (let i = 0; i < want; i++) {
      this.wasps.push(prev[i] ?? { x: this.x, y: this.y, target: null, cd: 0, vx: 0, vy: 0 });
    }
  }

  /** Nº de avispas del enjambre (para la carta "Nido Ampliado"). */
  waspCount() {
    return this.wasps?.length ?? 0;
  }

  /** Enemigos vivos de la lista viva de la fortaleza. */
  _enemies() {
    const list = this.game?.fortress?.enemies;
    return Array.isArray(list) ? list : [];
  }

  /**
   * dev-7 fase 28 — Señal de ataque del dron ('drone:fire', la escucha
   * main.js y la traduce al sample 'drone').
   *
   * Se emite UNA vez por TICK DE ATAQUE del dron, NO una vez por enemigo
   * tocado: las 3 avispas que pican en el mismo frame son un solo
   * disparo, y la rueda de fuego quemando a 3 enemigos también. El
   * limitador interno (DRONE_SFX_GAP) evita además que los drones
   * CONTINUOS repitan el sample cada frame (el audio tiene su propio
   * throttle de 140 ms, pero el bus no debe inundarse de eventos).
   */
  _sfxFire() {
    if (this._sfxAcc > 0) return;
    this._sfxAcc = DRONE_SFX_GAP;
    this.game?.engine?.emit?.('drone:fire', { type: this.type, x: this.x, y: this.y });
  }

  update(dt, enemies = this._enemies()) {
    if (!this.game || dt <= 0) return;
    this._sfxAcc -= dt; // reloj del sample del dron (ver DRONE_SFX_GAP)
    const d = this.data;
    const c = this._center();
    this._bobT += dt;
    switch (d.kind) {
      case 'firewheel': {
        // v3 3f/7 — el dron SALE hacia los enemigos: con blancos vivos
        // avanza (180 px/s) al más avanzado (mayor Y) y lo sobrevuela con
        // un barrido circular chico; sin enemigos vuelve a la base y
        // retoma la órbita r=120. DPS 25/s escalado por meta (+5 %/nivel,
        // META_DMG_PER_LEVEL en meta.js — el comentario viejo decía
        // "+10 %/nivel" y mentía) y por la carta exclusiva del dron
        // (dmg_firewheel escribe `this.dmgMul`).
        // v6 perk: +3 DPS del barrido por cada 10 niveles meta
        //
        // dev-7 fase 31: la rueda se QUEDA con el blanco hasta matarlo
        // (antes lo abandonaba a los 0,9 s aunque siguiera vivo) y
        // QUEMA también durante el vuelo. Medido en una etapa real: el
        // DPS realizado subía del 74-83 % del nominal (y el hueco
        // CRECÍA con el meta) al 88-99 %.
        const dps = d.dps * (metaDmgMul('firewheel') ?? 1) * (this.dmgMul ?? 1)
          + (unitMods(this).dpsAdd ?? 0);
        const alive = [];
        for (const e of enemies || []) {
          if (e && !e.dead && Number.isFinite(e.x) && Number.isFinite(e.y)) {
            alive.push(e);
          }
        }
        // Blanco inválido (muerto o podado) → liberar y re-elegir
        if (this.fwTarget && (this.fwTarget.dead || !alive.includes(this.fwTarget))) {
          this.fwTarget = null;
          this._sweepT = 0;
          if (this.fwState === 'sweep') this.fwState = 'advance';
        }
        if (!this.fwTarget && alive.length) {
          let best = null;
          for (const e of alive) if (!best || e.y > best.y) best = e; // más avanzado
          this.fwTarget = best;
          this.fwState = 'advance';
          this._sweepT = 0;
        }
        // dev-7 fase 31: la rueda cambia de blanco si aparece uno
        // CLARAMENTE más avanzado (más cerca de la base). Sin esto podía
        // terminar con un blob lento mientras un fragmento se le acercaba.
        if (this.fwTarget && this.fwState === 'sweep') {
          for (const e of alive) {
            if (e === this.fwTarget) continue;
            if (e.y > this.fwTarget.y + FIREWHEEL.switchMargin) {
              this.fwTarget = e;
              this.fwState = 'advance';
              this._sweepT = 0;
              break;
            }
          }
        }
        this.angle += dt * 2.4; // las aspas giran también en vuelo
        if (this.fwTarget) {
          const tg = this.fwTarget;
          const dx = tg.x - this.x, dy = tg.y - this.y;
          const distT = Math.hypot(dx, dy) || 1;
          const engage = tg.r + FIREWHEEL.engageRange;
          if (this.fwState === 'advance') {
            if (distT > engage) {
              // Avance recto a velocidad moderada
              this.x += (dx / distT) * FIREWHEEL.speed * dt;
              this.y += (dy / distT) * FIREWHEEL.speed * dt;
            } else {
              // Llegó: barrido circular chico alrededor del blanco
              this.fwState = 'sweep';
              this._sweepT = 0;
              this._sweepA = Math.atan2(dy, dx);
            }
          }
          if (this.fwState === 'sweep') {
            // El tiempo con el blanco CUENTA hacia arriba: la rueda se
            // queda hasta que el blanco muere (o hasta el tope de
            // permanencia, para no clavarse con un jefe).
            this._sweepT += dt;
            this._sweepA += dt * FIREWHEEL.sweepOmega;
            const sr = tg.r + FIREWHEEL.sweepPad; // toca a r ≤ r+14 (contacto)
            this.x = tg.x + Math.cos(this._sweepA) * sr;
            this.y = tg.y + Math.sin(this._sweepA) * sr;
            if (this._sweepT >= FIREWHEEL.maxDwell) {
              this.fwTarget = null; // el próximo frame elige el siguiente
              this.fwState = 'advance';
              this._sweepT = 0;
            }
          }
        } else if (this.fwState !== 'orbit') {
          // Sin enemigos: regreso a la base y órbita (respaldo §spec 3f)
          const dc = Math.hypot(c.x - this.x, c.y - this.y);
          if (dc > FIREWHEEL.orbitEps) {
            this.x += ((c.x - this.x) / dc) * FIREWHEEL.returnSpeed * dt;
            this.y += ((c.y - this.y) / dc) * FIREWHEEL.returnSpeed * dt;
          } else {
            this.fwState = 'orbit';
          }
        }
        if (this.fwState === 'orbit') {
          this.x = c.x + Math.cos(this.angle) * d.radius;
          this.y = c.y + Math.sin(this.angle) * d.radius * 0.35; // elipse sutil
        }
        {
          const fw = unitMods(this); // fase 17: slowOnHit del dron
          // dev-7 fase 26: el perk "Rueda ancha: +N px de radio" (radiusAdd)
          // estaba MUERTO — `radiusAdd` solo se leía para el Campo de Fuerza
          // (towers.js) y el firewheel usaba un radio de contacto FIJO.
          // Ahora ensancha el barrido de la rueda: alcanza a más enemigos.
          const contactPad = 14 + (fw.radiusAdd ?? 0);
          let quemando = false; // ¿tocó a alguien este frame? (señal de audio)
          for (const e of enemies || []) {
            if (!e || e.dead) continue;
            if (dist(e.x, e.y, this.x, this.y) <= e.r + contactPad) {
              hurtP(e, dps * dt, 'drone', fw, this.game, enemies);
              if ((fw.slowOnHit ?? 0) > 0) {
                applySlow(e, fw.slowOnHit, 1.2, 'drone');
              }
              if (this.game?.fortress?.comboMods?.swarmMark) {
                applyMark(e, 'swarm', 2);
              }
              this._hitAcc.set(e, true); // marca para chispas esporádicas
              quemando = true;
            }
          }
          // dev-7 fase 28: UN 'drone:fire' por tick de quemado (no uno
          // por enemigo chamuscado) — el limitador interno (DRONE_SFX_GAP)
          // evita que la rueda CONTINUA repita el sample cada frame.
          if (quemando) this._sfxFire();
        }
        this._glowAcc -= dt;
        if (this._glowAcc <= 0 && this._hitAcc.size) {
          this._glowAcc = 0.08;
          for (const e of this._hitAcc.keys()) {
            this.game.engine.spawnParticles(e.x, e.y, d.accent, 1, {
              speedMin: 10, speedMax: 50, gravity: -20,
              lifeMin: 0.15, lifeMax: 0.35, sizeMin: 1, sizeMax: 2.4,
            });
          }
          this._hitAcc.clear();
        }
        break;
      }
      case 'wasps': { // dev-7 fase 30: ENJAMBRE CONTINUO (rework del dron)
        // Antes (fase 21) la avispa picaba UNA vez y desaparecía 4 s
        // (`respawnTime`): 3 × 12 dmg / 4 s = 9 DPS medidos, el peor del
        // arsenal, con el DPS gateado por el tiempo muerto. Ahora la
        // avispa es persistente: pica, entra en cooldown y sigue volando.
        const waspMods = unitMods(this);
        // dev-7 fase 28: la carta exclusiva del dron (dmg_wasps) escribe
        // `this.dmgMul` en la unidad — sin este factor la picadura era
        // idéntica con y sin carta (carta INERTE).
        // dev-7 fase 30: el veneno escala igual que la picadura (meta +
        // perks + cartas), así que el DoT também crece con la build.
        const metaMul = metaDmgMul('wasps') ?? 1;
        const stingDmg = Math.round(d.stingDamage * metaMul
          * (waspMods.dmgMul ?? 1) * (this.dmgMul ?? 1));
        const venomDps = Math.round((d.venomDps ?? 0) * metaMul
          * (waspMods.dmgMul ?? 1) * (this.dmgMul ?? 1)
          + (waspMods.venomDpsAdd ?? 0));
        const venomTime = (d.venomTime ?? 0) + (waspMods.venomTimeAdd ?? 0);
        // El cooldown de picadura lo escalan el perk de cadencia del meta
        // (cadMul) y la carta `cadence_up` (this.cadMul, fase 30).
        const stingCd = Math.max(0.2,
          (d.stingCooldown ?? WASPS.stingCooldown)
          * (waspMods.cadMul ?? 1) * (this.cadMul ?? 1));
        // Flota sobre la base; las avispas persiguen y pican
        this.x = c.x + Math.sin(this._bobT * 0.9) * 26;
        this.y = c.y - 26 + Math.cos(this._bobT * 1.3) * 6;
        // Cada avispa toma un blanco DISTINTO cuando hay para todas: el
        // enjambre reparte el frente en vez de apilarse en un enemigo.
        // Los blancos ya tomados por OTRO dron también cuentan: si no, los
        // 2 drones se apilan sobre los mismos 3 enemigos y el segundo no
        // aporta nada (medido: 2 drones con el mismo DPS que 1).
        const taken = new Set();
        const fleet = this.game?.fortress?.drones ?? [];
        for (const other of fleet) {
          if (other === this) continue;
          for (const ow of other.wasps ?? []) {
            if (ow?.target && !ow.target.dead) taken.add(ow.target);
          }
        }
        for (const w of this.wasps) if (w.target && !w.target.dead) taken.add(w.target);
        for (let i = 0; i < this.wasps.length; i++) {
          const w = this.wasps[i];
          if (!w) continue;
          if (w.target && w.target.dead) w.target = null;
          // dev-7 fase 33: los drones VARIAN — la avispa re-elige blanco
          // cada WASPS.retarget segundos (o si el suyo se aleja mucho), sin
          // esperar a que muera. Antes se quedaba con el blanco hasta
          // que lo destruían.
          w.retargetT = (w.retargetT ?? 0) - dt;
          const lejos = w.target
            && Math.hypot(w.target.x - w.x, w.target.y - w.y) > WASPS.retargetDist;
          if (!w.target || w.retargetT <= 0 || lejos) {
            const t2 = this._pickWaspTarget(enemies, taken);
            if (t2 && t2 !== w.target) {
              w.target = t2;
              taken.add(t2);
              w.retargetT = WASPS.retarget;
            } else if (!w.target) {
              w.target = t2;
              if (t2) taken.add(t2);
            }
            w.retargetT = WASPS.retarget;
          }
          if (w.cd > 0) w.cd -= dt;
          if (!w.target) {
            // Sin blanco: la avispa vuelve al panal.
            const dx = this.x - w.x, dy = this.y - w.y;
            const dc = Math.hypot(dx, dy) || 1;
            if (dc > 3) {
              w.x += (dx / dc) * WASPS.returnSpeed * dt;
              w.y += (dy / dc) * WASPS.returnSpeed * dt;
            }
            continue;
          }
          // VUELO con velocidad propia (antes: un lerp exponencial que
          // hacía que la avispa se "teletransportase" al blanco). El
          // enjambre se reparte en un círculo alrededor del objetivo.
          const ang = (i / Math.max(1, this.wasps.length)) * Math.PI * 2;
          const tx = w.target.x + Math.cos(ang) * WASPS.swarmRadius;
          const ty = w.target.y + Math.sin(ang) * WASPS.swarmRadius;
          const dx = tx - w.x, dy = ty - w.y;
          const dc = Math.hypot(dx, dy) || 1;
          const step = Math.min(dc, WASPS.speed * dt);
          w.x += (dx / dc) * step;
          w.y += (dy / dc) * step;
          // Velocidad (px/s) para el render: la avispa se dibuja orientada
          // hacia donde vuela y deja una estela corta detrás.
          w.vx = (dx / dc) * WASPS.speed;
          w.vy = (dy / dc) * WASPS.speed;
          // Picadura: al alcance del blanco y con el cooldown listo.
          const d2t = Math.hypot(w.target.x - w.x, w.target.y - w.y);
          if (d2t <= w.target.r + WASPS.stingRange && w.cd <= 0) {
            hurtP(w.target, stingDmg, 'drone', waspMods, this.game, enemies); // picadura
            // VENENO (fase 30): el DoT sigue haciendo daño aunque el
            // objetivo no muera con la picadura.
            if (venomDps > 0 && venomTime > 0) {
              applyPoison(w.target, venomDps, venomTime);
            }
            if (this.game?.fortress?.comboMods?.swarmMark) {
              applyMark(w.target, 'swarm', 2);
            }
            w.cd = stingCd;
            // dev-7 fase 28: el sample del dron suena UNA vez por tick
            // de ataque (las 3 avispas que pican en el mismo frame
            // cuentan como un solo disparo, no como 3).
            this._sfxFire();
            this.game.engine.spawnParticles(w.x, w.y, d.accent, 2, {
              speedMin: 20, speedMax: 70, lifeMin: 0.12, lifeMax: 0.3,
              sizeMin: 1, sizeMax: 2,
            });
          }
        }
        break;
      }
      case 'forcefield':
        // v5 — el dron de escudo DEAMBULA por la pantalla (corrección JK):
        // ya no flota clavado en la base. Máquina de vuelo tipo FIREWHEEL:
        // con enemigos vivos vuela hacia el MÁS AVANZADO (mayor y) y lo
        // sobrevuela en círculo (la burbuja r=140 frena al grupo, que es
        // donde más sirve); sin blancos patrulla libre por el campo
        // eligiendo waypoints aleatorios dentro de los límites.
        {
          const alive = [];
          for (const e of enemies || []) {
            if (e && !e.dead && Number.isFinite(e.x) && Number.isFinite(e.y)) {
              alive.push(e);
            }
          }
          if (this.fwTarget && (this.fwTarget.dead || !alive.includes(this.fwTarget))) {
            this.fwTarget = null;
            if (this.fwState === 'sweep') this.fwState = 'advance';
          }
          if (!this.fwTarget && alive.length) {
            let best = null;
            for (const e of alive) if (!best || e.y > best.y) best = e;
            this.fwTarget = best;
            this.fwState = 'advance';
            this._wp = null; // fase 75: no perseguir un waypoint viejo
          }
          if (this.fwTarget) {
            this._wp = null; // fase 75: el blanco manda sobre el waypoint
            const tg = this.fwTarget;
            const dx = tg.x - this.x, dy = tg.y - this.y;
            const distT = Math.hypot(dx, dy) || 1;
            const engage = tg.r + 30;
            if (this.fwState === 'advance' && distT > engage) {
              this.x += (dx / distT) * FIREWHEEL.speed * 0.7 * dt;
              this.y += (dy / distT) * FIREWHEEL.speed * 0.7 * dt;
            } else if (this.fwState === 'advance') {
              this.fwState = 'sweep';
              // fase 75: `sweepTime` no existe (daba NaN y el dron quedaba
              // pegado al mismo blanco). `maxDwell` es el tope de seguridad
              // documentado: 6 s con un mismo objetivo.
              this._sweepT = FIREWHEEL.maxDwell;
              this._sweepA = Math.atan2(dy, dx);
            }
            if (this.fwState === 'sweep') {
              this._sweepT -= dt;
              this._sweepA += dt * FIREWHEEL.sweepOmega * 0.8;
              const sr = tg.r + 34;
              this.x = tg.x + Math.cos(this._sweepA) * sr;
              this.y = tg.y + Math.sin(this._sweepA) * sr;
              if (this._sweepT <= 0) {
                this.fwTarget = null;
                this.fwState = 'advance';
              }
            }
          }
          // Patrullaje libre: waypoint aleatorio dentro del campo de batalla
          // (sin blancos ni en vuelo de regreso → deambula todo el tiempo).
          if (!this.fwTarget
            && (!this._wp || Math.hypot(this._wp.x - this.x, this._wp.y - this.y) < 24)) {
            this._wp = {
              x: rand(50, CONFIG.CANVAS_W - 50),
              y: rand(120, CONFIG.TOWER_Y - 90),
            };
            this.fwState = 'wander';
          }
          // fase 75: el waypoint solo se sigue cuando NO hay blanco. Antes
          // se sumaban los dos desplazamientos (target + waypoint).
          if (!this.fwTarget && this._wp) {
            const dx = this._wp.x - this.x, dy = this._wp.y - this.y;
            const distW = Math.hypot(dx, dy) || 1;
            this.x += (dx / distW) * FIREWHEEL.returnSpeed * 0.75 * dt;
            this.y += (dy / distW) * FIREWHEEL.returnSpeed * 0.75 * dt;
          }
        }
        {
          // Burbuja r=140: marca slowFactor a los enemigos dentro. La
          // mejora meta del Dron de Interferencia sube el slow: 30 % base
          // + 1 punto porcentual por nivel meta (META_SLOW_BASE 0.30 +
          // META_SLOW_PER_LEVEL 0.01 en meta.js), con tope META_SLOW_CAP
          // = 75 % — el comentario viejo decía "30 % + 2 p.p. por nivel" y
          // mentía. fase 17: el perk slowOnHit del campo suma puntos de
          // slow extra.
          //
          // El tope COMBINADO (meta + perks) es META_SLOW_CAP (0.75), NO
          // 0.60: con 0.60 la curva del meta (que satura en 0.75) quedaba
          // ANULADA y los perks "Campo pegajoso" (+10 % c/u) eran MUERTOS
          // a partir del nivel 31 de meta.
          // Enemy.update consume el flag (velocidad de caída).
          const slowFrac = Math.min(META_SLOW_CAP,
            (metaSlowFrac('forcefield') ?? d.slowFrac)
            + (unitMods(this).slowOnHit ?? 0));
          const ffm = unitMods(this);
          const bubbleR = d.bubbleR + (ffm.radiusAdd ?? 0); // dev-7 fase 10: perks propios
          // dev-7 fase 28: las espinas son el ÚNICO daño del Campo de
          // Fuerza. `perkDmgFor` = thornDps del perk × metaDmgMul (la
          // curva +5 %/nivel del meta y el bonus de HITOS): antes se usaba
          // el thornDps PLANO, así que del nivel 21 al 100 de meta el dron
          // no escalaba NADA. Se calcula UNA vez por frame (no por
          // enemigo) y multiplica por el `dmgMul` de la carta exclusiva
          // "Burbuja Reforzada" (dmg_forcefield, ×1.6).
          const thornDps = perkDmgFor('forcefield') * (this.dmgMul ?? 1);
          let inside = 0;
          for (const e of enemies || []) {
            if (!e || e.dead) continue;
            if (Number.isFinite(e.x) && Number.isFinite(e.y)
              && dist(e.x, e.y, this.x, this.y) <= bubbleR + (e.r ?? 0)) {
              applySlow(e, slowFrac, 0.15, 'forcefield');
              if (this.game?.fortress?.comboMods?.swarmMark) {
                applyMark(e, 'swarm', 2);
              }
              inside += 1;
              // fase 23: "campo de espinas" — daña a TODO lo que está
              // adentro (y con eso heredan ejecutar/robo de vida/explosión).
              if (thornDps > 0) hurtP(e, thornDps * dt, 'drone', ffm, this.game, enemies);
            }
          }
          // dev-7 fase 28: el campo trabajando (enemigos adentro) es el
          // "tick de ataque" del dron → un solo 'drone:fire' por tick.
          if (inside > 0) this._sfxFire();
          // fase 23: "regeneración" — el campo recarga el escudo de la base
          // por cada enemigo atrapado adentro (hp/s por enemigo). Los mods
          // se releen en su propio bloque (mismo patrón que el Beam con
          // `perkMods('beam')`), así la lectura queda pegada a su uso.
          {
            const fgr = unitMods(this);
            if ((fgr.bubbleRegen ?? 0) > 0 && inside > 0) {
              healBase(this.game, fgr.bubbleRegen * inside * dt);
            }
          }
        }
        break;
      default:
        break;
    }
  }

  /**
   * Blanco para una avispa: el más cercano A LA BASE, evitando los
   * blancos ya tomados por otras avispas (si hay suficientes).
   */
  _pickWaspTarget(enemies, taken = null) {
    let best = null;
    let bestY = -Infinity;
    let bestAny = null;
    for (const e of enemies || []) {
      if (!e || e.dead) continue;
      if (e.y > bestY) { bestAny = e; bestY = e.y; }
      if (taken && taken.has(e)) continue;
      if (!best || e.y > best.y) best = e;
    }
    return best ?? bestAny;
  }

  draw(ctx) {
    const d = this.data;
    const bubbleR = d.bubbleR + (unitMods(this).radiusAdd ?? 0); // dev-7 fase 10: perks propios
    const t = this.game?.engine?._t ?? this._bobT;
    ctx.save();
    ctx.translate(this.x, this.y);
    // Glow de acento (render simple §2.3)
    ctx.globalAlpha = 0.16 + 0.06 * Math.sin(t * 3 + this.slotIdx);
    ctx.fillStyle = d.accent;
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = d.bodyColor;
    ctx.strokeStyle = d.accent;
    ctx.shadowColor = d.accent;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    switch (d.kind) {
      case 'firewheel': { // rueda de fuego giratoria
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.rotate(-this.angle * 2.2);
        for (let i = 0; i < 4; i++) { // aspas incandescentes
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(9, 0); ctx.lineTo(15, 2.4); ctx.lineTo(9, 4);
          ctx.closePath();
          ctx.fillStyle = d.accent;
          ctx.fill();
        }
        break;
      }
      case 'wasps': { // panal hexagonal + enjambre de avispas (fase 30)
        // El panal: cuerpo oscuro + celdas + el número de avispas vivas
        // (fase 30: el enjambre es continuo, así que el panal muestra
        // cuántas hay en vez de "cuántas esperan el respawn").
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = d.accent;
        ctx.lineWidth = 1;
        for (let c = 0; c < 3; c++) {
          const a = (c / 3) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 4, Math.sin(a) * 4, 1.8, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
        for (const w of this.wasps) {
          if (!w) continue;
          const dx = w.x - this.x, dy = w.y - this.y;
          ctx.save();
          ctx.translate(dx, dy);
          // dev-7 fase 30: la avispa es más grande y legible (era un
          // elipse de 4,5x3 px, diminuta) y se ve de qué lado vuela.
          const ang = Math.atan2(w.vy ?? 0, w.vx ?? 0);
          ctx.rotate(ang);
          // estela corta hacia atrás (en el sentido de vuelo)
          if (w.vx || w.vy) {
            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.strokeStyle = d.accent;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-6, 0); ctx.lineTo(-13, 0);
            ctx.stroke();
            ctx.restore();
          }
          ctx.fillStyle = d.bodyColor;
          ctx.beginPath(); ctx.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = d.accent;
          ctx.lineWidth = 1.1;
          ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke(); // alas
          // aguijón (adelante): se ve dónde pica
          ctx.fillStyle = d.accent;
          ctx.beginPath();
          ctx.moveTo(5, 0); ctx.lineTo(9, -1.4); ctx.lineTo(9, 1.4);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        break;
      }
      default: { // forcefield: emisor + burbuja translúcida
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 0.14 + 0.05 * Math.sin(t * 2.4);
        ctx.fillStyle = d.accent;
        ctx.beginPath(); ctx.arc(0, 0, bubbleR, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, 0, bubbleR, 0, Math.PI * 2); ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------
// BLACK HOLE (§2.3): carta ACTIVA de un uso. Vórtice de 4 s en X
// aleatoria que SUCCIONA enemigos hacia el punto + 10 dmg/s.
// Es entidad del engine ({update(dt), dead}) y Fortress la dispara.
// ------------------------------------------------------------
export const BLACK_HOLE = { duration: 4, dps: 10, pull: 260, radius: 170 };

export class BlackHoleFx {
  constructor(game, xOrOpts = {}) {
    this.game = game;
    // Compatibilidad: new BlackHoleFx(game, x) (tests/viejo) o
    // new BlackHoleFx(game, { x, y, duration, radius, dps, pull, ... }).
    const opts = (xOrOpts && typeof xOrOpts === 'object') ? xOrOpts : { x: xOrOpts };
    this.x = opts.x ?? rand(80, CONFIG.CANVAS_W - 80);
    this.y = opts.y ?? 380;              // centro del vórtice (campo medio)
    this.t = 0;
    this.life = opts.duration ?? BLACK_HOLE.duration;
    this.radius = opts.radius ?? BLACK_HOLE.radius;
    this.dps = opts.dps ?? BLACK_HOLE.dps;
    this.pull = opts.pull ?? BLACK_HOLE.pull;
    this.endBurst = opts.endBurst ?? 0;
    this.drain = opts.drain ?? 0;
    this.mini = !!opts.mini;
    this.dead = false;
    this._spin = 0;
    if (!this.mini) {
      const eng = game?.engine;
      eng?.emit('blackhole:start', { x: this.x });
      eng?.sfxSafe?.('blackhole');
    }
  }

  get active() { return !this.dead && this.t < this.life; }

  update(dt) {
    if (dt <= 0) return;
    this.t += dt;
    this._spin += dt * 3;
    const list = this.game?.fortress?.enemies;
    if (this.t >= this.life) {
      this.dead = true;
      const eng = this.game?.engine;
      eng?.spawnParticles(this.x, this.y, '#B48CFF', this.mini ? 10 : 18, {
        speedMin: 60, speedMax: 220, lifeMin: 0.3, lifeMax: 0.7,
        sizeMin: 1.5, sizeMax: 4,
      });
      // fase 74 — Colapso: el vórtice principal explota al cerrarse.
      if (this.endBurst > 0 && Array.isArray(list)) {
        for (const e of list) {
          if (!e || e.dead) continue;
          if (Math.hypot(e.x - this.x, e.y - this.y) <= this.radius + (e.r ?? 10)) {
            hurt(e, this.endBurst, 'splash');
          }
        }
        eng?.shake?.(3, 180);
      }
      return;
    }
    // Succión: arrastra a los enemigos vivos hacia el vórtice
    if (Array.isArray(list)) {
      for (const e of list) {
        if (!e || e.dead) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d > this.radius) continue;
        const k = Math.min(1, dt * (this.pull / Math.max(40, d)));
        // fase 75: `baseX` se RECALCULA desde `entryX` para los enemigos con
        // drift/zigzag, así que moverlo no servía: la succión se perdía.
        // `entryX` es el ancla persistente; se mueve junto con la posición.
        const pullX = (this.x - e.x) * k;
        const pullY = (this.y - e.y) * k;
        e.x += pullX;
        e.y += pullY;
        if (Number.isFinite(e.entryX)) e.entryX += pullX;
        else if (Number.isFinite(e.baseX)) e.baseX += pullX;
        const hpBefore = e.hpDisplay ?? e.hp;
        hurt(e, this.dps * dt, 'blackhole');
        if (this.drain > 0) {
          const hpAfter = e.dead ? 0 : (e.hpDisplay ?? e.hp ?? 0);
          const dealt = Math.max(0, hpBefore - hpAfter);
          if (dealt > 0) healBase(this.game, dealt * this.drain);
        }
      }
    }
  }

  draw(ctx) {
    const t = this.game?.engine?._t ?? this._spin;
    const fade = this.active
      ? Math.min(1, this.t * 4, (this.life - this.t) * 2.5)
      : 0;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha = 0.28 * fade;
    ctx.fillStyle = '#B48CFF';
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
    // Disco negro + anillo violeta rotante
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#050308';
    ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#B48CFF';
    ctx.shadowColor = '#B48CFF';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(
        0, 0,
        this.radius * (0.26 + i * 0.082),
        this.radius * (0.07 + i * 0.03),
        this._spin + i, 0, Math.PI * 2,
      );
      ctx.stroke();
    }
    void t;
    ctx.restore();
  }
}

// ------------------------------------------------------------
// LÁSER ESTÁTICO (v4 4c/5, torre nueva 'laser'): disparo con DURACIÓN.
// Sale de la boca de la torre con el ángulo del frame de disparo y
// QUEDA FIJO (no persigue: el enemigo puede cruzarlo o salirse) hasta
// expirar laserDuration; es PENETRANTE: cada frame daña a TODOS los
// enemigos vivos cuya distancia perpendicular al segmento es
// ≤ grosor/2 + radio del enemigo. Entidad del engine como BlackHoleFx.
// fase 66: el segmento llega HASTA EL BORDE del campo (ray-cast, ver
// laserLengthToEdge) — ningún ángulo se corta a media altura.
// ------------------------------------------------------------
const LASER_WIDTH = 6;      // grosor del rayo (px) — ALSO el hitbox de daño
const LASER_CORE = 1;       // núcleo blanco (px) — visual, no afecta el daño

/**
 * fase 66 — LARGO del rayo estático hasta el BORDE del campo: la
 * intersección del rayo (boca + `aim`) con el rectángulo del canvas,
 * quedándose con el PRIMER borde que toca (el tope y = 0 o un lateral
 * x = 0 / x = CANVAS_W; el rayo sale hacia arriba, así que el piso nunca
 * se toca). Antes la longitud era FIJA (LASER_LENGTH = 700, con el
 * comentario rancio de "desde la fila trasera llega al tope") y con
 * ángulos oblicuos el rayo moría a media altura del cielo (medido: a 45°
 * terminaba en y≈335 de 880) en vez de salir de cuadro.
 * @param {number} x boca del rayo
 * @param {number} y boca del rayo
 * @param {number} aim ángulo (0 = vertical, positivo = a la derecha)
 * @returns {number} px hasta el borde
 */
function laserLengthToEdge(x, y, aim) {
  // `aim` no finito (o 0 rad = vertical) → sale por el tope. `cos ≈ 0`
  // (rayo horizontal) → el tope no llega nunca y gana el lateral.
  const a = Number.isFinite(aim) ? aim : 0;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const EPS = 1e-6;
  let t = Infinity;
  if (dy < -EPS) {                       // tope: y = 0
    const ty = -y / dy;
    if (ty > 0) t = Math.min(t, ty);
  }
  if (dx > EPS) {                        // lateral derecho: x = CANVAS_W
    const tx = (CONFIG.CANVAS_W - x) / dx;
    if (tx > 0) t = Math.min(t, tx);
  } else if (dx < -EPS) {                // lateral izquierdo: x = 0
    const tx = -x / dx;
    if (tx > 0) t = Math.min(t, tx);
  }
  // Degenerado (boca sobre el borde y hacia arriba): el alto de la boca.
  if (!Number.isFinite(t)) return Math.max(0, y);
  return t;
}

export class LaserStaticFx {
  /**
   * @param {object} [mods] mods EFECTIVOS de la torre que dispara el
   *   rayo (`unitMods(tower)`): sin ellos el rayo lee los perks del
   *   meta por su cuenta (como antes). Se pasan para que los mods de
   *   CARTA (canal de js/perks.js) lleguen al láser: sin esto, una
   *   carta de técnica del Láser no haría nada (el rayo es una entidad
   *   suelta, no la torre).
   */
  constructor(game, x, top, aim, damagePerSec, d = TOWERS.laser, mods = null) {
    this.game = game;
    this.x = x; this.y = top;
    // `aim` no finito (o ausente) → vertical: el rayo, su hitbox y su
    // dibujo usan SIEMPRE este ángulo saneado (fase 66).
    this.aim = Number.isFinite(aim) ? aim : 0;
    this.dps = damagePerSec;              // getter de la torre (nivel × cartas × meta)
    this.mods = mods ?? null;             // mods de la torre (perks + cartas)
    this.life = (d.laserDuration ?? 3.2) + (mods?.laserDurationAdd ?? 0);
    this.len = laserLengthToEdge(this.x, this.y, this.aim);
    this.color = d.beamColor ?? '#9DFF3C';
    this.core = d.coreColor ?? '#E8FFE8';
    this.t = 0;
    this.dead = false;
    this._sparkTick = -1;                 // throttle de destellos (20/s/enemigo)
    // Extremo del segmento precalculado — el rayo NO se re-aima, y la
    // longitud ya es la del borde: ningún ángulo se corta antes de salir.
    this.ex = this.x + Math.sin(this.aim) * this.len;
    this.ey = this.y - Math.cos(this.aim) * this.len;
    const eng = game?.engine;
    eng?.emit('laser:start', { x: this.x, aim: this.aim });
    eng?.sfxSafe?.('laser'); // patrón BlackHoleFx (towers.js:669-670); el
    // sfx real lo engancha main.js en 'laser:start' (audio 'laser', audio.js).
  }

  get active() { return !this.dead && this.t < this.life; }

  update(dt) {
    if (dt <= 0) return;
    this.t += dt;
    if (this.t >= this.life) { this.dead = true; return; }
    // Penetrante multi-objetivo: TODA la línea del segmento, sin tope
    const list = this.game?.fortress?.enemies;
    if (!Array.isArray(list)) return;
    const hitR = LASER_WIDTH / 2; // + radio del enemigo por blanco
    const tick = Math.floor(this.t * 20); // destello cada 50 ms por enemigo
    const lpm = this.mods ?? perkMods('laser'); // fase 23: ejecutar/robo de vida/explosión al matar
    for (const e of list) {
      if (!e || e.dead) continue;
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      const reach = hitR + (e.r ?? 14);
      const d2 = this._distToSegment(e.x, e.y);
      if (d2 > reach) continue;
      hurtP(e, this.dps * dt, 'laser', lpm, this.game, list);
      if (tick === this._sparkTick) continue;
      // Destello en el punto de contacto (spawnParticles recicla FIFO
      // sobre MAX_PARTICLES 400 — nunca lo supera)
      const p = this._clampToSegment(e.x, e.y);
      this.game?.engine?.spawnParticles(p[0], p[1], this.color, 2, {
        speedMin: 20, speedMax: 90, gravity: 0,
        lifeMin: 0.12, lifeMax: 0.22, sizeMin: 1, sizeMax: 2.4,
      });
    }
    this._sparkTick = tick;
  }

  /** Distancia del punto P al SEGMENTO del rayo (proyección acotada). */
  _distToSegment(px, py) {
    return pointSegmentDistance(px, py, this.x, this.y, this.ex, this.ey);
  }

  /** Proyección del punto sobre el segmento (lugar del destello). */
  _clampToSegment(px, py) {
    return closestPointOnSegment(px, py, this.x, this.y, this.ex, this.ey);
  }

  draw(ctx) {
    if (!this.active) return;
    const fade = Math.min(1, this.t * 6, (this.life - this.t) * 3);
    ctx.save();
    ctx.globalAlpha = 0.95 * fade;
    ctx.lineCap = 'round';
    // dev-7 fase 29 — haz CON CUERPO: manto con gradiente longitudinal
    // (se apaga en los dos extremos), núcleo claro de 1 px encima y glow
    // bajo (10 px). Solo es dibujo: el ancho de daño sigue siendo
    // LASER_WIDTH (6 px) y la duración, el mismo.
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = beamGradient(ctx, this.x, this.y, this.ex, this.ey, this.color);
    ctx.lineWidth = LASER_WIDTH;
    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.ex, this.ey); ctx.stroke();
    ctx.shadowBlur = 6;
    ctx.strokeStyle = beamGradient(ctx, this.x, this.y, this.ex, this.ey, this.core);
    ctx.lineWidth = LASER_CORE;
    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.ex, this.ey); ctx.stroke();
    // Orbe encendido en la boca
    ctx.fillStyle = this.core;
    ctx.beginPath(); ctx.arc(this.x, this.y, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// ------------------------------------------------------------
// FX efímeros (engine.addEffect — {life, draw(ctx,t)})
// ------------------------------------------------------------

/**
 * v4 4d/5 — RAYO CONTINUO del Beam: segmento dirigido desde la BOCA de
 * la torre hasta la posición ACTUAL del blanco (se re-crea por frame
 * mientras hay blanco, fire() case 'beam'). Estética: manto verde con
 * glow, taper de grosor 14 px (base) → 6 px (punta) y wobble ±1-2 px
 * (oscilación con el reloj del engine) + orbe en la boca.
 *
 * dev-7 fase 26: `extra` son los px EXTRA de grosor que aporta el perk
 * "Haz ancho: +N px de grosor" (rangeAdd). Antes el perk solo agrandaba
 * el hitbox de los secundarios y el haz se veía igual de delgado: la
 * descripción prometía grosor y el jugador no lo veía.
 *
 * fase 66: `ramp` (el multiplicador del foco, ×1 → ×4,5) se VE — antes
 * `_beamTime` solo entraba en el cálculo del daño y el jugador no tenía
 * forma de saber que el haz estaba cocinando. El grosor crece SUAVE
 * (×1 → ×1,87 al tope: el haz ya es ancho y a niveles altos +8 px del
 * perk) y el brillo es el que hace el resto (10 → 24 px de glow).
 */
class BeamFx {
  constructor(game, x, top, tx, ty, extra = 0, ramp = 1) {
    this.x = x; this.y = top; this.tx = tx; this.ty = ty;
    this.extra = extra;
    this.ramp = Number.isFinite(ramp) ? Math.max(1, ramp) : 1;
    this.life = 0.12;
    this._t = game?.engine?._t ?? 0; // reloj global para el wobble
  }
  draw(ctx, t) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (0.55 + 0.45 * t) * (1 + 0.15 * (this.ramp - 1)));
    ctx.lineCap = 'round';
    const wob = 1 + Math.sin(this._t * 26) * 1.2; // ±1.2 px (wobble)
    const grow = 1 + 0.25 * (this.ramp - 1);      // fase 66: grosor por ramp
    const w0 = (14 + this.extra) * wob * grow, w1 = (6 + this.extra) * wob * grow;
    const dx = this.tx - this.x, dy = this.ty - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;          // normal al segmento
    const h0 = w0 / 2, h1 = w1 / 2;
    // dev-7 fase 29 — haz CON CUERPO: el manto cónico se pinta con un
    // GRADIENTE longitudinal (color pleno en el centro, se apaga en los
    // dos extremos) y un glow bajo (10 px) en vez del plano de antes.
    // El ancho del manto (w0/w1) NO cambia por el color: es el mismo
    // hitbox visual (fase 66: solo lo mueven `extra` y el ramp).
    ctx.shadowColor = TOWERS.beam.beamColor;
    ctx.shadowBlur = 10 + 4 * (this.ramp - 1); // fase 66: el glow crece con el foco
    ctx.fillStyle = beamGradient(ctx, this.x, this.y, this.tx, this.ty, TOWERS.beam.beamColor);
    ctx.beginPath();
    ctx.moveTo(this.x + nx * h0, this.y + ny * h0);
    ctx.lineTo(this.x - nx * h0, this.y - ny * h0);
    ctx.lineTo(this.tx - nx * h1, this.ty - ny * h1);
    ctx.lineTo(this.tx + nx * h1, this.ty + ny * h1);
    ctx.closePath();
    ctx.fill();
    // Núcleo claro de 1 px en el centro del haz (energía concentrada)
    ctx.shadowBlur = 6;
    ctx.strokeStyle = beamGradient(ctx, this.x, this.y, this.tx, this.ty, TOWERS.beam.coreColor);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.tx, this.ty); ctx.stroke();
    // Orbe encendido en la boca (crece un poco con el foco del ramp)
    ctx.fillStyle = TOWERS.beam.coreColor;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3.2 + 0.6 * (this.ramp - 1), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Rayo con zigzag determinista (Thunderstroke / cadena Tesla).
 * `colors` = { color, core }: el halo va con la firma de la torre (ámbar
 * en el Thunderstroke, cian en el Tesla — fase 28/29) y el núcleo es
 * casi blanco.
 *
 * fase 73: acepta opciones de GROSOR/VIDA/ALPHA para que el Thunderstroke
 * pueda dibujar UN rayo principal grueso y varios mini rayos finos desde
 * el punto de impacto. Los paths de 2 puntos (rayo principal y mini rayos)
 * reciben un quiebre perpendicular: antes salían como una línea recta y
 * no se leían como relámpagos. La cadena de la Tesla (>2 puntos) conserva
 * su zigzag histórico.
 */
class BoltFx {
  constructor(points, colors, opts = {}) {
    this.points = points;
    this.colors = colors;
    this.life = opts.life ?? 0.16;
    this.width = opts.width ?? 5;
    this.coreWidth = opts.coreWidth ?? 1.2;
    this.alpha = opts.alpha ?? 1;
    this.zigX = opts.zigX ?? 12;
    this.zigY = opts.zigY ?? 8;
    // Zigzag fijo por descarga (NO regenerar por frame)
    this.zigs = points.map(() => (Math.random() * 2 - 1));
  }
  path(ctx) {
    const p = this.points;
    ctx.moveTo(p[0].x, p[0].y);
    if (p.length === 2) {
      // Quiebre perpendicular al segmento: un solo rayo también se lee
      // como relámpago (antes era una línea recta).
      const dx = p[1].x - p[0].x;
      const dy = p[1].y - p[0].y;
      const len = Math.hypot(dx, dy) || 1;
      const off = this.zigs[1] * this.zigX;
      ctx.lineTo(
        (p[0].x + p[1].x) / 2 - (dy / len) * off,
        (p[0].y + p[1].y) / 2 + (dx / len) * off,
      );
      ctx.lineTo(p[1].x, p[1].y);
      return;
    }
    for (let i = 1; i < p.length - 1; i++) {
      const a = p[i - 1], b = p[i];
      ctx.lineTo(
        (a.x + b.x) / 2 + this.zigs[i] * this.zigX,
        (a.y + b.y) / 2 + this.zigs[i] * this.zigY,
      );
      ctx.lineTo(b.x, b.y);
    }
    ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
  }
  draw(ctx, t) {
    // Halo de acento + núcleo claro, flicker de alpha
    for (const [color, width, blur] of [
      [this.colors.color, this.width, 12],
      [this.colors.core, this.coreWidth, 0],
    ]) {
      ctx.save();
      ctx.globalAlpha = (0.35 + 0.65 * t) * this.alpha;
      ctx.strokeStyle = color;
      ctx.shadowColor = this.colors.color;
      ctx.shadowBlur = blur;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      this.path(ctx);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ------------------------------------------------------------
// v5 5c/5 — LEAD PREDICTIVO del Guardian (§5c): en lugar de apuntar a la
// posición ACTUAL del blanco (la bala tarda T s en llegar y el enemigo se
// mueve → llega a una posición vieja y falla en diagonales/zigzag), apunta
// al PUNTO DE IMPACTO estimado:
//   T  = dist(torre→tgt) / bulletSpeed   (una iteración; vuelo ~0.3-0.4 s)
//   lead = posición actual + velocidad × T
// La velocidad replica la fórmula EXACTA de desplazamiento de enemies.js
// update(): this.x += vx·dt·sf, this.y += vel·dt·sf con sf = slowFactor ?? 1
// (mismo factor que aplica el Dron Campo de Fuerza).
// Clamps: x ∈ [10, CANVAS_W−10], y ∈ [40, top−10] (el punto de impacto no
// puede quedar fuera del canvas). Sin blanco devuelve 0 (cañón vertical,
// coherencia 3b/7).
// ------------------------------------------------------------
export function guardianLeadAim(tower, tgt, top, spd) {
  if (!tgt) return 0;
  const x0 = tower.x;
  const T = dist(tgt.x, tgt.y, x0, top) / (spd || 1);
  const sf = tgt.slowFactor ?? 1; // mismo factor que consume enemies.js
  // FASE 58: la velocidad VERTICAL del blanco (la nominal × el factor de
  // layout). Con el marco alto el enemigo cae más rápido por encima del
  // alcance de las torres: apuntar a `tgt.vel` (la nominal) haría que
  // la bala llegue SIEMPRE por debajo del blanco.
  const vel = tgt.vel ?? 0;
  const leadX = clamp(tgt.x + (tgt.vx ?? 0) * T, 10, CONFIG.CANVAS_W - 10);
  // FASE 58: la proyección integra el cambio de velocidad en el borde
  // del "bajo fuego" (fallYAfter): con la línea recta el tiro se
  // quedaba corto en el cruce y las torres fallaban.
  const leadY = clamp(fallYAfter(tgt.y, vel * sf, T), 40, top - 10);
  return Math.atan2(leadX - x0, -(leadY - top));
}

// ------------------------------------------------------------
// Tower — torre fija en un slot (§5 dev-2 firma)
// ------------------------------------------------------------
/**
 * dev-7 fase 28 — Cadencia del zumbido del Beam. El haz es CONTINUO
 * (`fire()` corre cada frame mientras hay blanco), así que 'beam:fire'
 * no puede emitirse por frame: se emite como un zumbido cada
 * BEAM_SFX_GAP segundos (0.34 s ≈ el throttle del sample 'beam' en
 * audio.js, que tiene un pool de 3 justamente para ese zumbido).
 */
const BEAM_SFX_GAP = 0.34;

/**
 * Separación horizontal entre las balas PARALELAS del Guardian (Lv.1-3).
 * Antes 13 px: con esporas (r 7) + bala (r 4) el diámetro de captura es
 * 22 px, así que 13 px dejaba huecos visuales y, sobre todo, el muestreo
 * por frame se comía a los enemigos chicos a 30 fps / 2× (ver CCD en
 * Bullet y applyProjectileHit). 10 px deja una pared más compacta.
 */
const GUARDIAN_VOLLEY_STEP = 10;

export class Tower {
  /**
   * @param {string} type clave de TOWERS
   * @param {number} x X fija del slot (CONFIG.SLOTS)
   * @param {number} [level=1] nivel inicial
   * @param {number} [y=CONFIG.TOWER_Y] Y de la fila: frontal (TOWER_Y) o
   *   de la torre (fase 61: hay una sola fila) — el render y la balística
   *   de la torre se anclan a su fila.
   */
  constructor(type, x, level = 1, y = CONFIG.TOWER_Y) {
    this.type = type;
    this.data = TOWERS[type];
    this.x = x;
    this.y = y;
    this.level = level;
    // Multiplicadores de carta (cards.js §2.2): daño y cadencia.
    this.dmgMul = 1;
    this.cadMul = 1;
    // v5 5c/5: velocidad de bala × carta Balas Hipersónicas (×1.25/stack,
    // cap 2 → el Guardian vuela a 920 × 1.5625 ≈ 1437 px/s máximo).
    this.bulletSpeedMul = 1;
    // dev-7 fase 51: CANAL DE CARTAS — los mods de MECÁNICAS que esta
    // unidad gana en partida (rebote, perforación, explosión, slow,
    // crítico, robo de vida, aturdir, remate). Vacío = la unidad sólo
    // tiene los perks de meta. Los escribe cards.js vía addCardMods()
    // (js/perks.js) y los lee unitMods() (fusión con los perks).
    this.cardMods = {};
    this.cardApps = {};
    this.cooldownLeft = rand(0, 0.2); // desincroniza las torres al arrancar
    this.firing = false;              // luz de estado este frame
    this.active = false;              // Beam encendido este frame
    // v3 3d/7 — AIMING VISIBLE: ángulo del cañón del Guardian en rad
    // (0 = vertical, lo refresca update() cada frame) y estado del
    // rayo del Beam (v4 4d/5 + fase 66): blanco perseguido + los TRES
    // relojes del ciclo (ver update()).
    this._aim = 0;
    this._beamTarget = null;
    this._beamTime = 0;   // s de FOCO sobre el blanco ACTUAL (ramp ×1→×4,5)
    this._beamWindow = 0; // s que le quedan a la VENTANA de ataque (beamBurst)
    this._beamCd = 0;     // s que le quedan al COOLDOWN (haz apagado, sin adquirir)
    this._sparkAcc = 0;   // throttle de destellos en el impacto (20/s)
    // dev-7 fase 28: reloj del zumbido del haz (ver BEAM_SFX_GAP).
    this._sfxAcc = 0;
    // dev-7 fase 29: reloj del REALCE de disparo (flash de acento).
    this._flashT = 0;
    // dev-7 fase 33: los BLANCOS de la torre. Son STICKY: no cambian
    // hasta que se destruyen (o salen de rango). Antes se re-elegía en
    // cada disparo, así que la torre repartía el fuego.
    this.targets = [];
    // dev-7 fase 33: la CARGA del build-up (Gauss y Thunderstroke): 0→1
    // mientras se agota el cooldown. Sólo crece si hay blanco (cargar
    // sin blanco sería ruido visual).
    this._charge = 0;
    // fase 60: relojes de ANIMACIÓN del rig — retroceso del cañón (1→0 en
    // ~0.17 s) y calor de boca (1→0 en ~1.7 s). Solo render.
    this._recoil = 0;
    this._heat = 0;
  }

  upgrade() {
    if (this.level >= MAX_TOWER_LEVEL) return false;
    this.level += 1;
    return true;
  }

  /** Daño escalado: +25% por nivel (§2.2) × multiplicadores de carta ×
   *  META-GAME v6 (mejora permanente de la torreta, +5 %/nivel meta —
   *  META_DMG_PER_LEVEL en meta.js; hasta Nvl.100 = ×5.95 — el comentario
   *  viejo decía "v3.5, +10 %/nivel" y mentía) × perks.
   *  El multiplicador meta INCLUYE además el bonus de HITOS (+2 % por
   *  hito alcanzado: Nvl.25/50/75/100 → ×1.08 en Nvl.100), aplicado
   *  dentro de `metaDmgMul()` — por eso el tope real en Nvl.100 es
   *  ×5.95 × 1.08 = ×6.43 (ver meta.js `milestoneDmgMul`).
   *  Las torres DPS (beam y láser v4 4c/5) escalan su damagePerSec. */
  get damage() {
    const d = this.data;
    const base = (d.kind === 'beam' || d.kind === 'laser') ? d.damagePerSec : d.damage;
    // dev-7 fase 10: dmgMul de los PERKS distintos (meta.js) se compone
    // acá una sola vez para las torretas con tabla — reemplaza las
    // fórmulas por-sitio viejas (perkCount('x') * algo).
    const perkDmgMul = unitMods(this).dmgMul ?? 1;
    return Math.round(base * (1 + 0.25 * (this.level - 1)) * (this.dmgMul ?? 1)
      * (metaDmgMul(this.type) ?? 1) * perkDmgMul);
  }

  /** Cadencia escalada: −8% por nivel (§2.2) × cartas (Servomecanismos)
   *  × perks (meta.js PERKS, dev-7 fase 10 — reemplaza el −5%/perk fijo
   *  que antes solo tenía Gauss; ahora cada torre define el suyo, o
   *  ninguno, en su propia tabla). */
  get cooldown() {
    const perkCadMul = unitMods(this).cadMul ?? 1;
    return this.data.cooldown
      * Math.pow(0.92, this.level - 1)
      * (this.cadMul ?? 1)
      * perkCadMul;
  }

  /** Velocidad de bala EFECTIVA del Guardian (v5 5c/5): base TOWERS ×
   *  Balas Hipersónicas (×1.25 por stack, cap 2 → ×1.5625). La usan
   *  fire()/_spawnBullet y el lead predictivo (el cálculo de impacto
   *  usa la MISMA velocidad a la que viajará la bala). */
  get bulletSpeedNow() {
    // dev-7 fase 10: bulletSpeedMul de perk propio (guardian tier 5),
    // compuesto junto con el de cartas (Balas Hipersónicas).
    const perkSpeedMul = unitMods(this).bulletSpeedMul ?? 1;
    return TOWERS.guardian.bulletSpeed * (this.bulletSpeedMul ?? 1) * perkSpeedMul;
  }

  /**
   * Ancho de detección efectivo: el canónico del tipo (§2.2) escalado
   * por la carta Sensores Ampliados (fortress.detectMul).
   */
  detectWidthNow(game) {
    let w = detectWidth(this.data);
    const mul = game?.fortress?.detectMul;
    if (typeof w === 'number' && Number.isFinite(w)) w *= mul ?? 1;
    return w;
  }

  /** Guardian (v3 3b/7, corrección JK 26-08): balas por disparo = NIVEL de
   *  la torre — Lv.1 dispara 1 bala, cada carta (+1 nivel) suma 1 bala
   *  PARALELA ("4-8 líneas paralelas" del diseño base). Tope defensivo 7: el
   *  cap de nivel es 5 (upgrade()) pero la fórmula sigue genérica. */
  get bulletsPerBurst() {
    // dev-7 fase 48: TOPE DURO de 3 balas simultáneas. Antes era
    // min(nivel, 7) + los perks (+1..+4) = hasta 9 balas de golpe, y del
    // Lv.4 en adelante se ABRÍA en abanico (las balas se dispersaban y
    // fallaban: la mitad del daño se perdía).
    // v6 perk (guardian): +1 bala extra por disparo por cada 10 niveles meta
    return Math.min(3, this.level + (unitMods(this).extraCount ?? 0));
  }

  /**
   * dev-7 fase 33 — ADQUISICIÓN STICKY del blanco.
   *
   * Devuelve la lista de blancos de la torre (hasta `count`):
   *   - conserva los que siguen VIVOS y EN RANGO (no cambian de blanco
   *     hasta que se destruyen — la torre concentra el fuego);
   *   - rellena los huecos con la política de la torre (nearest /
   *     farthest / toughest).
   *
   * @param {Array} enemies lista viva de enemigos
   * @param {object} game
   * @param {number} [count] cuántos blancos hacen falta
   * @returns {Array} blancos vigentes
   */
  _acquireTargets(enemies, game, count = 1) {
    const keep = (this.targets ?? []).filter((e) => targetInRange(e, game, this));
    const want = Math.max(1, count | 0);
    while (keep.length < want) {
      const t = pickByPolicy(enemies, game, this, keep);
      if (!t) break;
      keep.push(t);
    }
    this.targets = keep;
    return keep;
  }

  /**
   * El blanco principal de la torre (el primero de la lista).
   * @returns {object|null}
   */
  _primaryTarget(enemies, game, count = 1) {
    const list = this._acquireTargets(enemies, game, count);
    return list[0] ?? null;
  }

  /** Blanco del Guardian (v3 3b/7): el enemigo MÁS AVANZADO a la base dentro
   *  del ancho de detección. El juego es TD vertical (los enemigos caen de
   *  arriba, y crece hacia la base en TOWER_Y), luego "menor distancia al
   *  Guardian" = MAYOR y (el más avanzado → el más amenazante). */
  _nearestTarget(enemies, game) {
    return this._primaryTarget(enemies, game, 1);
  }

  /** Como _nearestTarget pero devuelve hasta `count` blancos (los más
   *  avanzados primero) — dev-7 fase 22: usado por Láser para el perk
   *  "+1 disparo simultáneo" (mismo filtro de rango que _nearestTarget,
   *  ninguna torre más lo necesita todavía). */
  _nearestTargets(enemies, game, count) {
    const w = this.detectWidthNow(game);
    const list = (enemies || []).filter((e) => e && !e.dead
      && (!Number.isFinite(w) || Math.abs(e.x - this.x) <= w));
    list.sort((a, b) => b.y - a.y);
    return list.slice(0, count);
  }

  /**
   * Blanco según la POLÍTICA de la torre (dev-7 fase 33) y STICKY: no
   * cambia hasta que se destruye.
   *   - Guardian / Misiles / Tesla / Láser: el más avanzado (nearest).
   *   - Gauss / Mortar / Thunderstroke: el más lejano (farthest).
   *   - Beam: el de más vida (toughest) dentro de su ventana.
   */
  findTarget(enemies, game) {
    return this._primaryTarget(enemies, game, 1);
  }

  /**
   * Ciclo de ataque completo AHORA: guardian arma un volley dirigido
   * (1 bala al enemigo más cercano / N paralelas / abanico desde Lv.4);
   * homing lanza misil; beam enciende láser y aplica su DPS del frame;
   * bolt/chain descargan fx + daño instantáneos.
   */
  fire(enemies, game, dt = 0) {
    const d = this.data;
    const top = this.y - 34; // boca de la torre (fila frontal o trasera)
    switch (d.kind) {
      case 'fan': {
        // v3 3b/7 (corrección canónica JK 26-08): SIEMPRE apunta al enemigo
        // más cercano (sin blanco → vertical). Lv.1: 1 bala dirigida sin
        // dispersión; Lv.2+: balas PARALELAS (mismo ángulo, separación
        // uniforme en X); Lv.4+: la ráfaga se reparte entre varios blancos.
        // TODO el volley sale en el mismo frame.
        const tgt = this._primaryTarget(enemies, game, 1);
        const n = this.bulletsPerBurst;
        // v5 5c/5: aim con LEAD (punto de impacto estimado, no la posición
        // actual) — la bala 920 px/s tarda ~0.3-0.45 s y el enemigo avanza;
        // el lead usa la MISMA velocidad efectiva de la bala.
        // dev-7 fase 48: del Lv.4 la ráfaga se reparte entre N BLANCOS
        // DISTINTOS (el multi-blanco útil: cada bala a un enemigo) en vez de
        // abrirse en abanico (que las dispersaba y hacía fallar).
        if (!tgt || n <= 1 || this.level < 4) {
          // Dirigida (n=1) o líneas paralelas al MISMO blanco: mismo ángulo,
          // X escalonadas (separación uniforme tipo "4-8 líneas paralelas").
          const aim = guardianLeadAim(this, tgt, top, this.bulletSpeedNow);
          const step = GUARDIAN_VOLLEY_STEP;
          const x0 = this.x - ((n - 1) / 2) * step;
          for (let i = 0; i < n; i++) {
            this._spawnBullet(x0 + i * step, top, aim, game);
          }
        } else {
          // Multi-blanco: el blanco principal + los más cercanos a él.
          const blancos = [tgt];
          const otros = (enemies || [])
            .filter((e) => e && !e.dead && e !== tgt)
            .sort((a, b) => dist(a.x, a.y, tgt.x, tgt.y) - dist(b.x, b.y, tgt.x, tgt.y));
          for (const e of otros) {
            if (blancos.length >= n) break;
            blancos.push(e);
          }
          for (let i = 0; i < n; i++) {
            const b = blancos[i] ?? tgt;
            this._spawnBullet(this.x, top, guardianLeadAim(this, b, top, this.bulletSpeedNow), game);
          }
        }
        this.firing = true;
        break;
      }
      case 'homing':
        // v3.5: el daño del misil escala con la torre (nivel × cartas × meta).
        // v6 perk (missile): +1 misil simultáneo por cada 10 niveles meta —
        // los N misiles se reparten entre los N enemigos más avanzados.
        {
          const n = 1 + (unitMods(this).extraCount ?? 0);
          // dev-7 fase 33: los N blancos son STICKY (no cambian hasta que
          // se destruyen) y se eligen por la política de la torre (el más
          // avanzado). Antes se re-elegían los N más avanzados en cada
          // andanada.
          const targets = this._acquireTargets(enemies, game, n);
          if (!targets.length) targets.push(null); // respaldo: sale igual (histórico)
          const mpm = unitMods(this); // fase 17: sistemáticos del Penetrador
          for (const tg of targets) {
            game.engine.addEntity(new HomingMissile(
              this.x, top, tg, game, this.damage,
              { homing: mpm.homingStrength ?? 0,
                slowOnHit: mpm.slowOnHit ?? 0,
                stunChance: mpm.stunChance ?? 0,
                ...onHitOpts(mpm, game),
                critChance: mpm.critChanceAdd ?? 0,
                critMul: mpm.critDmgMul ?? 2 },
            ));
          }
          // dev-7 fase 28: UN 'missile:fire' por ANDANADA (no uno por
          // misil del perk "+1 misil simultáneo" — son la misma ráfaga).
          game?.engine?.emit?.('missile:fire', { x: this.x, y: top });
          this.firing = true;
        }
        break;
      case 'beam':
        // v4 4d/5 — RAYO DIRIGIDO base → blanco: el segmento se redibuja
        // cada frame desde la boca (this.x, top) hasta la posición ACTUAL
        // del enemigo (sin paneo horizontal). RAMP-UP sobre el OBJETIVO
        // PRINCIPAL: ×1 al arrancar hasta ×4,5 (fase 66: beamRampPerSec
        // 0,8 → tope a los ~4,4 s de foco) según el reloj this._beamTime,
        // que SOLO cuenta mientras el haz mantiene al mismo blanco (ver
        // update()). El haz daña ÚNICAMENTE a su blanco (fase 66): el
        // `columnHalfWidth` de 260 px es la ventana de ADQUISICIÓN y el
        // manto dibujado es GROSOR VISUAL — ninguno de los dos reparte daño.
        {
          const tgt = this._beamTarget;
          if (!tgt || tgt.dead) break; // sin blanco vivo → rayo apagado
          const bm = unitMods(this); // fase 17: sistemáticos del haz
          const rampPerSec = (d.beamRampPerSec ?? 0.8) + (bm.beamRampPerSecAdd ?? 0);
          const ramp = clamp(1 + this._beamTime * rampPerSec,
            1, d.beamRampMax ?? 4.5);
          const beamHit = (baseDmg) => {
            // crítico propio del perk + Fractura Criogénica contra slow.
            const cm = game?.fortress?.comboMods;
            let chance = bm.critChanceAdd ?? 0;
            let critMul = bm.critDmgMul ?? 2;
            const slowed = (tgt.slowTimer ?? 0) > 0;
            if (slowed) {
              chance += cm?.slowCritChanceAdd ?? 0;
              critMul += cm?.slowCritDmgAdd ?? 0;
            }
            const { crit, mul } = rollCrit(chance, critMul);
            if (!crit) return baseDmg;
            if (slowed) tryFreeze(tgt, cm?.slowFreezeChance, 0.5);
            return Math.round(baseDmg * mul);
          };
          const slowBeam = (e) => {
            if ((bm.slowOnHit ?? 0) > 0) {
              applySlow(e, bm.slowOnHit, 1.2, 'beam');
            }
          };
          hurtP(tgt, beamHit(this.damage * ramp * dt), 'beam', bm, game, enemies); // objetivo: dps × ramp
          slowBeam(tgt);
          // El MANTO del haz es SOLO VISUAL (fase 66): el grosor del perk
          // (`rangeAdd`, +8 px cada 10 niveles) engorda el DIBUJO, no el
          // daño — el haz daña únicamente a su blanco (decisión del usuario:
          // "solo daña al target elegido, no a lo demás"). Hasta la fase 66
          // los que cruzaban la línea fina (≤12 px + rangeAdd) comían el DPS
          // base sin ramp: era un daño secundario escondido que contradecía
          // el rol de foco único de la torre.
          const rangeAdd = unitMods(this).rangeAdd ?? 0; // spec 4d: base 12
          // Destello en el punto de impacto (~20/s; spawnParticles recicla
          // FIFO sobre MAX_PARTICLES 400 — nunca lo supera)
          this._sparkAcc += Math.max(0, dt);
          if (this._sparkAcc >= 0.05) {
            this._sparkAcc = 0;
            game.engine.spawnParticles(tgt.x, tgt.y, TOWERS.beam.coreColor, 2, {
              speedMin: 20, speedMax: 90, gravity: 0,
              lifeMin: 0.12, lifeMax: 0.22, sizeMin: 1, sizeMax: 2.4,
            });
          }
          game.engine.addEffect(new BeamFx(game, this.x, top, tgt.x, tgt.y, rangeAdd, ramp));
          // dev-7 fase 28: DENTRO de la ventana el haz es CONTINUO (fire()
          // corre cada frame mientras haya blanco) → 'beam:fire' es un
          // ZUMBIDO con cadencia (BEAM_SFX_GAP), no un evento por frame.
          if (this._sfxAcc <= 0) {
            this._sfxAcc = BEAM_SFX_GAP;
            game?.engine?.emit?.('beam:fire', { x: this.x, y: top });
          }
          this.firing = true;
        }
        break;
      case 'bolt': {
        // fase 73 — TIRO LARGO: un ÚNICO rayo principal al blanco más
        // lejano (farthest, sticky) y, en el punto de impacto, un estallido
        // de MINI RAYOS a los vecinos dentro de `areaR`. Es la diferencia
        // con la Tesla: la Tesla encadena saltos; el Thunderstroke pega
        // fuerte en un punto y salpica alrededor.
        // Los perks `extraCount` y `chainFork` suman objetivos de ÁREA
        // (mini rayos), no rayos principales: se mantiene el "solo 1 rayo".
        const ptm = unitMods(this);
        const primary = this._acquireTargets(enemies, game, 1)[0] ?? null;
        if (primary) {
          const accent = MUZZLE_ACCENT[d.kind] ?? d.accent;
          const colors = { color: accent, core: d.coreColor ?? '#FFFFFF' };
          // Punto de impacto CONGELADO: los FX no deben seguir al enemigo
          // durante su vida (el rayo y el anillo son instantáneos).
          const impact = { x: primary.x, y: primary.y };
          const areaR = d.areaR ?? 130;
          const areaDmg = Math.round(this.damage * (d.areaFrac ?? 0.5));
          const maxArea = Math.min(
            THUNDER_AREA_MAX,
            Math.max(0, (d.areaTargets ?? 3)
              + (ptm.extraCount ?? 0) + (ptm.chainFork ?? 0)),
          );
          // La lista se resuelve ANTES de dañar: el punto de impacto es la
          // posición actual del principal, y los vecinos se ordenan por
          // cercanía. Si un golpe posterior los mata, se saltean.
          const area = maxArea > 0
            ? (enemies || [])
              .filter((e) => e && !e.dead && e !== primary)
              .map((e) => ({ e, dd: dist(e.x, e.y, impact.x, impact.y) }))
              .filter(({ e, dd }) => dd <= areaR + (e.r ?? 10))
              .sort((a, b) => a.dd - b.dd)
              .slice(0, maxArea)
            : [];

          // 1) Un solo rayo principal, grueso.
          game.engine.addEffect(new BoltFx(
            [{ x: this.x, y: top }, impact],
            colors,
          ));
          // 2) Mini rayos finos desde el impacto a cada vecino.
          for (const { e } of area) {
            game.engine.addEffect(new BoltFx(
              [impact, { x: e.x, y: e.y }],
              colors,
              { life: 0.13, width: 2.4, coreWidth: 0.7, alpha: 0.85, zigX: 7, zigY: 5 },
            ));
          }

          const stunHit = (e, base) => {
            applyStun(e, base);
            if ((ptm.stunChance ?? 0) > 0 && Math.random() < ptm.stunChance) {
              applyStun(e, 0.5);
            }
          };

          // 3) Daño pleno al principal + estallido a los vecinos.
          // fase 74.2 — Juicio Final: si el principal está aturdido, el
          // Thunderstroke pega +30% y alarga el stun +0,1 s.
          const cm = game?.fortress?.comboMods;
          const judged = !!(cm?.judgment && (primary.stun ?? 0) > 0);
          const mainDmg = judged ? Math.round(this.damage * 1.3) : this.damage;
          hurtP(primary, mainDmg, 'bolt', ptm, game, enemies);
          stunHit(primary, (d.stun ?? 0) + (judged ? 0.1 : 0));
          for (const { e } of area) {
            if (e.dead) continue;
            hurtP(e, areaDmg, 'bolt', ptm, game, enemies);
            stunHit(e, d.areaStun ?? 0);
          }

          // 4) Lectura del impacto: anillo ámbar + chispas + sacudida.
          game.engine.addEffect({
            life: 0.22,
            draw(ctx, tt) {
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = tt * 0.9;
              ctx.strokeStyle = accent;
              ctx.shadowColor = accent;
              ctx.shadowBlur = 12;
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.arc(impact.x, impact.y, 8 + (1 - tt) * 34, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            },
          });
          game.engine.spawnParticles(impact.x, impact.y, accent, 10, {
            speedMin: 40, speedMax: 180, gravity: 40,
            lifeMin: 0.18, lifeMax: 0.4, sizeMin: 1, sizeMax: 2.6,
          });
          game?.engine?.shake?.(2, 120);

          // dev-7 fase 28: UN 'bolt:fire' por descarga (los mini rayos
          // siguen siendo UNA descarga).
          game?.engine?.emit?.('bolt:fire', { x: this.x, y: top });
          this.firing = true;
        }
        break;
      }
      case 'chain': {
        // fase 66 — CADENA LOCAL: el blanco PRINCIPAL sigue saliendo de
        // `_acquireTargets` (política `nearest` = el más avanzado, sticky)
        // y cada salto siguiente se elige por cercanía al NODO ANTERIOR
        // (TESLA_CHAIN_RADIUS = 170 px), greedy y sin repetir enemigos.
        // ANTES los saltos se ordenaban por distancia a la TORRE y se
        // filtraban por su radio de 260: la cadena se radiaba desde la
        // torre, así que un enjambre que caía por la esquina opuesta se
        // quedaba con UN solo golpe. Ahora la descarga sigue al enjambre.
        // fase 17: chainFork del perk bifurca la cadena (más saltos, ×(1+fork)).
        const pem = unitMods(this);
        const n = (d.jumps + (pem.extraCount ?? 0)) * (1 + (pem.chainFork ?? 0));
        const primary = this._acquireTargets(enemies, game, 1)[0] ?? null;
        const inRange = primary ? [primary] : [];
        // Sin blanco principal no hay cadena (el bucle necesita un nodo).
        while (inRange.length && inRange.length < Math.max(1, n)) {
          const last = inRange[inRange.length - 1];
          let next = null;
          let bestD = TESLA_CHAIN_RADIUS;
          for (const e of enemies || []) {
            if (!e || e.dead || inRange.includes(e)) continue;
            const dd = dist(e.x, e.y, last.x, last.y);
            if (dd < bestD) { bestD = dd; next = e; }
          }
          if (!next) break; // sin vecinos dentro del radio local: corta acá
          inRange.push(next);
        }
        if (inRange.length) {
          game.engine.addEffect(new BoltFx(
            [{ x: this.x, y: top }, ...inRange],
            { color: MUZZLE_ACCENT[d.kind] ?? d.accent, core: d.coreColor ?? '#FFFFFF' },
          ));
          // Daño con falloff ×0.75 por salto (§2.2)
          let dmg = this.damage;
          for (const e of inRange) {
            hurtP(e, Math.round(dmg), 'chain', pem, game, enemies);
            dmg *= d.falloff;
          }
          // dev-7 fase 28: UN 'chain:fire' por cadena (los 3 saltos son
          // una sola descarga, no 3).
          game?.engine?.emit?.('chain:fire', { x: this.x, y: top });
          this.firing = true;
        }
        break;
      }
      case 'mortar': {
        // Arsenal §2.3: obús en arco hacia el blanco más cercano a la
        // base dentro del ancho de detección (× sensores). v3.5: escala
        // con la torre (nivel × cartas × meta).
        const mt = this.findTarget(enemies, game);
        if (mt) {
          // v6 perk (mortar): +15% de radio de explosión por cada 10 niveles
          const blastR = d.blastR * (unitMods(this).areaMul ?? 1);
          game.engine.addEntity(new MortarShell(this.x, top, mt, game, this.damage, blastR, (() => {
            const mm = unitMods(this);
            return { ...onHitOpts(mm, game), slowOnHit: mm.slowOnHit ?? 0, stunChance: mm.stunChance ?? 0, critChance: mm.critChanceAdd ?? 0, critMul: mm.critDmgMul ?? 2 };
          })()));
          // dev-7 fase 28: UN 'mortar:fire' por obús lanzado.
          game?.engine?.emit?.('mortar:fire', { x: this.x, y: top });
          this.firing = true;
        }
        break;
      }
      case 'gauss': {
        // v5 — el Cañón de Riel APUNTA ANTES DE DISPARAR (corrección JK):
        // elige al enemigo más avanzado (mayor y, cualquiera en X), rota
        // hacia él y dispara el perdigón perforante con LEAD (mismo ángulo
        // con el que el riel quedó apuntando en update()). Sin blanco NO
        // dispara — ya no tira a ciegas en vertical.
        const gt = this._primaryTarget(enemies, game, 1);
        if (gt) {
          const aim = guardianLeadAim(this, gt, top, d.speed);
          const gpm = unitMods(this); // fase 17: sistemáticos del riel
          game.engine.addEntity(new Bullet(this.x, top, aim, {
            damage: this.damage,
            speed: d.speed,
            color: projectileColor(this.type), // fase 29: magenta (firma del Gauss)
            pierce: 999 + (gpm.pierceCount ?? 0),
            radius: 6,
            // dev-7 fase 32: el perdigón del Gauss es balístico.
            dmgType: this.data?.dmgType ?? 'ballistic',
            source: 'gauss',
            markOnHit: 'rail',
            markDuration: 2,
            bounce: gpm.bounceCount ?? 0,
            slowOnHit: gpm.slowOnHit ?? 0,
            stunChance: gpm.stunChance ?? 0,
            ...onHitOpts(gpm, game),
            critChance: gpm.critChanceAdd ?? 0,
            critMul: gpm.critDmgMul ?? 2,
          }));
          // dev-7 fase 28: UN 'gauss:fire' por disparo del riel.
          game?.engine?.emit?.('gauss:fire', { x: this.x, y: top });
          this.firing = true;
        }
        break;
      }
      case 'laser': {
        // v4 4c/5 — torre LÁSER: disparo CON DURACIÓN y estático.
        // Blanco = el enemigo MÁS AVANZADO (mayor y) sin límite de X
        // (detectHalfWidth Infinity); sin blanco no dispara (mortar/bolt).
        // findTarget() elige el de MENOR y (arriba del todo) — para el
        // láser se quiere la amenaza más cercana a la base (spec 4c:
        // "el enemigo más avanzado (mayor Y)") → _nearestTarget.
        // dev-7 fase 22: perk "+1 disparo simultáneo" (extraCount) — con
        // varios blancos dispara un LaserStaticFx por cada uno, mismo
        // patrón que el "objetivo extra" de Thunderstroke.
        const lpm = unitMods(this);
        const shots = 1 + (lpm.extraCount ?? 0);
        // dev-7 fase 33: los blancos del Láser son STICKY y los elige la
        // política de la torre (el más avanzado).
        const targets = this._acquireTargets(enemies, game, shots);
        for (const lt of targets) {
          const aim = Math.atan2(lt.x - this.x, -(lt.y - top));
          game.engine.addEntity(new LaserStaticFx(
            game, this.x, top, aim, this.damage, d, lpm,
          ));
        }
        if (targets.length) this.firing = true;
        break;
      }
      default:
        break;
    }
    // dev-7 fase 29: REALCE de disparo — flash corto del color de acento
    // (TOWER_FLASH_TIME). Se apaga solo en update().
    if (this.firing) this._flashT = TOWER_FLASH_TIME;
  }

  update(dt, enemies, game) {
    this.firing = false;
    this.active = false;
    if (game) this.game = game; // ref para el flicker de la luz de estado
    this._sfxAcc -= dt; // reloj del zumbido del haz (ver BEAM_SFX_GAP)
    this._flashT = Math.max(0, this._flashT - dt); // fase 29: fin del realce
    // fase 60: decaimiento de los relojes de animación del rig.
    this._recoil = Math.max(0, (this._recoil ?? 0) - dt * RECOIL_DECAY);
    this._heat = Math.max(0, (this._heat ?? 0) - dt * HEAT_DECAY);
    const d = this.data;

    if (d.kind === 'beam') {
      // v4 4d/5 + fase 66 — CICLO DEL HAZ en tres relojes:
      //   · `_beamCd`     → cooldown: el haz está APAGADO y NO adquiere.
      //   · `_beamWindow` → ventana de ataque: arranca cuando el haz se
      //     enciende y corre hasta agotarse (reloj de pared, INDEPENDIENTE
      //     del blanco: cambiar de enemigo no la reinicia ni la corta).
      //   · `_beamTime`   → segundos de foco sobre el blanco ACTUAL (ramp);
      //     cambia el blanco o se pierde → vuelve a 0.
      // El cooldown se dispara SOLO al cerrarse la ventana: si el enemigo
      // muere, el haz re-adquiere y SIGUE pegando (matar no es un castigo;
      // el cooldown castiga terminar la ventana).
      const burst = d.beamBurst ?? 4.5;
      if (this._beamCd > 0) {
        this._beamCd = Math.max(0, this._beamCd - dt); // corre el cooldown
        this._beamWindow = 0;
        this._beamTime = 0;
        this.active = false;
      } else {
        this._updateBeamAcquire(enemies, game);
        // Recién encendido (venía de un cooldown o de no tener blanco): la
        // adquisición ABRE la ventana.
        if (this.active && this._beamWindow <= 0) this._beamWindow = burst;
        if (this._beamWindow > 0) {
          this._beamWindow = Math.max(0, this._beamWindow - dt);
          if (this.active) {
            this._beamTime += Math.max(0, dt);
            this.fire(enemies, game, dt);
          } else {
            this._beamTime = 0;
          }
          if (this._beamWindow <= 0) {
            // Se CERRÓ la ventana: haz apagado + cooldown (nunca por blanco).
            this._beamCd = d.beamCooldown ?? 2.5;
            this._beamTarget = null;
            this._beamTime = 0;
            this.active = false;
          }
        } else {
          this._beamTime = 0;
        }
      }
      // fase 60: la BOCA del emisor mira a su blanco. El arte viejo ya lo
      // hacía (beamAimAngle en el render) y el rediseño lo perdió: el
      // lente quedó fijo y la torre se veía muerta mientras disparaba.
      // (Sin blanco, `traverseAim` devuelve 0: lente vertical.)
      this._aim = traverseAim(this, this._beamTarget, TRAVERSE.beam);
      this._tickShot();
      return;
    }

    if (d.kind === 'laser') {
      // v4 4c/5 — la lente brilla mientras el rayo estático está vivo
      this.active = (game?.engine?.entities ?? []).some(
        (e) => e instanceof LaserStaticFx && !e.dead);
    }

    // v3 3d/7 — AIMING VISIBLE del Guardian: el cañón ROTA cada frame
    // hacia el enemigo más cercano (turret tracking, lo usa render());
    // sin blanco apunta vertical (0). v5 5c/5: usa EL MISMO lead del
    // disparo (el cañón mira adonde va la bala, coherencia cañón-bala).
    //
    // fase 60 — las torres de CAÑÓN/TUBO (Missile, Mortar, Láser)
    // traversan hacia su blanco con `traverseAim` (ángulo directo,
    // amplificado). El Missile y el Láser no llevan adelanto: sus
    // proyectiles son teledirigidos o instantáneos. El Mortar tampoco
    // (dispara en arco). Sin blanco, todas quedan en su pose de reposo.
    if (d.kind === 'fan' || d.kind === 'gauss') {
      // dev-7 fase 33: el blanco es STICKY (no cambia hasta que muere).
      const tgt = this._primaryTarget(enemies, game, 1);
      const spd = d.kind === 'gauss' ? d.speed : this.bulletSpeedNow;
      this._aim = guardianLeadAim(this, tgt, this.y - 34, spd);
    } else if (TRAVERSE[d.kind]) {
      const tgt = this._primaryTarget(enemies, game, 1);
      this._aim = traverseAim(this, tgt, TRAVERSE[d.kind]);
    }

    // dev-7 fase 33 — BUILD-UP (Gauss y Thunderstroke): la torre CARGA
    // mientras se agota el cooldown y el jugador lo ve (el riel del Gauss
    // acumulando energia, el orbe del Thunderstroke creciendo). Solo
    // carga si hay blanco: cargar hacia la nada seria ruido visual.
    // fase 73: el Thunderstroke refresca el blanco también DURANTE la
    // carga. Antes `targets` solo se llenaba al disparar; si el blanco
    // moría, el build-up seguía apuntando a un cadáver y el enlace suave
    // del render no tenía a quién dibujarse.
    if (d.kind === 'bolt') this._primaryTarget(enemies, game, 1);
    if (d.kind === 'gauss' || d.kind === 'bolt') {
      this._charge = this.targets?.[0]
        ? Math.max(0, Math.min(1, 1 - this.cooldownLeft / Math.max(0.001, this.cooldown)))
        : 0;
    }

    // Cooldown: al vencer dispara el volley completo (dirigido/paralelas/
    // abanico — todas las balas salen en el mismo frame)
    this.cooldownLeft -= dt;
    if (this.cooldownLeft <= 0) {
      this.fire(enemies, game, dt);
      this.cooldownLeft = this.cooldown;
    }
    this._tickShot();
  }

  /**
   * fase 60 — relojes de ANIMACIÓN del rig: al disparar (o mientras el
   * haz está encendido) el cañón retrocede y la boca se queda caliente.
   * El decaimiento va al principio de update(); acá solo se encienden.
   * Es SOLO render: no altera el daño ni la cadencia.
   */
  _tickShot() {
    if (this.firing || this.active) {
      this._recoil = 1;
      this._heat = 1;
    }
  }

  /**
   * v4 4d/5 — Adquisición del Beam. El rayo apunta a la posición ACTUAL
   * del blanco (sin paneo). Si el blanco muere o escapa del alcance se
   * re-adquiere, y el ramp-up (_beamTime) se resetea cuando el blanco
   * cambia o se queda sin blanco.
   *
   * dev-7 fase 33: el Beam apunta al enemigo de MÁS VIDA (toughest): el
   * haz es un daño continuo y lo rinde mejor contra el duro (el blob, el
   * jefe) que contra la swarming. Sigue siendo STICKY (no cambia de blanco
   * hasta que muere o sale de alcance).
   *
   * dev-7 fase 34: el alcance es un ANCHO de 260 px a cada lado y TODO
   * el alto (las torres disparan hacia arriba sin límite de Y). Antes era
   * una ventana de ±80 px anclada a la X de la torre: el haz sólo se
   * activaba para lo que pasaba por su carril, y con eso el jugador lo
   * veía "limitado por un ángulo". Ahora el haz puede clavarse en
   * cualquier enemigo a 260 px de su columna, a cualquier altura y en
   * cualquier dirección (la lente sigue el ángulo real, helper
   * beamAimAngle). El daño al blanco sigue siendo el mismo (el rayo es
   * un foco), lo que cambia es a QUIÉN puede apuntar.
   *
   * fase 66: durante el COOLDOWN (beamCooldown) la adquisición está
   * BLOQUEADA: el haz apagado no se enciende aunque entre un enemigo nuevo
   * a la ventana con el cooldown a medias.
   */
    _updateBeamAcquire(enemies, game) {
      if ((this._beamCd ?? 0) > 0) {
        this._beamTarget = null;
        this.active = false;
        return;
      }
      const halfW = (this.data.columnHalfWidth ?? 260) * (game?.fortress?.detectMul ?? 1);

      const old = this._beamTarget;
      // Blanco vigente: vivo y DENTRO del ancho (si escapa → release)
      let tgt = (old && !old.dead && Math.abs(old.x - this.x) <= halfW)
        ? old : null;
      if (!tgt) {
        // Re-adquisición: el de MÁS VIDA dentro del ancho
        for (const e of enemies || []) {
          if (!e || e.dead) continue;
          if (Math.abs(e.x - this.x) > halfW) continue;
          if (!tgt || (e.hpDisplay ?? e.hp) > (tgt.hpDisplay ?? tgt.hp)) tgt = e;
        }
      }
      // Reset del ramp: blanco CAMBIÓ o no quedó blanco
      if (tgt !== old) this._beamTime = 0;
      this._beamTarget = tgt;
      this.active = !!tgt; // rayo encendido mientras persigue a alguien
    }

  /** Una bala del volley del Guardian (dirigida/paralela/abanico) con el
   *  daño efectivo de la torre, la penetración de Núcleos Perforantes y
   *  los perks sistemáticos del Guardian (fase 17: bounce/pierce/slow/…). */
  _spawnBullet(x, y, ang, game) {
    const pm = unitMods(this);
    game.engine.addEntity(new Bullet(x, y, ang, {
      damage: this.damage,                                  // nivel × cartas
      speed: this.bulletSpeedNow,                  // v5 5c/5: 920 × Balas Hipersónicas
      color: projectileColor(this.type),          // fase 29: azul del Guardian
      // OJO (fase 29): `radius` explícito para que el COLOR no mueva la
      // hitbox. `projectileRadius()` (js/enemies.js) elige el radio de
      // impacto por la PRESENCIA de `color` (con color → 4 px, sin color
      // → 6 px), y el constructor de Bullet pone `color` por defecto
      // (`bulletColor` de la tabla): el radio real de la bala del
      // Guardian siempre fue 4 px. Fijarlo aquí deja el valor explícito
      // para que ningún refactor FUTURE lo mueva por accidente (un
      // cambio de balance disfrazado de cambio visual).
      radius: 4,
      // dev-7 fase 32: el proyectil lleva su TIPO de daño (aquí el
      // Guardian es balístico). El multiplicador contra la familia del
      // enemigo se aplica en enemies.js (takeDamage).
      dmgType: this.data?.dmgType ?? 'ballistic',
      // fase 74.2: fuente para combos de marca (Marca de Riel / Enlace).
      source: 'guardian',
      // dev-7 fase 48: el Lv.5 del Guardian perfora +1 (la escalera de
      // niveles: 1..3 balas, Lv.4 multi-blanco, Lv.5 +1 perforación).
      pierce: (game?.fortress?.pierce ?? 0) + (pm.pierceCount ?? 0)
        + (this.level >= 5 ? 1 : 0),
      bounce: pm.bounceCount ?? 0,                  // fase 17: rebote
      slowOnHit: pm.slowOnHit ?? 0,
      stunChance: pm.stunChance ?? 0,
      ...onHitOpts(pm, game),
      critChance: pm.critChanceAdd ?? 0,
      critMul: pm.critDmgMul ?? 2,
    }));
    game.engine.spawnParticles(x, y, '#FFFFFF', 1, {
      speedMin: 10, speedMax: 30, gravity: 0, upBias: 40,
      lifeMin: 0.08, lifeMax: 0.15, sizeMin: 1, sizeMax: 2,
    });
  }

  /**
   * fase 73 — ENLACE DE CARGA del Thunderstroke. Mientras la torre acumula
   * el build-up, dibuja un rayo suave (y un anillo de lock) entre la boca
   * y el blanco actual. La intensidad sube con `_charge`; al disparar, el
   * rayo principal de `BoltFx` (mucho más grueso y brillante) y el anillo
   * de impacto toman el relevo. Es solo render: no toca daño ni cadencia.
   *
   * Se llama con el contexto ya trasladado a la torre y SIN la escala
   * visual (por eso `mx/my` llegan multiplicados por TOWER_VISUAL_SCALE).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} mx boca X en coordenadas de torre (unscaled)
   * @param {number} my boca Y en coordenadas de torre (unscaled)
   */
  _drawChargeLink(ctx, mx, my) {
    const tgt = this.targets?.[0];
    const charge = Math.max(0, Math.min(1, this._charge ?? 0));
    if (!tgt || tgt.dead || charge <= 0.01) return;
    // Solo en el BUILD-UP final: durante el cooldown inicial el enlace no
    // se dibuja. `cooldownLeft` se resetea al disparar, así que en el frame
    // del disparo desaparece y lo reemplaza el rayo principal de BoltFx.
    const left = Number.isFinite(this.cooldownLeft) ? this.cooldownLeft : THUNDER_LINK_WINDOW;
    if (left > THUNDER_LINK_WINDOW) return;
    const build = Math.max(0, Math.min(1, 1 - left / THUNDER_LINK_WINDOW));

    const tx = tgt.x - this.x;
    const ty = tgt.y - this.y;
    const dx = tx - mx;
    const dy = ty - my;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const t = this.game?.engine?._t ?? 0;
    const color = MUZZLE_ACCENT[this.data.kind] ?? this.data.accent;
    const core = this.data.coreColor ?? '#FFFFFF';
    const wobble = 2.5 + 4.5 * build;
    const steps = 7;
    const path = (c) => {
      c.beginPath();
      c.moveTo(mx, my);
      // Zigzag animado con envolvente: 0 en la boca y en el blanco para
      // que el enlace "nazca" de la torre y "clave" en el objetivo.
      for (let i = 1; i < steps; i++) {
        const f = i / steps;
        const env = Math.sin(f * Math.PI);
        const off = Math.sin(f * 9 + t * 12) * wobble * env;
        c.lineTo(mx + dx * f + nx * off, my + dy * f + ny * off);
      }
      c.lineTo(tx, ty);
    };

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // Halo suave.
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 + 10 * build;
    ctx.globalAlpha = 0.05 + 0.20 * build;
    ctx.lineWidth = 1.4 + 2.2 * build;
    path(ctx);
    ctx.stroke();
    // Núcleo casi blanco, más fino.
    ctx.shadowBlur = 0;
    ctx.strokeStyle = core;
    ctx.globalAlpha = 0.04 + 0.16 * build;
    ctx.lineWidth = 0.6 + 0.8 * build;
    path(ctx);
    ctx.stroke();
    // Anillo de LOCK: se cierra sobre el enemigo a medida que la carga
    // llega a 1 (radio target.r + 8 al final).
    const ringR = (tgt.r ?? 10) + 8 + (1 - build) * 14 + Math.sin(t * 6) * 1.5;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.globalAlpha = 0.06 + 0.22 * build;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(tx, ty, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * fase 60 — RENDER de la torre. Toda la geometría vive en el rig
   * (js/tower-art.js): acá solo se resuelven los ESTADOS del juego
   * (nivel, apuntado, carga, retroceso, calor, disparo) y se pintan el
   * fogonazo y el estado del pad.
   *
   * Lo que ya NO se hace acá (y por qué, ver el análisis de la fase):
   *   · El aura-burbuja: un disco de acento de r=32..42 ×1.2 detrás de
   *     cada torre (77..101 px de diámetro en 540 px de ancho). Con los
   *     slots a 55..125 px, los discos se solapaban y la fila se leía
   *     como pompas: la silueta de las 8 torres era el MISMO borrón.
   *   · El chasis en 'lighter' dibujado MÁS GRANDE que el cuerpo: sobre
   *     el cono del Beam asomaba un marco rectangular, como una puerta.
   *     Ahora va recortado dentro de la silueta y en 'overlay'.
   *   · El fogonazo en un (0,-52) fijo: el Missile y el Mortar lo
   *     dejaban flotando a 19 px de su cañón. Ahora sale del rig.hot.
   */
  render(ctx) {
    const d = this.data;
    // dev-7 fase 28: FIRMA VISUAL por torre — el color de BOCA propio
    // (MUZZLE_ACCENT) tiñe el elemento caliente y el fogonazo.
    const muzzle = MUZZLE_ACCENT[d.kind] ?? d.accent;
    const t = this.game?.engine?._t ?? 0;
    const aim = Number.isFinite(this._aim) ? this._aim : 0;
    const lv = this.level ?? 1;
    const rig = TOWER_RIGS[d.kind];

    ctx.save();
    ctx.translate(this.x, this.y);

    // dev-7 fase 29: ESCALA VISUAL (+20 %) de la silueta. Es solo de
    // render: no toca la tabla de stats, ni el daño, ni la cadencia, ni
    // la hitbox de los proyectiles.
    ctx.save();
    ctx.scale(TOWER_VISUAL_SCALE, TOWER_VISUAL_SCALE);

    // Pad + sombra + silueta + textura del chasis (recortada).
    renderTowerRig(ctx, {
      kind: d.kind,
      data: d,
      muzzle,
      lv,
      t,
      aim,
      charge: this._charge ?? 0,
      recoil: this._recoil ?? 0,
      sprites: TOWER_CHASSIS_SPRITES,
    });

    // ---- Boca: dónde sale el disparo (rig.hot) ----
    const [mx, my] = rigHotPoint(rig, aim);
    const hotR = rigHotRadius(rig);
    // Calor de boca: halo que se queda encendido y se apaga solo.
    const heat = this._heat ?? 0;
    if (heat > 0.02) {
      drawGlow(ctx, mx, my, hotR * (1.5 + 1.6 * heat), muzzle, 0.16 + 0.44 * heat);
    }

    if (this.firing || this.active) {
      const fk = 0.55 + 0.3 * Math.sin(t * 50); // flicker del fogonazo
      // Punto de poder en la boca
      ctx.fillStyle = muzzle;
      ctx.beginPath();
      ctx.arc(mx, my, hotR * 0.85, 0, Math.PI * 2);
      ctx.fill();
      // Estrella de 4 puntas (muzzle flash) centrada en la boca. El
      // tamaño crece MUY poco con el arma: un fogonazo proporcional al
      // radio de la boca (hotR/3.4 ≈ 1.9 en el Thunderstroke) tapaba
      // media torre y se comía justo el elemento que la identifica.
      const s = 0.6 + hotR * 0.06;
      ctx.globalAlpha = fk;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(mx, my - 8 * s); ctx.lineTo(mx + 3 * s, my - 1 * s); ctx.lineTo(mx + 9 * s, my - 2 * s);
      ctx.lineTo(mx + 4.5 * s, my + 2.5 * s); ctx.lineTo(mx + 7 * s, my + 9 * s); ctx.lineTo(mx, my + 5 * s);
      ctx.lineTo(mx - 7 * s, my + 9 * s); ctx.lineTo(mx - 4.5 * s, my + 2.5 * s); ctx.lineTo(mx - 9 * s, my - 2 * s);
      ctx.lineTo(mx - 3 * s, my - 1 * s);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if ((this._beamCd ?? 0) > 0) {
      // fase 66 — BEAM EN COOLDOWN: el emisor se ve APAGADO (gris tenue y
      // sin pulso, en vez del latido del reposo) para que el jugador
      // entienda por qué el haz dejó de pegar durante los 2,5 s de
      // enfriamiento. Sin rayo: `active` es false mientras dure.
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = BEAM_COOLDOWN_COLOR;
      ctx.beginPath();
      ctx.arc(mx, my, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      // Pulso de reposo (encendido latente, sin disparar) — con el color
      // de boca propio para que la torre sea identificable de un vistazo.
      ctx.globalAlpha = 0.55 + 0.3 * Math.sin(t * 3);
      ctx.fillStyle = muzzle;
      ctx.beginPath();
      ctx.arc(mx, my, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // dev-7 fase 29: REALCE de disparo — flash corto del color de acento,
    // dimensionado a la caja real de la silueta (antes era un disco fijo
    // de r=30 que en las torres altas se quedaba corto y en el Guardian
    // sobraba).
    if (this._flashT > 0) {
      const f = this._flashT / TOWER_FLASH_TIME; // 1 → 0
      const bb = rig?.bbox;
      const fx = bb ? bb.x + bb.w / 2 : 0;
      const fy = bb ? bb.y + bb.h / 2 : -24;
      const fr = bb ? Math.max(bb.w, bb.h) / 2 : 30;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 * f;
      ctx.fillStyle = d.accent;
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // Cierre de la escala visual (la silueta se dibuja un 20 % más grande).
    ctx.restore();

    // fase 73 — BUILD-UP del Thunderstroke: enlace suave torre → blanco
    // con anillo de lock. Se dibuja DESPUÉS del cuerpo (sale del orbe) y
    // antes de los enemigos (Fortress.render corre antes que las entidades),
    // así el rayo queda por debajo del enemigo y no lo tapa.
    if (d.kind === 'bolt') {
      this._drawChargeLink(ctx, mx * TOWER_VISUAL_SCALE, my * TOWER_VISUAL_SCALE);
    }

    // dev-7 fase 32 / fase 60 — GLIFO DEL TIPO DE DAÑO en el PAD. El
    // jugador tiene que ver "esta torre es eléctrica" para decidir contra
    // qué enemigo ponerla. Antes iba a 22 px por debajo de la torre,
    // sobre la plataforma, junto a los pips de nivel: se leía como un
    // código de barras. Ahora se estampa en la mitad delantera del pad,
    // en el mismo sitio donde antes estaba el nivel.
    const dmgT = DAMAGE_TYPES[d.dmgType];
    if (dmgT) {
      ctx.globalAlpha = 0.95;
      ctx.font = `${PAD_GLYPH.size}px "Share Tech Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Contorno oscuro: el glifo tiene que leerse sobre CUALQUIER fondo
      // (plataforma clara, niebla, planeta).
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(4, 8, 12, 0.85)';
      ctx.strokeText(dmgT.glyph, 0, TOWER_PAD.cy + PAD_GLYPH.y);
      ctx.fillStyle = dmgT.color;
      ctx.fillText(dmgT.glyph, 0, TOWER_PAD.cy + PAD_GLYPH.y);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
