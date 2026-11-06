// ============================================================
// probe-pacing.mjs — SONDA DE RITMO DEL DIRECTOR DE OLAS
//
// Mide el TIEMPO MUERTO de una etapa: cuánto se pasa sin ningún enemigo
// normal vivo mientras la etapa sigue. El modelo es deliberadamente
// simple y determinista:
//
//   · corre el WaveManager real (cola, escalonado, aviso de jefe);
//   · cada enemigo muere `--kill=` segundos después de entrar (modelo de
//     jugador constante: no simula torres ni daño);
//   · se cuentan los frames con 0 enemigos normales vivos.
//
// Es el instrumento para comparar ANTES/DESPUÉS de cambiar el scheduler.
// No forma parte del juego.
//
//   node scripts/probe-pacing.mjs [--kill=2] [--stages=1,5,6,10,20,30,40,50]
//                                 [--seeds=3] [--dt=0.05]
// ============================================================

import { WaveManager } from '../js/waves-manager.js';
import { CONFIG } from '../js/engine.js';
import { parseStages } from './balance-sim.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const KILL = Number(args.kill ?? 2);
const DT = Number(args.dt ?? 0.05);
const SEEDS = Number(args.seeds ?? 3);
const STAGES = parseStages(args.stages ?? '1,5,6,10,20,30,40,50');
const MAX_T = Number(args.max ?? 900);

/** Corre UNA etapa con el modelo de killer constante. */
function runStage(stage, seed) {
  const enemies = [];
  let clock = 0;
  let ended = false;
  const events = [];
  const game = {
    fortress: { enemies },
    engine: {
      emit: (name, payload) => events.push({ name, payload, t: clock }),
      addEntity: (e) => { e._born = clock; },
    },
  };
  const wm = new WaveManager(stage, { seed });
  wm.onWavesDone(() => { ended = true; });
  wm.onBossDead(() => { ended = true; });

  let firstSpawn = null;
  let idle = 0;          // segundos con 0 normales vivos
  let run = 0;           // racha actual
  let longest = 0;
  let deadSpells = 0;    // rachas > 1 s
  let inSpell = false;
  let maxAlive = 0;
  let totalSpawns = 0;
  let lastDispatch = 0;
  const dispatchTimes = [];

  while (clock < MAX_T && !ended) {
    wm.update(DT, game);
    wm.checkBossDead();
    clock += DT;

    // Modelo de muerte: cada enemigo vive KILL segundos.
    for (const e of enemies) {
      if (!e.dead && e._born != null && clock - e._born >= KILL) e.dead = true;
    }
    // Compactado como game.js:1835.
    let w = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e && !e.dead) enemies[w++] = e;
    }
    enemies.length = w;

    const aliveNormals = enemies.filter((e) => !e.isBoss).length;
    if (aliveNormals > 0 && firstSpawn == null) firstSpawn = clock;
    maxAlive = Math.max(maxAlive, aliveNormals);
    if (firstSpawn != null && !ended) {
      if (aliveNormals === 0) {
        idle += DT;
        run += DT;
        if (run > longest) longest = run;
        if (run > 1 && !inSpell) { deadSpells += 1; inSpell = true; }
      } else {
        run = 0;
        inSpell = false;
      }
    }
    if (wm.dispatched > dispatchTimes.length) {
      dispatchTimes.push(clock);
      lastDispatch = clock;
    }
  }

  const duration = clock;
  const gaps = [];
  for (let i = 1; i < dispatchTimes.length; i++) gaps.push(dispatchTimes[i] - dispatchTimes[i - 1]);
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  return {
    stage, seed, duration, idle, idlePct: duration > 0 ? (idle / duration) * 100 : 0,
    longest, deadSpells, maxAlive, waves: wm.dispatched, avgGap,
    ended,
  };
}

const rows = [];
for (const s of STAGES) {
  const runs = [];
  for (let k = 0; k < SEEDS; k++) runs.push(runStage(s, 1000 + k * 7919 + s));
  const avg = (k) => runs.reduce((a, r) => a + r[k], 0) / runs.length;
  rows.push({
    stage: s,
    duration: Math.round(avg('duration')),
    waves: Math.round(avg('waves')),
    avgGap: avg('avgGap').toFixed(1),
    idle: Math.round(avg('idle')),
    idlePct: Math.round(avg('idlePct')),
    longest: avg('longest').toFixed(1),
    deadSpells: Math.round(avg('deadSpells')),
    maxAlive: Math.round(avg('maxAlive')),
    ended: runs.every((r) => r.ended),
  });
}

console.log(`probe-pacing — kill=${KILL}s · dt=${DT} · ${SEEDS} semillas/etapa\n`);
console.log('| Etapa | duración | olas | gap medio | sin enemigos | % muerto | racha máx | rachas >1 s | máx vivos | cerró |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.stage} | ${r.duration}s | ${r.waves} | ${r.avgGap}s | ${r.idle}s | ${r.idlePct}% | ${r.longest}s | ${r.deadSpells} | ${r.maxAlive} | ${r.ended ? 'sí' : 'NO'} |`);
}
const totIdle = rows.reduce((a, r) => a + r.idle, 0);
const totDur = rows.reduce((a, r) => a + r.duration, 0);
console.log(`\nTiempo muerto total: ${totIdle}s de ${totDur}s (${Math.round((totIdle / totDur) * 100)} %)`);
