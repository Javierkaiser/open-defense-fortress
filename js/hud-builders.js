// =============================================================================
// hud-builders.js — markup y helpers puros del HUD
// -----------------------------------------------------------------------------
// Extraído de hud.js (fase 75). Sin clase ni estado: funciones que reciben
// datos y devuelven HTML/strings. hud.js reexporta todo para tests/main.
// =============================================================================

// ============================================================
// hud.js — clase HUD (dev-1 → dev-4 → dev-5)
// HUD DOM superior/inferior (§4.4) + pantallas overlay (§2.10)
// con DATOS REALES de la run (score, bonus desglosado, Lv,
// kills). Badge de racha con pop, botón ultimate y barra de
// jefe con banner BOSS + xN (D11) ya vivos.
// Importa audio.js/meta.js/theme.js/stages.js (regla §1.1: nunca
// hud/cards/main). stages.js es un módulo de DATOS puros: de ahí sale
// el nº real de stages (el tagline del menú) y el tema de cada uno.
// ============================================================

import { AudioManager } from './audio.js';
import { VERSION } from './version.js';
import { STAGES } from './stages.js';
// fase 72: los créditos y los TEXTOS LEGALES embebidos. Módulo de datos puro
// (cero imports, cero DOM): la pantalla CREDITS se arma sin payload y sin red.
import { LICENSES, ATTRIBUTIONS, FONTS, CODE } from './licenses.js';
// dev-7 fase 37: el ancho LÓGICO del canvas, para saber si el marco
// (DOM) es más estrecho que el diseño y hay que compactar el HUD.
import { CONFIG } from './engine.js';
import {
  META_TOWERS, META_MAX_LEVEL, META_RANKS,
  META_PLAYER_NAME, META_FRAG_PER_VICTORY, META_DMG_PER_LEVEL, META_GOLD_START,
  loadMeta, fragCost, metaGold, metaDmgMul, playerRank,
  totalMetaLevels, renderTowerIcon, upgradeTower,
  PERKS, PERK_TIERS, PERK_EVERY, PERK_RESET_COST,
  pendingPerkTiers, tierAtLevel, getPerkOptions, setPerkChoice, resetPerks,
  // dev-7 fase 59.4: el meta invisible (el jugador nunca sabía que
  // podía subir sus torretas) — "SUBIR TODO" + el aviso de pendientes.
  pendingUpgrades, pendingUpgradeCost, upgradeAllTowers,
} from './meta.js';
import { THEMES, loadTheme, saveTheme, applyThemeToGame } from './theme.js';
import { QUALITY_LEVELS, loadQuality, saveQuality, applyQualityToContext, applyQualityToDom, particleCapFor } from './quality.js';
import { resetProgress } from './progress.js';
import { resetMeta } from './meta.js';
// dev-7 fase 64: el TOPE de nivel de una etapa (`MAX_LEVEL_PER_STAGE`, el
// techo de cartas de score.js). Sin ciclo: score.js sólo importa stages.js
// (la regla §1.1 sigue viva — hud.js nunca importa main.js/cards.js).
import { MAX_LEVEL_PER_STAGE } from './score.js';
// dev-7 fase 32: tipos de daño (glifo por unidad + leyenda de la matriz).
// oleadas-dinámicas: ENEMY_FAMILIES da el nombre legible de cada familia
// para el sesgo de etapa del selector ("roca / virus").
import { DAMAGE_TYPES, ENEMY_FAMILIES, buildDamageLegendHtml, buildBestiaryHtml } from './damagetypes.js';
// dev-7 fase 40: el bestiario dibuja al ENEMIGO de verdad (el mismo
// render que la partida) en un canvasito.
import { renderEnemyIcon } from './enemies.js';
// oleadas-dinámicas: `ENEMY_VARIANTS` (las variantes de élite) para el
// bestiario. Va por NAMESPACE a propósito: la tabla la escribe WS-B, y un
// `import { ENEMY_VARIANTS }` reventaría el módulo ENTERO al enlazar
// mientras el símbolo no exista. Con el namespace, si falta es
// `undefined` y el bestiario simplemente no pinta la sección.
import * as enemyModule from './enemies.js';
// oleadas-dinámicas: `campaignPoolForStage` (sesgo real por etapa) para el
// selector de etapa. Mismo criterio: namespace, porque el director lo
// escribe WS-A y el HUD no puede romperse por un dato que aún no llega
// (ver stageFamilyOf()).
import * as waves from './waves.js';

// ============================================================
// dev-7 fase 41 — UN SOLO LENGUAJE DE ICONOS: SVG inline
//
// Antes la UI mezclaba TRES lenguajes: sprites PNG (pausa, ultimate),
// EMOJI del sistema (🗼 👾 📊 ⚔️ 🏠 en la nav; 🃏 y ♪ en el HUD) y
// glifos geométricos. Los emoji se dibujan DISTINTO en cada
// plataforma y en la misma fila unos salían en color y otros en
// línea (el 🗼 coloreado y sus vecinos en contorno): la nav era
// ilegible.
//
// Ahora TODOS los iconos de la UI son SVG INLINE dibujados con el
// mismo estilo de línea (tipo Lucide): viewBox 24×24, sin relleno,
// `stroke="currentColor"` (el color lo pone el CSS) y trazo 1,8.
// Un mismo SVG sirve para cualquier color: los de la nav en teal, los
// del HUD en teal, los de los botones en blanco.
//
// Los SVGs van INLINE (no hay ficheros de imagen nuevos: un PNG no se
// puede recolorear) y se declaran UNA sola vez aquí, en UI_ICONS.
// El HUD de index.html los copia a mano (el único módulo de la
// página es main.js: no se puede importar JS desde el HTML).
// ============================================================

/**
 * Envuelve un icono de TRAZOS en el <svg> con el estilo del proyecto.
 * @param {string} paths los <path>/<circle>/<rect> del dibujo
 * @returns {string} HTML del <svg>
 */
export function svgIcon(paths) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'
    + ` aria-hidden="true">${paths}</svg>`;
}

/**
 * Los iconos de la interfaz (SVG inline, estilo de línea).
 *
 * Formas (todas legibles a 20 px):
 *  - torreta:    torre de cúpula con el cañón saliendo en diagonal.
 *  - bestiario:  un ojo (lente almondada + pupila).
 *  - progreso:   tres barras de distinta altura sobre una base.
 *  - batalla:    una mira (cruz con círculo).
 *  - menu:       una casa (techo + paredes + puerta).
 *  - cartas:     dos rectángulos redondeados apilados (dos cartas).
 *  - musica:     un altavoz con dos ondas de sonido.
 *  - aviso:      un triángulo con el signo de exclamación.
 *  - reloj:      una esfera con manecillas (el timer del HUD).
 *  - telefono:   un teléfono vertical (el aviso de "girá el móvil").
 */
export const UI_ICONS = {
  // Torreta: base + cuerpo de cúpula + cañón en diagonal con la boca.
  torreta: svgIcon(
    '<path d="M4.5 21h15"/>'
    + '<path d="M8 21v-5.5a4 4 0 0 1 8 0V21"/>'
    + '<path d="M13.2 13.8 19.8 7.2"/>'
    + '<path d="M18 6 20.8 8.8"/>',
  ),
  // Bestiario: un ojo.
  bestiario: svgIcon(
    '<path d="M2.5 12s3.6-6.5 9.5-6.5S21.5 12 21.5 12s-3.6 6.5-9.5 6.5S2.5 12 2.5 12z"/>'
    + '<circle cx="12" cy="12" r="3"/>',
  ),
  // Progreso: tres barras de distinta altura.
  progreso: svgIcon(
    '<path d="M3.5 20.5h17"/>'
    + '<path d="M7 17v3.5"/>'
    + '<path d="M12 13v7.5"/>'
    + '<path d="M17 7v13.5"/>',
  ),
  // Batalla: una mira (cruz + círculo).
  batalla: svgIcon(
    '<circle cx="12" cy="12" r="7"/>'
    + '<path d="M12 2.5v3"/>'
    + '<path d="M12 18.5v3"/>'
    + '<path d="M2.5 12h3"/>'
    + '<path d="M18.5 12h3"/>',
  ),
  // Menú: una casa.
  menu: svgIcon(
    '<path d="m3 9.5 9-7 9 7V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'
    + '<path d="M9.5 22V13h5v9"/>',
  ),
  // Lista de combos: dos cartas apiladas.
  cartas: svgIcon(
    '<rect x="8.5" y="2.5" width="13" height="13" rx="2.5"/>'
    + '<rect x="2.5" y="8.5" width="13" height="13" rx="2.5"/>',
  ),
  // Música: altavoz + dos ondas.
  musica: svgIcon(
    '<path d="M4 9.5h3L11 5.5v13L7 14.5H4z"/>'
    + '<path d="M14.5 9.2a4 4 0 0 1 0 5.6"/>'
    + '<path d="M17.5 6.5a8 8 0 0 1 0 11"/>',
  ),
  // Aviso: triángulo con exclamación.
  aviso: svgIcon(
    '<path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'
    + '<path d="M12 9v4"/>'
    + '<path d="M12 17h.01"/>',
  ),
  // Reloj del HUD.
  reloj: svgIcon(
    '<circle cx="12" cy="12" r="9"/>'
    + '<path d="M12 7v5l3.2 2"/>',
  ),
  // Teléfono (aviso de "girá el móvil").
  telefono: svgIcon(
    '<rect x="7" y="2" width="10" height="20" rx="2.5"/>'
    + '<path d="M10.8 18.5h2.4"/>',
  ),
};

/**
 * dev-7 fase 32: el distintivo de TIPO de daño de una unidad (glifo +
 * color). Se usa en el panel de combos para que el jugador sepa contra
 * qué familia de enemigos rinde cada torre.
 * @param {string|null} dmgType id del tipo de daño
 * @returns {string} HTML del distintivo ('' si no hay tipo)
 */
export function typeBadgeHtml(dmgType) {
  const t = DAMAGE_TYPES[dmgType];
  if (!t) return '';
  return `<span class="dmg-badge" style="--dmg-color:${t.color}" title="Tipo de daño: ${t.name} — ${t.desc}">${t.glyph}</span>`;
}

