// tests/test-hud.mjs — cobertura de js/hud.js SIN DOM.
//
// js/hud.js es DOM puro y hasta ahora no tenía tests. Para poder
// testearlo en Node (node:test, sin jsdom) las partes puras se
// extrajeron a funciones que devuelven HTML:
//   - buildMenuScreen({theme, quality, confirmingReset}) → HTML del MENÚ
//   - buildTowerCards(meta, {resetArmed})               → HTML de las cards
//   - buildTorretasScreen(meta, {resetArmed})           → HTML de TORRETAS
// Los builders derivan TODOS los conteos de los datos (META_TOWERS /
// META_MAX_LEVEL): si alguien vuelve a hardcodar "9 torretas" o "/900",
// estos tests lo detectan.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HUD, buildMenuScreen, buildTowerCards, buildTorretasScreen, META_TOTAL_MAX_LEVELS,
  buildRankBadge, canPickCard, CARD_PICK_DEBOUNCE_MS, formatBattleStatus,
  buildStatusStripHtml, buildBossBarHtml,
  towerDps, fortressDps, BOSS_WARNING_MS,
  buildStageGroups, buildStageList, findStageHighlights, stageThemeColor,
  compactStageName, readMetaScroll, restoreMetaScroll,
  // fase 67: las dos tarjetas del endgame (∞ y desafío diario).
  buildEndlessCardHtml, buildDailyCardHtml,
  // fase 69: el Protocolo de asedio (heat) en el HUD.
  buildProtocolHtml, buildProtocolCardHtml,
  // fase 71: scroll y foco del Protocolo al re-renderizar.
  readProtocolScroll, restoreProtocolScroll, readProtocolFocus, restoreProtocolFocus,
  // fase 70: la tarjeta del modo arcade y la sala de récords.
  buildSurvivalCardHtml, buildRecordsHtml,
  // fase 72: los créditos y licencias (atribución CC BY 3.0 en la app).
  buildCreditsHtml,
  CARD_RARITIES, cardRarity, UI_ICONS, overlayStageBox,
  // dev-7 fase 59.4: la línea de PODER del meta (el multiplicador real).
  buildPowerLineHtml,
  metaPowerMul, fmtFrags,
  // dev-7 fase 64: el texto del pie del modal de cartas (cola de mejoras +
  // tope de la etapa) y el rótulo de nivel del HUD.
  cardHintText, levelLabelText,
  // oleadas-dinámicas (WS-C): el banner del arquetipo que ENTRA y el
  // sesgo de familia del selector de etapa.
  archetypeBannerText, ARCHETYPE_BANNER_TEXT, ARCHETYPE_BANNER_MS,
  shouldAnnounceArchetype,
  stageFamilyText, STAGE_FAMILY_SECOND_SHARE,
} from '../js/hud.js';
// dev-7 fase 64: el techo de cartas de una etapa. Los tests lo leen del
// DATO (score.js), no de un literal: si la calibración cambia, el HUD
// tiene que seguir diciendo la verdad.
import { MAX_LEVEL_PER_STAGE, MAX_CARDS_PER_STAGE } from '../js/score.js';
import {
  META_TOWERS, META_MAX_LEVEL, PERK_EVERY, PERK_TIERS, PERKS,
  META_GOLD_START, META_FRAG_PER_VICTORY, META_UNLOCK_COSTS,
  defaultMeta, normalizeMeta, pendingPerkTiers, tierAtLevel,
  metaDmgMul, playerRank, unlockTower,
} from '../js/meta.js';
import { STAGES } from '../js/stages.js';
// dev-7 fase 46: el nombre PROPIO de cada jefe (lo usan la barra de jefe
// y el aviso de jefe) + el mapa de nombres por stage.
import { bossNameForStage, BOSS_NAMES } from '../js/waves.js';
// oleadas-dinámicas (WS-C): el sesgo de familia por etapa del director.
// Va por NAMESPACE (no `import { poolForStage }`): mientras WS-A no lo
// exponga, el import con nombre rompería ESTE archivo de tests entero.
import * as wavesModule from '../js/waves.js';
// dev-7 fase 39: el catálogo de cartas (la rareza la declara cada carta).
import { CATALOG } from '../js/cards.js';
// dev-7 fase 49: los tipos de daño (el glifo de la card + la matriz con
// la que se calculan los números de la sinonergia).
import {
  DAMAGE_TYPES, ENEMY_FAMILIES, ENEMY_FAMILY_IDS, dmgMultiplier,
  // oleadas-dinámicas (WS-C): el BESTIARIO documenta las variantes de
  // élite. Los datos llegan por PARÁMETRO: estos tests inyectan su tabla.
  buildBestiaryHtml, BESTIARY_VARIANT_IDS, BESTIARY_VARIANT_SAMPLE,
} from '../js/damagetypes.js';
// dev-7 fase 49: el tipo de daño de cada unidad (de ahí lo toma la carta).
import { TOWERS, DRONES, MAX_DRONES } from '../js/towers.js';
// fase 68: el catálogo REAL de variantes (7 afijos) para el bestiario.
import { ENEMY_VARIANTS } from '../js/enemies.js';
// fase 61: el arsenal por partida es el número de SLOTS (5, una fila):
// los tests del HUD comprueban contra el DATO, no contra un literal.
import { CONFIG } from '../js/engine.js';
// fase 69: el catálogo REAL del Protocolo (los datos que pinta la pantalla).
import { HEAT_CONDS, HEAT_PRESETS, HEAT_MILESTONES, heatTotal } from '../js/heat.js';

/** CSS del juego (para verificar los recortes, la paleta y el velo). */
const CSS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'css', 'style.css',
);
const css = readFileSync(CSS_PATH, 'utf8');

/** El HTML de la página (el HUD: los botones con iconos). */
const INDEX_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html',
);
const indexHtml = readFileSync(INDEX_PATH, 'utf8');

/**
 * Rangos de EMOJI (fase 41). La UI ya no debe tenerlos: cada plataforma
 * los dibujaba distinto y en la misma fila unos salían en color y otros
 * en línea (el 🗼 coloreado y sus vecinos en contorno).
 * NO incluye los bloques geométricos (▶ ● · ▲ ▼): esos glifos son
 * intencionales (marcas de lista, la "•" del oro) y no son emoji.
 */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

/** Los emoji que quedan en un texto (para el mensaje de error). */
const emojiOf = (text) => [...String(text).matchAll(EMOJI_RE)].map((m) => m[0]);

/** Regla CSS completa (selector + declaraciones) que empieza por el selector dado. */
const cssRule = (sel) => {
  const i = css.indexOf(sel);
  if (i < 0) return '';
  const open = css.indexOf('{', i);
  const end = css.indexOf('}', open);
  if (open < 0 || end < 0) return '';
  return css.slice(i, end);
};

/**
 * Meta base de los tests: TODAS las unidades desbloqueadas (los tests
 * viejos asumen el arsenal completo) y nivel/perks configurables. Un test
 * que necesite unidades bloqueadas pasa su propio `unlocked`.
 */
const metaCon = (extra = {}) => normalizeMeta({
  ...defaultMeta(),
  unlocked: Object.fromEntries(META_TOWERS.map((t) => [t.key, true])),
  ...extra,
});

/** Cuenta cuántas cards hay en el HTML (class="meta-card "). */
const countCards = (html) => (html.match(/class="meta-card /g) ?? []).length;

/** Extrae la card de una torreta concreta del HTML de las cards. */
const cardOf = (html, key) => {
  const parts = html.split('<div class="meta-card ');
  return parts.find((p) => p.includes(`data-meta-icon="${key}"`)) ?? '';
};

/** Líneas VISIBLES del bloque de perks elegidos de una card. */
const perkLinesOf = (card) => {
  const m = card.match(/<span class="meta-card-perk"[^>]*>([\s\S]*?)<\/span>/);
  return m ? m[1].split('<br>') : [];
};

// ============================================================
// BUG 1 — conteos hardcodeados ("9 torretas", "/900")
// ============================================================

test('META_TOTAL_MAX_LEVELS se deriva de los datos (torretas × tope)', () => {
  assert.equal(META_TOTAL_MAX_LEVELS, META_TOWERS.length * META_MAX_LEVEL);
  assert.equal(META_TOTAL_MAX_LEVELS, 1100, '11 torretas × Nvl.100');
});

test('buildTorretasScreen: el banner muestra /1100 y NO /900', () => {
  const html = buildTorretasScreen(defaultMeta());
  assert.ok(html.includes('/1100'), 'el banner debe mostrar el tope real /1100');
  assert.ok(!html.includes('/900'), 'no debe quedar el tope viejo /900');
});

test('buildTorretasScreen: el texto de fragmentos usa la cantidad real de torretas', () => {
  const html = buildTorretasScreen(defaultMeta());
  assert.ok(html.includes(`las ${META_TOWERS.length} torretas`),
    'el banner debe nombrar las 11 torretas');
  assert.ok(!html.includes('las 9 torretas'), 'no debe quedar "las 9 torretas"');
});

test('buildTorretasScreen: NO contiene ningún conteo de torretas hardcodeado', () => {
  const html = buildTorretasScreen(defaultMeta());
  // dev-7 fase 40: la pantalla incluye ahora el BESTIARIO, que muestra
  // datos REALES de los enemigos (un "900" puede ser legit: los puntos
  // de un blob). El chequeo de conteos hardcodeados aplica a la parte
  // de TORRETAS, que es la que podría mentir sobre cuántas hay.
  const torretas = html.split('id="meta-bestiario"')[0];
  assert.ok(!/9 torretas/.test(torretas), 'no debe aparecer "9 torretas"');
  assert.ok(!/\/900/.test(torretas), 'no debe aparecer "/900"');
  // El único "900" admisible sería parte de otro número; se revisa el
  // contexto exacto de cada aparición.
  const hits = [...torretas.matchAll(/.{0,20}900.{0,20}/g)].map((m) => m[0]);
  assert.deepEqual(hits, [], `aparece "900" fuera de contexto: ${hits.join(' | ')}`);
});

test('buildMenuScreen: la advertencia de borrado usa la cantidad real de torretas', () => {
  const html = buildMenuScreen({ theme: 'neon', quality: 'alta', confirmingReset: true });
  assert.ok(html.includes(`las ${META_TOWERS.length} torretas mejoradas`),
    'la confirmación debe decir "las 11 torretas mejoradas"');
  assert.ok(!html.includes('9 torretas'), 'no debe quedar "9 torretas"');
});

test('buildMenuScreen: sin confirmación muestra el botón de pedir confirmación', () => {
  const html = buildMenuScreen({ theme: 'neon', quality: 'alta', confirmingReset: false });
  assert.ok(html.includes('data-action-reset="ask"'), 'debe ofrecer "Borrar progreso"');
  assert.ok(!html.includes('data-action-reset="confirm"'), 'no debe pedir confirmación todavía');
  assert.ok(!html.includes('reset-warn'), 'sin confirmación no hay aviso de borrado');
});

test('buildTorretasScreen: el banner escala con los niveles (11 de 1100 por defecto)', () => {
  const html = buildTorretasScreen(defaultMeta());
  // defaultMeta: todas las torretas en Nvl.1 → 11 niveles de 1100.
  assert.ok(html.includes(`>${META_TOWERS.length}<small>/${META_TOTAL_MAX_LEVELS}</small>`),
    'el banner debe mostrar 11/1100 con el meta por defecto');
});

// ============================================================
// Cards de TORRETAS: cobertura y coherencia
// ============================================================

test('buildTowerCards: una card por torreta de META_TOWERS', () => {
  const html = buildTowerCards(metaCon());
  assert.equal(countCards(html), META_TOWERS.length);
  for (const t of META_TOWERS) {
    assert.ok(html.includes(`data-meta-upgrade="${t.key}"`), `falta la card de ${t.key}`);
  }
});

test('buildTowerCards: una cuenta nueva tiene 1 card desbloqueada y 10 bloqueadas', () => {
  // defaultMeta (v2): solo el Guardian viene desbloqueado; el resto se
  // compra con oro (`META_UNLOCK_COSTS`).
  const meta = defaultMeta();
  const html = buildTowerCards(meta);
  assert.equal(countCards(html), META_TOWERS.length, 'siguen estando las 11 cards');
  assert.ok(html.includes('data-meta-upgrade="guardian"'), 'el Guardian se puede mejorar');
  assert.equal((html.match(/class="meta-card locked"/g) ?? []).length, META_TOWERS.length - 1,
    'las otras 10 están bloqueadas');
  for (const t of META_TOWERS) {
    if (t.key === 'guardian') {
      assert.ok(!html.includes(`data-meta-unlock="${t.key}"`), 'el Guardian no se compra');
      continue;
    }
    assert.ok(html.includes(`data-meta-unlock="${t.key}"`), `falta el botón de ${t.key}`);
    assert.ok(!html.includes(`data-meta-upgrade="${t.key}"`), `${t.key} bloqueada no se mejora`);
  }
});

test('buildTowerCards: la card bloqueada muestra el precio y no tiene nivel/barra/perks', () => {
  const html = buildTowerCards(metaCon({ gold: 1000, unlocked: { ...defaultMeta().unlocked } }));
  const card = cardOf(html, 'tesla');
  const cost = META_UNLOCK_COSTS.tesla;
  assert.ok(card.startsWith('locked">'), 'la card va marcada como bloqueada');
  assert.ok(card.includes(`Coste ${cost}●`), 'muestra el precio en oro');
  assert.ok(card.includes(`DESBLOQUEAR (${cost}●)`), 'el botón dice cuánto cuesta');
  assert.ok(!card.includes('meta-card-lvl'), 'sin nivel');
  assert.ok(!card.includes('meta-card-bar'), 'sin barra de fragmentos');
  assert.ok(!card.includes('data-perk-pick'), 'sin botón de perks');
  assert.ok(!card.includes('data-perk-reset-ask'), 'sin REDISTRIBUIR');
  assert.ok(!card.includes('data-meta-upgrade'), 'sin MEJORAR');
});

test('buildTowerCards: sin oro suficiente el botón de desbloquear va deshabilitado', () => {
  const meta = metaCon({
    gold: 0,
    unlocked: { ...defaultMeta().unlocked },
  });
  const card = cardOf(buildTowerCards(meta), 'tesla');
  const cost = META_UNLOCK_COSTS.tesla;
  assert.ok(card.includes('disabled'), 'el botón queda deshabilitado');
  assert.ok(card.includes(`Faltan ${cost}●`), 'y dice cuánto oro falta');
  assert.ok(!card.includes(`DESBLOQUEAR (${cost}●)`), 'no ofrece comprar lo que no puede pagar');
});

test('buildTowerCards: con oro suficiente el botón de desbloquear está habilitado', () => {
  const cost = META_UNLOCK_COSTS.tesla;
  const meta = metaCon({
    gold: cost + 10,
    unlocked: { ...defaultMeta().unlocked },
  });
  const card = cardOf(buildTowerCards(meta), 'tesla');
  assert.ok(card.includes(`DESBLOQUEAR (${cost}●)`), 'ofrece la compra');
  assert.ok(!card.includes('disabled'), 'y el botón está habilitado');
  assert.ok(!card.includes('Faltan'), 'no avisa que falta oro');
});

test('buildTowerCards: la compra con oro convierte la card en una de MEJORAR', () => {
  const meta = metaCon({
    gold: META_UNLOCK_COSTS.tesla,
    unlocked: { ...defaultMeta().unlocked },
  });
  const res = unlockTower(meta, 'tesla');
  assert.equal(res.ok, true, 'la compra sale bien');
  assert.equal(res.meta.unlocked.tesla, true, 'la unidad queda desbloqueada');
  assert.equal(res.meta.gold, 0, 'y se cobra el oro');
  const card = cardOf(buildTowerCards(res.meta), 'tesla');
  assert.ok(!card.includes('locked'), 'la card ya no está bloqueada');
  assert.ok(card.includes('data-meta-upgrade="tesla"'), 'ahora se puede mejorar');
  assert.ok(card.includes('Coste 75 · pool 0'), 'muestra coste y pool compartido');
});

test('buildTowerCards: la compra armada muestra la confirmación', () => {
  const meta = metaCon({
    gold: META_UNLOCK_COSTS.tesla,
    unlocked: { ...defaultMeta().unlocked },
  });
  const card = cardOf(buildTowerCards(meta, { unlockArmed: { tesla: true } }), 'tesla');
  assert.ok(card.includes('meta-unlock armed'), 'el botón queda armado');
  assert.ok(card.includes('¿SEGURO?'), 'y pide confirmación');
});

test('v2: DESBLOQUEAR pide confirmación en 2 pasos y cobra el oro al confirmar', () => {
  // El handler real de la pantalla TORRETAS: el primer toque arma la
  // compra, el segundo la paga (mismo patrón inline que REDISTRIBUIR).
  const listeners = [];
  const btn = {
    dataset: { metaUnlock: 'tesla' },
    addEventListener: (_ev, fn) => listeners.push(fn),
  };
  const hud = Object.create(HUD.prototype);
  hud._unlockArmed = {};
  hud._perkResetArmed = {};
  hud.overlayRoot = {
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '[data-meta-unlock]' ? [btn] : []),
  };
  const shown = [];
  hud.showScreen = (name) => shown.push(name);
  const game = {
    meta: normalizeMeta({
      ...defaultMeta(),
      gold: META_UNLOCK_COSTS.tesla,
      unlocked: { ...defaultMeta().unlocked },
    }),
  };
  const prevWindow = globalThis.window;
  const prevRaf = globalThis.requestAnimationFrame;
  globalThis.window = { __GDF__: { game } };
  globalThis.requestAnimationFrame = (fn) => fn();
  try {
    hud._bindMetaNav();
    listeners[0](); // primer toque: arma
    assert.equal(hud._unlockArmed.tesla, true, 'el primer toque arma la compra');
    assert.equal(game.meta.gold, META_UNLOCK_COSTS.tesla, 'todavía no cobra');
    assert.equal(game.meta.unlocked.tesla, false, 'la unidad sigue bloqueada');

    listeners[0](); // segundo toque: paga
    assert.equal(hud._unlockArmed.tesla, false, 'la compra queda desarmada');
    assert.equal(game.meta.unlocked.tesla, true, 'la unidad queda desbloqueada');
    assert.equal(game.meta.gold, 0, 'y se cobra el oro');
    assert.deepEqual(shown, ['TORRETAS', 'TORRETAS'], 'cada paso repinta la pantalla');
  } finally {
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
    if (prevRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = prevRaf;
  }
});

test('buildTowerCards: el botón MEJORAR muestra el nivel siguiente real', () => {
  const meta = metaCon({ levels: { ...defaultMeta().levels, guardian: 12 } });
  const html = buildTowerCards(meta);
  assert.ok(html.includes('MEJORAR → Nvl.13'), 'la card debe ofrecer el nivel 13');
});

// ============================================================
// BUG 3 — "Próximo Nvl.X" nombraba un tier distinto al del botón ✦
// ============================================================

test('buildTowerCards: el rótulo del pendiente nombra el tier que abre el botón ✦', () => {
  // Guardian Nvl.60: tiers 0..5 desbloqueados, solo el 5 elegido → el
  // botón ✦ abre el PRIMER pendiente (tier 0 → Nvl.10), NO el "próximo
  // por nivel" (tier 6 → Nvl.70).
  const meta = metaCon({
    levels: { ...defaultMeta().levels, guardian: 60 },
    perkChoices: { ...defaultMeta().perkChoices, guardian: [null, null, null, null, null, 0] },
  });
  const pendientes = pendingPerkTiers('guardian', meta);
  assert.equal(pendientes[0], 0, 'precondición: el primer pendiente es el tier 0');

  const html = buildTowerCards(meta);
  assert.ok(html.includes('✦ ELEGIR PERK · Nvl.10'),
    'el botón ✦ debe anunciar el tier que realmente abre (Nvl.10)');
  assert.ok(html.includes('Perk pendiente Nvl.10:'),
    'el texto del pendiente debe nombrar el mismo tier que el botón');
  assert.ok(!html.includes('Nvl.70'),
    'no debe nombrar el tier "próximo por nivel" (Nvl.70) que el botón NO abre');
});

test('buildTowerCards: el texto del pendiente sigue al tier pendiente real', () => {
  // Nvl.35: tiers 0..2 desbloqueados, el 0 y el 1 elegidos → pendientes[0] = 2 → Nvl.30.
  const meta = metaCon({
    levels: { ...defaultMeta().levels, guardian: 35 },
    perkChoices: { ...defaultMeta().perkChoices, guardian: [0, 1, null, null, null, null, null, null, null, null] },
  });
  assert.equal(pendingPerkTiers('guardian', meta)[0], 2);
  const html = buildTowerCards(meta);
  assert.ok(html.includes('✦ ELEGIR PERK · Nvl.30'));
  assert.ok(html.includes('Perk pendiente Nvl.30:'));
  assert.ok(!html.includes('Nvl.40'), 'no debe mencionar el siguiente por nivel (Nvl.40)');
});

test('buildTowerCards: con varios pendientes el botón los cuenta', () => {
  // Nvl.55 → tiers 0..4 desbloqueados y sin elegir → 5 pendientes.
  const meta = metaCon({
    levels: { ...defaultMeta().levels, guardian: 55 },
    perkChoices: { ...defaultMeta().perkChoices, guardian: [null, null, null, null, null] },
  });
  assert.equal(pendingPerkTiers('guardian', meta).length, 5);
  const html = buildTowerCards(meta);
  assert.ok(html.includes('(×5)'), 'el botón debe avisar cuántos tiers quedan pendientes');
});

test('buildTowerCards: los perks ELEGIDOS se listan en orden ASCENDENTE de nivel', () => {
  const meta = metaCon({
    levels: { ...defaultMeta().levels, guardian: 60 },
    perkChoices: { ...defaultMeta().perkChoices, guardian: [0, null, 1, null, null, 1] },
  });
  const card = cardOf(buildTowerCards(meta), 'guardian');
  const lines = perkLinesOf(card);
  assert.equal(lines.length, 3, 'deben verse 3 perks elegidos (tiers 0, 2 y 5)');
  const lvls = lines.map((l) => Number(l.match(/Nvl\.(\d+):/)[1]));
  assert.deepEqual(lvls, [10, 30, 60], `los niveles deben ir ascendentes: ${lvls.join(',')}`);
  // Antes el listado iba en orden DESCENDENTE (bug del .reverse()).
  assert.notDeepEqual(lvls, [60, 30, 10]);
});

test('buildTowerCards: sin perks elegidos no queda una lista de perks vacía', () => {
  const html = buildTowerCards(metaCon());
  assert.ok(!html.includes('class="meta-card-perk"'),
    'no debe renderizarse el bloque de perks elegidos si no hay ninguno');
});

test('buildTowerCards: sin pendientes muestra el próximo tier POR DESBLOQUEAR', () => {
  // Nvl.25 con el tier 0 y 1 elegidos → no hay pendientes; el próximo por
  // desbloquear es el tier 2 (Nvl.30) = tierAtLevel(25)+1.
  const meta = metaCon({
    levels: { ...defaultMeta().levels, guardian: 25 },
    perkChoices: { ...defaultMeta().perkChoices, guardian: [0, 1, null, null, null, null, null, null, null, null] },
  });
  assert.equal(pendingPerkTiers('guardian', meta).length, 0);
  const html = buildTowerCards(meta);
  assert.ok(html.includes('Próximo Nvl.30:'), 'debe previsualizar el próximo tier a desbloquear');
  assert.ok(!html.includes('data-perk-pick="guardian"'),
    'sin pendientes no debe haber botón ✦');
});

test('buildTowerCards: el texto del pendiente coincide con las opciones reales del tier', () => {
  const meta = metaCon({
    levels: { ...defaultMeta().levels, guardian: 15 },
    perkChoices: { ...defaultMeta().perkChoices, guardian: [null, null, null, null, null, null, null, null, null, null] },
  });
  const html = buildTowerCards(meta);
  const opts = PERKS.guardian[0];
  assert.ok(html.includes(opts.A.desc) && html.includes(opts.B.desc),
    'deben aparecer las dos opciones del tier pendiente');
});

test('buildTowerCards: el botón ✦ apunta a la torreta correcta', () => {
  const meta = metaCon({
    levels: { ...defaultMeta().levels, laser: 30 },
    perkChoices: { ...defaultMeta().perkChoices, laser: [null, null, null, null, null, null, null, null, null, null] },
  });
  const html = buildTowerCards(meta);
  assert.ok(html.includes('data-perk-pick="laser"'), 'el Láser también tiene perks pendientes');
  assert.ok(html.includes('✦ ELEGIR PERK · Nvl.10'));
});

test('buildTowerCards: una torreta al máximo no ofrece botón ✦ ni mejora', () => {
  const meta = metaCon({
    levels: { ...defaultMeta().levels, guardian: META_MAX_LEVEL },
    perkChoices: { ...defaultMeta().perkChoices, guardian: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1] },
  });
  const html = buildTowerCards(meta);
  assert.ok(!html.includes('data-meta-upgrade="guardian"'), 'no se puede mejorar al máximo');
  assert.ok(!html.includes('data-perk-pick="guardian"'), 'no hay perks pendientes');
  assert.ok(html.includes('MÁX'), 'la card muestra MÁX');
  assert.ok(html.includes('Todos los perks de esta torreta ya están elegidos'));
});

test('buildTowerCards: la barra compara el POOL compartido con el coste de la mejora', () => {
  const meta = metaCon({ fragsPool: 75 });
  const card = cardOf(buildTowerCards(meta), 'guardian');
  assert.ok(card.includes('Coste 75 · pool 75'), 'la card muestra coste y pool (fragCost(1) = 75)');
  assert.ok(card.includes('¡LISTO!'), 'con pool suficiente el botón MEJORAR se habilita');
  assert.ok(!card.includes('disabled'), 'el botón queda habilitado');
  assert.ok(!card.includes('Faltan'), 'si está listo no avisa que faltan');
});

test('buildTowerCards: el pool es COMPARTIDO por todas las cards desbloqueadas', () => {
  const meta = metaCon({ fragsPool: 400 });
  const html = buildTowerCards(meta);
  // Las 11 cards desbloqueadas leen el MISMO pool: 400 alcanza el coste
  // de la primera mejora de todas (75-145 según la torreta).
  const cards = html.split('<div class="meta-card ').slice(1);
  assert.equal(cards.length, META_TOWERS.length);
  for (const card of cards) {
    assert.ok(card.includes('pool 400'), 'cada card desbloqueada ve el pool global');
    assert.ok(!card.includes('Faltan'), 'y ninguna avisa que faltan fragmentos');
  }
  assert.equal((html.match(/pool 400/g) ?? []).length, META_TOWERS.length,
    'el pool se repite en cada card (no hay fragmentos por torreta)');
});

test('buildTowerCards: la barra de una card se llena con el pool, no se desborda', () => {
  const meta = metaCon({ fragsPool: 5000 });
  const card = cardOf(buildTowerCards(meta), 'guardian');
  assert.ok(card.includes('width:100%'), 'con pool de sobra la barra queda llena');
});

test('buildTowerCards: sin pool la barra queda vacía y avisa cuánto falta', () => {
  const card = cardOf(buildTowerCards(metaCon()), 'guardian');
  assert.ok(card.includes('width:0%'), 'sin fragmentos la barra arranca vacía');
  assert.ok(card.includes('Faltan 75 fragmentos del pool'), 'y dice cuántos faltan');
  assert.ok(card.includes('disabled'), 'MEJORAR está deshabilitado');
});

test('buildTowerCards: el botón REDISTRIBUIR solo aparece si hay perks elegidos', () => {
  const sinElegidos = buildTowerCards(metaCon());
  assert.ok(!sinElegidos.includes('data-perk-reset-ask="guardian"'));
  const conElegidos = buildTowerCards(metaCon({
    perkChoices: { ...defaultMeta().perkChoices, guardian: [0, null, null, null, null, null, null, null, null, null] },
  }));
  assert.ok(conElegidos.includes('data-perk-reset-ask="guardian"'));
});

test('buildTowerCards: la confirmación de REDISTRIBUIR se arma si está armada', () => {
  const meta = metaCon({
    perkChoices: { ...defaultMeta().perkChoices, guardian: [0, null, null, null, null, null, null, null, null, null] },
  });
  const html = buildTowerCards(meta, { resetArmed: { guardian: true } });
  assert.ok(html.includes('data-perk-reset-confirm="guardian"'));
  assert.ok(html.includes('data-perk-reset-cancel="guardian"'));
});

// ============================================================
// BUG 2 — detección del modal (perk vs combo) y cierre idempotente
//
// js/hud.js es DOM puro: estos tests usan un nodo MODAL FALSO (no hace
// falta jsdom ni un DOM real) para ejercitar la lógica de detección y de
// cierre, que es lo que quedaba trabado en el navegador.
// ============================================================

/** Nodo modal falso: implementa lo mínimo que usa el HUD. */
const fakeModal = (html = '') => {
  const classes = new Set(['hidden']);
  const node = {
    innerHTML: html,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); },
    },
    setAttribute: () => {},
    getAttribute: () => null,
    querySelector(sel) {
      for (const w of sel.split(',').map((s) => s.trim())) {
        const m = w.match(/\[([\w-]+)\]/);
        if (m && node.innerHTML.includes(m[1])) return { tag: 'BUTTON' };
      }
      return null;
    },
  };
  return node;
};

