// scripts/probe-s6.mjs — diagnóstico de hambruna de XP en stages procedurales
// (balance v7: "stage 6 — no maté casi ningún enemigo con la torre básica").
//
// Replica la economía REAL del sim (balance-sim.mjs) pero con dos diferencias:
//   1. Hace las OLAS deterministas por run: siembra Math.random con la semilla
//      de la run (WaveManager usa (Math.random()*1e9)|0 en waves.js:356).
//   2. Reporta por-seed: win, duración, hpFrac, leaks, kills, lv, tToLv2 y un
//      resumen de la APERTURA (t<40) del generador (heavy / spore-vee / crystal
//      / rain-wall). Sirve para ANTES/DESPUÉS con las MISMAS semillas.
//
// Uso: node scripts/probe-s6.mjs [--stage=6] [--seeds=25] [--mode=greedy|tardy]

import { Enemy, collideProjectiles } from '../js/enemies.js';
import { Fortress, ULT_BOSS_CHARGES, BLACK_HOLE_BOSS_CHARGES } from '../js/player.js';
import { WaveManager } from '../js/waves-manager.js';
import {
  multForStreak, applyXp, overflowScore, MAX_LEVEL_PER_STAGE,
} from '../js/score.js';
// La economía de una baja (score + XP) la comparte con Game._onKill.
import { resolveKillScore, resolveKillXp } from '../js/economy.js';
import { BASE_HP_BY_STAGE } from '../js/stages.js';
import { rollOffer, applyCard } from '../js/cards.js';
import { saveMeta, META_TOWERS } from '../js/meta.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const STAGE = Number(args.stage ?? 6);
const SEEDS = Number(args.seeds ?? 25);
const MODE = args.mode ?? 'greedy';
const OPEN_T = 40; // misma ventana que define el Cambio A (waves.js)

const fakeStorage = (() => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
})();

/** Fija TODAS las torretas meta a 1 (cuenta fresca, piso sin meta). */
function setMetaLevel(level) {
  const levels = {};
  const unlocked = {};
  for (const t of META_TOWERS) {
    levels[t.key] = level;
    unlocked[t.key] = true; // el probe mide el arsenal completo
  }
  saveMeta({ levels, fragsPool: 0, unlocked, victories: 0 }, fakeStorage);
}

// ---------- stub de engine (mismo que balance-sim.mjs, sin render) ----------
class EngineStub {
  constructor() {
    this.entities = [];
    this.effects = [];
    this.particles = [];
    this.state = 'PLAYING';
    this.timeScale = 1;
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

// RNG determinista (xorshift32), reemplaza Math.random por run.
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return (s % 1_000_000_007) / 1_000_000_007;
  };
}

// ---------- economía de kill (misma implementación que Game._onKill) ----------
function onKill(game, enemy) {
  game.kills += 1;
  const reward = resolveKillScore(enemy, {
    mult: game.mult,
    timeScale: game.engine.timeScale,
    scoreMul: game.fortress.scoreMul ?? 1,
    carry: game._spawnScoreCarry,
  });
  game._spawnScoreCarry = reward.carry;
  game.score += reward.gained;
  game.streak += 1;
  game.mult = multForStreak(game.streak);
  // dev-7 fase 64: la economía viva, sin copias locales — `xpForKill` (el XP
  // escala con el stage desde la 59.3) y el bucle de level-up con `applyXp`
  // (tope de cartas de la etapa + score de desborde), igual que main.js.
  // ANTES acá se usaba el `base` plano y `xpForLevel(lv)` SIN stage: este
  // probe medía una curva que el juego ya no usa, así que sus tablas
  // históricas (fase 28) NO son comparables con lo que imprima ahora.
  const r = applyXp(game.lv, game.xp, resolveKillXp(enemy, {
    stage: game.stageId,
    bonusFrac: enemy?.data?.dropXpBonusFrac ?? 0,
    xpMul: game.fortress.xpMul ?? 1,
  }), game.stageId, game.maxLevel);
  game.lv = r.lv;
  game.xp = r.xp;
  if (r.overflow > 0) game.score += overflowScore(r.overflow, game.stageId);
  const levels = r.ups;
  game.fortress.chargeUltimate(enemy?.isBoss ? ULT_BOSS_CHARGES : 1);
  game.fortress.chargeBlackHole(enemy?.isBoss ? BLACK_HOLE_BOSS_CHARGES : 1);
  return levels;
}

function pickCard(offer, lv, mode) {
  if (!offer.length) return null;
  const unlock = offer.find((c) => c.tower);
  if (mode === 'tardy') {
    if (unlock && [2, 4, 6, 8].includes(lv)) return unlock;
    return offer.find((c) => !c.tower) ?? offer[0];
  }
  return unlock ?? offer[0];
}

/** Resumen de la ventana de apertura de una tabla de olas (t < OPEN_T). */
function openingSummary(waves) {
  const open = waves.filter((w) => w.t < OPEN_T);
  return {
    nOpen: open.length,
    heavy: open.filter((w) => w.type === 'miniBlob' || w.type === 'blob').length,
    sporeVee: open.filter((w) => w.type === 'spore' && w.pattern === 'vee').length,
    crystal: open.filter((w) => w.type === 'crystal').length,
    rainWall: open.filter((w) => w.pattern === 'rain' || w.pattern === 'wall').length,
    openEndsAt: open.length ? open[open.length - 1].t : 0,
  };
}

