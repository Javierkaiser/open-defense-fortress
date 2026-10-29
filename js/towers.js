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
import {
  TOWERS, DRONES, WASPS, FIREWHEEL, MAX_TOWER_LEVEL,
} from './towers-data.js';
export { TOWERS, DRONES, WASPS, FIREWHEEL, MAX_TOWER_LEVEL };
import { applyStun, rollCrit, tryFreeze } from './combat-crit.js';
import { applyProjectileHit, applyPoison, applySlow, applyMark, hasMark } from './enemies.js';
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
import { unitMods, hurtP, applyExplosionCombo } from './towers-core.js';
import {
  TARGETING, TRAVERSE, TRAVERSE_AIM, targetingFor, targetInRange,
  pickByPolicy, beamAimAngle, traverseAim, beamGradient, detectWidth,
  guardianLeadAim,
} from './towers-targeting.js';
import { Bullet, MortarShell, HomingMissile } from './towers-projectiles.js';
import { BLACK_HOLE, BlackHoleFx, CraterFx, LaserStaticFx, BeamFx, BoltFx } from './towers-fx.js';
import { MAX_DRONES, Drone, forcefieldBubbleR } from './towers-drones.js';
import { onMechanicHit, onMechanicTick } from './tower-mechanics.js';
export {
  unitMods, hurtP, applyExplosionCombo, TARGETING, TRAVERSE, TRAVERSE_AIM,
  targetingFor, targetInRange, pickByPolicy, beamAimAngle, traverseAim,
  beamGradient, detectWidth, guardianLeadAim, Bullet, MortarShell,
  HomingMissile, BLACK_HOLE, BlackHoleFx, CraterFx, LaserStaticFx, BeamFx, BoltFx,
  MAX_DRONES, Drone, forcefieldBubbleR,
};

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
;

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

// v4 4d/5 — el Beam YA NO barre un pilar horizontal: el rayo es un
// SEGMENTO dirigido base → enemigo, redibujado cada frame con ramp-up
// de daño (ver Tower._updateBeamAcquire + fire() case 'beam').

