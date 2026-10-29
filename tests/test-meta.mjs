// tests/test-meta.mjs — dev-7 fase 9
// Cubre meta.js: nombres de META_TOWERS, curva de costo/daño del sistema
// v6 (100 niveles), y normalización de datos guardados. Incluye un test
// de REGRESIÓN explícito para el bug de fase 8 (nombre "Láser" duplicado
// entre la torre Beam y la torre Láser real).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  META_TOWERS, META_MAX_LEVEL, PERK_EVERY, PERK_TIERS, META_DMG_PER_LEVEL,
  PERK_SCHEMA_VERSION,
  META_GOLD_START, META_GOLD_PER_CLEAR, META_GOLD_PER_VICTORY, PERK_RESET_COST,
  META_FRAG_PER_VICTORY, META_FIRST_CLEAR_MULT, rewardVictory, rewardFrags,
  normalizeMeta, fragCost, perkCount, metaDmgMul, PERKS, perkMods, mergeMods,
  defaultMeta, loadMeta, saveMeta, resetMeta,
  tierAtLevel, getPerkOptions, pendingPerkTiers, setPerkChoice,
  metaGold, rewardGold, resetPerks,
  META_SLOW_BASE, META_SLOW_CAP, metaSlowFrac,
  META_MILESTONES, META_MILESTONE_DMG_PER_HIT, milestoneDmgMul, towerMilestones,
  perkDmgFor, META_RANKS, playerRank, playerLevel,
  upgradePlan, pendingUpgrades, upgradeAllTowers, pendingUpgradeCost,
  towerIconFit,
} from '../js/meta.js';
import { TOWERS, DRONES } from '../js/towers.js';
import { rigBox, TOWER_RIGS } from '../js/tower-art.js';

test('META_TOWERS: 11 entradas (9 torres/drones + Avispas fase 21 + Láser fase 22), keys únicas', () => {
  assert.equal(META_TOWERS.length, 11);
  const keys = META_TOWERS.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('META_TOWERS: nombres únicos entre sí (sin duplicados internos)', () => {
  const names = META_TOWERS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length,
    `nombres duplicados en META_TOWERS: ${names.join(', ')}`);
});

test('META_TOWERS: incluye a Avispas (regresión fase 21 — había quedado excluido)', () => {
  const wasps = META_TOWERS.find((t) => t.type === 'wasps');
  assert.ok(wasps, 'Avispas no está en META_TOWERS');
  assert.equal(wasps.name, 'Dron Avispas');
});

test('META_TOWERS: incluye a Láser (regresión fase 22 — había quedado excluido)', () => {
  const laser = META_TOWERS.find((t) => t.type === 'laser');
  assert.ok(laser, 'Láser no está en META_TOWERS');
  assert.equal(laser.name, 'Láser');
});

test('META_TOWERS: cada nombre coincide EXACTO con el real de towers.js/DRONES (fase 21)', () => {
  // Regresión más amplia que la de fase 8 (que solo arregló la colisión
  // Beam/Láser sin tocar el resto): ahora exige coincidencia exacta,
  // no solo "que no choque con otro nombre real".
  const realNames = new Map();
  for (const [type, def] of Object.entries(TOWERS)) realNames.set(type, def.name);
  for (const [type, def] of Object.entries(DRONES)) realNames.set(type, def.name);
  for (const t of META_TOWERS) {
    assert.equal(t.name, realNames.get(t.type),
      `META_TOWERS['${t.key}'] dice "${t.name}" pero towers.js lo llama "${realNames.get(t.type)}"`);
  }
});

test('META_TOWERS: ningún nombre choca con OTRA torre/dron real (regresión fase 8)', () => {
  // Bug real: META_TOWERS llamaba "Láser" al slot de Beam, pero
  // towers.js YA tiene una torre distinta literalmente llamada "Láser"
  // (kind 'laser', arsenal extendido). Este test generaliza el caso:
  // ningún nombre de fantasía puede coincidir con el nombre real de una
  // torre/dron que NO sea el que representa.
  const realNames = new Map(); // name -> type/kind real
  for (const [type, def] of Object.entries(TOWERS)) realNames.set(def.name, type);
  for (const [kind, def] of Object.entries(DRONES)) realNames.set(def.name, kind);

  for (const meta of META_TOWERS) {
    if (!realNames.has(meta.name)) continue; // nombre de fantasía propio: ok
    const realType = realNames.get(meta.name);
    assert.equal(realType, meta.type,
      `META_TOWERS['${meta.key}'] se llama "${meta.name}", igual que la `
      + `torre/dron real de tipo '${realType}' (distinto de '${meta.type}')`);
  }
});

test('fragCost: no decreciente en todo el rango 1..100', () => {
  let prev = -Infinity;
  for (let lv = 1; lv <= META_MAX_LEVEL; lv++) {
    const c = fragCost(lv);
    assert.ok(c >= prev, `fragCost bajó en nivel ${lv}`);
    prev = c;
  }
});

test('fragCost: primera década es la más barata (75)', () => {
  assert.equal(fragCost(1), 75);
  assert.equal(fragCost(10), 75);
});

test('metaDmgMul: 1× en nivel 1, curva ×18,82 + hitos en el techo real (nivel 100)', () => {
  const key = META_TOWERS[0].key;
  const type = META_TOWERS[0].type;
  const metaLv1 = normalizeMeta({ levels: { [key]: 1 } });
  const metaLv100 = normalizeMeta({ levels: { [key]: META_MAX_LEVEL } });
  assert.equal(metaDmgMul(type, metaLv1), 1);
  // dev-7 fase 59.3: la curva de nivel SUBE de +5 %/nivel a +18 %/nivel.
  // POR QUÉ: el HP total de la ola crece ×17,6 del S1 al S50 y el meta
  // sólo crecía ×3,2 — la distancia DPS-vs-HP se abría ×5,5 y el jugador
  // se quedaba en el Nvl 1,3 en el S50 (espiral de la muerte). Las cartas
  // no pueden tapar ese hueco: su techo es el catálogo (los CAPS).
  // Con +18 %/nivel la trayectoria real (Nvl.44 en el S50) da ×7,9.
  const curva = 1 + META_DMG_PER_LEVEL * (META_MAX_LEVEL - 1);
  assert.ok(curva > 18.8 && curva < 18.9,
    'si esto cambia, docs/BALANCE.md "Plan integral §3" queda desactualizado');
  // El valor real le SUMA los 4 hitos de la torre (+2% cada uno).
  assert.ok(Math.abs(metaDmgMul(type, metaLv100) - curva * milestoneDmgMul(type, metaLv100)) < 1e-9,
    'metaDmgMul debe incluir el bonus de hitos');
  assert.ok(Math.abs(milestoneDmgMul(type, metaLv100) - 1.08) < 1e-9,
    'en Nvl.100 la torre tiene los 4 hitos: +8% de daño');
});

test('perkCount: 1 perk cada 10 niveles (0 en nivel 9, 1 en nivel 10, 10 en nivel 100)', () => {
  const key = META_TOWERS[0].key;
  const type = META_TOWERS[0].type;
  assert.equal(perkCount(type, normalizeMeta({ levels: { [key]: 9 } })), 0);
  assert.equal(perkCount(type, normalizeMeta({ levels: { [key]: 10 } })), 1);
  assert.equal(perkCount(type, normalizeMeta({ levels: { [key]: 100 } })), META_MAX_LEVEL / PERK_EVERY);
});

test('normalizeMeta: tolera datos corruptos/fuera de rango sin tirar', () => {
  const m = normalizeMeta({ levels: { guardian: 99999, tesla: -5, gauss: 'x' }, frags: null, victories: -1 });
  assert.equal(m.levels.guardian, META_MAX_LEVEL); // clamp al techo
  assert.equal(m.levels.tesla, 1);                 // clamp al piso
  assert.equal(m.levels.gauss, 1);                 // no numérico → default
  assert.equal(m.victories, 0);
});

test('normalizeMeta: sin datos (cuenta nueva) da Nvl.1 en las 11 torretas/drones', () => {
  const m = normalizeMeta(null);
  for (const t of META_TOWERS) assert.equal(m.levels[t.key], 1);
});

test('resetMeta: vuelve exactamente al default, a través del storage inyectado (fase 14)', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const bumped = normalizeMeta({ levels: { guardian: 50 }, victories: 10 });
  saveMeta(bumped, storage);
  assert.notDeepEqual(loadMeta(storage), defaultMeta());
  const result = resetMeta(storage);
  assert.deepEqual(result, defaultMeta());
  assert.deepEqual(loadMeta(storage), defaultMeta());
});

// ---------- fase 16: estado nuevo (gold + perkChoices) ----------

test('defaultMeta: gold inicial y 10 tiers de perks sin elegir por torreta', () => {
  const d = defaultMeta();
  assert.equal(d.gold, META_GOLD_START);
  for (const t of META_TOWERS) {
    assert.equal(d.perkChoices[t.key].length, PERK_TIERS);
    assert.ok(d.perkChoices[t.key].every((v) => v === null),
      `${t.key}: esperaba tiers sin elegir (null)`);
  }
});

