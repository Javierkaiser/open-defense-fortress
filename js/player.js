// ============================================================
// player.js — clase Fortress (dev-2, §2.1/§5 dev-2)
// La base = "jugador": torres FIJAS sobre la plataforma (§6
// decisiones 1/2), NO hay nave móvil ni aliados controlables.
// Estética "silueta oscura + acento neón": la base se lee como una
// FORTALEZA — anillo de escudo SEGMENTADO (el HP se percibe de un
// vistazo), núcleo pulsante en el centro, número de HP con contorno
// oscuro y chispas de daño cuando está por caer. Cúpula facetada
// translúcida, invulnerabilidad post-hit 0.4 s, 5 slots de torre en
// 2 filas (5 frontales + 4 traseras para el arsenal, v3 3g/7).
// Recibe referencias por parámetro — jamás importa hud/cards/main.
// ============================================================

import { CONFIG, SCENE, clamp, rand, TOWER_BAY } from './engine.js';
import { Tower, TOWERS, Drone, MAX_DRONES, DRONES, BlackHoleFx, BLACK_HOLE } from './towers.js';
// fase 60: la caja del ENCAJE de los slots vacíos sale del pad de las
// torres (misma geometría para vacío y ocupado).
import { TOWER_PAD, TOWER_VISUAL_SCALE } from './tower-art.js';
import { applyProjectileHit } from './enemies.js';
import { healBase } from './base-heal.js';
import { createComboMods } from './combo-mods.js';
import {
  GLOBAL_DMG_MUL, GLOBAL_CAD_MUL, TYPE_DMG_MUL, HUNT_DMG_MUL,
} from './card-constants.js';

/**
 * fase 63 — Acento de una bahía LIBRE (el estado "acá podés construir").
 * Es el mismo para las 5: la bahía no promete qué torre va a recibir.
 */
const SLOT_FREE_ACCENT = '#7FD8FF';

/** Radio del anillo de escudo de la base (px). */
export const ARC_R = 46;
/** Segmentos en los que se divide el anillo de escudo. */
export const SHIELD_SEGMENTS = 12;
const SEG_LINE_W = 5;    // grosor del segmento (px)
const SEG_GAP_PX = 2.2;  // separación entre segmentos (px de arco)
const CORE_R = 6;        // radio del núcleo sólido de la base
const CORE_HALO_R = 44;  // radio máximo del halo del núcleo

/**
 * Paleta del escudo según el estado de la base. `color` es el acento
 * vivo (segmentos encendidos) y `dim` el de los segmentos rotos.
 */
export const SHIELD_TONES = {
  ok:   { color: '#35E08A', dim: 'rgba(53, 224, 138, 0.16)' },
  warn: { color: '#FFB36A', dim: 'rgba(255, 179, 106, 0.16)' },
  crit: { color: '#FF5A5A', dim: 'rgba(255, 90, 90, 0.18)' },
};

// ------------------------------------------------------------
// Helpers PUROS del visual de la base (testeables sin canvas).
// ------------------------------------------------------------

/**
 * Porcentaje de HP normalizado (0..1). Caso borde: maxHp <= 0 o
 * valores no finitos → 0 (NUNCA NaN, que rompería el render).
 * @param {number} hp HP actual
 * @param {number} maxHp HP máximo
 * @returns {number} 0..1
 */
export function hpFraction(hp, maxHp) {
  const max = Number.isFinite(maxHp) ? maxHp : 0;
  if (max <= 0) return 0;
  const cur = Number.isFinite(hp) ? hp : 0;
  return clamp(cur / max, 0, 1);
}

/**
 * Estado del escudo a partir del porcentaje de HP:
 * 'ok' (>=50 %), 'warn' (>=25 %) o 'crit' (<25 %, late).
 * @param {number} frac porcentaje 0..1
 * @returns {'ok'|'warn'|'crit'}
 */
export function shieldTone(frac) {
  const f = Number.isFinite(frac) ? frac : 0;
  if (f >= 0.5) return 'ok';
  if (f >= 0.25) return 'warn';
  return 'crit';
}

/**
 * Cuántos segmentos del anillo quedan VIVOS según el HP. El anillo se
 * vacía desde la derecha (queda encendida la izquierda, igual que el
 * arco continuo que había antes).
 * @param {number} hp HP actual
 * @param {number} maxHp HP máximo
 * @param {number} count cantidad de segmentos del anillo
 * @returns {number} 0..count
 */
export function shieldAliveCount(hp, maxHp, count = SHIELD_SEGMENTS) {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (n === 0) return 0;
  return Math.round(hpFraction(hp, maxHp) * n);
}

/**
 * Estado de cada segmento del anillo de escudo (Puro y testeable).
 * @param {number} hp HP actual
 * @param {number} maxHp HP máximo
 * @param {number} count cantidad de segmentos del anillo
 * @returns {boolean[]} `count` elementos; true = segmento vivo
 */
export function shieldSegments(hp, maxHp, count = SHIELD_SEGMENTS) {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const alive = shieldAliveCount(hp, maxHp, n);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = i < alive;
  return out;
}

// Ultimate "ORBITAL STRIKE" (§2.8): SOLO carga por kills (sin cooldown
// pasivo). 40 kills llenan el medidor; un boss suma cargas extra.
export const ULT_KILLS = 40;
export const ULT_BOSS_CHARGES = 15;
const ORBITAL = { count: 12, duration: 2.5, damage: 90, radius: 80 };

