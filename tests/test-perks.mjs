// tests/test-perks.mjs — dev-7 fase 26
// Cubre las mecánicas de perks en combate DESPUÉS de la unificación en
// js/perks.js (antes duplicadas en towers.js y enemies.js).
//
// Estos tests son la RED que faltaba: hasta la fase 25, las mecánicas
// nuevas (remate, robo de vida, explosión al matar) solo tenían 2 tests
// sueltos y NINGUNO detectaba que:
//   - el remate hacía instakill de jefes (comparaba hp-dmg contra el umbral),
//   - el robo de vida curaba sobre el sobredaño y resucitaba la base,
//   - la perforación anulaba al rebote (perks de rebote = código muerto),
//   - takeDamage(NaN) dejaba enemigos inmortales,
//   - el pool de la explosión no era una cadena real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPerkDamage, onHitOpts, pickOnHit } from '../js/perks.js';
import { applyProjectileHit, Enemy, threatFactor } from '../js/enemies.js';
import { dmgMultiplier } from '../js/damagetypes.js';

/** Enemigo mínimo con la misma forma que Enemy.takeDamage. */
function mkEnemy(x, y, hp = 100, hpMax = 100) {
  return {
    x, y, r: 10, hp, hpMax, dead: false, slowFactor: 1, stun: 0,
    takeDamage(n) {
      this.hp -= n;
      if (this.hp <= 0) { this.hp = 0; this.dead = true; return true; }
      return false;
    },
  };
}

/** Juego mínimo con fortress y engine (para señales y curación). */
function mkGame(hp = 500, maxHp = 1000) {
  const log = { floats: [], emits: [] };
  return {
    log,
    game: {
      fortress: { hp, maxHp, enemies: [] },
      engine: {
        _t: 0,
        spawnParticles() {},
        floatText: (x, y, text) => log.floats.push(text),
        emit: (name, payload) => log.emits.push([name, payload]),
      },
    },
  };
}

// ---------- el remate NO debe hacer instakill de jefes ----------

test('fase 26: el remate NO insta-killea a un jefe que NO está bajo el umbral', () => {
  // Jefe de 1000 HP al 20 % (200 HP). Golpe de 150.
  // La implementación vieja comparaba (hp - dmg) <= hpMax * umbral, o sea
  // 200-150 = 50 <= 100 → REMATE → el jefe moría de un solo balazo.
  // Con la semántica correcta (ya está POR DEBAJO del umbral) NO hay
  // remate: el jefe recibe el daño normal y sigue vivo.
  const boss = mkEnemy(0, 0, 200, 1000);
  const { game } = mkGame();
  applyPerkDamage(boss, 150, 'bullet', { executeThreshold: 0.1 }, game, [boss]);
  assert.equal(boss.dead, false, 'el jefe NO debía morir de un balazo');
  assert.equal(boss.hp, 50, 'debía quedar en 50 HP (200 - 150)');
});

test('fase 26: el remate SÍ mata a un enemigo que YA está bajo el umbral', () => {
  // 90 HP de 1000 con umbral 0.1 (100): ya está por debajo → remate.
  const e = mkEnemy(0, 0, 90, 1000);
  const { game } = mkGame();
  applyPerkDamage(e, 5, 'bullet', { executeThreshold: 0.1 }, game, [e]);
  assert.equal(e.dead, true, 'debía quedar rematado');
  assert.equal(e.hp, 0);
});

test('fase 26: el remate NUNCA reduce el daño (no castiga el robo de vida)', () => {
  // Enemigo con 10 HP, golpe de 500: con la implementación vieja el remate
  // bajaba el daño a enemy.hp (10) y el texto de daño mostraba 10 en vez de
  // 500. Ahora el daño nunca se reduce.
  const e = mkEnemy(0, 0, 10, 100);
  const { game } = mkGame();
  applyPerkDamage(e, 500, 'bullet', { executeThreshold: 0.5 }, game, [e]);
  assert.equal(e.dead, true);
  assert.equal(e.hp, 0);
});

