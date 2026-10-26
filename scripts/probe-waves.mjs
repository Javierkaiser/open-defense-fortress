// ============================================================
// probe-waves.mjs — SONDA DEL DIRECTOR DE OLAS (fase 65)
//
// Mide la COMPOSICIÓN que produce `generateStageWaves()` (no la partida):
// variedad, familias, mezcla, escalonado, cristales, variantes y HP total
// por etapa. Es el instrumento rápido (segundos, sin motor) para comparar
// ANTES/DESPUÉS de un cambio de director, y el que fija la guarda del
// presupuesto de HP (±10 % por etapa).
//
//   node scripts/probe-waves.mjs [--seeds=20] [--stages=1,5,6,10,20,30,40,50] [--full]
//
// `--stages` acepta listas y rangos hasta la etapa 200 (`--stages=51-60`,
// `--stages=50,51,55,60`): el modo infinito (fase 67) se mide con el mismo
// parser que balance-sim. `--full` recorre las 50 etapas de la campaña
// (lento: 50 × seeds).
// No forma parte del juego: es herramienta de medición.
// ============================================================

import * as W from '../js/waves.js';
import { ENEMY_TYPES, ENEMY_VARIANTS } from '../js/enemies.js';
import { ENEMY_FAMILY_BY_TYPE } from '../js/damagetypes.js';
import { scaleFor } from '../js/stages.js';
import { parseStages } from './balance-sim.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const SEEDS = Number(args.seeds ?? 20);
const FAMILIAS = args.familias === '' || args.familias === 'true' || args.familias === '1';
const FULL = args.full === '' || args.full === 'true' || args.full === '1';
const STAGES = FULL
  ? Array.from({ length: 50 }, (_, i) => i + 1)
  // Mismo parser que el sim (rangos + etapas 51..200 del modo infinito).
  : parseStages(args.stages ?? '1,5,6,10,20,30,40,50');

/** Banda de velocidad de un tipo (si el módulo la expone). */
const bandOf = {};
for (const [b, types] of Object.entries(W.VEL_BANDS ?? {})) for (const t of types) bandOf[t] = b;

/** Métricas de UNA tabla de olas. */
function metricsOf(waves, stage) {
  const hpMul = scaleFor(stage).hpMul;
  const fams = { rock: 0, crystal: 0, spore: 0, virus: 0 };
  const types = new Set();
  const patterns = new Set();
  const archetypes = new Set();
  const archClassic = new Set();
  let groups = 0, enemies = 0, hpTotal = 0, xpTotal = 0;
  let withCrystal = 0, withTank = 0, variants = 0;
  let classic = 0, classicCrystal = 0;
  let strongestStagger = 0, delays = 0;
  const speedGaps = [];
  const classicGaps = [];
  for (const w of waves) {
    const gs = (W.waveGroups(w)).filter((g) => g.type !== 'boss');
    if (!gs.length) continue;
    groups += gs.length;
    const isClassic = (w.t ?? 0) >= (W.OPEN_T ?? 40);
    if (isClassic) classic++;
    let waveCrystal = false;
    let waveTank = false;
    for (const g of gs) {
      types.add(g.type);
      patterns.add(g.pattern ?? 'rain');
      fams[ENEMY_FAMILY_BY_TYPE[g.type]] += g.count;
      enemies += g.count;
      const baseHp = ENEMY_TYPES[g.type]?.hp ?? 0;
      // fase 68: una variante cambia el HP que hay que tumbar (rapido ×0,7,
      // escudado suma su escudo) y el XP que entrega (scoreMul). Sin esto la
      // sonda mediría un infinito con 7 afijos como si fueran normales.
      const vdef = g.variant ? ENEMY_VARIANTS?.[g.variant] : null;
      const vHp = (vdef?.hpMul ?? 1) * (1 + (vdef?.shieldFrac ?? 0));
      hpTotal += baseHp * hpMul * g.count * vHp;
      xpTotal += (ENEMY_TYPES[g.type]?.score ?? 0) * g.count * (vdef?.scoreMul ?? 1);
      if (g.variant) variants += g.count;
      if (g.type === 'crystal') waveCrystal = true;
      if (bandOf[g.type] === 'tanque') waveTank = true;
      if (Number.isFinite(g.stagger)) strongestStagger = Math.max(strongestStagger, g.stagger);
      if (Number.isFinite(g.delay)) delays = Math.max(delays, g.delay);
    }
    if (waveCrystal) { withCrystal++; if (isClassic) classicCrystal++; }
    if (waveTank) withTank++;
    const bands = [...new Set(gs.map((g) => bandOf[g.type]).filter(Boolean))];
    if (bands.length > 1 && typeof W.bandSpeed === 'function') {
      const sp = bands.map((b) => W.bandSpeed(b));
      const gap = Math.max(...sp) - Math.min(...sp);
      speedGaps.push(gap);
      if (isClassic) classicGaps.push(gap);
    }
    if (typeof W.archetypeOf === 'function') {
      const a = W.archetypeOf(w);
      if (a) {
        archetypes.add(a);
        if (isClassic) archClassic.add(a);
      }
    }
  }
  const totalFam = Object.values(fams).reduce((a, b) => a + b, 0) || 1;
  const famPct = Object.fromEntries(
    Object.entries(fams).map(([k, v]) => [k, Math.round((v / totalFam) * 100)]),
  );
  const dom = Object.entries(famPct).sort((a, b) => b[1] - a[1])[0];  const avgGap = speedGaps.length ? speedGaps.reduce((a, b) => a + b, 0) / speedGaps.length : 0;
  const avgClassicGap = classicGaps.length
    ? classicGaps.reduce((a, b) => a + b, 0) / classicGaps.length : 0;
  return {
    stage, waves: waves.length, groups, enemies, hpTotal: Math.round(hpTotal),
    xpTotal: Math.round(xpTotal),
    types: types.size, patterns: patterns.size, archetypes: archetypes.size,
    archetypesClassic: archClassic.size,
    groupsPerWave: groups / Math.max(1, waves.length),
    crystalPct: Math.round((withCrystal / Math.max(1, waves.length)) * 100),
    crystalClassicPct: Math.round((classicCrystal / Math.max(1, classic)) * 100),
    tankPct: Math.round((withTank / Math.max(1, waves.length)) * 100),
    variantPct: Math.round((variants / Math.max(1, enemies)) * 100),
    famPct, domFamily: dom[0], domPct: dom[1],
    speedGap: Math.round(avgGap), classicGap: Math.round(avgClassicGap),
    strongestStagger, maxDelay: delays,
  };
}

