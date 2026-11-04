// ============================================================
// tests/test-ultimate.mjs — 1.16.0: BOMBARDEO ORBITAL
//
// El ultimate dejó de caer en una banda fija de y=340 con x aleatoria:
// ahora busca el racimo más denso (igual que el Black Hole), reparte una
// alfombra de impactos, pega cada uno a un enemigo vivo y cierra con un
// remate. Los jefes reciben un límite explícito (×0,5).
//
// Se testea sin canvas ni DOM: helpers puros + un ctx stub para el draw.
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fortress } from '../js/player.js';
import { CONFIG } from '../js/engine.js';
import {
  ORBITAL, ORBITAL_IMPACT_TIMES, ORBITAL_LAST,
  orbitalCenter, orbitalPatternPoint, orbitalStrikePoint,
  orbitalFinisherPoint, orbitalDamageFor, orbitalRadiusFor,
  applyOrbitalDamage, drawOrbitalDesignator, drawOrbitalWarning,
  drawOrbitalImpact,
} from '../js/ultimate.js';

/** Enemigo duck-typed: lo mínimo para el racimo y el daño. */
function dummy(x, y, opts = {}) {
  return {
    x, y, r: opts.r ?? 10, dead: false, isBoss: opts.boss === true,
    hp: 1e9, damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; this.hp -= n; },
  };
}

/** Game stub con engine de efectos/partículas y audio. */
function mkGame(enemies = []) {
  const effects = [];
  const particles = [];
  const shakes = [];
  const sfx = [];
  const engine = {
    _qualityId: 'alta',
    effects,
    addEffect(fx) { effects.push(fx); },
    spawnParticles(x, y, color, n) { particles.push({ x, y, color, n }); },
    shake(px, ms) { shakes.push([px, ms]); },
    emit() {},
  };
  const game = {
    engine,
    fortress: { enemies },
    audio: { sfx(name) { sfx.push(name); } },
    hitStops: 0,
    hitStop() { this.hitStops += 1; },
  };
  return { game, effects, particles, shakes, sfx };
}

/** Fortress mínima para probar el estado del ultimate sin torres. */
function mkFortress(game) {
  const f = Object.create(Fortress.prototype);
  f.game = game;
  f.ultReady = true;
  f.ultCharge = 1;
  f.orbitalDmgMul = 1;
  f._orbitalTimer = 0;
  f._orbitalElapsed = 0;
  f._orbitalNext = 0;
  f._orbitalPending = [];
  f._orbitalCenter = null;
  return f;
}

function ctxStub() {
  const noop = () => {};
  return {
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    strokeStyle: '', fillStyle: '', lineWidth: 1,
    saves: 0, restores: 0,
    save() { this.saves += 1; },
    restore() { this.restores += 1; },
    translate: noop, scale: noop, beginPath: noop, closePath: noop,
    arc: noop, moveTo: noop, lineTo: noop, quadraticCurveTo: noop,
    stroke: noop, fill: noop, fillRect: noop,
    setLineDash: noop,
  };
}

// ============================================================
// 1. TARGETING: el racimo manda
// ============================================================

test('1.16.0 — orbitalCenter elige el racimo más denso, no el centro del campo', () => {
  const cluster = [dummy(400, 300), dummy(415, 310), dummy(390, 292)];
  const lone = dummy(80, 700);
  const p = orbitalCenter([...cluster, lone]);
  assert.ok(p.x > 360 && p.x < 440, `x en el racimo (${p.x})`);
  assert.ok(p.y > 250 && p.y < 350, `y en el racimo (${p.y})`);
  // Sin enemigos: fallback determinista al centro de la base.
  const empty = orbitalCenter([]);
  assert.equal(empty.x, CONFIG.BASE_X);
  assert.equal(empty.y, 380);
});

test('1.16.0 — orbitalStrikePoint se pega al enemigo vivo más cercano', () => {
  const enemy = dummy(420, 310, { r: 12 });
  const p = orbitalStrikePoint([enemy], { x: 400, y: 300 }, 0, { searchRadius: 300 });
  assert.equal(p.snapped, true);
  assert.equal(p.x, 420);
  assert.equal(p.y, 310);
  // Fuera del radio de búsqueda: cae al punto teórico del patrón.
  const far = orbitalStrikePoint([dummy(10, 10)], { x: 400, y: 300 }, 0, { searchRadius: 40 });
  assert.equal(far.snapped, false);
  const ideal = orbitalPatternPoint({ x: 400, y: 300 }, 0);
  assert.equal(far.x, ideal.x);
  assert.equal(far.y, ideal.y);
});

test('1.16.0 — orbitalFinisherPoint busca el enemigo más cercano al centro', () => {
  const near = dummy(280, 390);
  const p = orbitalFinisherPoint([dummy(500, 700), near], { x: 270, y: 380 });
  assert.equal(p.snapped, true);
  assert.equal(p.x, 280);
  assert.equal(p.y, 390);
});

// ============================================================
// 2. DAÑO Y LÍMITE A JEFES
// ============================================================

test('1.16.0 — applyOrbitalDamage pega a cualquier y y limita a los jefes ×0,5', () => {
  const normal = dummy(100, 700);
  const boss = dummy(100, 700, { boss: true });
  const hits = applyOrbitalDamage([normal, boss], {
    x: 100, y: 700, damage: 100, radius: 50,
  });
  assert.equal(hits, 2, 'los dos están dentro del splash');
  assert.equal(normal.damageTaken, 100, 'el enemigo normal recibe el daño completo');
  assert.equal(boss.damageTaken, 50, 'el jefe recibe bossMul = 0,5');
  // Fuera del radio no toca a nadie.
  assert.equal(applyOrbitalDamage([dummy(500, 700)], {
    x: 100, y: 700, damage: 100, radius: 50,
  }), 0);
});