test('normalizeMeta: datos viejos sin gold/perkChoices dan defaults (sin crash)', () => {
  // Datos de jugadores pre-fase 16: sin los campos nuevos.
  const old = normalizeMeta({ levels: { guardian: 40 }, victories: 3 });
  assert.equal(old.gold, META_GOLD_START);
  assert.deepEqual(old.perkChoices.guardian, Array(PERK_TIERS).fill(null));
});

test('normalizeMeta: perkChoices tolera largo/valores inválidos y gold fuera de rango', () => {
  const m = normalizeMeta({
    gold: -50,
    perkChoices: {
      guardian: [0, 1, 'x', 2, -1, null, null, null, null, null, 1], // 11 valores
      tesla: 'no-array',
    },
  });
  assert.equal(m.gold, 0); // clamp al piso
  assert.deepEqual(m.perkChoices.guardian,
    [0, 1, null, null, null, null, null, null, null, null]);
  assert.deepEqual(m.perkChoices.tesla, Array(PERK_TIERS).fill(null));
});

// ---------- dev-7 fase 10: perks distintos por década (PERKS/perkMods) ----------

test('PERKS: las 11 torretas/drones de META_TOWERS tienen 10 tiers con 2 opciones A/B', () => {
  for (const t of META_TOWERS) {
    const table = PERKS[t.type];
    assert.ok(Array.isArray(table), `${t.type} sin tabla en PERKS`);
    assert.equal(table.length, PERK_TIERS, `${t.type} no tiene ${PERK_TIERS} tiers`);
    for (const tier of table) {
      assert.ok(tier.A && tier.B, `${t.type}: tier sin opciones A/B`);
    }
  }
});

test('fase 72: los perks de robo de vida usan la escala nueva y el texto coincide', () => {
  const labels = new Map([
    [0.01, '1%'], [0.015, '1,5%'], [0.02, '2%'], [0.025, '2,5%'],
    [0.03, '3%'], [0.04, '4%'], [0.06, '6%'],
  ]);
  let count = 0;
  for (const t of META_TOWERS) {
    for (const tier of PERKS[t.type]) {
      for (const perk of [tier.A, tier.B]) {
        const rate = perk.mods?.lifesteal;
        if (!rate) continue;
        count += 1;
        assert.ok(rate >= 0.01 && rate <= 0.06,
          `${t.type}: lifesteal ${rate} fuera de la escala 1-6 %`);
        assert.ok(perk.desc.includes(labels.get(rate)),
          `${t.type}: la descripción no dice ${labels.get(rate)}: ${perk.desc}`);
      }
    }
  }
  // Fase 1 — identidad: el robo de vida es de Beam y Avispas, no de las 11.
  // Antes había >= 30 opciones repartidas por todo el arsenal.
  const conLifesteal = META_TOWERS
    .filter((t) => PERKS[t.type].some((tier) => (tier.A.mods?.lifesteal ?? 0) > 0
      || (tier.B.mods?.lifesteal ?? 0) > 0))
    .map((t) => t.type)
    .sort();
  assert.deepEqual(conLifesteal, ['beam', 'wasps'],
    `robo de vida fuera de su identidad: ${conLifesteal.join(', ')}`);
  assert.ok(count >= 6, `solo se encontraron ${count} perks de robo de vida`);
});
// para los perks). Este test codifica el diseño viejo de "un stat numérico por opción"
// y/o los topes de poder de ese diseño; las opciones nuevas usan mecánicas (ejecutar,
// robo de vida, explosión, espinas, rebote...) que no encajan en esa regla. Se conserva
// para referencia; reactivar solo si se vuelve a querer balance numérico de perks.
test('PERKS: cada opción tiene desc y A/B distintas por tier', () => {
  for (const t of META_TOWERS) {
    for (const [i, tier] of PERKS[t.type].entries()) {
      for (const [label, perk] of [['A', tier.A], ['B', tier.B]]) {
        assert.equal(typeof perk.desc, 'string', `${t.type} tier${i}.${label} sin desc`);
        assert.ok(perk.desc.length > 0, `${t.type} tier${i}.${label}: desc vacía`);
        assert.ok(perk.mods && typeof perk.mods === 'object',
          `${t.type} tier${i}.${label}: sin mods`);
      }
      const sameDesc = tier.A.desc === tier.B.desc;
      const sameMods = JSON.stringify(tier.A.mods) === JSON.stringify(tier.B.mods);
      assert.ok(!(sameDesc && sameMods),
        `${t.type} tier ${i + 1}: opciones A/B idénticas ("${tier.A.desc}")`);
    }
  }
});

test('perkMods: vacío sin elecciones aunque haya niveles que desbloqueen tiers', () => {
  const type = META_TOWERS[0].type;
  const key = META_TOWERS[0].key;
  assert.deepEqual(perkMods(type, normalizeMeta({ levels: { [key]: 100 } })), {});
});

test('perkSchemaVersion: un save viejo conserva nivel/oro y resetea SOLO las elecciones', () => {
  const mkStorage = () => {
    const data = new Map();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  };
  const viejo = {
    levels: { guardian: 40 }, frags: { guardian: 123 }, victories: 3, gold: 777,
    perkChoices: { guardian: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  };
  const s1 = mkStorage();
  s1.setItem('gdf_meta', JSON.stringify(viejo));
  const m1 = loadMeta(s1);
  assert.equal(m1.levels.guardian, 40, 'el nivel se conserva');
  assert.equal(m1.gold, 777, 'el oro se conserva');
  assert.deepEqual(m1.perkChoices.guardian, Array(PERK_TIERS).fill(null),
    'las elecciones A/B se resetean: el índice viejo tenía otro significado');
  assert.equal(m1.perkSchemaVersion, PERK_SCHEMA_VERSION);

  const s2 = mkStorage();
  s2.setItem('gdf_meta', JSON.stringify({ ...viejo, perkSchemaVersion: PERK_SCHEMA_VERSION }));
  const m2 = loadMeta(s2);
  assert.equal(m2.perkChoices.guardian[0], 0,
    'un save de la versión actual conserva la elección');
});

test('perkMods: una rama elegida aplica su mod (A vs B distintos)', () => {
  const mk = (choice) => normalizeMeta({
    levels: { guardian: 10 },
    perkChoices: { guardian: [choice] },
  });
  const mA = perkMods('guardian', mk(0));
  const mB = perkMods('guardian', mk(1));
  assert.equal(mA.critChanceAdd, 0.15); // tier 1 A: Ojo de halcón
  assert.equal(mB.bounceCount, 1);      // tier 1 B: rebote
  assert.notDeepEqual(mA, mB);
});

test('perkMods: se acumula por tiers elegidos (superset y composición)', () => {
  // [0,0,0,0] en guardian: T1A crítico · T2A perforación · T3A cadencia ·
  // T4A crítico brutal (la identidad ya no reparte remate/robo de vida).
  const m = perkMods('guardian', normalizeMeta({
    levels: { guardian: 40 },
    perkChoices: { guardian: [0, 0, 0, 0] },
  }));
  assert.equal(m.critChanceAdd, 0.25); // 0.15 + 0.10
  assert.equal(m.critDmgMul, 3);
  assert.equal(m.pierceCount, 1);
  assert.equal(m.cadMul, 0.9);
  // elegir más tiers nunca quita claves (acumulativo)
  const more = perkMods('guardian', normalizeMeta({
    levels: { guardian: 50 },
    perkChoices: { guardian: [0, 0, 0, 0, 1] },
  }));
  assert.ok(Object.keys(more).length >= Object.keys(m).length);
});

test('perkMods: dos torres DISTINTAS a la misma década tienen perks DISTINTOS (el pedido original)', () => {
  // La fase 10 nació porque todas las torres repetían el mismo efecto.
  // Con elección A/B, el tier 1 de cada torre debe ser propio.
  const firstDescs = META_TOWERS.map((t) => PERKS[t.type][0].A.desc);
  assert.ok(new Set(firstDescs).size > 1,
    'el perk A del tier 1 es el mismo en todas las torres: ' + firstDescs.join(' | '));
});

// ---------- fase 16: helpers de elección (tierAtLevel/getPerkOptions/…) ----------

test('tierAtLevel: 0 en Nvl.10, 9 en Nvl.100, -1 antes de Nvl.10', () => {
  assert.equal(tierAtLevel(1), -1);
  assert.equal(tierAtLevel(9), -1);
  assert.equal(tierAtLevel(10), 0);
  assert.equal(tierAtLevel(19), 0);
  assert.equal(tierAtLevel(20), 1);
  assert.equal(tierAtLevel(100), PERK_TIERS - 1);
});

test('getPerkOptions: devuelve {A, B} del tier, null si no existe', () => {
  const opts = getPerkOptions('guardian', 0);
  assert.ok(opts && opts.A && opts.B);
  assert.equal(getPerkOptions('guardian', 99), null);
  assert.equal(getPerkOptions('no-existe', 0), null);
});

test('pendingPerkTiers: acumula tiers desbloqueados sin elegir', () => {
  const base = { levels: { guardian: 20 }, perkChoices: { guardian: [null, null] } };
  assert.deepEqual(pendingPerkTiers('guardian', normalizeMeta(base)), [0, 1]);
  const parcial = normalizeMeta({ levels: { guardian: 35 }, perkChoices: { guardian: [0, null, 1] } });
  assert.deepEqual(pendingPerkTiers('guardian', parcial), [1]);
  // Nvl.9: no hay tiers desbloqueados
  assert.deepEqual(pendingPerkTiers('guardian', normalizeMeta({ levels: { guardian: 9 } })), []);
});

test('setPerkChoice: elige 0/1 y persiste; rechaza locked/badChoice/badTier', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const meta = normalizeMeta({ levels: { guardian: 10 } });

  // tier 0 desbloqueado en Nvl.10 → A (0) y luego B (1)
  const r0 = setPerkChoice('guardian', 0, 0, meta, storage);
  assert.equal(r0.ok, true);
  assert.equal(r0.meta.perkChoices.guardian[0], 0);
  // persiste en storage (lo que leería una próxima sesión)
  assert.equal(loadMeta(storage).perkChoices.guardian[0], 0);

  // tier 1 NO desbloqueado en Nvl.10 → locked, sin cambios
  const rLocked = setPerkChoice('guardian', 1, 1, meta, storage);
  assert.equal(rLocked.ok, false);
  assert.equal(rLocked.reason, 'locked');
  assert.equal(rLocked.meta.perkChoices.guardian[1], null);

  // elección inválida → badChoice
  const rBad = setPerkChoice('guardian', 0, 2, meta, storage);
  assert.equal(rBad.ok, false);
  assert.equal(rBad.reason, 'badChoice');

  // tier fuera de rango → badTier
  const rTier = setPerkChoice('guardian', -1, 0, meta, storage);
  assert.equal(rTier.ok, false);
  assert.equal(rTier.reason, 'badTier');

  // tipo desconocido → unknown
  const rType = setPerkChoice('nope', 0, 0, meta, storage);
  assert.equal(rType.ok, false);
  assert.equal(rType.reason, 'unknown');
});