// BLACK HOLE (v4 4b/5): medidor 0..1 con la MISMA mecánica que el
// ultimate — SOLO kills. Mitad de costo que el orbital (es situacional):
// 20 kills llenan el vórtice; un boss suma cargas extra (≈ mitad).
export const BLACK_HOLE_KILLS = Math.round(ULT_KILLS / 2);          // 20
export const BLACK_HOLE_BOSS_CHARGES = Math.round(ULT_BOSS_CHARGES / 2); // 8

// balance v7: factor de daño aplicado DURANTE la invuln post-hit (0.4 s),
// que ahora es SOLO feedback visual (flash) — el golpe SIEMPRE entra. Está
// calibrado a 1.0 (sin reducción): el amortiguador de bombardeos simultáneos
// es el propio daño de la fuga, no esta ventana. Si en el futuro el tramo
// manual 1-5 se quisiera suavizar, bajar este factor en vez de volver a
// anular el golpe.
export const LEAK_INVULN_MULT = 1.0;

// fase 72 — LA FUGA DUELE EL HP MÁXIMO DEL ENEMIGO.
//
// La regla del 25 % (fase 59) mataba la base por un contador aunque le
// sobrara HP; además el golpe valía el HP restante, así que un enemigo
// casi muerto apenas dolía. Ahora `Enemy.update()` llama a
// `Fortress.takeDamage(leakDamageFor(this))`: la fuga cuesta la vida
// completa del tipo (una cría del divisor, su 35 %; un élite, su HP con
// variante) y la base cae por daño acumulado. Como la base vale ~20-34 %
// del HP total de la ola, la run se pierde al escapar ese porcentaje de
// enemigos, sin contador ni umbral binario.
//
// El jefe NUNCA llega a la base (lo clava `bossHoverY` en enemies.js), así
// que el peor caso es un enemigo normal con todo su HP.

export class Fortress {
  /**
   * @param {object} game Game de main.js (engine dentro) — solo referencia
   */
  constructor(game) {
    this.game = game;
    // §2.1: HP 3000 en Stage 1 (+500/stage en dev-5 vía BASE_HP_BY_STAGE)
    this.maxHp = 3000;
    this.hp = this.maxHp;
    this.invuln = 0;      // s restantes de invulnerabilidad post-hit (§2.1)
    this.flash = 0;       // alpha del destello del arco/cúpula al recibir hit
    this.ultCharge = 0;   // 0..1 — carga del ultimate por kills (dev-4, §2.8)
    this.ultReady = false;

    /**
     * Torres colocadas, indexadas por slot (null = libre). fase 61: hay
     * **5 slots en UNA sola fila** (CONFIG.SLOTS, y=CONFIG.TOWER_Y) y ese
     * número ES el tope de torres por partida: si no queda slot libre, una
     * torre nueva no puede entrar. El slot 2 (x=270) es el del Guardian.
     */
    this.slots = new Array(CONFIG.SLOTS.length).fill(null);

    /**
     * Tabla FIJA de los 5 slots (X, Y y acento de la torre que espera
     * cada ranura). Se calcula UNA vez en el constructor: el render
     * corre en cada frame y no puede crear objetos/tablas por frame.
     * @type {Array<{x:number,y:number,accent:string}>}
     */
    this._slotGeom = this._buildSlotGeom();

    /**
     * Chispas de daño de la base: búfer fijo (desplazamiento, fase y
     * velocidad precalculados) para no crear objetos por frame.
     * @type {Array<{dx:number,dy:number,phase:number,speed:number,r:number}>}
     */
    this._sparks = [
      { dx: -20, dy: -2, phase: 0.00, speed: 0.42, r: 1.5 },
      { dx: 16, dy: -14, phase: 0.35, speed: 0.30, r: 1.2 },
      { dx: 5, dy: 1, phase: 0.68, speed: 0.50, r: 1.1 },
      { dx: -8, dy: 8, phase: 0.12, speed: 0.38, r: 1.3 },
    ];

    /**
     * Cuántos slots hay (5). fase 61: con una sola fila, este número ES
     * el tope de torres por partida (ver `slots`).
     */
    this._frontCount = CONFIG.SLOTS.length;

    // Mejoras por CARTAS (cards.js v3-1/7): estado de modificadores.
    this.pierce = 0;          // Núcleos Perforantes: atravesamientos extra
    this.detectMul = 1;       // Sensores Ampliados: ancho/rango ×mul
    this.xpMul = 1;           // Acelerador de Energía: XP ×mul
    this.scoreMul = 1;        // Prima de Combate: score ×mul
    this.streakShields = 0;   // Escudo de Racha: golpes bloqueados restantes
    this.orbitalDmgMul = 1;   // Impacto Orbital+: daño del ultimate ×mul
    // Arsenal extendido (v3-3/7, §2.3):
    this.drones = [];         // máx MAX_DRONES (§2.3, fase 61: 1)
    // Black Hole (v4 4b/5): medidor 0..1 por kills como el ultimate
    // (NO más contador de usos). El vórtice consume el medidor completo.
    // dev-7 fase 12 (pedido del usuario): antes cargaba desde el arranque
    // de la partida sin que el jugador hiciera nada; ahora arranca
    // BLOQUEADO y solo se desbloquea al elegir la carta 'black_hole' —
    // desde ahí queda disponible el resto de la partida (ver cards.js).
    this.blackHoleUnlocked = false;
    this.blackHoleCharge = 0;
    this.bhReady = false;     // medidor lleno → botón [B] habilitado
    // fase 74: mods de las cartas de Black Hole (por instancia, no se
    // muta la constante BLACK_HOLE compartida).
    this.blackHoleMods = { durationAdd: 0, radiusMul: 1, endBurst: 0, singularity: 0, drain: 0 };
    this._miniBhCd = 0;
    // fase 74: stacks GLOBALES de cartas (dmg_all/cadence_up/tipo/caza).
    // Se guardan acá para que las unidades desbloqueadas DESPUÉS hereden
    // el buff (antes solo se aplicaba a las unidades presentes).
    this.dmgAllStacks = 0;
    this.cadAllStacks = 0;
    this.typeStacks = {};
    this.huntStacks = {};
    // fase 74.2: flags de COMBOS (frío, sustain, marcas, etc.).
    // fase 75: schema único en combo-mods.js (antes estaba duplicado acá
    // y en cards.js; un combo nuevo exigía tocar los dos sitios).
    this.comboMods = createComboMods();
    // Contadores de aplicaciones para caps de cartas repetibles:
    this.detectApps = 0;
    this.xpBoostApps = 0;
    this.scoreGainApps = 0;
    this.streakShieldApps = 0;
    this.orbitalPowerApps = 0;

    /**
     * Lista VIVA de enemigos (la setea main.js; WaveManager en dev-3).
     * Vacía hasta dev-3: todas las torres toleran [].
     * @type {Array}
     */
    this.enemies = [];

    // Ultimate (dev-4, §2.8): carga SOLO por kills — sin cooldown pasivo.
    this._orbitalTimer = 0;   // s restantes de la lluvia activa
    this._spawnedOrbitals = 0;
    // fase 75: el engine dibuja tantas bahías como la Fortress activa.
    // Una run nueva sin Arsenal vuelve a 5; `dropLastSlot` baja a 4.
    this.game?.engine?.setDeckSlotCount?.(this._frontCount);
  }

