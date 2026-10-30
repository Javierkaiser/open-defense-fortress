// =============================================================================
// towers-fx.js — Black Hole, Láser, Beam y Bolt
// =============================================================================

import { CONFIG, clamp, dist, rand } from './engine.js';
import { TOWERS } from './towers-data.js';
import { closestPointOnSegment, pointSegmentDistance, withAlpha } from './geometry.js';
import { applyProjectileHit } from './enemies.js';
import { applyMark, applyPoison, applySlow } from './enemies-status.js';
import { perkMods } from './meta.js';
import { healBase } from './base-heal.js';
import { hurt, hurtP, applyExplosionCombo } from './towers-core.js';
import { beamGradient } from './towers-targeting.js';
import { onMechanicHit } from './tower-mechanics.js';

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
  constructor(game, x, top, aim, damagePerSec, d = TOWERS.laser, mods = null, colors = null) {
    this.game = game;
    this.x = x; this.y = top;
    // `aim` no finito (o ausente) → vertical: el rayo, su hitbox y su
    // dibujo usan SIEMPRE este ángulo saneado (fase 66).
    this.aim = Number.isFinite(aim) ? aim : 0;
    this.dps = damagePerSec;              // getter de la torre (nivel × cartas × meta)
    this.mods = mods ?? null;             // mods de la torre (perks + cartas)
    this.life = (d.laserDuration ?? 3.2) + (mods?.laserDurationAdd ?? 0);
    this.len = laserLengthToEdge(this.x, this.y, this.aim);
    this.color = colors?.laser ?? d.beamColor ?? '#9DFF3C';
    this.core = colors?.core ?? d.coreColor ?? '#E8FFE8';
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
      // Identidad del Láser: Corte. Cada tick del rayo marca al enemigo
      // (+8 % de daño de cualquier fuente) sin ramp ni ejecución.
      onMechanicHit('laser', e, this.game, { dmg: this.dps * dt, mods: lpm });
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
/**
 * Cráter del Mortar: zona persistente que quema y frena. Es una entidad del
 * engine (update/draw/dead) para que el área siga existiendo aunque el obús
 * ya haya detonado y entren enemigos nuevos.
 */
export class CraterFx {
  constructor(game, x, y, opts = {}) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.radius = opts.radius ?? TOWERS.mortar.blastR;
    this.dps = opts.dps ?? TOWERS.mortar.mech?.dps ?? 8;
    this.life = opts.life ?? TOWERS.mortar.mech?.duration ?? 3;
    this.slow = opts.slow ?? TOWERS.mortar.mech?.slow ?? 0.10;
    this.mods = opts.mods ?? null;
    this.t = 0;
    this.dead = false;
    this._acc = 0;
    this.color = opts.color ?? TOWERS.mortar.accent;
  }

  update(dt) {
    if (dt <= 0 || this.dead) return;
    this.t += dt;
    if (this.t >= this.life) { this.dead = true; return; }
    this._acc += dt;
    const step = 0.25;
    if (this._acc < step) return;
    const window = this._acc;
    this._acc = 0;
    const list = this.game?.fortress?.enemies;
    if (!Array.isArray(list)) return;
    const cm = this.game?.fortress?.comboMods;
    const inside = [];
    for (const e of list) {
      if (!e || e.dead) continue;
      if (dist(e.x, e.y, this.x, this.y) <= this.radius + (e.r ?? 10)) {
        inside.push(e);
        hurtP(e, this.dps * window, 'blast', this.mods, this.game, list);
        if (this.slow > 0) applySlow(e, this.slow, 1, 'crater');
        // Sincronía de Asedio: el cráter marca para que el Misil sume
        // proyectiles contra los marcados.
        if (cm?.siegeSync) applyMark(e, 'siege', 2);
      }
    }
    // Concha de Veneno: si hay un envenenado dentro, el cráter convierte
    // la zona en una nube que sostiene el veneno en todos los atrapados.
    if (cm?.venomShell && inside.length) {
      const fuente = inside.find((e) => (e.poisonDps ?? 0) > 0);
      if (fuente) {
        for (const e of inside) {
          applyPoison(e, Math.max(1, Math.round(fuente.poisonDps * 0.5)), 2, 'poison');
        }
      }
    }
  }

  draw(ctx) {
    const k = Math.max(0, 1 - this.t / Math.max(0.001, this.life)); // 1 → 0
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6.5);
    const R = this.radius;
    ctx.save();

    // 1) Terreno chamuscado: relleno suave para no tapar a los enemigos.
    ctx.globalAlpha = 0.10 + 0.08 * k;
    ctx.fillStyle = '#1A0D06';
    ctx.beginPath();
    ctx.arc(this.x, this.y, R, 0, Math.PI * 2);
    ctx.fill();

    // 2) Halo cálido pegado al borde: es lo que hace que el área "brille"
    // sobre el fondo oscuro sin convertir el cráter en un disco opaco.
    if (typeof ctx.createRadialGradient === 'function') {
      const g = ctx.createRadialGradient(this.x, this.y, R * 0.55, this.x, this.y, R);
      g.addColorStop(0, 'rgba(255, 150, 60, 0)');
      g.addColorStop(0.78, `rgba(255, 140, 45, ${0.10 + 0.08 * pulse})`);
      g.addColorStop(1, 'rgba(255, 190, 80, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // 3) Anillo EXTERIOR sólido: marca exactamente el radio que hace daño.
    ctx.globalAlpha = 0.60 + 0.30 * k;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2.8;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(this.x, this.y, R * (0.96 + 0.035 * pulse), 0, Math.PI * 2);
    ctx.stroke();

    // 4) Anillo interior punteado que gira: lee como "zona activa".
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.32 + 0.25 * k;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([5, 8]);
    ctx.lineDashOffset = -this.t * 18;
    ctx.beginPath();
    ctx.arc(this.x, this.y, R * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // 5) Brasas: 5 motas deterministas por frame (sin estado extra).
    ctx.globalAlpha = 0.55 * k;
    ctx.fillStyle = '#FFD24A';
    for (let i = 0; i < 5; i++) {
      const a = this.t * 1.2 + i * 1.7;
      const rr = R * (0.22 + 0.58 * ((i + 1) / 5));
      ctx.beginPath();
      ctx.arc(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export class BeamFx {
  constructor(game, x, top, tx, ty, extra = 0, ramp = 1, colors = null) {
    this.x = x; this.y = top; this.tx = tx; this.ty = ty;
    this.extra = extra;
    this.ramp = Number.isFinite(ramp) ? Math.max(1, ramp) : 1;
    this.color = colors?.beam ?? TOWERS.beam.beamColor;
    this.core = colors?.core ?? TOWERS.beam.coreColor;
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
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10 + 4 * (this.ramp - 1); // fase 66: el glow crece con el foco
    ctx.fillStyle = beamGradient(ctx, this.x, this.y, this.tx, this.ty, this.color);
    ctx.beginPath();
    ctx.moveTo(this.x + nx * h0, this.y + ny * h0);
    ctx.lineTo(this.x - nx * h0, this.y - ny * h0);
    ctx.lineTo(this.tx - nx * h1, this.ty - ny * h1);
    ctx.lineTo(this.tx + nx * h1, this.ty + ny * h1);
    ctx.closePath();
    ctx.fill();
    // Núcleo claro de 1 px en el centro del haz (energía concentrada)
    ctx.shadowBlur = 6;
    ctx.strokeStyle = beamGradient(ctx, this.x, this.y, this.tx, this.ty, this.core);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.tx, this.ty); ctx.stroke();
    // Orbe encendido en la boca (crece un poco con el foco del ramp)
    ctx.fillStyle = this.core;
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
export class BoltFx {
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

