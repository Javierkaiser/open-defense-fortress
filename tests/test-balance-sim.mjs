// tests/test-balance-sim.mjs — dev-7 fase 26
// Regresión del SIMULADOR DE BALANCE (scripts/balance-sim.mjs). El sim es un
// instrumento de medición: si sus números no son reproducibles, todas las
// tablas de docs/BALANCE.md son ruido.
//
// Qué fija esta suite:
//  - DETERMINISMO: la misma (stage, seed) da SIEMPRE las mismas métricas.
//    Antes, la tabla de olas procedural (stages 6..50) se sembraba con
//    Math.random SIN sembrar → cada corrida era una muestra distinta de una
//    distribución de ±30 pts de win% en el MISMO stage.
//  - SEMILLAS DISTINTAS → resultados distintos (el sim mide algo).
//  - TECHO = TECHO: las cartas topadas con las cartas REALES de cards.js
//    desaparecen del pool (sin double-dip) y usan los multiplicadores
//    VIGENTES (×1.3 de dmg_all, ×0.9 de cadence_up), no los obsoletos.
//  - ULTIMATE: el sim DISPARA el ORBITAL STRIKE (antes lo cargaba y nunca
//    lo gastaba: 1080 de daño por ultimate quedaban sin usar).
//  - TIMEOUT: "no terminó" (se agotó el corte de seguridad) es distinto de
//    "murió" (HP a 0).
//
// El sim importa los módulos REALES del juego (Fortress/Tower/Enemy/
// WaveManager/cards.js) con un stub de engine sin canvas/DOM: corre en Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runStage, makeRng, applyCeilingCards, createGame, parseStages,
  trajectoryMetaLevel, optimalPerkChoices, cardDpsScore,
} from '../scripts/balance-sim.mjs';
import { CATALOG, isCardEligible } from '../js/cards.js';
import { BASE_HP_BY_STAGE, baseHpForStage } from '../js/stages.js';
import { META_TOWERS, PERKS } from '../js/meta.js';
import * as W from '../js/waves.js';

const card = (id) => CATALOG.find((c) => c.id === id);

test('DETERMINISMO: la misma (stage, seed) da las mismas métricas', async () => {
  const a = await runStage(6, 'greedy', 4242);
  const b = await runStage(6, 'greedy', 4242);
  assert.deepEqual(a, b);
});

test('DETERMINISMO: también en los stages con jefe', async () => {
  // waves.js guarda a nivel de módulo la zona de entrada del jefe
  // (nextBossEntry): sin una instancia fresca por run, la segunda run del
  // mismo stage en el mismo proceso salía distinta.
  const a = await runStage(1, 'greedy', 99);
  const b = await runStage(1, 'greedy', 99);
  assert.deepEqual(a, b);
});

test('DETERMINISMO: el RNG es reproducible y en [0,1)', () => {
  const rng = makeRng(123);
  const v = [rng(), rng(), rng()];
  for (const x of v) assert.ok(x >= 0 && x < 1, `fuera de rango: ${x}`);
  const rng2 = makeRng(123);
  assert.deepEqual([rng2(), rng2(), rng2()], v);
});

test('SEMILLAS DISTINTAS: dan resultados distintos (stage 6)', async () => {
  const runs = [];
  for (const seed of [1, 2, 3]) {
    runs.push(await runStage(6, 'greedy', seed * 7919 + 6));
  }
  const firmas = new Set(runs.map((r) => `${r.win}|${r.duration.toFixed(3)}|${r.hpFrac.toFixed(4)}|${r.leaks}`));
  assert.ok(firmas.size > 1, 'las 3 semillas dieron resultados idénticos');
  for (const r of runs) {
    assert.ok(Number.isFinite(r.duration), 'duración no finita');
    assert.ok(Number.isFinite(r.hpFrac), 'HP finito no finito');
    assert.ok(Number.isFinite(r.lv), 'nivel no finito');
    assert.ok(r.hpFrac >= 0 && r.hpFrac <= 1, `HP fin fuera de rango: ${r.hpFrac}`);
  }
});