// ---------- el robo de vida ----------

test('fase 26: el robo de vida cura sobre el daño EFECTIVO, no sobre el sobredaño', () => {
  // Enemigo de 10 HP, golpe de 500, lifesteal 10 %:
  // laimplementation vieja curaba 500 × 0.1 = 50 (sobredaño).
  // Con daño efectivo (10) debe curar 10 × 0.1 = 1.
  const e = mkEnemy(0, 0, 10, 100);
  const { game } = mkGame(500, 1000);
  applyPerkDamage(e, 500, 'bullet', { lifesteal: 0.1 }, game, [e]);
  assert.ok(Math.abs(game.fortress.hp - 501) < 1e-9,
    `esperaba 501 (500 + 10 % de 10), dio ${game.fortress.hp}`);
});

test('fase 26: el robo de vida NO resucita la base destruida', () => {
  // Con la base en 0 (GAME_OVER) el robo de vida la volvía a levantar:
  // la pantalla de derrota mostraba un escudo vivo y el estado quedaba
  // inconsistente (hp > 0 con GAME_OVER).
  const e = mkEnemy(0, 0, 100, 100);
  const { game } = mkGame(0, 1000);
  applyPerkDamage(e, 50, 'bullet', { lifesteal: 0.5 }, game, [e]);
  assert.equal(game.fortress.hp, 0, 'la base destruida no debe resucitar');
});

test('fase 26: el robo de vida respeta el tope maxHp', () => {
  const e = mkEnemy(0, 0, 1000, 1000);
  const { game } = mkGame(990, 1000);
  applyPerkDamage(e, 1000, 'bullet', { lifesteal: 0.5 }, game, [e]);
  assert.equal(game.fortress.hp, 1000, 'no puede superar maxHp');
});

test('fase 26: el robo de vida en un splash cura el % del daño TOTAL del área', () => {
  // 3 enemigos × 100 de daño con lifesteal 10 % → 30 de daño total → 3 de
  // cura. La copia vieja de enemies.js aplicaba el robo de vida una vez
  // por enemigo, pero con la cantidad correcta de daño por enemigo
  // (100 × 0.1 = 10 cada uno) → el total era el mismo. Este test fija el
  // comportamiento para que no vuelva a divergir entre las dos rutas.
  const { game } = mkGame(500, 1000);
  const list = [mkEnemy(0, 0, 1000, 1000), mkEnemy(20, 0, 1000, 1000), mkEnemy(40, 0, 1000, 1000)];
  const p = { x: 20, y: 0, damage: 100, splashR: 100, dead: false, lifesteal: 0.1, critChance: 0, game };
  applyProjectileHit(p, list);
  assert.ok(Math.abs(game.fortress.hp - 530) < 1e-9,
    `esperaba 530 (500 + 10 % de 300), dio ${game.fortress.hp}`);
});

test('fase 72: el robo de vida está topeado al 10 % del daño efectivo', () => {
  // La suma de capas (meta + carta) no puede pasar del 10 %: antes un 50 %
  // curaba 50 sobre 100 de daño.
  const e = mkEnemy(0, 0, 1000, 1000);
  const { game, log } = mkGame(500, 1000);
  applyPerkDamage(e, 100, 'bullet', { lifesteal: 0.5 }, game, [e]);
  assert.ok(Math.abs(game.fortress.hp - 510) < 1e-9,
    `esperaba 510 (500 + 10 % de 100), dio ${game.fortress.hp}`);
  assert.equal(log.emits.filter(([name]) => name === 'base:healed').length, 1,
    'la cura emite base:healed para el feedback del HUD');
});

// ---------- la explosión en cadena ----------

