// tests/test-heat-waves.mjs — fase 69 (Protocolo/Heat) en el DIRECTOR DE OLAS
// Cubre el cableado de `js/heat.js` en `js/waves.js`: la semilla del
// Protocolo en la composición de la etapa (Vigor/Prisa/Leva, apertura
// incluida), los diales de Élites y Doble élite en `assignVariant`, y el
// jefe con `bossHpMul` + escolta.
//
// El invariante central: **heat 0 es la fase 68 byte a byte**. Los tests de
// calor comparan contra esa misma semilla, así que un cambio accidental en la
// campaña sin Protocolo rompe el primer test.
//
// Medido con `generateStageWaves` (10 semillas, S50) y volcado a los umbrales
// de acá: la composición del tramo clásico sube ~+32 % de HP con Leva 3 (el
// dial es +45 % de PRESUPUESTO; los topes de molde —enjambre 40, escolta
// 5/16— absorben el resto), y la fracción de enemigos con variante pasa de
// 3,0 % a 9,4 % con Élites 2.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPEN_T, generateStageWaves, waveGroups, waveCount, bossForStage,
  assignVariant, variantsForStage, VARIANT_MAX_FRAC,
} from '../js/waves.js';
import { WaveManager } from '../js/waves-manager.js';
import { ENEMY_TYPES, ENEMY_VARIANTS } from '../js/enemies.js';
import { scaleFor } from '../js/stages.js';
import { heatMods } from '../js/heat.js';

/** Semillas del director (misma forma que test-stages/test-endless-waves). */
const seedOf = (s) => 1000 + s * 37;
const SEEDS_10 = Array.from({ length: 10 }, (_, s) => seedOf(s));
const SEEDS_20 = Array.from({ length: 20 }, (_, s) => seedOf(s));

const isBossWave = (w) => waveGroups(w).some((g) => g.type === 'boss' || g.pattern === 'boss');
/** Descargas del TRAMO CLÁSICO (sin apertura ni ola de jefe). */
const classicWaves = (waves) => waves.filter((w) => w.t >= OPEN_T && !isBossWave(w));
const openingWaves = (waves) => waves.filter((w) => w.t < OPEN_T);
const groupsOf = (waves) => waves.flatMap((w) => waveGroups(w));
const countOf = (waves) => waves.reduce((a, w) => a + waveCount(w), 0);
/** HP BASE de la composición (sin el hpMul del stage). */
const baseHpOf = (waves) => groupsOf(waves)
  .reduce((a, g) => a + (ENEMY_TYPES[g.type]?.hp ?? 0) * (g.count ?? 1), 0);

/** Stub de partida: el engine sólo lleva sus entidades y el manager la lista. */
function stubGame() {
  const enemies = [];
  return { fortress: { enemies }, engine: { addEntity: () => {} } };
}

// ============================================================
// 1. HEAT 0 = FASE 68
// ============================================================

test('fase 69: heat 0 es EXACTAMENTE la fase 68 (sin runMods = heatMods({}))', () => {
  // Campaña (incluye tablas manuales y el generador) y un stage del ∞.
  for (const id of [1, 10, 25, 40, 50, 57]) {
    for (const seed of SEEDS_10) {
      const fase68 = generateStageWaves(id, seed);
      for (const runMods of [null, heatMods({})]) {
        assert.deepEqual(generateStageWaves(id, seed, { runMods }), fase68,
          `S${id} seed ${seed}: el Protocolo vacío no puede mover la etapa`);
      }
    }
  }
});

// ============================================================
// 2. VIGOR — HP × 1,24 sin tocar la composición
// ============================================================