  /** Número de bahías activas (Arsenal puede dejar 4). */
  get slotCount() { return this._frontCount; }

  /**
   * Coloca una torre en un slot libre.
   *
   * fase 63 — NINGUNA TORRE TIENE LUGAR PREDETERMINADO: sin `slot` explícito
   * cae en el primer lugar libre, sea cual sea. Antes cada tipo tenía un
   * slot canónico (el Beam siempre contra el borde derecho, el Missile a la
   * izquierda…) heredado del diseño de referencia, y con un arsenal
   * libre eso era una promesa falsa: el jugador veía la torre aparecer
   * siempre en el mismo sitio. La ÚNICA excepción es el Guardian, que
   * arranca en el centro porque `main.js` lo pide EXPLÍCITO con `slot`.
   *
   * Devuelve null si no queda ningún slot — ESE es el tope de 5 torres por
   * partida.
   */
  addTower(type, slot = undefined) {
    if (!TOWERS[type]) return null;
    let target = null;
    if (typeof slot === 'number') target = slot;          // colocación forzada
    else target = this._firstFreeSlot();
    if (target === null || target < 0 || target >= this.slots.length) return null;
    if (this.slots[target]) return null; // ocupado
    const t = new Tower(type, this._slotX(target), 1, this._slotY(target));
    t.slotIndex = target;
    this.slots[target] = t;
    this.applyGlobalCardMods(t);
    return t;
  }

  /**
   * fase 74 — Aplica a una unidad RECIÉN creada los stacks globales de
   * cartas elegidos antes de su desbloqueo. Sin esto, `dmg_all`,
   * `cadence_up`, las cartas de tipo y `hunt_*` no llegaban a las torres
   * que entraban después.
   */
  applyGlobalCardMods(unit) {
    if (!unit) return unit;
    const dmgStacks = this.dmgAllStacks ?? 0;
    if (dmgStacks > 0) {
      unit.dmgMul = (unit.dmgMul ?? 1) * Math.pow(GLOBAL_DMG_MUL, dmgStacks);
      unit.dmgAllApps = Math.max(unit.dmgAllApps ?? 0, dmgStacks);
    }
    const cadStacks = this.cadAllStacks ?? 0;
    if (cadStacks > 0) {
      unit.cadMul = (unit.cadMul ?? 1) * Math.pow(GLOBAL_CAD_MUL, cadStacks);
      unit.cadApps = Math.max(unit.cadApps ?? 0, cadStacks);
    }
    const type = unit?.data?.dmgType
      ?? TOWERS[unit?.type]?.dmgType
      ?? DRONES[unit?.type]?.dmgType;
    const typeStacks = this.typeStacks?.[type] ?? 0;
    if (typeStacks > 0) unit.dmgMul = (unit.dmgMul ?? 1) * Math.pow(TYPE_DMG_MUL, typeStacks);
    for (const [family, stacks] of Object.entries(this.huntStacks ?? {})) {
      if (!stacks) continue;
      const key = `fam${family[0].toUpperCase()}${family.slice(1)}Mul`;
      unit.cardMods ??= {};
      unit.cardMods[key] = (unit.cardMods[key] ?? 1) * Math.pow(HUNT_DMG_MUL, stacks);
    }
    return unit;
  }