// ---------- fase 16: oro almacenado y gastable (metaGold/rewardGold/resetPerks) ----------

test('metaGold: lee el saldo almacenado (no es derivado)', () => {
  assert.equal(metaGold(normalizeMeta(null)), META_GOLD_START);
  assert.equal(metaGold(normalizeMeta({ gold: 1234 })), 1234);
});

test('rewardGold: suma, persiste y clamp al techo', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const saved = rewardGold(META_GOLD_PER_CLEAR, normalizeMeta({ gold: META_GOLD_START }), storage);
  assert.equal(saved.gold, META_GOLD_START + META_GOLD_PER_CLEAR);
  assert.equal(loadMeta(storage).gold, META_GOLD_START + META_GOLD_PER_CLEAR); // persistido
  // sumas negativas/corruptas no restan ni rompen
  const clamped = rewardGold(1e9, saved, storage);
  assert.equal(clamped.gold, 999999); // techo
});

test('resetPerks: exitoso descuenta oro, limpia tiers y NO toca nivel/frags/victorias', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const meta = normalizeMeta({
    levels: { guardian: 40 },
    frags: { guardian: 80 },
    victories: 7,
    gold: PERK_RESET_COST + 50,
    perkChoices: { guardian: [0, 1, null, 1] },
  });
  const r = resetPerks('guardian', meta, storage);
  assert.equal(r.ok, true);
  assert.equal(r.meta.gold, 50);                      // 550 − 500
  assert.deepEqual(r.meta.perkChoices.guardian, Array(PERK_TIERS).fill(null));
  assert.equal(r.meta.levels.guardian, 40);           // nivel intacto
  assert.equal(r.meta.frags.guardian, 80);            // fragmentos intactos
  assert.equal(r.meta.victories, 7);                  // victorias intactas
  assert.deepEqual(loadMeta(storage).perkChoices.guardian, Array(PERK_TIERS).fill(null));
});

test('resetPerks: oro insuficiente rechaza sin descuentos ni cambios', () => {
  const meta = normalizeMeta({
    gold: PERK_RESET_COST - 1,
    perkChoices: { guardian: [0, null, null, null, null, null, null, null, null, null] },
  });
  const r = resetPerks('guardian', meta);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient');
  assert.equal(r.meta.gold, PERK_RESET_COST - 1);
  assert.equal(r.meta.perkChoices.guardian[0], 0); // sin cambios
  // tipo desconocido → unknown
  assert.equal(resetPerks('nope', normalizeMeta({ gold: 9999 })).reason, 'unknown');
});

test('economía: conocer el precio del reset y los montos de ganancia', () => {
  assert.equal(PERK_RESET_COST, 500);
  assert.equal(META_GOLD_PER_CLEAR, 25);
  assert.equal(META_GOLD_PER_VICTORY, 150);
});

// ---------- fase 67: recompensas del modo ∞ (rewardVictory + endless.js) ----------

/** Storage en memoria (mismo patrón que los tests de resetMeta/rewardGold). */
function memStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
}

test('fase 67: la recompensa del ∞ escala con la profundidad (S55 < S75)', () => {
  const storage = memStorage();
  // 55: escalón 1, hito (múltiplo de 5) → 60 × 1 × 1,5 = 90
  const s55 = rewardVictory(defaultMeta(), 55, storage);
  assert.equal(s55.lastGain, 90);
  // 75: escalón 3 (1 + floor(24/10)), hito → 60 × 3 × 1,5 = 270
  const s75 = rewardVictory(s55, 75, storage);
  assert.equal(s75.lastGain, 270);
  assert.ok(s75.lastGain > s55.lastGain, 'el ∞ tiene que pagar más cuanto más profundo');
});

test('fase 67: el HITO del ∞ paga ×1,5 (S59 vs S60, mismo escalón)', () => {
  const storage = memStorage();
  const normal = rewardVictory(defaultMeta(), 59, storage); // 60 × 1
  const hito = rewardVictory(normal, 60, storage);          // 60 × 1 × 1,5
  assert.equal(normal.lastGain, META_FRAG_PER_VICTORY);
  assert.equal(hito.lastGain, META_FRAG_PER_VICTORY * 1.5);
});

// ---------- fase 69: recompensas del Protocolo (heat) ----------

test('fase 69: rewardVictory con heatMul paga 1,8× a heat 10 (y nunca menos de 1×)', () => {
  const storage = memStorage();
  const normal = rewardVictory(defaultMeta(), 10, storage); // primera vez: 120
  const conHeat = rewardVictory(defaultMeta(), 10, storage, { heatMul: 1.8 });
  assert.equal(normal.lastGain, META_FRAG_PER_VICTORY * META_FIRST_CLEAR_MULT);
  assert.equal(conHeat.lastGain, Math.round(META_FRAG_PER_VICTORY * META_FIRST_CLEAR_MULT * 1.8));
  // heatMul < 1 (o basura) no puede reducir la recompensa base.
  assert.equal(
    rewardVictory(defaultMeta(), 10, storage, { heatMul: 0.5 }).lastGain,
    normal.lastGain,
  );
  assert.equal(
    rewardVictory(defaultMeta(), 10, storage, { heatMul: NaN }).lastGain,
    normal.lastGain,
  );
});

test('fase 69: rewardFrags suma por torreta sin tocar victories ni firstClear', () => {
  const storage = memStorage();
  const base = normalizeMeta({ ...defaultMeta(), victories: 7, firstClear: [3] });
  const saved = rewardFrags(base, 60, storage);
  for (const t of META_TOWERS) {
    assert.equal(saved.frags[t.key], (base.frags[t.key] ?? 0) + 60, `${t.key} +60`);
  }
  assert.equal(saved.victories, 7, 'un hito NO es una victoria');
  assert.deepEqual(saved.firstClear, [3], 'un hito NO escribe firstClear');
  // Persiste de verdad (mismo storage que el resto de reward*).
  const reloaded = JSON.parse(storage.getItem('gdf_meta'));
  assert.equal(reloaded.frags[META_TOWERS[0].key], (base.frags[META_TOWERS[0].key] ?? 0) + 60);
  // Sin bonus (0/negativo/basura) no hay cambios sobre el meta de entrada.
  const cero = rewardFrags(saved, 0, storage);
  assert.deepEqual(cero.frags, saved.frags, 'con 0 fragmentos el meta no cambia');
  const basura = rewardFrags(saved, NaN, storage);
  assert.deepEqual(basura.frags, saved.frags, 'con NaN tampoco');
});