test('fase 69 · Vigor 2: +12 % de HP en el spawn, composición intacta', () => {
  const rm = heatMods({ vigor: 2 });
  const base = scaleFor(50);
  const wm0 = new WaveManager(50);
  const wm = new WaveManager(50, { runMods: rm });
  assert.equal(wm.runMods, rm);
  assert.equal(wm.scale.hpMul, base.hpMul * 1.12);
  assert.equal(wm.scale.velMul, base.velMul, 'Vigor no toca la velocidad');

  // El HP que entra de verdad: el mismo grupo, dos Protocolos.
  const spawnHp = (manager) => {
    const game = stubGame();
    manager._spawnGroup({ type: 'blob', count: 2, pattern: 'vee' }, 0, 1, game, game.fortress.enemies, true);
    return game.fortress.enemies[0].hpMax;
  };
  const hp0 = spawnHp(wm0);
  const hpV = spawnHp(wm);
  assert.equal(hp0, Math.round(ENEMY_TYPES.blob.hp * base.hpMul));
  assert.equal(hpV, Math.round(ENEMY_TYPES.blob.hp * base.hpMul * 1.12));
  assert.ok(Math.abs(hpV / hp0 - 1.12) < 0.005, `el spawn sube ×1,12 (medido ${hpV / hp0})`);

  // La COMPOSICIÓN no cambia (el dial es de resistencia, no de volumen):
  // el HP base agregado de las descargas queda dentro del ±10 %.
  let comp0 = 0;
  let compV = 0;
  for (const seed of SEEDS_10) {
    comp0 += baseHpOf(classicWaves(generateStageWaves(50, seed)));
    compV += baseHpOf(classicWaves(generateStageWaves(50, seed, { runMods: rm })));
  }
  const ratio = compV / comp0;
  assert.ok(ratio > 0.9 && ratio < 1.1, `Vigor no cambia la composición (medido ${ratio.toFixed(3)})`);
});

// ============================================================
// 3. PRISA — velocidad × 1,20
// ============================================================

test('fase 69 · Prisa 2: +10 % de velocidad de caída en el spawn', () => {
  const rm = heatMods({ prisa: 2 });
  const base = scaleFor(50);
  const wm = new WaveManager(50, { runMods: rm });
  assert.equal(wm.scale.velMul, base.velMul * 1.1);
  assert.equal(wm.scale.hpMul, base.hpMul, 'Prisa no toca el HP');

  const game = stubGame();
  // `isOpening: true` desactiva el jitter por enemigo (±7 %): la velocidad
  // del spawn es exactamente la del tipo × la escala efectiva.
  wm._spawnGroup({ type: 'spore', count: 1, pattern: 'vee' }, 0, 1, game, game.fortress.enemies, true);
  const [e] = game.fortress.enemies;
  assert.equal(e.vel, ENEMY_TYPES.spore.vel * wm.scale.velMul);
  assert.equal(e.hpMax, Math.round(ENEMY_TYPES.spore.hp * base.hpMul));
});

// ============================================================
// 4. LEVA — presupuesto de las descargas × 1,45
// ============================================================

test('fase 69 · Leva 3: el presupuesto de las descargas sube (topes de molde incluidos)', () => {
  // El dial es +24 % del PRESUPUESTO de HP de cada descarga del tramo
  // clásico. Lo que se MIDE acá es la composición resultante: los moldes
  // tienen `cap` fijo (enjambre 40, convoy 6/16/16, escolta 5/16), así que
  // en S50 el HP base agregado sube ~+21 % y los conteos ~+10 %. Se
  // verifica la DIRECCIÓN y la MAGNITUD con 10 semillas, no un 1,45 exacto.
  const rm = heatMods({ leva: 3 });
  let hp0 = 0;
  let hpL = 0;
  let n0 = 0;
  let nL = 0;
  for (const seed of SEEDS_10) {
    const a = classicWaves(generateStageWaves(50, seed));
    const b = classicWaves(generateStageWaves(50, seed, { runMods: rm }));
    assert.ok(baseHpOf(b) > baseHpOf(a), `seed ${seed}: Leva mete más HP`);
    // El conteo POR SEMILLA puede bajar: más presupuesto puede cambiar un
    // grupo barato por un tanque (el conteo no escala 1:1, ver
    // docs/BALANCE.md). La dirección agregada (+3 %) se exige abajo.
    hp0 += baseHpOf(a);
    hpL += baseHpOf(b);
    n0 += countOf(a);
    nL += countOf(b);
  }
  assert.ok(hpL / hp0 > 1.12, `HP base +12 % mínimo (medido ${(hpL / hp0).toFixed(3)})`);
  assert.ok(nL / n0 > 1.03, `conteos +3 % mínimo (medido ${(nL / n0).toFixed(3)})`);
});

// ============================================================
// 5. ÉLITES — probabilidad y fracción del 35 %
// ============================================================