test('fase 26: la explosión al matar ES una cadena real (reacción en cadena)', () => {
  // 3 enemigos en línea a 20 px. El primero muere y explota; el vecino
  // muere por la explosión y EXPLOTA a su vez; el tercero también.
  // Antes la explosión usaba daño plano: el vecino NO detonaba la suya.
  const mk = (x, hp) => mkEnemy(x, 0, hp, 100);
  const a = mk(0, 5), b = mk(20, 20), c = mk(40, 20);
  const { game } = mkGame();
  game.fortress.enemies = [a, b, c];
  const mods = { explodeOnKillChance: 1, explodeOnKillDmg: 30, explodeOnKillRadius: 40 };
  applyPerkDamage(a, 50, 'bullet', mods, game, [a, b, c]);
  assert.equal(a.dead, true, 'la víctima debía morir');
  assert.equal(b.dead, true, 'el vecino debía morir por la explosión');
  assert.equal(c.dead, true, 'el tercer enemigo debía morir por la cadena');
});

test('fase 26: la cadena de explosiones tiene tope de profundidad', () => {
  // 8 enemigos en línea: con un tope de 3 saltos la cadena NO debe
  // propagarse hasta el final (evita una recursión infinita).
  const list = Array.from({ length: 8 }, (_, i) => mkEnemy(i * 20, 0, 20, 100));
  const { game } = mkGame();
  game.fortress.enemies = list;
  const mods = { explodeOnKillChance: 1, explodeOnKillDmg: 30, explodeOnKillRadius: 40 };
  applyPerkDamage(list[0], 50, 'bullet', mods, game, list);
  const muertos = list.filter((e) => e.dead).length;
  assert.ok(muertos > 1, 'la cadena debe matar a más de uno');
  assert.ok(muertos < list.length, `la cadena no debe reaches los 8 (mató ${muertos})`);
});

test('fase 26: la explosión de la cadena NO cura al escudo', () => {
  // Una cadena larga no debe vaciar la vida de la base.
  const list = Array.from({ length: 4 }, (_, i) => mkEnemy(i * 20, 0, 20, 100));
  const { game } = mkGame(500, 1000);
  game.fortress.enemies = list;
  const mods = {
    explodeOnKillChance: 1, explodeOnKillDmg: 30, explodeOnKillRadius: 40, lifesteal: 0.5,
  };
  applyPerkDamage(list[0], 50, 'bullet', mods, game, list);
  // Solo el golpe directo cura; con el tope del 10 % y 20 de daño efectivo
  // (el enemigo tenía 20 HP) cura 2, no 25.
  assert.equal(game.fortress.hp, 502, 'solo el golpe directo cura y con el tope del 10 %');
});

// ---------- perforación y rebote son contadores independientes ----------

test('fase 26: perforación y rebote son INDEPENDIENTES (el rebote ya no es código muerto)', () => {
  // Antes: `if (pierce > 0) { pierce--; return; }` salía ANTES de mirar el
  // rebote, así que con pierce=999 (Gauss) o con el perk de perforación del
  // Guardian el rebote NUNCA ocurría. Los perks "Rebote magnético",
  // "Rebote II" y "DEFINITIVO Rebote infinito" eran código muerto.
  const a = mkEnemy(100, 506, 500, 500);
  const b = mkEnemy(100, 500, 500, 500);
  const list = [a, b];
  const p = { x: 100, y: 512, vx: 0, vy: -200, damage: 10, pierce: 999, bounce: 1, dead: false };
  applyProjectileHit(p, list);
  assert.equal(a.hp, 490, 'el primer enemigo debía recibir el golpe');
  assert.equal(p.bounce, 0, 'el rebote debía consumirse (antes quedaba sin usar)');
  assert.ok(p._lastHit, 'debía registrar el último golpeado para re-apuntar');
});

