// tests/test-integration.mjs — dev-7 fase 9
// Smoke test: arranca el motor REAL (Fortress/Tower/Enemy/WaveManager/
// collideProjectiles) sin canvas/DOM y confirma que stage 1 se puede
// jugar de punta a punta sin tirar excepciones y termina en victoria.
// Esto es un smoke test liviano, NO reemplaza a scripts/balance-sim.mjs
// (que sí mide win%/HP/leaks a fondo con muchas semillas — ver
// docs/BALANCE.md). Ver docs/TESTING.md para la diferencia entre ambos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collideProjectiles } from '../js/enemies.js';
import { Fortress } from '../js/player.js';
import { WaveManager } from '../js/waves-manager.js';
import { waveGroups } from '../js/waves.js';
import { BASE_HP_BY_STAGE } from '../js/stages.js';
// fase 67: la etapa ∞ la define endless.js (no STAGES).
import { stageDef } from '../js/endless.js';
// fase 69: los diales del Protocolo (heat.js es puro: sin DOM).
import { heatMods } from '../js/heat.js';

/**
 * dev-7 fase 59: enemigos de la ola (sin el jefe: no está en la cola de
 * olas y nunca se escapa). Es el denominador de la fracción de fugas.
 */
function countWaveEnemies(wm) {
  let n = 0;
  for (const w of wm?.queue ?? []) {
    for (const g of waveGroups(w)) {
      if (g.type === 'boss' || g.pattern === 'boss') continue;
      n += g.count ?? 1;
    }
  }
  return n;
}

// RNG determinista compartido: sembrar Math.random por run hace cada
// partida reproducible — imprescindible para comparar S5 vs S6 sin ruido.
import { makeXorShift32 as makeRng } from './helpers/rng.mjs';

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

  spawnParticles() {}

  shake() {}

  sfxSafe() {}

  floatText() {}
}

function playStage(stageId, maxSeconds, seed, extraTowers = []) {
  if (seed !== undefined) Math.random = makeRng(seed); // run determinista
  const engine = new EngineStub();
  const game = { engine, stageId, lv: 1, xp: 0, score: 0, streak: 0, mult: 1, kills: 0, timer: 0, _leaks: 0 };
  game.fortress = new Fortress(game);
  game.fortress.maxHp = BASE_HP_BY_STAGE[stageId] ?? 3000;
  game.fortress.hp = game.fortress.maxHp;
  game.fortress.addTower('guardian');
  for (const type of extraTowers) game.fortress.addTower(type);

  const wm = new WaveManager(stageId);
  // dev-7 fase 59: los enemigos de la ola (sin el jefe), para poder medir
  // la fracción de fugas que aguanta la base. Se cuentan ANTES de la run:
  // al terminar, la cola de olas ya está vacía.
  const totalEnemies = countWaveEnemies(wm);
  let bossDead = false;
  wm.onBossDead(() => { bossDead = true; });
  wm.onWavesDone(() => { bossDead = true; });
  engine.on('enemy:reached', () => { game._leaks += 1; });

  const DT = 1 / 30;
  let t = 0;
  while (!bossDead && game.fortress.hp > 0 && t < maxSeconds) {
    t += DT;
    for (const e of engine.entities) e.update(DT);
    for (let i = engine.entities.length - 1; i >= 0; i--) {
      if (engine.entities[i].dead) engine.entities.splice(i, 1);
    }
    wm.update(DT, game);
    wm.checkBossDead();
    collideProjectiles(engine, game.fortress.enemies);
    game.fortress.enemies = game.fortress.enemies.filter((e) => !e.dead);
    game.fortress.update(DT);
  }
  return {
    win: bossDead && game.fortress.hp > 0,
    duration: t,
    hp: game.fortress.hp,
    leaks: game._leaks,
    // dev-7 fase 59: los enemigos de la ola (sin el jefe), para poder
    // medir la fracción de fugas que aguanta la base.
    totalEnemies,
  };
}

test('stage 1 (Guardian solo, sin cartas): se puede jugar de punta a punta sin tirar', () => {
  assert.doesNotThrow(() => playStage(1, 400));
});

test('stage 1: con una torre extra (como una carta) se gana en un tiempo razonable', () => {
  // El Guardian SOLO ya no alcanza en la economía de la fase 72 (la fuga
  // duele el HP máximo): el jugador real recibe cartas por nivel. El smoke
  // usa una torre extra como stand-in de la primera carta.
  const r = playStage(1, 400, undefined, ['missile']);
  assert.equal(r.win, true, `stage 1 no se ganó (hp=${r.hp}, t=${r.duration})`);
  assert.ok(r.duration < 300, `stage 1 tardó demasiado: ${r.duration}s`);
});