test('fase 69 · Élites: chanceAdd sube la probabilidad y fracAdd el tope', () => {
  // 0,75 no pasa el sorteo de la campaña (0,70) pero sí con +0,10 (0,80).
  // El grupo chico (2 de 10 enemigos) cabe en el tope del 35 %.
  const pequena = () => [{ type: 'spore', count: 2, pattern: 'vee' }, { type: 'meteor', count: 8, pattern: 'line' }];
  const sinDial = pequena();
  assert.equal(assignVariant(sinDial, 50, () => 0.75), null);
  assert.equal(sinDial[0].variant, undefined);
  const conDial = pequena();
  assert.notEqual(assignVariant(conDial, 50, () => 0.75, { chanceAdd: 0.1 }), null);
  assert.notEqual(conDial[0].variant, undefined);

  // El tope de fracción: 10 enemigos → cap 3 (35 %) en la campaña. Un
  // grupo de 4 no cabe y la descarga queda sin élite; con +0,06 (41 %)
  // entra.
  const grupos = () => [
    { type: 'meteor', count: 4, pattern: 'line' },
    { type: 'spore', count: 6, pattern: 'vee' },
  ];
  const g0 = grupos();
  assert.equal(assignVariant(g0, 50, () => 0), null, 'sin dial el cap es 35 %');
  assert.equal(VARIANT_MAX_FRAC, 0.35);
  const g1 = grupos();
  assert.equal(assignVariant(g1, 50, () => 0, { fracAdd: 0.06 }), 'escudado',
    'con fracAdd el grupo de 4 cabe en el tope');
  assert.equal(g1[0].variant, 'escudado');

  // Y el efecto agregado: la fracción de enemigos con variante se multiplica.
  const fracOf = (runMods) => {
    let elites = 0;
    let total = 0;
    for (const seed of SEEDS_20) {
      for (const g of groupsOf(classicWaves(generateStageWaves(50, seed, { runMods })))) {
        total += g.count ?? 1;
        if (g.variant) elites += g.count ?? 1;
      }
    }
    return elites / total;
  };
  const f0 = fracOf(heatMods({}));
  const f2 = fracOf(heatMods({ elites: 2 }));
  assert.ok(f2 > f0 * 1.15,
    `Élites 2 sube la fracción (heat 0 ${f0.toFixed(3)} → ${f2.toFixed(3)})`);
});

// ============================================================
// 6. DOBLE ÉLITE — dos afijos en el MISMO grupo
// ============================================================

test('fase 69 · Doble élite: los grupos publican variants[] de 2 ids válidos', () => {
  const allowed = variantsForStage(50);
  let dobles = 0;
  for (const seed of SEEDS_20) {
    const waves = generateStageWaves(50, seed, { runMods: heatMods({ dobles: 1 }) });
    for (const g of groupsOf(classicWaves(waves))) {
      if (!Array.isArray(g.variants)) continue;
      dobles += 1;
      assert.equal(g.variants.length, 2, 'un grupo con doble afijo lleva 2 ids');
      assert.equal(new Set(g.variants).size, 2, 'los dos afijos son distintos');
      for (const id of g.variants) {
        assert.ok(allowed.includes(id), `"${id}" es una variante de la etapa`);
      }
      assert.equal(g.variant, g.variants[0], '`variant` sigue siendo el PRIMERO (compatibilidad)');
    }
  }
  assert.ok(dobles > 0, 'Doble élite tiene que producir grupos con 2 afijos');

  // Sin el dial NINGÚN grupo publica el array: la campaña es la fase 68.
  for (const seed of SEEDS_10) {
    for (const runMods of [null, heatMods({})]) {
      for (const g of groupsOf(classicWaves(generateStageWaves(50, seed, { runMods })))) {
        assert.equal(g.variants, undefined, 'sin Doble élite no hay `variants`');
      }
    }
  }
});

// ============================================================
// 7. JEFE — bossHpMul + escolta de élites
// ============================================================