  /**
   * Tabla FIJA de los slots (una sola fila): X, Y y el acento del estado
   * LIBRE de la bahía. Se calcula una sola vez (constructor) porque el
   * render dibuja en cada frame; `dropLastSlot` la reconstruye con una
   * ranura menos (fase 69: condición Arsenal).
   *
   * @param {number} [count] cuántos slots construir (default: todos)
   * @returns {Array<{x:number,y:number,accent:string}>}
   */
  _buildSlotGeom(count = CONFIG.SLOTS.length) {
    // fase 63: TODAS las bahías libres comparten el mismo acento. Antes cada
    // slot llevaba el color de la torre que "le tocaba" (herencia de los
    // slots canónicos): con colocación libre eso era una pista falsa —el
    // slot violeta no es "el del Tesla"—, así que el acento ahora dice una
    // sola cosa: ACÁ PODÉS CONSTRUIR.
    const n = Math.max(0, Math.min(CONFIG.SLOTS.length, Math.trunc(count) || 0));
    const geom = new Array(n);
    for (let i = 0; i < n; i++) {
      geom[i] = {
        x: CONFIG.SLOTS[i],
        y: CONFIG.TOWER_Y,
        accent: SLOT_FREE_ACCENT,
      };
    }
    return geom;
  }

  /** X del slot i. */
  _slotX(i) {
    return this._slotGeom[i].x;
  }

  /** Y del slot i. */
  _slotY(i) {
    return this._slotGeom[i].y;
  }

  /**
   * fase 75 — Recoloca la fila tras un relayout (resize/rotación).
   *
   * `CONFIG.TOWER_Y` ya cambió cuando llega `layout:changed`; hay que
   * reconstruir `_slotGeom` y mover las torres existentes. Antes el deck
   * bajaba pero las torres se quedaban en la Y vieja.
   */
  relayout() {
    this._slotGeom = this._buildSlotGeom(this._frontCount);
    for (let i = 0; i < this._frontCount; i++) {
      const t = this.slots[i];
      if (t) t.y = this._slotGeom[i].y;
    }
  }

  /**
   * Primer slot libre. fase 61: con una sola fila, este es el ÚNICO
   * repartidor de lugares — y el tope de 5 torres sale de acá.
   */
  _firstFreeSlot() {
    for (let i = 0; i < this._frontCount; i++) {
      if (!this.slots[i]) return i;
    }
    return null;
  }

  /**
   * fase 69 — condición Arsenal: quita la ÚLTIMA ranura de la fila (la del
   * borde derecho) antes de que el jugador construya. Se llama desde
   * `startStage` ANTES de colocar al Guardian y sólo si la base está
   * vacía: en mitad de una run las torres ya están encajadas en sus slots
   * y `_slotGeom` no puede encogerse bajo sus pies.
   *
   * Mantiene `slots`, `_slotGeom` y `_frontCount` coherentes (el render y
   * `_firstFreeSlot` recorren esos tres y quedarían desfasados si sólo se
   * tocara uno). Nunca deja la base sin ninguna ranura.
   *
   * @returns {boolean} true si se quitó el slot
   */
  dropLastSlot() {
    if (this._frontCount <= 1) return false;
    if (this.slots[this._frontCount - 1]) return false; // la última está ocupada
    this._frontCount -= 1;
    this.slots.pop();
    this._slotGeom = this._buildSlotGeom(this._frontCount);
    // fase 75: que el deck deje de dibujar la bahía recortada.
    this.game?.engine?.setDeckSlotCount?.(this._frontCount);
    return true;
  }

  // ---------- Arsenal extendido: drones + Black Hole (v3-3/7, §2.3) ----------

  /**
   * Añade un dron orbital si hay cupo (MÁXIMO MAX_DRONES simultáneos,
   * §2.3). Devuelve el dron o null si no hay lugar.
   */
  addDrone(type, game = this.game) {
    if (!DRONES[type] || this.drones.length >= MAX_DRONES) return null;
    const d = new Drone(type, game, this.drones.length);
    this.drones.push(d);
    this.applyGlobalCardMods(d);
    return d;
  }

  /**
   * BLACK HOLE (v4 4b/5): consume el MEDIDOR completo (0..1, carga por
   * kills) y suelta un vórtice de 4 s en una X aleatoria que succiona
   * enemigos (10 dmg/s). El vórtice queda IGUAL (§2.3).
   * @returns {boolean} false sin medidor lleno o fuera de partida
   */
  fireBlackHole(game = this.game) {
    if (!this.canFireBlackHole() || !game?.engine) return false;
    this.blackHoleCharge = 0;
    this.bhReady = false;
    const mods = this.blackHoleMods ?? {};
    const fx = new BlackHoleFx(game, { // X aleatoria §2.3
      duration: BLACK_HOLE.duration + (mods.durationAdd ?? 0),
      radius: BLACK_HOLE.radius * (mods.radiusMul ?? 1),
      endBurst: mods.endBurst ?? 0,
      drain: mods.drain ?? 0,
    });
    game.engine.addEntity(fx);
    game.engine.emit('blackhole:fired', { ready: false });
    return true;
  }

  /**
   * fase 74 — Mini agujero negro de la carta Singularidad. Se dispara
   * desde las explosiones de Missile/Mortar/Balas Detonantes. Tiene un
   * cooldown interno para que una salva de 3 misiles no llene la pantalla.
   */
  spawnMiniBlackHole(x, y, game = this.game) {
    if (!this.blackHoleUnlocked) return null;
    if (!(this.blackHoleMods?.singularity > 0)) return null;
    if ((this._miniBhCd ?? 0) > 0) return null;
    if (!game?.engine) return null;
    this._miniBhCd = 2;
    const fx = new BlackHoleFx(game, {
      x, y, duration: 1.2, radius: 80, dps: 15, pull: 120, mini: true,
    });
    game.engine.addEntity(fx);
    return fx;
  }

  /** ¿El medidor está lleno y disponible? (HUD muestra LISTO) — dev-7
   *  fase 12: además exige haber elegido la carta de desbloqueo. */
  canFireBlackHole() {
    return this.blackHoleUnlocked && this.bhReady && this.blackHoleCharge >= 1 && !this._blackHoleActive();
  }