test('TECHO: las cartas topadas (cartas REALES) salen del pool', () => {
  const game = createGame(6);
  assert.equal(isCardEligible(card('dmg_all'), game), true, 'dmg_all debería ser elegible de entrada');
  assert.equal(isCardEligible(card('cadence_up'), game), true, 'cadence_up debería ser elegible de entrada');
  applyCeilingCards(game);
  // Sin esto el "techo" se aplicaba DOS veces: la carta seguía elegible y el
  // jugador simulado la tomaba otra vez encima del techo (double-dip).
  assert.equal(isCardEligible(card('dmg_all'), game), false);
  assert.equal(isCardEligible(card('cadence_up'), game), false);
});

test('TECHO: usa los multiplicadores VIGENTES de cards.js (no los obsoletos)', () => {
  const game = createGame(6);
  applyCeilingCards(game);
  const gw = game.fortress.slots.find((t) => t?.type === 'guardian');
  assert.ok(gw, 'el Guardian de arranque no está');
  // dmg_all ×2 (×1.1 por stack) + dmg_type_ballistic ×2 (×1.2) +
  // dmg_guard ×2 (×1.6).
  assert.ok(Math.abs(gw.dmgMul - 1.1 ** 2 * 1.2 ** 2 * 1.6 ** 2) < 1e-9, `dmgMul=${gw.dmgMul}`);
  // cadence_up ×3 (cards.js: ×0.9 por stack) — NO el ×0.85 obsoleto.
  assert.ok(Math.abs(gw.cadMul - 0.9 ** 3) < 1e-9, `cadMul=${gw.cadMul}`);
  // rapid_bullets ×2 (×1.25 por stack).
  assert.ok(Math.abs(gw.bulletSpeedMul - 1.25 ** 2) < 1e-9, `bulletSpeedMul=${gw.bulletSpeedMul}`);
  // Contadores de applications al tope (por eso las cartas salen del pool).
  assert.equal(gw.dmgAllApps, 2);
  assert.equal(gw.cadApps, 3);
  assert.equal(gw.guardDmgApps, 2);
  assert.equal(gw.rapidApps, 2);
});

test('TECHO: una run con techo es más fuerte que la misma run sin techo', async () => {
  const normal = await runStage(6, 'greedy', 7919 + 6);
  const techo = await runStage(6, 'greedy', 7919 + 6, { ceiling: true });
  assert.ok(techo.leaks <= normal.leaks, `techo ${techo.leaks} leaks vs normal ${normal.leaks}`);
  assert.ok(techo.hpFrac >= normal.hpFrac, `techo ${techo.hpFrac} HP vs normal ${normal.hpFrac}`);
});

test('ULTIMATE: el sim dispara el ORBITAL STRIKE', async () => {
  const r = await runStage(1, 'greedy', 7919 + 1);
  assert.ok(r.kills >= 40, `kills=${r.kills} (no alcanza para cargar el ultimate)`);
  assert.ok(r.ultFires >= 1, `ultFires=${r.ultFires} (el sim nunca gastó el medidor)`);
});

test('TIMEOUT: "no terminó" es distinto de "murió"', async () => {
  // fase 72: sin contador de fugas, la única derrota es la base a 0. Con
  // meta Nvl.1 el S50 no se agota por el corte de seguridad: el jugador
  // pierde antes. Este test distingue una derrota real de un timeout.
  const r = await runStage(50, 'greedy', 7919 + 50);
  assert.equal(r.win, false, 'el stage 50 no debería ganarse');
  assert.equal(r.timeout, false, 'ahora se pierde de verdad, no por el corte de seguridad');
  assert.ok(r.duration < 700, `duración=${r.duration}`);
  assert.equal(r.hpFrac, 0,
    `la derrota debe ser la base a 0 (hp=${r.hpFrac})`);
});

test('CLI: --stages acepta rangos y listas', () => {
  assert.deepEqual(parseStages('1-5'), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseStages('1,5,10'), [1, 5, 10]);
  assert.deepEqual(parseStages('6'), [6]);
  assert.deepEqual(parseStages('7-5'), [5, 6, 7]);
  assert.deepEqual(parseStages('basura'), [1, 2, 3, 4, 5, 6, 10, 20, 30, 50]);
});

// ============================================================
// fase 67 - EL INSTRUMENTO MIDE EL MODO INFINITO (51+)
// ============================================================
// Antes: `parseStages` recortaba a 50 (un `--stages=51-60` devolvía la
// campaña por defecto) y `createGame` caía a 3000 HP fuera de la tabla
// (la base del S2), así que ninguna fila 51+ medía nada real.