test('fase 26: la perforación golpea a enemigos DISTINTOS', () => {
  // El perk dice "atraviesa +N ENEMIGOS": debe ser N enemigos distintos,
  // no N golpes al mismo blanco.
  const a = mkEnemy(100, 506, 500, 500);
  const b = mkEnemy(100, 500, 500, 500);
  const list = [a, b];
  const p = { x: 100, y: 512, vx: 0, vy: -200, damage: 10, pierce: 2, dead: false };
  applyProjectileHit(p, list);
  assert.equal(a.hp, 490, 'A primero');
  p.y = 488; // la bala avanzó más allá de B (física real)
  applyProjectileHit(p, list);
  assert.equal(b.hp, 490, 'B también debe recibir el golpe');
  assert.equal(a.hp, 490, 'A no debe volver a recibir daño');
});

// ---------- takeDamage(NaN) ----------

test('fase 26: takeDamage(NaN) no deja enemigos inmortales', () => {
  // Enemy.takeDamage comparaba `n <= 0` — con NaN eso es false, así que
  // el hp quedaba NaN y `hp <= 0` tampoco era true: el enemigo NUNCA
  // moría y el NaN se propagaba al HUD y a la selección de blanco.
  const e = new Enemy('spore', 0, 0, null);
  e.hp = 100; e.hpMax = 100;
  e.takeDamage(NaN);
  assert.equal(e.hp, 100, 'el hp no debe volverse NaN');
  assert.equal(e.dead, false);
  assert.ok(Number.isFinite(e.hp), 'el hp debe seguir siendo finito');
  e.takeDamage(Infinity);
  assert.ok(Number.isFinite(e.hp) || e.dead, 'Infinity tampoco debe dejar hp NaN');
});

// ---------- las señales ----------

test('fase 26: las señales de execute y boom throttlean POR TIPO (no globalmente)', () => {
  // El throttle de 0.15 s es por tipo: un remate y una explosión en el
  // mismo instante deben dar DOS señales.
  const { game, log } = mkGame();
  const a = mkEnemy(0, 0, 12, 100);
  const b = mkEnemy(200, 0, 5, 100);
  const p1 = { x: 0, y: 0, vx: 0, vy: 0, damage: 5, executeThreshold: 0.15, dead: false, pierce: 0, game };
  applyProjectileHit(p1, [a]);
  const p2 = {
    x: 200, y: 0, vx: 0, vy: 0, damage: 50, explodeOnKillChance: 1, dead: false, pierce: 0, game,
  };
  applyProjectileHit(p2, [b]);
  assert.deepEqual(log.floats, ['¡REMATE!', '¡BOOM!'],
    'execute y boom deben señalarse por separado');
});

test('fase 26: dos señales del MISMO tipo en el mismo instante dan una sola', () => {
  const { game, log } = mkGame();
  const a = mkEnemy(0, 0, 12, 100);
  const b = mkEnemy(200, 0, 12, 100);
  const p1 = { x: 0, y: 0, vx: 0, vy: 0, damage: 5, executeThreshold: 0.15, dead: false, pierce: 0, game };
  applyProjectileHit(p1, [a]);
  const p2 = { x: 200, y: 0, vx: 0, vy: 0, damage: 5, executeThreshold: 0.15, dead: false, pierce: 0, game };
  applyProjectileHit(p2, [b]);
  assert.equal(log.floats.length, 1, 'el throttle de 0.15 s descarta la segunda');
});

// ---------- helpers compartidos ----------

test('fase 26: onHitOpts/pickOnHit normalizan los campos de perk del proyectil', () => {
  const o = onHitOpts({ executeThreshold: 0.2, lifesteal: 0.1 }, 'GAME');
  assert.equal(o.executeThreshold, 0.2);
  assert.equal(o.lifesteal, 0.1);
  assert.equal(o.explodeOnKillChance, 0, 'ausente → 0');
  assert.equal(o.explodeOnKillDmg, 20, 'default del proyectil');
  assert.equal(o.explodeOnKillRadius, 70);
  assert.equal(o.game, 'GAME');
  // pickOnHit NO debe pisar un game ya seteado (HomingMissile)
  const p = pickOnHit({ executeThreshold: 0.1, game: 'GAME' });
  assert.equal(p.game, 'GAME');
  const p2 = pickOnHit({ executeThreshold: 0.1 });
  assert.equal(p2.game, undefined, 'sin game no debe inventar la clave');
});