test('1.16.0 — daño/radio del remate: más grandes que un impacto normal', () => {
  assert.equal(orbitalDamageFor(0), ORBITAL.damage);
  assert.equal(orbitalDamageFor(ORBITAL_LAST), ORBITAL.damage * ORBITAL.finisher.damageMul);
  assert.equal(orbitalDamageFor(0, 1.5), ORBITAL.damage * 1.5);
  assert.equal(orbitalRadiusFor(0), ORBITAL.radius);
  assert.equal(orbitalRadiusFor(ORBITAL_LAST), ORBITAL.radius * ORBITAL.finisher.radiusMul);
  assert.equal(ORBITAL_IMPACT_TIMES.length, ORBITAL.count);
});

// ============================================================
// 3. INTEGRACIÓN CON FORTRESS: agenda y aplica sobre y real
// ============================================================

test('1.16.0 — fireUltimate centra el bombardeo en el racimo y arranca el estado', () => {
  const enemies = [dummy(400, 300), dummy(412, 305), dummy(80, 700)];
  const { game } = mkGame(enemies);
  const f = mkFortress(game);
  game.fortress = f;
  f.enemies = enemies;

  assert.equal(f.fireUltimate(game), true);
  assert.equal(f.ultReady, false);
  assert.equal(f.ultCharge, 0);
  assert.equal(f._orbitalTimer, ORBITAL.duration);
  assert.equal(f._orbitalNext, 0);
  assert.ok(f._orbitalCenter.x > 360 && f._orbitalCenter.x < 440,
    `el estado guarda el centro del racimo (${f._orbitalCenter.x})`);
  assert.ok(f._orbitalCenter.y > 250 && f._orbitalCenter.y < 350,
    `y del racimo (${f._orbitalCenter.y})`);
});

test('1.16.0 — un enemigo en y=700 recibe el bombardeo (regresión del y fijo)', () => {
  const enemies = [dummy(270, 700, { r: 16 })];
  const { game, shakes } = mkGame(enemies);
  const f = mkFortress(game);
  game.fortress = f;
  f.enemies = enemies;
  f.fireUltimate(game);

  for (let t = 0; t < ORBITAL.duration + 0.2; t += 0.05) {
    f._updateOrbital(0.05, enemies);
  }
  assert.ok(enemies[0].damageTaken > 0,
    'el impacto tiene que alcanzar al enemigo de y=700, no a la banda y=340');
  assert.equal(f._orbitalNext, ORBITAL_IMPACT_TIMES.length);
  assert.equal(f._orbitalPending.length, 0, 'no quedan impactos pendientes');
  assert.ok(f._orbitalTimer <= 0);
  assert.ok(shakes.length >= ORBITAL.count, 'cada impacto sacude la pantalla');
});

test('1.16.0 — canFireUltimate no permite solapar dos bombardeos', () => {
  const { game } = mkGame([]);
  const f = mkFortress(game);
  f._orbitalTimer = 1;
  assert.equal(f.canFireUltimate(), false, 'con lluvia activa no se puede disparar');
  f._orbitalTimer = 0;
  assert.equal(f.canFireUltimate(), true);
  f.ultReady = false;
  assert.equal(f.canFireUltimate(), false);
});

test('1.16.0 — sin enemigos el bombardeo no rompe y usa el fallback', () => {
  const { game } = mkGame([]);
  const f = mkFortress(game);
  game.fortress = f;
  f.enemies = [];
  assert.doesNotThrow(() => f.fireUltimate(game));
  for (let t = 0; t < ORBITAL.duration + 0.2; t += 0.1) {
    assert.doesNotThrow(() => f._updateOrbital(0.1, []));
  }
  assert.equal(f._orbitalCenter.x, CONFIG.BASE_X);
  assert.equal(f._orbitalCenter.y, 380);
});

// ============================================================
// 4. DIBUJO: helpers con ctx stub
// ============================================================

test('1.16.0 — designador, aviso e impacto dibujan sin tirar y balancean save/restore', () => {
  const ctx = ctxStub();
  assert.doesNotThrow(() => drawOrbitalDesignator(ctx, { x: 270, y: 400 }, 0.5, false));
  assert.doesNotThrow(() => drawOrbitalDesignator(ctx, { x: 270, y: 400 }, 0.5, true));
  assert.doesNotThrow(() => drawOrbitalWarning(ctx, {
    x: 270, y: 400, radius: ORBITAL.radius,
  }, 0.5, false));
  assert.doesNotThrow(() => drawOrbitalImpact(ctx, {
    x: 270, y: 400, radius: ORBITAL.radius,
  }, 0.5, false));
  assert.doesNotThrow(() => drawOrbitalImpact(ctx, {
    x: 270, y: 400, radius: orbitalRadiusFor(ORBITAL_LAST), final: true,
  }, 0.35, true));
  assert.equal(ctx.saves, ctx.restores, 'cada save tiene su restore');
  // Sin ctx o con t=0 no hace nada.
  assert.doesNotThrow(() => drawOrbitalImpact(null, { x: 0, y: 0 }, 0.5));
  assert.doesNotThrow(() => drawOrbitalDesignator(ctx, null, 0.5));
});