/** HUD sin constructor (el constructor necesita un DOM real). */
const fakeHud = (modal = null) => {
  const hud = Object.create(HUD.prototype);
  hud.cardModal = modal;
  // El panel combo tiene su PROPIO nodo (#combo-panel), aparte del modal
  // de cartas/perk (#card-choice).
  hud.comboPanel = null;
  hud._modalKind = null;
  hud._focusBeforeModal = null;
  hud._focusBeforeCombo = null;
  hud.overlayRoot = null;
  return hud;
};

const PERK_MODAL_HTML = '<h2 class="card-title">Perk</h2><button data-perk-close>CERRAR</button>';
const COMBO_MODAL_HTML = '<h2 class="card-title">COMBO LIST</h2><button data-combo-close>CERRAR</button>';
const CARD_MODAL_HTML = '<button class="card-choice-card" data-card-id="x"></button>';

test('anyModalOpen: detecta el modal de PERK (el que antes se escapaba)', () => {
  const modal = fakeModal(PERK_MODAL_HTML);
  modal.classList.remove('hidden');
  const hud = fakeHud(modal);
  assert.equal(hud.anyModalOpen(), true,
    'el modal de perk debe detectarse como abierto (bug: tapaba el menú)');
});

test('anyModalOpen: un modal oculto NO cuenta como abierto', () => {
  const hud = fakeHud(fakeModal(PERK_MODAL_HTML)); // arranca con .hidden
  assert.equal(hud.anyModalOpen(), false);
});

test('anyModalOpen: sin modal (cardModal null) no rompe', () => {
  const hud = fakeHud(null);
  assert.equal(hud.anyModalOpen(), false);
  assert.equal(hud.comboOpen(), false);
});

test('comboOpen: solo es true con el panel COMBO, no con el de perk', () => {
  // El panel combo vive en su propio nodo (#combo-panel).
  const combo = fakeModal(COMBO_MODAL_HTML);
  combo.classList.remove('hidden');
  const hud = fakeHud(null);
  hud.comboPanel = combo;
  assert.equal(hud.comboOpen(), true);

  const perk = fakeModal(PERK_MODAL_HTML);
  perk.classList.remove('hidden');
  const hud2 = fakeHud(perk);
  assert.equal(hud2.comboOpen(), false,
    'comboOpen() es específico del panel combo (el perk usa otro botón)');
  assert.equal(hud2.anyModalOpen(), true,
    'anyModalOpen() sí cubre el modal de perk');
});

test('hideCardChoice: es idempotente y null-safe', () => {
  // Sin modal: no debe lanzar.
  const hud = fakeHud(null);
  assert.doesNotThrow(() => hud.hideCardChoice());
  assert.doesNotThrow(() => hud.hideCardChoice());

  // Con modal de perk: cierra, limpia el HTML y se puede volver a llamar.
  const modal = fakeModal(PERK_MODAL_HTML);
  modal.classList.remove('hidden');
  const hud2 = fakeHud(modal);
  hud2.hideCardChoice();
  assert.equal(modal.classList.contains('hidden'), true, 'el modal debe quedar oculto');
  assert.equal(modal.innerHTML, '', 'el HTML del modal debe limpiarse');
  assert.doesNotThrow(() => hud2.hideCardChoice());
  assert.equal(hud2.anyModalOpen(), false);
});

test('hideCardChoice: cierra también el modal de perk (el que tapaba el menú)', () => {
  const modal = fakeModal(PERK_MODAL_HTML);
  modal.classList.remove('hidden');
  const hud = fakeHud(modal);
  assert.equal(hud.anyModalOpen(), true);
  hud.hideCardChoice();
  assert.equal(hud.anyModalOpen(), false, 'tras cerrar, no queda nada bloqueando la pantalla');
});

// ============================================================
// Coherencia general del HTML generado
// ============================================================

test('buildTorretasScreen: el HTML tiene la grilla, el banner y la nav', () => {
  const html = buildTorretasScreen(defaultMeta());
  assert.ok(html.includes('class="meta-grid"'));
  assert.ok(html.includes('class="meta-banner"'));
  assert.ok(html.includes('class="meta-nav"'));
  assert.ok(html.includes('data-meta-tab="torretas"'));
  assert.equal(countCards(html), META_TOWERS.length);
});

test('buildTorretasScreen: el nav tiene las 5 pestañas', () => {
  const html = buildTorretasScreen(defaultMeta());
  assert.equal((html.match(/class="meta-tab/g) ?? []).length, 5);
});

test('buildTorretasScreen: ningún conteo de torretas está hardcodeado', () => {
  const html = buildTorretasScreen(defaultMeta());
  const hits = [...html.matchAll(/.{0,25}\b9\b(?![\d%]).{0,25}/g)].map((m) => m[0].trim());
  // "9" puede aparecer como parte de un Nvl.90 o similar; se filtran los
  // contextos que NO sean un conteo de torretas.
  const conteos = hits.filter((h) => /9\s*torretas|torretas.*\b9\b/.test(h));
  assert.deepEqual(conteos, [], `conteos hardcodeados: ${conteos.join(' | ')}`);
});

test('buildTorretasScreen: el estado de meta con todos los niveles al máximo da 1100/1100', () => {
  const levels = {};
  for (const t of META_TOWERS) levels[t.key] = META_MAX_LEVEL;
  const meta = metaCon({ levels });
  const html = buildTorretasScreen(meta);
  assert.ok(html.includes(`>${META_TOTAL_MAX_LEVELS}<small>/${META_TOTAL_MAX_LEVELS}</small>`),
    'con todas al máximo el banner debe decir 1100/1100');
});

test('tierAtLevel y PERK_TIERS: los tiers cubren hasta el tope de nivel', () => {
  assert.equal(PERK_TIERS, META_MAX_LEVEL / PERK_EVERY);
  assert.equal(tierAtLevel(META_MAX_LEVEL), PERK_TIERS - 1);
  assert.equal(tierAtLevel(1), -1);
});

// ============================================================
// BUG 4 — soft-lock: el panel COMBO destruía la oferta de cartas
//
// El panel combo tiene su PROPIO nodo (#combo-panel). Antes compartía el
// nodo del modal de cartas (#card-choice): al abrirlo pisaba el innerHTML
// y al cerrarlo vaciaba el modal → la oferta de 3 cartas desaparecía y la
// run quedaba TRABADA en CARD_CHOICE (no había carta que elegir).
//
// Estos tests ejercitan el flujo REAL del HUD (showCardChoice →
// showComboPanel → hideComboPanel) contra un mini-DOM falso: sin jsdom ni
// navegador, pero con lo mínimo que el HUD usa (atributos, clases,
// listeners, foco y un querySelector que mira el innerHTML).
// ============================================================

/**
 * Mini-DOM falso: implementa lo mínimo que usa el HUD.
 * - classList / setAttribute / getAttribute
 * - addEventListener + dispatch (con preventDefault/stopPropagation)
 * - focus() → mueve document.activeElement
 * - querySelector/querySelectorAll: leen el innerHTML (los atributos
 *   pueden ser con o sin valor: data-combo-close, data-card-id="a"…)
 */
const fakeEl = (html = '') => {
  const classes = new Set();
  const attrs = new Map();
  const listeners = new Map();
  const children = new Map();
  const childSet = new Set();
  const el = {
    id: '',
    className: '',
    innerHTML: html,
    dataset: {},
    focused: false,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); },
    },
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    addEventListener(type, fn) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    /** Dispara un evento; devuelve true si alguien cortó la propagación. */
    dispatch(type, ev = {}) {
      let stopped = false;
      const event = { preventDefault() {}, stopPropagation() { stopped = true; }, ...ev };
      for (const fn of listeners.get(type) ?? []) fn(event);
      return stopped;
    },
    appendChild(child) { childSet.add(child); el.childNodes.push(child); return child; },
    /** dev-7 fase 52: la pila de avisos (#avisos) apila sus hijos. */
    childNodes: [],
    /** dev-7 fase 52: los avisos se quitan solos (setTimeout). */
    remove() { el.childNodes = el.childNodes.filter((c) => c !== el); },
    contains(other) { return other === el || childSet.has(other); },
    focus() {
      el.focused = true;
      if (globalThis.document) globalThis.document.activeElement = el;
    },
    querySelector(sel) { return el.querySelectorAll(sel)[0] ?? null; },
    querySelectorAll(sel) {
      const out = [];
      for (const part of sel.split(',').map((s) => s.trim())) {
        const m = part.match(/\[([\w-]+)\]/);
        if (!m) continue;
        const attr = m[1];
        if (part.includes(':not(')) {
          // 'button:not([disabled])' → todos los <button> del HTML.
          const tag = part.match(/^([a-z]+)/i)?.[1] ?? null;
          if (!tag) continue;
          const n = (el.innerHTML.match(new RegExp(`<${tag}\\b`, 'gi')) ?? []).length;
          for (let i = 0; i < n; i++) out.push(el._child(`tag:${tag}:${i}`, ''));
          continue;
        }
        const re = new RegExp(`\\b${attr}(?:\\s*=\\s*"([^"]*)")?`, 'g');
        let mm;
        while ((mm = re.exec(el.innerHTML)) !== null) {
          out.push(el._child(`${attr}=${mm[1] ?? ''}`, mm[1] ?? ''));
        }
      }
      return out;
    },
    /** Nodo "hijo" memoizado (uno por atributo), como en el DOM real. */
    _child(key, value) {
      if (!children.has(key)) {
        const attr = key.split('=')[0];
        const child = fakeEl();
        child.dataset = attr === 'data-card-id' ? { cardId: value } : {};
        child.closest = (sel) => {
          const m = sel.match(/\[([\w-]+)\]/);
          return m && m[1] === attr ? child : null;
        };
        children.set(key, child);
        childSet.add(child);
      }
      return children.get(key);
    },
  };
  return el;
};

/** Instala un `document` falso (createElement + foco) durante la prueba. */
const withFakeDocument = (fn) => {
  const prev = globalThis.document;
  globalThis.document = {
    activeElement: null,
    body: fakeEl(),
    createElement: () => fakeEl(),
  };
  try { return fn(globalThis.document); } finally {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  }
};

/** HUD de prueba: motor que registra los eventos emitidos + host DOM. */
const fakeHudLive = () => {
  const hud = Object.create(HUD.prototype);
  hud.emitted = [];
  hud.engine = { emit: (ev, data) => hud.emitted.push({ ev, data }) };
  hud.root = { parentElement: { appendChild: () => {} } };
  hud.overlayRoot = null;
  hud.cardModal = null;
  hud.comboPanel = null;
  hud._modalKind = null;
  hud._focusBeforeModal = null;
  hud._focusBeforeCombo = null;
  hud.el = {};
  // Estado del anti-doble-toque del modal de cartas (T4).
  hud._cardSession = 0;
  hud._cardOfferId = null;
  hud._cardPickedIds = [];
  hud._lastCardPickAt = null;
  return hud;
};

/** Oferta de 3 cartas (como la que muestra el modal LEVEL UP). */
const OFFER = [
  { id: 'a', name: 'A', desc: 'da', weight: 3 },
  { id: 'b', name: 'B', desc: 'db', weight: 8 },
  { id: 'c', name: 'C', desc: 'dc', weight: 10 },
];

/** Resumen de combo (como lo arma main.js: comboSummary(game)). */
const comboSum = () => ({
  towers: [{ name: 'Guardian', slot: 2, level: 3, dmgMul: 1.2, cadMul: 1 }],
  pierce: 1, baseShields: 0, orbitalDmgMul: 1,
  drones: [], blackHoleCharge: 0, lv: 4, kills: 7,
});

test('soft-lock: abrir el panel COMBO no borra la oferta de cartas', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showCardChoice(OFFER);
    const modal = hud.cardModal;
    assert.ok(modal, 'el modal de cartas debe existir');
    assert.equal(modal.querySelectorAll('[data-card-id]').length, 3, 'la oferta tiene 3 cartas');

    // El jugador pulsa "Lista de Combos" dentro del modal de cartas.
    hud.showComboPanel(comboSum());
    assert.equal(hud.comboOpen(), true, 'el panel combo está abierto');
    assert.equal(modal.querySelectorAll('[data-card-id]').length, 3,
      'ABRIR el combo no puede destruir la oferta de cartas');
    assert.equal(modal.classList.contains('hidden'), false,
      'el modal de cartas sigue visible');
  });
});

test('soft-lock: cerrar el panel COMBO deja las 3 cartas elegibles', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showCardChoice(OFFER);
    const modal = hud.cardModal;
    hud.showComboPanel(comboSum());
    hud.hideComboPanel();

    assert.equal(hud.comboOpen(), false, 'el panel combo se cerró');
    assert.equal(modal.querySelectorAll('[data-card-id]').length, 3,
      'CERRAR el combo no puede destruir la oferta de cartas');
    assert.equal(modal.classList.contains('hidden'), false,
      'el modal de cartas sigue visible (no se puede cerrar sin elegir)');

    // La carta sigue siendo elegible → evento canónico 'card:pick'.
    modal.dispatch('click', { target: modal.querySelector('[data-card-id]') });
    assert.equal(hud.emitted.length, 1, 'el click en la carta debe emitir un evento');
    assert.equal(hud.emitted[0].ev, 'card:pick');
    assert.equal(hud.emitted[0].data.cardId, 'a');
  });
});

test('el panel COMBO standalone: abrir → tiene [data-combo-close] → cerrar → desaparece', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showComboPanel(comboSum());
    const combo = hud.comboPanel;
    assert.ok(combo, 'el panel combo debe tener su propio nodo');
    assert.equal(combo.id, 'combo-panel');
    assert.equal(hud.comboOpen(), true);
    assert.ok(combo.querySelector('[data-combo-close]'), 'el panel tiene su botón de cierre');
    assert.equal(hud.cardModal, null, 'el combo standalone NO necesita el modal de cartas');

    hud.hideComboPanel();
    assert.equal(hud.comboOpen(), false, 'al cerrarlo ya no está abierto');
    assert.equal(combo.classList.contains('hidden'), true, 'el nodo queda oculto');
    assert.equal(combo.innerHTML, '', 'y su contenido se limpia');
  });
});

test('comboOpen(): true solo con el panel combo (false con cartas y con perk)', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    // Modal de CARTAS: no es el panel combo (pero sí es un modal abierto).
    hud.showCardChoice(OFFER);
    assert.equal(hud.comboOpen(), false, 'el modal de CARTAS no es el panel combo');
    assert.equal(hud.anyModalOpen(), true, 'pero sí cuenta como modal abierto');

    // Con el panel combo encima: solo el combo es "comboOpen".
    hud.showComboPanel(comboSum());
    assert.equal(hud.comboOpen(), true, 'el panel combo está abierto');

    hud.hideComboPanel();
    assert.equal(hud.comboOpen(), false, 'al cerrarlo vuelve a false');
  });

  // Modal de PERK: nodo aparte con [data-perk-close].
  const perk = fakeEl(PERK_MODAL_HTML);
  perk.classList.remove('hidden');
  const hud = fakeHudLive();
  hud.cardModal = perk;
  assert.equal(hud.comboOpen(), false, 'el modal de PERK no es el panel combo');
  assert.equal(hud.anyModalOpen(), true, 'el modal de perk sí es un modal abierto');
});

test('anyModalOpen(): da true con el panel COMBO abierto', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    assert.equal(hud.anyModalOpen(), false, 'sin modales no hay nada abierto');

    hud.showComboPanel(comboSum());
    assert.equal(hud.anyModalOpen(), true, 'el panel combo es un modal abierto');

    hud.hideComboPanel();
    assert.equal(hud.anyModalOpen(), false, 'al cerrarlo ya no bloquea la pantalla');
  });
});

test('el panel COMBO es un diálogo ARIA y se dibuja ENCIMA del modal de cartas', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showComboPanel(comboSum());
    const combo = hud.comboPanel;
    assert.equal(combo.getAttribute('role'), 'dialog');
    assert.equal(combo.getAttribute('aria-modal'), 'true');
    assert.ok(combo.getAttribute('aria-label'), 'el panel combo necesita aria-label');
    assert.ok(combo.getAttribute('style').includes('z-index:50'),
      'el combo va por encima del modal de cartas (z-index 40)');
  });
});

test('Esc cierra el panel COMBO y NO el modal de cartas', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showCardChoice(OFFER);
    hud.showComboPanel(comboSum());
    const modal = hud.cardModal;

    const stopped = hud.comboPanel.dispatch('keydown', { key: 'Escape' });
    assert.equal(hud.comboOpen(), false, 'Esc cierra el panel combo');
    assert.equal(stopped, true, 'el Esc no debe llegar al window (main.js navegaría al menú)');
    assert.equal(modal.classList.contains('hidden'), false,
      'el modal de cartas NO se puede cerrar sin elegir');
    assert.equal(modal.querySelectorAll('[data-card-id]').length, 3, 'las cartas siguen ahí');
  });
});

test('el panel COMBO toma el foco al abrir y lo devuelve al cerrar', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showCardChoice(OFFER);
    const modal = hud.cardModal;
    const comboBtn = modal.querySelector('[data-action-combo]');
    comboBtn.focus(); // el jugador tiene el foco en "Lista de Combos"
    assert.equal(globalThis.document.activeElement, comboBtn);

    hud.showComboPanel(comboSum());
    assert.equal(globalThis.document.activeElement, hud.comboPanel.querySelector('[data-combo-close]'),
      'al abrir, el foco entra al panel combo');

    hud.hideComboPanel();
    assert.equal(globalThis.document.activeElement, comboBtn,
      'al cerrar, el foco vuelve al elemento que lo tenía');
  });
});

test('hideCardChoice(): cierra también el panel COMBO (ningún modal sobrevive al estado)', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showComboPanel(comboSum());
    assert.equal(hud.comboOpen(), true);

    hud.hideCardChoice();
    assert.equal(hud.comboOpen(), false, 'main.js llama a hideCardChoice() en cada cambio de estado');
    assert.doesNotThrow(() => hud.hideCardChoice(), 'sigue siendo idempotente');
  });
});

// ============================================================
// T1 — el badge de rango: nombre + umbral (no un contador)
// ============================================================

test('T1: el badge muestra el NOMBRE del rango, no un número', () => {
  const meta = metaCon({ victories: 60 });   // 60 victorias → Guardia
  const badge = buildRankBadge(meta);
  assert.equal(badge.name, 'Guardia');
  assert.equal(badge.name, playerRank(meta).name);
  // dev-7 fase 53: el color del rango es una REFERENCIA a un token CSS
  // (`var(--rank-N)`), no un hexadecimal suelto en el JS.
  assert.equal(badge.color, 'var(--rank-3)', 'el rango trae su color (token CSS)');

  const html = buildTorretasScreen(meta);
  assert.ok(html.includes('Guardia'), 'el badge debe mostrar el nombre del rango');
  assert.ok(!/class="meta-badge[^"]*"[^>]*>\s*\d+\s*</.test(html),
    'el badge no debe ser un número suelto (el número de rango no dice nada)');
  assert.ok(html.includes('--rank-color:var(--rank-3)'), 'el badge usa el color del rango');
});

test('T1: el badge muestra el UMBRAL de victorias del rango', () => {
  const html = buildTorretasScreen(metaCon({ victories: 60 }));
  assert.ok(html.includes('Guardia · 50 victorias'),
    'debe decir el rango y desde cuántas victorias se tiene');
  assert.ok(html.includes('próximo: Comandante · 150 victorias'),
    'el tooltip debe decir qué falta para el rango siguiente');
});

test('T1: sin victorias el rango es Aprendiz (0 victorias)', () => {
  const badge = buildRankBadge(defaultMeta());
  assert.equal(badge.name, 'Aprendiz');
  assert.equal(badge.text, 'Aprendiz · 0 victorias');
});

// ============================================================
// T2 — el rótulo de daño dice el multiplicador REAL (con hitos)
// ============================================================

test('T2: el rótulo de daño usa metaDmgMul (curva × hitos)', () => {
  const meta = metaCon({ levels: { ...defaultMeta().levels, guardian: 100 } });
  const mul = metaDmgMul('guardian', meta);
  const pct = Math.round((mul - 1) * 100);
  const card = cardOf(buildTowerCards(meta), 'guardian');
  assert.ok(card.includes(`+${pct}% DAÑO EN PARTIDA`),
    `el rótulo debe coincidir con metaDmgMul (+${pct}%)`);
  // El valor viejo (solo la curva, sin hitos) NO debe aparecer.
  assert.ok(!card.includes('+495%'), 'no debe usar solo META_DMG_PER_LEVEL');
});

test('T2: sin bonus real no se muestra el rótulo de daño (+0 % es ruido)', () => {
  const card = cardOf(buildTowerCards(defaultMeta()), 'guardian');
  assert.ok(!card.includes('DAÑO EN PARTIDA'),
    'una torreta en Nvl.1 no tiene bonus: el rótulo no debe aparecer');
});

test('T2: el multiplicador del rótulo sigue el nivel real de la torreta', () => {
  const meta = metaCon({ levels: { ...defaultMeta().levels, guardian: 25 } });
  const pct = Math.round((metaDmgMul('guardian', meta) - 1) * 100);
  const card = cardOf(buildTowerCards(meta), 'guardian');
  assert.ok(card.includes(`+${pct}% DAÑO EN PARTIDA`));
});

// ============================================================
// T3 — el hint del panel 🃏 en claro
// ============================================================

test('T3: el hint del panel COMBO está en español claro', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showComboPanel(comboSum());
    const html = hud.comboPanel.innerHTML;
    assert.ok(html.includes('Nv.4 · 7 bajas · [🃏] o [U] para cerrar'),
      'el hint debe explicar cómo se cierra el panel');
    assert.ok(!html.includes('kills'), 'no debe quedar "kills" en inglés');
    assert.ok(!html.includes('cierra con P'), 'no debe quedar la pista rota');
  });
});

// ============================================================
// T4 — anti-doble-toque del modal de cartas
// ============================================================

test('T4: canPickCard rechaza el doble toque dentro de la ventana', () => {
  const lastPickAt = { at: 1000, offerId: 'o1' };
  assert.equal(canPickCard({
    lastPickAt, now: 1200, pickedIds: [], offerId: 'o1', cardId: 'a',
  }), false, 'doble toque (200 ms) sobre la misma oferta → rechazado');
  assert.equal(canPickCard({
    lastPickAt, now: 1000 + CARD_PICK_DEBOUNCE_MS, pickedIds: [], offerId: 'o1', cardId: 'b',
  }), true, 'pasada la ventana → permitido');
});