function runStage(stageId, mode, seed) {
  setMetaLevel(1); // piso: cuenta fresca sin meta
  const rng = makeRng(seed);
  Math.random = rng; // olas (WaveManager) + enemigos deterministas por run

  const engine = new EngineStub();
  const game = {
    engine, stageId, lv: 1, xp: 0, score: 0, streak: 0, mult: 1, kills: 0,
    timer: 0, _leaks: 0,
    // Mismos topes que la run real: tope de cartas de la etapa y la fracción
    // de score que arrastran las crías (economy.js).
    maxLevel: MAX_LEVEL_PER_STAGE,
    _spawnScoreCarry: 0,
  };
  game.fortress = new Fortress(game);
  game.fortress.maxHp = BASE_HP_BY_STAGE[stageId] ?? 3000;
  game.fortress.hp = game.fortress.maxHp;
  game.fortress.addTower('guardian');

  const wm = new WaveManager(stageId);
  const waves = [...wm.queue]; // snapshot del generador (queue completo al construir)
  const opening = openingSummary(waves);
  let cleared = false;
  wm.onBossDead(() => { cleared = true; });
  wm.onWavesDone(() => { cleared = true; });
  engine.on('enemy:reached', () => { game._leaks += 1; });

  const pendingLevels = [];
  let tToLv2 = null;
  engine.on('enemy:killed', (e) => {
    const levels = onKill(game, e);
    if (tToLv2 === null && levels.length) tToLv2 = game.timer;
    pendingLevels.push(...levels);
  });

  const DT = 1 / 30;
  const MAX_T = 700;
  let t = 0;
  let dead = false;

  while (!cleared && !dead && t < MAX_T) {
    t += DT;
    game.timer = t;
    for (const e of engine.entities) e.update(DT);
    for (let i = engine.entities.length - 1; i >= 0; i--) {
      if (engine.entities[i].dead) engine.entities.splice(i, 1);
    }
    wm.update(DT, game);
    wm.checkBossDead();
    collideProjectiles(engine, game.fortress.enemies);
    game.fortress.enemies = game.fortress.enemies.filter((e) => !e.dead);
    game.fortress.update(DT);
    if (game.fortress.hp <= 0) dead = true;

    while (pendingLevels.length) {
      const lv = pendingLevels.shift();
      const offer = rollOffer(game, rng);
      const card = pickCard(offer, lv, mode);
      if (card) applyCard(card, game);
    }
  }

  return {
    win: cleared && !dead,
    duration: t,
    hpFrac: Math.max(0, game.fortress.hp) / game.fortress.maxHp,
    leaks: game._leaks,
    kills: game.kills,
    lv: game.lv,
    tToLv2: tToLv2,
    opening,
    degenerate: cleared && !dead && game.kills < 30 && game.lv < 3,
  };
}

// ---------- main ----------
console.log(`probe-s6 (${STAGE}) — semillas ${SEEDS}, modo=${MODE}, apertura t<${OPEN_T}s\n`);
console.log('| seed | win | dur | HP fin | leaks | kills | Lv | t→Lv2 | heavy | sporeVee | cryst | rain/wall |');
console.log('|------|-----|-----|--------|-------|-------|----|-------|-------|----------|-------|-----------|');

const runs = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const r = runStage(STAGE, MODE, seed * 7919 + STAGE);
  runs.push(r);
  const o = r.opening;
  console.log(`| ${String(seed).padStart(4)} | ${r.win ? '✓' : '✗'} | ${r.duration.toFixed(0).padStart(3)} s | `
    + `${Math.round(r.hpFrac * 100).toString().padStart(2)}% | ${String(r.leaks).padStart(4)} | `
    + `${String(r.kills).padStart(4)} | ${String(r.lv).padStart(2)} | `
    + `${(r.tToLv2 === null ? '—' : r.tToLv2.toFixed(0)).padStart(5)} | `
    + `${o.heavy} | ${o.sporeVee} | ${o.crystal} | ${o.rainWall} |`);
}

const wins = runs.filter((r) => r.win).length;
const avg = (k) => runs.reduce((s, r) => s + (r[k] ?? 0), 0) / runs.length;
const deg = runs.filter((r) => r.degenerate).length;
const t2 = runs.map((r) => r.tToLv2).filter((v) => v !== null);
const t2Fast = t2.filter((v) => v <= 30).length;
console.log('\nResumen:');
console.log(`  win ${wins}/${runs.length} (${Math.round(100 * wins / runs.length)}%) · HP fin ${Math.round(avg('hpFrac') * 100)}% · leaks ${avg('leaks').toFixed(1)} · kills ${avg('kills').toFixed(1)} · Lv fin ${avg('lv').toFixed(1)}`);
console.log(`  tToLv2: min ${t2.length ? Math.min(...t2).toFixed(0) : '—'} s · ≤30s en ${t2Fast}/${runs.length} runs · nunca: ${runs.length - t2.length}`);
console.log(`  wins degeneradas (win && kills<30 && lv<3): ${deg}/${runs.length}`);