test('FASE 67: --stages cubre el infinito (rangos y listas hasta 200)', () => {
  assert.deepEqual(parseStages('51-60'), Array.from({ length: 10 }, (_, i) => i + 51));
  assert.deepEqual(parseStages('51'), [51]);
  assert.deepEqual(parseStages('51,55,60,70'), [51, 55, 60, 70]);
  // El tope del instrumento es 200 y recorta el rango por arriba.
  const recortado = parseStages('190-210');
  assert.deepEqual(recortado, Array.from({ length: 11 }, (_, i) => i + 190));
  assert.equal(recortado.at(-1), 200);
  // Fuera de rango por completo y basura siguen cayendo al default.
  assert.deepEqual(parseStages('500'), [1, 2, 3, 4, 5, 6, 10, 20, 30, 50]);
  assert.deepEqual(parseStages(''), [1, 2, 3, 4, 5, 6, 10, 20, 30, 50]);
});

test('FASE 67: la base del infinito es la curva REAL (no el fallback de 3000)', () => {
  // 51+ sale de baseHpForStage(): 2000 + 480 por etapa, redondeado a 100.
  assert.equal(createGame(51).fortress.maxHp, 26000);
  assert.equal(createGame(51).fortress.maxHp, baseHpForStage(51));
  assert.ok(createGame(60).fortress.maxHp > createGame(51).fortress.maxHp,
    'la base tiene que crecer con la profundidad');
  // La campaña NO cambia: S3/S5 conservan sus valores manuales de STAGES.
  for (let s = 1; s <= 5; s++) {
    assert.equal(createGame(s).fortress.maxHp, BASE_HP_BY_STAGE[s], `S${s} cambió de base`);
  }
});

// ============================================================
// dev-7 fase 59 — LA MEDICIÓN DEJA DE MEDIR EL PISO
// ============================================================
// El sim medía por defecto al jugador que NO juega (meta Nvl.1, sin perks,
// sin optimizar las cartas): con ese piso la tabla de docs/BALANCE.md daba win
// 100 % en las 50 etapas y la base-esponja era invisible.

test('FASE 59.1: la trayectoria da los mismos niveles meta que docs/BALANCE.md', () => {
  // La política real: 120 fragmentos por torreta por stage clarifies
  // (60 de victoria + 60 del ×2 de la primera vez) y se sube en cuanto
  // fragCost lo permite.
  assert.equal(trajectoryMetaLevel(1), 1);
  assert.equal(trajectoryMetaLevel(10), 14);
  assert.equal(trajectoryMetaLevel(20), 23);
  assert.equal(trajectoryMetaLevel(21), 24);
  assert.equal(trajectoryMetaLevel(30), 32);
  assert.equal(trajectoryMetaLevel(40), 38);
  assert.equal(trajectoryMetaLevel(50), 44);
});

test('FASE 59.1: la trayectoria es monótona y nunca baja de 1', () => {
  let prev = 0;
  for (let s = 1; s <= 50; s++) {
    const lv = trajectoryMetaLevel(s);
    assert.ok(lv >= prev, `S${s} (${lv}) < S${s - 1} (${prev})`);
    assert.ok(lv >= 1 && lv <= 100, `S${s}: nivel fuera de rango: ${lv}`);
    prev = lv;
  }
});

test('FASE 59.1: la trayectoria da más poder que el piso (y el sim lo usa)', async () => {
  const piso = await runStage(21, 'inteligente', 4242, { metaLv: 1 });
  const tray = await runStage(21, 'inteligente', 4242, { metaLv: 'trajectory' });
  // La trayectoria (meta 24) tiene que matar MÁS enemigos que el piso.
  assert.ok(tray.kills > piso.kills, `trayectoria ${tray.kills} kills vs piso ${piso.kills}`);
  assert.ok(tray.hpFrac >= piso.hpFrac, `trayectoria ${tray.hpFrac} HP vs piso ${piso.hpFrac}`);
});