test('fase 67: limpiar ∞ NO escribe firstClear (ni paga ×2 permanente)', () => {
  const storage = memStorage();
  const base = normalizeMeta({ ...defaultMeta(), firstClear: [10] });
  const s55 = rewardVictory(base, 55, storage);
  assert.deepEqual(s55.firstClear, [10], 'el ∞ no puede hacer crecer firstClear');
  assert.equal(s55.lastFirst, false);
  const s60 = rewardVictory(s55, 60, storage);
  const s75 = rewardVictory(s60, 75, storage);
  assert.deepEqual(s75.firstClear, [10]);
  assert.equal(s75.victories, base.victories + 3); // las victorias sí cuentan
});

test('fase 67: la CAMPAÑA sigue pagando exactamente como hoy (S10: 120 → 60)', () => {
  const storage = memStorage();
  const first = rewardVictory(defaultMeta(), 10, storage);
  assert.equal(first.lastGain, META_FRAG_PER_VICTORY * META_FIRST_CLEAR_MULT); // 120
  assert.equal(first.lastFirst, true);
  assert.deepEqual(first.firstClear, [10]);
  const again = rewardVictory(first, 10, storage);
  assert.equal(again.lastGain, META_FRAG_PER_VICTORY);                        // 60
  assert.equal(again.lastFirst, false);
  assert.deepEqual(again.firstClear, [10]); // sin duplicar
});

test('ciclo completo: ganar oro → elegir → reset → saldo insuficiente (integración fase 16)', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  // Cuenta nueva con oro inicial
  let meta = loadMeta(storage);
  assert.equal(meta.gold, META_GOLD_START);
  // Sube a Nvl.10, elige el perk A del tier 0 → ya aporta mods
  meta = saveMeta({ ...meta, levels: { ...meta.levels, guardian: 10 } }, storage);
  const chosen = setPerkChoice('guardian', 0, 0, meta, storage);
  assert.equal(chosen.ok, true);
  meta = chosen.meta; // el estado persistido incluye la elección
  assert.ok(Object.keys(perkMods('guardian', meta)).length > 0);
  // Gana oro por stages (+25 cada uno)
  meta = rewardGold(META_GOLD_PER_CLEAR, meta, storage);
  meta = rewardGold(META_GOLD_PER_CLEAR, meta, storage);
  assert.equal(meta.gold, META_GOLD_START + 50);
  // Sin saldo suficiente el reset rechaza y no toca las elecciones
  const tooSoon = resetPerks('guardian', meta, storage);
  assert.equal(tooSoon.ok, false);
  assert.equal(tooSoon.reason, 'insufficient');
  assert.equal(tooSoon.meta.perkChoices.guardian[0], 0);
  // Acumula hasta cubrir el costo y resetea con descuento real
  while (meta.gold < PERK_RESET_COST) meta = rewardGold(META_GOLD_PER_CLEAR, meta, storage);
  const reset = resetPerks('guardian', meta, storage);
  assert.equal(reset.ok, true);
  assert.equal(reset.meta.gold, meta.gold - PERK_RESET_COST);
  assert.deepEqual(reset.meta.perkChoices.guardian, Array(PERK_TIERS).fill(null));
  assert.deepEqual(perkMods('guardian', reset.meta), {}); // sin perks activos tras el reset
});

test('perkMods: NINGUNA rama posible (2^10 = 1024 por torre) supera los límites de poder', () => {
  // Topes vigentes tras el rework de perks (medidos sobre las 1024 ramas):
  // el peor caso actual es laser dmgMul 2.5 / cadMul 0.7225 / extraCount 6,
  // y wasps/tesla llegan a extraCount 7. Se deja un margen mínimo para que
  // el test siga detectando una rama que se dispare.
  const DOM = 2.6, CAD = 0.45, EXTRA = 7;
  for (const t of META_TOWERS) {
    const table = PERKS[t.type];
    const n = table.length;
    let maxDmg = 1, minCad = 1, maxExtra = 0;
    for (let mask = 0; mask < (1 << n); mask++) {
      const chosen = [];
      for (let i = 0; i < n; i++) chosen.push(mask & (1 << i) ? table[i].B : table[i].A);
      const mods = mergeMods(chosen);
      maxDmg = Math.max(maxDmg, mods.dmgMul ?? 1);
      minCad = Math.min(minCad, mods.cadMul ?? 1);
      maxExtra = Math.max(maxExtra, mods.extraCount ?? 0);
    }
    assert.ok(maxDmg <= DOM, `${t.type}: la rama de máximo daño da dmgMul ${maxDmg} (>${DOM})`);
    assert.ok(minCad >= CAD, `${t.type}: la rama de máxima cadencia da cadMul ${minCad} (<${CAD})`);
    assert.ok(maxExtra <= EXTRA, `${t.type}: la rama de más extras da extraCount ${maxExtra} (>${EXTRA})`);
  }
});

test('PERKS: las descripciones están bien acentuadas (fase 25, sin palabras sin tilde)', () => {
  // Las descripciones se escribieron sin acentos y se corrigieron en la
  // fase 25. Este test frena que vuelva a colarse alguna de estas formas.
  const sinTilde = ['aguijon', 'bifurcacion', 'camara', 'canon', 'cria', 'critico', 'criticos', 'dano',
    'detonacion', 'ejecucion', 'electrica', 'electrico', 'explosion', 'gelida', 'gelidas', 'gelido',
    'halcon', 'magnetico', 'mas', 'maximo', 'nectar', 'paralisis', 'perforacion', 'polvora',
    'precision', 'punteria', 'rafaga', 'ralentizacion', 'rapida', 'rapido', 'reaparicion',
    'regeneracion', 'simultaneo', 'vampiricas', 'vampirico', 'vampiricos', 'esta'];
  for (const [torre, tiers] of Object.entries(PERKS)) {
    tiers.forEach((tier, i) => {
      for (const rama of ['A', 'B']) {
        const palabras = tier[rama].desc.toLowerCase().split(/[^a-záéíóúüñ]+/);
        for (const p of palabras) {
          assert.ok(!sinTilde.includes(p), `${torre} tier ${i + 1} ${rama}: "${p}" sin tilde en "${tier[rama].desc}"`);
        }
      }
    });
  }
});

// ============================================================================
// T6 — LA RED QUE FALTABA: ningún perk puede ser un "mod muerto"
// ============================================================================

/**
 * Escalera de umbrales de ejecución: el valor ABSOLUTO que queda si el
 * jugador elige ese perk. El índice es la posición del perk de ejecución
 * dentro de la torre (0 = el primero). Como `executeThreshold` se compone
 * por MÁXIMO (no por suma), el perk más caro de cada torre tiene que
 * estar en la posición más alta de su escalera.
 */
const ESCALERA_UMBRAL = [0.10, 0.12, 0.15, 0.18, 0.20, 0.22, 0.25, 0.28, 0.30, 0.32];

/** Porcentajes de un desc que describen un UMBRAL ("remata bajo 12%"). */
const RE_UMBRAL = /(?:bajo|menos del)\s+(\d+(?:[.,]\d+)?)\s*%/g;

/** Todas las claves de mod usadas por PERKS (las que el combate debe leer). */
const CLAVES_DE_PERKS = [...new Set(
  Object.values(PERKS).flatMap((tiers) => tiers
    .flatMap((tier) => [tier.A, tier.B])
    .flatMap((perk) => Object.keys(perk.mods))),
)];

// ---------- T1: política de composición por clave ----------

test('mergeMods: critDmgMul se queda con el MEJOR (máx), no multiplica', () => {
  // Dos perks de "críticos brutales" (x3 cada uno) deben dar x3, NO x9.
  const m = mergeMods([{ mods: { critDmgMul: 3 } }, { mods: { critDmgMul: 3 } }]);
  assert.equal(m.critDmgMul, 3);
  // Y con valores distintos se queda con el mayor.
  assert.equal(mergeMods([{ mods: { critDmgMul: 2 } }, { mods: { critDmgMul: 3 } }]).critDmgMul, 3);
  assert.equal(mergeMods([{ mods: { critDmgMul: 3 } }, { mods: { critDmgMul: 2 } }]).critDmgMul, 3);
});

test('mergeMods: executeThreshold se queda con el MEJOR (máx), no suma', () => {
  // Es un UMBRAL ("remata bajo X%"), no un incremento: 10% y 15% → 15%.
  assert.equal(mergeMods([{ mods: { executeThreshold: 0.1 } }, { mods: { executeThreshold: 0.15 } }]).executeThreshold, 0.15);
  assert.equal(mergeMods([{ mods: { executeThreshold: 0.15 } }, { mods: { executeThreshold: 0.1 } }]).executeThreshold, 0.15);
  assert.equal(mergeMods([{ mods: { executeThreshold: 0.1 } }, { mods: { executeThreshold: 0.1 } }]).executeThreshold, 0.1);
});

test('mergeMods: las probabilidades se topan en 100%', () => {
  assert.equal(
    mergeMods([{ mods: { explodeOnKillChance: 0.4 } }, { mods: { explodeOnKillChance: 0.4 } },
      { mods: { explodeOnKillChance: 0.5 } }]).explodeOnKillChance,
    1,
  );
  assert.equal(mergeMods([{ mods: { stunChance: 0.25 } }, { mods: { stunChance: 0.2 } }]).stunChance, 0.45);
  assert.equal(mergeMods([{ mods: { critChanceAdd: 0.6 } }, { mods: { critChanceAdd: 0.6 } }]).critChanceAdd, 1);
  assert.equal(mergeMods([{ mods: { lifesteal: 0.7 } }, { mods: { lifesteal: 0.6 } }]).lifesteal, 1);
});