test('stage 6 (Guardian solo, recién desbloqueado): es MÁS difícil que stage 5 (regresión balance §4)', () => {
  // No repite la medición estadística completa de docs/BALANCE.md (eso vive en
  // balance-sim con 5 seeds). Smoke robusto y DETERMINISTA: 12 runs por
  // stage con semillas fijas por (stage, iteración).
  // Confirma que la dificultad sigue creciendo al cruzar a la campaña
  // procedural (balance v7: apertura farmable no suaviza el neto).
  //
  // dev-7 fase 59: la MÉTRICA cambia porque la economía de la fuga cambió.
  // Antes se comparaba el HP FRACCIONAL final: ese jugador (Guardian solo,
  // meta Nvl.1) sobrevivía y la comparación decikilos de puntos era
  // frágil. Con la fase 72 el daño de la fuga es el HP MÁXIMO del enemigo:
  // ese jugador MUERE en todos los stages, así que el HP final es 0 en
  // todos y no discrimina nada.
  //
  // La métrica nueva es LA MISMA IDEA con la nueva economía: cuánto de la
  // ola aguanta la base antes de caer. Se mide como la FRACCIÓN de
  // enemigos que llegan a la base (cuantos másLeaks aguanta la base,
  // más fácil es el stage). Es una fracción, así que es comparable entre
  // stages con olas de tamaños distintos.
  const N = 12;
  const avgLeakFrac = (id) => {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const r = playStage(id, 400, id * 1000 + i);
      sum += r.leaks / Math.max(1, r.totalEnemies);
    }
    return sum / N;
  };
  const f5 = avgLeakFrac(5);
  const f6 = avgLeakFrac(6);
  assert.ok(f6 < f5,
    `stage 6 (aguanta el ${(f6 * 100).toFixed(1)} % de la ola) debería ser más duro `
    + `que stage 5 (${(f5 * 100).toFixed(1)} %)`);
});

// ---------- fase 67: el modo ∞ corre con la MISMA maquinaria (smoke) ----------

test('fase 67: la etapa 55 existe y tiene MÁS HP de base que la 50 (no el fallback 3000)', () => {
  // Trampa 1 del design: `BASE_HP_BY_STAGE[55] ?? 3000` arrancaría el ∞
  // MÁS fácil que el S50. La definición del ∞ trae el HP de la curva real.
  const s50 = stageDef(50);
  const s55 = stageDef(55);
  assert.ok(s55, 'stageDef(55) tiene que devolver una etapa');
  assert.ok(s55.baseHp > s50.baseHp,
    `S55 (${s55.baseHp} HP) debería superar al S50 (${s50.baseHp} HP)`);
  assert.ok(s55.baseHp > 3000, 'el ∞ no puede arrancar con el HP del S2');
});

test('fase 67: WaveManager(55, {seed}) arma una ola jugable (cola y enemigos)', () => {
  const wm = new WaveManager(55, { seed: 42 });
  assert.ok(wm.queue.length > 0, 'la cola del ∞ llegó vacía');
  assert.ok(countWaveEnemies(wm) > 0, 'la ola del ∞ no trae enemigos');
});

test('fase 67: la semilla inyectada hace la etapa ∞ determinista (diario reintentable)', () => {
  const a = new WaveManager(55, { seed: 42 });
  const b = new WaveManager(55, { seed: 42 });
  assert.deepEqual(a.queue, b.queue);
});

// ---------- fase 69: el Protocolo entra por `runMods` (smoke) ----------

test('fase 69: WaveManager(55, { runMods }) arma la ola con el Protocolo activo', () => {
  const runMods = heatMods({ vigor: 1 });
  assert.equal(runMods.heat, 1);
  const wm = new WaveManager(55, { seed: 42, runMods });
  assert.ok(wm.queue.length > 0, 'la cola del ∞ con Vigor llegó vacía');
  assert.ok(countWaveEnemies(wm) > 0, 'la ola con Protocolo no trae enemigos');
});

test('fase 69: heatMods({}) es NEUTRO (heat 0 = la campaña de la fase 68)', () => {
  const neutral = heatMods({});
  assert.equal(neutral.heat, 0);
  assert.equal(neutral.hpMul, 1);
  assert.equal(neutral.velMul, 1);
  assert.equal(neutral.countMul, 1);
  assert.equal(neutral.leakMul, 1);
  assert.equal(neutral.baseHpMul, 1);
  assert.equal(neutral.offerCount, 3);
  assert.equal(neutral.bossHpMul, 1);
  assert.equal(neutral.bossEscort, 0);
  assert.equal(neutral.variantChanceAdd, 0);
  assert.equal(neutral.variantFracAdd, 0);
  assert.equal(neutral.doubleAffix, false);
  assert.equal(neutral.noUlt, false);
  assert.equal(neutral.slotDelta, 0);
});