  /**
   * Suma carga al medidor por kill (v4 4b/5, MISMO flujo que el
   * ultimate). `charges` en kills (boss suma BLACK_HOLE_BOSS_CHARGES).
   * Emite 'blackhole:ready' al completar el medidor. dev-7 fase 12: no
   * acumula nada hasta desbloquearlo (ver cards.js 'black_hole') — antes
   * cargaba de fondo toda la partida aunque el jugador nunca lo pidiera.
   * @param {number} charges kills equivalentes
   */
  chargeBlackHole(charges = 1) {
    if (!this.blackHoleUnlocked || this.blackHoleCharge >= 1 || charges <= 0) return;
    const wasReady = this.bhReady;
    this.blackHoleCharge = clamp(this.blackHoleCharge + charges / BLACK_HOLE_KILLS, 0, 1);
    if (!wasReady && this.blackHoleCharge >= 1) {
      this.bhReady = true;
      this.game?.audio?.sfx('ult_ready');
      this.game?.engine?.emit('blackhole:ready');
    }
  }

  _blackHoleActive() {
    return !!this.game?.engine?.entities?.some(
      (e) => e instanceof BlackHoleFx && !e.dead && !e.mini,
    );
  }

  /**
   * Daño de un enemigo que llega a la base (§2.1): lo calcula
   * `stages.leakDamageFor(enemy)` = HP MÁXIMO del bicho (fase 72), no el
   * que le quedaba. balance v7: la invuln post-hit 0.4 s ya NO anula el
   * golpe — un clúster de leaks no regala golpes gratis. El invuln/flash
   * queda como feedback visual. Con cargas de ESCUDO DE RACHA (carta
   * streak_shield): bloquea el golpe completo, consume una carga y NO
   * rompe la racha (emite base:blocked).
   *
   * fase 72: SIN contador de fugas. La base es la ÚNICA condición de
   * derrota; el daño acumulado de las fugas la tumba al escaparse ~20-34 %
   * de la ola (según etapa/composición). El robo de vida puede compensar
   * parte de ese daño, pero no resucita una base en 0.
   */
  takeDamage(amount) {
    // fase 75: `NaN <= 0` es false, así que un solo NaN dejaba el HP en
    // NaN y la base quedaba inmortal. Tampoco se cobra daño a una base
    // ya destruida (evita base:damaged/base:destroyed repetidos).
    if (!Number.isFinite(amount) || amount <= 0) return false;
    if (!(this.hp > 0)) return false;
    // fase 69 — condición Asedio: cada fuga duele más (`leakMul`). Es el
    // ÚNICO punto de daño de fuga, así que el multiplicador entra antes
    // del redondeo y de la ventana de invuln. Un `leakMul` no finito se
    // ignora: un NaN dejaría el hp en NaN y la base sería inmortal.
    const rawLeakMul = this.game?.runMods?.leakMul ?? 1;
    const leakMul = Number.isFinite(rawLeakMul) ? rawLeakMul : 1;
    // La invuln post-hit ya no anula el golpe (cada leak paga su HP
    // restante) con el factor LEAK_INVULN_MULT durante la ventana de 0.4 s.
    const total = Math.round(amount * leakMul * (this.invuln > 0 ? LEAK_INVULN_MULT : 1));
    if (this.streakShields > 0) {
      this.streakShields -= 1;
      this.invuln = 0.4;
      this.flash = 1;
      this.game?.engine?.emit('base:blocked', {
        shieldsLeft: this.streakShields,
        blocked: total, // daño REAL que se estaba por aplicar
      });
      return true;
    }
    this.hp = Math.max(0, this.hp - total);
    this.invuln = 0.4;
    this.flash = 1;
    // v3 3j/7 (BUG-R1): el payload ahora incluye amount REAL — main.js
    // muestreaba `-${amount}` con undefined (float "-undefined").
    this.game?.engine?.emit('base:damaged', {
      amount: total,
      hp: this.hp,
      maxHp: this.maxHp,
    });
    if (this.hp <= 0) {
      this.game?.engine?.emit('base:destroyed', { hp: 0 });
    }
    return true;
  }

  // ---------- Ultimate: ORBITAL STRIKE (dev-4, §2.8/D9) ----------

  /**
   * Suma cargas de ultimate por kill. `charges` en kills (boss suma
   * ULT_BOSS_CHARGES). Emite 'ultimate:ready' al completarse.
   * @param {number} charges kills equivalentes
   */
  chargeUltimate(charges = 1) {
    if (this.ultCharge >= 1 || charges <= 0) return;
    const wasReady = this.ultReady;
    this.ultCharge = clamp(this.ultCharge + charges / ULT_KILLS, 0, 1);
    if (!wasReady && this.ultCharge >= 1) {
      this.ultReady = true;
      this.game?.audio?.sfx('ult_ready');
      this.game?.engine?.emit('ultimate:ready');
    }
  }

  /** ¿Puede dispararse ahora? (carga completa y sin lluvia activa). */
  canFireUltimate() {
    return this.ultReady && this.ultCharge >= 1;
  }

