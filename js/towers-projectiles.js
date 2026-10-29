// =============================================================================
// towers-projectiles.js — bala, obús y misil
// =============================================================================

import { CONFIG, rand } from './engine.js';
import { TOWERS } from './towers-data.js';
import { pickOnHit } from './perks.js';
import { applyProjectileHit } from './enemies.js';
import { applyExplosionCombo } from './towers-core.js';

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