test('T4: canPickCard permite una oferta distinta', () => {
  assert.equal(canPickCard({
    lastPickAt: { at: 1000, offerId: 'o1' }, now: 1100, pickedIds: [], offerId: 'o2', cardId: 'a',
  }), true, 'otra oferta es otra decisión → permitido');
});

test('T4: canPickCard rechaza una carta ya elegida', () => {
  assert.equal(canPickCard({
    lastPickAt: null, now: 0, pickedIds: ['a'], offerId: 'o1', cardId: 'a',
  }), false, 'una carta ya elegida no se puede volver a tapar');
});

test('T4: el doble toque NO aplica dos cartas', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showCardChoice(OFFER);
    const modal = hud.cardModal;
    const card = modal.querySelector('[data-card-id]');

    modal.dispatch('click', { target: card });
    assert.equal(hud.emitted.length, 1, 'el primer toque aplica la carta');
    assert.equal(card.classList.contains('dealt-out'), true,
      'la carta elegida queda marcada (dealt-out)');

    modal.dispatch('click', { target: card });
    assert.equal(hud.emitted.length, 1, 'el 2º toque sobre la misma carta se ignora');
  });
});

test('T4: tras el re-render con la oferta siguiente, el 2º toque sigue bloqueado', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showCardChoice(OFFER);
    const modal = hud.cardModal;
    modal.dispatch('click', { target: modal.querySelector('[data-card-id]') });
    assert.equal(hud.emitted.length, 1);

    // main.js re-renderiza el modal con la oferta SIGUIENTE (multi-level-up):
    // el 2º toque del doble toque cae sobre una carta NUEVA.
    const nextOffer = [
      { id: 'd', name: 'D', desc: 'dd', weight: 5 },
      { id: 'e', name: 'E', desc: 'de', weight: 8 },
    ];
    hud.showCardChoice(nextOffer);
    const modal2 = hud.cardModal;
    const card2 = modal2.querySelector('[data-card-id]');
    assert.equal(card2.classList.contains('dealt-out'), false, 'la carta nueva no está marcada');
    modal2.dispatch('click', { target: card2 });
    assert.equal(hud.emitted.length, 1,
      'el doble toque no puede comer DOS subidas de nivel');
  });
});

test('T4: pasada la ventana de 350 ms la carta se puede volver a elegir', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showCardChoice(OFFER);
    const modal = hud.cardModal;
    modal.dispatch('click', { target: modal.querySelectorAll('[data-card-id]')[0] });
    assert.equal(hud.emitted.length, 1);

    // El reloj avanzó más de la ventana anti-doble-toque.
    hud._lastCardPickAt = { at: Date.now() - (CARD_PICK_DEBOUNCE_MS + 10), offerId: hud._cardOfferId };
    const other = modal.querySelectorAll('[data-card-id]')[1];
    modal.dispatch('click', { target: other });
    assert.equal(hud.emitted.length, 2, 'con el tiempo suficiente, el pick se acepta');
    assert.equal(hud.emitted[1].data.cardId, 'b');
  });
});

// ============================================================
// T6 — el aviso de "borrar progreso" menciona el ORO
// ============================================================

test('T6: la confirmación de borrado avisa que se pierde el ORO', () => {
  const html = buildMenuScreen({ theme: 'neon', quality: 'alta', confirmingReset: true });
  assert.ok(html.includes('oro'), 'la confirmación debe mencionar el oro');
  assert.ok(html.includes(`vuelve a ${META_GOLD_START}`),
    'debe decir que el saldo de oro vuelve al inicial');
});

// ============================================================
// T7 — foco y aria del modal de cartas
// ============================================================

test('T7: el aria-label dice la cantidad REAL de cartas de la oferta', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showCardChoice([OFFER[0]]);
    assert.equal(hud.cardModal.getAttribute('aria-label'),
      'Mejora de nivel — elegí 1 de 1 mejora',
      'con una sola carta no puede decir "de 3 mejoras"');
    hud.showCardChoice(OFFER);
    assert.equal(hud.cardModal.getAttribute('aria-label'),
      'Mejora de nivel — elegí 1 de 3 mejoras');
  });
});

test('T7: el modal de cartas toma el foco al abrir y lo devuelve al cerrar', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    const before = fakeEl('<button></button>');
    globalThis.document.activeElement = before;

    hud.showCardChoice(OFFER);
    const card = hud.cardModal.querySelector('[data-card-id]');
    assert.equal(globalThis.document.activeElement, card,
      'el foco entra al modal (si no, el HUD de atrás queda tabulable)');

    hud.hideCardChoice();
    assert.equal(globalThis.document.activeElement, before,
      'al cerrar, el foco vuelve al elemento que lo tenía');
  });
});

// ============================================================
// T8 — estado de batalla (enemigos / DPS)
// ============================================================

test('T8: la tira de estado muestra los 2 read-outs', () => {
  const st = formatBattleStatus({ enemiesAlive: 12, dps: 1234 });
  assert.equal(st.enemies, '12');
  assert.equal(st.dps, '1.2k');
});

test('T8: sin datos el HUD muestra "—" (no NaN ni undefined)', () => {
  const st = formatBattleStatus({});
  assert.equal(st.enemies, '—');
  assert.equal(st.dps, '—');
});

test('T8: el DPS se calcula con el daño y la cadencia REALES de la torre', () => {
  const missile = { damage: 35, cooldown: 1.2, data: { kind: 'homing' } };
  // Torre de disparo: 35 de daño cada 1.2 s.
  assert.equal(Math.round(towerDps(missile) * 10) / 10, 29.2);
  // Beam: su daño YA es por segundo (dispara siempre).
  assert.equal(towerDps({ damage: 40, cooldown: 0, data: { kind: 'beam' } }), 40);
  // Láser: por segundo, pero solo 2.5 s de cada 3.2.
  assert.equal(Math.round(towerDps({
    damage: 45, cooldown: 3.2, data: { kind: 'laser', laserDuration: 2.5 },
  }) * 10) / 10, 35.2);
  // Suma de la partida.
  assert.equal(Math.round(fortressDps([
    missile, { damage: 40, cooldown: 0, data: { kind: 'beam' } },
  ]) * 10) / 10, 69.2);
  // Una torre sin daño no aporta DPS.
  assert.equal(towerDps({ damage: 0, cooldown: 1, data: { kind: 'homing' } }), 0);
});

// ============================================================
// T9 — aviso de JEFE (banner WARNING de 2 s)
// ============================================================

/** Host DOM falso que registra los nodos agregados. */
const fakeHost = () => {
  const children = [];
  return { children, appendChild: (c) => { children.push(c); return c; } };
};

test('T9: showBossWarning apila el aviso en la capa comun (#avisos)', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    const host = fakeHost();
    hud.root = { parentElement: host };

    hud.showBossWarning('TITÁN');
    // dev-7 fase 52: ya NO hay un nodo #boss-warning propio: el aviso
    // va a la pila comun (#avisos), como el resto de avisos.
    assert.equal(host.children.length, 1, 'la pila de avisos se crea una vez');
    assert.equal(host.children[0].id, 'avisos');
    const aviso = hud.el.bossWarning;
    assert.ok(aviso, 'el aviso del jefe se guarda');
    assert.ok(aviso.className.includes('aviso--jefe'), 'variante jefe');
    assert.ok(aviso.innerHTML.includes('¡JEFE EN CAMINO!'));
    assert.ok(aviso.innerHTML.includes('TITÁN'), 'el nombre del jefe se muestra');
  });
});

test('fase 52: la pila de avisos es el unico camino de los avisos', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    const host = fakeHost();
    hud.root = { parentElement: host };
    hud.audio = { sfx: () => {} };

    // El cambio de fase del jefe y el "ultimate listo" pasan por la
    // MISMA pila (mismo nodo, mismo componente).
    hud.showBossPhase({ name: 'FURIA', weakTo: 'light' });
    assert.equal(host.children.length, 1, 'la pila no se duplica');
    const avisoFase = host.children[0];
    hud.showUltimateReady('ultimate');
    assert.equal(host.children.length, 1, 'la pila sigue siendo una');
    const avisos = host.children[0].childNodes ?? [];
    assert.equal(avisos.length, 2, 'los dos avisos se apilan');
    assert.ok(avisos[0].innerHTML.includes('EL JEFE CAMBIA'));
    assert.ok(avisos[1].innerHTML.includes('ULTIMATE LISTO'));
  });
});

test('fase 52: el aviso del ultimate dice como se lanza (teclado o boton)', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    const host = fakeHost();
    hud.root = { parentElement: host };
    hud.audio = { sfx: () => {} };

    const aviso = hud.showUltimateReady('ultimate');
    assert.ok(aviso, 'el aviso se devuelve');
    assert.ok(aviso.innerHTML.includes('¡ULTIMATE LISTO!'), 'el aviso se titula');
    // Sin `matchMedia` (Node) cae en la variante de teclado.
    assert.ok(/PULSA|TOCA/.test(aviso.innerHTML), 'dice como lanzarlo');
  });
});

test('T9: el aviso de JEFE dura ~2 s (como el WARNING del juego)', () => {
  assert.equal(BOSS_WARNING_MS, 2000);
});

// ============================================================
// T1 — selector de stages: lista agrupada por DÉCADAS
// ============================================================

/** Lista de stages como la que arma main.js _selectData(). */
const fakeStages = (n = 50) => Array.from({ length: n }, (_, i) => ({
  id: i + 1,
  name: `Normal Stage ${i + 1}`,
  boss: i === 0 || (i + 1) % 10 === 0,
  unlocked: i < 3,
  bestScore: i === 0 ? 12345 : null,
}));

/** Clases CSS de la fila de un stage dentro del HTML de la lista. */
const rowClassesOf = (html, id) => {
  const m = html.match(new RegExp(`<button class="([^"]*)"[^>]*data-stage="${id}"`));
  return m ? m[1] : '';
};

test('fase 29: el título compacto del stage cabe en el HUD y no pierde el nombre', () => {
  // El HUD tiene ~84 px útiles y "Normal Stage 12" necesita 126: se salía
  // debajo de los botones. En el HUD va el número; el nombre completo
  // sigue en las pantallas de pausa/victoria/derrota.
  assert.equal(compactStageName('Normal Stage 1'), 'STAGE 1');
  assert.equal(compactStageName('Normal Stage 12'), 'STAGE 12');
  assert.equal(compactStageName('Normal Stage 50'), 'STAGE 50');
  // Un nombre que NO sigue el patrón se devuelve tal cual (no se rompe).
  assert.equal(compactStageName('Stage Final'), 'Stage Final');
  assert.equal(compactStageName(''), '');
  assert.equal(compactStageName(undefined), '');
  // Y la etiqueta compacta es más corta que el nombre (tiene que caber).
  assert.ok(compactStageName('Normal Stage 12').length < 'Normal Stage 12'.length);
});

test('T1: buildStageGroups agrupa 50 stages en 5 bloques de 10', () => {
  const groups = buildStageGroups(fakeStages(50));
  assert.equal(groups.length, 5, '50 stages → 5 bloques');
  assert.deepEqual(groups.map((g) => g.label),
    ['1–10', '11–20', '21–30', '31–40', '41–50'], 'los rótulos de cada bloque');
  assert.deepEqual(groups.map((g) => g.from), [1, 11, 21, 31, 41]);
  assert.deepEqual(groups.map((g) => g.to), [10, 20, 30, 40, 50]);
  for (const g of groups) assert.equal(g.rows.length, 10, 'cada bloque tiene 10 filas');
});

test('T1: la agrupación no pierde ni duplica ningún stage', () => {
  const stages = fakeStages(50);
  const ids = buildStageGroups(stages).flatMap((g) => g.rows.map((s) => s.id));
  assert.equal(ids.length, 50, 'no se pierde ningún stage');
  assert.equal(new Set(ids).size, 50, 'no se duplica ninguno');
  assert.deepEqual(ids, stages.map((s) => s.id), 'el orden se respeta');
});

test('T1: buildStageGroups es PURA (misma entrada → misma salida)', () => {
  const stages = fakeStages(50);
  const copia = JSON.parse(JSON.stringify(stages));
  const a = buildStageGroups(stages);
  const b = buildStageGroups(stages);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'dos llamadas → el mismo resultado');
  assert.deepEqual(stages, copia, 'no debe mutar la entrada');
});

test('T1: casos borde — 0 stages → [] y 3 stages → un bloque "1–3"', () => {
  assert.deepEqual(buildStageGroups([]), [], 'sin stages no hay bloques');
  assert.deepEqual(buildStageGroups(null), [], 'null tampoco rompe');
  const g = buildStageGroups(fakeStages(3));
  assert.equal(g.length, 1, '3 stages → un solo bloque');
  assert.equal(g[0].label, '1–3', 'el rótulo refleja el rango real');
  assert.equal(g[0].from, 1);
  assert.equal(g[0].to, 3);
  assert.equal(g[0].rows.length, 3);
});

test('T1: el selector renderiza las cabeceras de cada bloque', () => {
  const html = buildStageList(fakeStages(50));
  for (const label of ['STAGES 1–10', 'STAGES 11–20', 'STAGES 21–30', 'STAGES 31–40', 'STAGES 41–50']) {
    assert.ok(html.includes(label), `falta la cabecera "${label}"`);
  }
  assert.equal((html.match(/class="stage-group-title"/g) ?? []).length, 5,
    'una cabecera por bloque');
  assert.equal((html.match(/class="stage-group"/g) ?? []).length, 5,
    'cinco bloques en el DOM');
});

test('T1: cada fila tiene IDENTIDAD (punto de tema, insignia BOSS, récord)', () => {
  const html = buildStageList(fakeStages(50));
  assert.equal((html.match(/class="stage-dot"/g) ?? []).length, 50, 'un punto por fila');
  assert.ok(html.includes('class="stage-boss">BOSS</span>'),
    'la insignia de JEFE es un badge visible (no una estrella suelta)');
  assert.ok(html.includes('récord 012345'), 'el mejor récord se sigue mostrando');
  assert.ok(html.includes('data-stage="37"'), 'la fila conserva el data-stage');
  assert.ok(html.includes('disabled'), 'los stages bloqueados siguen deshabilitados');
  assert.ok(html.includes('🔒'), 'el candado sigue avisando');
});

test('T1: destacan la siguiente disponible y el mejor récord', () => {
  const stages = fakeStages(50);
  const hl = findStageHighlights(stages);
  assert.equal(hl.bestId, 1, 'el mejor récord es el stage 1');
  assert.equal(hl.nextId, 2, 'la siguiente disponible es el stage 2 (sin récord)');
  const html = buildStageList(stages);
  assert.ok(rowClassesOf(html, 2).includes('is-next'), 'la siguiente disponible se marca');
  assert.ok(rowClassesOf(html, 1).includes('is-best'), 'el mejor récord se marca');
  assert.ok(rowClassesOf(html, 10).includes('is-boss'), 'el stage 10 es de JEFE');
});

