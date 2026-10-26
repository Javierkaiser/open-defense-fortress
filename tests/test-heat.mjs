// tests/test-heat.mjs — fase 69
// Cubre el contrato PURO del Protocolo/Heat (js/heat.js): las 11
// condiciones con sus rangos y costes, el heat total (0..49), los presets
// I-V, el mapeo a diales (heat 0 = todo neutro) y las recompensas/hitos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEAT_CONDS, HEAT_PRESETS, HEAT_MILESTONES, HEAT_MAX_TOTAL,
  normalizeHeatMods, heatTotal, heatMods, presetMods, presetFor,
  heatRewardMul, heatMilestoneBonus,
} from '../js/heat.js';

test('heat: 11 condiciones, rangos válidos y 49 de heat máximo', () => {
  assert.equal(HEAT_CONDS.length, 11);
  const ids = HEAT_CONDS.map((c) => c.id);
  assert.deepEqual(ids, [
    'asedio', 'leva', 'vigor', 'prisa', 'elites', 'jefes',
    'censura', 'apagon', 'arsenal', 'dobles', 'fragilidad',
  ]);
  for (const c of HEAT_CONDS) {
    assert.ok(c.name && c.desc, `${c.id}: nombre y descripción`);
    assert.ok(Number.isInteger(c.ranks) && c.ranks >= 1, `${c.id}: rangos`);
    assert.equal(c.heat.length, c.ranks, `${c.id}: un coste por rango`);
    assert.ok(c.heat.every((h) => h >= 1), `${c.id}: coste positivo`);
  }
  assert.equal(HEAT_MAX_TOTAL, 49);
  const max = Object.fromEntries(HEAT_CONDS.map((c) => [c.id, c.ranks]));
  assert.equal(heatTotal(max), 49, 'todos los rangos al máximo = 49');
  assert.deepEqual(HEAT_MILESTONES, [5, 10, 20, 35]);
});

test('heat: los presets I-V cuestan 5/10/16/24/35', () => {
  const totals = HEAT_PRESETS.map((p) => [p.id, heatTotal(p.mods)]);
  assert.deepEqual(totals, [['I', 5], ['II', 10], ['III', 16], ['IV', 24], ['V', 35]]);
  // Cada preset sólo usa ids conocidos y rangos válidos.
  for (const p of HEAT_PRESETS) {
    for (const [id, rank] of Object.entries(p.mods)) {
      const c = HEAT_CONDS.find((x) => x.id === id);
      assert.ok(c, `${p.id}: condición desconocida ${id}`);
      assert.ok(rank >= 1 && rank <= c.ranks, `${p.id}: ${id} fuera de rango`);
    }
  }
});

test('heat: heat 0 deja TODOS los diales neutros (fase 68 exacta)', () => {
  const m = heatMods({});
  assert.equal(m.heat, 0);
  assert.equal(m.hpMul, 1);
  assert.equal(m.velMul, 1);
  assert.equal(m.countMul, 1);
  assert.equal(m.leakMul, 1);
  assert.equal(m.baseHpMul, 1);
  assert.equal(m.offerCount, 3);
  assert.equal(m.variantChanceAdd, 0);
  assert.equal(m.variantFracAdd, 0);
  assert.equal(m.doubleAffix, false);
  assert.equal(m.bossHpMul, 1);
  assert.equal(m.bossEscort, 0);
  assert.equal(m.noUlt, false);
  assert.equal(m.slotDelta, 0);
});

test('heat: cada condición mueve SU dial (y sólo el suyo)', () => {
  assert.equal(heatMods({ vigor: 2 }).hpMul, 1.12);
  assert.equal(heatMods({ prisa: 2 }).velMul, 1.1);
  assert.equal(heatMods({ leva: 3 }).countMul, 1.24);
  assert.equal(heatMods({ asedio: 4 }).leakMul, 1.6);
  assert.equal(heatMods({ fragilidad: 2 }).baseHpMul, 0.84);
  assert.equal(heatMods({ censura: 2 }).offerCount, 1);
  assert.equal(heatMods({ elites: 2 }).variantChanceAdd, 0.1);
  assert.equal(heatMods({ elites: 2 }).variantFracAdd, 0.06);
  assert.equal(heatMods({ jefes: 2 }).bossHpMul, 1.2);
  assert.equal(heatMods({ jefes: 2 }).bossEscort, 4);
  assert.equal(heatMods({ dobles: 1 }).doubleAffix, true);
  assert.equal(heatMods({ apagon: 1 }).noUlt, true);
  assert.equal(heatMods({ arsenal: 1 }).slotDelta, -1);
  // Aislamiento: vigor no toca la oferta ni el leak.
  const soloVigor = heatMods({ vigor: 1 });
  assert.equal(soloVigor.offerCount, 3);
  assert.equal(soloVigor.leakMul, 1);
});

test('heat: la normalización clampa, descarta basura y no persiste ceros', () => {
  const r = normalizeHeatMods({
    asedio: 99, leva: -3, vigor: '2', prisa: 1.9, elites: 'x', desconocida: 4,
  });
  assert.deepEqual(r, { asedio: 4, vigor: 2, prisa: 1 });
  assert.deepEqual(normalizeHeatMods(null), {});
  assert.deepEqual(normalizeHeatMods('no soy un objeto'), {});
  assert.equal(heatTotal({ asedio: 2 }), 2, 'el coste por rango es acumulativo');
  assert.equal(heatTotal({ jefes: 2 }), 9, '3 + 6');
});

test('heat: presetFor reconoce un preset exacto y marca el personalizado', () => {
  assert.equal(presetFor(presetMods('II'))?.id, 'II');
  assert.equal(presetFor({ asedio: 1 }), null);
  assert.deepEqual(presetMods('nope'), {});
});

test('heat: recompensa ×(1 + 0,08·heat) y hitos únicos', () => {
  assert.equal(heatRewardMul(0), 1);
  assert.equal(heatRewardMul(5), 1.4);
  assert.equal(heatRewardMul(10), 1.8);
  assert.ok(Math.abs(heatRewardMul(20) - 2.6) < 1e-9);
  assert.equal(heatRewardMul(-5), 1);
  assert.ok(Math.abs(heatRewardMul(100) - 4.92) < 1e-9, 'clamp a 49');
  assert.equal(heatMilestoneBonus(5), 60);
  assert.equal(heatMilestoneBonus(10), 120);
  assert.equal(heatMilestoneBonus(20), 240);
  assert.equal(heatMilestoneBonus(35), 420);
  assert.equal(heatMilestoneBonus(7), 0, 'sólo los hitos declarados');
});
