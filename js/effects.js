// ============================================================
// effects.js — módulo de efectos (v3 4/7, BUG-006/BUG-007)
// DESIGN §1.1 lo reserva para "explosiones, rayos, fireworks,
// screen flash". Las explosiones y rayos ya viven maduros en
// enemies.js/towers.js: moverlos rompería tests y smoke — aquí
// vive lo que FALTABA:
//   · MultiKillWatcher (D6): 3+ kills en 0.5 s → FIREWORKS
//     dorados + SFX 'firework' (campana).
//   · EnergyOrb (BUG-009/D12): orbe de energía del cristal rojo
//     que cae, se recoge cerca de la base y aplica su bonus
//     XP/score con float "+N".
//   · starburst() (estética): destello estrella blanco-azul
//     del impacto de la captura.
// Recibe referencias por parámetro — jamás importa hud/cards/main.
// ============================================================

import { CONFIG, SCENE } from './engine.js';
import { rand } from './engine.js';

const MULTIKILL_WINDOW = 0.5; // s (D6: 3+ kills en medio segundo)
const MULTIKILL_NEEDED = 3;
/**
 * Y de recogida del orbe (se recoge al rozar la base).
 * FASE 58: DINÁMICA (baja con el alto lógico del marco): era una
 * `const` de módulo y se habría quedado en el layout viejo.
 */
function orbPickupY() { return CONFIG.TOWER_Y - 60; }

// ------------------------------------------------------------
// D6 — Fireworks dorados por multi-kill
// ------------------------------------------------------------

/**
 * Reloj de kills: `feed()` marca un kill AHORA; al acumular
 * MULTIKILL_NEEDED dentro de la ventana dispara el firework UNA vez
 * y reinicia el contador (rachas largas → una salva por cada 3).
 */
export class MultiKillWatcher {
  constructor(engine) {
    this.engine = engine;
    this._times = []; // timestamps (performance.now/1000) de los últimos kills
  }

  /** Registra un kill en el instante actual. */
  feed(at = performance.now() / 1000) {
    const t0 = at - MULTIKILL_WINDOW;
    while (this._times.length && this._times[0] < t0) this._times.shift();
    this._times.push(at);
    if (this._times.length >= MULTIKILL_NEEDED) {
      this._times.length = 0; // una salva por ventana: sin spam
      return true;
    }
    return false;
  }

  reset() { this._times.length = 0; }
}

/** ¿Punto visible dentro del canvas (con margen)? */
function onScreen(x, y, m = 30) {
  return x >= -m && x <= CONFIG.CANVAS_W + m && y >= -m && y <= CONFIG.CANVAS_H + m;
}

/**
 * FIREWORKS dorados (D6): salva radial de chispas + cohetes ascendentes
 * con gravedad + anillo expansivo + texto "¡MULTI-KILL!". Usa SOLO el
 * presupuesto de partículas del engine (MAX_PARTICLES 400, FIFO).
 */