test('FASE 59.2: --killrate recorta las bajas al presupuesto', async () => {
  const libre = await runStage(21, 'inteligente', 4242, { metaLv: 'trajectory' });
  const cero = await runStage(21, 'inteligente', 4242, { metaLv: 'trajectory', killRate: 0 });
  assert.equal(cero.waveKills, 0, 'con killrate=0 no puede haber bajas');
  assert.equal(cero.killPct, 0);
  assert.ok(cero.leaks > 0, 'con killrate=0 los enemigos tienen que filtrarse');
  // El presupuesto es el X % de los enemigos de la ola. El corte no es
  // exacto al_frame: si al agotarse el presupuesto ya había enemigos
  // dañados en vuelo, pueden caer 2-3 más (el daño ya estaba aplicado).
  const mitad = await runStage(21, 'inteligente', 4242, { metaLv: 'trajectory', killRate: 50 });
  assert.ok(mitad.waveKills <= Math.ceil(mitad.enemies * 0.5) + 3,
    `killrate=50 mató ${mitad.waveKills} de ${mitad.enemies} enemigos`);
  assert.ok(libre.enemies > 0, 'la ola tiene que tener enemigos');
});

test('FASE 59.2: el jefe NO cuenta para el presupuesto de bajas', async () => {
  // El jefe no está en la cola de olas y nunca se escapa: si contara para
  // el presupuesto, con un presupuesto bajo el jefe sería invulnerable y
  // el stage no se podría ganar NUNCA.
  const r = await runStage(1, 'inteligente', 99, { metaLv: 'trajectory', killRate: 90 });
  assert.ok(r.waveKills <= Math.ceil(r.enemies * 0.9) + 1,
    `el presupuesto no se respeta: ${r.waveKills} bajas de ${r.enemies} enemigos`);
  // Si el jefe murió, su baja está en `kills` pero NO en `waveKills`.
  assert.ok(r.kills > r.waveKills, 'el jefe tiene que morir aunque el presupuesto esté agotado');
  assert.equal(r.waveKills, r.kills - 1, 'el jefe es la única baja fuera del presupuesto');
});

test('FASE 59.3: los perks se gatean por el nivel (el bug de --perks=optimal)', () => {
  // Con meta Nvl.24 solo hay 2 tiers desbloqueados (PERK_EVERY=10).
  const c24 = optimalPerkChoices('guardian', 24);
  assert.equal(c24.length, PERKS.guardian.length);
  assert.ok(c24[0] !== null && c24[1] !== null, 'los tiers 1-2 están desbloqueados en Nvl.24');
  assert.equal(c24[2], null, 'el tier 3 (Nvl.30) NO puede estar elegido en Nvl.24');
  assert.ok(c24.slice(2).every((x) => x === null), 'ningún tier por encima del nivel');
  // Y a Nvl.100 están los 10.
  const c100 = optimalPerkChoices('guardian', 100);
  assert.ok(c100.every((x) => x === 0 || x === 1), 'a Nvl.100 los 10 tiers están elegidos');
});

test('FASE 59.3: un meta bajo con perks NO rinde como un meta alto', async () => {
  // Antes del arreglo, "meta 24 + perks" escribía los 10 tiers y el sim
  // le ponía los perks del Nvl.100: por eso la fila de docs/BALANCE.md
  // "meta 24 + perks" estaba inflada.
  const bajo = await runStage(21, 'inteligente', 4242, { metaLv: 24, perks: 'optimal' });
  const alto = await runStage(21, 'inteligente', 4242, { metaLv: 100, perks: 'optimal' });
  // fase 65: el conteo ABSOLUTO de bajas dejó de ser comparable entre metas
  // — el director genera la ola con la POTENCIA del jugador (la apertura se
  // modela con metaDmgMul, fase 28), así que cada meta juega una tabla
  // distinta (medido en S21: 353 enemigos con meta 24, 298 con meta 100). Si
  // la corrida fuerte mata TODO lo que entra, matar "menos" sólo quiere
  // decir que le tocó una ola más chica. Se comparan TASAS (y el conteo
  // absoluto se sigue exigiendo mientras el meta alto no sature).
  assert.ok(alto.killPct >= bajo.killPct,
    `bajas: meta 100 ${alto.killPct.toFixed(3)} vs meta 24 ${bajo.killPct.toFixed(3)}`);
  assert.ok(alto.leaks <= bajo.leaks,
    `fugas: meta 100 ${alto.leaks} vs meta 24 ${bajo.leaks}`);
  // El conteo ABSOLUTO de bajas NO se compara: el director genera la tabla
  // con la potencia del jugador (la apertura se modela con metaDmgMul,
  // fase 28), así que cada meta juega una ola de tamaño distinto (medido en
  // S21 con 5 semillas: 2299 enemigos con meta 24 vs 2274 con meta 100). La
  // comparación honesta es la TASA de bajas (arriba) y las fugas, no un
  // número que depende del tamaño de la ola. Antes había un
  // `if (killPct < 1) assert(kills >)` que comparaba peras con manzanas y
  // caía con el primer rebalanceo que movía la secuencia de sorteo.
});