  /**
   * ORBITAL STRIKE: programa 12 impactos durante 2.5 s en X aleatorias,
   * 90 de daño en r=80 cada uno + shake/flash. Reinicia la carga.
   * @returns {boolean} false si no estaba lista
   */
  fireUltimate(game = this.game) {
    if (!this.canFireUltimate()) return false;
    this.ultReady = false;
    this.ultCharge = 0;
    this._orbitalTimer = ORBITAL.duration;
    this._spawnedOrbitals = 0;
    const eng = game?.engine;
    eng?.emit('ultimate:fired', {});
    eng?.shake(6, 500);
    eng?.addEffect({ life: 0.5, draw: (ctx, t) => { // flash blanco global
      ctx.save();
      ctx.globalAlpha = t * 0.35;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-20, -20, CONFIG.CANVAS_W + 40, CONFIG.CANVAS_H + 40);
      ctx.restore();
    } });
    // Onda expansiva dorada desde la base (dev-6, D9): shockwave + ráfaga
    // de partículas que hacen sentir el ultimate como una liberación.
    const bx = CONFIG.BASE_X;
    const by = SCENE.BASE_ARC_Y;
    eng?.addEffect({ life: 0.7, draw: (ctx, t) => {
      ctx.save();
      ctx.globalAlpha = t * 0.9;
      ctx.strokeStyle = '#FFD24A';
      ctx.shadowColor = '#FFD24A';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 4 + 6 * (1 - t);
      ctx.beginPath();
      ctx.arc(bx, by, 30 + (1 - t) * 250, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } });
    eng?.spawnParticles(bx, by, '#FFD24A', 26, {
      speedMin: 120, speedMax: 380, gravity: -20,
      lifeMin: 0.4, lifeMax: 0.9, sizeMin: 2, sizeMax: 5,
    });
    eng?.spawnParticles(bx, by, '#FFFFFF', 14, {
      speedMin: 80, speedMax: 230, lifeMin: 0.2, lifeMax: 0.5, sizeMin: 1, sizeMax: 3,
    });
    return true;
  }

  /** Tick de la lluvia orbital: spawnea impactos programados y los aplica. */
  _updateOrbital(dt, enemies) {
    if (this._orbitalTimer <= 0) return;
    this._orbitalTimer -= dt;
    // Impacto k ocurre al cruzar t_k = D·k/N (k=0 ya, el último a ~2.29 s)
    while (this._spawnedOrbitals < ORBITAL.count
      && this._orbitalTimer <= ORBITAL.duration
        * ((ORBITAL.count - this._spawnedOrbitals) / ORBITAL.count)) {
      const x = rand(50, CONFIG.CANVAS_W - 50);
      const strike = { x };
      this._spawnedOrbitals += 1;
      // Impacto: explosión + daño en área inmediato (§2.8)
      const eng = this.game?.engine;
      if (eng) {
        eng.spawnParticles(x, rand(120, 420), '#FFD24A', 16, {
          speedMin: 60, speedMax: 240, lifeMin: 0.3, lifeMax: 0.7,
          sizeMin: 2, sizeMax: 5,
        });
        eng.shake(3, 180);
        eng.addEffect({ life: 0.35, draw: (ctx, t) => {
          ctx.save();
          ctx.globalAlpha = t * 0.85;
          ctx.strokeStyle = '#FFD24A';
          ctx.shadowColor = '#FFD24A';
          ctx.shadowBlur = 14;
          ctx.lineWidth = 3;
          ctx.beginPath(); // columna del rayo orbital + anillo de impacto
          ctx.moveTo(strike.x, 30);
          ctx.lineTo(strike.x, 300 + (1 - t) * 140);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(strike.x, 330 + (1 - t) * 110, ORBITAL.radius * (1.15 - t * 0.55), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } });
      }
      applyProjectileHit(
        { x: strike.x, y: 340,
          damage: ORBITAL.damage * (this.orbitalDmgMul ?? 1),
          splashR: ORBITAL.radius, dead: false },
        Array.isArray(enemies) ? enemies : [],
        ORBITAL.radius,
      );
    }
  }

  update(dt, enemies = this.enemies) {
    if (dt > 0) {
      if (this.invuln > 0) this.invuln -= dt;
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.5);
      if (this._miniBhCd > 0) this._miniBhCd = Math.max(0, this._miniBhCd - dt);
      // fase 74.2 — Transfusión: los enemigos envenenados por Mosquitos
      // regeneran escudo, con tope de 5 HP/s.
      const poisonRegen = this.comboMods?.poisonRegen ?? 0;
      if (poisonRegen > 0 && Number.isFinite(this.hp) && this.hp > 0) {
        let poisoned = 0;
        for (const e of enemies || []) {
          if (e && !e.dead && (e.poisonT ?? 0) > 0) poisoned += 1;
        }
        if (poisoned > 0) {
          // fase 75: misma guarda de no-resurrección que el robo de vida
          // y el drenaje del Black Hole.
          healBase(this.game, Math.min(5, poisoned * poisonRegen) * dt);
        }
      }
      this._updateOrbital(dt, enemies);
    }
    for (const t of this.slots) {
      if (t) t.update(dt, enemies, this.game);
    }
    // Drones del arsenal extendido (§2.3): efectos orbitales por frame
    if (dt > 0) {
      for (const d of this.drones) d.update(dt, enemies);
    }
  }

  render(ctx) {
    const clock = this._now();
    this._renderDome(ctx);
    this._renderCore(ctx, clock);
    this._renderShield(ctx, clock);
    this._renderDamageSparks(ctx, clock);
    this._renderEmptySlots(ctx, clock);
    // Drones DETRÁS de las torres: la burbuja del campo de fuerza queda
    // bajo el HUD de la plataforma y no tapa siluetas.
    for (const d of this.drones) d.draw(ctx);
    for (const t of this.slots) {
      if (t) t.render(ctx);
    }
  }

