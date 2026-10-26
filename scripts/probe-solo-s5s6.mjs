// scripts/probe-solo-s5s6.mjs — ¿stage 6 sigue siendo más duro que stage 5
// bajo el benchmark "Guardian solo, sin cartas" (test-integration)? Mide la
// distribución en N runs (el test de smoke usa UNA, demasiado ruidosa).
//
// dev-7 fase 26: las runs ahora son DETERMINISTAS (Math.random sembrado por
// run, mismo patrón que balance-sim.mjs): la distribución se puede volver a
// medir y comparar. Antes cambiaba en cada invocación.

import { Fortress } from '../js/player.js';
import { WaveManager } from '../js/waves.js';
import { BASE_HP_BY_STAGE } from '../js/stages.js';
import { collideProjectiles } from '../js/enemies.js';

/** RNG determinista (xorshift32) — mismo patrón que balance-sim.mjs. */
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return (s % 1_000_000_007) / 1_000_000_007;
  };
}

class EngineStub {
  constructor() {
    this.entities = [];
    this.effects = [];
    this.particles = [];
    this._listeners = new Map();
  }
  on(n, cb) { (this._listeners.get(n) ?? this._listeners.set(n, []).get(n)).push(cb); }
  emit(n, p) { for (const cb of this._listeners.get(n) ?? []) cb(p); }
  addEffect() {}
  addEntity(e) { this.entities.push(e); }
  spawnParticles() {}
  shake() {}
  sfxSafe() {}
  floatText() {}
}

function playStage(stageId, maxSeconds, seed) {
  const realRandom = Math.random;
  Math.random = makeRng(seed); // olas procedurales + enemigos deterministas
  try {
    const engine = new EngineStub();
    const game = { engine, stageId, lv: 1, xp: 0, score: 0, streak: 0, mult: 1, kills: 0, timer: 0, _leaks: 0 };
    game.fortress = new Fortress(game);
    game.fortress.maxHp = BASE_HP_BY_STAGE[stageId] ?? 3000;
    game.fortress.hp = game.fortress.maxHp;
    game.fortress.addTower('guardian');
    const wm = new WaveManager(stageId);
    let done = false;
    wm.onBossDead(() => { done = true; });
    wm.onWavesDone(() => { done = true; });
    engine.on('enemy:reached', () => { game._leaks += 1; });
    const DT = 1 / 30;
    let t = 0;
    while (!done && game.fortress.hp > 0 && t < maxSeconds) {
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
    return { win: done && game.fortress.hp > 0, hp: game.fortress.hp, hpFrac: game.fortress.hp / game.fortress.maxHp, leaks: game._leaks };
  } finally {
    Math.random = realRandom;
  }
}

const N = Number(process.argv[2] ?? 15);
const res = { 5: [], 6: [] };
for (const id of [5, 6]) {
  for (let i = 0; i < N; i++) res[id].push(playStage(id, 400, i * 7919 + id));
}
for (const id of [5, 6]) {
  const arr = res[id].map((r) => r.hpFrac).sort((a, b) => a - b);
  const med = arr[(arr.length / 2) | 0];
  const min = arr[0], max = arr[arr.length - 1];
  const wins = res[id].filter((r) => r.win).length;
  const leaks = res[id].reduce((s, r) => s + r.leaks, 0) / N;
  console.log(`S${id}: win ${wins}/${N} · hpFrac mediana ${(med * 100).toFixed(1)}% [${(min * 100).toFixed(0)}-${(max * 100).toFixed(0)}] · leaks ${leaks.toFixed(1)}`);
}
const m5 = res[5].reduce((s, r) => s + r.hpFrac, 0) / N;
const m6 = res[6].reduce((s, r) => s + r.hpFrac, 0) / N;
console.log(`S6 más duro que S5 (hpFrac): ${m6 < m5 ? 'SÍ' : 'NO'} (media S5 ${(m5 * 100).toFixed(1)}% vs S6 ${(m6 * 100).toFixed(1)}%)`);