export const fmt = (n) => String(Math.floor(Math.max(0, n))).padStart(6, '0');
export const fmtTime = (s) => {
  const t = Math.max(0, Math.floor(s ?? 0));
  return `${String((t / 60) | 0).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * Tope TOTAL de niveles meta (todas las torretas × tope por torreta).
 * Derivado de los DATOS: el número de torretas nunca se hardcodea (bug
 *-fix: el HUD decía "9 torretas" y "/900" cuando ya había 11 torretas).
 */
export const META_TOTAL_MAX_LEVELS = META_TOWERS.length * META_MAX_LEVEL;

/** Escapa texto para interpolarlo dentro de un atributo HTML (title="…"). */
export const attr = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Escapa texto para interpolarlo como CONTENIDO HTML (no atributo). */
export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

// ============================================================
// Helpers PUROS del HUD (testeables en Node, sin DOM)
// ============================================================

/**
 * Badge del RANGO del jugador (fase 28). Antes era un contador de
 * niveles: `playerLevel()` ya devuelve el NÚMERO de rango (1..6), o sea
 * un número que no dice nada ("3" no explica que sos "Guardia"). Ahora
 * el badge muestra el NOMBRE del rango con su color, y el texto de
 * abajo el UMBRAL de victorias (de dónde viene el rango y qué falta
 * para el siguiente).
 *
 * @param {object} meta estado meta (crudo o normalizado)
 * @returns {{id:string,name:string,color:string,min:number,text:string,next:string|null}}
 */
export function buildRankBadge(meta) {
  const rank = playerRank(meta);
  const next = META_RANKS[META_RANKS.indexOf(rank) + 1] ?? null;
  return {
    id: rank.id,
    name: rank.name,
    color: rank.color,
    min: rank.min,
    // Umbral del rango actual: desde dónde se tiene este título.
    text: `${rank.name} · ${rank.min} victorias`,
    // Umbral del rango siguiente: qué falta para subir.
    next: next ? `${next.name} · ${next.min} victorias` : null,
  };
}

// ============================================================
// Selector de STAGES: lista agrupada por DÉCADAS (T1)
// ============================================================

/** Tamaño de cada bloque del selector (grupos de 10 stages). */
export const STAGE_GROUP_SIZE = 10;

/**
 * Color de acento por TEMA de stage: el punto de color que da
 * IDENTIDAD a cada fila (50 filas idénticas no se distinguían).
 * Los valores salen de la paleta de los temas del canvas (engine.js).
 */
export const STAGE_THEME_COLORS = {
  volcanic: '#E8641F',
  volcanic2: '#D07818',
  graveyard: '#7E93A8',
  nightcity: '#35C8FF',
  core: '#FF3018',
};

/** Tema de cada stage (id → tema), leído de los DATOS (stages.js). */
export const STAGE_THEME_BY_ID = new Map(STAGES.map((s) => [s.id, s.theme]));

/**
 * Color de acento de un stage (por id). Si el theme no está en el mapa
 * (o el id no existe), cae al teal del HUD.
 *
 * @param {number} id id del stage
 * @returns {string} color CSS (#rrggbb)
 */
export function stageThemeColor(id) {
  return STAGE_THEME_COLORS[STAGE_THEME_BY_ID.get(id)] ?? '#35E0C8';
}

/** Número de un stage (su id) o el índice de la lista como respaldo. */
export const stageNumber = (stage, fallback) => {
  const n = Number(stage?.id);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Agrupa los stages en BLOQUES de 10 (décadas) para que la lista de 50
 * filas no sea una pared idéntica: cada bloque lleva su cabecera
 * ("STAGES 1–10", "STAGES 11–20"…) y sus filas.
 *
 * FUNCIÓN PURA (testeable en Node, sin DOM): no muta la entrada y con
 * la misma entrada devuelve siempre la misma salida.
 *
 * @param {Array<{id?:number}>} stages lista de stages (en orden)
 * @param {number} [groupSize] tamaño del bloque (10 por defecto)
 * @returns {Array<{from:number,to:number,label:string,rows:Array}>}
 *   `from`/`to` son los números de stage del bloque y `label` su RANGO
 *   ("1–10", "11–20", "41–50"). Con menos stages de los que entran en un
 *   bloque, el rango refleja los ids reales ("1–3").
 */
/**
 * Nombre compacto del stage para la barra de HUD (fase 29).
 *
 * El HUD tiene ~84 px útiles para el título (entre los 4 botones
 * redondos de la izquierda y la píldora de Lv de la derecha) y
 * "Normal Stage 12" necesita 126 px: o se salía debajo de los botones
 * (tapando la "N") o se cortaba con ellipsis ("Normal ...").
 *
 * En el HUD va el NÚMERO del stage —que es lo que el jugador necesita
 * para orientarse— y el nombre completo sigue en las pantallas de
 * pausa, victoria y derrota.
 *
 * @param {string} name nombre del stage ("Normal Stage 12")
 * @returns {string} etiqueta compacta ("STAGE 12")
 */
export function compactStageName(name) {
  const m = /^Normal Stage (\d+)$/.exec(String(name ?? '').trim());
  return m ? `STAGE ${m[1]}` : String(name ?? '');
}

export function buildStageGroups(stages = [], groupSize = STAGE_GROUP_SIZE) {
  const list = Array.isArray(stages) ? stages : [];
  const size = Math.max(1, Math.floor(groupSize) || STAGE_GROUP_SIZE);
  const groups = [];
  for (let i = 0; i < list.length; i += size) {
    const rows = list.slice(i, i + size);
    const from = stageNumber(rows[0], i + 1);
    const to = stageNumber(rows[rows.length - 1], i + rows.length);
    groups.push({ from, to, label: `${from}–${to}`, rows });
  }
  return groups;
}

// ============================================================
// oleadas-dinámicas — EL SESGO DE FAMILIA DE LA ETAPA (design §Decisión 5)
//
// El director reparte los enemigos por FAMILIA con un lean por década
// (los pesos de `campaignPoolForStage`, js/waves.js). Ese sesgo no se leía en
// ninguna parte, y el jugador decide en el SELECTOR DE ETAPA contra qué
// se va a enfrentar: ahí es donde tiene que verlo.
// ============================================================

/**
 * A partir de qué peso relativo una segunda familia merece salir en el
 * rótulo del bloque (un cuarto de la etapa). Con menos, se nombra sólo la
 * dominante: un rótulo de 3 familias ya no es "corto".
 */
export const STAGE_FAMILY_SECOND_SHARE = 0.25;

/**
 * El sesgo de familia de una etapa, en TEXTO CORTO ("roca / virus").
 *
 * Nombra la familia dominante y, si pesa al menos un cuarto, la segunda
 * —con el nombre legible de `ENEMY_FAMILIES` (el mismo del bestiario),
 * en minúscula.
 *
 * FUNCIÓN PURA (testeable sin DOM): lee la pool que le pasen, no toca el
 * director.
 *
 * @param {Array<{family?:string, weight?:number}>} pool pool de la etapa
 * @returns {string|null} el sesgo ("roca / virus") o null si no hay pool
 */
export function stageFamilyText(pool) {
  const list = Array.isArray(pool) ? pool : [];
  const weights = new Map();
  let total = 0;
  for (const entry of list) {
    const id = entry?.family;
    const w = Number(entry?.weight);
    if (!ENEMY_FAMILIES[id] || !Number.isFinite(w) || w <= 0) continue;
    weights.set(id, (weights.get(id) ?? 0) + w);
    total += w;
  }
  if (total <= 0) return null;
  return [...weights.entries()]
    .map(([id, w]) => ({ id, share: w / total }))
    .sort((a, b) => b.share - a.share)
    .filter((f, i) => i === 0 || f.share >= STAGE_FAMILY_SECOND_SHARE)
    .slice(0, 2)
    .map((f) => ENEMY_FAMILIES[f.id].name.toLowerCase())
    .join(' / ');
}

/**
 * La etiqueta del sesgo de un BLOQUE del selector ('' si no hay dato).
 *
 * El bloque es una DÉCADA y el sesgo del director también (biomas por
 * década): la cabecera es su sitio natural — repetir el rótulo en las 10
 * filas sería ruido (cada fila ya lleva su punto de tema, su insignia de
 * JEFE y su récord).
 *
 * El resolutor llega por parámetro (`familyOf`) para que este builder
 * siga siendo puro y testeable: si no hay resolutor, no hay etiqueta.
 *
 * @param {object|undefined} stage el primer stage del bloque
 * @param {((stage:object)=>string|null)|null} familyOf resolutor del sesgo
 * @returns {string} " · roca / virus" o ''
 */
export function stageFamilyTag(stage, familyOf) {
  if (typeof familyOf !== 'function' || !stage) return '';
  let text = null;
  try { text = familyOf(stage); } catch (_err) { text = null; }
  return text ? `<span class="stage-group-fam"> · ${esc(text)}</span>` : '';
}

/**
 * El sesgo de familia de un stage del selector, con las defensas de WS-A:
 * si el director todavía no expone `campaignPoolForStage` (o revienta con una
 * etapa rara) el selector se pinta igual, sin la etiqueta. El HUD nunca se
 * rompe por un dato que falta.
 *
 * La etapa va por NÚMERO (su id): el director indexa sus biomas por etapa,
 * como `bossForStage`.
 *
 * @param {object} stage fila del selector ({id, name, …})
 * @returns {string|null} el sesgo o null
 */
export function stageFamilyOf(stage) {
  const poolOf = typeof waves.campaignPoolForStage === 'function'
    ? waves.campaignPoolForStage
    : waves.poolForStage;
  if (typeof poolOf !== 'function') return null;
  try { return stageFamilyText(poolOf(stage?.id)); } catch (_err) { return null; }
}

/**
 * Filas que deben destacar en el selector: la del MEJOR récord y la
 * SIGUIENTE disponible (la primera desbloqueada que todavía no tiene
 * récord; si todas tienen, la última desbloqueada).
 *
 * FUNCIÓN PURA (testeable sin DOM).
 *
 * @param {Array<{id?:number,unlocked?:boolean,bestScore?:number|null}>} stages
 * @returns {{bestId:number|null, nextId:number|null}}
 */
export function findStageHighlights(stages = []) {
  const list = Array.isArray(stages) ? stages : [];
  let bestId = null;
  let bestScore = -Infinity;
  for (const s of list) {
    if (!s?.unlocked || s.bestScore == null) continue;
    const v = Number(s.bestScore);
    if (!Number.isFinite(v) || v <= bestScore) continue;
    bestScore = v;
    bestId = s.id ?? null;
  }
  const unlocked = list.filter((s) => s?.unlocked);
  const pending = unlocked.find((s) => s.bestScore == null);
  const nextId = (pending ?? unlocked[unlocked.length - 1])?.id ?? null;
  return { bestId, nextId };
}

/**
 * UNA fila del selector: punto de color del tema + nombre + insignia
 * de JEFE + récord/bloqueo. La fila que es la siguiente disponible o la
 * del mejor récord recibe una clase extra para destacar.
 *
 * @param {object} s stage {id,name,boss,unlocked,bestScore}
 * @param {{bestId?:number|null, nextId?:number|null}} [hl] destacados
 * @returns {string} HTML de la fila
 */
export function stageRowHtml(s, hl = {}) {
  const id = s?.id ?? 0;
  const cls = ['btn', 'stage'];
  if (s?.boss) cls.push('is-boss');
  if (id === hl.nextId) cls.push('is-next');
  if (id === hl.bestId) cls.push('is-best');
  const record = s?.bestScore != null
    ? `<small class="ok">récord ${String(Math.floor(s.bestScore)).padStart(6, '0')}</small>`
    : (s?.unlocked ? '<small class="ok">disponible</small>' : '');
  const lock = s?.unlocked ? '' : '<small class="lock">🔒 próximamente</small>';
  const boss = s?.boss ? '<span class="stage-boss">BOSS</span>' : '';
  const flag = id === hl.nextId ? '<span class="stage-flag">▶</span>' : '';
  return `
    <button class="${cls.join(' ')}" data-action="start-stage" data-stage="${attr(String(id))}"
      ${s?.unlocked ? '' : 'disabled'}>
      <span class="stage-dot" style="--stage-color:${stageThemeColor(id)}"></span>
      <span class="stage-title">${esc(s?.name ?? `Stage ${id}`)}</span>
      ${boss}${flag}${record}${lock}
    </button>`;
}

// ============================================================
// fase 67 — MODO INFINITO: las dos tarjetas del endgame
//
// El ∞ no castiga (perder sólo significa reintentar la misma etapa), así
// que la presión la ejerce el RÉCORD. Por eso el selector muestra, arriba
// de las 50 filas, dos accesos que hoy no existen: CONTINUAR la
// profundidad y el DESAFÍO DIARIO (una etapa fija del día para cazar
// score). Las dos son botones de verdad: el HUD no arranca nada, sólo
// emite la acción que main.js ya sabe manejar (`start-stage` /
// `start-daily`).
//
// Todo llega CALCULADO en el payload (`_selectData().endless`): el HUD no
// sabe de récords, fechas ni semillas. Un payload corrupto no pinta la
// tarjeta — antes que un botón que arranca la etapa equivocada.
// ============================================================

/** Primera etapa del ∞, derivada de los DATOS de la campaña. */
export const ENDLESS_MIN_STAGE = STAGES.length + 1;

/**
 * Un entero de un payload que puede venir corrupto (NaN, string, null).
 *
 * @param {unknown} v valor crudo del payload
 * @returns {number|null} el entero, o null si no hay número usable
 */
export function payloadInt(v) {
  let n = NaN;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && v.trim() !== '') n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

/**
 * Tarjeta de CONTINUACIÓN del modo infinito (fase 67). Repite la etapa a
 * jugar y el récord al lado: es el enganche de "una más" del endgame.
 * Sin `open` (el S50 no se limpió todavía) no hay tarjeta: el modo aún no
 * existe para el jugador.
 *
 * fase 69: con `heat > 0` el subtítulo pasa a "Heat N · récord H": en el ∞
 * el récord es POR NIVEL DE HEAT (`bestAtHeat`), así que mezclarlo con la
 * profundidad global mentiría.
 *
 * @param {{open?:boolean,best?:number,next?:number,heat?:number,bestAtHeat?:number}|null|undefined} endless
 * @returns {string} HTML de la tarjeta ('' si el modo está cerrado)
 */
export function buildEndlessCardHtml(endless) {
  if (!endless?.open) return '';
  const next = payloadInt(endless.next);
  if (next == null || next < ENDLESS_MIN_STAGE) return '';
  const best = Math.max(0, payloadInt(endless.best) ?? 0);
  const heat = Math.max(0, payloadInt(endless.heat) ?? 0);
  const bestAtHeat = Math.max(0, payloadInt(endless.bestAtHeat) ?? 0);
  let record = best > 0 ? `récord: etapa ${best}` : 'primera incursión';
  if (heat > 0) {
    record = bestAtHeat > 0
      ? `Heat ${heat} · récord ${bestAtHeat}`
      : `Heat ${heat} · sin récord`;
  }
  return `
    <button class="stage-endless" data-action="start-stage" data-stage="${attr(next)}">
      <span class="card-kicker">MODO INFINITO</span>
      <span class="card-title">∞ CONTINUAR — ETAPA ${next}</span>
      <span class="card-sub">${esc(record)}</span>
    </button>`;
}

/**
 * Tarjeta del DESAFÍO DIARIO (fase 67): la etapa del día (fija, misma
 * semilla) + el récord de HOY. El aliciente es subir ese número, no
 * pasar la etapa: por eso el récord se ve en la propia tarjeta.
 *
 * @param {{open?:boolean,daily?:{date?:string,stage?:number,bestScore?:number}}|null|undefined} endless
 * @returns {string} HTML de la tarjeta ('' si el modo está cerrado)
 */
export function buildDailyCardHtml(endless) {
  if (!endless?.open) return '';
  const daily = endless.daily;
  const stage = payloadInt(daily?.stage);
  const date = typeof daily?.date === 'string' ? daily.date.trim() : '';
  if (stage == null || stage < ENDLESS_MIN_STAGE || !date) return '';
  const bestScore = Math.max(0, payloadInt(daily.bestScore) ?? 0);
  const record = bestScore > 0 ? `récord de hoy: ${fmt(bestScore)}` : 'sin récord hoy';
  return `
    <button class="stage-daily" data-action="start-daily">
      <span class="card-kicker">DESAFÍO DIARIO</span>
      <span class="card-title">ETAPA ${stage} · ${esc(date)}</span>
      <span class="card-sub">${esc(record)}</span>
    </button>`;
}

/**
 * Filas del resumen del MODO INFINITO (profundidad, récord y hito).
 * Se usan en STAGE_CLEAR y, sin el hito, en GAME_OVER: en una derrota no
 * hay recompensa que multiplicar, así que anunciar el ×1,5 sería mentira.
 *
 * @param {{depth?:number,best?:number,isRecord?:boolean,milestone?:boolean}|null|undefined} endless
 * @param {{milestone?:boolean}} [opts] anunciar el hito de recompensa
 * @returns {string} filas `<div><dt>…</dt><dd>…</dd></div>` ('' si no hay dato)
 */
export function endlessSummaryRows(endless, { milestone = false } = {}) {
  const depth = payloadInt(endless?.depth);
  if (depth == null) return '';
  // El récord se muestra TAL CUAL manda main.js: en una derrota puede ser
  // menor que la profundidad jugada (perdiste en la 58 y el récord es 57) y
  // "arreglarlo" con un max() mentiría sobre el estado del jugador.
  const best = Math.max(0, payloadInt(endless.best) ?? depth);
  const record = endless.isRecord ? ' · ¡NUEVO RÉCORD!' : '';
  const recordLabel = best > 0 ? `Etapa ${best}` : '—';
  return `
    <div><dt>PROFUNDIDAD</dt><dd class="ok">Etapa ${depth}${record}</dd></div>
    <div><dt>RÉCORD</dt><dd>${recordLabel}</dd></div>
    ${milestone && endless.milestone ? '<div><dt>HITO</dt><dd class="ok">×1,5 recompensa</dd></div>' : ''}`;
}

/**
 * Fila del DESAFÍO DIARIO en el resumen (fase 67): el score del día y si
 * es el mejor de hoy. El score se registra gane o pierda, así que la fila
 * sale en las dos pantallas.
 *
 * @param {{date?:string,stage?:number,score?:number,isRecord?:boolean}|null|undefined} daily
 * @returns {string} la fila ('' si no hay payload diario)
 */
export function dailySummaryRow(daily) {
  if (!daily || typeof daily !== 'object') return '';
  const score = Math.max(0, payloadInt(daily.score) ?? 0);
  const record = daily.isRecord ? ' · ¡RÉCORD DEL DÍA!' : '';
  return `<div><dt>DESAFÍO DIARIO</dt><dd class="ok">${fmt(score)}${record}</dd></div>`;
}

/**
 * Filas del PROTOCOLO en el resumen de fin de run (fase 69): el heat
 * jugado, el récord y —solo al ganar— los hitos cobrados.
 *
 * En la DERROTA no hay hitos que anunciar (no se cobran) y en su lugar se
 * dice lo único que al jugador le importa tras perder: que el récord no
 * baja. El heat y el récord los manda main.js ya resueltos.
 *
 * @param {{heat?:number,best?:number,record?:number,isRecord?:boolean,
 *   milestones?:number[],milestoneFrags?:number}|null|undefined} heat
 * @param {{defeat?:boolean}} [opts] es la pantalla de derrota
 * @returns {string} filas `<div><dt>…</dt><dd>…</dd></div>` ('' sin datos)
 */
export function heatSummaryRows(heat, { defeat = false } = {}) {
  if (!heat || typeof heat !== 'object') return '';
  const played = heatInt(heat.heat);
  const record = Math.max(heatInt(heat.record), heatInt(heat.best));
  const nuevo = heat.isRecord ? ' · ¡NUEVO RÉCORD!' : '';
  const milestones = Array.isArray(heat.milestones)
    ? heat.milestones.map((m) => payloadInt(m)).filter((m) => m != null)
    : [];
  const frags = heatInt(heat.milestoneFrags);
  const hits = !defeat && milestones.length
    ? `<div><dt>HITOS</dt><dd class="ok">${milestones.map((m) => `Heat ${m}`).join(' · ')}${frags > 0 ? ` · +${frags}/torreta` : ''}</dd></div>`
    : '';
  const safe = defeat && !milestones.length
    ? '<div><dt>PROTOCOLO</dt><dd>el récord no baja</dd></div>'
    : '';
  return `
    <div><dt>HEAT</dt><dd class="ok">${played}${nuevo}</dd></div>
    <div><dt>RÉCORD DE HEAT</dt><dd>${record}</dd></div>
    ${hits}${safe}`;
}

/**
 * Bloque del ∞ en la DERROTA (fase 67). El modo no castiga: perder no
 * baja la profundidad. El texto usa el RÉCORD (siempre verdadero, incluso
 * si se perdió una etapa que no era la del frente) y la próxima etapa.
 *
 * @param {{depth?:number,best?:number,next?:number}|null|undefined} endless
 * @returns {string} HTML del bloque ('' si no hay profundidad usable)
 */
export function endlessDefeatBlock(endless) {
  const depth = payloadInt(endless?.depth);
  if (depth == null) return '';
  const best = Math.max(0, payloadInt(endless.best) ?? depth);
  const next = Math.max(ENDLESS_MIN_STAGE, best + 1, payloadInt(endless.next) ?? 0);
  // Con el récord en 0 (primera incursión del ∞) decir "seguís en la etapa 0"
  // sería absurdo: el mensaje cambia, la promesa de no castigar es la misma.
  const recordTxt = best > 0
    ? `seguís en la etapa ${best}`
    : 'todavía no hay récord de profundidad';
  return `
    <div class="endless-result">
      <p class="card-kicker">MODO INFINITO</p>
      <dl class="summary">
        ${endlessSummaryRows(endless)}
      </dl>
      <p class="hint">Perder no baja el récord: ${recordTxt}. Próxima: la ${next}.</p>
    </div>`;
}

/**
 * Bloque de la SUPERVIVENCIA en la DERROTA (fase 70). El modo se mide en
 * OLEADAS, no en etapas: el resumen dice hasta dónde llegó, si es récord y
 * lo que paga. La recompensa sólo existe por oleadas NUEVAS (8 fragmentos
 * y 2 de oro por oleada sobre el récord, ×heat): main.js la manda resuelta
 * y acá solo se pinta. Sin `wave` usable no hay bloque.
 *
 * @param {{wave?:number,best?:number,isRecord?:boolean,runs?:number,
 *   rewardFrags?:number,rewardGold?:number,heat?:number}|null|undefined} sv
 * @returns {string} HTML del bloque ('' si no es una run de supervivencia)
 */
export function survivalDefeatBlock(sv) {
  if (!sv || typeof sv !== 'object') return '';
  const wave = payloadInt(sv.wave);
  if (wave == null) return '';
  // El récord se muestra TAL CUAL llega: main.js lo actualiza DESPUÉS de
  // cerrar la run, y "arreglarlo" con un max(wave) mentiría sobre el estado
  // del jugador (igual criterio que el ∞ y el heat).
  const best = Math.max(0, payloadInt(sv.best) ?? wave);
  const runs = Math.max(0, payloadInt(sv.runs) ?? 0);
  const heat = heatInt(sv.heat);
  const frags = Math.max(0, payloadInt(sv.rewardFrags) ?? 0);
  const gold = Math.max(0, payloadInt(sv.rewardGold) ?? 0);
  const record = sv.isRecord ? ' · ¡NUEVO RÉCORD!' : '';
  const reward = [
    frags > 0 ? `+${frags}/torreta` : '',
    gold > 0 ? `+${gold} oro` : '',
  ].filter(Boolean).join(' · ');
  return `
    <div class="survival-result">
      <p class="card-kicker">MODO ARCADE</p>
      <dl class="summary">
        <div><dt>OLEADA</dt><dd class="ok">${Math.max(0, wave)}${record}</dd></div>
        <div><dt>RÉCORD</dt><dd>${best}</dd></div>
        <div><dt>RUNS</dt><dd>${runs}</dd></div>
        ${heat > 0 ? `<div><dt>HEAT</dt><dd>${heat}</dd></div>` : ''}
        ${reward ? `<div><dt>RECOMPENSA</dt><dd class="ok">${esc(reward)}</dd></div>` : ''}
      </dl>
    </div>`;
}

// ============================================================
// fase 69 — EL PROTOCOLO DE ASEDIO (HEAT) EN EL HUD
//
// El heat es un AJUSTE persistente, no una pantalla de inicio de run (ver
// docs/DESIGN.md): se configura en su propia pantalla y lo usan TODAS las runs
// hasta cambiarlo. Por eso entra por dos puertas: la tarjeta del selector
// (`buildProtocolCardHtml`) y el botón del menú.
//
// El HUD no calcula NADA: `_heatData()` trae el protocolo activo, los 11
// conds con sus rangos, los 5 presets, el total, el récord y el
// multiplicador ya resueltos por main.js/heat.js. Acá solo se pinta (con
// `esc`/`attr`) y se emiten las acciones; el estado lo mueve main.js.
// ============================================================

/** Multiplicador de recompensa en el idioma del repo: "×1,96" (sin ceros de relleno). */
export function fmtRewardMul(m) {
  const v = Number(m);
  if (!Number.isFinite(v) || v <= 0) return '—';
  return `×${v.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}`;
}

/** Entero saneado del payload (NaN/negativos/basura → 0). */
export function heatInt(v) {
  return Math.max(0, payloadInt(v) ?? 0);
}

/**
 * Tarjeta del PROTOCOLO en el SELECTOR (fase 69): arriba de las 50 filas,
 * junto a las del ∞ y el diario. Dice el heat ACTIVO y el récord, que es
 * el gancho para subirlo. Sin payload no se pinta (fallback sin datos).
 *
 * @param {{active?:number,best?:number}|null|undefined} heat
 * @returns {string} HTML de la tarjeta ('' si no hay datos)
 */
export function buildProtocolCardHtml(heat) {
  if (!heat || typeof heat !== 'object') return '';
  const active = heatInt(heat.active);
  const best = heatInt(heat.best);
  const record = best > 0 ? `récord: ${best}` : 'sin récord';
  return `
    <button class="stage-protocol" data-action="protocol">
      <span class="card-kicker">DIFICULTAD · CAMPAÑA</span>
      <span class="card-title">PROTOCOLO — HEAT ${active}</span>
      <span class="card-sub">${esc(record)}</span>
    </button>`;
}

/**
 * Una fila del Protocolo: nombre, descripción, pips del rango y los dos
 * botones que mueven UN dial (`heat-plus`/`heat-minus` con `data-cond`).
 * El coste que se muestra es el del PRÓXIMO rango (`c.heat[rank]`), que es
 * lo que cuesta el `+`: al llegar al tope dice "máximo".
 *
 * @param {object} c condición de `HEAT_CONDS`
 * @param {number} rank rango activo (0..ranks)
 * @returns {string} HTML de la fila
 */
export function protocolRowHtml(c, rank) {
  const ranks = Math.max(1, heatInt(c.ranks));
  const cur = Math.min(rank, ranks);
  const costs = Array.isArray(c.heat) ? c.heat : [];
  const next = cur < ranks ? payloadInt(costs[cur]) : null;
  const costTxt = next == null ? 'máximo' : `+${next} heat`;
  const pips = Array.from(
    { length: ranks },
    (_, i) => `<i class="protocol-pip${i < cur ? ' on' : ''}"></i>`,
  ).join('');
  const name = c.name ?? c.id;
  return `
    <div class="protocol-row${cur > 0 ? ' is-on' : ''}">
      <div class="protocol-row-head">
        <span class="protocol-name">${esc(name)}</span>
        <span class="protocol-cost${cur >= ranks ? ' is-max' : ''}">${costTxt}</span>
      </div>
      <p class="protocol-desc">${esc(c.desc ?? '')}</p>
      <div class="protocol-row-foot">
        <span class="protocol-pips" role="img" aria-label="Rango ${cur} de ${ranks}">${pips}</span>
        <span class="protocol-steps">
          <button class="protocol-step" type="button" data-action="heat-minus"
            data-cond="${attr(c.id)}" aria-label="Bajar ${attr(name)}"
            ${cur > 0 ? '' : 'disabled'}>−</button>
          <button class="protocol-step" type="button" data-action="heat-plus"
            data-cond="${attr(c.id)}" aria-label="Subir ${attr(name)}"
            ${cur < ranks ? '' : 'disabled'}>+</button>
        </span>
      </div>
    </div>`;
}

/**
 * Pantalla PROTOCOLO completa (fase 69). PURA: recibe `_heatData()` y
 * devuelve el HTML de la pantalla. Sin datos (o con basura) pinta el aviso
 * y la salida, nunca un panel vacío ni una excepción.
 *
 * @param {{mods?:object,total?:number,preset?:string|null,rewardMul?:number,
 *   best?:number,conds?:Array,presets?:Array}|null|undefined} data
 * @returns {string} HTML de la pantalla
 */
export function buildProtocolHtml(data) {
  if (!data || typeof data !== 'object') {
    return `
      <h2 class="screen-title">PROTOCOLO DE ASEDIO</h2>
      <p class="hint">Protocolo no disponible: volvé a entrar desde el menú.</p>
      <button class="btn ghost" data-action="heat-close">VOLVER</button>`;
  }
  const total = heatInt(data.total);
  const best = heatInt(data.best);
  const presetId = typeof data.preset === 'string' ? data.preset : null;
  const mods = data.mods && typeof data.mods === 'object' ? data.mods : {};
  const conds = Array.isArray(data.conds) ? data.conds : [];
  const presets = Array.isArray(data.presets) ? data.presets : [];
  const presetsHtml = presets.map((p) => {
    const id = typeof p?.id === 'string' ? p.id : '';
    if (!id) return '';
    const name = typeof p?.name === 'string' && p.name.trim() ? p.name : `Protocolo ${id}`;
    const active = id === presetId;
    return `
      <button class="protocol-preset${active ? ' active' : ''}" type="button"
        data-action="heat-preset" data-preset="${attr(id)}"
        aria-pressed="${active}">${esc(name)} · Heat ${heatInt(p.heat)}</button>`;
  }).join('');
  const rowsHtml = conds
    .filter((c) => c && typeof c === 'object' && typeof c.id === 'string' && c.id)
    .map((c) => protocolRowHtml(c, heatInt(mods[c.id])))
    .join('');
  return `
    <h2 class="screen-title">PROTOCOLO DE ASEDIO</h2>
    <div class="protocol-head">
      <div class="protocol-total">
        <span class="protocol-heat-label">HEAT</span>
        <span class="protocol-heat-value">${total}</span>
      </div>
      <div class="protocol-head-meta">
        <span class="protocol-reward">recompensa ${fmtRewardMul(data.rewardMul)}</span>
        <span class="protocol-record">récord: ${best}</span>
        ${presetId == null ? '<span class="protocol-custom">personalizado</span>' : ''}
      </div>
    </div>
    <p class="hint protocol-hint">Cada rango suma heat y dificultad. Se aplica a las etapas de CAMPAÑA; el ∞ y el diario juegan sin Protocolo. Perder no baja el heat ni el récord.</p>
    <div class="protocol-presets" role="group" aria-label="Presets del protocolo">${presetsHtml}</div>
    <div class="protocol-list">${rowsHtml}</div>
    <button class="btn ghost" data-action="heat-close">VOLVER</button>`;
}

/**
 * Lista de stages del selector, agrupada por décadas (HTML puro, sin
 * DOM). El contenedor exterior hace de marco: su degradado inferior
 * avisa que la lista sigue hacia abajo (indicador de scroll).
 *
 * oleadas-dinámicas: cada cabecera de bloque puede llevar el SESGO DE
 * FAMILIA de la etapa ("STAGES 11–20 · roca / virus"), que el director
 * calcula. Llega como `familyOf` (opcional y defensivo: sin él, el HTML
 * es exactamente el de antes).
 *
 * fase 67: las tarjetas del ∞ y del diario van ARRIBA y FUERA del scroll
 * (`endless` opcional). Con las 50 filas por debajo, una tarjeta dentro
 * del scroll desaparece al primer gesto; sin `endless` el HTML es el de
 * siempre (ni un div vacío).
 *
 * fase 69: la tarjeta del PROTOCOLO (`heat` opcional) va PRIMERO entre las
 * tarjetas de arriba: es un ajuste global de la run, no una etapa.
 *
 * fase 70: la tarjeta de SUPERVIVENCIA (`survival` opcional) va al final de
 * las de arriba: es un modo aparte (se mide en oleadas), no una etapa.
 *
 * @param {Array} stages lista de stages
 * @param {{familyOf?: ((stage:object)=>string|null)|null, endless?: object|null,
 *   heat?: {active?:number,best?:number}|null,
 *   survival?: {bestWave?:number,bestScore?:number,runs?:number}|null}} [opts]
 *   resolutor del sesgo de familia de un bloque + payloads del ∞, del heat
 *   y de la supervivencia
 * @returns {string} HTML de la lista
 */
export function buildStageList(
  stages = [],
  { familyOf = null, endless = null, heat = null, survival = null } = {},
) {
  const list = Array.isArray(stages) ? stages : [];
  const hl = findStageHighlights(list);
  const groups = buildStageGroups(list);
  const body = groups.map((g) => `
    <section class="stage-group">
      <h3 class="stage-group-title">STAGES ${g.label}${stageFamilyTag(g.rows[0], familyOf)}</h3>
      <div class="stage-group-rows">${g.rows.map((s) => stageRowHtml(s, hl)).join('')}</div>
    </section>`).join('');
  const cards = [
    buildProtocolCardHtml(heat),
    buildEndlessCardHtml(endless),
    buildDailyCardHtml(endless),
    buildSurvivalCardHtml(survival),
  ].filter(Boolean).join('');
  const cardsBlock = cards ? `
    <div class="endless-cards">${cards}</div>` : '';
  return `${cardsBlock}
    <div class="stage-scroll">
      <div class="stage-list">${body}</div>
    </div>`;
}

// ============================================================
// fase 70 — SUPERVIVENCIA Y SALA DE RÉCORDS
//
// La supervivencia es el loop de ARCADE: una arena, olas que no paran y
// "¿hasta dónde llego?". Su métrica es el AGUANTE (oleadas), no la
// profundidad del ∞, así que el récord es una OLEADA. El HUD no calcula
// nada: `_selectData().survival` trae bestWave/bestScore/runs resueltos y
// la sala de récords pinta `_recordsData()`, el payload de los cinco
// modos. Sin payload la tarjeta no se pinta (el selector es el de antes).
// ============================================================

/**
 * Tarjeta de SUPERVIVENCIA en el SELECTOR (fase 70): el récord de oleadas
 * es el gancho de "una más". Sin `bestWave` la run es NUEVA, no "oleada 0":
 * el jugador todavía no tiene un número que batir.
 *
 * @param {{bestWave?:number,bestScore?:number,runs?:number}|null|undefined} survival
 *   `_selectData().survival`
 * @returns {string} HTML de la tarjeta ('' sin datos)
 */
export function buildSurvivalCardHtml(survival) {
  if (!survival || typeof survival !== 'object') return '';
  const bestWave = Math.max(0, payloadInt(survival.bestWave) ?? 0);
  const bestScore = Math.max(0, payloadInt(survival.bestScore) ?? 0);
  const title = bestWave > 0 ? `OLEADA ${bestWave}` : 'NUEVA';
  const record = bestWave > 0
    ? `récord: oleada ${bestWave} · score ${fmt(bestScore)}`
    : 'sin récord';
  return `
    <button class="stage-survival" data-action="start-survival">
      <span class="card-kicker">MODO ARCADE</span>
      <span class="card-title">SUPERVIVENCIA — ${esc(title)}</span>
      <span class="card-sub">${esc(record)}</span>
    </button>`;
}

/**
 * Una fila de la SALA DE RÉCORDS (fase 70): el modo, su mejor dato, un
 * detalle y el PRÓXIMO HITO. El texto llega ya formateado por
 * `buildRecordsHtml` (esta función solo escapa y compone).
 *
 * @param {{kicker:string,best:string,detail?:string,next:string}} row
 * @returns {string} HTML de la fila
 */
export function recordRowHtml({ kicker, best, detail = '', next }) {
  return `
    <div class="record-row">
      <p class="card-kicker">${esc(kicker)}</p>
      <p class="record-best">${esc(best)}</p>
      ${detail ? `<p class="record-detail">${esc(detail)}</p>` : ''}
      <p class="record-next">PRÓXIMO HITO · ${esc(next)}</p>
    </div>`;
}

/**
 * SALA DE RÉCORDS (fase 70). PURA: recibe `_recordsData()` y devuelve el
 * HTML de la pantalla. Los cinco modos se pintan SIEMPRE (con guiones si
 * falta un dato): la sala existe para que el juego se lea como uno solo, y
 * una tarjeta que desaparece no cumple esa función. Sin payload, el aviso
 * y la salida.
 *
 * @param {{campaign?:object,endless?:object,heat?:object,
 *   survival?:object,daily?:object}|null|undefined} data
 * @returns {string} HTML de la pantalla
 */
export function buildRecordsHtml(data) {
  const volver = `
    <div class="stage-actions">
      <button class="btn ghost" data-action="menu">${UI_ICONS.menu} VOLVER</button>
      <button class="btn" data-action="select-stage">JUGAR</button>
    </div>`;
  if (!data || typeof data !== 'object') {
    return `
      <h2 class="screen-title">RÉCORDS</h2>
      <p class="hint">Récords no disponibles: volvé a entrar desde el menú.</p>
      ${volver}`;
  }
  const obj = (v) => (v && typeof v === 'object' ? v : {});
  const campaign = obj(data.campaign);
  const endless = obj(data.endless);
  const heat = obj(data.heat);
  const survival = obj(data.survival);
  const daily = obj(data.daily);

  const cleared = Math.max(0, Math.min(STAGES.length, payloadInt(campaign.cleared) ?? 0));
  const campaignScore = Math.max(0, payloadInt(campaign.bestScore) ?? 0);
  const endlessBest = Math.max(0, payloadInt(endless.best) ?? 0);
  const endlessNext = Math.max(ENDLESS_MIN_STAGE,
    payloadInt(endless.next) ?? (endlessBest + 1));
  const heatBest = heatInt(heat.best);
  const heatStage50 = heatInt(heat.stage50);
  const heatNext = payloadInt(heat.next);
  const bestWave = Math.max(0, payloadInt(survival.bestWave) ?? 0);
  const survivalScore = Math.max(0, payloadInt(survival.bestScore) ?? 0);
  const runs = Math.max(0, payloadInt(survival.runs) ?? 0);
  const nextWave = Math.max(1, payloadInt(survival.nextWave) ?? (bestWave + 1));
  const dailyDate = typeof daily.date === 'string' ? daily.date.trim() : '';
  const dailyScore = Math.max(0, payloadInt(daily.bestScore) ?? 0);

  const rows = [
    recordRowHtml({
      kicker: 'CAMPAÑA',
      best: cleared > 0 ? `Etapa ${cleared} de ${STAGES.length}` : 'sin etapas limpiadas',
      detail: campaignScore > 0 ? `mejor score ${fmt(campaignScore)}` : '',
      next: cleared >= STAGES.length ? 'campaña completa' : `${cleared}/${STAGES.length} etapas`,
    }),
    recordRowHtml({
      kicker: 'INFINITO',
      best: endlessBest > 0 ? `Etapa ${endlessBest}` : 'sin récord',
      detail: 'la profundidad no baja al perder',
      next: `Etapa ${endlessNext}`,
    }),
    recordRowHtml({
      kicker: 'PROTOCOLO',
      best: `Heat ${heatBest}`,
      detail: `etapa 50: Heat ${heatStage50}`,
      next: heatNext == null ? 'máximo' : `Heat ${Math.max(0, heatNext)}`,
    }),
    recordRowHtml({
      kicker: 'SUPERVIVENCIA',
      best: bestWave > 0 ? `Oleada ${bestWave}` : 'sin récord',
      detail: `score ${fmt(survivalScore)} · ${runs} ${runs === 1 ? 'run' : 'runs'}`,
      next: `Oleada ${nextWave}`,
    }),
    recordRowHtml({
      kicker: 'DESAFÍO DIARIO',
      best: `score ${fmt(dailyScore)}`,
      detail: dailyDate || 'sin reto hoy',
      next: 'el reto nuevo',
    }),
  ].join('');

  return `
    <h2 class="screen-title">RÉCORDS</h2>
    <p class="hint">Los cinco modos, en un solo sitio. Perder nunca baja un récord.</p>
    <div class="records-grid">${rows}</div>
    ${volver}`;
}



/**
 * dev-7 fase 39 — RAREZA de una carta.
 *
 * La DECLARA la propia carta (`card.rarity`, en cards.js) y mide su
 * POTENCIA. Antes se derivaba del `weight` (la probabilidad de sorteo):
 * "Abanico Ampliado" salía LEGENDARIO y "Reparación de Campo" también,
 * porque ambos pesaban 10. El jugador leía la rareza como si fuera la
 * potencia de la carta y no lo era.
 *
 * Vive ACÁ en el HUD (y no en cards.js) porque `js/hud.js` no puede
 * importar `cards.js` (regla §1.1: el cableo lo hace main.js).
 *
 * @typedef {'common'|'uncommon'|'rare'|'legendary'} CardRarity
 */
export const CARD_RARITIES = {
  common: { tier: 1, cls: 'common', label: 'Común' },
  uncommon: { tier: 2, cls: 'uncommon', label: 'Poco común' },
  rare: { tier: 3, cls: 'rare', label: 'Raro' },
  legendary: { tier: 4, cls: 'legendary', label: 'Legendario' },
};

/**
 * La rareza de una carta (la declara la propia carta).
 * @param {object} card la carta del catálogo
 * @returns {{tier:number, cls:string, label:string}}
 */
export function cardRarity(card) {
  const r = card?.rarity ?? 'common';
  return CARD_RARITIES[r] ?? CARD_RARITIES.common;
}

/** Ventana anti-doble-toque del modal de cartas (ms). */
export const CARD_PICK_DEBOUNCE_MS = 350;

/**
 * fase 72 — PANTALLA DE CRÉDITOS Y LICENCIAS. PURA: no recibe datos, no toca
 * el DOM, no hace red. Devuelve el HTML completo; el contenido viene de
 * `licenses.js` (embebido, porque el juego es offline y docs/ no se publica).
 *
 * POR QUÉ EXISTE: el icono del Ultimate (assets/sprites/ui_tinted/
 * icon_ultimate_gold.png) es de Lorc / game-icons.net bajo CC BY 3.0, que
 * exige la atribución EN LA OBRA DISTRIBUIDA (§4 b: autor, título, URI de
 * origen y —por ser una adaptación recoloreada— un crédito que identifique
 * el uso). Hasta la fase 71 la atribución vivía solo en docs/CREDITS.md.
 *
 * ORDEN: el bloque CC BY va PRIMERO y con el mismo componente que los demás.
 * §4 b exige que el crédito de la obra CC BY sea "at least as prominent as
 * the credits for the other contributing authors": una nota al pie no cumple.
 *
 * @returns {string} HTML de la pantalla
 */
export function buildCreditsHtml() {
  /** URI como TEXTO seleccionable (no <a>: el juego no tiene anclas y en el
   *  APK un link abriría un webview encima de la partida). */
  const url = (u) => `<span class="credits-url">${esc(u)}</span>`;
  /** Una fila `clave · valor` del bloque de atribución. */
  const row = (k, v) => `<dt>${esc(k)}</dt><dd>${v}</dd>`;

  // --- CC BY 3.0 (obligatorio) ---
  const ccBy = ATTRIBUTIONS.find((a) => a.license === 'CC-BY-3.0');
  const ccByLic = ccBy ? LICENSES[ccBy.license] : null;
  const ccByHtml = (ccBy && ccByLic) ? `
        <section class="credits-section credits-ccby" aria-labelledby="credits-ccby-h">
          <h3 class="credits-h" id="credits-ccby-h">Arte con atribución obligatoria · CC BY 3.0</h3>
          <article class="credits-attrib credits-attrib-main">
            ${ccBy.thumb ? `<img class="credits-icon" src="${attr(ccBy.thumb)}" width="56" height="56"
              alt="Icono del Ultimate: un rayo dorado" loading="lazy" decoding="async">` : ''}
            <div class="credits-body">
              <p class="credits-work">«${esc(ccBy.work)}» — ${esc(ccBy.use)}</p>
              <dl class="credits-dl">
                ${row('Autor', esc(ccBy.author))}
                ${row('Obra', `${esc(ccBy.work)} (<code>${esc(ccBy.slug)}</code>)`)}
                ${row('Fuente', `${esc(ccBy.sourceLabel)} — ${url(ccBy.source)}`)}
                ${row('Licencia', `${esc(ccByLic.name)} — ${url(ccByLic.url)}`)}
                ${row('Cambios', esc(ccBy.modified))}
              </dl>
              <p class="credits-note">Esta atribución se muestra en el juego, que es la obra
                distribuida, como exige la licencia (CC BY 3.0, §4 b).</p>
            </div>
          </article>
        </section>` : '';

  // --- CC0 1.0 (sin obligación, se acredita igual) ---
  const cc0Html = ATTRIBUTIONS
    .filter((a) => a.license !== 'CC-BY-3.0')
    .map((a) => {
      const lic = LICENSES[a.license] ?? { name: a.license, url: '' };
      return `
          <article class="credits-attrib">
            <div class="credits-body">
              <p class="credits-work">${esc(a.author)} · ${esc(a.work)}</p>
              <dl class="credits-dl">
                ${row('Uso', esc(a.use))}
                ${row('Fuente', `${esc(a.sourceLabel)} — ${url(a.source)}`)}
                ${row('Licencia', `${esc(lic.name)}${lic.url ? ` — ${url(lic.url)}` : ''}`)}
                ${a.modified ? row('Cambios', esc(a.modified)) : ''}
              </dl>
            </div>
          </article>`;
    }).join('');

  // --- Tipografías (OFL 1.1) ---
  const oflLic = LICENSES['OFL-1.1'];
  const fontsHtml = FONTS.map((f) => `
          <div class="credits-row">
            <span class="credits-row-name">${esc(f.name)}</span>
            <span class="credits-row-detail">${esc(f.authors)}</span>
          </div>`).join('');

  // --- Código (MIT) ---
  const codeLic = LICENSES[CODE.license];

  // --- Textos legales completos: una entrada por licencia CON texto. Se
  //     derivan de los datos (no de una lista hardcodeada): si mañana se
  //     embebe otro texto, aparece solo. ---
  const legalHtml = Object.keys(LICENSES).map((id) => {
    const lic = LICENSES[id];
    if (!lic?.text) return '';
    return `
          <details class="credits-legal-box">
            <summary>Texto completo de ${esc(lic.name)}</summary>
            <pre class="credits-legal">${esc(lic.text)}</pre>
          </details>`;
  }).join('');

  return `
    <h2 class="screen-title">CRÉDITOS Y LICENCIAS</h2>
    <p class="credits-lead">Open Defense Fortress es un juego 100 % offline: todo el arte,
      el audio y las tipografías viajan con el juego. Acá está quién hizo cada pieza y bajo
      qué licencia se distribuye.</p>
    <div class="credits-scroll" tabindex="0" role="region" aria-label="Créditos y licencias">${ccByHtml}
        <section class="credits-section" aria-labelledby="credits-cc0-h">
          <h3 class="credits-h" id="credits-cc0-h">Arte y audio en dominio público · CC0 1.0</h3>
          <p class="credits-hint">CC0 no exige atribución; se acredita igual.</p>${cc0Html}
        </section>
        <section class="credits-section" aria-labelledby="credits-fonts-h">
          <h3 class="credits-h" id="credits-fonts-h">Tipografías · SIL Open Font License 1.1</h3>${fontsHtml}
          <p class="credits-hint">Se distribuyen embebidas con el juego, no se venden por separado.
            ${esc(oflLic.name)} — ${url(oflLic.url)}</p>
        </section>
        <section class="credits-section" aria-labelledby="credits-code-h">
          <h3 class="credits-h" id="credits-code-h">Código · MIT</h3>
          <p class="credits-work">${esc(CODE.project)} — Copyright (c) ${esc(String(CODE.year))} ${esc(CODE.holder)}</p>
          <p class="credits-hint">Licencia: ${esc(codeLic.name)} — ${url(codeLic.url)}</p>
        </section>
        <section class="credits-section" aria-labelledby="credits-legal-h">
          <h3 class="credits-h" id="credits-legal-h">Textos completos de las licencias</h3>${legalHtml}
        </section>
    </div>
    <div class="stage-actions">
      <button class="btn ghost" data-action="menu">${UI_ICONS.menu} VOLVER</button>
    </div>`;
}

/**
 * dev-7 fase 36 — SCROLL de la pantalla de torretas.
 *
 * La grilla de torretas (`.meta-grid`, el contenedor scrolleable) se
 * re-crea en cada re-render de la pantalla: al pulsar MEJORAR, elegir un
 * perk o redistribuir, `showScreen('TORRETAS')` reemplaza el `innerHTML`
 * del overlay y el nodo NUEVO nace con `scrollTop = 0`. El jugador
 * estaba abajo (mirando la última torreta) y la vista saltaba al
 * principio, obligándole a volver a scrollear.
 *
 * Estos dos helpers guardan y restauran la posición. Son puros (tienen el
 * nodo como parámetro) para poder testearlos sin DOM.
 *
 * @param {object} root raíz del overlay (o cualquier nodo)
 * @returns {number} el scroll actual de la grilla (0 si no hay)
 */
export function readMetaScroll(root) {
  const grid = root?.querySelector?.('.meta-grid');
  return typeof grid?.scrollTop === 'number' ? grid.scrollTop : 0;
}

/**
 * dev-7 fase 36 — Restaura el scroll de la grilla de torretas tras un
 * re-render (ver `readMetaScroll`). Si no hay grilla, no hace nada; si el
 * contenido nuevo es más corto, el navegador recorta el valor (es lo
 * correcto: no hay a dónde llegar).
 *
 * @param {object} root raíz del overlay
 * @param {number} top posición a restaurar
 */
export function restoreMetaScroll(root, top) {
  const grid = root?.querySelector?.('.meta-grid');
  if (!grid) return;
  if (typeof top === 'number' && top > 0) grid.scrollTop = top;
}

/**
 * fase 71 — SCROLL de la pantalla PROTOCOLO.
 *
 * Cada ± o preset re-renderiza la pantalla (main llama a
 * `showScreen('PROTOCOLO')`) y el `innerHTML` nuevo nace con la lista
 * arriba: el jugador que estaba ajustando una condición del final perdía
 * la posición. La lista (`.protocol-list`) es la que scrollea, así que
 * guardamos/restauramos SU `scrollTop`, igual que TORRETAS con la grilla.
 *
 * @param {object} root raíz del overlay
 * @returns {number} scroll actual de la lista (0 si no hay)
 */
export function readProtocolScroll(root) {
  const list = root?.querySelector?.('.protocol-list');
  return typeof list?.scrollTop === 'number' ? list.scrollTop : 0;
}

/**
 * Restaura el scroll de la lista del Protocolo tras el re-render.
 * Si el contenido nuevo es más corto, el navegador recorta el valor.
 *
 * @param {object} root raíz del overlay
 * @param {number} top posición a restaurar
 */
export function restoreProtocolScroll(root, top) {
  const list = root?.querySelector?.('.protocol-list');
  if (!list) return;
  if (typeof top === 'number' && top > 0) list.scrollTop = top;
}

/**
 * fase 71 — FOCO del Protocolo.
 *
 * Al pulsar ± / un preset, main re-renderiza la pantalla y el botón que
 * tenía el foco desaparece con el `innerHTML` viejo. Guardamos su
 * identidad (acción + condición/preset) para devolvérsela al nodo nuevo.
 * Si el control quedó deshabilitado (el `+` llegó al máximo), se enfoca
 * el otro botón de la misma fila.
 *
 * @param {object} root raíz del overlay
 * @returns {{action:string,cond:string}|{action:string,preset:string}|null}
 */
export function readProtocolFocus(root) {
  const active = root?.ownerDocument?.activeElement;
  if (!active || typeof root?.contains !== 'function' || !root.contains(active)) return null;
  const ds = active.dataset;
  if (!ds) return null;
  if (typeof ds.cond === 'string' && ds.cond) {
    return { action: ds.action ?? '', cond: ds.cond };
  }
  if (typeof ds.preset === 'string' && ds.preset) {
    return { action: 'heat-preset', preset: ds.preset };
  }
  return null;
}

/**
 * Devuelve el foco al control equivalente del DOM recién creado.
 *
 * @param {object} root raíz del overlay
 * @param {object|null} key resultado de `readProtocolFocus`
 * @returns {object|null} nodo enfocado (o null)
 */
export function restoreProtocolFocus(root, key) {
  if (!key || typeof root?.querySelectorAll !== 'function') return null;
  const nodes = Array.from(root.querySelectorAll('[data-action]'));
  const find = (action) => nodes.find((n) => {
    const ds = n?.dataset;
    if (!ds || ds.action !== action) return false;
    if (key.cond) return ds.cond === key.cond;
    if (key.preset) return ds.preset === key.preset;
    return false;
  });
  let next = find(key.action);
  // El `+` que llegó al máximo queda `disabled` (no es focusable): el foco
  // pasa al `-` de la misma fila, que sí puede bajar el rango.
  if (next?.disabled && key.cond) {
    next = find(key.action === 'heat-plus' ? 'heat-minus' : 'heat-plus');
  }
  if (!next || typeof next.focus !== 'function') return null;
  try {
    next.focus({ preventScroll: true });
  } catch (_err) {
    // Navegadores viejos sin opciones de focus(): enfocar igual.
    try { next.focus(); } catch (_err2) { return null; }
  }
  return next;
}

/**
 * ¿Se acepta este toque en una carta? (bug del doble toque: el primer
 * toque aplicaba la carta y el modal se re-renderizaba con la oferta
 * SIGUIENTE bajo el dedo → el segundo toque aplicaba OTRA carta y el
 * jugador perdía dos mejoras).
 *
 * Reglas:
 *  - una carta YA elegida en la oferta actual no se puede volver a tapar;
 *  - dos toques con menos de CARD_PICK_DEBOUNCE_MS sobre la MISMA oferta
 *    cuentan como uno solo;
 *  - una oferta distinta (o un modal nuevo) sí se puede elegir.
 *
 * @param {{lastPickAt?: {at:number, offerId:string|null}|null, now?: number,
 *          pickedIds?: string[], offerId?: string|null, cardId?: string|null}} [state]
 * @returns {boolean} true si el toque se acepta
 */
export function canPickCard({
  lastPickAt = null, now = 0, pickedIds = [], offerId = null, cardId = null,
} = {}) {
  if (cardId != null && pickedIds.includes(cardId)) return false;
  if (!lastPickAt) return true;
  if (offerId != null && lastPickAt.offerId !== offerId) return true;
  return (now - (lastPickAt.at ?? 0)) >= CARD_PICK_DEBOUNCE_MS;
}

/**
 * fase 71 — TOPE de nivel de la run, saneado. La campaña/∞ usan 21; la
 * Supervivencia, 31. Sin esto el HUD comparaba siempre con el de campaña
 * y decía "NIVEL MÁX" mientras la Supervivencia seguía dando upgrades.
 *
 * @param {unknown} value tope recibido (payload o `game.maxLevel`)
 * @returns {number} entero >= 1 (fallback: campaña)
 */
export function levelCap(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : MAX_LEVEL_PER_STAGE;
}

/**
 * dev-7 fase 64 — EL HINT DEL MODAL DE CARTAS.
 *
 * El modal dejó de ser "una decisión y seguimos": un multikill acumula
 * niveles PENDIENTES (main.js `_pendingLevels`) y cada uno abre su propia
 * oferta. Sin decirlo, el jugador no entiende por qué le vuelven a salir
 * cartas justo después de elegir. Y con el TOPE de la run alcanzado
 * (`MAX_LEVEL_PER_STAGE` en campaña/∞, 31 en Supervivencia) tampoco
 * entendería por qué ya no sube más de nivel y sus bajas siguen pagando:
 * eso también se dice acá.
 *
 * `pendingLevels` cuenta la oferta que se está MOSTRANDO (el nivel que la
 * abrió ya está descontado del contador): con 2 niveles en cola el primer
 * modal ya avisa ×2 y el segundo (el último) no repite el aviso.
 *
 * @param {{pendingLevels?: number, maxed?: boolean, lv?: number,
 *          maxLevel?: number}} [state]
 * @returns {string} el texto del `<p class="hint">` del modal
 */
export function cardHintText({
  pendingLevels = 0, maxed = false, lv = null, maxLevel = MAX_LEVEL_PER_STAGE,
} = {}) {
  const cola = pendingLevels > 1 ? ` · Mejoras pendientes ×${pendingLevels}` : '';
  const atCap = maxed || (Number.isFinite(Number(lv)) && Number(lv) >= levelCap(maxLevel));
  const tope = atCap ? ' · NIVEL MÁX: la energía vale SCORE' : '';
  return `Elige 1 mejora · el mundo está en pausa${cola}${tope}`;
}

/**
 * dev-7 fase 64 — EL RÓTULO DE NIVEL DEL HUD (bloque `Lv.N` + barra XP).
 *
 * Al tope de la run `xpFrac` vale 1 y la barra queda llena: se veía como
 * "a un pelo del nivel siguiente" cuando ese nivel ya no existe. El rótulo
 * lo dice en vez de mentir con la barra. El tope depende del modo (21 en
 * campaña/∞, 31 en Supervivencia), así que lo recibe por parámetro.
 *
 * @param {{lv?: number, maxed?: boolean, maxLevel?: number}} [state]
 * @returns {string} "Lv.N", o "NIVEL MÁX" con el tope alcanzado
 */
export function levelLabelText({
  lv = 1, maxed = false, maxLevel = MAX_LEVEL_PER_STAGE,
} = {}) {
  return (maxed || Number(lv) >= levelCap(maxLevel)) ? 'NIVEL MÁX' : `Lv.${lv}`;
}

/**
 * Formatea el DPS (T8): entero hasta 999, "1.2k" desde 1000.
 * @param {number} d
 * @returns {string}
 */
export const fmtDps = (d) => {
  if (d >= 10000) return `${(d / 1000).toFixed(1)}k`;
  if (d >= 1000) return `${Math.round(d / 100) / 10}k`;
  return String(Math.round(d));
};

/**
 * Estado de batalla en 2 read-outs (T8): el HUD mostraba nivel, XP,
 * score y timer, pero el jugador NO veía cuántos enemigos quedaban
 * vivos ni su DPS real: no tenía forma de saber si el stage venía bien.
 *
 * dev-7 fase 43: la tira tenía 4 píldoras y DOS duplicaban información
 * que ya está en otro sitio del HUD — "OLAS 3/33" repetía la barra de
 * progreso del stage (el mismo dato: olas despachadas / total) y
 * "RACHA ×1" repetía el badge ×1.5 que aparece junto al score. Se
 * eliminan: de la tira quedan ENEMIGOS y DPS, que no duplican nada.
 *
 * Los datos llegan en el payload de render() (main.js): enemiesAlive
 * y dps.
 *
 * @param {{enemiesAlive?:number|null, dps?:number|null}} [s]
 * @returns {{enemies:string, dps:string}}
 */
export function formatBattleStatus({ enemiesAlive = null, dps = null } = {}) {
  const alive = enemiesAlive == null ? NaN : Number(enemiesAlive);
  const enemies = Number.isFinite(alive) ? String(Math.max(0, Math.floor(alive))) : '—';
  const d = dps == null ? NaN : Number(dps);
  const dpsTxt = (Number.isFinite(d) && d > 0) ? fmtDps(d) : '—';
  return { enemies, dps: dpsTxt };
}

/**
 * HTML de la tira de ESTADO DE BATALLA (segunda fila del HUD).
 *
 * dev-7 fase 43: la tira tenía 4 píldoras y 2 DUPLICABAN datos que ya
 * están en otro sitio del HUD — "OLAS 3/33" repetía la barra de progreso
 * del stage (olas despachadas / total) y "RACHA ×1" repetía el badge ×1.5
 * que aparece junto al score. Se eliminan: quedan ENEMIGOS y DPS.
 *
 * @returns {string} HTML de la tira
 */
export function buildStatusStripHtml() {
  return `
      <span class="hud-stat"><i>ENEMIGOS</i><b data-stat="enemies">—</b></span>
      <span class="hud-stat"><i>DPS</i><b data-stat="dps">—</b></span>`;
}

/**
 * HTML de la BARRA DE JEFE (nodo propio bajo #marco-portrait).
 *
 * dev-7 fase 43: el "×2" a secas se leía como multiplicador de DAÑO;
 * es el factor de RECOMPENSA (la primera vez que se limpia un stage vale
 * el doble). Por eso la etiqueta "RECOMPENSA" acompaña al número (el CSS
 * la oculta si el marco no tiene sitio).
 *
 * dev-7 fase 46: la etiqueta .boss-tag decía "BOSS" fijo. Ahora el
 * NOMBRE del jefe (propio de cada stage) va en el <b data-boss-name>,
 * que el HUD rellena en renderBossBar() con el nombre real.
 *
 * @returns {string} HTML de la barra de jefe
 */
export function buildBossBarHtml() {
  return `
      <span class="boss-tag"><img src="assets/sprites/ui_tinted/icon_boss_warning_red.png" alt=""><b class="boss-tag-name" data-boss-name>JEFE</b></span>
      <span class="bar boss-hp" role="progressbar" aria-label="Vida del jefe" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="boss-hp-fill"></span></span>
      <span class="boss-mult-label">RECOMPENSA</span><span class="boss-mult"></span>`;
}

/**
 * DPS estimado de UNA torre (T8): lee el daño REAL (`Tower.damage` ya
 * trae nivel × cartas × meta × perks) y su cadencia (`Tower.cooldown`).
 *  - torres de disparo: daño / cadencia;
 *  - beam: su daño YA es por segundo (dispara siempre) → daño;
 *  - láser: daño por segundo pero solo durante su ráfaga → se promedia.
 *
 * @param {{damage?:number, cooldown?:number, data?:{kind?:string,laserDuration?:number}}} tower
 * @returns {number} DPS estimado de esa torre
 */
export function towerDps(tower) {
  const dmg = Number(tower?.damage);
  if (!Number.isFinite(dmg) || dmg <= 0) return 0;
  const kind = tower?.data?.kind ?? tower?.kind ?? '';
  const cd = Number(tower?.cooldown);
  if (kind === 'beam') return dmg;                    // daño por segundo continuo
  if (kind === 'laser') {
    const dur = Number(tower?.data?.laserDuration ?? 0);
    if (dur > 0 && Number.isFinite(cd) && cd > 0) return dmg * (dur / cd);
    return dmg;
  }
  if (Number.isFinite(cd) && cd > 0) return dmg / cd;
  return dmg;
}

/**
 * DPS estimado de la partida: suma el DPS de las torres vivas.
 * main.js lo usa para mandar el dato en el payload de render().
 *
 * @param {Array} towers torres vivas (fortress.slots filtrado)
 * @returns {number}
 */
export function fortressDps(towers = []) {
  let sum = 0;
  for (const t of towers) sum += towerDps(t);
  return sum;
}

/** Duración del aviso de JEFE (ms) — 2 s, como el WARNING del juego. */
export const BOSS_WARNING_MS = 2000;

/** dev-7 fase 47: duración del aviso de cambio de fase del jefe. */
export const BOSS_PHASE_MS = 2200;

// ============================================================
// oleadas-dinámicas — EL ARQUETIPO QUE ENTRA (design §Decisión 8)
//
// NO hay preview de la próxima ola (decisión del usuario): lo único que
// se anuncia es lo que ESTÁ entrando. El sistema de arquetipos es
// invisible sin esto: el jugador vería "muchos enemigos juntos" sin
// saber si es un convoy, una pinza o una marea.
// ============================================================

/**
 * Duración del banner del arquetipo entrante (ms). Más corto que el aviso
 * de jefe (2000) a propósito: entra una descarga cada pocos segundos y
 * este aviso no puede quedarse pegado tapando el campo.
 */
export const ARCHETYPE_BANNER_MS = 1400;

/**
 * Rótulo de cada arquetipo del director (las claves de `WAVE_ARCHETYPES`,
 * js/waves.js), en el idioma del juego y en mayúsculas.
 */
export const ARCHETYPE_BANNER_TEXT = {
  enjambre: '¡ENJAMBRE!',
  convoy: '¡CONVOY!',
  'cuña': '¡CUÑA!',
  cortina: '¡CORTINA!',
  goteo: '¡GOTEO!',
  pinza: '¡PINZA!',
  escolta: '¡ESCOLTA!',
  'ola de choque': '¡OLA DE CHOQUE!',
};

/**
 * El texto del banner de un arquetipo entrante.
 *
 * FUNCIÓN PURA (testeable sin DOM). Un arquetipo desconocido —o `null`,
 * que es lo que manda el director cuando no pudo etiquetar la descarga—
 * devuelve null: NO se muestra banner.
 *
 * @param {string|null} archetype id del arquetipo
 * @returns {string|null} "¡CONVOY!" o null
 */
export function archetypeBannerText(archetype) {
  const id = String(archetype ?? '').trim().toLowerCase();
  return ARCHETYPE_BANNER_TEXT[id] ?? null;
}

/**
 * Arquetipos que MERECEN banner (fase 65, ajuste de ruido).
 *
 * El banner entra con CADA descarga del tramo clásico y hay una cada
 * pocos segundos: anunciarlos todos dejaba el aviso casi siempre en
 * pantalla compitiendo con el del jefe y los del ultimate. Los moldes que
 * se leen solos —`enjambre` (una nube de bichos), `cortina` (una fila),
 * `cuña` (una punta y sus flancos), `goteo` (un chorro por una franja)—
 * NO se anuncian; sí los que cambian la lectura del campo: `convoy` (un
 * tanque que arrastra al enjambre), `pinza` (dos frentes laterales),
 * `ola de choque` (el pico) y `escolta` (el premio de XP custodiado).
 *
 * Si en el futuro se quiere anunciar todo, alcanza con vaciar esta lista:
 * `archetypeBannerText` sigue sabiendo el rótulo de los 8.
 */
export const ARCHETYPE_BANNER_NOTABLE = ['convoy', 'pinza', 'ola de choque', 'escolta'];

/**
 * ¿Este arquetipo merece banner? FUNCIÓN PURA (testeable sin DOM).
 *
 * Es la POLÍTICA de ruido, separada del rótulo (`archetypeBannerText`):
 * un arquetipo conocido pero no notable devuelve false y NO se pinta nada.
 *
 * @param {string|null} archetype id del arquetipo
 * @returns {boolean}
 */
export function shouldAnnounceArchetype(archetype) {
  const id = String(archetype ?? '').trim().toLowerCase();
  return ARCHETYPE_BANNER_NOTABLE.includes(id);
}

/**
 * LAYOUT del overlay del panel COMBO (#combo-panel).
 *
 * dev-7 fase 46: el VELO (fondo oscuro + blur + padding + gap) ya NO se
 * replica desde JS: lo pone la clase CSS `.overlay-veil`, la MISMA que
 * usa el modal de cartas (#card-choice). Acá queda solo el LAYOUT del
 * overlay (posición, capas y centrado), que es propio del nodo del
 * combo: z-index 50 → se dibuja ENCIMA del modal de cartas (40).
 */
export const COMBO_OVERLAY_LAYOUT = [
  'position:absolute', 'inset:0', 'z-index:50', 'display:flex',
  'flex-direction:column', 'align-items:center', 'justify-content:center',
].join(';');

/** Clase CSS del velo (oscuro + blur) de los overlays modales. */
export const OVERLAY_VEIL_CLASS = 'overlay-veil';

/**
 * dev-7 fase 57 — La CAJA del escenario de overlays (#overlay-stage).
 *
 * Es la MISMA cuenta que hace el CSS con los tokens `--stage-w` y
 * `--stage-h` (css/style.css): el escenario toma el ANCHO del marco y
 * el ALTO de la pantalla. Vive en JS para poder MEDIRLA en un test (el
 * CSS no se mide en Node): si alguien cambia una de las dos cuentas,
 * los tests de la fase 57 lo cantan.
 *
 * Por qué dos cajas: desde la fase 58 el marco usa TODO el alto
 * disponible, así que en un móvil (390×844) queda en 374×828 y ya no
 * le sobra nada: el ESCENARIO de los overlays (menú, pausa, cartas, perk,
 * combos) cuelga de un nodo FIJO fuera del marco, donde nada lo recorta
 * y donde la columna de cartas tiene los 651 px que necesita (antes
 * scrolleaba y la 3.ª carta se cortaba).
 * En escritorio el marco es ALTO-limitado (queda angosto en una pantalla
 * ancha): el escenario coincide con él y el overlay se ve EXACTAMENTE
 * igual que antes.
 *
 * @param {number} vw ancho del viewport (px)
 * @param {number} vh alto del viewport (px)
 * @returns {{w:number, h:number, frameW:number, frameH:number, full:boolean}}
 *   w/h = la caja del escenario · frameW/frameH = la del marco (con
 *   bordes) · full = el overlay ocupa la pantalla real
 */
export function overlayStageBox(vw, vh) {
  const MARGIN = 8;   // el margen del marco (#marco-portrait)
  const BORDER = 1;   // su borde
  const RATIO = 54 / 88;   // su proporción (54×88 de diseño)
  // El marco (fase 58): el alto es SIEMPRE el disponible y el ancho se
  // deduce de él, con el tope del ancho de la pantalla.
  const frameH = vh - 2 * MARGIN;
  const frameW = Math.min(vw - 2 * MARGIN, frameH * RATIO);
  // El escenario: el ancho del marco (sin bordes) y el alto de la pantalla.
  const w = frameW - 2 * BORDER;
  const h = vh - 2 * (MARGIN + BORDER);
  // El overlay es de PANTALLA COMPLETA cuando el marco es ANCHO-limitado
  // (el del telófono): entonces el escenario ocupa la pantalla de lado a
  // lado. En escritorio el marco es ALTO-limitado (queda angosto en una
  // pantalla ancha) y el escenario se ve igual que el marco de antes.
  // OJO: desde la fase 58 el marco SIEMPRE llena el alto, así que la
  // diferencia de alturas ya no sirve para distinguirlos: el ancho sí.
  const full = frameW >= vw - 2 * MARGIN - 1;
  return { w, h, frameW, frameH, full };
}

// ============================================================
// Builders PUROS de pantallas (HTML sin DOM — testeables en Node)
// ============================================================

/**
 * Pantalla MENÚ (HTML puro). Los conteos salen de los DATOS
 * (META_TOWERS.length): nunca de un literal (bug-fix: decía "9 torretas"
 * cuando ya había 11).
 *
 * @param {{theme?: string, quality?: string, confirmingReset?: boolean}} [opts]
 * @returns {string} HTML de la pantalla
 */
/**
 * dev-7 fase 55 — El bloque del selector de tema (compartido por el
 * menú y la pausa).
 *
 * - La miniatura muestra 4 muestras del tema (acento · dorado · fondo ·
 *   rojo) en vez de un degradado de 2: el jugador ve de verdad de qué
 *   color es el tema y no solo dos tonos.
 * - El NOMBRE va escrito bajo cada muestra (antes solo estaba en el
 *   `title` del botón, que en un teléfono no se ve).
 * - Semántica de radio: es un grupo de opciones, no 5 botones sueltos.
 *
 * @param {string} activeId id del tema activo
 * @returns {string} HTML del bloque
 */
export function buildThemeSwatches(activeId = '') {
  return THEMES.map((t) => `
    <button class="theme-swatch${t.id === activeId ? ' active' : ''}"
      type="button" role="radio" aria-checked="${t.id === activeId}"
      data-theme-id="${t.id}" title="${t.name}">
      <span class="theme-swatch-chip" aria-hidden="true"
        style="background: conic-gradient(from 210deg, ${t.preview[0]} 0 25%, ${t.preview[1]} 25% 50%, ${t.preview[2]} 50% 75%, ${t.preview[3]} 75% 100%)"></span>
      <span class="theme-swatch-name">${t.name}</span>
    </button>`).join('');
}

/**
 * Pantalla del MENÚ principal.
 *
 * dev-7 fase 59.4: con `meta` se pinta el AVISO de mejoras pendientes
 * justo encima del botón JUGAR: el menú es donde el jugador decide
 * arrancar el siguiente stage, así que es el último lugar donde puede
 * ver "tenés X mejoras sin gastar" antes de entrar a la battle.
 *
 * @param {{theme?: string, quality?: string, confirmingReset?: boolean, meta?: object}} [opts]
 */
export function buildMenuScreen({ theme = '', quality = '', confirmingReset = false, meta = null } = {}) {
  // dev-7 fase 13: selector de temas — reskinea el HUD/paneles/botones
  // (no el canvas del juego, ver theme.js). El activo queda marcado.
  // dev-7 fase 55: el selector de tema es un bloque reutilizable (el
  // menu y la PAUSA lo comparten) con la miniatura de 4 muestras, el
  // NOMBRE visible bajo cada una y semantica de radio (un grupo de
  // opciones, no 5 botones sueltos).
  const swatches = buildThemeSwatches(theme);
  // dev-7 fase 19 (pedido del usuario: "anda lento en mobile/PC vieja,
  // aun en 2x") — selector de calidad gráfica, ver quality.js. 'Baja'
  // apaga shadowBlur en todo el juego y baja el tope de partículas.
  const qButtons = QUALITY_LEVELS.map((q) => `
    <button class="quality-btn${q.id === quality ? ' active' : ''}" data-quality-id="${q.id}">${q.name}</button>`).join('');
  // dev-7 fase 14: "Borrar progreso" — confirmación inline en 2 pasos
  // (nada de confirm() nativo del navegador, rompería la estética).
  const resetBlock = confirmingReset ? `
    <div class="reset-confirm">
      <p class="reset-warn">¿Seguro? Se pierden los stages desbloqueados,
        los récords, las ${META_TOWERS.length} torretas mejoradas del meta-juego y tu saldo de
        oro (vuelve a ${META_GOLD_START}). No se puede deshacer.</p>
      <div class="reset-confirm-row">
        <button class="btn ghost small" data-action-reset="cancel">CANCELAR</button>
        <button class="btn danger small" data-action-reset="confirm">SÍ, BORRAR TODO</button>
      </div>
    </div>`
    : `<button class="btn ghost danger-link" data-action-reset="ask">Borrar progreso</button>`;
  return `
    <section class="screen">
      <h1 class="game-title">OPEN DEFENSE<span class="subtitle">FORTRESS</span></h1>
      <p class="tagline">Defiende la base · torres fijas · ${STAGES.length} stages</p>
      ${meta ? buildPendingNoticeHtml(meta) : ''}
      <button class="btn big" data-action="play">▶ JUGAR</button>
      <button class="btn ghost" data-action="select-stage">SELECCIONAR STAGE</button>
      <button class="btn ghost" data-action="torretas">${UI_ICONS.torreta} TORRETAS · mejoras permanentes</button>
      <button class="btn ghost" data-action="protocol">PROTOCOLO · heat y récords</button>
      <button class="btn ghost" data-action="records">RÉCORDS · los cinco modos</button>
      <button class="btn ghost" data-action="credits">CRÉDITOS · licencias y atribuciones</button>
      <div class="theme-picker" role="radiogroup" aria-label="Tema de la interfaz">${swatches}</div>
      <p class="theme-picker-label" data-theme-label>Tema: ${THEMES.find((t) => t.id === theme)?.name ?? theme}</p>
      <div class="quality-picker">${qButtons}</div>
      <p class="theme-picker-label">Calidad gráfica (probá "Baja" si el juego anda lento)</p>
      <p class="hint menu-hint">[P] pausa · [1][2][3] velocidad · [Espacio] ultimate · [B] black hole</p>
      ${resetBlock}
      <p class="version">v${VERSION} · sin anuncios · 100% offline</p>
    </section>`;
}

// ============================================================
// dev-7 fase 59.4 — EL META QUE SE VE
//
// El diagnóstico (fase 59.3): el meta es MANUAL y el coste de un nivel es
// de 75-390 fragmentos. Con 11 torretas, la campaña entera son ~484
// clics y el jugador NO VE que puede subir: llegó al S21 con miles de
// fragmentos acumulados sin gastarlos nunca.
//
// Acá van las piezas PURAS de la UX (testeables en Node, sin DOM):
//  - el botón "SUBIR TODO" (un toque en vez de 11),
//  - el AVISO de mejoras pendientes (menú y selector de stages),
//  - la línea de PODER (el multiplicador real del meta).
// ============================================================

/**
 * Fragmentos con separador de miles ("1.240"). Un número de cinco
 * cifras sin separador no se lee de un vistazo en un botón.
 *
 * @param {number} n cantidad de fragmentos
 * @returns {string} el número con puntos de miles
 */
export function fmtFrags(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Multiplicador de daño REAL del meta: la MEDIA del `metaDmgMul` de las
 * 11 torretas (curva por nivel × hitos).
 *
 * POR QUÉ la media y no una torreta: cada card ya muestra SU propio
 * "+X% DAÑO EN PARTIDA"; lo que falta es el número del JUGADOR — su
 * poder global — para entender que subir las torretas es lo que lo hace
 * fuerte. La media es el mismo criterio para todos los arsenales (el
 * jugador NUNCA tiene las 11 unidades en partida: fase 61, entran como
 * máximo 5 torres + 1 dron, y solo las que salgan por carta).
 *
 * @param {object} meta estado meta
 * @returns {number} multiplicador (1 = sin mejoras)
 */
export function metaPowerMul(meta) {
  let sum = 0;
  for (const t of META_TOWERS) sum += metaDmgMul(t.type, meta);
  return sum / META_TOWERS.length;
}

/** Multiplicador con coma decimal (el idioma del repo: "×4,7"). */
export function fmtMul(m) {
  return `×${(Number(m) || 0).toFixed(1).replace('.', ',')}`;
}

/**
 * Botón "SUBIR TODO LO POSIBLE" de la pantalla de torretas (fase 59.4).
 *
 * Aparece SOLO si hay mejoras pendientes (`pendingUpgrades > 0`) y DICE
 * cuántas son y cuántos fragmentos se gastan: sin ese dato el jugador no
 * sabe si le conviene (y sin el botón, la campaña entera son 484 clics).
 *
 * @param {object} meta estado meta
 * @returns {string} HTML de la barra ('' si no hay nada que subir)
 */
export function buildUpgradeAllHtml(meta) {
  const pending = pendingUpgrades(meta);
  if (pending <= 0) return '';
  const cost = pendingUpgradeCost(meta);
  const mejoras = pending === 1 ? '1 mejora' : `${pending} mejoras`;
  return `
    <div class="meta-upgrade-all-bar" id="meta-upgrade-all-bar">
      <button class="meta-upgrade-all" data-meta-upgrade-all
        title="Sube cada torreta lo que pueda con tus fragmentos (un toque)">
        SUBIR TODO (${mejoras} · ${fmtFrags(cost)} frag.)
      </button>
      <span class="meta-upgrade-all-note">Un toque: cada torreta sube lo que pueda</span>
    </div>`;
}

/**
 * AVISO de mejoras pendientes (fase 59.4): aparece en el MENÚ y en el
 * SELECTOR DE STAGES, o sea ANTES de que el jugador entre a la pantalla
 * de torretas.
 *
 * POR QUÉ ahí y no en el HUD de combate: el combate es un momento de
 * tensión (el jugador no va a tocar el meta a mitad de una ola) y esta
 * fase no toca las pantallas de combate (ver el informe de la fase).
 *
 * @param {object} meta estado meta
 * @param {{withButton?: boolean}} [opts] con `withButton` se añade el
 *   botón que lleva a la pantalla de torretas (el selector no tiene
 *   ninguno: el aviso es la única entrada a esa pantalla desde ahí).
 * @returns {string} HTML del aviso ('' si no hay nada pendiente)
 */
export function buildPendingNoticeHtml(meta, opts = {}) {
  const pending = pendingUpgrades(meta);
  if (pending <= 0) return '';
  const cost = pendingUpgradeCost(meta);
  const mejoras = pending === 1 ? '1 mejora' : `${pending} mejoras`;
  const btn = opts.withButton
    ? `<button class="btn ghost small" data-action="torretas">MEJORAR TORRETAS</button>`
    : '';
  return `
    <p class="pending-notice" role="status">
      ${UI_ICONS.torreta}
      <span class="pending-notice-txt">Tenés <b>${mejoras}</b> de torretas listas · ${fmtFrags(cost)} frag.</span>
      ${btn}
    </p>`;
}

/**
 * Línea de PODER: cuánto daño hace el meta del jugador frente al que
 * tenía sin mejoras (×1,0). Es la respuesta a "¿para qué subo las
 * torretas?": el multiplicador REAL (el mismo `metaDmgMul` que leen las
 * torres del arsenal en el combate — fase 61: hasta 5, más el dron).
 *
 * @param {object} meta estado meta
 * @returns {string} HTML de la línea ('' si no hay nada que decir)
 */
export function buildPowerLineHtml(meta) {
  const mul = metaPowerMul(meta);
  if (mul <= 1.001) return '';
  return `
    <p class="meta-power" id="meta-power">PODER DE TUS TORRETAS: <b>${fmtMul(mul)}</b> de daño
      <span>(sin mejoras: ×1,0)</span></p>`;
}

/**
 * Cards de TORRETAS (HTML puro, sin DOM): una por cada torreta de
 * META_TOWERS.
 *
 * Reglas de coherencia (bug-fix del rótulo de perks):
 *  - el botón ✦ abre el PRIMER tier PENDIENTE (pendientes[0]), que es el
 *    más bajo sin elegir — no "el siguiente por nivel" (los tiers se
 *    acumulan sin elegir y las dos cosas no coinciden);
 *  - el texto del pendiente nombra SIEMPRE ese mismo tier;
 *  - los perks ELEGIDOS se listan en ORDEN ASCENDENTE de nivel.
 *
 * @param {object} meta estado meta (normalizado)
 * @param {{resetArmed?: Record<string, boolean>}} [opts]
 * @returns {string} HTML de las cards concatenado
 */
export function buildTowerCards(meta, opts = {}) {
  const resetArmed = opts.resetArmed ?? {};
  return META_TOWERS.map((t) => {
    const level = meta.levels?.[t.key] ?? 1;
    const frags = meta.frags?.[t.key] ?? 0;
    const cost = fragCost(level);
    const maxed = level >= META_MAX_LEVEL;
    // v6: la barra se LLENA acumulando (+60/victoria) y MEJORAR se
    // habilita exactamente cuando frags >= cost (sin rollover automático
    // que consuma la barra antes de tiempo — corrección JK 28-08).
    const ready = !maxed && frags >= cost;
    const pct = maxed ? 100 : Math.min(100, Math.round((frags / cost) * 100));
    const barTxt = maxed
      ? `MÁX`
      : (ready ? `${frags}/${cost} · ¡LISTO!` : `${frags}/${cost} fragmentos`);
    // Efecto REAL en batalla: `metaDmgMul` = curva por nivel × hitos
    // (fase 28: +2 % por hito en Nvl.25/50/75/100). Antes el rótulo se
    // re-derivaba SOLO con META_DMG_PER_LEVEL y mentía: en Nvl.100 decía
    // "+495 %" cuando el multiplicador real es ×6.43 (+543 %).
    const dmgPct = Math.round((metaDmgMul(t.type, meta) - 1) * 100);
    // fase 16: perks ELEGIDOS por tier (perkChoices → rama A/B), en orden
    // ASCENDENTE de nivel (el más antiguo primero).
    const chosenPerks = [];
    for (let i = 0; i < PERK_TIERS; i++) {
      const c = meta.perkChoices?.[t.type]?.[i];
      if (c === 0 || c === 1) {
        const perk = PERKS[t.type]?.[i]?.[c === 0 ? 'A' : 'B'];
        if (perk) chosenPerks.push(`Nvl.${(i + 1) * PERK_EVERY}: ${esc(perk.desc)}`);
      }
    }
    // El botón ✦ abre el PRIMER tier pendiente (el más bajo sin elegir).
    const pendientes = pendingPerkTiers(t.type, meta);
    const pendingIdx = pendientes.length ? pendientes[0] : -1;
    const pendingTier = pendingIdx >= 0 ? PERKS[t.type]?.[pendingIdx] : null;
    const pendingLv = pendingIdx >= 0 ? (pendingIdx + 1) * PERK_EVERY : 0;
    const pendingOpts = pendingTier
      ? `${pendingTier.A.desc} / ${pendingTier.B.desc}`
      : '';
    const perkPick = pendingIdx >= 0
      ? `<button class="meta-perk-pick" data-perk-pick="${t.type}"
          title="Elegí entre las 2 opciones del tier Nvl.${pendingLv}: ${attr(pendingOpts)}">✦ ELEGIR PERK · Nvl.${pendingLv}${pendientes.length > 1 ? ` (×${pendientes.length})` : ''}</button>`
      : '';
    // Texto del pendiente/próximo: nombra el tier que abre el botón ✦.
    // El RÓTULO del tier (qué perk abrir) va APARTE de la descripción:
    // así el rótulo se lee ENTERO y solo el texto largo se recorta (con
    // ellipsis al final, nunca a media palabra).
    let nextLabel = '';
    let nextBody = '';
    if (pendingTier) {
      nextLabel = `Perk pendiente Nvl.${pendingLv}:`;
      nextBody = pendingOpts;
    } else if (maxed) {
      nextBody = 'Todos los perks de esta torreta ya están elegidos';
    } else {
      // Sin pendientes: el próximo tier POR DESBLOQUEAR (aún no jugable).
      const nextIdx = tierAtLevel(level) + 1;
      const nextTier = nextIdx >= 0 && nextIdx < PERK_TIERS ? PERKS[t.type]?.[nextIdx] : null;
      if (nextTier) {
        nextLabel = `Próximo Nvl.${(nextIdx + 1) * PERK_EVERY}:`;
        nextBody = `${nextTier.A.desc} / ${nextTier.B.desc}`;
      } else {
        nextLabel = `Primer perk en Nvl.${PERK_EVERY}`;
      }
    }
    const nextTxt = [nextLabel, nextBody].filter(Boolean).join(' ');
    const perkLines = chosenPerks.length
      ? `<span class="meta-card-perk" title="${attr(chosenPerks.join(' · '))}">${chosenPerks.join('<br>')}</span>`
      : '';
    const perkNext = `
      ${nextLabel ? `<span class="meta-card-perk-tier">${esc(nextLabel)}</span>` : ''}
      <span class="meta-card-perk-next" title="${attr(nextTxt)}">${esc(nextBody)}</span>`;
    // fase 16: REDISTRIBUIR (reset) con confirmación inline en 2 pasos.
    const hasChosen = (meta.perkChoices?.[t.type] ?? []).some((c) => c === 0 || c === 1);
    const armed = !!resetArmed?.[t.type];
    const redistribute = hasChosen
      ? (armed
        ? `<div class="reset-confirm meta-reset-confirm">
              <p class="reset-warn">¿Gastar ${PERK_RESET_COST} de oro y volver a elegir TODOS los perks de esta torreta?</p>
              <div class="reset-confirm-row">
                <button class="btn ghost small" data-perk-reset-cancel="${t.type}">CANCELAR</button>
                <button class="btn danger small" data-perk-reset-confirm="${t.type}">SÍ, RE-ELEGIR (${PERK_RESET_COST}●)</button>
              </div>
            </div>`
        : `<button class="meta-perk-reset" data-perk-reset-ask="${t.type}"
            title="Cuesta ${PERK_RESET_COST} de oro: volvés a elegir los perks de esta torreta (el nivel se mantiene)">REDISTRIBUIR (${PERK_RESET_COST}●)</button>`)
      : '';
    // Botón MEJORAR (v5 5b/5): habilitado solo con fragmentos suficientes;
    // maxeado → sin botón (la card ya dice "MÁX"). dev-7 fase 18: el
    // texto de qué hace y qué falta ahora es VISIBLE en la card (antes
    // vivía solo en el atributo title, invisible en mobile).
    const canUp = !maxed && frags >= cost;
    let upgrade = '';
    if (!maxed) {
      const need = `<span class="meta-card-need">Faltan ${cost - frags} fragmentos</span>`;
      upgrade = `
        ${canUp ? '' : need}
        <button class="meta-upgrade" data-meta-upgrade="${t.key}" ${canUp ? '' : 'disabled'}>
          MEJORAR → Nvl.${level + 1} (${cost} frag.)
        </button>`;
    }
    return `
      <div class="meta-card ${maxed ? 'maxed' : ''}">
        <span class="meta-card-name">${t.name}</span>
        <canvas class="meta-card-icon" width="84" height="72" data-meta-icon="${t.key}"></canvas>
        <span class="meta-card-lvl">Nvl.${level}</span>
        <span class="meta-card-bar"><span class="meta-card-bar-fill" style="width:${pct}%"></span></span>
        <span class="meta-card-frags">${barTxt}</span>
        ${dmgPct > 0 ? `<span class="meta-card-dmg">+${dmgPct}% DAÑO EN PARTIDA</span>` : ''}
        ${perkLines}
        ${perkNext}
        ${perkPick}
        ${upgrade}
        ${redistribute}
      </div>`;
  }).join('');
}

/**
 * Pantalla TORRETAS completa (HTML puro, sin DOM).
 *
 * @param {object} meta estado meta (normalizado)
 * @param {{resetArmed?: Record<string, boolean>}} [opts]
 * @returns {string} HTML de la pantalla
 */
export function buildTorretasScreen(meta, opts = {}) {
  const rank = buildRankBadge(meta);
  const gold = metaGold(meta);
  const totalLv = totalMetaLevels(meta);
  const cards = buildTowerCards(meta, opts);
  return `
    <section class="screen screen-meta">
      <div class="meta-top">
        <div class="meta-ident">
          <span class="meta-badge meta-badge-rank" style="--rank-color:${rank.color}"
            title="${attr(rank.next ? `Rango ${rank.name} · próximo: ${rank.next}` : `Rango ${rank.name}`)}">${rank.name}</span>
          <span class="meta-player">${META_PLAYER_NAME}</span>
          <span class="meta-rank-min">${rank.text}</span>
        </div>
        <div class="meta-res">
          <span class="meta-res-cell gold" title="Se gasta en REDISTRIBUIR perks (${PERK_RESET_COST} por torreta)"><i>●</i><b>${gold}</b></span>
        </div>
      </div>

      <!-- dev-7 fase 41: el botón de la LEYENDA. Antes la tabla estaba
           SIEMPRE abierta al final de la pantalla, FUERA del área
           scrolleable, y en móvil quedaba DETRÁS de la nav inferior
           (medido: la leyenda iba de y=598 a y=792 y la nav de y=727 a
           y=796 → la última fila era ilegible). Ahora la leyenda es un
           TOGGLE: se abre, se lee ENTERA (con su propio scroll) y se
           cierra. -->
      <div class="meta-legend-bar">
        <button class="meta-legend-toggle" id="meta-legend-toggle" type="button"
          data-meta-legend-toggle aria-expanded="false" aria-controls="meta-legend"
          title="Ver la tabla de tipos de daño: contra qué familia de enemigos rinde cada torreta">
          VER TIPOS DE DAÑO
        </button>
      </div>

      <!-- dev-7 fase 43: el banner "¿Cómo subo de nivel?" ya no se come
           130 px de una pantalla de 844 (medido) con una prosa que se lee
           UNA vez. Ahora la CABECERA (título + contador) queda siempre
           visible y la explicación va en un bloque PLEGABLE que abre un
           botón "?". OJO: el bloque se oculta con la CLASE "hidden" (la
           que usa todo el resto de la UI), NUNCA con el atributo hidden
           del HTML: son dos mecanismos distintos y mezclarlos deja el
           nodo sin caja. -->
      <div class="meta-banner" id="meta-banner">
        <span class="meta-banner-label">¿Cómo subo de nivel?</span>
        <span class="meta-banner-val">${totalLv}<small>/${META_TOTAL_MAX_LEVELS}</small></span>
        <button class="meta-banner-toggle" id="meta-banner-toggle" type="button"
          data-meta-banner-toggle aria-expanded="false" aria-controls="meta-banner-more"
          aria-label="Ver cómo se sube de nivel"
          title="¿Cómo subo de nivel?">?</button>
        <div class="meta-banner-more hidden" id="meta-banner-more">
          <span class="meta-banner-sub">Ganá CUALQUIER partida para sumar fragmentos (se
            reparten entre las ${META_TOWERS.length} torretas) y oro. Con fragmentos: MEJORAR sube
            de nivel. Cada ${PERK_EVERY} niveles elegís un perk nuevo (✦). Con oro:
            REDISTRIBUIR para volver a elegir los perks ya tomados.</span>
        </div>
      </div>

      <!-- dev-7 fase 59.4: el PODER del meta (el multiplicador REAL de
           daño que leen las torres en el combate) y el botón "SUBIR
           TODO". Sin esto el jugador no tenía NI idea de que sus
           torretas se podían subir ni de cuánto daño le daba eso. -->
      ${buildPowerLineHtml(meta)}
      ${buildUpgradeAllHtml(meta)}

      <div class="meta-grid" id="meta-grid">${cards}</div>

      <!-- dev-7 fase 32: la LEYENDA de la matriz de tipos de daño. Sin
           ella el sistema es un misterio: el jugador ve el glifo bajo
           cada torre pero no sabe contra qué enemigos pega más.
           dev-7 fase 41: ahora es un TOGGLE (arranca cerrada con la
           clase "hidden": la misma que usa el resto de la UI — NUNCA el
           atributo hidden del HTML, que es otro mecanismo). -->
      <div class="meta-legend hidden" id="meta-legend">
        <p class="meta-legend-title">TIPOS DE DAÑO</p>
        <div class="meta-legend-scroll" id="meta-legend-table">
          ${buildDamageLegendHtml()}
          <p class="meta-legend-note">▲ hace ×1,5 · ▼ hace ×0,5 · · neutral.
            El glifo bajo cada torre es su tipo de daño: el de la fila contra
            la familia de la columna.</p>
        </div>
      </div>

      <!-- dev-7 fase 39: las secciones del meta-juego son CONTENEDORES
           que se muestran y ocultan (antes "Defensa" era un panel
           absoluto que tapaba la grilla, y "Enemigos" no tenía nada).
           Cada sección tiene su propio scroll. OJO: se ocultan con la
           CLASE "hidden" (la que usa todo el resto de la UI), no con el
           atributo hidden del HTML: son dos mecanismos distintos y
           mezclarlos dejaba la sección sin caja. -->
      <div class="meta-section hidden" id="meta-bestiario">${buildBestiaryHtml(enemyModule.ENEMY_VARIANTS)}</div>
      <div class="meta-section hidden" id="meta-progreso"></div>

      <p class="meta-hint" id="meta-hint"></p>

      <!-- dev-7 fase 39: la navegación coherente. Antes eran 5 pestañas y
           SOLO 2 eran secciones reales: "Tienda" y "Enemigos" eran
           callejones sin salida (mostraban un toast que además filtraba
           vocabulario de desarrollo), y "Batalla"
           era un enlace, no una sección. Ahora las 5 hacen algo real:
           3 secciones (Torreta, Bestiario, Progreso) y 2 salidas
           (Batalla, Menú).
           dev-7 fase 41: los iconos son SVG inline (antes eran EMOJI
           del sistema: cada plataforma los dibujaba distinto y en la
           misma fila unos salían en color y otros en línea). -->
      <nav class="meta-nav">
        <button class="meta-tab active" data-meta-tab="torretas">${UI_ICONS.torreta}<span>Torreta</span></button>
        <button class="meta-tab" data-meta-tab="bestiario" title="Bestiario: los enemigos y contra qué tipo de daño rinden">${UI_ICONS.bestiario}<span>Bestiario</span></button>
        <button class="meta-tab" data-meta-tab="progreso" title="Tu progreso: rango, niveles, fragmentos y oro">${UI_ICONS.progreso}<span>Progreso</span></button>
        <button class="meta-tab" data-meta-tab="battle" data-action="select-stage" title="Volver a jugar">${UI_ICONS.batalla}<span>Batalla</span></button>
        <button class="meta-tab" data-meta-tab="menu" data-action="menu" title="Volver al menú principal">${UI_ICONS.menu}<span>Menú</span></button>
      </nav>
    </section>`;
}