test('mergeMods: la ralentización se topa en 75% (más lento no tiene sentido)', () => {
  assert.equal(mergeMods([{ mods: { slowOnHit: 0.25 } }, { mods: { slowOnHit: 0.2 } }]).slowOnHit, 0.45);
  assert.equal(
    mergeMods([{ mods: { slowOnHit: 0.5 } }, { mods: { slowOnHit: 0.5 } }]).slowOnHit,
    0.75,
  );
});

test('mergeMods: los multiplicadores se componen por producto y los contadores por suma', () => {
  assert.equal(mergeMods([{ mods: { dmgMul: 1.15 } }, { mods: { dmgMul: 1.35 } }]).dmgMul, 1.15 * 1.35);
  assert.equal(mergeMods([{ mods: { cadMul: 0.85 } }, { mods: { cadMul: 0.85 } }]).cadMul, 0.85 * 0.85);
  assert.equal(mergeMods([{ mods: { extraCount: 2 } }, { mods: { extraCount: 3 } }]).extraCount, 5);
  assert.equal(mergeMods([{ mods: { explodeOnKillDmg: 30 } }, { mods: { explodeOnKillDmg: 40 } }]).explodeOnKillDmg, 70);
});

test('mergeMods: las claves desconocidas siguen la regla por defecto (…Mul producto, resto suma)', () => {
  assert.equal(mergeMods([{ mods: { claveNuevaMul: 1.5 } }, { mods: { claveNuevaMul: 1.5 } }]).claveNuevaMul, 2.25);
  assert.equal(mergeMods([{ mods: { claveNueva: 2 } }, { mods: { claveNueva: 3 } }]).claveNueva, 5);
});

// ---------- T2: escalera de umbrales + descripciones honestas ----------

test('PERKS: los umbrales de ejecución del Misil siguen la escalera calibrada', () => {
  // Fase 1 — el remate es la identidad del Misil; ninguna otra torre lo tiene.
  for (const t of META_TOWERS.filter((x) => x.type === 'missile')) {
    let pos = 0;
    PERKS[t.type].forEach((tier, i) => {
      for (const rama of ['A', 'B']) {
        const v = tier[rama].mods.executeThreshold;
        if (v === undefined) continue;
        const esperado = ESCALERA_UMBRAL[pos];
        assert.ok(esperado !== undefined,
          `${t.type} tier ${i + 1} ${rama}: hay demasiados perks de ejecución (la escalera llega a ${pos})`);
        assert.equal(v, esperado,
          `${t.type} tier ${i + 1} ${rama}: executeThreshold=${v}, la escalera dice ${esperado}`);
        pos += 1;
      }
    });
    assert.ok(pos > 0, `${t.type} no tiene ningún perk de ejecución`);
  }
});

test('PERKS: dentro del Misil, el perk de ejecución más caro tiene el umbral más alto', () => {
  for (const t of META_TOWERS.filter((x) => x.type === 'missile')) {
    let anterior = -1;
    PERKS[t.type].forEach((tier, i) => {
      for (const rama of ['A', 'B']) {
        const v = tier[rama].mods.executeThreshold;
        if (v === undefined) continue;
        assert.ok(v > anterior,
          `${t.type} tier ${i + 1} ${rama}: executeThreshold=${v} no es mayor que el anterior (${anterior})`);
        anterior = v;
      }
    });
  }
});

test('PERKS: toda opción con executeThreshold DICE ese umbral (las descripciones no mienten)', () => {
  for (const t of META_TOWERS) {
    PERKS[t.type].forEach((tier, i) => {
      for (const rama of ['A', 'B']) {
        const perk = tier[rama];
        const v = perk.mods.executeThreshold;
        if (v === undefined) continue;
        const esperado = Math.round(v * 100);
        const encontrados = [...perk.desc.matchAll(RE_UMBRAL)].map((m) => Math.round(Number(m[1].replace(',', '.'))));
        assert.ok(encontrados.length > 0,
          `${t.type} tier ${i + 1} ${rama}: la descripción "${perk.desc}" no dice ningún umbral`);
        for (const pct of encontrados) {
          assert.equal(pct, esperado,
            `${t.type} tier ${i + 1} ${rama}: la descripción "${perk.desc}" dice ${pct}% pero el mod vale ${v} (${esperado}%)`);
        }
      }
    });
  }
});

// ---------- T6: la red anti-"perks muertos" ----------

const JS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'js');
/** Lee un módulo de js/ (si existe) para poder auditar el código real. */
function leerJs(nombre) {
  try {
    return readFileSync(path.join(JS_DIR, nombre), 'utf8');
  } catch (_err) {
    return '';
  }
}
// El combate se partió en módulos (fase 75): el escáner anti-perks-muertos
// tiene que leer todos los que contienen call-sites de mods.
const SRC_TOWERS = [
  leerJs('towers.js'), leerJs('towers-drones.js'),
  leerJs('towers-fx.js'), leerJs('towers-projectiles.js'),
].join('\n');
const SRC_ENEMIES = [
  leerJs('enemies.js'), leerJs('enemies-combat.js'), leerJs('enemies-status.js'),
].join('\n');
const SRC_PERKS = leerJs('perks.js');
const SRC_PLAYER = leerJs('player.js');
/** Todo el código de combate que puede consumir un mod de perk. */
const SRC_COMBATE = [SRC_TOWERS, SRC_ENEMIES, SRC_PERKS].join('\n');
const LINEAS_TOWERS = SRC_TOWERS.split(/\r?\n/);
/** Líneas alrededor de cada call-site de perkMods() que se miran. */
const VENTANA = 25;

/**
 * Claves que consume la maquinaria COMPARTIDA (hurtP / onHitOpts en
 * towers.js y projectileStrike en enemies.js) para cualquier torre que le
 * pase sus mods: viajan con el proyectil o se aplican en el impacto.
 */
const CLAVES_GENERICAS = new Set([
  'executeThreshold', 'lifesteal',
  'explodeOnKillChance', 'explodeOnKillDmg', 'explodeOnKillRadius',
  'slowOnHit', 'stunChance', 'critChanceAdd', 'critDmgMul',
  'bounceCount', 'pierceCount',
]);

/**
 * Ventanas [ini, fin] de código alrededor de los call-sites que matchean `re`.
 *
 * dev-7 fase 28: la ventana NO es un rango fijo de líneas sino el BLOQUE
 * ENVOLVENTE (por indentación). Con un rango fijo (±25) un refactor
 * legítimo que movía el uso de un mod 30 líneas más abajo lo hacía
 * "perk muerto" en falso: la red de seguridad se volvía una bomba de
 * relojería. Ahora la ventana es el bloque de código que contiene el
 * call-site, así que sigue detectando los perks MUERTOS de verdad (la
 * clave no aparece en el bloque que la consume) sin romperse con un
 * refactor.
 */
function ventanas(re) {
  const out = [];
  LINEAS_TOWERS.forEach((line, i) => {
    if (!re.test(line)) return;
    out.push(bloqueEnvolente(LINEAS_TOWERS, i));
  });
  return out;
}

/**
 * Bloque de código que envuelve la línea `i`: se extiende hacia arriba y
 * hacia abajo mientras la indentación no baje la del call-site (eso
 * delimita el bloque/método que lo contiene).
 * @returns {[number, number]} [ini, fin]
 */
function bloqueEnvolente(lineas, i) {
  const indent = (lineas[i].match(/^\s*/) ?? [''])[0].length;
  let ini = i;
  while (ini > 0) {
    const l = lineas[ini - 1];
    if (!l.trim()) { ini -= 1; continue; }
    const ind = (l.match(/^\s*/) ?? [''])[0].length;
    if (ind < indent) break;
    ini -= 1;
  }
  let fin = i;
  while (fin < lineas.length - 1) {
    const l = lineas[fin + 1];
    if (!l.trim()) { fin += 1; continue; }
    const ind = (l.match(/^\s*/) ?? [''])[0].length;
    if (ind < indent) break;
    fin += 1;
  }
  return [ini, fin];
}

/** Texto de todas las ventanas, unido. */
function textoDe(vent) {
  return vent.map(([a, b]) => LINEAS_TOWERS.slice(a, b + 1).join('\n')).join('\n');
}

/**
 * dev-7 fase 51 — los call-sites de los mods ya NO son
 * `perkMods('<tipo>')` sino `unitMods(this)`: la FUSIÓN de los perks de
 * meta con los mods de CARTA (js/perks.js). El tipo ya no está en la
 * llamada, así que la atribución se hace por el BLOQUE que envuelve al
 * call-site: el `case '<kind>':` del switch de disparo (o el método donde
 * vive). El kind es el que define el tipo (towers.js TOWERS/DRONES).
 */