export function spawnGoldenFireworks(engine, x = CONFIG.BASE_X, y = 300) {
  if (!engine) return;

  // Salva radial principal (dorado cálido + blanco)
  engine.spawnParticles(x, y, '#FFD24A', 26, {
    speedMin: 90, speedMax: 320, gravity: 110,
    lifeMin: 0.5, lifeMax: 1.1, sizeMin: 1.5, sizeMax: 3.4,
  });
  engine.spawnParticles(x, y, '#FFF3C4', 14, {
    speedMin: 50, speedMax: 220, gravity: 80,
    lifeMin: 0.35, lifeMax: 0.8, sizeMin: 1, sizeMax: 2.6,
  });
  // Cohetes secundarios: explotan en mini-salvas al caer
  for (let i = 0; i < 3; i++) {
    const tx = Math.max(40, Math.min(CONFIG.CANVAS_W - 40, x + rand(-130, 130)));
    const ty = y + rand(-70, 60);
    engine.spawnParticles(tx, ty, '#FFDD55', 10, {
      speedMin: 40, speedMax: 170, gravity: 120,
      lifeMin: 0.45, lifeMax: 0.9, sizeMin: 1.2, sizeMax: 2.8,
    });
    engine.addEffect({ life: 0.35, draw: (ctx, t) => {
      ctx.save();
      ctx.globalAlpha = t * 0.9;
      ctx.strokeStyle = '#FFD24A';
      ctx.shadowColor = '#FFD24A';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); // anillo expansivo del cohete secundario
      ctx.arc(tx, ty, 10 + (1 - t) * 55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } });
  }
  // Anillo central grande
  engine.addEffect({ life: 0.5, draw: (ctx, t) => {
    ctx.save();
    ctx.globalAlpha = t * 0.85;
    ctx.strokeStyle = '#FFD24A';
    ctx.shadowColor = '#FFD24A';
    ctx.shadowBlur = 20;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(x, y, 16 + (1 - t) * 130, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } });
  engine.floatText(x, y - 46, '¡MULTI-KILL!', '#FFD24A');
  // dev-7 fase 1: par de destellos sprite reales encima del anillo procedural
  spawnSparkleSprite(engine, x, y, { size: 60, life: 0.45 });
  spawnSparkleSprite(engine, x + rand(-30, 30), y + rand(-20, 20), { size: 38, life: 0.35 });
}

// ------------------------------------------------------------
// BUG-009 / D12 — Orbe de energía del CRISTAL ROJO
// ------------------------------------------------------------

/**
 * Entidad del engine ({update(dt), draw(ctx), dead}): nace donde murió
 * el cristal, CAE hacia la base con leve vaivén, brilla pulsante, y al
 * llegar a la zona de la base SE RECOGE: aplica el bonus REAL
 * (xpMul × dropXpBonusFrac sobre el score base del cristal), suma score
 * y lanza float "+N" verde-energía. Sin tocar stats ni balance: usa los
 * mismos números que ya aplicaba _onKill().
 */
export class EnergyOrb {
  /**
   * @param {object} game Game con {engine, fortress, score, ...}
   * @param {number} x X de origen (muerte del cristal)
   * @param {number} y Y de origen
   * @param {number} value puntos de energía a entregar
   */
  constructor(game, x, y, value) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.vy = 30;            // caída lenta, recogible a simple vista
    this.phase = rand(0, Math.PI * 2);
    this.t = 0;
    this.value = value;
    this.dead = false;
    this.collected = false;
  }

  update(dt) {
    if (dt <= 0 || this.dead) return;
    this.t += dt;
    this.y += this.vy * dt;
    this.x += Math.sin(this.t * 3 + this.phase) * 22 * dt; // vaivén suave
    // Estela tenue (presupuesto compartido, 1 partícula cada ~80 ms)
    this._trailAcc = (this._trailAcc ?? 0) + dt;
    if (this._trailAcc >= 0.08) {
      this._trailAcc = 0;
      this.game?.engine?.spawnParticles(this.x, this.y, '#7FFFD0', 1, {
        speedMin: 4, speedMax: 18, gravity: -10,
        lifeMin: 0.25, lifeMax: 0.5, sizeMin: 1, sizeMax: 2.2,
      });
    }
    // Recolección al rozar la línea de la base (§2.1)
    if (this.y >= orbPickupY()) this._collect();
  }

  _collect() {
    if (this.collected) return;
    this.collected = true;
    this.dead = true;
    const eng = this.game?.engine;
    const g = this.game;
    // Bonus REAL: mismo número que aplicaba _onKill (fracción del base
    // escalada por xpMul). Score sube igual (la energía ES score §2.7).
    const bonus = Math.max(1, Math.round(
      this.value * (g?.fortress?.xpMul ?? 1),
    ));
    if (g && typeof g.score === 'number') g.score += bonus;
    eng?.floatText(this.x, Math.min(this.y, orbPickupY()) - 14, `+${bonus}`, '#35E0C8');
    eng?.spawnParticles(this.x, orbPickupY(), '#35E0C8', 8, {
      speedMin: 30, speedMax: 120, gravity: -40,
      lifeMin: 0.25, lifeMax: 0.55, sizeMin: 1, sizeMax: 2.4,
    });
    eng?.addEffect({ life: 0.3, draw: (ctx, t) => { // anillo de recogida
      ctx.save();
      ctx.globalAlpha = t * 0.9;
      ctx.strokeStyle = '#35E0C8';
      ctx.shadowColor = '#35E0C8';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, orbPickupY(), 6 + (1 - t) * 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } });
    eng?.emit('orb:collected', { value: bonus }); // audio en main.js
  }

  draw(ctx) {
    const r = 6.5 + Math.sin(this.t * 6 + this.phase) * 1.2; // pulso
    ctx.save();
    // Halo exterior verde-energía
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r * 2.6);
    halo.addColorStop(0, 'rgba(127, 255, 208, 0.75)');
    halo.addColorStop(0.55, 'rgba(53, 224, 200, 0.28)');
    halo.addColorStop(1, 'rgba(53, 224, 200, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    // Núcleo blanco-verdoso brillante
    ctx.fillStyle = '#EAFFF6';
    ctx.shadowColor = '#35E0C8';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Suelta el orbe del cristal (BUG-009). El valor entregado replica el
 * bonus que _onKill() ya sumaba: baseScore × dropXpBonusFrac.
 * NO toca gameplay: es visual + el mismo número de siempre.
 */
export function dropEnergyOrb(game, enemy, baseValue) {
  if (!game?.engine || !enemy) return null;
  const frac = enemy.data?.dropXpBonusFrac ?? 0;
  if (!(frac > 0)) return null; // solo tipos con drop (cristal)
  const orb = new EnergyOrb(game, enemy.x, enemy.y,
    Math.max(1, Math.round(baseValue * frac)));
  game.engine.addEntity(orb);
  return orb;
}

// ------------------------------------------------------------
// Estética — destello "estrella" del impacto (captura, arriba-izq)
// ------------------------------------------------------------

/**
 * Starburst blanco-azul: cruz de destellos + halo, como la explosión
 * de impacto visible en reference-stage1.jpg. Barato (solo draw).
 */
export function starburst(engine, x, y, scale = 1) {
  if (!engine || !onScreen(x, y)) return;
  engine.addEffect({ life: 0.22, draw: (ctx, t) => {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = t * 0.95;
    ctx.translate(x, y);
    const R = scale * (14 + (1 - t) * 26);
    // Halo difuso
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    g.addColorStop(0.4, 'rgba(159, 224, 255, 0.45)');
    g.addColorStop(1, 'rgba(120, 180, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    // Cruz de picos (rotada 45°) — la "estrella" de la captura
    ctx.strokeStyle = 'rgba(235, 248, 255, 0.95)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 4) + (Math.PI / 2) * i;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 0.25, Math.sin(a) * R * 0.25);
      ctx.lineTo(Math.cos(a) * R * 1.15, Math.sin(a) * R * 1.15);
      ctx.stroke();
    }
    ctx.restore();
  } });
}

// ------------------------------------------------------------
// dev-7 fase 1 — Sprites reales (assets/ descargados el 2026-08-25,
// ver docs/ASSETS.md). PURO AÑADIDO: se dibuja ENCIMA del juice
// procedural existente (explode(), starburst(), fireworks), nunca lo
// reemplaza ni toca sus parámetros de balance. Carga perezosa y
// tolerante a fallos: si un sprite no cargó, el frame simplemente no
// dibuja nada (jamás rompe el loop, igual que los demás fx de arriba).
// ------------------------------------------------------------

const _spriteCache = {};
function _sprite(src) {
  let entry = _spriteCache[src];
  if (!entry) {
    // Node/tests no tienen Image: el sprite queda "no listo" y el draw
    // sale sin dibujar (antes lanzaba ReferenceError).
    if (typeof Image === 'undefined') {
      entry = { img: null, ready: false };
      _spriteCache[src] = entry;
      return entry;
    }
    const img = new Image();
    entry = { img, ready: false };
    img.onload = () => { entry.ready = true; };
    img.src = src;
    _spriteCache[src] = entry;
  }
  return entry;
}

const EXPLOSION_SHEET = 'assets/sprites/explosions/explosion_sheet_50frames.png';
const SPARKLE_SPRITE = 'assets/sprites/particles/particle_star_01.png';
const EXPLOSION_COLS = 10;
const EXPLOSION_FRAMES = 50;
const EXPLOSION_FW = 100;
const EXPLOSION_FH = 100;

/**
 * Explosión de BOSS con sprite real (spritesheet CC0 de 50 frames) —
 * se suma a la explosión procedural que ya dispara enemy.explode() en
 * enemies.js (esa NO se toca). Solo para muertes de jefe: es un momento
 * puntual del juego, no algo que se repita cientos de veces por partida.
 */
export function spawnSpriteBossExplosion(engine, x, y, scale = 3.4) {
  if (!engine) return;
  const sheet = _sprite(EXPLOSION_SHEET);
  const life = 0.9;
  engine.addEffect({
    life,
    draw(ctx, t) {
      if (!sheet.ready) return;
      const age = life * (1 - t);
      let frame = Math.floor((age / life) * EXPLOSION_FRAMES);
      if (frame >= EXPLOSION_FRAMES) frame = EXPLOSION_FRAMES - 1;
      if (frame < 0) return;
      const col = frame % EXPLOSION_COLS;
      const row = Math.floor(frame / EXPLOSION_COLS);
      const size = EXPLOSION_FW * scale;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(
        sheet.img,
        col * EXPLOSION_FW, row * EXPLOSION_FH, EXPLOSION_FW, EXPLOSION_FH,
        x - size / 2, y - size / 2, size, size,
      );
      ctx.restore();
    },
  });
}

/**
 * Destello de estrella (sprite real, glow aditivo) — acento extra sobre
 * el starburst()/fireworks procedurales existentes (no los sustituye).
 */
export function spawnSparkleSprite(engine, x, y, opts = {}) {
  if (!engine) return;
  const sprite = _sprite(SPARKLE_SPRITE);
  const life = opts.life ?? 0.4;
  const size = opts.size ?? 46;
  const rot = Math.random() * Math.PI;
  engine.addEffect({
    life,
    draw(ctx, t) {
      if (!sprite.ready) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(0, t);
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(sprite.img, -size / 2, -size / 2, size, size);
      ctx.restore();
    },
  });
}