test('T1: el punto de color distingue el tema de cada stage', () => {
  // Los temas se repiten en ciclo (stages.js): el color sale de los DATOS.
  assert.notEqual(stageThemeColor(1), stageThemeColor(4), 'temas distintos → colores distintos');
  assert.equal(stageThemeColor(1), stageThemeColor(6), 'mismo tema → mismo color');
  assert.match(stageThemeColor(1), /^#[0-9A-F]{6}$/i, 'es un color CSS válido');
  assert.match(stageThemeColor(999), /^#[0-9A-F]{6}$/i, 'un id inexistente cae al teal');
});

// ============================================================
// T3 — el MENÚ dice la cantidad REAL de stages
// ============================================================

test('T3: el tagline del MENÚ dice la cantidad REAL de stages', () => {
  const html = buildMenuScreen({ theme: 'neon', quality: 'alta' });
  const tagline = html.match(/<p class="tagline">([^<]*)<\/p>/)?.[1] ?? '';
  assert.ok(tagline.includes(`${STAGES.length} stages`),
    `el tagline debe decir "${STAGES.length} stages" (dice "${tagline}")`);
  assert.ok(!tagline.includes('5 stages'), 'no debe quedar el conteo viejo');
});

// ============================================================
// T2 — el texto de las cards de torretas/perks no se corta a media palabra
// ============================================================

test('T2: el rótulo del tier de perk va aparte (se lee entero)', () => {
  const meta = metaCon({
    levels: { ...defaultMeta().levels, guardian: 60 },
    perkChoices: { ...defaultMeta().perkChoices, guardian: [null, null, null, null, null, 0] },
  });
  const card = cardOf(buildTowerCards(meta), 'guardian');
  assert.ok(card.includes('class="meta-card-perk-tier"'),
    'el rótulo del tier va en su propio elemento (no se recorta con la descripción)');
  assert.ok(card.includes('Perk pendiente Nvl.10:'), 'el rótulo nombra el tier');
});

test('T2: el texto de las cards NO se corta a media palabra', () => {
  const html = buildTowerCards(metaCon());
  // En el HTML: ningún texto con `height` fijo + `overflow:hidden`
  // (esa era la combinación que cortaba sin ellipsis).
  for (const m of html.matchAll(/style="([^"]*)"/g)) {
    const decl = m[1];
    assert.ok(!/height\s*:/.test(decl) || !/overflow\s*:/.test(decl),
      `ningún texto puede llevar height fijo + overflow:hidden: ${decl}`);
  }
  // En el CSS: el recorte es con line-clamp + ellipsis (nunca con height).
  for (const sel of ['.meta-card-perk', '.meta-card-perk-next']) {
    const rule = cssRule(sel);
    assert.ok(rule, `debe existir la regla ${sel}`);
    assert.ok(rule.includes('-webkit-line-clamp'), `${sel} recorta por líneas`);
    assert.ok(rule.includes('text-overflow: ellipsis'), `${sel} corta con ellipsis`);
    assert.ok(!/(^|[;\s])height\s*:/.test(rule), `${sel} no puede tener height fijo`);
    assert.ok(rule.includes('overflow-wrap'), `${sel} parte las palabras largas en vez de cortarlas`);
  }
});

// ============================================================
// T4/T5 — tipografía de los números y velo de los overlays (CSS)
// ============================================================

test('T4: los números del HUD usan la fuente techno con cifras tabulares', () => {
  assert.ok(css.includes('--font-num:'), 'la pila de números está definida');
  assert.ok(/--font-num:\s*'Exo2'/.test(css),
    'la pila de números arranca con Exo2 (tiene cifras tabulares "tnum")');
  assert.ok(!/--font-mono:[^;]*Share Tech Mono/.test(css),
    'Share Tech Mono ya no está en la pila (no se puede embebir)');
  const nums = cssRule('.hud-timer,');
  assert.ok(nums.includes('var(--font-num)'), 'los números del HUD usan --font-num');
  assert.ok(nums.includes('tabular-nums'), 'cifras tabulares → los dígitos no bailan');
  assert.ok(nums.includes('.score-value'), 'el score usa la misma pila');
  assert.ok(nums.includes('.hud-stat b'), 'el DPS/olas/enemigos usan la misma pila');
});

test('T5: los overlays ponen un velo denso + desenfoque de fondo', () => {
  const veil = cssRule('.screen::before');
  assert.ok(veil, 'la pantalla debe tener su velo');
  assert.ok(/background:\s*linear-gradient/.test(veil), 'el velo es un degradado');
  assert.ok(/rgba\(/.test(veil),
    'el velo tiene color propio: si no hay backdrop-filter, el velo solo ya tapa');
  assert.ok(veil.includes('backdrop-filter'), 'el desenfoque es la mejora progresiva');
  // El blur NO puede estar en #overlay-root: crearía el "backdrop root" y
  // el velo de la pantalla no vería el canvas de fondo.
  const root = cssRule('#overlay-root {');
  assert.ok(!root.includes('backdrop-filter'),
    '#overlay-root no debe crear el backdrop root (el blur va en la pantalla)');
});

// ============================================================
// dev-7 fase 36 — EL SCROLL DE LA PANTALLA DE TORRETAS
// ============================================================

/** Nodo falso de la grilla de torretas. */
const fakeGrid = (scrollTop = 0) => ({ scrollTop });

/** Raíz falsa: su innerHTML re-crea la grilla (como el navegador). */
const fakeRoot = (scrollTop = 0) => {
  let grid = fakeGrid(scrollTop);
  return {
    get grid() { return grid; },
    set innerHTML(_v) { grid = fakeGrid(0); },   // nodo NUEVO, scroll a 0
    get innerHTML() { return ''; },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelector: (sel) => (sel === '.meta-grid' ? grid : null),
    querySelectorAll: () => [],
  };
};

test('fase 36: readMetaScroll devuelve el scroll de la grilla (0 si no hay)', () => {
  assert.equal(readMetaScroll(fakeRoot(610)), 610);
  assert.equal(readMetaScroll(fakeRoot(0)), 0);
  assert.equal(readMetaScroll(null), 0, 'sin raíz no hay scroll');
  assert.equal(readMetaScroll({ querySelector: () => null }), 0, 'sin grilla no hay scroll');
});

test('fase 36: restoreMetaScroll lo escribe en la grilla y no rompe si no hay', () => {
  const root = fakeRoot(0);
  restoreMetaScroll(root, 610);
  assert.equal(root.grid.scrollTop, 610);
  // Sin grilla: no explota.
  restoreMetaScroll({ querySelector: () => null }, 610);
  restoreMetaScroll(null, 610);
  // Scroll 0: no hace nada (la pantalla abre arriba).
  const root2 = fakeRoot(0);
  restoreMetaScroll(root2, 0);
  assert.equal(root2.grid.scrollTop, 0);
});

test('fase 36: showScreen(\'TORRETAS\') conserva el scroll de la grilla', () => {
  // Regresión del bug: al mejorar una torreta, el re-render recreaba la
  // grilla y la vista saltaba al principio (el jugador tenía que volver
  // a scrollear).
  const hud = Object.create(HUD.prototype);
  hud.emitted = [];
  hud.engine = { emit: (ev, data) => hud.emitted.push({ ev, data }) };
  const fakeCls = { add() {}, remove() {}, toggle() {}, contains: () => false };
  hud.root = { classList: fakeCls, parentElement: { appendChild: () => {} } };
  hud.bottom = { classList: fakeCls };
  hud.cardModal = null;
  hud.comboPanel = null;
  hud._modalKind = null;
  hud._focusBeforeModal = null;
  hud._focusBeforeCombo = null;
  hud.el = {};
  hud._lastBossFrac = -1;
  hud._bossHidden = false;
  const root = fakeRoot(610);
  hud.overlayRoot = root;

  hud.showScreen('TORRETAS');

  assert.equal(root.grid.scrollTop, 610,
    'el scroll de la grilla debe sobrevivir al re-render de la pantalla');
});

// ============================================================
// dev-7 fase 37 — EL HUD SE ADAPTA AL MARCO
// ============================================================

/** Marco falso: mide clientWidth y registra los atributos. */
const fakeFrame = (w) => {
  const attrs = new Set();
  return {
    clientWidth: w,
    attrs,
    has: (a) => attrs.has(a),
    setAttribute: (a) => attrs.add(a),
    removeAttribute: (a) => attrs.delete(a),
  };
};

test('fase 37: refreshFrameMode marca el marco cuando es más estrecho que 540 px', () => {
  const hud = Object.create(HUD.prototype);
  const frame = fakeFrame(374);            // móvil de 390 px
  hud.root = { closest: (sel) => (sel === '#marco-portrait' ? frame : null) };
  assert.equal(hud.refreshFrameMode(), true);
  assert.ok(frame.has('data-narrow'), 'un marco de 374 px es estrecho: se marca');
});

test('fase 37: refreshFrameMode quita la marca cuando el marco es ancho', () => {
  const hud = Object.create(HUD.prototype);
  const frame = fakeFrame(540);            // el ancho de diseño
  frame.setAttribute('data-narrow');
  hud.root = { closest: (sel) => (sel === '#marco-portrait' ? frame : null) };
  assert.equal(hud.refreshFrameMode(), false);
  assert.ok(!frame.has('data-narrow'), 'a 540 px no hace falta compactar');
});

test('fase 37: sin marco (o sin DOM) refreshFrameMode no rompe', () => {
  const hud = Object.create(HUD.prototype);
  hud.root = null;
  assert.equal(hud.refreshFrameMode(), false);
  const hud2 = Object.create(HUD.prototype);
  hud2.root = { closest: () => null };
  assert.equal(hud2.refreshFrameMode(), false);
});

// ============================================================
// dev-7 fase 39 — LA RAREZA DE LAS CARTAS Y LA NAVEGACIÓN COHERENTE
// ============================================================

test('fase 39: TODAS las cartas declaran una rareza válida', () => {
  const validas = Object.keys(CARD_RARITIES);
  for (const c of CATALOG) {
    assert.ok(c.rarity, `la carta ${c.id} no declara rareza`);
    assert.ok(validas.includes(c.rarity),
      `la carta ${c.id} declara una rareza desconocida: ${c.rarity}`);
  }
});

test('fase 39: la rareza mide la POTENCIA de la carta (no el peso de sorteo)', () => {
  // Las unidades nuevas y el Black Hole son LEGENDARIO (cambian el juego).
  for (const id of ['unlock_missile', 'unlock_beam', 'unlock_mortar',
    'unlock_drone_wasps', 'black_hole']) {
    assert.equal(CATALOG.find((c) => c.id === id)?.rarity, 'legendary',
      `${id} debería ser legendaria`);
  }
  // Los buffs generales muy potentes son RAROS.
  for (const id of ['dmg_all', 'armor_plate']) {
    assert.equal(CATALOG.find((c) => c.id === id)?.rarity, 'rare',
      `${id} debería ser rara`);
  }
  // Y los ajustes puntuales son COMUNES.
  for (const id of ['repair_500', 'rapid_bullets', 'swarm_grow']) {
    assert.equal(CATALOG.find((c) => c.id === id)?.rarity, 'common',
      `${id} debería ser común`);
  }
});

test('fase 39: la rareza NO sale del peso de sorteo', () => {
  // Regresión: la rareza se derivaba del weight, así que dos cartas del
  // mismo peso salían con la misma etiqueta. Blindaje de Base (Raro) y
  // Escudo de Base (Poco común) comparten peso 4 y NO comparten rareza.
  const blindaje = CATALOG.find((c) => c.id === 'armor_plate');
  const escudo = CATALOG.find((c) => c.id === 'base_shield');
  assert.equal(blindaje.weight, escudo.weight, 'el caso de la regresión usa el mismo peso');
  assert.notEqual(blindaje.rarity, escudo.rarity,
    'mismo peso NO puede implicar la misma rareza: mide la potencia');
});

test('fase 39: cardRarity traduce la rareza a etiqueta, clase y nivel', () => {
  const de = (id) => CATALOG.find((c) => c.id === id);
  assert.equal(cardRarity(de('black_hole')).label, 'Legendario');
  assert.equal(cardRarity(de('black_hole')).tier, 4);
  assert.equal(cardRarity(de('black_hole')).cls, 'legendary');
  assert.equal(cardRarity(de('repair_500')).label, 'Común');
  assert.equal(cardRarity(de('dmg_all')).label, 'Raro');
  // Una rareza desconocida cae en "Común" (no rompe la UI).
  assert.equal(cardRarity({ rarity: 'inventada' }).label, 'Común');
  assert.equal(cardRarity({}).label, 'Común');
});

test('fase 39: la nav de torretas no tiene pestañas muertas', () => {
  const html = buildTorretasScreen(defaultMeta());
  assert.ok(!html.includes('data-meta-tab="tienda"'), 'la pestaña Tienda desaparece');
  // Lo que VE el jugador (los comentarios HTML del template no cuentan).
  const visible = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!visible.includes('MTX'), 'nada de vocabulario de desarrollo en la UI');
  assert.ok(!visible.includes('Bestiario aún no clonado'), 'nada de placeholders');
  // Las 5 que quedan: 3 secciones + 2 salidas.
  for (const tab of ['torretas', 'bestiario', 'progreso', 'battle', 'menu']) {
    assert.ok(html.includes(`data-meta-tab="${tab}"`), `falta la pestaña ${tab}`);
  }
  // Las secciones tienen su propio contenedor.
  assert.ok(html.includes('id="meta-bestiario"'), 'el bestiario es una sección propia');
  assert.ok(html.includes('id="meta-progreso"'), 'el progreso es una sección propia');
});

test('fase 39: al ganar se puede ir a MEJORAR TORRETAS (el bucle del meta)', () => {
  const hud = Object.create(HUD.prototype);
  const conFrag = hud._screenStageClear({
    stageName: 'Normal Stage 1', time: 60, score: 100, clearBonus: 0, hpBonus: 0,
    lv: 3, cards: 2, kills: 10, metaFrags: 60, metaGold: 25,
  });
  assert.ok(conFrag.includes('data-action="torretas"'),
    'hay un botón para gastar los fragmentos que acabas de ganar');
  // Sin fragmentos NO se ofrece (no hay nada que gastar).
  const sinFrag = hud._screenStageClear({
    stageName: 'Normal Stage 1', time: 10, score: 0, clearBonus: 0, hpBonus: 0,
    lv: 1, cards: 0, kills: 0,
  });
  assert.ok(!sinFrag.includes('data-action="torretas"'),
    'sin fragmentos no se ofrece el botón');
});

test('fase 39: el GAME OVER tiene un MENÚ de verdad (el fallback iba al selector)', () => {
  const hud = Object.create(HUD.prototype);
  const real = hud._screenGameOver({
    stageName: 'Normal Stage 3', score: 100, kills: 3, time: 40,
    fragsLost: 60, goldLost: 25, lv: 2, cards: 1,
  });
  assert.ok(real.includes('data-action="menu"'), 'el MENÚ real existe');
  // El fallback (sin datos) también: antes su botón "MENÚ" iba al selector.
  const fallback = hud._screenGameOver(null);
  assert.ok(fallback.includes('data-action="menu"'), 'el fallback también va al menú');
  assert.ok(!fallback.includes('data-action="select-stage"'), 'el fallback no va al selector');
});

// ============================================================
// fase 72 — LAS FUGAS SON UN DATO, NO UNA REGLA
// ============================================================

test('fase 72: el resumen de victoria dice las fugas (sin presupuesto)', () => {
  const hud = Object.create(HUD.prototype);
  const html = hud._screenStageClear({
    stageName: 'Normal Stage 21', time: 120, score: 500, clearBonus: 0, hpBonus: 0,
    lv: 5, cards: 3, kills: 150,
    leaks: 12, hpFrac: 0.62,
  });
  assert.ok(html.includes('FUGAS'), 'el resumen dice cuántas fugas hubo');
  assert.ok(html.includes('12'), 'el resumen dice el número de fugas');
  assert.ok(!html.includes('/ 50'), 'ya no hay presupuesto de fugas');
  assert.ok(html.includes('INTEGRIDAD'), 'el resumen dice la integridad que quedó');
  assert.ok(html.includes('62'), 'el resumen dice los puntos de integridad');
});

test('fase 72: la derrota es siempre "LA BASE HA CAÍDO" y las fugas son un dato', () => {
  const hud = Object.create(HUD.prototype);
  const html = hud._screenGameOver({
    stageName: 'Normal Stage 21', score: 100, kills: 20, time: 60,
    leaks: 64, hpLeft: 0, maxHp: 9000,
  });
  assert.ok(html.includes('LA BASE HA CAÍDO'), 'la base cayó por daño, no por un contador');
  assert.ok(html.includes('FUGAS'), 'el resumen informa las fugas');
  assert.ok(html.includes('64'), 'dice cuántas fugas');
  assert.ok(!html.includes('DEMASIADAS FUGAS'), 'ya no existe la derrota por regla de fugas');
  assert.ok(!html.includes('mata al menos al 75'), 'la regla del 75 % ya no existe');
});

test('fase 75: las confirmaciones inline no sobreviven al cambio de pantalla', () => {
  const hud = Object.create(HUD.prototype);
  hud._confirmingReset = true;
  hud._abandonPending = 'menu';
  hud._perkResetArmed = { guardian: true };
  hud._unlockArmed = { tesla: true };
  hud._resetTransientUi('PLAYING');
  assert.equal(hud._confirmingReset, false, 'reset de progreso se desarma');
  assert.equal(hud._abandonPending, null, 'abandonar se desarma');
  assert.deepEqual(hud._perkResetArmed, {}, 'redistribuir se desarma');
  assert.deepEqual(hud._unlockArmed, {}, 'desbloquear se desarma');
  // En la MISMA pantalla que las posee, no se tocan.
  hud._confirmingReset = true;
  hud._resetTransientUi('MENU');
  assert.equal(hud._confirmingReset, true);
  hud._abandonPending = 'torretas';
  hud._resetTransientUi('PAUSED');
  assert.equal(hud._abandonPending, 'torretas');
  hud._perkResetArmed = { guardian: true };
  hud._unlockArmed = { tesla: true };
  hud._resetTransientUi('TORRETAS');
  assert.equal(hud._perkResetArmed.guardian, true);
  assert.equal(hud._unlockArmed.tesla, true, 'la compra armada sobrevive al re-render');
});

test('fase 39: la pausa pide confirmación antes de abandonar la partida', () => {
  const hud = Object.create(HUD.prototype);
  hud._abandonPending = null;
  const html = hud._screenPaused();
  // El primer paso: los botones destructivos NO tienen data-action (piden
  // permiso antes de tirar la run).
  assert.ok(html.includes('data-abandon="torretas"'), 'TORRETAS pide confirmación');
  assert.ok(html.includes('data-abandon="menu"'), 'MENÚ pide confirmación');
  assert.ok(!html.includes('data-action="torretas"'), 'sin data-action hasta confirmar');
  // El segundo paso: el botón real aparece con la advertencia.
  hud._abandonPending = 'torretas';
  const html2 = hud._screenPaused();
  assert.ok(html2.includes('data-action="torretas"'), 'confirmado: ahora sí ejecuta');
  assert.ok(html2.includes('¿SEGURO?'), 'la confirmación es explícita');
  assert.ok(html2.includes('data-abandon-cancel'), 'se puede cancelar');
});

// ============================================================
// dev-7 fase 41 — UN SOLO LENGUAJE DE ICONOS (SVG inline)
// + la LEYENDA de tipos de daño como TOGGLE
//
// Antes la UI mezclaba sprites PNG, EMOJI del sistema y glifos
// geométricos. Los emoji se dibujaban distinto en cada plataforma y en
// la misma fila unos salían en color y otros en línea: la nav era
// ilegible. Ahora todos los iconos son SVG inline con el mismo estilo
// de línea (el color lo pone el CSS: currentColor).
// ============================================================

test('fase 41: la nav de torretas usa SVG inline y NINGÚN emoji', () => {
  const html = buildTorretasScreen(defaultMeta());
  const nav = html.split('<nav class="meta-nav">')[1]?.split('</nav>')[0] ?? '';
  assert.ok(nav, 'no se encontró la nav');
  assert.equal((nav.match(/<svg/g) ?? []).length, 5,
    'una pestaña por icono SVG (Torreta, Bestiario, Progreso, Batalla, Menú)');
  assert.deepEqual(emojiOf(nav), [],
    `no debe quedar ningún emoji en la nav: ${emojiOf(nav).join(' ')}`);
  // Cada SVG con el estilo del proyecto: viewBox 24×24, sin relleno y con
  // el color heredado (currentColor).
  for (const m of nav.matchAll(/<svg[^>]*>/g)) {
    assert.ok(m[0].includes('viewBox="0 0 24 24"'), `viewBox correcto: ${m[0]}`);
    assert.ok(m[0].includes('fill="none"'), `sin relleno: ${m[0]}`);
    assert.ok(m[0].includes('stroke="currentColor"'), `el color lo pone el CSS: ${m[0]}`);
    assert.ok(m[0].includes('stroke-width="1.8"'), `grosor de línea del proyecto: ${m[0]}`);
  }
  // El texto de la pestaña (el nombre accesible) se mantiene.
  for (const label of ['Torreta', 'Bestiario', 'Progreso', 'Batalla', 'Menú']) {
    assert.ok(nav.includes(`<span>${label}</span>`), `falta la etiqueta ${label}`);
  }
});

test('fase 41: UI_ICONS son SVG inline con el estilo del proyecto', () => {
  const names = Object.keys(UI_ICONS);
  for (const id of ['torreta', 'bestiario', 'progreso', 'batalla', 'menu', 'cartas', 'musica']) {
    assert.ok(names.includes(id), `falta el icono ${id}`);
  }
  for (const [name, svg] of Object.entries(UI_ICONS)) {
    assert.ok(svg.startsWith('<svg '), `${name} es un <svg>`);
    assert.ok(svg.endsWith('</svg>'), `${name} está cerrado`);
    assert.ok(svg.includes('viewBox="0 0 24 24"'), `${name} usa el viewBox del proyecto`);
    assert.ok(svg.includes('fill="none"'), `${name} va de trazos`);
    assert.ok(svg.includes('stroke="currentColor"'), `${name} toma el color del CSS`);
    assert.ok(svg.includes('stroke-width="1.8"'), `${name} usa el grosor del proyecto`);
    assert.ok(svg.includes('aria-hidden="true"'), `${name} no molesta al lector de pantalla`);
    assert.deepEqual(emojiOf(svg), [], `${name} no lleva emoji`);
  }
});

test('fase 41: los botones del HUD (combos y música) usan SVG, no emoji', () => {
  for (const id of ['btn-combo', 'btn-music']) {
    const m = indexHtml.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</button>`));
    assert.ok(m, `no se encontró el botón ${id}`);
    assert.ok(m[1].includes('<svg'), `${id} debe llevar un SVG inline`);
    assert.ok(m[1].includes('class="btn-icon-img"'),
      `${id} usa la misma clase que los sprites PNG (tamaño y glow)`);
    assert.ok(m[1].includes('stroke="currentColor"'), `${id} toma el color del CSS`);
    assert.deepEqual(emojiOf(m[1]), [], `${id} no debe tener emoji`);
  }
});

test('fase 41: la pantalla de torretas tiene el toggle de la leyenda', () => {
  const html = buildTorretasScreen(defaultMeta());
  // El botón con su estado de accesibilidad.
  assert.ok(html.includes('data-meta-legend-toggle'), 'falta el botón del toggle');
  assert.ok(html.includes('aria-expanded="false"'),
    'el botón arranca con aria-expanded="false" (la tabla está cerrada)');
  assert.ok(html.includes('aria-controls="meta-legend"'),
    'el botón apunta a la tabla que abre/cierra');
  assert.ok(html.includes('VER TIPOS DE DAÑO'),
    'cerrada, el botón dice que la abra');
  // La leyenda tiene id y arranca CERRADA con la CLASE hidden (el
  // atributo hidden del HTML es otro mecanismo y dejaba el nodo sin caja).
  assert.ok(html.includes('id="meta-legend"'), 'la leyenda tiene id');
  assert.ok(html.includes('id="meta-legend-table"'), 'la tabla tiene id');
  assert.ok(/class="meta-legend hidden"/.test(html),
    'la leyenda arranca cerrada con la clase "hidden"');
  assert.ok(!/<div[^>]*id="meta-legend"[^>]*\shidden=/.test(html),
    'no se usa el atributo hidden del HTML (son dos mecanismos distintos)');
  // Y la tabla de verdad está dentro de la leyenda.
  assert.ok(html.includes('<table class="dmg-legend">'), 'la tabla se sigue generando');
});

/**
 * Raíz de overlay FALSA: un mapa selector → nodo, para probar los
 * toggles (leyenda, banner) sin DOM real.
 */
const fakeOverlayRoot = (raw) => {
  const wrap = (n) => ({
    id: n.id,
    get textContent() { return n.textContent; },
    set textContent(v) { n.textContent = v; },
    classList: {
      add: (c) => n.classes.add(c),
      remove: (c) => n.classes.delete(c),
      contains: (c) => n.classes.has(c),
      toggle: (c, on) => { if (on) n.classes.add(c); else n.classes.delete(c); },
    },
    setAttribute: (k, v) => { n.attrs[k] = String(v); },
    getAttribute: (k) => (k in n.attrs ? n.attrs[k] : null),
  });
  const nodes = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, wrap(v)]));
  return {
    nodes,
    querySelector: (sel) => nodes[sel] ?? null,
    querySelectorAll: () => [],
  };
};

/** Nodo falso (texto + clases + atributos). */
const fakeNode = (id, text = '', classes = []) => ({
  id, textContent: text, attrs: {}, classes: new Set(classes),
});

/** Nodos falsos para probar el toggle de la leyenda sin DOM. */
const fakeToggleRoot = () => fakeOverlayRoot({
  '#meta-legend': fakeNode('meta-legend', '', ['hidden']),
  '#meta-banner': fakeNode('meta-banner'),
  '#meta-grid': fakeNode('meta-grid'),
  '[data-meta-legend-toggle]': fakeNode('meta-legend-toggle', 'VER TIPOS DE DAÑO'),
});

test('fase 41: el toggle de la leyenda abre y cierra la tabla', () => {
  const hud = Object.create(HUD.prototype);
  hud.overlayRoot = fakeToggleRoot();
  hud._legendOpen = false;

  hud._toggleMetaLegend();
  assert.equal(hud.overlayRoot.nodes['#meta-legend'].classList.contains('hidden'), false,
    'la leyenda se ve al abrirla');
  assert.equal(hud.overlayRoot.nodes['[data-meta-legend-toggle]'].getAttribute('aria-expanded'),
    'true', 'el botón avisa que está abierto');
  assert.equal(hud.overlayRoot.nodes['[data-meta-legend-toggle]'].textContent,
    'OCULTAR TIPOS DE DAÑO', 'el botón ofrece cerrarla');
  assert.equal(hud.overlayRoot.nodes['#meta-grid'].classList.contains('hidden'), true,
    'la grilla cede el lugar (si no, la tabla queda aplastada)');
  assert.equal(hud.overlayRoot.nodes['#meta-banner'].classList.contains('hidden'), true,
    'el banner también cede el lugar');

  hud._toggleMetaLegend();
  assert.equal(hud.overlayRoot.nodes['#meta-legend'].classList.contains('hidden'), true,
    'la leyenda se vuelve a ocultar');
  assert.equal(hud.overlayRoot.nodes['[data-meta-legend-toggle]'].getAttribute('aria-expanded'),
    'false', 'el botón avisa que está cerrado');
  assert.equal(hud.overlayRoot.nodes['#meta-grid'].classList.contains('hidden'), false,
    'la grilla vuelve a la pantalla');
});

test('fase 41: la leyenda se usa con la CLASE hidden, no con el atributo', () => {
  // La UI del proyecto oculta con la clase .hidden (display:none
  // !important). El atributo hidden del HTML es OTRO mecanismo: mezclarlos
  // deja el nodo sin caja.
  assert.ok(css.includes('.hidden { display: none !important; }'),
    'la clase .hidden es la que oculta');
  const html = buildTorretasScreen(defaultMeta());
  const legend = html.match(/<div class="meta-legend hidden" id="meta-legend">/);
  assert.ok(legend, 'la leyenda arranca con la clase hidden');
  assert.ok(!/id="meta-legend"[^>]*\shidden(=|>)/.test(html),
    'la leyenda no lleva el atributo hidden');
});

test('fase 41: los overlays (menú y pausa) no tienen emoji', () => {
  const menu = buildMenuScreen({ theme: 'neon', quality: 'alta' });
  assert.deepEqual(emojiOf(menu), [],
    `el menú no debe tener emoji: ${emojiOf(menu).join(' ')}`);
  const hud = Object.create(HUD.prototype);
  hud._abandonPending = null;
  const pausa = hud._screenPaused();
  // OJO: en la pausa está la LEYENDA de tipos de daño, y sus glifos
  // (✦ ⚡ ✸ ⬢…) son parte del vocabulario del juego (js/damagetypes.js):
  // se revisan los BOTONES, que son los que cambiaron.
  const botones = [...pausa.matchAll(/<button[\s\S]*?<\/button>/g)].map((m) => m[0]);
  assert.ok(botones.length >= 4, 'la pausa tiene botones');
  for (const b of botones) {
    assert.deepEqual(emojiOf(b), [],
      `un botón de la pausa no debe tener emoji: ${emojiOf(b).join(' ')} (${b})`);
  }
  // Y los dos usan iconos SVG.
  assert.ok(menu.includes('<svg'), 'el menú usa iconos SVG');
  assert.ok(pausa.includes('<svg'), 'la pausa usa iconos SVG');
});

// ============================================================
// fase 43 — menos redundancia en el HUD
// ============================================================

test('fase 43: la tira de estado NO muestra OLAS ni RACHA (duplicaban el HUD)', () => {
  const html = buildStatusStripHtml();
  // "OLAS 3/33" repetía la barra de progreso del stage (el mismo dato:
  // olas despachadas / total) y "RACHA ×1" repetía el badge ×1.5 del score.
  assert.ok(!html.includes('OLAS'), 'la tira no puede repetir el progreso del stage');
  assert.ok(!html.includes('RACHA'), 'la tira no puede repetir el badge de racha');
  assert.ok(!html.includes('data-stat="waves"'), 'se fue el read-out de olas');
  assert.ok(!html.includes('data-stat="streak"'), 'se fue el read-out de racha');
  // Lo que NO duplica nada se queda.
  assert.ok(html.includes('ENEMIGOS'), 'los enemigos vivos siguen ahí');
  assert.ok(html.includes('DPS'), 'el DPS sigue ahí');
  assert.equal((html.match(/class="hud-stat"/g) ?? []).length, 2,
    'la tira queda con 2 píldoras (libera ancho en móvil)');
});

test('fase 75: la barra de jefe expone rol y valor accesible', () => {
  const html = buildBossBarHtml();
  assert.ok(html.includes('role="progressbar"'), 'la barra debe tener rol de progreso');
  assert.ok(html.includes('aria-valuenow="0"'), 'el valor se actualiza en renderBossBar');
  assert.ok(html.includes('aria-label="Vida del jefe"'), 'el lector debe saber qué mide');
});

test('fase 75: los datos de pantalla se escapan antes de innerHTML', () => {
  const hud = Object.create(HUD.prototype);
  const html = hud._screenStageClear({
    stageName: '<b>etapa</b>', time: 1, score: 0, clearBonus: 0,
    lv: 1, kills: 0, cards: 0, leaks: 0, hpFrac: 1,
  });
  assert.ok(html.includes('&lt;b&gt;etapa&lt;/b&gt;'), 'el nombre de etapa debe escaparse');
  assert.ok(!html.includes('<b>etapa</b>'), 'no debe inyectarse HTML');
});

test('fase 75: _focusScreen enfoca el título y le da tabindex -1', () => {
  const hud = Object.create(HUD.prototype);
  const target = {
    tagName: 'H2', attrs: {}, focused: false,
    hasAttribute(k) { return k in this.attrs; },
    setAttribute(k, v) { this.attrs[k] = v; },
    focus() { this.focused = true; },
  };
  hud._focusScreen({ querySelector: () => target });
  assert.equal(target.focused, true);
  assert.equal(target.attrs.tabindex, '-1');
});

test('fase 43: la barra de jefe rotula el ×2 como RECOMPENSA (no de daño)', () => {
  const html = buildBossBarHtml();
  assert.ok(html.includes('<span class="boss-mult-label">RECOMPENSA</span>'),
    'la etiqueta de RECOMPENSA acompaña al número');
  assert.ok(html.includes('<span class="boss-mult"></span>'),
    'el número del factor sigue siendo .boss-mult');
  assert.ok(html.indexOf('boss-mult-label') < html.indexOf('class="boss-mult"'),
    'la etiqueta va ANTES del número (se lee "RECOMPENSA ×2")');
});

test('fase 43: el banner "¿Cómo subo de nivel?" es plegable', () => {
  const html = buildTorretasScreen(defaultMeta());
  // El botón del toggle, con su estado de accesibilidad.
  assert.ok(html.includes('class="meta-banner-toggle"'), 'falta el botón del toggle');
  assert.ok(html.includes('data-meta-banner-toggle'), 'el botón está marcado para el binding');
  assert.ok(html.includes('aria-expanded="false"'),
    'el botón arranca con aria-expanded="false" (la explicación está cerrada)');
  assert.ok(html.includes('aria-controls="meta-banner-more"'),
    'el botón apunta al bloque que abre/cierra');
  // El bloque plegable: con la CLASE hidden (NUNCA el atributo hidden del
  // HTML: es otro mecanismo y dejaba el nodo sin caja).
  assert.ok(html.includes('id="meta-banner-more"'), 'el bloque plegable tiene id');
  assert.ok(/class="meta-banner-more hidden"/.test(html),
    'el bloque plegable arranca cerrado con la clase "hidden"');
  assert.ok(!/id="meta-banner-more"[^>]*\shidden(=|>)/.test(html),
    'no se usa el atributo hidden del HTML (son dos mecanismos distintos)');
  // La cabecera sigue siempre visible.
  assert.ok(html.includes('¿Cómo subo de nivel?'), 'el título sigue visible');
  assert.ok(html.includes(`/${META_TOTAL_MAX_LEVELS}`), 'el contador sigue visible');
  // Y la prosa (que explica lo mismo) está DENTRO del bloque plegable.
  const more = html.match(/<div class="meta-banner-more hidden" id="meta-banner-more">([\s\S]*?)<\/div>/);
  assert.ok(more, 'no se encontró el bloque plegable');
  assert.ok(more[1].includes('fragmentos'), 'la prosa explica los fragmentos');
  assert.ok(more[1].includes('MEJORAR'), 'la prosa explica MEJORAR');
  assert.ok(more[1].includes('✦'), 'la prosa explica los perks (✦)');
  assert.ok(more[1].includes('REDISTRIBUIR'), 'la prosa explica REDISTRIBUIR');
});

test('fase 43: el toggle del banner abre y cierra la explicación', () => {
  const hud = Object.create(HUD.prototype);
  hud.overlayRoot = fakeOverlayRoot({
    '#meta-banner-more': fakeNode('meta-banner-more', '', ['hidden']),
    '[data-meta-banner-toggle]': fakeNode('meta-banner-toggle', '?'),
  });
  hud._bannerMoreOpen = false;

  hud._toggleMetaBanner();
  assert.equal(hud.overlayRoot.nodes['#meta-banner-more'].classList.contains('hidden'), false,
    'la explicación se ve al abrirla');
  assert.equal(hud.overlayRoot.nodes['[data-meta-banner-toggle]'].getAttribute('aria-expanded'),
    'true', 'el botón avisa que está abierto');

  hud._toggleMetaBanner();
  assert.equal(hud.overlayRoot.nodes['#meta-banner-more'].classList.contains('hidden'), true,
    'la explicación se vuelve a ocultar');
  assert.equal(hud.overlayRoot.nodes['[data-meta-banner-toggle]'].getAttribute('aria-expanded'),
    'false', 'el botón avisa que está cerrado');
});

// ============================================================
// dev-7 fase 46 — EL VELO DEL COMBO EN CSS + NOMBRE PROPIO DE CADA JEFE
// ============================================================

test('fase 46: el panel de combos NO lleva el velo en inline (lo pone el CSS)', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showComboPanel(comboSum());
    const combo = hud.comboPanel;
    assert.ok(combo.classList.contains('overlay-veil'),
      'el panel de combos usa la clase CSS .overlay-veil');
    const style = combo.getAttribute('style') ?? '';
    assert.ok(!/backdrop-filter|blur\(|background|rgba\(/i.test(style),
      'el velo (fondo + blur) NO puede estar duplicado en el estilo inline');
    assert.ok(style.includes('z-index:50'),
      'el layout inline conserva el z-index del combo (encima del modal de cartas)');
  });
});

test('fase 46: el modal de cartas comparte la clase CSS del velo', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showCardChoice(OFFER);
    assert.ok(hud.cardModal.classList.contains('overlay-veil'),
      'el modal de cartas (y el de perk, que comparten nodo) usa la misma clase');
  });
});

test('fase 46: BOSS_NAMES tiene un nombre propio por stage de jefe (sin repetir)', () => {
  assert.deepEqual(Object.keys(BOSS_NAMES).map(Number), [1, 10, 20, 30, 40, 50],
    'los 6 stages de jefe tienen nombre');
  const nombres = Object.values(BOSS_NAMES);
  assert.equal(new Set(nombres).size, nombres.length, 'ningún nombre se repite');
  for (const nombre of nombres) {
    assert.ok(nombre.trim().length > 0, 'ningún nombre puede estar vacío');
    assert.notEqual(nombre, 'BOSS', 'ningún jefe se llama "BOSS"');
  }
});

test('fase 46: bossNameForStage devuelve el nombre del stage (y null si no hay jefe)', () => {
  for (const id of [1, 10, 20, 30, 40, 50]) {
    const nombre = bossNameForStage(id);
    assert.ok(nombre, `el stage ${id} debe tener nombre de jefe`);
    assert.notEqual(nombre, 'BOSS', `el stage ${id} NO puede llamarse "BOSS"`);
    assert.ok(nombre.trim().length > 0, `el stage ${id} no puede tener el nombre vacío`);
    assert.equal(nombre, BOSS_NAMES[id], `el stage ${id} usa su nombre propio`);
  }
  // Un stage SIN jefe devuelve null (igual que antes).
  assert.equal(bossNameForStage(2), null);
  assert.equal(bossNameForStage(7), null);
  assert.equal(bossNameForStage(43), null);
});

test('fase 46: la barra de jefe muestra el NOMBRE del jefe (no "BOSS")', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.renderBossBar({ name: 'Meteorito Colosal', hpFrac: 0.5, rewardMul: 2 });
    assert.ok(hud.el.boss, 'la barra de jefe existe');
    assert.equal(hud.el.bossName.textContent, 'Meteorito Colosal',
      'la etiqueta .boss-tag muestra el nombre del jefe');
    assert.ok(!String(hud.el.bossName.textContent).includes('BOSS'));
  });
});

test('fase 46: buildBossBarHtml ya no dice "BOSS" fijo', () => {
  const html = buildBossBarHtml();
  assert.ok(html.includes('data-boss-name'), 'la etiqueta tiene el hueco del nombre');
  assert.ok(!html.includes('>BOSS<'), 'la etiqueta no dice "BOSS"');
});

// ============================================================
// dev-7 fase 49 — LAS CARTAS HABLAN
//
// Cada carta de daño DECLARA su tipo de daño (`card.dmgType`, en
// cards.js) y el modal lo pinta como GLIFO con su color (los datos
// son los de DAMAGE_TYPES, js/damagetypes.js). La descripción dice
// el tipo y la SINONERGIA con cada familia, con los números REALES
// de la matriz (multiplicador de la carta × dmgMultiplier).
// ============================================================

/** Las 11 cartas de daño EXCLUSIVA ("×1,6 de la torre X"). */
const CARTAS_DMG_EXCLUSIVA = [
  'dmg_guard', 'dmg_missile', 'dmg_beam', 'dmg_thunder', 'dmg_tesla',
  'dmg_mortar', 'dmg_gauss', 'dmg_laser', 'dmg_firewheel', 'dmg_wasps',
  'dmg_forcefield',
];

const carta = (id) => CATALOG.find((c) => c.id === id);

test('fase 49: las 11 cartas de daño exclusivo declaran un TIPO de daño válido', () => {
  for (const id of CARTAS_DMG_EXCLUSIVA) {
    const c = carta(id);
    assert.ok(c, `falta la carta ${id}`);
    assert.ok(c.dmgType, `${id} no declara su tipo de daño`);
    assert.ok(DAMAGE_TYPES[c.dmgType], `${id} declara un tipo desconocido: ${c.dmgType}`);
  }
});

test('fase 49: el tipo de la carta es el de la UNIDAD que mejora', () => {
  // Regresión: el tipo sale de la MISMA tabla que usa el combate, así que
  // no puede desincronizarse de lo que realmente inflige la torre.
  for (const [id, unidad] of Object.entries({
    dmg_guard: 'guardian', dmg_missile: 'missile', dmg_beam: 'beam',
    dmg_thunder: 'thunderstroke', dmg_tesla: 'tesla', dmg_mortar: 'mortar',
    dmg_gauss: 'gauss', dmg_laser: 'laser',
  })) {
    assert.equal(carta(id).dmgType, TOWERS[unidad].dmgType,
      `${id} debería tener el tipo de ${unidad}`);
  }
  for (const [id, unidad] of Object.entries({
    dmg_firewheel: 'firewheel', dmg_wasps: 'wasps', dmg_forcefield: 'forcefield',
  })) {
    assert.equal(carta(id).dmgType, DRONES[unidad].dmgType,
      `${id} debería tener el tipo de ${unidad}`);
  }
});

test('fase 49: la descripción dice el TIPO y el número REAL contra la familia donde pega ×1,5', () => {
  for (const id of CARTAS_DMG_EXCLUSIVA) {
    const c = carta(id);
    const tipo = DAMAGE_TYPES[c.dmgType];
    // El nombre del tipo, en mayúsculas, está en la descripción.
    assert.ok(c.desc.includes(tipo.name.toUpperCase()),
      `${id} no dice el tipo (${tipo.name}) en su descripción`);
    // Y el multiplicador contra la familia donde ese tipo pega ×1,5 es
    // el REAL (1,6 de la carta × 1,5 de la matriz = 2,4) — calculado,
    // no escrito a mano.
    const familiaFuerte = ENEMY_FAMILY_IDS
      .find((f) => dmgMultiplier(c.dmgType, f) === 1.5);
    assert.ok(familiaFuerte, `${id}: el tipo ${c.dmgType} no tiene fortaleza`);
    const esperado = (1.6 * dmgMultiplier(c.dmgType, familiaFuerte))
      .toFixed(1).replace('.', ',');
    assert.ok(c.desc.includes(`×${esperado}`),
      `${id} no menciona el ×${esperado} contra ${familiaFuerte}`);
    // Y la familia también se nombra (el jugador tiene que saber a QUIÉ
    // se aplica ese número).
    assert.ok(c.desc.toLowerCase().includes(ENEMY_FAMILIES[familiaFuerte].name.toLowerCase()),
      `${id} no nombra la familia ${familiaFuerte}`);
  }
});

test('fase 49: la descripción nombra TODAS las familias con su número real', () => {
  for (const id of CARTAS_DMG_EXCLUSIVA) {
    const c = carta(id);
    for (const f of ENEMY_FAMILY_IDS) {
      const esperado = (1.6 * dmgMultiplier(c.dmgType, f)).toFixed(1).replace('.', ',');
      assert.ok(c.desc.includes(`×${esperado}`),
        `${id} no menciona el ×${esperado} contra ${f}`);
    }
  }
});

test('fase 49: el modal pinta el GLIFO del tipo con su color junto al nombre', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    const cartaDmg = carta('dmg_guard'); // BALÍSTICO (◆, #E8C46A)
    hud.showCardChoice([cartaDmg]);
    const html = hud.cardModal.innerHTML;
    const t = DAMAGE_TYPES[cartaDmg.dmgType];
    assert.ok(html.includes(t.glyph), `el modal no muestra el glifo ${t.glyph}`);
    assert.ok(html.includes(t.color), `el modal no muestra el color ${t.color}`);
    assert.ok(html.includes('card-dmg-glyph'), 'el glifo va en su propio elemento');
    // La clase de la leyenda: el glifo se ve IGUAL que en la leyenda.
    assert.ok(html.includes('leg-glyph'), 'el glifo reusa la clase .leg-glyph');
    // Y el nombre de la carta sigue ahí, al lado.
    assert.ok(html.includes(cartaDmg.name));
  });
});

test('fase 49: el modal NO inventa un tipo para las cartas que no son de daño', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    hud.showCardChoice([carta('dmg_all'), carta('repair_500')]);
    const html = hud.cardModal.innerHTML;
    assert.ok(!html.includes('card-dmg-glyph'),
      'una carta que no mejora un daño NO puede llevar glifo de tipo');
  });
});

test('fase 49: la SINONERGIA va en su propia línea (dato, no texto corrido)', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    const c = carta('dmg_missile'); // EXPLOSIÓN: ▲espora ×2,4
    hud.showCardChoice([c]);
    const html = hud.cardModal.innerHTML;
    assert.ok(html.includes('card-synergy'), 'la sinonergia tiene su propio bloque');
    const synergy = html.match(/<span class="card-synergy">([^<]*)<\/span>/)?.[1] ?? '';
    assert.ok(synergy.includes('espora'), `la sinonergia no nombra la espora: ${synergy}`);
    assert.ok(synergy.includes('×2,4'), `la sinonergia no dice el ×2,4 real: ${synergy}`);
    // El texto principal NO repite la sinonergia (no duplica el dato).
    const desc = html.match(/<span class="card-desc">([^<]*)<\/span>/)?.[1] ?? '';
    assert.ok(!desc.includes('×2,4'), 'la descripción y la sinonergia no se duplican');
  });
});

// ============================================================
// dev-7 fase 57 — LOS OVERLAYS OCUPAN LA PANTALLA REAL
//
// Los overlays (menú, pausa, selector, fin de partida, cartas, perk y
// combos) vivían DENTRO de #marco-portrait: su caja era la del MARCO
// (607 px en un móvil de 390×844) y el `overflow: hidden` del marco los
// recortaba. La columna de cartas scrolleaba por dentro (432 px útiles
// de 500) → la 3.ª carta se cortaba a media descripción y abajo
// quedaban 227 px de negro sin usar.
//
// Ahora cuelgan de #overlay-stage: un nodo FIJO fuera del marco, con la
// caja del marco en ANCHO y la de la pantalla en ALTO.
// ============================================================

/**
 * `document` falso con getElementById: el escenario (#overlay-stage)
 * devuelve un nodo que registra los hijos que se le cuelgan.
 */
const withFakeStage = (fn) => {
  const prev = globalThis.document;
  const stage = {
    id: 'overlay-stage',
    children: [],
    appendChild(c) { stage.children.push(c); c.parentElement = stage; return c; },
  };
  const doc = {
    activeElement: null,
    body: fakeEl(),
    createElement: () => fakeEl(),
    getElementById: (id) => (id === 'overlay-stage' ? stage : null),
  };
  globalThis.document = doc;
  try { return fn(doc, stage); } finally {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  }
};

test('fase 57: el escenario de overlays está FUERA del marco (index.html)', () => {
  // El marco (con su overflow: hidden) ya no puede recortar a los overlays.
  const marco = indexHtml.slice(
    indexHtml.indexOf('<main id="marco-portrait">'),
    indexHtml.indexOf('</main>'),
  );
  assert.ok(!marco.includes('overlay-stage'),
    'el escenario NO puede vivir dentro del marco (lo recortaría)');
  assert.ok(!marco.includes('overlay-root'),
    'el overlay genérico tampoco puede vivir dentro del marco');
  // Y el escenario existe, con el overlay-root dentro.
  assert.ok(indexHtml.includes('id="overlay-stage"'), 'el escenario existe en el HTML');
  const stage = indexHtml.slice(indexHtml.indexOf('id="overlay-stage"'));
  assert.ok(stage.includes('id="overlay-root"'),
    'el overlay genérico cuelga del escenario');
});

test('fase 57: el modal de cartas y el de combos se cuelgan del ESCENARIO', () => {
  withFakeStage(() => {
    const hud = fakeHudLive();
    hud.showCardChoice(OFFER);
    assert.equal(hud.cardModal.parentElement?.id, 'overlay-stage',
      'el modal de cartas va al escenario (pantalla real), no al marco');
    hud.showComboPanel(comboSum());
    assert.equal(hud.comboPanel.parentElement?.id, 'overlay-stage',
      'el panel de combos también');
    // Y el marco se queda solo con el juego (el canvas y el HUD).
    assert.equal(hud.cardModal.parentElement.id !== 'marco-portrait', true);
  });
});

test('fase 57: sin escenario (DOM mínimo) el HUD no se rompe', () => {
  // El fake document de los tests NO tiene getElementById: el HUD cae al
  // marco como antes (nunca se rompe el juego por falta de un nodo).
  withFakeDocument(() => {
    const hud = fakeHudLive();
    const host = { children: [], appendChild(c) { host.children.push(c); return c; } };
    hud.root = { parentElement: host };
    assert.doesNotThrow(() => hud.showCardChoice(OFFER));
    assert.ok(hud.cardModal, 'el modal se crea igual');
    assert.equal(host.children.length, 1, 'sin escenario cuelga del marco (como antes)');
    assert.equal(host.children[0], hud.cardModal);
  });
});

test('fase 57: en un MÓVIL el overlay ocupa la PANTALLA REAL (826 px)', () => {
  // Medido en el navegador (390×844): el marco queda en 374×828 (desde la
  // fase 58 usa todo el alto) y el escenario en 372×826 → el overlay
  // ocupa la pantalla real y la columna de cartas entra entera.
  const movil = overlayStageBox(390, 844);
  assert.equal(movil.w, 372, 'el escenario toma el ancho del marco');
  assert.equal(movil.h, 826, 'el escenario toma el alto de la PANTALLA');
  assert.equal(movil.full, true, 'en un móvil el overlay es de pantalla completa');
  assert.ok(movil.w >= 372 && movil.h >= 826,
    `el escenario cubre la pantalla (${movil.w}×${movil.h})`);
});

test('fase 57: en ESCRITORIO el overlay coincide con el marco (nada cambia)', () => {
  // 1280×900: el marco ya es alto-limitado (542×884) → el escenario es
  // su caja de contenido (540×882) y el overlay se ve IGUAL que antes.
  const escritorio = overlayStageBox(1280, 900);
  assert.equal(escritorio.full, false, 'en escritorio el overlay NO es de pantalla completa');
  // El marco es alto-limitado en un escritorio ancho: queda angosto.
  assert.ok(escritorio.frameW < 1280 - 16,
    `el marco no llena el ancho de la pantalla (${escritorio.frameW} px)`);
  assert.ok(Math.abs(escritorio.h - escritorio.frameH) <= 2,
    'el alto del escenario es el del marco');
  assert.ok(Math.abs(escritorio.w - (escritorio.frameW - 2)) <= 1,
    'el ancho del escenario es el del marco (sin bordes)');
});

test('fase 57: la columna de cartas entra SIN scroll en un móvil', () => {
  // MEDIDO en el navegador (390×844, las 3 cartas más largas del
  // catálogo): la columna necesitaba 500 px y tenía 432 → la 3.ª se
  // cortaba. Con el overlay de pantalla real hay 651 px: entra entera.
  const NECESITA = 500;   // alto de la columna con las 3 cartas más largas
  const CHROME = 175;     // título + encabezado + fila de torres + hint
  const movil = overlayStageBox(390, 844);
  const util = movil.h - CHROME;
  assert.ok(util >= NECESITA,
    `la columna tiene ${util} px y necesita ${NECESITA}: no debe scrollear`);
  // Y la caja VIEJA del marco (609 px: el alto que le daba su ancho, antes
  // de la fase 58) NO daba la talla: esa es la regresión que se arregla.
  const utilMarcoViejo = 609 - CHROME;
  assert.ok(utilMarcoViejo < NECESITA,
    'con la caja vieja del marco la columna NO entraba (el bug que se arregla)');
});

test('fase 57: el escenario es un CONTENEDOR con el nombre del marco', () => {
  // Las @container marco (...) miden contra el marco: si el escenario no
  // fuera contenedor con el MISMO nombre y ancho, las cartas de móvil
  // dejarían de apilarse en columna.
  const regla = cssRule('#overlay-stage {');
  assert.ok(regla, 'debe existir la regla #overlay-stage');
  assert.ok(regla.includes('position: fixed'),
    'el escenario es fijo: no lo recorta el overflow del marco');
  assert.ok(regla.includes('container-type: inline-size'),
    'es un contenedor (para las container queries)');
  assert.ok(regla.includes('container-name: marco'),
    'con el MISMO nombre que el marco → los breakpoints siguen igual');
  assert.ok(css.includes('--stage-w:') && css.includes('--stage-h:'),
    'la caja del escenario sale de los tokens --stage-w / --stage-h');
  assert.ok(cssRule('#overlay-stage {').includes('height: var(--stage-h)'),
    'el alto del escenario es el token (la pantalla)');
});

test('fase 57: el velo de la PANTALLA COMPLETA es uniforme', () => {
  // Con el overlay a pantalla completa el velo es el MISMO para todas las
  // pantallas (se ve como una pantalla propia del juego); el velo claro
  // del menú y el de torretas solo se usan en escritorio.
  assert.ok(css.includes('#overlay-stage[data-full] #overlay-root'),
    'la pantalla completa tiene su propio velo');
  assert.ok(css.includes('#overlay-stage:not([data-full]) #overlay-root.backdrop-warm'),
    'el velo claro del menú es solo de escritorio');
  assert.ok(css.includes('#overlay-stage:not([data-full]) #overlay-root.backdrop-meta'),
    'el velo de torretas es solo de escritorio');
});

test('fase 57: refreshOverlayMode marca el escenario con data-full', () => {
  withFakeStage(() => {
    const hud = Object.create(HUD.prototype);
    const attrs = new Set();
    const stage = {
      clientHeight: 826,
      toggleAttribute: (name, on) => { if (on) attrs.add(name); else attrs.delete(name); },
      setAttribute: (n) => attrs.add(n),
      removeAttribute: (n) => attrs.delete(n),
    };
    globalThis.document.getElementById = (id) => (id === 'overlay-stage' ? stage : null);
    // dev-7 fase 58: el marco SIEMPRE llena el alto, así que "de pantalla
    // completa" se decide por el ANCHO: en el móvil el marco ocupa la
    // pantalla de lado a lado (374 de 390) → pantalla completa; en
    // escritorio el marco queda angosto (542 de 1280) → el overlay se ve
    // como antes (con el velo claro del menú).
    globalThis.document.documentElement = { clientWidth: 390 };
    assert.equal(hud.refreshOverlayMode({ clientWidth: 374, clientHeight: 828 }), true);
    assert.ok(attrs.has('data-full'), 'el escenario se marca como de pantalla completa');
    // Escritorio: el marco NO llena el ancho → no se marca.
    globalThis.document.documentElement = { clientWidth: 1280 };
    assert.equal(hud.refreshOverlayMode({ clientWidth: 542, clientHeight: 884 }), false);
    assert.ok(!attrs.has('data-full'), 'en escritorio no se marca');
  });
});

// ============================================================
// v2 — EL POOL COMPARTIDO Y LAS UNIDADES DESBLOQUEABLES EN EL HUD
//
// El meta v2 cambió dos cosas que la pantalla TORRETAS tiene que decir
// sin mentir:
//  1. los fragmentos son UN pool compartido (antes cada torreta tenía su
//     propia barra) y MEJORAR gasta de ese pool;
//  2. las unidades se compran con ORO (`meta.unlocked`) y hasta entonces
//     su card solo ofrece desbloquearlas.
// El "SUBIR TODO" y el aviso de pendientes de la fase 59.4 ya no existen.
// ============================================================

test('v2: la cabecera de TORRETAS muestra el pool de fragmentos y el oro', () => {
  const meta = metaCon({ fragsPool: 1240, gold: 300 });
  const html = buildTorretasScreen(meta);
  assert.ok(html.includes('class="meta-res-cell frag"'), 'hay una celda para los fragmentos');
  assert.ok(html.includes(`<b>${fmtFrags(1240)}</b>`), 'muestra el pool con separador de miles');
  assert.ok(html.includes('class="meta-res-cell gold"'), 'y sigue la celda del oro');
  assert.ok(html.includes('<b>300</b>'), 'con el saldo de oro');
});

test('v2: el tooltip del oro explica desbloquear unidades y redistribuir perks', () => {
  const html = buildTorretasScreen(metaCon());
  const gold = html.match(/<span class="meta-res-cell gold" title="([^"]*)"/);
  assert.ok(gold, 'la celda del oro tiene tooltip');
  assert.ok(/desbloquear/i.test(gold[1]), 'menciona desbloquear unidades');
  assert.ok(/redistribuir/i.test(gold[1]), 'y redistribuir perks');
});

test('v2: ya no existe el botón "SUBIR TODO" ni el aviso de pendientes', () => {
  const html = buildTorretasScreen(metaCon({ fragsPool: 5000 }));
  assert.ok(!html.includes('data-meta-upgrade-all'), 'la pantalla no ofrece SUBIR TODO');
  assert.ok(!html.includes('SUBIR TODO'), 'ni su rótulo');
  assert.ok(!html.includes('pending-notice'), 'y no queda el aviso de pendientes');
  assert.ok(!buildMenuScreen({ theme: 'default', quality: 'alta' }).includes('pending-notice'),
    'el menú tampoco lo pinta');
});

test('v2: la pantalla TORRETAS lista las 11 unidades con sus cards', () => {
  const html = buildTorretasScreen(defaultMeta());
  assert.equal(countCards(html), META_TOWERS.length);
  assert.equal((html.match(/class="meta-card locked"/g) ?? []).length, META_TOWERS.length - 1,
    'la cuenta nueva ve 10 unidades bloqueadas');
});

test('fase 59.4: la línea de PODER dice el multiplicador REAL del meta', () => {
  // El poder sale de los NIVELES (no de los fragmentos: los fragmentos
  // son lo que se va a gastar).
  const meta = metaCon({ levels: { ...defaultMeta().levels, guardian: 4 } });
  const esperado = META_TOWERS.reduce((s, t) => s + metaDmgMul(t.type, meta), 0)
    / META_TOWERS.length;
  assert.ok(Math.abs(metaPowerMul(meta) - esperado) < 1e-9,
    'el poder es la media del metaDmgMul de las torretas desbloqueadas');
  assert.ok(esperado > 1, 'con el guardian mejorado el poder es mayor que ×1,0');
  const html = buildPowerLineHtml(meta);
  assert.ok(html.includes('PODER DE TUS TORRETAS'), 'la línea explica qué es');
  assert.ok(html.includes('×1,0'), 'y dice el multiplicador de partida');
  assert.ok(html.includes('sin mejoras'), 'y recuerda el valor sin mejoras');
});

test('v2: metaPowerMul promedia SOLO las unidades desbloqueadas', () => {
  // Cuenta nueva: solo el Guardian (Nvl.4). El poder NO se hunde con las
  // 10 unidades bloqueadas en Nvl.1.
  const meta = metaCon({
    levels: { ...defaultMeta().levels, guardian: 4 },
    unlocked: { ...defaultMeta().unlocked },
  });
  const soloGuardian = metaDmgMul('guardian', meta);
  assert.ok(Math.abs(metaPowerMul(meta) - soloGuardian) < 1e-9,
    'la media es la del Guardian, la única desbloqueada');
  assert.ok(soloGuardian > 1, 'el Guardian mejorado cuenta de verdad');
  // Sin `unlocked` (save viejo, balance-sim) promedia las 11.
  const sinUnlocked = normalizeMeta({
    ...defaultMeta(),
    unlocked: undefined,
    levels: { ...defaultMeta().levels, guardian: 4 },
  });
  assert.ok(Math.abs(metaPowerMul(sinUnlocked) - soloGuardian) > 1e-9,
    'sin el mapa de desbloqueos la media incluye las 11');
});

test('fase 59.4: sin mejoras la línea de PODER no aparece (no es ruido)', () => {
  assert.equal(buildPowerLineHtml(defaultMeta()), '');
  assert.ok(!buildTorretasScreen(defaultMeta()).includes('meta-power'));
});

test('fase 59.4: el panel PROGRESO resume el poder del meta', () => {
  const hud = Object.create(HUD.prototype);
  const meta = metaCon({ levels: { ...defaultMeta().levels, guardian: 4 } });
  const html = hud._metaProgresoHtml(meta);
  assert.ok(html.includes('Poder en partida'), 'el resumen tiene la fila de poder');
  assert.ok(html.includes('sin mejoras: ×1,0'), 'y contrasta con el valor sin mejoras');
});

test('v2: el panel PROGRESO dice que los fragmentos van al pool y el oro desbloquea', () => {
  const hud = Object.create(HUD.prototype);
  const html = hud._metaProgresoHtml(metaCon());
  assert.ok(html.includes(`${META_FRAG_PER_VICTORY} al pool`),
    'los fragmentos por victoria van al pool compartido');
  assert.ok(/desbloquear unidades/i.test(html), 'el oro desbloquea unidades');
  assert.ok(/redistribuir perks/i.test(html), 'y redistribuye perks');
});

test('fase 59.4: fmtFrags pone el separador de miles', () => {
  assert.equal(fmtFrags(1240), '1.240');
  assert.equal(fmtFrags(225), '225');
  assert.equal(fmtFrags(0), '0');
  assert.equal(fmtFrags(999), '999');
  assert.equal(fmtFrags(1000000), '1.000.000');
});

test('v2: el CSS tiene estilos para la card bloqueada y el botón de desbloqueo', () => {
  for (const sel of ['.meta-card.locked', '.meta-card-lock', '.meta-unlock',
    '.meta-unlock:disabled', '.meta-res-cell.frag']) {
    assert.ok(css.includes(sel), `falta el estilo ${sel}`);
  }
  assert.ok(css.includes('.meta-power'), 'la línea de poder tiene estilo');
});

// ============================================================
// fase 61 — el arsenal acotado (5 torres + 1 dron) visto por el HUD
//
// El tope de torres sale del número de slots (CONFIG.SLOTS: 5, una sola
// fila) y el de drones de MAX_DRONES (1). El HUD no cuenta unidades:
// pinta lo que hay en `fortress.slots` y en `fortress.drones`. Estos
// tests fijan que la fila de torres poseídas del modal de cartas se vea
// con el arsenal LLENO (5 y ni una más), con UNA torre (el arranque) y
// VACÍO; que el panel COMBO no prometa los 9 slots viejos (S6..S9); y
// que el read-out de DPS sume las 5 del tope. Ojo: las 11 unidades del
// META (META_TOWERS) NO cambian — lo que cambia es cuántas entran EN
// PARTIDA.
// ============================================================

/** `window` falso con la Game viva (el modal de cartas lee __GDF__.game). */
const withFakeGame = (game, fn) => {
  const prev = globalThis.window;
  globalThis.window = { __GDF__: { game } };
  try { return fn(); } finally {
    if (prev === undefined) delete globalThis.window;
    else globalThis.window = prev;
  }
};

/**
 * Game falso con el arsenal en los 5 slots de la fase 61 (el resto
 * vacíos), como lo deja `Fortress.addTower`.
 * @param {Array<[string, number]>} [pares] [tipo, slot] con slot 0..4
 * @param {Array} [drones] drones vivos de la partida
 */
const arsenalGame = (pares = [], drones = []) => {
  const slots = new Array(CONFIG.SLOTS.length).fill(null);
  for (const [type, slot] of pares) {
    slots[slot] = { type, data: TOWERS[type], level: 1, slotIndex: slot };
  }
  return { fortress: { slots, drones }, stageId: 7, lv: 5 };
};

/** La fila de torres poseídas (`.own-row`) del HTML del modal de cartas. */
const ownRowOf = (html) => html.match(/<div class="own-row">([\s\S]*?)<\/div>/)?.[1] ?? '';

/** Cuántas fichas de torre (`.own-tower`) hay en la fila. */
const ownTowersIn = (fila) => (fila.match(/class="own-tower"/g) ?? []).length;

test('fase 61: el tope del arsenal son 5 slots (una fila) y 1 dron', () => {
  assert.equal(CONFIG.SLOTS.length, 5, 'los slots de torre son 5 (fase 61)');
  assert.equal(MAX_DRONES, 1, 'el cupo de drones es 1 (fase 61)');
});

test('fase 61: la fila de torres poseídas muestra las 5 del arsenal lleno y ni una más', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    // Arsenal LLENO (5/5): todos los slots ocupados.
    const lleno = arsenalGame([
      ['missile', 0], ['thunderstroke', 1], ['guardian', 2], ['tesla', 3], ['beam', 4],
    ]);
    withFakeGame(lleno, () => hud.showCardChoice(OFFER));

    const fila = ownRowOf(hud.cardModal.innerHTML);
    assert.equal(ownTowersIn(fila), 5, 'con el arsenal lleno la fila muestra las 5 torres');
    for (const tipo of ['missile', 'thunderstroke', 'guardian', 'tesla', 'beam']) {
      assert.ok(fila.includes(TOWERS[tipo].name), `la fila muestra ${TOWERS[tipo].name}`);
    }
    // El tope son 5: en la fila no puede quedar ningún rótulo que
    // prometa los slots 6..9 del arsenal viejo.
    assert.ok(!/[6-9]/.test(fila), 'la fila no puede prometer los slots S6..S9');
    assert.ok(fila.includes('data-action-combo'), 'el botón "Lista de Combos" sigue en la fila');
  });
});

test('fase 61: con una sola torre (el arranque) la fila muestra solo esa', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    // Arranque de la run: SOLO el Guardian, en el slot central (§6).
    withFakeGame(arsenalGame([['guardian', 2]]), () => hud.showCardChoice(OFFER));

    const fila = ownRowOf(hud.cardModal.innerHTML);
    assert.equal(ownTowersIn(fila), 1, 'una torre poseída = una ficha');
    assert.ok(fila.includes(TOWERS.guardian.name), 'la ficha es el Guardian');
    assert.ok(!fila.includes(TOWERS.missile.name), 'y no la del Misil (todavía no está)');
  });
});

test('fase 61: con el arsenal vacío la fila muestra el guion (no se rompe)', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    withFakeGame(arsenalGame([]), () => hud.showCardChoice(OFFER));

    const fila = ownRowOf(hud.cardModal.innerHTML);
    assert.equal(ownTowersIn(fila), 1, 'queda una ficha (la del guion)');
    assert.ok(fila.includes('—'), 'la ficha vacía es el guion');
    assert.ok(!/[0-9]/.test(fila), 'sin torres no hay nivel ni slot que rotular');
  });
  // Sin Game viva (window.__GDF__ ausente) tampoco se rompe: es el caso
  // que ya recorre el resto de los tests del modal.
  withFakeDocument(() => {
    const hud = fakeHudLive();
    assert.doesNotThrow(() => hud.showCardChoice(OFFER));
    assert.ok(ownRowOf(hud.cardModal.innerHTML).includes('—'), 'queda el guion');
  });
});

test('fase 61: con el arsenal lleno la oferta sigue viva (no se traba)', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    // Con 5/5 no hay cartas de desbloqueo elegibles (cards.js): lo que
    // llega son mejoras, y el modal tiene que pintarlas todas.
    const oferta = [
      { id: 'dmg_all', name: 'Daño Global', desc: 'x', rarity: 'legendary' },
      { id: 'cadence_up', name: 'Servos', desc: 'y' },
      { id: 'repair_500', name: 'Reparación', desc: 'z' },
    ];
    const lleno = arsenalGame([
      ['missile', 0], ['thunderstroke', 1], ['guardian', 2], ['tesla', 3], ['beam', 4],
    ]);
    withFakeGame(lleno, () => hud.showCardChoice(oferta));

    const modal = hud.cardModal;
    assert.equal(modal.querySelectorAll('[data-card-id]').length, 3,
      'la oferta tiene 3 cartas de mejora');
    modal.dispatch('click', { target: modal.querySelector('[data-card-id]') });
    assert.equal(hud.emitted.at(-1)?.ev, 'card:pick', 'elegir sigue emitiendo card:pick');
    assert.equal(ownTowersIn(ownRowOf(modal.innerHTML)), 5,
      'y la fila sigue mostrando el arsenal');
  });
});

test('fase 61: el panel COMBO rotula los slots del 1 al 5 (y el dron como DRON)', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    const sum = comboSum();
    // Arsenal lleno: 5 torres en los slots 0..4 (comboSummary las
    // rotula con `slot` = slotIndex).
    sum.towers = [0, 1, 2, 3, 4].map((i) => ({
      name: `${TOWERS.guardian.name} ${i + 1}`, slot: i, level: 1,
      dmgMul: 1, cadMul: 1, dmgType: 'ballistic',
    }));
    sum.drones = [{ name: DRONES.firewheel.name, dmgType: 'drone' }];
    hud.showComboPanel(sum);

    const html = hud.comboPanel.innerHTML;
    for (const s of ['S1', 'S2', 'S3', 'S4', 'S5']) {
      assert.ok(html.includes(`>${s}<`), `el panel rotula ${s}`);
    }
    for (const s of ['S6', 'S7', 'S8', 'S9']) {
      assert.ok(!html.includes(s), `el panel no puede rotular ${s} (el tope son 5 slots)`);
    }
    assert.ok(html.includes('>DRON<'), 'el dron se rotula DRON (vuela: no ocupa slot)');
    assert.ok(html.includes(DRONES.firewheel.name), 'con el nombre real del dron');
  });
});

test('fase 61: el DPS del read-out suma las 5 torres del tope', () => {
  // El read-out de la partida (main.js: _arsenalDps) suma el DPS de los
  // slots OCUPADOS y el HUD lo formatea: con el tope de 5 no queda una
  // 6.ª torre fuera de la cuenta ni un bucle sobre los 9 slots viejos.
  const arsenal = [
    { damage: 20, cooldown: 1, data: { kind: 'fan' } },                       // 20
    { damage: 35, cooldown: 1.2, data: { kind: 'homing' } },                  // 29,2
    { damage: 40, cooldown: 0, data: { kind: 'beam' } },                      // 40
    { damage: 24, cooldown: 1.6, data: { kind: 'chain' } },                   // 15
    { damage: 45, cooldown: 3.2, data: { kind: 'laser', laserDuration: 2.5 } }, // 35,2
  ];
  const slots = new Array(CONFIG.SLOTS.length).fill(null);
  arsenal.forEach((t, i) => { slots[i] = t; });

  const vivos = slots.filter(Boolean);
  assert.equal(vivos.length, 5, 'el arsenal lleno son 5 torres (no 9)');
  assert.equal(Math.round(fortressDps(vivos) * 10) / 10, 139.3,
    'el DPS del arsenal es la suma de sus 5 torres');
  assert.equal(formatBattleStatus({ dps: Math.round(fortressDps(vivos)) }).dps, '139',
    'el read-out del HUD redondea el DPS del arsenal acotado');
});

// ============================================================
// fase 64 — EL TOPE DE CARTAS DE LA ETAPA (20 cartas → Nvl 21)
//
// El reporte del usuario (S50, 2026-10-23): un multikill lo subió DOS
// niveles y las dos ofertas se sortearon en el mismo instante, así que la
// 2.ª le volvió a ofrecer la torre que acababa de elegir → quedó con DOS
// misiles. El arreglo vive en main.js (acumula NIVELES pendientes y
// sortea cada oferta al abrirse, ver `_pendingLevels`), pero el modal
// tiene que DECIRLO: cuántas mejoras quedan en cola y qué pasa cuando la
// etapa ya no da más niveles (la energía pasa a valer SCORE).
// El texto sale de `cardHintText` (pura) y el rótulo del HUD de
// `levelLabelText` (pura): se prueban acá sin DOM.
// ============================================================

test('fase 64: el hint del modal es el de siempre si no hay nada tras la elección', () => {
  assert.equal(cardHintText(), 'Elige 1 mejora · el mundo está en pausa');
  assert.equal(cardHintText({ pendingLevels: 1 }), 'Elige 1 mejora · el mundo está en pausa',
    'una sola mejora (la que se está eligiendo) NO es una cola');
  assert.equal(cardHintText({ maxed: false }), 'Elige 1 mejora · el mundo está en pausa');
});

test('fase 64: con niveles en cola el modal dice cuántas mejoras quedan', () => {
  const txt = cardHintText({ pendingLevels: 2 });
  assert.ok(txt.includes('Mejoras pendientes ×2'),
    `el modal no avisa de la cola: ${txt}`);
  assert.ok(txt.includes('Elige 1 mejora'), 'el aviso se SUMA al hint de siempre');
  assert.ok(cardHintText({ pendingLevels: 4 }).includes('×4'),
    'el número es el real de la cola, no un 2 fijo');
});

test('fase 64: al tope de la etapa el modal dice que la energía vale SCORE', () => {
  const txt = cardHintText({ pendingLevels: 2, maxed: true });
  assert.ok(txt.includes('NIVEL MÁX'), `falta el aviso del tope: ${txt}`);
  assert.ok(txt.includes('SCORE'), 'y dice a qué se convierte la energía');
  assert.ok(txt.includes('Mejoras pendientes ×2'),
    'el tope y la cola son dos datos distintos: los dos se dicen');
});

test('fase 64: el rótulo de nivel del HUD dice "NIVEL MÁX" cuando no hay nivel que venir', () => {
  assert.equal(levelLabelText({ lv: 7 }), 'Lv.7', 'por debajo del tope, el rótulo de siempre');
  assert.equal(levelLabelText({ lv: MAX_LEVEL_PER_STAGE, maxed: true }), 'NIVEL MÁX',
    'al tope la barra llena no puede prometer un nivel que no existe');
  assert.equal(levelLabelText(), 'Lv.1', 'sin datos, el nivel arranca en 1');
});

test('fase 64: el tope son 20 cartas y el Nvl 21 (el rótulo lo toma del dato)', () => {
  assert.equal(MAX_LEVEL_PER_STAGE, MAX_CARDS_PER_STAGE + 1,
    'el nivel al tope es las 20 cartas de la etapa + el nivel de arranque');
  // Y el rótulo del HUD no puede cantar "NIVEL MÁX" antes de tiempo.
  assert.equal(levelLabelText({ lv: MAX_LEVEL_PER_STAGE - 1, maxed: false }), 'Lv.20');
});

test('fase 64: el modal lee la COLA y el TOPE de la partida (no de un literal)', () => {
  withFakeDocument(() => {
    // Multikill de 3 niveles: el primer modal ya avisa que quedan 2 más.
    const enCola = { ...arsenalGame([]), lv: 5, _pendingLevels: 3 };
    const hud = fakeHudLive();
    withFakeGame(enCola, () => hud.showCardChoice(OFFER));
    assert.ok(hud.cardModal.innerHTML.includes('Mejoras pendientes ×3'),
      'el modal no lee la cola real de la partida (main.js `_pendingLevels`)');

    // Nivel al tope de la etapa: la energía ya no da niveles, vale SCORE.
    const alTope = { ...arsenalGame([]), lv: MAX_LEVEL_PER_STAGE, _pendingLevels: 1 };
    withFakeGame(alTope, () => hud.showCardChoice(OFFER));
    assert.ok(hud.cardModal.innerHTML.includes('NIVEL MÁX'),
      'al tope el modal tiene que decir que la energía vale SCORE');
    assert.ok(!hud.cardModal.innerHTML.includes('Mejoras pendientes'),
      'sin cola (una sola mejora) no se anuncia cola');

    // A un nivel del tope todavía NO es el tope (el umbral sale del dato).
    const casi = { ...arsenalGame([]), lv: MAX_LEVEL_PER_STAGE - 1, _pendingLevels: 1 };
    withFakeGame(casi, () => hud.showCardChoice(OFFER));
    assert.ok(!hud.cardModal.innerHTML.includes('NIVEL MÁX'),
      'a un nivel del tope el aviso de nivel máximo todavía no va');
    assert.ok(hud.cardModal.innerHTML.includes('Elige 1 mejora'),
      'el hint base sigue en el modal');
  });
});

test('fase 71: el tope de Supervivencia es 31, no el 21 de campaña', () => {
  // El HUD y el modal usaban MAX_LEVEL_PER_STAGE (21) siempre: en
  // Supervivencia cantaban "NIVEL MÁX" mientras seguían dando cartas.
  assert.equal(levelLabelText({ lv: 21, maxLevel: 31 }), 'Lv.21',
    'a nivel 21 la Supervivencia todavía tiene 10 cartas por delante');
  assert.equal(levelLabelText({ lv: 30, maxLevel: 31 }), 'Lv.30');
  assert.equal(levelLabelText({ lv: 31, maxLevel: 31 }), 'NIVEL MÁX',
    'el tope real de la run es el 31');
  assert.equal(levelLabelText({ lv: 21 }), 'NIVEL MÁX',
    'sin maxLevel se conserva el tope de campaña (21)');

  assert.ok(!cardHintText({ lv: 21, maxLevel: 31 }).includes('NIVEL MÁX'),
    'el modal no puede decir que la energía vale SCORE con cartas pendientes');
  assert.ok(cardHintText({ lv: 31, maxLevel: 31 }).includes('NIVEL MÁX'),
    'al llegar al 31 sí avisa del tope');

  // El modal lee `game.maxLevel` (main lo expone por modo).
  withFakeDocument(() => {
    const hud = fakeHudLive();
    const survival = { ...arsenalGame([]), lv: 21, maxLevel: 31, _pendingLevels: 1 };
    withFakeGame(survival, () => hud.showCardChoice(OFFER));
    assert.ok(!hud.cardModal.innerHTML.includes('NIVEL MÁX'),
      'el modal de Supervivencia no puede decir NIVEL MÁX en el nivel 21');
    const cap = { ...arsenalGame([]), lv: 31, maxLevel: 31, _pendingLevels: 1 };
    withFakeGame(cap, () => hud.showCardChoice(OFFER));
    assert.ok(hud.cardModal.innerHTML.includes('NIVEL MÁX'),
      'en el 31 el modal sí avisa que la energía vale SCORE');
  });
});

test('fase 71: el HUD pinta Lv.21 hasta el tope 31 de Supervivencia', () => {
  const hud = Object.create(HUD.prototype);
  hud._hudVisible = true;
  hud._invalidateRenderCache();
  const fakeEl = () => ({
    textContent: '',
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    offsetWidth: 0,
  });
  const lv = fakeEl();
  const xp = fakeEl();
  hud.el = new Proxy({ lv, xp }, {
    get: (target, prop) => (prop in target ? target[prop] : undefined),
  });
  const payload = {
    stageName: 'Supervivencia', progress: 0.5, lv: 21, maxLevel: 31,
    xpFrac: 0.5, timer: 10, score: 100, mult: 1, speed: 1,
    ultCharge: 0, ultReady: false, enemiesAlive: 0, dps: 0, leaks: 0,
  };
  hud.render(payload);
  assert.equal(lv.textContent, 'Lv.21', 'el HUD no canta tope en el nivel 21 de la run');
  hud._lastLvText = null;
  hud.render({ ...payload, lv: 31, xpFrac: 1 });
  assert.equal(lv.textContent, 'NIVEL MÁX', 'en el 31 el rótulo sí es el tope');
  hud._lastLvText = null;
  hud.render({ ...payload, lv: 21, maxLevel: undefined, xpFrac: 1 });
  assert.equal(lv.textContent, 'NIVEL MÁX',
    'sin maxLevel (campaña/∞) el tope sigue siendo 21');
});

// ============================================================
// oleadas-dinámicas (WS-C) — LA LEGIBILIDAD DEL DIRECTOR
//
// El director (js/waves.js) mete 8 arquetipos de descarga y 7 afijos de
// élite (fase 68), y NO hay preview de la próxima ola (decisión del
// usuario): lo único que se anuncia es lo que ESTÁ entrando. Estas son las
// piezas PURAS del HUD que lo cuentan:
//   - archetypeBannerText(arquetipo) → "¡CONVOY!" (null = sin banner)
//   - stageFamilyText(pool)          → "roca / virus"
//   - buildBestiaryHtml(variantes)   → la sección de variantes
// Los DATOS del director llegan por parámetro/namespace: estos tests no
// dependen de que WS-A/WS-B hayan terminado.
// ============================================================

test('oleadas: los 8 arquetipos del director tienen su rótulo de banner', () => {
  const ids = ['enjambre', 'convoy', 'cuña', 'cortina', 'goteo', 'pinza', 'escolta', 'ola de choque'];
  assert.equal(Object.keys(ARCHETYPE_BANNER_TEXT).length, ids.length,
    'el director tiene 8 arquetipos (design §Decisión 2)');
  for (const id of ids) {
    const txt = archetypeBannerText(id);
    assert.ok(txt, `el arquetipo ${id} tiene que anunciarse`);
    assert.ok(txt.startsWith('¡') && txt.endsWith('!'), `${id} → "${txt}"`);
    assert.equal(txt, txt.toUpperCase(), `el banner va en mayúsculas: ${txt}`);
    assert.ok(txt.length <= 16, `el banner es CORTO (no tapa el juego): ${txt}`);
  }
  assert.equal(archetypeBannerText('convoy'), '¡CONVOY!');
  assert.equal(archetypeBannerText('ola de choque'), '¡OLA DE CHOQUE!');
});

test('oleadas: un arquetipo desconocido o null NO muestra banner', () => {
  // El director puede no etiquetar la descarga (manda null).
  assert.equal(archetypeBannerText(null), null);
  assert.equal(archetypeBannerText(undefined), null);
  assert.equal(archetypeBannerText(''), null);
  assert.equal(archetypeBannerText('marabunta'), null, 'un id que no es del director no inventa banner');
  assert.equal(archetypeBannerText({}), null, 'un objeto tampoco');
});

test('oleadas: el banner del arquetipo dura menos que el aviso de jefe', () => {
  assert.ok(ARCHETYPE_BANNER_MS > 0);
  assert.ok(ARCHETYPE_BANNER_MS < BOSS_WARNING_MS,
    'el arquetipo entra cada pocos segundos: su aviso no puede durar lo que el del jefe');
});

test('oleadas: el HUD pinta el banner del arquetipo en la pila de avisos', () => {
  withFakeDocument(() => {
    const hud = fakeHudLive();
    const host = fakeHost();
    hud.root = { parentElement: host };

    const aviso = hud.showArchetypeBanner('convoy');
    assert.ok(aviso, 'el aviso se crea');
    assert.ok(aviso.className.includes('aviso--info'),
      'variante SOBRIA (nada de la placa roja del jefe)');
    assert.ok(aviso.innerHTML.includes('¡CONVOY!'), 'dice el arquetipo que entra');
    assert.ok(!aviso.innerHTML.includes('<img'), 'sin icono: no compite con el aviso de jefe');

    // Un arquetipo que el HUD no conoce (o una descarga sin etiqueta) no
    // pinta NADA: el banner es un aviso, no un hueco vacío.
    assert.equal(hud.showArchetypeBanner('marabunta'), null);
    assert.equal(hud.showArchetypeBanner(null), null);
    assert.equal(host.children[0].childNodes.length, 1,
      'los arquetipos desconocidos no se apilan en la pila de avisos');
  });
});

test('oleadas: sólo los arquetipos NOTABLES se anuncian (filtro de ruido)', () => {
  // Con una descarga cada pocos segundos, anunciarlas TODAS dejaba el
  // aviso casi siempre en pantalla. Los moldes que se leen solos no se
  // anuncian; los que cambian la lectura del campo, sí.
  for (const id of ['convoy', 'pinza', 'ola de choque', 'escolta']) {
    assert.ok(shouldAnnounceArchetype(id), `${id} es notable y tiene que anunciarse`);
  }
  for (const id of ['enjambre', 'cuña', 'cortina', 'goteo']) {
    assert.ok(!shouldAnnounceArchetype(id), `${id} se lee solo: sin banner`);
  }
  // El rótulo sigue existiendo para los 8 (el filtro es aparte del texto).
  for (const id of Object.keys(ARCHETYPE_BANNER_TEXT)) {
    assert.ok(archetypeBannerText(id), `${id} conserva su rótulo`);
  }
  assert.ok(!shouldAnnounceArchetype(null) && !shouldAnnounceArchetype('marabunta'));
  // Y el wiring: `showArchetypeBanner` de un arquetipo no notable no pinta nada.
  withFakeDocument(() => {
    const hud = fakeHudLive();
    const host = fakeHost();
    hud.root = { parentElement: host };
    assert.equal(hud.showArchetypeBanner('enjambre'), null, 'no notable → sin aviso');
    assert.ok(hud.showArchetypeBanner('convoy'), 'notable → aviso');
  });
});

/** Pool de prueba (etapa del bioma virus, design §Decisión 5). */
const FAKE_POOL = [
  { type: 'blob', weight: 50, family: 'virus' },
  { type: 'meteor', weight: 30, family: 'rock' },
  { type: 'spore', weight: 20, family: 'spore' },
];

test('oleadas: stageFamilyText lee el sesgo de la pool en texto corto', () => {
  assert.equal(stageFamilyText(FAKE_POOL), 'virus / roca',
    'la familia dominante primero, el nombre del bestiario en minúscula');
  assert.equal(stageFamilyText([{ type: 'meteor', weight: 90, family: 'rock' }]), 'roca',
    'una pool volcada a una familia dice sólo esa');
  assert.equal(stageFamilyText([
    { type: 'blob', weight: 90, family: 'virus' },
    { type: 'meteor', weight: 10, family: 'rock' },
  ]), 'virus', 'la segunda familia sólo se nombra si pesa de verdad (≥ un cuarto)');
  assert.ok(STAGE_FAMILY_SECOND_SHARE > 0 && STAGE_FAMILY_SECOND_SHARE < 1);
});

test('oleadas: stageFamilyText sin pool (o con datos raros) no rompe', () => {
  assert.equal(stageFamilyText([]), null);
  assert.equal(stageFamilyText(null), null);
  assert.equal(stageFamilyText([{ type: 'blob', weight: 0, family: 'virus' }]), null,
    'una familia con peso 0 no es un sesgo');
  assert.equal(stageFamilyText([{ type: 'blob', weight: 5, family: 'marciano' }]), null,
    'una familia que no existe se ignora');
  assert.doesNotThrow(() => stageFamilyText('no soy una pool'));
});

test('oleadas: el selector muestra el sesgo en la CABECERA del bloque', () => {
  const vistos = [];
  const html = buildStageList(fakeStages(50), {
    familyOf: (s) => { vistos.push(s); return s.id === 21 ? 'virus' : null; },
  });
  assert.ok(html.includes('STAGES 21–30<span class="stage-group-fam"> · virus</span></h3>'),
    'la cabecera del bloque con dato lleva el sesgo (el bloque es la década del bioma)');
  assert.equal((html.match(/class="stage-group-fam"/g) ?? []).length, 1,
    'sólo el bloque que tiene dato: en las 10 filas el rótulo sería ruido');
  assert.ok(html.includes('STAGES 1–10</h3>'), 'los bloques sin dato quedan exactamente igual');
  assert.ok(vistos.every((s) => s && typeof s.id === 'number'),
    'el resolutor recibe la FILA del bloque (no un id suelto)');
});

test('oleadas: sin el dato del director el selector se pinta como siempre', () => {
  // Es lo que pasa mientras WS-A no exponga `poolForStage` (o si revienta):
  // el HUD no puede romperse por un dato que falta.
  const sinDato = buildStageList(fakeStages(20));
  assert.ok(!sinDato.includes('stage-group-fam'), 'sin resolutor no hay etiqueta');
  assert.ok(sinDato.includes('STAGES 11–20'), 'y la lista sigue armándose');
  const rompe = buildStageList(fakeStages(10), {
    familyOf: () => { throw new Error('boom'); },
  });
  assert.ok(rompe.includes('STAGES 1–10'), 'un resolutor que revienta tampoco tumba la pantalla');
  assert.ok(!rompe.includes('stage-group-fam'));
});

test('oleadas: la pantalla del selector cablea el sesgo del director', () => {
  const hud = fakeHudLive();
  const html = hud._renderStageList(fakeStages(10));
  assert.ok(html.includes('STAGES 1–10'), 'el selector se arma igual');
  // Si WS-A ya expone poolForStage, el sesgo del bloque TIENE que verse
  // (el cableado está bien); si todavía no está, no se inventa nada.
  let esperado = null;
  try {
    esperado = typeof wavesModule.poolForStage === 'function'
      ? stageFamilyText(wavesModule.poolForStage(1))
      : null;
  } catch (_err) { esperado = null; }
  assert.equal(html.includes('stage-group-fam'), !!esperado,
    'la cabecera muestra el sesgo del director (y nada si el director no lo da)');
});

/** Tabla de variantes FALSA (mínima, al estilo viejo): sin `desc`/`counter`. */
const FAKE_VARIANTS = {
  escudado: { shieldFrac: 0.4, name: 'Escudado' },
  rapido: { velMul: 1.4, hpMul: 0.7, name: 'Veloz' },
  regenerador: { regenFrac: 0.02, name: 'Regenerador' },
};

test('oleadas: con una tabla mínima el bestiario documenta sus 3 variantes', () => {
  const html = buildBestiaryHtml(FAKE_VARIANTS);
  assert.ok(html.includes('VARIANTES DE ÉLITE'), 'la sección está en el bestiario');
  const ids = Object.keys(FAKE_VARIANTS);
  assert.equal((html.match(/data-variant="/g) ?? []).length, ids.length,
    'una ficha por variante de la tabla');
  for (const id of ids) {
    assert.ok(html.includes(`data-variant="${id}"`), `falta la variante ${id}`);
  }
  // Las CUATRO nuevas no están en la tabla: no se inventan.
  for (const id of ['divisor', 'sanador', 'acorazado', 'tenaz']) {
    assert.ok(!html.includes(`data-variant="${id}"`), `la tabla mínima no trae ${id}`);
  }
  // Los NOMBRES llegan de la tabla (el módulo no los hardcodea).
  for (const nombre of ['Escudado', 'Veloz', 'Regenerador']) {
    assert.ok(html.includes(nombre), `falta el nombre ${nombre}`);
  }
  // Qué HACE cada una, en el idioma del juego y con los números del DATO.
  assert.ok(html.includes('escudo frontal'), 'el escudado explica su escudo');
  assert.ok(html.includes('del 40 % de su vida'), 'shieldFrac 0.4 → 40 %');
  assert.ok(html.includes('un 40 % más'), 'velMul 1.4 → un 40 % más rápido');
  assert.ok(html.includes('un 30 % menos de vida'), 'hpMul 0.7 → 30 % más frágil');
  assert.ok(html.includes('un 2 % de su vida por segundo'), 'regenFrac 0.02 → 2 %/s');
  // Cómo se CONTRASTRESTA (lo que el jugador tiene que hacer).
  for (const id of ids) {
    const card = html.split(`data-variant="${id}"`)[1]?.split('</li>')[0] ?? '';
    assert.ok(card.includes('Cómo se contrarresta:'), `${id} explica su contra-juego`);
  }
  // La regla de la spec: ninguna variante es inmune.
  assert.ok(/ninguna es inmune/i.test(html));
  // El ICONO de cada ficha dibuja el RASGO con el render del juego: el
  // canvas lleva el enemigo de EJEMPLO y el id de la variante (que es lo
  // que el HUD le pasa a `renderEnemyIcon`).
  for (const id of ids) {
    const card = html.split(`data-variant="${id}"`)[1]?.split('</li>')[0] ?? '';
    const sample = BESTIARY_VARIANT_SAMPLE[id];
    assert.ok(sample, `la variante ${id} tiene enemigo de ejemplo`);
    assert.ok(card.includes(`data-bestiary-variant="${id}"`), `${id}: el icono pide su variante`);
    assert.ok(card.includes(`data-bestiary-icon="${sample}"`), `${id}: el icono usa ${sample}`);
    assert.ok(card.includes('<canvas'), `${id}: el icono es un canvas (lo pinta el HUD)`);
  }
  // Y el bestiario de enemigos de siempre sigue debajo.
  assert.ok(html.includes('data-bestiary-entry="meteor"'), 'las tarjetas de enemigos siguen ahí');
});

test('fase 68: con el catálogo REAL el bestiario pinta las 7 variantes', () => {
  const html = buildBestiaryHtml(ENEMY_VARIANTS);
  assert.equal(BESTIARY_VARIANT_IDS.length, 7, 'el catálogo tiene 7 afijos');
  assert.equal((html.match(/data-variant="/g) ?? []).length, 7, '7 fichas de variante');
  for (const id of BESTIARY_VARIANT_IDS) {
    const d = ENEMY_VARIANTS[id];
    const card = html.split(`data-variant="${id}"`)[1]?.split('</li>')[0] ?? '';
    assert.ok(card, `falta la ficha ${id}`);
    assert.ok(card.includes(d.name), `${id}: falta su nombre ("${d.name}")`);
    assert.ok(card.includes('Qué hace:'), `${id}: falta el efecto`);
    assert.ok(card.includes('Cómo se contrarresta:'), `${id}: falta el contra-juego`);
    assert.ok(card.includes(`data-bestiary-icon="${BESTIARY_VARIANT_SAMPLE[id]}"`),
      `${id}: falta su icono de ejemplo`);
  }
  // Las cuatro NUEVAS entran al bestiario sin sección aparte.
  for (const id of ['divisor', 'sanador', 'acorazado', 'tenaz']) {
    assert.ok(html.includes(`data-variant="${id}"`), `falta la variante nueva ${id}`);
  }
  assert.ok(/ninguna es inmune/i.test(html), 'el aviso de la spec se mantiene');
});

test('oleadas: sin tabla de variantes el bestiario no rompe ni inventa', () => {
  for (const args of [[], [null], [{}], [{ escudado: null }], ['no soy una tabla']]) {
    const html = buildBestiaryHtml(...args);
    assert.ok(html.includes('BESTIARIO'), 'el bestiario de enemigos sigue ahí');
    assert.ok(html.includes('data-bestiary-entry="meteor"'), 'con sus tarjetas');
    assert.ok(!html.includes('data-variant'), 'y sin sección de variantes');
  }
  // La pantalla completa se arma igual (el call site pasa lo que haya).
  assert.doesNotThrow(() => buildTorretasScreen(defaultMeta()));
});

// ============================================================
// fase 67 — MODO INFINITO: las tarjetas del selector y el resumen
//
// El HUD NO calcula el endgame: recibe `endless` ya resuelto (récord,
// etapa siguiente, etapa del día). Estos tests fijan el contrato con
// main.js y, sobre todo, que SIN el payload el selector siga siendo el
// de siempre (la campaña no puede cambiar por el modo nuevo).
// ============================================================

/** Payload del ∞ como lo arma `_selectData()` de main.js (S50 limpiado). */
const endlessPayload = (over = {}) => ({
  open: true,
  best: 62,
  next: 63,
  daily: { date: '2026-10-26', stage: 57, bestScore: 0 },
  ...over,
});

test('fase 67: con el modo cerrado el selector es EXACTAMENTE el de antes', () => {
  const antes = buildStageList(fakeStages(50));
  for (const endless of [null, undefined, { open: false, best: 62, next: 63 }]) {
    const html = buildStageList(fakeStages(50), { endless });
    assert.ok(!html.includes('CONTINUAR'), 'cerrado: no hay tarjeta de continuación');
    assert.ok(!html.includes('DESAFÍO'), 'cerrado: no hay tarjeta del diario');
    assert.ok(!html.includes('endless-cards'), 'cerrado: ni el contenedor se agrega');
    assert.equal(html, antes, 'el HTML es byte a byte el de la campaña');
  }
});

test('fase 67: abierto, el selector antepone la tarjeta ∞ y la del diario', () => {
  const html = buildStageList(fakeStages(50), { endless: endlessPayload() });
  assert.ok(html.includes('∞ CONTINUAR'), 'la continuación se ve');
  assert.ok(html.includes('data-action="start-stage" data-stage="63"'),
    'continúa la etapa que trae el payload');
  assert.ok(html.includes('récord: etapa 62'), 'el récord es el enganche del ∞');
  assert.ok(html.includes('data-action="start-daily"'), 'el reto del día tiene su acción');
  assert.ok(html.includes('ETAPA 57'), 'la etapa del día sale de los datos');
  assert.ok(html.indexOf('endless-cards') < html.indexOf('stage-scroll'),
    'las tarjetas van ARRIBA y fuera del scroll de las 50 filas');
  assert.ok(html.includes('STAGES 41–50'), 'y la lista sigue completa debajo');
});

test('fase 67: el récord del día se muestra formateado (o "sin récord")', () => {
  const sin = buildDailyCardHtml(endlessPayload());
  assert.ok(sin.includes('sin récord hoy'), 'un bestScore 0 no es un récord');
  assert.ok(!sin.includes('récord de hoy'), 'y no se inventa uno');
  const con = buildDailyCardHtml(endlessPayload({
    daily: { date: '2026-10-26', stage: 57, bestScore: 12345 },
  }));
  assert.ok(con.includes('récord de hoy: 012345'), 'el score usa el formato del HUD');
});

test('fase 67: un payload corrupto no pinta tarjeta (y no lanza)', () => {
  const antes = buildStageList(fakeStages(10));
  const corruptos = [
    { open: true, next: 'x' },
    { open: true, next: null },
    { open: true, next: NaN },
    { open: true, next: 3 },       // una etapa de campaña no es el ∞
    { open: true },                // sin `next`
  ];
  for (const endless of corruptos) {
    assert.doesNotThrow(() => buildStageList(fakeStages(10), { endless }));
    assert.equal(buildStageList(fakeStages(10), { endless }), antes,
      'sin datos usables el selector es el de siempre');
  }
  // `best` roto cae a 0: la tarjeta SIGUE sirviendo (primera incursión).
  const bestRoto = buildEndlessCardHtml({ open: true, next: 51, best: 'no es un número' });
  assert.ok(bestRoto.includes('primera incursión'), 'un récord ilegible es "primera incursión"');
  assert.ok(bestRoto.includes('data-stage="51"'), 'la etapa sí se puede jugar');
  // El diario sin fecha no se pinta, pero el ∞ sí.
  const sinFecha = buildStageList(fakeStages(10), {
    endless: endlessPayload({ daily: { stage: 57, bestScore: 100 } }),
  });
  assert.ok(sinFecha.includes('∞ CONTINUAR'), 'el ∞ no depende del diario');
  assert.ok(!sinFecha.includes('DESAFÍO'), 'sin fecha no hay reto del día');
});

test('fase 67: lo que viene del payload se escapa (no se inyecta HTML)', () => {
  const html = buildDailyCardHtml({
    open: true,
    daily: { date: '"><script>alert(1)</script>', stage: 57, bestScore: 0 },
  });
  assert.ok(!html.includes('<script>'), 'la fecha no puede abrir una etiqueta');
  assert.ok(html.includes('&lt;script&gt;'), 'se pinta escapada');
});

test('fase 67: el selector cablea el payload de _selectData()', () => {
  const hud = fakeHudLive();
  const data = { stages: fakeStages(10), endless: endlessPayload() };
  const conDatos = withFakeGame({ _selectData: () => data }, () => hud._screenSelectStage());
  assert.ok(conDatos.includes('∞ CONTINUAR'), 'la tarjeta ∞ llega a la pantalla');
  assert.ok(conDatos.includes('data-action="start-daily"'), 'y la del diario también');
  // Sin los datos del juego (fallback transitorio) no hay tarjetas.
  const sinDatos = hud._screenSelectStage();
  assert.ok(!sinDatos.includes('CONTINUAR'), 'el fallback es el de siempre');
});

test('fase 67: el STAGE CLEAR del ∞ muestra profundidad, récord, hito y CONTINUAR', () => {
  const hud = Object.create(HUD.prototype);
  const html = hud._screenStageClear({
    stageName: '∞ Stage 54', time: 90, score: 9000, clearBonus: 0, hpBonus: 0,
    lv: 6, cards: 4, kills: 120, hasNext: true,
    endless: { depth: 54, best: 54, next: 55, isRecord: true, milestone: true },
  });
  assert.ok(html.includes('PROFUNDIDAD'), 'la profundidad alcanzada se resume');
  assert.ok(html.includes('Etapa 54'), 'con el número real');
  assert.ok(html.includes('¡NUEVO RÉCORD!'), 'y se festeja el récord');
  assert.ok(html.includes('RÉCORD'), 'el récord histórico también');
  assert.ok(html.includes('HITO') && html.includes('×1,5 recompensa'),
    'el hito anuncia su multiplicador');
  assert.ok(html.includes('▶ CONTINUAR — ETAPA 55'), 'el botón continúa la profundidad');
  assert.ok(!html.includes('SIGUIENTE STAGE'), 'en el ∞ no se habla de "siguiente stage"');
  assert.ok(html.includes('data-action="retry"'), 'reintentar sigue igual');
});

test('fase 67: en campaña el resumen no cambia (SIGUIENTE STAGE, sin filas del ∞)', () => {
  const hud = Object.create(HUD.prototype);
  const html = hud._screenStageClear({
    stageName: 'Normal Stage 12', time: 60, score: 100, clearBonus: 0, hpBonus: 0,
    lv: 3, cards: 1, kills: 10, hasNext: true,
  });
  assert.ok(html.includes('▶ SIGUIENTE STAGE'), 'el botón de campaña no cambia');
  assert.ok(!html.includes('PROFUNDIDAD'), 'no hay filas del ∞');
  assert.ok(!html.includes('HITO'), 'ni hito');
  assert.ok(!html.includes('CAMPAÑA COMPLETA'), 'ni el cartel de final');
});

test('fase 67: el S50 convive con el cartel de campaña completa y el botón del ∞', () => {
  const hud = Object.create(HUD.prototype);
  const html = hud._screenStageClear({
    stageName: 'Meteorito Colosal', time: 60, score: 100, clearBonus: 0, hpBonus: 0,
    lv: 9, cards: 5, kills: 10, isFinal: true, hasNext: true,
    endless: { depth: 50, best: 50, next: 51, isRecord: true, milestone: false },
  });
  assert.ok(html.includes('¡CAMPAÑA COMPLETA! Seguí en el modo infinito'),
    'el final de la campaña invita a seguir');
  assert.ok(html.includes('▶ CONTINUAR — ETAPA 51'), 'y el botón arranca el ∞');
  assert.ok(html.includes('data-action="next-stage"'), 'con la acción que main ya maneja');
  assert.ok(!html.includes('×1,5 recompensa'), 'la 50 no es hito');
  // Mientras main.js no mande `isFinal`, el cartel se deduce del S50
  // (el único stage de la campaña que no es ∞): no se pierde la señal.
  const sinIsFinal = hud._screenStageClear({
    stageId: STAGES.length, stageName: 'Normal Stage 50', time: 60, score: 100,
    clearBonus: 0, hpBonus: 0, lv: 9, cards: 5, kills: 10, hasNext: true,
  });
  assert.ok(sinIsFinal.includes('¡CAMPAÑA COMPLETA!'), 'el cartel sale sin el campo nuevo');
});

test('fase 67: el score del día aparece en las DOS pantallas de fin de run', () => {
  const hud = Object.create(HUD.prototype);
  const daily = {
    date: '2026-10-26', stage: 57, score: 4321, best: 4321, isRecord: true, cleared: false,
  };
  const clear = hud._screenStageClear({
    stageName: '∞ Stage 57', time: 10, score: 4321, clearBonus: 0, hpBonus: 0,
    lv: 2, cards: 0, kills: 3, hasNext: true, daily,
  });
  assert.ok(clear.includes('DESAFÍO DIARIO'), 'la victoria diaria deja el reto a la vista');
  assert.ok(clear.includes('004321'), 'con el score del día formateado');
  assert.ok(clear.includes('¡RÉCORD DEL DÍA!'), 'y avisa si es el mejor de hoy');
  const over = hud._screenGameOver({
    stageName: '∞ Stage 57', score: 4321, kills: 3, time: 60, reason: 'hp', daily,
  });
  assert.ok(over.includes('DESAFÍO DIARIO'), 'la derrota diaria también (el score cuenta igual)');
  assert.ok(over.includes('004321'), 'con el mismo score');
  // Sin récord del día no se festeja nada.
  const sinRecord = hud._screenGameOver({
    stageName: '∞ Stage 57', score: 10, kills: 1, time: 20,
    daily: { ...daily, score: 10, best: 4321, isRecord: false },
  });
  assert.ok(!sinRecord.includes('¡RÉCORD DEL DÍA!'), 'un score peor no es récord');
});

test('fase 67: la derrota en el ∞ dice que NO castiga', () => {
  const hud = Object.create(HUD.prototype);
  // Caso REAL: se pierde la 58 y el récord sigue en la 57.
  const html = hud._screenGameOver({
    stageName: '∞ Stage 58', score: 500, kills: 9, time: 70, reason: 'hp',
    endless: { depth: 58, best: 57, next: 58 },
  });
  assert.ok(html.includes('MODO INFINITO'), 'el bloque se identifica');
  assert.ok(html.includes('PROFUNDIDAD') && html.includes('RÉCORD'), 'muestra los dos números');
  assert.ok(html.includes('Etapa 57'), 'el récord se muestra TAL CUAL (no se maquilla con la 58)');
  assert.ok(html.includes('Perder no baja el récord: seguís en la etapa 57.'), 'y explica que no retrocede');
  assert.ok(html.includes('Próxima: la 58.'), 'dice cuál es la próxima');
  assert.ok(!html.includes('×1,5 recompensa'), 'en derrota no hay hito que anunciar');
  // La campaña no pinta el bloque.
  const camp = hud._screenGameOver({ stageName: 'Normal Stage 3', score: 1, kills: 1, time: 2 });
  assert.ok(!camp.includes('MODO INFINITO'), 'una derrota de campaña queda igual');
});

// ============================================================
// fase 69 — EL PROTOCOLO DE ASEDIO (HEAT) EN EL HUD
//
// El heat es un ajuste PERSISTENTE, no una pantalla de arranque: entra
// por la tarjeta del selector y por el menú, se configura en su propia
// pantalla y se recuerda en el resumen. TODO llega calculado desde
// main.js (`_heatData()` / `summary.heat`): estos tests fijan que el HUD
// no invente números ni deje de pintar los que recibe.
// ============================================================

/** Payload de `_heatData()` como lo arma main.js (preset I activo). */
const heatPayload = (over = {}) => ({
  mods: { asedio: 2, leva: 1, vigor: 1, fragilidad: 1 },
  total: heatTotal({ asedio: 2, leva: 1, vigor: 1, fragilidad: 1 }),
  preset: 'I',
  rewardMul: 1.4,
  best: 12,
  conds: HEAT_CONDS,
  presets: HEAT_PRESETS.map((p) => ({ id: p.id, name: p.name, heat: heatTotal(p.mods) })),
  milestones: HEAT_MILESTONES,
  ...over,
});

/** Cuántas veces aparece `needle` en `html`. */
const countOf = (html, needle) => html.split(needle).length - 1;

test('fase 69: la pantalla del Protocolo pinta las 11 condiciones con sus ±', () => {
  const html = buildProtocolHtml(heatPayload());
  assert.ok(html.includes('PROTOCOLO DE ASEDIO'), 'la pantalla se identifica');
  assert.ok(html.includes('<span class="protocol-heat-value">5</span>'),
    'el heat TOTAL es el que manda main.js');
  assert.equal(countOf(html, 'data-action="heat-plus"'), HEAT_CONDS.length,
    'una fila por condición, con su +');
  assert.equal(countOf(html, 'data-action="heat-minus"'), HEAT_CONDS.length, 'y su −');
  for (const c of HEAT_CONDS) {
    assert.ok(html.includes(`data-cond="${c.id}"`), `falta el dial de ${c.id}`);
    assert.ok(html.includes(c.name), `falta el nombre de ${c.id}`);
    assert.ok(html.includes(c.desc), `falta la descripción de ${c.id}`);
  }
  // 23 pips = la suma de rangos del catálogo (4+3+3+2+2+2+2+1+1+1+2).
  assert.equal(countOf(html, '<i class="protocol-pip'), 23, 'hay un pip por rango posible');
  // El rango ACTIVO sale de `mods`: 2 (asedio) + 1 + 1 + 1 = 5 pips.
  assert.equal(countOf(html, 'class="protocol-pip on"'), 5, 'los rangos del preset encienden sus pips');
  // El coste que se muestra es el del PRÓXIMO rango (c.heat[rank]).
  assert.ok(html.includes('+1 heat'), 'asedio 2 → el rango 3 cuesta 1');
  assert.ok(html.includes('+2 heat'), 'prisa 0 → el rango 1 cuesta 2');
  assert.ok(html.includes('data-action="heat-close"'), 'y siempre hay salida');
  // En 0 el − no se puede tocar; en el tope, el +.
  const maxed = buildProtocolHtml(heatPayload({ mods: { apagon: 1 }, total: 3, preset: null }));
  assert.match(maxed, /data-action="heat-plus"\s+data-cond="apagon"[^>]*disabled/,
    'en el rango máximo no se puede subir');
  assert.ok(maxed.includes('máximo'), 'en el tope el coste dice "máximo"');
  assert.match(maxed, /data-action="heat-minus"\s+data-cond="asedio"[^>]*disabled/,
    'en rango 0 no se puede bajar');
});

test('fase 69: los 5 presets se pintan con su heat y el activo se marca', () => {
  const html = buildProtocolHtml(heatPayload());
  assert.equal(countOf(html, 'data-action="heat-preset"'), HEAT_PRESETS.length);
  for (const p of HEAT_PRESETS) {
    assert.ok(html.includes(`data-preset="${p.id}"`), `falta el preset ${p.id}`);
    assert.ok(html.includes(`${p.name} · Heat ${heatTotal(p.mods)}`), 'el botón dice su heat');
  }
  assert.match(html, /class="protocol-preset active"[^>]*data-preset="I"/,
    'el preset activo es el del payload');
  assert.ok(!html.includes('personalizado'), 'con preset no se dice "personalizado"');
  const custom = buildProtocolHtml(heatPayload({ preset: null, mods: { apagon: 1 }, total: 3 }));
  assert.ok(custom.includes('personalizado'), 'con preset null es un protocolo a medida');
  assert.ok(!/class="protocol-preset active"/.test(custom), 'ningún preset queda activo');
});

test('fase 69: sin datos el Protocolo avisa y no rompe', () => {
  for (const bad of [null, undefined, 0, 'x', {}, { conds: 'x', presets: 3, mods: 'x', total: 'x' }]) {
    assert.doesNotThrow(() => buildProtocolHtml(bad), `buildProtocolHtml(${bad}) lanzó`);
  }
  const sin = buildProtocolHtml(null);
  assert.ok(sin.includes('Protocolo no disponible'));
  assert.ok(sin.includes('data-action="heat-close"'), 'siempre hay salida');
  const roto = buildProtocolHtml({ conds: 'x', presets: 3, mods: 'x', total: 'x', best: NaN });
  assert.ok(!roto.includes('data-action="heat-plus"'), 'sin conds usables no hay filas');
  assert.ok(roto.includes('data-action="heat-close"'), 'y la salida sigue');
});

test('fase 69: la tarjeta PROTOCOLO va arriba del selector, con su récord', () => {
  const conHeat = buildStageList(fakeStages(50), { heat: { active: 8, best: 12 } });
  assert.ok(conHeat.includes('data-action="protocol"'), 'la tarjeta es un botón real');
  assert.ok(conHeat.includes('PROTOCOLO — HEAT 8'), 'dice el heat activo');
  assert.ok(conHeat.includes('récord: 12'), 'y el récord');
  assert.ok(conHeat.indexOf('stage-protocol') < conHeat.indexOf('stage-scroll'),
    'va arriba y fuera del scroll de las 50 filas');
  // Sin payload (fallback) NO se pinta.
  const antes = buildStageList(fakeStages(50));
  assert.ok(!antes.includes('data-action="protocol"'));
  assert.equal(buildProtocolCardHtml(null), '');
  assert.equal(buildProtocolCardHtml(undefined), '');
  // Sin récord se dice explícitamente (no un 0 engañoso).
  const sinRecord = buildProtocolCardHtml({ active: 0, best: 0 });
  assert.ok(sinRecord.includes('PROTOCOLO — HEAT 0'));
  assert.ok(sinRecord.includes('sin récord'));
  // Con las tres tarjetas, el PROTOCOLO va primero (ajuste global).
  const tres = buildStageList(fakeStages(10), {
    heat: { active: 5, best: 5 }, endless: endlessPayload(),
  });
  assert.ok(tres.indexOf('stage-protocol') < tres.indexOf('∞ CONTINUAR'),
    'el protocolo se lee antes que la continuación del ∞');
});

test('fase 69: la tarjeta del ∞ dice el heat y su récord por nivel', () => {
  const conHeat = buildEndlessCardHtml(endlessPayload({ heat: 8, bestAtHeat: 58 }));
  assert.ok(conHeat.includes('Heat 8 · récord 58'), 'el récord es el del heat jugado');
  assert.ok(!conHeat.includes('récord: etapa'), 'no se mezcla con la profundidad global');
  // Sin heat (o heat 0) el subtítulo es el de la fase 67.
  for (const endless of [endlessPayload(), endlessPayload({ heat: 0, bestAtHeat: 58 })]) {
    const html = buildEndlessCardHtml(endless);
    assert.ok(html.includes('récord: etapa 62'));
    assert.ok(!html.includes('Heat '), 'heat 0 no se anuncia');
  }
  // Heat sin récord propio: se dice "sin récord", no un 0.
  const nuevo = buildEndlessCardHtml(endlessPayload({ heat: 5, bestAtHeat: 0 }));
  assert.ok(nuevo.includes('Heat 5 · sin récord'));
});

test('fase 69: el resumen de victoria pinta heat, récord e hitos', () => {
  const hud = Object.create(HUD.prototype);
  const conHeat = hud._screenStageClear({
    stageName: 'Normal Stage 40', time: 60, score: 100, clearBonus: 0, hpBonus: 0,
    lv: 5, cards: 3, kills: 120, hasNext: true,
    heat: {
      heat: 10, best: 10, record: 10, isRecord: true,
      milestones: [5, 10], milestoneFrags: 120,
    },
  });
  assert.ok(conHeat.includes('<dt>HEAT</dt>'), 'la fila del heat jugado');
  assert.ok(conHeat.includes('¡NUEVO RÉCORD!'), 'y se festeja');
  assert.ok(conHeat.includes('<dt>RÉCORD DE HEAT</dt>'), 'el récord de la pista');
  assert.ok(conHeat.includes('<dt>HITOS</dt>'), 'los hitos cobrados');
  assert.ok(conHeat.includes('Heat 5 · Heat 10'), 'con los umbrales');
  assert.ok(conHeat.includes('+120 al pool'), 'y el bonus al pool de fragmentos');
  // Sin heat el resumen es el de la fase 68 (ni una fila nueva).
  const sinHeat = hud._screenStageClear({
    stageName: 'Normal Stage 12', time: 60, score: 100, clearBonus: 0, hpBonus: 0,
    lv: 3, cards: 1, kills: 10,
  });
  assert.ok(!sinHeat.includes('RÉCORD DE HEAT'));
  assert.ok(!sinHeat.includes('HITOS'));
  // Los hitos solo se anuncian al GANAR (en derrota no se cobran).
  const derrota = hud._screenGameOver({
    stageName: 'Normal Stage 40', score: 100, kills: 3, time: 40,
    heat: { heat: 10, best: 12, record: 12, milestones: [5], milestoneFrags: 60 },
  });
  assert.ok(derrota.includes('<dt>HEAT</dt>') && derrota.includes('<dt>RÉCORD DE HEAT</dt>'));
  assert.ok(!derrota.includes('<dt>HITOS</dt>'), 'en derrota no se cobran hitos');
});

test('fase 69: en la derrota se avisa que el récord no baja', () => {
  const hud = Object.create(HUD.prototype);
  const html = hud._screenGameOver({
    stageName: 'Normal Stage 40', score: 50, kills: 2, time: 30,
    heat: { heat: 8, record: 12 },
  });
  assert.ok(html.includes('el récord no baja'));
  assert.ok(html.includes('12'), 'el récord se mantiene a la vista');
});

test('fase 69: _heatData()/_screenProtocol() cablean el payload de main.js', () => {
  const hud = fakeHudLive();
  const conJuego = withFakeGame({ _heatData: () => heatPayload() }, () => hud._screenProtocol());
  assert.ok(conJuego.includes('PROTOCOLO DE ASEDIO'));
  assert.ok(conJuego.includes('data-action="heat-plus"'), 'la pantalla trae los diales');
  assert.ok(conJuego.includes('data-action="heat-close"'), 'y la salida');
  // Sin juego vivo (fallback transitorio) no se rompe.
  assert.ok(hud._screenProtocol().includes('Protocolo no disponible'));
});

test('fase 69: el selector cablea data.heat y el menú tiene la puerta', () => {
  const hud = fakeHudLive();
  const html = withFakeGame({
    _selectData: () => ({
      stages: fakeStages(10), endless: null, heat: { active: 8, best: 12 },
    }),
  }, () => hud._screenSelectStage());
  assert.ok(html.includes('data-action="protocol"'), 'el selector ofrece el protocolo');
  assert.ok(html.includes('PROTOCOLO — HEAT 8'));
  const menu = buildMenuScreen({ theme: 'neon', quality: 'alta' });
  assert.ok(menu.includes('data-action="protocol"'), 'y el menú, sin pasar por el selector');
});

test('fase 69: el HUD sella HEAT N durante la batalla y lo borra al salir', () => {
  const attrs = new Map();
  const stageName = {
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
  };
  const hud = Object.create(HUD.prototype);
  hud.root = null;
  hud.bottom = null;
  hud.el = { stageName };
  hud._hudVisible = true;
  withFakeGame({ runMods: { heat: 12 } }, () => hud.setPlaying(true));
  assert.equal(attrs.get('data-heat'), '12', 'el heat sale de game.runMods');
  hud.setPlaying(false);
  assert.ok(!attrs.has('data-heat'), 'al salir de la batalla no queda el sello');
  withFakeGame({ runMods: { heat: 0 } }, () => hud.setPlaying(true));
  assert.ok(!attrs.has('data-heat'), 'heat 0 no se anuncia');
  // Sin window (Node puro) tampoco se rompe.
  hud.setPlaying(true);
  assert.ok(!attrs.has('data-heat'));
});

test('fase 69: el CSS tiene la pantalla del Protocolo y el sello HEAT del HUD', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  for (const sel of [
    '.protocol-head', '.protocol-total', '.protocol-preset', '.protocol-row',
    '.protocol-pip', '.protocol-step', '.stage-protocol',
  ]) {
    assert.ok(css.includes(sel), `falta el estilo ${sel}`);
  }
  assert.ok(css.includes('#hud-stage-name[data-heat]::after'), 'el sello del stage existe');
  assert.ok(css.includes("content: ' · HEAT ' attr(data-heat)"), 'y escribe HEAT N');
});

// ============================================================
// fase 71 — SCROLL Y FOCO DEL PROTOCOLO
//
// Cada ± o preset re-renderiza la pantalla entera. La lista scrollea
// dentro de `.protocol-list`, así que el nodo nuevo nacía arriba y el
// botón pulsado desaparecía: el jugador que ajustaba una condición del
// final volvía al principio y perdía el foco. Estos helpers lo evitan.
// ============================================================

/** Botón falso con dataset y contador de focus(). */
const protocolButton = (dataset, disabled = false) => ({
  dataset,
  disabled,
  focused: 0,
  focus() { this.focused += 1; },
});

test('fase 71: readProtocolScroll/restoreProtocolScroll guardan la lista', () => {
  const list = { scrollTop: 210 };
  const root = { querySelector: (sel) => (sel === '.protocol-list' ? list : null) };
  assert.equal(readProtocolScroll(root), 210);
  assert.equal(readProtocolScroll(null), 0, 'sin raíz no hay scroll');
  assert.equal(readProtocolScroll({ querySelector: () => null }), 0, 'sin lista no hay scroll');
  restoreProtocolScroll(root, 240);
  assert.equal(list.scrollTop, 240);
  restoreProtocolScroll(root, 0);
  assert.equal(list.scrollTop, 240, '0 no pisa lo que ya estaba');
  restoreProtocolScroll(null, 10); // no explota
});

test('fase 71: readProtocolFocus/restoreProtocolFocus devuelven el foco al control', () => {
  const oldPlus = protocolButton({ action: 'heat-plus', cond: 'asedio' });
  const newPlus = protocolButton({ action: 'heat-plus', cond: 'asedio' });
  const newMinus = protocolButton({ action: 'heat-minus', cond: 'asedio' });
  const root = {
    ownerDocument: { activeElement: oldPlus },
    contains: (n) => n === oldPlus,
    querySelectorAll: () => [newMinus, newPlus],
  };
  const key = readProtocolFocus(root);
  assert.deepEqual(key, { action: 'heat-plus', cond: 'asedio' });
  assert.equal(restoreProtocolFocus(root, key), newPlus);
  assert.equal(newPlus.focused, 1, 'el + nuevo recupera el foco');
  // El + llegó al máximo y quedó disabled: el foco pasa al − de la fila.
  newPlus.disabled = true;
  assert.equal(restoreProtocolFocus(root, key), newMinus);
  assert.equal(newMinus.focused, 1);
  // Preset: se identifica por data-preset.
  const oldPreset = protocolButton({ action: 'heat-preset', preset: 'III' });
  const newPreset = protocolButton({ action: 'heat-preset', preset: 'III' });
  root.ownerDocument.activeElement = oldPreset;
  root.contains = (n) => n === oldPreset;
  root.querySelectorAll = () => [newPreset];
  const presetKey = readProtocolFocus(root);
  assert.deepEqual(presetKey, { action: 'heat-preset', preset: 'III' });
  assert.equal(restoreProtocolFocus(root, presetKey), newPreset);
  assert.equal(newPreset.focused, 1);
  // Un click fuera del overlay no inventa foco.
  root.contains = () => false;
  assert.equal(readProtocolFocus(root), null);
  assert.equal(restoreProtocolFocus(root, null), null);
});

test('fase 71: showScreen(PROTOCOLO) conserva scroll y foco al re-renderizar', () => {
  const hud = Object.create(HUD.prototype);
  hud.emitted = [];
  hud.engine = { emit: (ev, data) => hud.emitted.push({ ev, data }) };
  const fakeCls = { add() {}, remove() {}, toggle() {}, contains: () => false };
  hud.root = { classList: fakeCls, parentElement: { appendChild: () => {} } };
  hud.bottom = { classList: fakeCls };
  hud.cardModal = null;
  hud.comboPanel = null;
  hud._modalKind = null;
  hud._focusBeforeModal = null;
  hud._focusBeforeCombo = null;
  hud.el = {};
  hud._lastBossFrac = -1;
  hud._bossHidden = false;

  const oldPlus = protocolButton({ action: 'heat-plus', cond: 'asedio' });
  const newPlus = protocolButton({ action: 'heat-plus', cond: 'asedio' });
  const newMinus = protocolButton({ action: 'heat-minus', cond: 'asedio' });
  let list = { scrollTop: 210 };
  const root = {
    ownerDocument: { activeElement: oldPlus },
    contains: (n) => n === oldPlus,
    classList: fakeCls,
    get innerHTML() { return ''; },
    set innerHTML(_v) {
      list = { scrollTop: 0 }; // el nodo nuevo nace arriba
      root.buttons = [newMinus, newPlus];
    },
    querySelector: (sel) => (sel === '.protocol-list' ? list : null),
    querySelectorAll: () => root.buttons ?? [],
  };
  root.buttons = [newMinus, newPlus];
  hud.overlayRoot = root;

  hud.showScreen('PROTOCOLO');

  assert.equal(list.scrollTop, 210, 'la lista no vuelve al principio');
  assert.equal(newPlus.focused, 1, 'el botón pulsado conserva el foco');
});

// ============================================================
// fase 70 — SUPERVIVENCIA Y SALA DE RÉCORDS
//
// El arcade mide AGUANTE (oleadas), no profundidad. Como en el ∞ y el
// heat, el HUD no calcula NADA: los payloads de main.js llegan resueltos
// (`_selectData().survival`, `summary.survival` y `_recordsData()`) y acá
// solo se pintan. Sin payload no se inventa ninguna tarjeta.
// ============================================================

/** Payload del selector, como lo arma `_selectData().survival`. */
const survivalPayload = (over = {}) => ({ bestWave: 12, bestScore: 3456, runs: 7, ...over });

/** Payload de la sala de récords, como lo arma `_recordsData()`. */
const recordsPayload = (over = {}) => ({
  campaign: { cleared: 30, bestScore: 12345 },
  endless: { best: 62, next: 63 },
  heat: { best: 24, stage50: 8, next: 35 },
  survival: { bestWave: 18, bestScore: 9876, runs: 12, nextWave: 20 },
  daily: { date: '2026-10-26', bestScore: 5000 },
  ...over,
});

test('fase 70: la tarjeta de supervivencia dice el récord de oleadas', () => {
  const html = buildSurvivalCardHtml(survivalPayload());
  assert.ok(html.includes('data-action="start-survival"'), 'la tarjeta arranca el modo');
  assert.ok(html.includes('MODO ARCADE'), 'se identifica como el modo arcade');
  assert.ok(html.includes('SUPERVIVENCIA — OLEADA 12'), 'la métrica es la oleada');
  assert.ok(html.includes('récord: oleada 12'), 'y el récord se lee en la tarjeta');
  assert.ok(html.includes('003456'), 'con el score formateado como el resto del HUD');
  // Sin récord la run es NUEVA (decir "oleada 0" no es un número que batir).
  const nueva = buildSurvivalCardHtml({ bestWave: 0, bestScore: 0, runs: 0 });
  assert.ok(nueva.includes('SUPERVIVENCIA — NUEVA'));
  assert.ok(nueva.includes('sin récord'));
  assert.ok(nueva.includes('data-action="start-survival"'), 'y se puede jugar igual');
  // Sin datos no hay tarjeta.
  assert.equal(buildSurvivalCardHtml(null), '');
  assert.equal(buildSurvivalCardHtml(undefined), '');
});

test('fase 70: el selector pinta la tarjeta solo si hay payload', () => {
  const con = buildStageList(fakeStages(10), { survival: survivalPayload() });
  assert.ok(con.includes('data-action="start-survival"'), 'la tarjeta llega a la lista');
  assert.ok(con.includes('OLEADA 12'));
  const sin = buildStageList(fakeStages(10));
  assert.ok(!sin.includes('start-survival'), 'sin payload el selector es el de siempre');
  assert.ok(!sin.includes('SUPERVIVENCIA'), 'ni un rótulo inventado');
});

test('fase 70: el selector cablea data.survival de _selectData()', () => {
  const hud = fakeHudLive();
  const html = withFakeGame({
    _selectData: () => ({ stages: fakeStages(10), survival: survivalPayload() }),
  }, () => hud._screenSelectStage());
  assert.ok(html.includes('data-action="start-survival"'), 'el payload llega a la pantalla');
  // Sin juego vivo (fallback transitorio) no hay tarjeta ni excepción.
  assert.ok(!hud._screenSelectStage().includes('start-survival'));
});

test('fase 70: el HUD de batalla escribe "Supervivencia · Oleada N"', () => {
  const hud = Object.create(HUD.prototype);
  const stageName = { textContent: '' };
  hud.root = null;
  hud.bottom = null;
  hud.el = { stageName };
  hud._survivalWave = 0;
  hud._lastStageName = 'Supervivencia';
  hud.setSurvivalWave(7);
  assert.equal(stageName.textContent, 'Supervivencia · Oleada 7');
  assert.equal(hud._stageNameText('Supervivencia'), 'Supervivencia · Oleada 7',
    'render() reescribe la oleada, no el nombre pelado');
  hud.setSurvivalWave(0);
  assert.equal(stageName.textContent, 'Supervivencia', 'sin oleada queda el nombre del modo');
  // En campaña el nombre del HUD sigue siendo el compacto de siempre.
  assert.equal(hud._stageNameText('Normal Stage 12'), 'STAGE 12');
});

test('fase 70: setSurvivalWave no pisa el sello de heat', () => {
  const attrs = new Map();
  const stageName = {
    textContent: '',
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
  };
  const hud = Object.create(HUD.prototype);
  hud.root = null;
  hud.bottom = null;
  hud.el = { stageName };
  hud._survivalWave = 0;
  withFakeGame({ runMods: { heat: 10 } }, () => hud.setPlaying(true));
  hud._lastStageName = 'Supervivencia';
  hud.setSurvivalWave(9);
  assert.equal(stageName.textContent, 'Supervivencia · Oleada 9');
  assert.equal(attrs.get('data-heat'), '10', 'el badge del protocolo sigue puesto');
  hud.setSurvivalWave(0);
  assert.equal(attrs.get('data-heat'), '10', 'y no se borra al cambiar de oleada');
});

test('fase 70: el resumen de la derrota pinta la run de arcade', () => {
  const hud = Object.create(HUD.prototype);
  const html = hud._screenGameOver({
    stageName: 'Supervivencia', score: 4321, kills: 40, time: 300, reason: 'hp',
    fragsLost: 30, goldLost: 5, lv: 9, cards: 12,
    survival: {
      wave: 14, best: 14, isRecord: true, score: 4321, runs: 8,
      heat: 5, rewardFrags: 16, rewardGold: 4,
    },
  });
  assert.ok(html.includes('MODO ARCADE'), 'el bloque se identifica');
  assert.ok(html.includes('<dt>OLEADA</dt>'), 'hasta qué oleada llegó');
  assert.ok(html.includes('¡NUEVO RÉCORD!'), 'y se festeja el récord');
  assert.ok(html.includes('<dt>RÉCORD</dt>'), 'el récord histórico');
  assert.ok(html.includes('<dt>RUNS</dt>') && html.includes('8'), 'y las runs jugadas');
  assert.ok(html.includes('<dt>HEAT</dt>'), 'el heat de la run, si lo hubo');
  assert.ok(html.includes('+16 al pool') && html.includes('+4 oro'), 'la recompensa por oleadas nuevas');
  // Va ANTES de "LO QUE LOGRASTE" (que sigue intacto).
  assert.ok(html.indexOf('survival-result') < html.indexOf('LO QUE LOGRASTE'),
    'el bloque del modo va arriba del resumen de la run');
  // Una derrota de campaña queda igual.
  const camp = hud._screenGameOver({ stageName: 'Normal Stage 3', score: 1, kills: 1, time: 2 });
  assert.ok(!camp.includes('survival-result'), 'la campaña no pinta el bloque');
  assert.ok(!camp.includes('<dt>RUNS</dt>'));
  // Run que no supera el récord: no se promete recompensa.
  const sinPago = hud._screenGameOver({
    stageName: 'Supervivencia', score: 10, kills: 1, time: 9,
    survival: { wave: 3, best: 9, isRecord: false, runs: 2 },
  });
  assert.ok(!sinPago.includes('RECOMPENSA'), 'repetir una oleada baja no paga');
  assert.ok(!sinPago.includes('¡NUEVO RÉCORD!'));
});

test('fase 70: la sala de récords pinta los cinco modos y sus hitos', () => {
  const html = buildRecordsHtml(recordsPayload());
  for (const modo of ['CAMPAÑA', 'INFINITO', 'PROTOCOLO', 'SUPERVIVENCIA', 'DESAFÍO DIARIO']) {
    assert.ok(html.includes(modo), `falta la fila ${modo}`);
  }
  assert.ok(html.includes('Etapa 30 de 50'), 'la campaña dice por dónde va');
  assert.ok(html.includes('30/50 etapas'), 'y su avance es el próximo hito');
  assert.ok(html.includes('Etapa 62') && html.includes('Etapa 63'), 'el ∞: récord y siguiente');
  assert.ok(html.includes('Heat 24') && html.includes('Heat 35'), 'el protocolo: récord y siguiente heat');
  assert.ok(html.includes('Oleada 18') && html.includes('Oleada 20'), 'la supervivencia: oleada y próximo hito');
  assert.ok(html.includes('score 005000') && html.includes('2026-10-26'), 'el diario, con su score y fecha');
  assert.ok(html.includes('data-action="menu"'), 'la salida es `menu` (main ya la entiende)');
  assert.ok(html.includes('data-action="select-stage"'), 'y el atajo a jugar');
});

test('fase 70: la sala de récords no rompe sin datos ni con basura', () => {
  assert.doesNotThrow(() => buildRecordsHtml(null));
  assert.ok(buildRecordsHtml(null).includes('Récords no disponibles'));
  assert.ok(buildRecordsHtml(null).includes('data-action="menu"'));
  // Payload vacío: las CINCO filas igual (con guiones), nunca una pantalla vacía.
  const vacio = buildRecordsHtml({});
  for (const modo of ['CAMPAÑA', 'INFINITO', 'PROTOCOLO', 'SUPERVIVENCIA', 'DESAFÍO DIARIO']) {
    assert.ok(vacio.includes(modo), `la fila ${modo} no puede desaparecer`);
  }
  assert.ok(vacio.includes('sin récord'));
  // fase 75: sin `next`, el ∞ empieza en la 51, no en la 1.
  assert.ok(vacio.includes('Etapa 51'), 'el fallback del ∞ debe ser la etapa 51');
  assert.doesNotThrow(() => buildRecordsHtml({ campaign: 'basura', survival: 12 }));
});

test('fase 70: _screenRecords() cablea _recordsData() y el menú tiene la puerta', () => {
  const hud = fakeHudLive();
  const conJuego = withFakeGame(
    { _recordsData: () => recordsPayload() },
    () => hud._screenRecords(),
  );
  assert.ok(conJuego.includes('record-row'), 'la pantalla trae las filas');
  assert.ok(conJuego.includes('Oleada 18'));
  // Sin juego vivo (fallback transitorio) no se rompe.
  assert.ok(hud._screenRecords().includes('Récords no disponibles'));
  assert.ok(buildMenuScreen({ theme: 'neon', quality: 'alta' }).includes('data-action="records"'),
    'el menú ofrece la sala de récords');
});

test('fase 70: el CSS tiene la tarjeta, el bloque del resumen y la sala', () => {
  for (const sel of [
    '.stage-survival', '.survival-result', '.records-panel', '.records-grid',
    '.record-row', '.record-best', '.record-next',
  ]) {
    assert.ok(css.includes(sel), `falta el estilo ${sel}`);
  }
});

// ============================================================
// fase 72 — CRÉDITOS Y LICENCIAS
//
// La pantalla existe por una razón LEGAL, no estética: el icono del
// Ultimate es CC BY 3.0 (Lorc / game-icons.net) y la atribución tiene que
// verse en la obra distribuida. Estos tests fijan los campos que la
// licencia exige, el orden (CC BY primero) y que los textos viajen
// EMBEBIDOS (el juego es offline: no hay fetch).
// ============================================================

test('fase 72: los créditos listan las cuatro licencias y sus titulares', () => {
  const html = buildCreditsHtml();
  for (const s of ['MIT', 'CC BY 3.0', 'CC0 1.0', 'SIL Open Font License 1.1',
    'Lorc', 'Kenney', 'BenHickling', 'Javier Lust']) {
    assert.ok(html.includes(s), `falta «${s}» en la pantalla de créditos`);
  }
});

test('fase 72: la atribución CC BY 3.0 trae autor, obra, fuente, licencia y cambio', () => {
  const html = buildCreditsHtml();
  assert.ok(html.includes('Lorc'), 'autor (§4 b i)');
  assert.ok(html.includes('Power Lightning'), 'título de la obra (§4 b ii)');
  assert.ok(html.includes('power-lightning'), 'el slug identifica el asset original');
  assert.ok(html.includes('https://game-icons.net/1x1/lorc/power-lightning.html'),
    'URI de origen (§4 b iii)');
  assert.ok(html.includes('https://creativecommons.org/licenses/by/3.0/'),
    'URI de la licencia (§4 a)');
  assert.ok(html.includes('Recoloreado'), 'el cambio realizado (§4 b iv: es una adaptación)');
  assert.ok(html.includes('icon_ultimate_gold.png'), 'la miniatura muestra la obra EN USO');
});

test('fase 72: el bloque CC BY va ANTES que los créditos CC0', () => {
  const html = buildCreditsHtml();
  assert.ok(html.indexOf('CC BY 3.0') < html.indexOf('CC0 1.0'),
    '§4 b: el crédito CC BY tiene que ser al menos tan prominente como los demás');
  assert.ok(html.indexOf('credits-attrib-main') < html.indexOf('Kenney'),
    'el bloque destacado es el de Lorc');
});

test('fase 72: los textos legales completos van EMBEBIDOS (offline, sin red)', () => {
  const html = buildCreditsHtml();
  assert.ok(html.includes('Attribution 3.0 Unported'), 'legal code de CC BY 3.0');
  assert.ok(html.includes('SIL OPEN FONT LICENSE Version 1.1'), 'texto de OFL 1.1');
  assert.ok(html.includes('MIT License'), 'texto de MIT');
  // Tres <details> (MIT, CC BY 3.0 y OFL 1.1); CC0 no exige texto.
  assert.equal((html.match(/<details class="credits-legal-box">/g) ?? []).length, 3);
  assert.ok(!html.includes('fetch('), 'la pantalla no puede depender de la red');
});

test('fase 72: _screenCredits() envuelve el builder y el menú ofrece la puerta', () => {
  const hud = fakeHudLive();
  // No necesita `window` ni juego vivo: el contenido es estático.
  const html = hud._screenCredits();
  assert.ok(html.includes('credits-panel'), 'usa el panel de la pantalla');
  assert.ok(html.includes('data-action="menu"'), 'la salida es `menu` (main ya la entiende)');
  assert.ok(buildMenuScreen({ theme: 'neon', quality: 'alta' }).includes('data-action="credits"'),
    'el menú principal ofrece la pantalla de créditos');
});

test('fase 72: el CSS tiene el panel, el área scrolleable y el bloque CC BY', () => {
  for (const sel of [
    '.credits-panel', '.credits-scroll', '.credits-section', '.credits-attrib',
    '.credits-attrib-main', '.credits-legal', '.credits-url', '.credits-icon',
  ]) {
    assert.ok(css.includes(sel), `falta el estilo ${sel}`);
  }
  const sc = cssRule('.credits-scroll');
  assert.ok(sc.includes('overflow-y: auto'), 'el área de créditos scrollea');
  assert.ok(sc.includes('touch-action: pan-y'), 'scroll táctil sin rebote lateral');
  assert.ok(sc.includes('max-height'), 'el panel no puede empujar el VOLVER fuera del marco');
});