// ------------------------------------------------------------
// Proyectiles
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// BLACK HOLE (§2.3): carta ACTIVA de un uso. Vórtice de 4 s en X
// aleatoria que SUCCIONA enemigos hacia el punto + 10 dmg/s.
// Es entidad del engine ({update(dt), dead}) y Fortress la dispara.
// ------------------------------------------------------------
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
          const cm = game?.fortress?.comboMods;
          let n = 1 + (unitMods(this).extraCount ?? 0);
          // Sincronía de Asedio: el Misil suma un misil por cada enemigo
          // marcado `siege` por el cráter del Mortar (máx. +2).
          if (cm?.siegeSync) {
            const marked = (enemies || []).filter((e) => e && !e.dead && hasMark(e, 'siege')).length;
            n += Math.min(2, marked);
          }
          // dev-7 fase 33: los N blancos son STICKY (no cambian hasta que
          // se destruyen) y se eligen por la política de la torre (el más
          // avanzado). Antes se re-elegían los N más avanzados en cada
          // andanada.
          const targets = this._acquireTargets(enemies, game, n);
          if (!targets.length) targets.push(null); // respaldo: sale igual (histórico)
          const mpm = unitMods(this); // fase 17: sistemáticos del Penetrador
          const execBase = Math.max(mpm.executeThreshold ?? 0, d.mech?.threshold ?? 0);
          for (const tg of targets) {
            // Golpe de Gracia: contra un blanco con Juicio el umbral de
            // remate del Misil sube a 30 %, no es un +X% de daño.
            const exec = cm?.coup && hasMark(tg, 'judgment')
              ? Math.max(execBase, 0.30)
              : execBase;
            game.engine.addEntity(new HomingMissile(
              this.x, top, tg, game, this.damage,
              { homing: mpm.homingStrength ?? 0,
                slowOnHit: mpm.slowOnHit ?? 0,
                stunChance: mpm.stunChance ?? 0,
                ...onHitOpts(mpm, game),
                // Identidad del Misil: umbral de ejecución INTRÍNSECO (6 %)
                // que los perks/cartas suben. El resto del arsenal ya no
                // tiene executeThreshold (test-tower-identity lo verifica).
                executeThreshold: exec,
                source: 'missile',
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
          const combo = game?.fortress?.comboMods;
          const rampPerSec = (d.beamRampPerSec ?? 0.8) + (bm.beamRampPerSecAdd ?? 0);
          // Bucle de Prisma: el Láser encendido sostiene el foco y sube el tope.
          const rampMax = (d.beamRampMax ?? 4.5) + (combo?.prismLoop ? 0.5 : 0);
          const ramp = clamp(1 + this._beamTime * rampPerSec, 1, rampMax);
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
          // Identidad del Beam: Fusión. El foco sostenido acumula `melt`
          // (máx. 3 stacks; +4 % de daño por stack sobre el blanco).
          onMechanicTick('beam', tgt, game, { dt, unit: this, mods: bm });
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
        const cm = game?.fortress?.comboMods;
        const primary = this._acquireTargets(enemies, game, 1)[0] ?? null;
        if (primary) {
          const accent = MUZZLE_ACCENT[d.kind] ?? d.accent;
          const colors = { color: accent, core: d.coreColor ?? '#FFFFFF' };
          // Punto de impacto CONGELADO: los FX no deben seguir al enemigo
          // durante su vida (el rayo y el anillo son instantáneos).
          const impact = { x: primary.x, y: primary.y };
          const areaR = d.areaR ?? 130;
          const areaDmg = Math.round(this.damage * (d.areaFrac ?? 0.5));
          // Combos de control: Sobrecarga (Tesla+Thunder) y Tormenta de
          // Riel (Gauss+Thunder) agrandan el estallido. El de riel CONSUME
          // la marca: la sinergia pide prepared el blanco con el Gauss.
          // Sobrecarga: el área extra sólo se abre si el racimo ya está
          // ionizado por la Tesla (la sinergia pide preparar el blanco).
          let areaBonus = (cm?.overload && hasMark(primary, 'ion')) ? 2 : 0;
          let stunBonus = 0;
          if (cm?.railstorm && hasMark(primary, 'rail')) {
            primary.marks.rail = 0;
            areaBonus += 2;
            stunBonus += 0.35;
          }
          const maxArea = Math.min(
            THUNDER_AREA_MAX,
            Math.max(0, (d.areaTargets ?? 3) + (ptm.areaTargetsAdd ?? 0) + areaBonus),
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
            const dur = base + (ptm.stunDurationAdd ?? 0);
            applyStun(e, dur);
            if ((ptm.stunChance ?? 0) > 0 && Math.random() < ptm.stunChance) {
              applyStun(e, 0.5 + (ptm.stunDurationAdd ?? 0));
            }
          };

          // 3) Daño pleno al principal + estallido a los vecinos.
          // fase 74.2 — Juicio Final: si el principal está aturdido, el
          // Thunderstroke pega +30% y alarga el stun +0,1 s.
          const judged = !!(cm?.judgment && (primary.stun ?? 0) > 0);
          const mainDmg = judged ? Math.round(this.damage * 1.3) : this.damage;
          hurtP(primary, mainDmg, 'bolt', ptm, game, enemies);
          stunHit(primary, (d.stun ?? 0) + (judged ? 0.1 : 0) + stunBonus);
          // Identidad del Thunderstroke: Juicio. El stun marca al enemigo
          // (2 s) y el próximo rayo eléctrico le hace +15 %.
          onMechanicHit('thunderstroke', primary, game, { dmg: mainDmg, mods: ptm });
          for (const { e } of area) {
            if (e.dead) continue;
            hurtP(e, areaDmg, 'bolt', ptm, game, enemies);
            stunHit(e, d.areaStun ?? 0);
            onMechanicHit('thunderstroke', e, game, { dmg: areaDmg, mods: ptm });
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
        const cm = game?.fortress?.comboMods;
        // Sobrecarga: la Tesla gana un eslabón extra cuando comparte build
        // con el Thunderstroke (la sinergia es de conducción, no de daño).
        const n = (d.jumps + (pem.extraCount ?? 0)) * (1 + (pem.chainFork ?? 0))
          + (cm?.overload ? 1 : 0);
        const chainRadius = TESLA_CHAIN_RADIUS + (pem.chainRangeAdd ?? 0);
        const primary = this._acquireTargets(enemies, game, 1)[0] ?? null;
        const inRange = primary ? [primary] : [];
        // Sin blanco principal no hay cadena (el bucle necesita un nodo).
        while (inRange.length && inRange.length < Math.max(1, n)) {
          const last = inRange[inRange.length - 1];
          let next = null;
          let bestD = chainRadius;
          for (const e of enemies || []) {
            if (!e || e.dead || inRange.includes(e)) continue;
            const dd = dist(e.x, e.y, last.x, last.y);
            // Cadena de Burbuja: lo atrapado por el Campo de Fuerza es
            // siempre alcanzable, sin importar la distancia al eslabón.
            if (cm?.bubbleChain && hasMark(e, 'bubble')) { next = e; break; }
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
            // Identidad de la Tesla: Ionización. Cada eslabón deja `ion`
            // (2 s); el racimo marcado recibe +10 % de daño eléctrico.
            onMechanicHit('tesla', e, game, { dmg: Math.round(dmg), mods: pem });
            // Arco del Guardian: la cadena carga al enemigo para que la
            // próxima bala del Guardian lo detone.
            if (cm?.arcGuard) applyMark(e, 'charged', 2);
            // La burbuja conduce sin pérdida; el resto cae ×0.75.
            if (!(cm?.bubbleChain && hasMark(e, 'bubble'))) dmg *= d.falloff;
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
        let mt = this.findTarget(enemies, game);
        // Asedio Lento: con ≥2 enemigos dentro de la burbuja, el Mortar
        // apunta al CENTRO de la burbuja (cambia la selección de blanco).
        const mortarCombo = game?.fortress?.comboMods;
        if (mortarCombo?.slowSiege) {
          const atrapados = (enemies || []).filter((e) => e && !e.dead && hasMark(e, 'bubble'));
          if (atrapados.length >= 2) {
            const ax = atrapados.reduce((s, e) => s + e.x, 0) / atrapados.length;
            const ay = atrapados.reduce((s, e) => s + e.y, 0) / atrapados.length;
            mt = { x: ax, y: ay, r: 0 };
          }
        }
        if (mt) {
          // v6 perk (mortar): +15% de radio de explosión por cada 10 niveles
          const mm = unitMods(this);
          const blastR = d.blastR * (mm.areaMul ?? 1);
          game.engine.addEntity(new MortarShell(this.x, top, mt, game, this.damage, blastR, {
            ...onHitOpts(mm, game),
            slowOnHit: mm.slowOnHit ?? 0,
            stunChance: mm.stunChance ?? 0,
            critChance: mm.critChanceAdd ?? 0,
            critMul: mm.critDmgMul ?? 2,
            // Identidad del Mortar: el impacto deja un CRÁTER de 3 s que
            // quema y frena; los perks alargan/refuerzan esa zona. Va en un
            // objeto propio porque pickOnHit() filtra los mods de impacto.
            crater: {
              dps: (d.mech?.dps ?? 8) + (mm.craterDpsAdd ?? 0),
              time: (d.mech?.duration ?? 3) + (mm.craterTimeAdd ?? 0),
              slow: d.mech?.slow ?? 0.10,
              radius: blastR,
            },
          }));
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
      // Reset del ramp: blanco CAMBIÓ o no quedó blanco. Bucle de Prisma:
      // mientras un Láser esté encendido, el Beam conserva el foco al
      // re-adquirir (la sinergia es de sostén, no de daño).
      const prismLoop = game?.fortress?.comboMods?.prismLoop
        && (game?.engine?.entities ?? []).some((e) => e instanceof LaserStaticFx && !e.dead);
      if (tgt !== old && !prismLoop) this._beamTime = 0;
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
