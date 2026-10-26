#!/usr/bin/env node
// ============================================================
// scripts/probe-xp.mjs — fase 59.3: el XP disponible por stage.
//
// Para cada stage: cuántos enemigos trae la cola de olas, cuánto SCORE
// (y por tanto cuánto XP plano) valen en total, y cómo queda eso con un
// XP por kill que escala con el HP del stage (hpMul de stages.js).
//
// Es la medida que hace falta para calibrar la curva de XP: sin saber
// cuántos puntos hay en juego no se puede elegir la curva.
// ============================================================

import { WaveManager, waveGroups } from '../js/waves.js';
import { scaleFor } from '../js/stages.js';
import { ENEMY_TYPES } from '../js/enemies.js';

console.log('| Stage | enemigos | score total | xpMul | XP ×hpMul |');
console.log('|-------|----------|-------------|-------|-----------|');

for (let stage = 1; stage <= 50; stage++) {
  const wm = new WaveManager(stage, { powerMul: 1 });
  let n = 0;
  let score = 0;
  for (const w of wm.queue) {
    for (const g of waveGroups(w)) {
      if (g.type === 'boss' || g.pattern === 'boss') continue;
      const cnt = g.count ?? 1;
      const data = ENEMY_TYPES[g.type];
      n += cnt;
      score += (data?.score ?? 0) * cnt;
    }
  }
  const { hpMul } = scaleFor(stage);
  console.log(`| ${stage} | ${n} | ${score} | ${hpMul.toFixed(2)} | ${Math.round(score * hpMul)} |`);
}