const KIND_POR_TIPO = {
  guardian: 'fan', missile: 'homing', beam: 'beam', thunderstroke: 'bolt',
  tesla: 'chain', mortar: 'mortar', gauss: 'gauss', laser: 'laser',
  wasps: 'wasps', firewheel: 'firewheel', forcefield: 'forcefield',
};

/**
 * Bloques (por indentación) de los call-sites `unitMods(this)` que hay
 * dentro del `case '<kind>':` de un switch de js/towers.js.
 */
function bloquesDeCase(kind) {
  const re = new RegExp(`^\\s*case '${kind}':`);
  const ini = LINEAS_TOWERS.findIndex((l) => re.test(l));
  if (ini < 0) return [];
  const indent = (LINEAS_TOWERS[ini].match(/^\s*/) ?? [''])[0].length;
  let fin = ini + 1;
  while (fin < LINEAS_TOWERS.length) {
    const l = LINEAS_TOWERS[fin];
    const ind = (l.match(/^\s*/) ?? [''])[0].length;
    if (l.trim() && ind === indent && /^(case |default:)/.test(l.trim())) break;
    fin += 1;
  }
  const out = [];
  for (let i = ini; i < fin; i++) {
    if (!/unitMods\(\s*this\s*\)/.test(LINEAS_TOWERS[i])) continue;
    out.push(bloqueEnvolente(LINEAS_TOWERS, i));
  }
  return out;
}

/**
 * Bloques (por indentación) de un método de js/towers.js que lean los
 * mods de la unidad (los getters genéricos, el dibujado del dron, la
 * bala del Guardian…).
 */
function bloquesDeMetodo(nombre) {
  const re = new RegExp(`^\\s*(?:get\\s+|static\\s+)?${nombre}\\s*\\(`);
  const out = [];
  LINEAS_TOWERS.forEach((line, i) => {
    if (!re.test(line)) return;
    // El cuerpo del método: hasta su llave de cierre (misma indentación).
    const indent = (line.match(/^\s*/) ?? [''])[0].length;
    let fin = i + 1;
    while (fin < LINEAS_TOWERS.length) {
      const l = LINEAS_TOWERS[fin];
      const ind = (l.match(/^\s*/) ?? [''])[0].length;
      if (l.trim() && ind === indent && l.trim().startsWith('}')) break;
      fin += 1;
    }
    const txt = LINEAS_TOWERS.slice(i, fin + 1).join('\n');
    if (!/unitMods\(\s*this\s*\)/.test(txt)) return; // método que no lee mods
    out.push([i, fin]);
  });
  return out;
}

/**
 * Bloques de una FUNCIÓN de módulo (no método). El helper
 * `forcefieldBubbleR` centraliza el radio de la burbuja y es el único
 * sitio que lee `radiusAdd`; sin incluirlo, el escáner lo vería muerto.
 */
function bloquesDeFuncion(nombre) {
  const re = new RegExp(`^\\s*(?:export\\s+)?function\\s+${nombre}\\s*\\(`);
  const out = [];
  LINEAS_TOWERS.forEach((line, i) => {
    if (!re.test(line)) return;
    const indent = (line.match(/^\s*/) ?? [''])[0].length;
    let fin = i + 1;
    while (fin < LINEAS_TOWERS.length) {
      const l = LINEAS_TOWERS[fin];
      const ind = (l.match(/^\s*/) ?? [''])[0].length;
      if (l.trim() && ind === indent && l.trim().startsWith('}')) break;
      fin += 1;
    }
    out.push([i, fin]);
  });
  return out;
}