// ============================================================
// LECTURA VISUAL (T1/T2/T3): estela incandescente, peligro por
// proximidad y presencia del jefe.
//
// Son PASES DE LECTURA: dibujan, pero NO tocan la simulación.
// Estos tests fijan justamente esa frontera — que el brillo de
// proximidad no altere hp, daño ni llegada, y que la estela no
// mueva al enemigo.
// ============================================================

/** Contexto 2D mínimo (stub) para ejercitar Enemy.draw() en Node. */
function mkCtx() {
  const grad = { addColorStop() {} };
  const noop = () => {};
  return {
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt',
    shadowColor: '', shadowBlur: 0,
    arcs: [], rects: 0, strokes: 0,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop,
    arc(_x, _y, r) { this.arcs.push(r); },
    ellipse: noop, rect: noop, fill: noop,
    stroke() { this.strokes++; },
    fillRect() { this.rects++; },
    strokeRect: noop, clip: noop, setLineDash: noop, getLineDash: () => [],
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    createPattern: () => null, measureText: () => ({ width: 0 }),
    fillText: noop, strokeText: noop,
  };
}

/** Juego stub con engine completo (partículas, floats, efectos, señales). */
function mkStubGame() {
  const log = { floats: [], emits: [] };
  const game = {
    fortress: { hp: 500, maxHp: 1000, enemies: [], takeDamage() {} },
    engine: {
      particles: [],
      spawnParticles() {}, floatText: (x, y, t) => log.floats.push(t),
      addEffect() {}, shake() {}, addEntity() {},
      emit: (n, p) => log.emits.push([n, p]),
    },
  };
  return { log, game };
}

// ---------- T2: el helper puro de peligro por proximidad ----------

test('T2: threatFactor va de 0 (spawn) a 1 (base) y se mantiene en [0,1]', () => {
  const spawnY = -120;
  const baseY = 850;
  assert.equal(threatFactor(spawnY, baseY, spawnY), 0, 'en el spawn no hay amenaza');
  assert.equal(threatFactor(baseY, baseY, spawnY), 1, 'en la base, amenaza máxima');
  assert.equal(threatFactor((spawnY + baseY) / 2, baseY, spawnY), 0.5, 'a mitad de camino');
  for (let i = 0; i <= 20; i++) {
    const f = threatFactor(spawnY + (baseY - spawnY) * (i / 20), baseY, spawnY);
    assert.ok(Number.isFinite(f), `no debe ser NaN (iteración ${i})`);
    assert.ok(f >= 0 && f <= 1, `fuera de [0,1]: ${f}`);
  }
  // monotónico: más abajo = más amenazante
  let prev = -1;
  for (let y = spawnY; y <= baseY; y += 10) {
    const f = threatFactor(y, baseY, spawnY);
    assert.ok(f >= prev, `debe crecer con la Y (${f} < ${prev})`);
    prev = f;
  }
});

test('T2: threatFactor tolera Y fuera de rango sin devolver NaN', () => {
  const spawnY = -120;
  const baseY = 850;
  assert.equal(threatFactor(spawnY - 500, baseY, spawnY), 0, 'por encima del spawn → 0');
  assert.equal(threatFactor(baseY + 500, baseY, spawnY), 1, 'más allá de la base → 1');
  assert.ok(Number.isFinite(threatFactor(NaN, baseY, spawnY)), 'Y NaN');
  assert.ok(Number.isFinite(threatFactor(0, NaN, spawnY)), 'baseY NaN');
  assert.ok(Number.isFinite(threatFactor(0, baseY, NaN)), 'spawnY NaN');
  // span degenerado (base == spawn): todo o nada, pero nunca NaN
  assert.equal(threatFactor(100, 0, 0), 1, 'con base==spawn, estar en la base es 1');
  assert.equal(threatFactor(-100, 0, 0), 0);
});