  /**
   * Reloj de animación: el tiempo real del engine si existe; si no
   * (tests en Node, sin engine) el reloj de performance.
   * @returns {number} segundos
   */
  _now() {
    const et = this.game?.engine?._t;
    return Number.isFinite(et) ? et : performance.now() / 1000;
  }

  /**
   * Porcentaje de HP de la fortaleza (0..1, nunca NaN).
   * @returns {number}
   */
  _hpFrac() {
    return hpFraction(this.hp, this.maxHp);
  }

  /**
   * Estado de los segmentos del anillo según el HP ACTUAL de la
   * fortaleza (misma fuente que usa el render — ver shieldSegments).
   * @returns {boolean[]} true = segmento vivo
   */
  shieldSegmentState() {
    return shieldSegments(this.hp, this.maxHp, SHIELD_SEGMENTS);
  }

  /**
   * ENCAJE de las ranuras vacías: 4 esquinas en L (marca de registro) en
   * el acento de la torre que espera ese slot + un "+" tenue en el
   * centro. Con el slot OCUPADO no se dibuja nada (la torre ya está).
   * Se lee como "aquí se puede construir" en vez de una mancha gris.
   *
   * fase 60: la caja de las L sale de `TOWER_PAD` (js/tower-art.js) — la
   * MISMA geometría que el pad que dibuja la torre al ocupar el slot,
   * así la transición vacío→ocupado no es un salto de lenguaje (antes el
   * encaje medía 32×13 y el pad 40×16, en dos sitios distintos).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} t reloj en segundos
   */
  _renderEmptySlots(ctx, t) {
    const b = TOWER_BAY;
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i]) continue;          // ocupado → la torre se dibuja
      const g = this._slotGeom[i];
      if (!g) continue;
      const x = g.x;
      const y = g.y;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + i * 1.1);
      // fase 62: el estado "libre" se pega a la BAHÍA del deck (su octágono
      // y su tira de estado), no a una caja suelta flotando encima. El
      // pulso es lento y suave: la bahía está disponible, no gritando.
      const hw = b.halfW;
      const yTop = y + b.top;
      const yBot = y + b.bottom;
      const ch = b.chamfer;
      const arm = 7;      // largo del brazo de la abrazadera
      ctx.save();
      ctx.strokeStyle = g.accent;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 0.30 + 0.34 * pulse;
      // Abrazaderas de esquina: siguen el CHAFLÁN del octágono, así el
      // marco libre y la bahía son la misma pieza.
      ctx.beginPath();
      ctx.moveTo(x - hw + ch, yTop + arm);
      ctx.lineTo(x - hw + ch, yTop);
      ctx.lineTo(x - hw + ch + arm, yTop);
      ctx.moveTo(x + hw - ch - arm, yTop);
      ctx.lineTo(x + hw - ch, yTop);
      ctx.lineTo(x + hw - ch, yTop + arm);
      ctx.moveTo(x - hw + ch, yBot - arm);
      ctx.lineTo(x - hw + ch, yBot);
      ctx.lineTo(x - hw + ch + arm, yBot);
      ctx.moveTo(x + hw - ch - arm, yBot);
      ctx.lineTo(x + hw - ch, yBot);
      ctx.lineTo(x + hw - ch, yBot - arm);
      ctx.stroke();
      // Tira de estado: el hueco que dejó el deck, encendido con el acento
      // de la ranura. Es la señal de "acá podés construir" más barata de
      // leer a 1×.
      ctx.globalAlpha = 0.30 + 0.55 * pulse;
      ctx.fillStyle = g.accent;
      ctx.fillRect(x - b.railHalfW + 2, y + b.railY + 1.5, b.railHalfW * 2 - 4, 1.6);
      // "+" de construcción, centrado en el plato
      ctx.globalAlpha = 0.40 + 0.35 * pulse;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 2);
      ctx.lineTo(x + 5, y - 2);
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x, y + 3);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Cúpula facetada translúcida cian (§2.1): triángulos alpha 0.05–0.1. */
  _renderDome(ctx) {
    const cx = CONFIG.BASE_X;
    const baseY = CONFIG.TOWER_Y - 6;
    const r = ARC_R + 26;
    ctx.save();
    ctx.globalAlpha = 0.05 + this.flash * 0.12;
    ctx.fillStyle = '#35C8FF';
    const facets = 7;
    for (let i = 0; i < facets; i++) {
      const a0 = Math.PI + (Math.PI * i) / facets;
      const a1 = Math.PI + (Math.PI * (i + 1)) / facets;
      ctx.beginPath();
      ctx.moveTo(cx, baseY);
      ctx.lineTo(cx + Math.cos(a0) * r, baseY + Math.sin(a0) * r);
      ctx.lineTo(cx + Math.cos(a1) * r, baseY + Math.sin(a1) * r);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * NÚCLEO de la base: halo + punto luminoso en el centro del anillo
   * (CONFIG.BASE_X / SCENE.BASE_ARC_Y). Pulso MUY lento (respiración de
   * la fortaleza) y color según el estado del escudo. El halo es
   * SUTIL (alpha acumulado ~0.15–0.30) y su radio máximo (44 px) deja
   * libre a las torres de la fila frontal, que arrancan en y≈774: el
   * núcleo no las tapa.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} t reloj en segundos
   */
  _renderCore(ctx, t) {
    const x = CONFIG.BASE_X;
    const y = SCENE.BASE_ARC_Y;
    const tone = SHIELD_TONES[shieldTone(this._hpFrac())];
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.1);   // ciclo de ~5.7 s
    const halo = CORE_HALO_R * (0.82 + 0.18 * pulse);
    const alpha = 0.15 + 0.13 * pulse;

    ctx.save();
    // Halo por capas concéntricas (sin gradiente → sin crear objetos
    // por frame en el hot path).
    ctx.fillStyle = tone.color;
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = alpha * (0.10 + 0.14 * i);
      ctx.beginPath();
      ctx.arc(x, y, halo * (1 - i * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }
    // Núcleo sólido + chispa blanca en el centro
    ctx.globalAlpha = 0.55 + 0.30 * pulse;
    ctx.shadowColor = tone.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = tone.color;
    ctx.beginPath();
    ctx.arc(x, y, CORE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x, y, CORE_R * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Anillo de escudo SEGMENTADO: el HP ya no es un arco continuo sino
   * SHIELD_SEGMENTS barras repartidas sobre los 180° del anillo. Las
   * barras se apagan desde la derecha (queda encendida la izquierda,
   * como el arco de antes) y el color cambia con el estado: verde
   * (>=50 %), ámbar (>=25 %) y rojo (<25 %, con latido lento).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} t reloj en segundos
   */
  _renderShield(ctx, t) {
    const x = CONFIG.BASE_X;
    const y = SCENE.BASE_ARC_Y;
    const frac = this._hpFrac();
    const tone = SHIELD_TONES[shieldTone(frac)];
    const alive = shieldAliveCount(this.hp, this.maxHp, SHIELD_SEGMENTS);
    const step = Math.PI / SHIELD_SEGMENTS;              // el arco cubre 180°
    // Hueco entre barras: la mitad del grosor (capas redondeadas) + el
    // respiro pedido, para que los segmentos nunca se toquen.
    const inset = (SEG_GAP_PX * 0.5 + SEG_LINE_W * 0.5) / ARC_R;

    ctx.save();
    ctx.lineCap = 'round';

    // Segmentos ROTOS: apagados, sin brillo (la parte ya perdida).
    if (alive < SHIELD_SEGMENTS) {
      ctx.strokeStyle = tone.dim;
      ctx.shadowBlur = 0;
      ctx.lineWidth = SEG_LINE_W * 0.8;
      ctx.beginPath();
      for (let i = alive; i < SHIELD_SEGMENTS; i++) {
        this._segPath(ctx, x, y, i, step, inset);
      }
      ctx.stroke();
    }

    // Segmentos VIVOS: color del estado + glow. En 'crit' laten.
    if (alive > 0) {
      ctx.globalAlpha = frac < 0.25 ? 0.55 + 0.45 * Math.sin(t * 3.2) : 1;
      ctx.strokeStyle = tone.color;
      ctx.shadowColor = tone.color;
      ctx.shadowBlur = 10;
      ctx.lineWidth = SEG_LINE_W;
      ctx.beginPath();
      for (let i = 0; i < alive; i++) {
        this._segPath(ctx, x, y, i, step, inset);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Flash blanco al recibir hit (§2.1)
    if (this.flash > 0 && (this.invuln > 0)) {
      ctx.globalAlpha = this.flash * 0.9;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = SEG_LINE_W + 1;
      ctx.beginPath();
      ctx.arc(x, y, ARC_R, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    this._renderHpText(ctx, x, y, tone);
    ctx.restore();
  }

  /**
   * Añade al path actual el segmento `i` del anillo (arco con hueco).
   * @param {CanvasRenderingContext2D} ctx
   */
  _segPath(ctx, x, y, i, step, inset) {
    const a0 = Math.PI + i * step + inset;
    const a1 = Math.PI + (i + 1) * step - inset;
    if (a1 <= a0) return;
    ctx.moveTo(x + Math.cos(a0) * ARC_R, y + Math.sin(a0) * ARC_R);
    ctx.arc(x, y, ARC_R, a0, a1);
  }

  /**
   * Número de HP: contorno oscuro (como los floats de daño del engine)
   * para que se lea sobre cualquier fondo + color según el estado del
   * escudo. Va dentro del hueco del anillo, sobre el núcleo.
   * @param {CanvasRenderingContext2D} ctx
   */
  _renderHpText(ctx, x, y, tone) {
    const txt = String(Math.ceil(this.hp));
    ctx.save();
    ctx.font = "15px 'Share Tech Mono', monospace";
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(2, 8, 6, 0.92)';
    ctx.strokeText(txt, x, y - 26);
    ctx.shadowColor = tone.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = tone.color;
    ctx.fillText(txt, x, y - 26);
    ctx.restore();
  }

  /**
   * Chispas de daño de la base: solo aparecen cuando el HP baja del
   * 50 % (3 chispas) o del 25 % (4 chispas). Son muy tenues (alpha
   * <= 0.5) y salen de un búfer fijo calculado en el constructor (no
   * se crea nada por frame).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} t reloj en segundos
   */
  _renderDamageSparks(ctx, t) {
    const frac = this._hpFrac();
    if (frac >= 0.5) return;
    const n = frac < 0.25 ? 4 : 3;
    const color = frac < 0.25 ? '#FF5A5A' : '#FFB36A';
    const x = CONFIG.BASE_X;
    const y = SCENE.BASE_ARC_Y;
    ctx.save();
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const s = this._sparks[i];
      const p = (t * s.speed + s.phase) % 1;      // 0..1
      ctx.globalAlpha = 0.5 * (1 - p) * (1 - p);
      ctx.beginPath();
      ctx.arc(x + s.dx, y + s.dy - p * 20, s.r * (1 - p * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