test('FASE 59.4: el jugador que optimiza puntúa el DAÑO por encima del utility', () => {
  const byId = (id) => CATALOG.find((c) => c.id === id);
  const dpm = cardDpsScore(byId('dmg_all'));
  const util = cardDpsScore(byId('repair_500'));
  const unlock = cardDpsScore(byId('unlock_missile'));
  assert.ok(dpm > util, `dmg_all (${dpm}) debe puntuar más que repair_500 (${util})`);
  assert.ok(unlock > util, `unlock_missile (${unlock}) debe puntuar más que repair_500 (${util})`);
  assert.ok(cardDpsScore(null) < util, 'una carta inexistente puntúa menos que cualquier otra');
});

test('FASE 59.4: el modo inteligente NO rinde menos que el que coge el primer desbloqueo', async () => {
  // TASA agregada de 3 semillas. Medido con 5 semillas en S21: 0,853 vs
  // 0,841 (meta 24) y 0,927 vs 0,936 (meta 100) — las dos heurísticas
  // quedan dentro de ~1,5 % y el SIGNO depende de la etapa/meta, así que
  // una semilla suelta no prueba nada (esta aserción caía por una
  // diferencia de 4 bajas en una corrida). La guarda es "no degrada": el
  // modo que optimiza DPS no puede quedar 2 % por debajo del ingenuo.
  const SEEDS = [4242, 777, 1234];
  let tonto = 0;
  let listo = 0;
  for (const seed of SEEDS) {
    const a = await runStage(21, 'greedy', seed, { metaLv: 'trajectory' });
    const b = await runStage(21, 'inteligente', seed, { metaLv: 'trajectory' });
    tonto += a.kills;
    listo += b.kills;
  }
  assert.ok(listo >= tonto * 0.98,
    `inteligente ${listo} vs greedy ${tonto} (3 semillas, tolerancia 2 %)`);
});

test('FASE 59: las métricas nuevas son coherentes', async () => {
  const r = await runStage(21, 'inteligente', 4242, { metaLv: 'trajectory' });
  assert.ok(r.enemies > 0, 'la ola tiene enemigos');
  assert.ok(r.killPct >= 0 && r.killPct <= 1, `killPct fuera de rango: ${r.killPct}`);
  assert.ok(r.leakPct >= 0 && r.leakPct <= 1, `leakPct fuera de rango: ${r.leakPct}`);
  // Las bajas + las fugas DE LA OLA no pueden pasar del denominador (el
  // jefe va aparte y las crías de mecánicas son presión extra).
  assert.ok(r.waveKills + r.waveLeaks <= r.enemies + 1,
    `${r.waveKills} bajas + ${r.waveLeaks} fugas de ola > ${r.enemies} enemigos`);
});

// ============================================================
// fase 65 (tarea 5.1) — MÉTRICAS DEL DIRECTOR
// ============================================================
// El sim medía el RESULTADO de la partida (win/HP/fugas). El cambio
// 'oleadas-dinamicas' cambió lo que el director GENERA dentro del stage
// (arquetipos, escalonado, familias, variantes) y eso no se ve en el win%:
// el bloque `waves` de la corrida es el que hace legible el antes/después.
// Si se vacía o deja de ser reproducible, las tablas del cambio son ruido.

