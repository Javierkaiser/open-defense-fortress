// =============================================================================
// towers-drones.js — drones orbitales
// =============================================================================

import { CONFIG, dist, rand } from './engine.js';
import { DRONES, WASPS, FIREWHEEL } from './towers-data.js';
import { metaDmgMul, metaSlowFrac, perkDmgFor, META_SLOW_CAP } from './meta.js';
import { applyPoison, applySlow, applyMark } from './enemies.js';
import { unitMods, hurtP } from './towers-core.js';
import { healBase } from './base-heal.js';

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
;

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