test('fase 69 · Jefes: HP × bossHpMul y 2 élites de escolta por rango', () => {
  const tipo = bossForStage(50);
  const hpBase = ENEMY_TYPES[tipo].hp;
  const hpEscalado = Math.round(hpBase * (1 + 0.15 * (50 - 1)));

  const sinJefes = stubGame();
  const wm0 = new WaveManager(50);
  wm0._spawnBoss(sinJefes);
  assert.equal(sinJefes.fortress.enemies.length, 1, 'sin Protocolo no hay escolta');
  assert.equal(sinJefes.fortress.enemies[0].hpMax, hpEscalado, 'el jefe de la fase 67');
  assert.equal(wm0.bossRef, sinJefes.fortress.enemies[0]);

  for (const [rango, escolta] of [[1, 2], [2, 4]]) {
    const game = stubGame();
    const wm = new WaveManager(50, { runMods: heatMods({ jefes: rango }) });
    wm._spawnBoss(game);
    const [boss, ...escorts] = game.fortress.enemies;
    const esperado = Math.round(hpBase * (1 + 0.15 * (50 - 1)) * (1 + 0.1 * rango));
    assert.equal(boss.hpMax, esperado, `jefes ${rango}: HP ×${1 + 0.1 * rango}`);
    assert.equal(boss.hp, esperado, 'la vida arranca llena');
    assert.equal(escorts.length, escolta, `jefes ${rango}: ${escolta} escoltas`);
    assert.equal(wm.bossRef, boss, 'el bossRef sigue siendo el jefe (checkBossDead)');
    for (const e of escorts) {
      assert.equal(e.isBoss, false, 'la escolta NO es jefe');
      assert.notEqual(e.type, 'crystal');
      assert.notEqual(e.type, 'boss');
      assert.equal(e.escortOf, null, 'sin escortOf: no cura ni cuenta como esbirro');
      // El HP de la escolta = tipo × escala EFECTIVA × hpMul de su afijo.
      const hpBaseEscolta = Math.round(ENEMY_TYPES[e.type].hp * wm.scale.hpMul);
      const hpEsperado = Math.round(hpBaseEscolta * (ENEMY_VARIANTS[e.variants[0]].hpMul ?? 1));
      assert.equal(e.hpMax, hpEsperado,
        'la escolta entra con la escala EFECTIVA de la etapa');
      assert.equal(e.variants.length, 1, 'la escolta es una élite');
      assert.ok(variantsForStage(50).includes(e.variants[0]));
    }
    // El jefe muere solo con la escolta viva: la escolta no retiene el clear.
    boss.dead = true;
    let cb = null;
    wm.onBossDead((b) => { cb = b; });
    assert.equal(wm.checkBossDead(), true);
    assert.equal(cb, boss);
  }
});

// ============================================================
// 8. LA APERTURA CON VIGOR 3 (el riesgo #1 de la fase)
// ============================================================

test('fase 69 · Apertura S50 con Vigor 3: ≥2 olas, crystal y piso de XP', () => {
  // `powerMul` del ∞ (Nvl.100 → 1 + 18 % × 99 ≈ 18,82) es el escenario
  // realista del endgame: con la escala del Protocolo la apertura tiene que
  // seguir eligiendo tipos matables, o el jugador se queda en Lv1.
  const rm = heatMods({ vigor: 3 });
  const powerMul = 1 + 0.18 * 99;
  for (const seed of SEEDS_10) {
    const opening = openingWaves(generateStageWaves(50, seed, { runMods: rm, powerMul }));
    assert.ok(opening.length >= 2, `seed ${seed}: ${opening.length} olas de apertura`);
    assert.ok(opening.some((w) => waveGroups(w).some((g) => g.type === 'crystal')),
      `seed ${seed}: el crystal garantizado sigue entrando`);
    const xp = opening.reduce((a, w) => a + waveGroups(w)
      .reduce((x, g) => x + (ENEMY_TYPES[g.type]?.score ?? 0) * (g.count ?? 1), 0), 0);
    // openingXpFloor() = 315 (xpForLevel 2+3 con holgura): el piso real.
    assert.ok(xp >= 315, `seed ${seed}: la apertura entrega ${xp} XP (piso 315)`);
  }
});

// ============================================================
// 9. DETERMINISMO
// ============================================================

test('fase 69: misma etapa/semilla/Protocolo → misma etapa', () => {
  const mods = { asedio: 3, leva: 3, vigor: 3, prisa: 2, elites: 2, jefes: 2, dobles: 1 };
  for (const seed of SEEDS_10) {
    const a = generateStageWaves(50, seed, { runMods: heatMods(mods) });
    const b = generateStageWaves(50, seed, { runMods: heatMods(mods) });
    assert.deepEqual(b, a, `seed ${seed}: el Protocolo no puede meter azar extra`);
  }
  // Y el Protocolo V se distingue del heat 0 (el test no es vacuo).
  assert.notDeepEqual(
    generateStageWaves(50, seedOf(0), { runMods: heatMods(mods) }),
    generateStageWaves(50, seedOf(0)),
  );
});