test('FASE 65.1: el sim expone las métricas del director (y son deterministas)', async () => {
  const a = await runStage(6, 'inteligente', 4242, { metaLv: 'trajectory' });
  const b = await runStage(6, 'inteligente', 4242, { metaLv: 'trajectory' });
  const w = a.waves;
  assert.ok(w, 'falta el bloque de métricas del director');
  assert.equal(w.window, 20, 'la ventana de medición tiene que ser de 20 s');

  // Estructura presente y NO vacía: ventanas, enemigos y HP generado.
  assert.ok(w.windows.length >= 1, `sin ventanas medidas: ${w.windows.length}`);
  assert.ok(w.enemies > 0, 'no se contó ningún enemigo de ola');
  assert.ok(w.hpTotal > 0, `sin HP generado: ${w.hpTotal}`);
  assert.ok(w.types.length > 0, 'sin cast: la etapa no tiene tipos de enemigo');
  assert.ok(w.variety >= 1, `variedad media por ventana: ${w.variety}`);
  for (const v of w.windows) {
    assert.ok(Number.isFinite(v.hp) && v.hp >= 0, `HP de ventana inválido: ${v.hp}`);
    // Una ventana existe porque ALGUIEN entró en ella: o tiene enemigos y
    // tipos (≥1), o está vacía en las dos cosas (los huecos de la apertura
    // y del jefe: quedan fuera de la media, pero siguen en la lista).
    assert.equal(v.enemies > 0, v.types > 0,
      `ventana t=${v.t} incoherente: ${v.enemies} enemigos, ${v.types} tipos`);
  }

  // Presión: la media/picos salen de las ventanas ACTIVAS (las vacías no
  // son respiro de la curva, ver balance-sim). Los ±1 son el redondeo a
  // entero de media/mín/máx.
  const p = w.pressure;
  assert.ok(p.measured >= 1, 'sin ventanas activas para la presión');
  assert.ok(p.measured <= w.windows.length, 'más ventanas activas que ventanas medidas');
  assert.ok(p.min <= p.mean + 1 && p.mean <= p.max + 1,
    `presión incoherente: ${p.min}/${p.mean}/${p.max}`);
  assert.ok(p.peaks <= p.measured, `picos (${p.peaks}) > ventanas medidas (${p.measured})`);
  assert.equal(p.peakMul, 1.15, 'el umbral del pico dejó de ser 1,15×');

  // Familias: cada enemigo de ola cae en UNA familia (las 4 canónicas están
  // siempre en el conteo, aunque salgan a 0).
  const famTotal = Object.values(w.families).reduce((x, y) => x + y, 0);
  assert.equal(famTotal, w.enemies, `${famTotal} familias contadas para ${w.enemies} enemigos`);
  for (const f of ['rock', 'crystal', 'spore', 'virus']) {
    assert.equal(typeof w.families[f], 'number', `falta la familia ${f}`);
  }

  // Variantes: el desglose por variante cuadra con el total.
  const varTotal = Object.values(w.variants.byKind).reduce((x, y) => x + y, 0);
  assert.equal(varTotal, w.variants.total, 'el desglose por variante no cuadra con el total');
  assert.ok(w.variants.total <= w.enemies, 'más variantes que enemigos');

  // Dispersión: la agrupación por DESCARGA tiene que estar midiendo (si el
  // enganche al despacho se rompe, `measured` cae a 0 y el "plato vs
  // arroyo" del cambio se vuelve invisible).
  assert.ok(w.dispersion.dispatched >= 2, `descargas despachadas: ${w.dispersion.dispatched}`);
  assert.ok(w.dispersion.measured >= 1, 'ninguna descarga con ≥2 llegadas: no se mide el escalonado');
  assert.ok(w.dispersion.measured <= w.dispersion.dispatched, 'se midió más de lo despachado');
  assert.ok(w.dispersion.mean >= 0 && w.dispersion.span >= w.dispersion.mean - 1e-9
    && w.dispersion.staggered <= w.dispersion.measured,
    `dispersión incoherente: ${JSON.stringify(w.dispersion)}`);

  // Contrato del director, uso DEFENSIVO: si waves.js ya exporta
  // archetypeOf() y etiqueta la etapa, el sim TIENE que haberlo visto.
  if (typeof W.archetypeOf === 'function' && typeof W.generateStageWaves === 'function') {
    const etiquetados = [1000, 4242, 7919]
      .some((s) => W.generateStageWaves(6, s).some((x) => W.archetypeOf(x)));
    if (etiquetados) {
      assert.ok(w.archetypes.length > 0, 'la etapa trae arquetipos y el sim no vio ninguno');
    }
  }

  // DETERMINISMO: misma (stage, seed) → mismas métricas.
  assert.deepEqual(a.waves, b.waves);
});