/** Promedia las métricas de todas las semillas de una etapa. */
function stageRow(stage) {
  const runs = [];
  for (let s = 0; s < SEEDS; s++) {
    runs.push(metricsOf(W.generateStageWaves(stage, 1000 + s * 7919 + stage), stage));
  }
  const avg = (k) => runs.reduce((a, r) => a + r[k], 0) / runs.length;
  const waves = runs[0].waves;
  const sum = (k) => runs.reduce((a, r) => a + r[k], 0);
  // La familia dominante se calcula sobre las medias por familia (si no,
  // la columna mezclaba la dominante de la semilla 0 con el % medio).
  const famAvg = {};
  for (const f of ['rock', 'crystal', 'spore', 'virus']) {
    famAvg[f] = Math.round(runs.reduce((a, r) => a + (r.famPct[f] ?? 0), 0) / runs.length);
  }
  const domFam = Object.entries(famAvg).sort((a, b) => b[1] - a[1])[0];
  return {
    stage,
    waves: Math.round(avg('waves')),
    enemies: Math.round(avg('enemies')),
    groupsPerWave: avg('groupsPerWave').toFixed(1),
    types: avg('types').toFixed(1),
    patterns: avg('patterns').toFixed(1),
    archetypes: avg('archetypes').toFixed(1),
    crystalPct: Math.round(avg('crystalPct')),
    crystalClassicPct: Math.round(avg('crystalClassicPct')),
    tankPct: Math.round(avg('tankPct')),
    variantPct: Math.round(avg('variantPct')),
    dom: `${domFam[0]} ${domFam[1]}%`,
    speedGap: Math.round(avg('speedGap')),
    classicGap: Math.round(avg('classicGap')),
    stagger: avg('strongestStagger').toFixed(2),
    hpK: Math.round(sum('hpTotal') / runs.length / 1000),
    xpK: Math.round(sum('xpTotal') / runs.length / 1000),
    wavesSum: waves,
  };
}

console.log(`probe-waves — ${SEEDS} semillas por etapa\n`);
console.log('| Etapa | olas | enemigos | grupos/ola | tipos | patrones | arquetipos | %cristal | %cristal clásico | %tanque | %variante | familia dom | gap vel | gap clásico | stagger máx | HP/etapa | XP/etapa |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
let totHp = 0;
for (const s of STAGES) {
  const r = stageRow(s);
  totHp += r.hpK;
  console.log(`| ${r.stage} | ${r.waves} | ${r.enemies} | ${r.groupsPerWave} | ${r.types} | ${r.patterns} | ${r.archetypes} | ${r.crystalPct}% | ${r.crystalClassicPct}% | ${r.tankPct}% | ${r.variantPct}% | ${r.dom} | ${r.speedGap} | ${r.classicGap} | ${r.stagger} | ${r.hpK}k | ${r.xpK}k |`);
}
console.log(`\nHP total sumado de las etapas medidas: ${totHp}k`);

// --familias: reparto COMPLETO por familia (roca/cristal/espora/virus) y
// el bioma DECLARADO por poolForStage (lo que el selector de etapa muestra).
// Sirve para calibrar los pesos del bioma contra lo que sale de verdad.
if (FAMILIAS) {
  console.log('\nreparto por familia (medido, % de enemigos) — pool declarado\n');
  console.log('| Etapa | roca | cristal | espora | virus | dominante | declarado |');
  console.log('|---|---|---|---|---|---|---|');
  for (const s of STAGES) {
    const runs = [];
    for (let k = 0; k < SEEDS; k++) runs.push(metricsOf(W.generateStageWaves(s, 1000 + k * 7919 + s), s));
    const keys = ['rock', 'crystal', 'spore', 'virus'];
    const avg = Object.fromEntries(keys.map((f) => [f, Math.round(
      runs.reduce((a, r) => a + (r.famPct[f] ?? 0), 0) / runs.length,
    )]));
    const dom = keys.reduce((a, b) => (avg[b] > avg[a] ? b : a), keys[0]);
    const pool = typeof W.poolForStage === 'function' ? W.poolForStage(s) : [];
    const declared = {};
    for (const p of pool) declared[p.family] = (declared[p.family] ?? 0) + p.weight;
    const decStr = Object.entries(declared)
      .sort((a, b) => b[1] - a[1]).map(([f, w]) => `${f} ${Math.round(w)}`).join(' · ');
    console.log(`| ${s} | ${avg.rock}% | ${avg.crystal}% | ${avg.spore}% | ${avg.virus}% | ${dom} ${avg[dom]}% | ${decStr} |`);
  }
}