// ---------- T1: la estela es sólo lectura ----------

test('T1: la estela NO altera posición, velocidad ni estado del enemigo', () => {
  const e = new Enemy('meteor', 120, { y: 300 });
  const vel0 = e.vel;
  e.update(1 / 60);
  // el update conserva la fórmula histórica: y += vel * dt
  assert.ok(Math.abs(e.y - (300 + vel0 * (1 / 60))) < 1e-9, 'la caída no cambió');
  const x1 = e.x;
  const y1 = e.y;
  const hp0 = e.hp;

  const ctx = mkCtx();
  e.draw(ctx); // dibuja la estela (cromas) + la silueta
  assert.equal(e.x, x1, 'la estela no puede mover al enemigo');
  assert.equal(e.y, y1, 'la estela no puede mover al enemigo');
  assert.equal(e.vel, vel0, 'la estela no puede alterar la velocidad');
  assert.equal(e.hp, hp0, 'la estela no puede tocar el hp');
  assert.equal(e.dead, false);
});

// ---------- T2: el realce de proximidad no altera la simulación ----------

test('T2: el realce de proximidad NO cambia hp, daño ni dead', () => {
  const { game } = mkStubGame();
  // Y dentro de la zona caliente (último 25 % de la caída)
  const e = new Enemy('meteor', 200, { game, y: 800 });
  const hp0 = e.hp;
  const vel0 = e.vel;

  const ctx = mkCtx();
  e.draw(ctx);
  assert.equal(e.hp, hp0, 'el brillo de proximidad no puede tocar el hp');
  assert.equal(e.vel, vel0, 'ni la velocidad');
  assert.equal(e.dead, false, 'ni matar al enemigo');

  // el daño sigue siendo el de siempre (con el multiplicador de TIPO de
  // la fase 32: el meteorito es de familia "roca" y la bala es balística
  // → ×1,5)
  const mul = dmgMultiplier('ballistic', e.family);
  e.takeDamage(5);
  assert.equal(e.hp, hp0 - 5 * mul, 'el daño debe seguir aplicando igual (con su tipo)');
  assert.equal(e.dead, false);
});

// ---------- T3: el jefe conserva barra de HP, fase y halo ----------

test('T3: el jefe conserva su barra de HP, su fase y su halo de aviso', () => {
  const { log, game } = mkStubGame();
  const boss = new Enemy('boss', 270, { game, y: 0 });

  const ctx = mkCtx();
  boss.draw(ctx);
  assert.ok(ctx.rects >= 2, 'el jefe debe dibujar su barra de HP (fondo + relleno)');
  assert.ok(ctx.arcs.some((r) => r > boss.r * 1.2),
    'el jefe debe llevar halo/anillo de aviso');

  // Fase: al cruzar el umbral de HP dispara la fase y acelera
  boss.hp = boss.hpMax * 0.5;
  const vel0 = boss.vel;
  boss.update(1 / 60);
  assert.ok(boss.vel > vel0, 'el jefe debe acelerar al entrar en fase');
  assert.ok(log.emits.some(([n]) => n === 'boss:phase2'), 'debe emitir boss:phase2');
  assert.equal(boss.hp, boss.hpMax * 0.5, 'la fase no toca el hp');

  // Un SUB-jefe (miniBlob) no lleva halo de jefe
  const mini = new Enemy('miniBlob', 270, { game, y: 0 });
  const ctx2 = mkCtx();
  mini.draw(ctx2);
  assert.ok(!ctx2.arcs.some((r) => r > mini.r * 1.2),
    'el sub-jefe NO debe llevar el halo del jefe');
});