test('PERKS: TODO mod de TODA opción lo consume el combate de esa torre (nada de perks muertos)', () => {
  // Esta es la red que faltaba: hasta ahora un perk podía pedir "pierceCount"
  // en una torre cuyo proyectil ya atravesaba TODO (pierce: 999) y no
  // pasaba NADA. Ahora cada clave de cada opción tiene que
  // aparecer en el código de combate de ESA torre.
  const ofensas = [];
  for (const t of META_TOWERS) {
    const vent = [
      // El switch de disparo de ESA torre (el `case` de su kind).
      ...bloquesDeCase(KIND_POR_TIPO[t.type]),
      // Los getters genéricos de Tower (damage/cooldown) leen los mods del
      // PROPIO tipo (`unitMods(this)`) → valen para cada torre.
      ...(TOWERS[t.type] ? bloquesDeMetodo('damage') : []),
      ...(TOWERS[t.type] ? bloquesDeMetodo('cooldown') : []),
      // Los getters del Guardian (velocidad de bala y ráfaga) y el método
      // que dispara su bala.
      ...(t.type === 'guardian' ? bloquesDeMetodo('bulletSpeedNow') : []),
      ...(t.type === 'guardian' ? bloquesDeMetodo('bulletsPerBurst') : []),
      ...(t.type === 'guardian' ? bloquesDeMetodo('_spawnBullet') : []),
      // El enjambre de las Avispas (extraCount del perk).
      ...(t.type === 'wasps' ? bloquesDeMetodo('rebuildSwarm') : []),
      // El radio de la burbuja se lee en el helper único (update y draw).
      ...(t.type === 'forcefield' ? bloquesDeFuncion('forcefieldBubbleR') : []),
      ...(t.type === 'forcefield' ? bloquesDeMetodo('draw') : []),
      // El Láser lee sus mods en la entidad del rayo (js/towers.js
      // LaserStaticFx), que sigue leyendo los perks por su cuenta. La
      // duración se fija en el constructor; el resto en update().
      ...(t.type === 'laser' ? ventanas(new RegExp(`perkMods\\(\\s*'laser'\\s*\\)`)) : []),
      ...(t.type === 'laser' ? ventanas(/\blaserDurationAdd\b/) : []),
    ];
    const txt = textoDe(vent);
    // Las claves genéricas solo cuentan si los mods de la torre llegan a
    // la maquinaria compartida (hurtP / onHitOpts / applyPerkDamage).
    const llegaCompartido = /hurtP\(|onHitOpts\(|applyPerkDamage\(|pickOnHit\(/.test(txt);
    const consumidas = new Set();
    if (llegaCompartido) for (const k of CLAVES_GENERICAS) consumidas.add(k);
    for (const k of CLAVES_DE_PERKS) {
      if (new RegExp(`\\b${k}\\b`).test(txt)) consumidas.add(k);
    }
    // CASO ESPECIAL: si el proyectil de la torre ya atraviesa TODO
    // (pierce: 999 + ...), sumar pierceCount NO se observa → perk MUERTO.
    if (/pierce\s*:\s*\d{3,}/.test(txt)) consumidas.delete('pierceCount');

    PERKS[t.type].forEach((tier, i) => {
      for (const rama of ['A', 'B']) {
        for (const k of Object.keys(tier[rama].mods)) {
          if (!consumidas.has(k)) {
            ofensas.push(`${t.type} tier ${i + 1} ${rama}: "${k}" no lo consume el combate (desc: "${tier[rama].desc}")`);
          }
        }
      }
    });
  }
  assert.deepEqual(ofensas, [],
    `mods que NO se consumen (perks muertos):\n  - ${ofensas.join('\n  - ')}`);
});

test('PERKS: la maquinaria compartida (hurtP/onHitOpts) sigue leyendo las claves genéricas', () => {
  // El test anterior da por hecho que hurtP/onHitOpts siguen consumiendo
  // estas claves. Si alguien las borra de ahí, el perk vuelve a ser
  // decorativo — y el test anterior dejaría de detectarlo.
  // dev-7 fase 26: la maquinaria compartida vive en js/perks.js (la lógica
  // de perks estaba duplicada en towers.js y enemies.js y ahora es UNA sola
  // implementación, ver js/perks.js).
  for (const k of ['executeThreshold', 'lifesteal', 'explodeOnKillChance',
    'explodeOnKillDmg', 'explodeOnKillRadius']) {
    assert.ok(new RegExp(`\\b${k}\\b`).test(SRC_COMBATE),
      `la clave genérica "${k}" ya no la lee ningún módulo de combate (perks.js/towers.js/enemies.js)`);
  }
  // Y que no haya una COPIA de esa lógica en player.js (la regla del
  // proyecto: una sola implementación, en perks.js).
  assert.equal(/\bexecuteThreshold\b|\blifesteal\b|\bexplodeOnKill/.test(SRC_PLAYER), false,
    'player.js no debería duplicar la lógica de perks (eso ya vive en perks.js)');
});

// ---------- T5: memoización de perkMods/metaDmgMul ----------

test('perkMods: devuelve una copia — el llamador no puede corromper la caché', () => {
  const meta = normalizeMeta({ levels: { guardian: 10 }, perkChoices: { guardian: [0] } });
  const a = perkMods('guardian', meta);
  assert.equal(a.critChanceAdd, 0.15);
  a.critChanceAdd = 999;      // el llamador "ruga" el objeto
  a.claveInventada = 1;
  const b = perkMods('guardian', meta);
  assert.equal(b.critChanceAdd, 0.15, 'la caché quedó contaminada por el llamador');
  assert.equal(b.claveInventada, undefined, 'la caché quedó contaminada por el llamador');
});

test('perkMods: la caché se invalida al guardar (el cambio se ve al instante)', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const meta = saveMeta(normalizeMeta({ levels: { guardian: 10 } }), storage);
  assert.deepEqual(perkMods('guardian', meta), {});
  const r = setPerkChoice('guardian', 0, 0, meta, storage);
  assert.equal(r.ok, true);
  assert.equal(perkMods('guardian', r.meta).critChanceAdd, 0.15,
    'la caché de perks no se invalidó al guardar');
});

// ============================================================================
// T1 — EL CAMPO DE FUERZA ESCALA CON EL META (slow + espinas)
// ============================================================================

test('metaSlowFrac: el slow del Campo de Fuerza SIGUE creciendo después de Nvl.30', () => {
  // El tope viejo (50%) congelaba el dron en Nvl.21: sus 79 niveles
  // restantes no daban NADA. Con el tope en 75% la curva sigue creciendo.
  const lv = (n) => normalizeMeta({ levels: { forcefield: n } });
  const s30 = metaSlowFrac('forcefield', lv(30));
  const s100 = metaSlowFrac('forcefield', lv(100));
  assert.notEqual(s30, s100, 'el slow se saturó: los niveles 31-100 no dan NADA');
  assert.ok(s100 > s30, 'el slow debe crecer con el nivel meta');
  assert.ok(s100 > 0.5, 'el slow tiene que pasar el viejo tope del 50%');
  assert.ok(s100 <= META_SLOW_CAP, 'el slow nunca pasa el tope declarado');
  // Monótono creciente en todo el rango.
  let prev = -1;
  for (let n = 1; n <= META_MAX_LEVEL; n++) {
    const s = metaSlowFrac('forcefield', lv(n));
    assert.ok(s >= prev, `el slow bajó en Nvl.${n}`);
    prev = s;
  }
  // La base sigue siendo 30% en Nvl.1.
  assert.ok(Math.abs(metaSlowFrac('forcefield', lv(1)) - META_SLOW_BASE) < 1e-9);
  // Los otros tipos no tienen slow meta (undefined).
  assert.equal(metaSlowFrac('guardian', lv(50)), undefined);
});

test('perkDmgFor: las espinas del Campo de Fuerza escalan con el nivel meta', () => {
  // Tier 0 opción A = "Campo de espinas: daña 12/s base" (thornDps 12).
  const mk = (n, choice) => normalizeMeta({
    levels: { forcefield: n },
    perkChoices: { forcefield: [choice] },
  });
  const bajo = perkDmgFor('forcefield', mk(1, 0));
  const alto = perkDmgFor('forcefield', mk(100, 0));
  assert.ok(Math.abs(bajo - 12) < 1e-9, 'en Nvl.1 las espinas valen su número base');
  assert.ok(alto > bajo, 'las espinas NO escalan con el meta (bug del dron sin daño)');
  const esperado = 12 * (1 + META_DMG_PER_LEVEL * (META_MAX_LEVEL - 1)) * 1.08;
  assert.ok(Math.abs(alto - esperado) < 1e-6, `esperado ${esperado}, dio ${alto}`);
  // Sin espinas elegidas → 0 (no inventa daño).
  assert.equal(perkDmgFor('forcefield', normalizeMeta({ levels: { forcefield: 100 } })), 0);
  // Una torre sin espinas → 0.
  assert.equal(perkDmgFor('guardian', normalizeMeta({ levels: { guardian: 100 } })), 0);
});

// ============================================================================
// T3 — HITOS POR TORRETA (Nvl.25 / 50 / 75 / 100)
// ============================================================================

test('HITOS: Nvl.24 no tiene hitos; Nvl.25 → 1; Nvl.50 → 2; Nvl.100 → 4', () => {
  const lv = (n) => normalizeMeta({ levels: { guardian: n } });
  assert.deepEqual(towerMilestones('guardian', lv(24)), []);
  assert.deepEqual(towerMilestones('guardian', lv(25)), [25]);
  assert.deepEqual(towerMilestones('guardian', lv(49)), [25]);
  assert.deepEqual(towerMilestones('guardian', lv(50)), [25, 50]);
  assert.deepEqual(towerMilestones('guardian', lv(75)), [25, 50, 75]);
  assert.deepEqual(towerMilestones('guardian', lv(100)), [25, 50, 75, 100]);
  // Los hitos son los mismos para todas las torres.
  assert.deepEqual(META_MILESTONES, [25, 50, 75, 100]);
  // Tipo desconocido → sin hitos.
  assert.deepEqual(towerMilestones('no-existe', lv(100)), []);
});

test('HITOS: el bono de daño es > 0 y CRECE con el nivel', () => {
  const lv = (n) => normalizeMeta({ levels: { guardian: n } });
  assert.equal(milestoneDmgMul('guardian', lv(1)), 1);
  assert.equal(milestoneDmgMul('guardian', lv(24)), 1, 'sin hitos no hay bono');
  let prev = 0;
  for (const n of [25, 50, 75, 100]) {
    const f = milestoneDmgMul('guardian', lv(n));
    assert.ok(f > prev, `el bono de Nvl.${n} no crece`);
    prev = f;
  }
  // +2% por hito, acumulables: Nvl.100 → +8%.
  assert.ok(Math.abs(milestoneDmgMul('guardian', lv(25)) - 1.02) < 1e-9);
  assert.ok(Math.abs(milestoneDmgMul('guardian', lv(50)) - 1.04) < 1e-9);
  assert.ok(Math.abs(milestoneDmgMul('guardian', lv(75)) - 1.06) < 1e-9);
  assert.ok(Math.abs(milestoneDmgMul('guardian', lv(100)) - 1.08) < 1e-9);
  assert.equal(META_MILESTONE_DMG_PER_HIT, 0.02);
  // El bono REAL llega al daño de la torre (metaDmgMul lo incluye).
  assert.ok(metaDmgMul('guardian', lv(50)) > 1 + META_DMG_PER_LEVEL * 49);
  // Tipo desconocido → sin bono.
  assert.equal(milestoneDmgMul('no-existe', lv(100)), 1);
});

// ============================================================================
// T2 — RANGOS DEL JUGADOR (el badge era un contador disfrazado)
// ============================================================================

test('RANGOS: el rango sale de las victorias y tiene nombre', () => {
  const v = (n) => normalizeMeta({ victories: n });
  assert.equal(playerRank(v(0)).name, 'Aprendiz');
  assert.equal(playerRank(v(10)).name, 'Centinela');
  assert.equal(playerRank(v(50)).name, 'Guardia');
  assert.equal(playerRank(v(150)).name, 'Comandante');
  assert.equal(playerRank(v(331)).name, 'Almirante');
  assert.equal(playerRank(v(1000)).name, 'Arquitecto');
  // En el medio de un rango manda el rango anterior.
  assert.equal(playerRank(v(9)).name, 'Aprendiz');
  assert.equal(playerRank(v(49)).name, 'Centinela');
  assert.equal(playerRank(v(330)).name, 'Comandante');
  // Todos los rangos tienen nombre, id, umbral y color.
  assert.equal(META_RANKS.length, 6);
  for (const r of META_RANKS) {
    assert.ok(typeof r.name === 'string' && r.name.length > 0, `rango sin nombre: ${r.id}`);
    assert.ok(typeof r.id === 'string' && r.id.length > 0, 'rango sin id');
    assert.ok(Number.isFinite(r.min) && r.min >= 0, `rango ${r.name} sin umbral válido`);
    // dev-7 fase 53: el color es una REFERENCIA a un token CSS
    // (`var(--rank-N)`), no un hexadecimal suelto: los colores viven en
    // css/style.css (como los de la rareza y los tipos de daño).
    assert.ok(typeof r.color === 'string' && /^var\(--rank-\d\)$/.test(r.color),
      `rango ${r.name} sin color CSS válido`);
  }
  // Los 6 rangos tienen colores DISTINTOS (si dos compartieran color, el
  // badge no distinguiría un rango del otro).
  const colores = META_RANKS.map((r) => r.color);
  assert.equal(new Set(colores).size, colores.length, 'dos rangos comparten color');
  // Los umbrales están ordenados.
  const mins = META_RANKS.map((r) => r.min);
  assert.deepEqual(mins, [...mins].sort((a, b) => a - b));
  assert.equal(mins[0], 0, 'el primer rango arranca en 0 victorias');
});

test('RANGOS: playerLevel es el NÚMERO de rango (1..6), no el contador de victorias', () => {
  const v = (n) => normalizeMeta({ victories: n });
  assert.equal(playerLevel(v(0)), 1);
  assert.equal(playerLevel(v(10)), 2);
  assert.equal(playerLevel(v(50)), 3);
  assert.equal(playerLevel(v(150)), 4);
  assert.equal(playerLevel(v(331)), 5);
  assert.equal(playerLevel(v(1000)), 6);
  // Pasadas las 1100 victorias sigue siendo el rango 6 (no 1101).
  assert.equal(playerLevel(v(99999)), 6);
});

// ============================================================================
// T4 — LA CIFRA REAL DEL COSTE (el comentario no puede pudrirse)
// ============================================================================

test('fragCost: llevar una torreta de Nvl.1 a Nvl.100 cuesta 22 860 fragmentos', () => {
  let total = 0;
  for (let lv = 1; lv < META_MAX_LEVEL; lv++) total += fragCost(lv);
  assert.equal(total, 22860, 'el total del comentario de fragCost() no coincide con la fórmula');
});

// ============================================================================
// dev-7 fase 59.3 - EL META QUE SE VE: "SUBIR TODO LO POSIBLE"
// ============================================================================
// El diagnostico de la UX: el meta es MANUAL y su coste por nivel es de
// 75-390 fragmentos, con 11 torres. El jugador llego al S21 con 5 000
// fragmentos acumulados y NUNCA los gasto (hizo falta el simulador para
// medirlo). Estas funciones son el arreglo: un boton que sube todo lo
// posible y un aviso de "hay mejoras pendientes".

test('pendingUpgrades: 0 cuando no hay fragmentos suficientes', () => {
  const meta = normalizeMeta({ levels: { guardian: 1 }, frags: { guardian: 10 } });
  assert.equal(pendingUpgrades(meta), 0);
});

test('pendingUpgrades: cuenta los niveles pagables (greedy por torreta)', () => {
  // 75 por nivel (primera decada): 225 = 3 niveles en el guardian.
  const meta = normalizeMeta({ levels: { guardian: 1 }, frags: { guardian: 225 } });
  assert.equal(pendingUpgrades(meta), 3);
});

test('upgradeAllTowers: sube todas las torretas que puede y guarda el resto', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
  const meta = normalizeMeta({
    levels: { guardian: 1, tesla: 1 },
    frags: { guardian: 225, tesla: 75 },
  });
  const r = upgradeAllTowers(meta, storage);
  assert.equal(r.levels, 4, '3 en el guardian + 1 en la tesla');
  assert.equal(r.meta.levels.guardian, 4);
  assert.equal(r.meta.levels.tesla, 2);
  assert.equal(r.meta.frags.guardian, 0);
  assert.equal(r.meta.frags.tesla, 0);
  // las demas torretas (sin fragmentos) no se mueven
  assert.equal(r.meta.levels.mortar, 1);
  // no muta la entrada
  assert.equal(meta.levels.guardian, 1);
  assert.equal(meta.frags.guardian, 225);
  // y queda PERSISTIDO
  const guardado = JSON.parse(store.get('gdf_meta'));
  assert.equal(guardado.levels.guardian, 4);
});

test('upgradeAllTowers: con fragmentos sobrantes los conserva', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
  const meta = normalizeMeta({ levels: { guardian: 1 }, frags: { guardian: 260 } });
  const r = upgradeAllTowers(meta, storage);
  assert.equal(r.levels, 3);            // 3 niveles = 225
  assert.equal(r.meta.frags.guardian, 35); // sobran 35
});

test('upgradeAllTowers: una torreta al tope no se mueve (Nvl.100)', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
  const meta = normalizeMeta({
    levels: { guardian: META_MAX_LEVEL },
    frags: { guardian: 99999 },
  });
  const r = upgradeAllTowers(meta, storage);
  assert.equal(r.levels, 0);
  assert.equal(r.meta.levels.guardian, META_MAX_LEVEL);
});

test('upgradePlan: el plan coincide con lo que hace upgradeAllTowers', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
  const meta = normalizeMeta({
    levels: { guardian: 1, gauss: 1 },
    frags: { guardian: 400, gauss: 150 },
  });
  const plan = upgradePlan(meta);
  const total = plan.reduce((s, p) => s + (p.to - p.from), 0);
  assert.equal(total, pendingUpgrades(meta));
  const r = upgradeAllTowers(meta, storage);
  assert.equal(r.levels, total);
  for (const p of plan) assert.equal(r.meta.levels[p.key], p.to);
});

// ============================================================================
// dev-7 fase 59.4 - EL COSTE DEL "SUBIR TODO" (lo que dice el botón)
// ============================================================================
// El botón "SUBIR TODO (7 mejoras · 1.240 frag.)" tiene que decir la
// verdad: el numero de mejoras y el gasto tienen que ser los REALES del
// plan que ejecuta upgradeAllTowers.

test('pendingUpgradeCost: 0 cuando no hay nada que subir', () => {
  const meta = normalizeMeta({ levels: { guardian: 1 }, frags: { guardian: 10 } });
  assert.equal(pendingUpgradeCost(meta), 0);
});

test('pendingUpgradeCost: es la suma del plan (3 niveles de 75 = 225)', () => {
  const meta = normalizeMeta({ levels: { guardian: 1 }, frags: { guardian: 225 } });
  assert.equal(pendingUpgradeCost(meta), 225);
  const plan = upgradePlan(meta);
  const suma = plan.reduce((s, p) => s + p.cost, 0);
  assert.equal(pendingUpgradeCost(meta), suma);
});

test('pendingUpgradeCost: lo que dice el botón es lo que gasta el botón', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
  const meta = normalizeMeta({
    levels: { guardian: 1, tesla: 1 },
    frags: { guardian: 400, tesla: 150 },
  });
  const costo = pendingUpgradeCost(meta);
  const r = upgradeAllTowers(meta, storage);
  // Los fragmentos que quedan tras subir son los que NO se podían pagar.
  const gastado = (meta.frags.guardian - r.meta.frags.guardian)
    + (meta.frags.tesla - r.meta.frags.tesla);
  assert.equal(gastado, costo,
    'el gasto real tiene que ser EXACTAMENTE el coste anunciado');
});

// ------------------------------------------------------------
// fase 60 — el ICONO del meta-juego
// ------------------------------------------------------------

test('fase 60: cada torreta de META_TOWERS tiene rig (el icono no cae al genérico)', () => {
  // Regresión: `renderTowerIcon` pasaba `entry.type` (clave de TOWERS) a
  // `rigBox`, que espera un `kind` de rig. Como rigBox tiene fallback
  // silencioso, 4 de las 8 torres usaban una caja genérica y los iconos
  // del Tesla y el Thunderstroke recortaban la parte de arriba (los nodos
  // de chispa y el orbe). Este test fija el cruce de espacios de claves.
  for (const e of META_TOWERS) {
    if (DRONES[e.type]) continue;
    const kind = TOWERS[e.type]?.kind;
    assert.ok(kind, `META_TOWERS "${e.key}": type "${e.type}" no está en TOWERS`);
    assert.ok(TOWER_RIGS[kind],
      `META_TOWERS "${e.key}": el kind "${kind}" no tiene rig (¿se pasó el type a rigBox?)`);
  }
});

test('fase 60: el encuadre del icono deja la torre ENTERA dentro del canvas', () => {
  const W = 84;
  const H = 72;
  for (const e of META_TOWERS) {
    if (DRONES[e.type]) continue;
    const kind = TOWERS[e.type].kind;
    const bb = TOWER_RIGS[kind].bbox;
    const { s, cx, cy } = towerIconFit(kind);
    assert.ok(s > 0 && Number.isFinite(s), `${e.key}: escala no finita (${s})`);
    // El rig se dibuja con `translate(W/2 - cx*s, H/2 - cy*s)` + scale(s):
    // la caja tiene que caer dentro de [0,W]×[0,H] con el margen.
    const x0 = W / 2 + (bb.x - cx) * s;
    const x1 = W / 2 + (bb.x + bb.w - cx) * s;
    const y0 = H / 2 + (bb.y - cy) * s;
    const y1 = H / 2 + (bb.y + bb.h - cy) * s;
    assert.ok(x0 >= 0 && x1 <= W,
      `${e.key}: la silueta se sale en X (${x0.toFixed(1)}..${x1.toFixed(1)} de 0..${W})`);
    assert.ok(y0 >= 0 && y1 <= H,
      `${e.key}: la silueta se sale en Y (${y0.toFixed(1)}..${y1.toFixed(1)} de 0..${H})`);
  }
});

test('fase 60: el encuadre del icono rechaza una clave de TOWERS', () => {
  // La caja genérica del fallback es más chica que la real, así que un
  // `towerIconFit('tesla')` (clave de TOWERS, no kind) daría una escala
  // distinta a la correcta. Este test documenta la diferencia para que
  // pasar la clave equivocada se note.
  const correcto = towerIconFit(TOWERS.tesla.kind);
  const incorrecto = towerIconFit('tesla');
  assert.notDeepEqual(correcto, incorrecto,
    'towerIconFit("tesla") no puede dar el mismo encuadre que towerIconFit("chain")');
  assert.equal(rigBox(TOWERS.tesla.kind).y0, TOWER_RIGS.chain.bbox.y,
    'la caja del icono tiene que nacer de la silueta REAL');
});
