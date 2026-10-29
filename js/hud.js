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
function svgIcon(paths) {
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

const fmt = (n) => String(Math.floor(Math.max(0, n))).padStart(6, '0');
const fmtTime = (s) => {
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
const attr = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Escapa texto para interpolarlo como CONTENIDO HTML (no atributo). */
const esc = (s) => String(s ?? '')
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
const STAGE_THEME_COLORS = {
  volcanic: '#E8641F',
  volcanic2: '#D07818',
  graveyard: '#7E93A8',
  nightcity: '#35C8FF',
  core: '#FF3018',
};

/** Tema de cada stage (id → tema), leído de los DATOS (stages.js). */
const STAGE_THEME_BY_ID = new Map(STAGES.map((s) => [s.id, s.theme]));

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
const stageNumber = (stage, fallback) => {
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
function stageFamilyTag(stage, familyOf) {
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
function stageFamilyOf(stage) {
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
function stageRowHtml(s, hl = {}) {
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
const ENDLESS_MIN_STAGE = STAGES.length + 1;

/**
 * Un entero de un payload que puede venir corrupto (NaN, string, null).
 *
 * @param {unknown} v valor crudo del payload
 * @returns {number|null} el entero, o null si no hay número usable
 */
function payloadInt(v) {
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
function endlessSummaryRows(endless, { milestone = false } = {}) {
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
function dailySummaryRow(daily) {
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
function heatSummaryRows(heat, { defeat = false } = {}) {
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
function endlessDefeatBlock(endless) {
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
function survivalDefeatBlock(sv) {
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
function fmtRewardMul(m) {
  const v = Number(m);
  if (!Number.isFinite(v) || v <= 0) return '—';
  return `×${v.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}`;
}

/** Entero saneado del payload (NaN/negativos/basura → 0). */
function heatInt(v) {
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
function protocolRowHtml(c, rank) {
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
function recordRowHtml({ kicker, best, detail = '', next }) {
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
function levelCap(value) {
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
const fmtDps = (d) => {
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
const COMBO_OVERLAY_LAYOUT = [
  'position:absolute', 'inset:0', 'z-index:50', 'display:flex',
  'flex-direction:column', 'align-items:center', 'justify-content:center',
].join(';');

/** Clase CSS del velo (oscuro + blur) de los overlays modales. */
const OVERLAY_VEIL_CLASS = 'overlay-veil';

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
function fmtMul(m) {
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

export class HUD {
  /**
   * @param {import('./engine.js').Engine} engine
   */
  constructor(engine) {
    this.engine = engine;
    this.audio = new AudioManager();
    // dev-7 fase 14: estado del botón "Borrar progreso" (confirmación
    // inline en 2 pasos, ver _screenMenu()/_bindResetProgress()).
    this._confirmingReset = false;
    // dev-7 fase 39: acción pendiente de CONFIRMAR antes de abandonar la
    // partida en curso desde la pausa ('torretas' | 'menu' |
    // 'select-stage' | null).
    this._abandonPending = null;
    // fase 16: confirmación inline de "REDISTRIBUIR" por torreta (type → bool).
    this._perkResetArmed = {};
    // dev-7 fase 41: la LEYENDA de tipos de daño es un toggle (arranca
    // cerrada: la tabla tapaba la nav inferior en móvil).
    this._legendOpen = false;
    this._lastScreen = null; // fase 75: detectar cambio real de pantalla
    // dev-7 fase 43: la EXPLICACIÓN del banner "¿Cómo subo de nivel?" es
    // un toggle (arranca cerrada: la prosa se comía 130 px de 844 para
    // algo que se lee una vez).
    this._bannerMoreOpen = false;
    // dev-7 fase 13: aplica el tema guardado ANTES del primer render,
    // para no mostrar un flash con el tema viejo/default.
    // dev-7 fase 54: `applyThemeToGame` aplica ademas el TINTE DE ESCENA
    // (el que tiñe el canvas del juego, no solo el DOM).
    applyThemeToGame(loadTheme(), this.engine);

    // Cache de nodos DOM
    this.root = document.getElementById('hud-top');
    this.bottom = document.getElementById('hud-bottom');
    this.overlayRoot = document.getElementById('overlay-root');
    this.el = {
      stageName: document.getElementById('hud-stage-name'),
      progress: document.getElementById('hud-progress'),
      lv: document.getElementById('hud-lv'),
      xp: document.getElementById('hud-xp'),
      timer: document.getElementById('hud-timer'),
      score: document.getElementById('hud-score'),
      mult: document.getElementById('hud-mult'),
      speed: document.getElementById('btn-speed'),
      ult: document.getElementById('btn-ultimate'),
      ultRing: document.querySelector('#btn-ultimate .ult-ring'),
      bh: document.getElementById('btn-blackhole'),
      bhRing: document.querySelector('#btn-blackhole .bh-ring'),
      // fase 75: nodo cacheado; antes se hacía querySelector por frame.
      bhCount: document.querySelector('#btn-blackhole .bh-count'),
      music: document.getElementById('btn-music'), // v3 5/7 (BUG-004)
      // T8: tira de estado de batalla (se crea abajo, tras tener el root).
      // dev-7 fase 43: solo ENEMIGOS y DPS (OLAS y RACHA duplicaban datos
      // que ya están en la barra de progreso y en el badge del score).
      status: null,
      statEnemies: null,
      statDps: null,
      // T9: banner de aviso de JEFE (se crea bajo demanda).
      bossWarning: null,
    };
    this._timerSecs = -1;
    this._lastScoreShown = null;
    this._lastLv = null; // detección de LEVEL UP en render (dev-6, D14)
    // fase 70: oleada de SUPERVIVENCIA que acompaña al nombre del stage en
    // el HUD ("Supervivencia · Oleada N"). 0 = no es una run de arcade.
    this._survivalWave = 0;

    // BUG 5: el HUD escribe estilos en el DOM en CADA frame aunque esté
    // oculto (menú/torretas/pausa) y aunque el valor no haya cambiado.
    // `_hudVisible` + el cache de render evitan esas escrituras; al
    // volver a mostrarlo se invalida el cache para refrescar todo.
    this._hudVisible = false;

    // Modal (#card-choice) compartido por CARTAS y PERK: se recuerda qué
    // tipo está abierto para que Esc y la devolución del foco sean
    // correctos (bug: el modal de perk no se cerraba y tapaba el menú).
    this._modalKind = null; // 'cards' | 'perk' | null
    this._focusBeforeModal = null;

    // El panel COMBO tiene su PROPIO nodo (#combo-panel): antes
    // reutilizaba #card-choice y al abrirlo pisaba la oferta de cartas
    // (bug de soft-lock: la run quedaba trabada en CARD_CHOICE sin cartas
    // que elegir). Nodo aparte = oferta de cartas siempre intacta.
    this.comboPanel = null;
    this._focusBeforeCombo = null;

    // Barra de jefe (D11): DOM creado bajo demanda en render()
    this._bossHidden = true;

    // T4 — anti-doble-toque del modal de cartas: oferta VIVA (estable
    // mientras el modal sigue abierto: una cadena de ofertas por
    // multi-level-up es la MISMA decisión), cartas ya elegidas de la
    // oferta actual e instante del último pick.
    this._cardSession = 0;
    this._cardOfferId = null;
    this._cardPickedIds = [];
    this._lastCardPickAt = null;

    // T8 — tira de estado de batalla (enemigos / DPS): segunda fila del
    // HUD, creada junto con el HUD.
    // dev-7 fase 43: la tira tenía 4 píldoras; OLAS y RACHA duplicaban
    // la barra de progreso del stage y el badge ×N del score.
    this._ensureStatusStrip();

    // T9 — aviso de JEFE (banner WARNING de 2 s que docs/DESIGN.md promete y
    // que no existía en el DOM). El engine emite 'boss:warning' cuando
    // el jefe se acerca (waves.js) → el HUD muestra el banner.
    this.engine?.on?.('boss:warning', (data) => this.showBossWarning(data?.name));
    // dev-7 fase 47: el jefe avisa de su cambio de fase (y con ella, de
    // la regla nueva: a qué tipo le pega más). El evento ya lo emitía el
    // enemigo desde la fase 28, pero nadie lo escuchaba.
    this.engine?.on?.('boss:phase2', (enemy) => this.showBossPhase(enemy?._phase));
    // oleadas-dinámicas: el director anuncia el ARQUETIPO que ESTÁ
    // entrando ("¡CONVOY!"). Sin preview de la próxima ola (decisión del
    // usuario): lo único que se avisa es lo que ya está en el campo.
    this.engine?.on?.('wave:incoming', (data) => this.showArchetypeBanner(data?.archetype));
    // dev-7 fase 52: el "ultimate listo" y el "black hole listo" son
    // AVISOS de la partida como el del jefe: pasan por la misma pila.
    this.engine?.on?.('ultimate:ready', () => this.showUltimateReady('ultimate'));
    this.engine?.on?.('blackhole:ready', () => this.showUltimateReady('blackhole'));

    this._bindButtons();

    // v3 5/7 (BUG-004): reflejar la preferencia guardada del toggle ♪.
    // Hoy el default es música ON (sin clase .muted); si mañana se
    // persiste la preferencia, el botón nace coherente.
    if (this.audio.musicMuted) this.setMusicMuted(true);

    // dev-7 fase 37: el marco puede ser más estrecho que el canvas de
    // diseño (540 px). Ver refreshFrameMode().
    this.refreshFrameMode();
  }

  /**
   * dev-7 fase 37 — ¿El MARCO es más estrecho que el canvas de diseño?
   *
   * El canvas se dibuja a 540×880 lógicos y se estira con CSS al marco
   * (`width:100%`), pero el HUD es DOM con px FIJOS: en cualquier
   * pantalla cuyo marco mida menos de 540 px (todo móvil, y casi todo
   * portátil) la fila superior se salía y el marco la recortaba — el
   * reloj y el botón de ULTIMATE quedaban FUERA de la pantalla. Medido a
   * 390 px: el timer se salía 41 px y el ultimate 91 px (fuera entero).
   *
   * Aquí se marca `#marco-portrait` con `data-narrow` para que el CSS
   * reparta el HUD en dos filas (controles / datos) y lo compacte. Se
   * mide el MARCO, no el viewport: el marco es `alto × 0,614` de ancho,
   * así que en un landscape puede ser estrecho aunque la ventana sea
   * ancha.
   *
   * @returns {boolean} true si el marco es estrecho
   */
  refreshFrameMode() {
    const frame = this.root?.closest?.('#marco-portrait');
    if (!frame) return false;
    const narrow = frame.clientWidth > 0 && frame.clientWidth < CONFIG.CANVAS_W;
    if (narrow) frame.setAttribute('data-narrow', '');
    else frame.removeAttribute('data-narrow');
    this.refreshOverlayMode(frame);
    return narrow;
  }

  /**
   * dev-7 fase 57 — ¿El overlay es de PANTALLA COMPLETA?
   *
   * El escenario (#overlay-stage) mide el ancho del marco y el alto de
   * la pantalla. Cuando el marco es ALTO-limitado (escritorio) el
   * escenario coincide con él y el overlay se ve EXACTAMENTE como antes.
   * Cuando el marco es ANCHO-limitado (móvil) el escenario ocupa la
   * pantalla real y lleva el VELO UNIFORME (el mismo
   * para el menú, la pausa, el selector y el fin de partida → se ve
   * como una pantalla propia del juego, sin el mundo volcánico atrás).
   *
   * La marca se lee del DOM (el atributo `data-full` del escenario) y
   * la pone el CSS.
   *
   * @param {Element} frame el #marco-portrait
   * @returns {boolean} true si el overlay ocupa la pantalla real
   */
  refreshOverlayMode(frame = this.root?.closest?.('#marco-portrait')) {
    if (typeof document === 'undefined') return false;
    const stage = document.getElementById?.('overlay-stage') ?? null;
    if (!stage || !frame) return false;
    // El overlay es de PANTALLA COMPLETA cuando el marco es ANCHO-limitado
    // (el del teléfono: la pantalla es más angosta que alta y el marco la
    // ocupa de lado a lado). En escritorio el marco es alto-limitado (queda
    // angosto en una pantalla ancha) y el overlay se ve como antes.
    // OJO: desde la fase 58 el marco SIEMPRE llena el alto, así que la
    // diferencia de alturas ya no dice nada: lo dice el ANCHO.
    // Y se mide el ancho EXTERIOR (el borde va por dentro): `clientWidth`
    // es 2 px menor y con el borde el marco da justo los 374 px del móvil.
    const vw = document.documentElement?.clientWidth
      || (typeof window !== 'undefined' ? window.innerWidth : 0)
      || 0;
    const fw = frame.getBoundingClientRect?.().width || frame.clientWidth || 0;
    const full = fw > 0 && fw >= vw - 2 * 8 - 1;
    if (typeof stage.toggleAttribute === 'function') {
      stage.toggleAttribute('data-full', full);
    } else if (full) {
      stage.setAttribute?.('data-full', '');
    } else {
      stage.removeAttribute?.('data-full');
    }
    return full;
  }

  /** Datos frescos para SELECT_STAGE (dev-5): main ya refrescó progreso. */
  _selectData() {
    return typeof window !== 'undefined'
      ? window.__GDF__?.game?._selectData?.() ?? null
      : null;
  }

  /**
   * Datos frescos del PROTOCOLO (fase 69): main los arma en `_heatData()`
   * (mods, total, preset, recompensa, récord y los catálogos). El HUD no
   * toca el estado: si no hay juego vivo, `null` → pantalla de aviso.
   */
  _heatData() {
    return typeof window !== 'undefined'
      ? window.__GDF__?.game?._heatData?.() ?? null
      : null;
  }

  /**
   * Datos frescos de la SALA DE RÉCORDS (fase 70): main los arma en
   * `_recordsData()` (los cinco modos y sus próximos hitos ya resueltos).
   * El HUD no toca el progreso: si no hay juego vivo, `null` → aviso.
   */
  _recordsData() {
    return typeof window !== 'undefined'
      ? window.__GDF__?.game?._recordsData?.() ?? null
      : null;
  }

  // ---------- T8: estado de batalla (enemigos / DPS) ----------

  /**
   * Crea la tira de ESTADO DE BATALLA (segunda fila del HUD): el jugador
   * veía nivel, XP, score y timer, pero no cuántos enemigos quedaban
   * vivos ni su DPS real — no podía saber si el stage venía bien.
   *
   * dev-7 fase 43: la tira tenía 4 píldoras (OLAS / ENEMIGOS / DPS /
   * RACHA) y 2 DUPLICABAN datos que ya están en el HUD: "OLAS 3/33" era
   * la barra de progreso del stage (mismo dato) y "RACHA ×1" era el badge
   * ×1.5 del score. Se eliminan: quedan 2 píldoras y se libera el ancho.
   *
   * Los 2 read-outs se escriben en render() (payload de main.js:
   * enemiesAlive y dps).
   */
  _ensureStatusStrip() {
    if (this.el.status) return;
    const host = this.root; // #hud-top (fila 2, debajo de la principal)
    if (!host || typeof host.appendChild !== 'function') return;
    const div = document.createElement('div');
    div.id = 'hud-status';
    div.className = 'hud-status';
    div.setAttribute('role', 'status');
    div.setAttribute('aria-label', 'Estado de la batalla');
    div.innerHTML = buildStatusStripHtml();
    host.appendChild(div);
    this.el.status = div;
    this.el.statEnemies = div.querySelector('[data-stat="enemies"]');
    this.el.statDps = div.querySelector('[data-stat="dps"]');
  }

  /**
   * Pinta la tira de estado de batalla. Cache por valor: render() corre en
   * cada frame y solo se escribe en el DOM lo que CAMBIÓ.
   */
  _renderStatus(s) {
    if (!this.el.status) return;
    const st = formatBattleStatus(s);
    if (this.el.statEnemies && st.enemies !== this._lastStatEnemies) {
      this._lastStatEnemies = st.enemies;
      this.el.statEnemies.textContent = st.enemies;
    }
    if (this.el.statDps && st.dps !== this._lastStatDps) {
      this._lastStatDps = st.dps;
      this.el.statDps.textContent = st.dps;
    }
  }

  _bindButtons() {
    const on = (id, fn) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', fn);
    };
    on('btn-pause', () => {
      if (this.engine.state === 'PLAYING') this.engine.setState('PAUSED');
      else if (this.engine.state === 'PAUSED') this.engine.setState('PLAYING');
    });
    on('btn-speed', () => {
      this.audio.init();
      this.audio.resume();
      this.engine.cycleSpeed();
    });
    on('btn-ultimate', () => this.engine.emit('ultimate:fire'));
    on('btn-blackhole', () => this.engine.emit('blackhole:fire'));
    on('btn-combo', () => this.engine.emit('ui:combo_list'));
    on('btn-music', () => this.engine.emit('ui:music_toggle')); // v3 5/7
  }

  /**
   * Estado visual del toggle ♪ (v3 5/7): muted = icono atenuado con
   * tachado. Lo llama main._toggleMusic() tras cambiar audio.musicOn.
   */
  setMusicMuted(muted) {
    if (!this.el.music) return;
    this.el.music.classList.toggle('muted', !!muted);
    this.el.music.setAttribute('aria-pressed', String(!!muted));
  }

  // ---------- Visibilidad ----------
  setPlaying(v) {
    const on = !!v;
    this.root?.classList.toggle('hidden', !on);
    this.bottom?.classList.toggle('hidden', !on);
    // BUG 5: con el HUD oculto no se escribe nada en el DOM. Al volver a
    // mostrarlo se invalida el cache para que el primer frame refresque
    // barras, anillos y textos (el HUD queda en pausa = congelado).
    if (on && !this._hudVisible) this._invalidateRenderCache();
    this._hudVisible = on;
    this._syncHeatBadge(on);
  }

  /**
   * Badge del PROTOCOLO en el HUD (fase 69): `#hud-stage-name` lleva
   * `data-heat` y el CSS escribe " · HEAT N" detrás del nombre del stage.
   * El heat lo dice `game.runMods` (el HUD no lo calcula); fuera de la
   * batalla se borra para que no quede pegado en menú/pausa.
   *
   * @param {boolean} on el HUD está visible (batalla en curso)
   */
  _syncHeatBadge(on) {
    const el = this.el?.stageName;
    if (!el || typeof el.removeAttribute !== 'function') return;
    const heat = on && typeof window !== 'undefined'
      ? Math.max(0, payloadInt(window.__GDF__?.game?.runMods?.heat) ?? 0)
      : 0;
    if (heat > 0) el.setAttribute?.('data-heat', String(heat));
    else el.removeAttribute('data-heat');
  }

  /**
   * Nombre del stage que se escribe en el HUD. En SUPERVIVENCIA (fase 70)
   * el modo no tiene etapas: lo que orienta es la OLEADA, así que el texto
   * pasa a "Supervivencia · Oleada N". Con `_survivalWave` en 0 devuelve
   * el mismo compacto de siempre (campaña y ∞ no cambian).
   *
   * @param {string} name nombre crudo del stage (`game.stageName`)
   * @returns {string} etiqueta del HUD
   */
  _stageNameText(name) {
    const base = compactStageName(name);
    return this._survivalWave > 0 ? `${base} · Oleada ${this._survivalWave}` : base;
  }

  /**
   * Oleada de SUPERVIVENCIA en el HUD de batalla (fase 70). La llama main
   * al cerrar cada bloque de olas; con `0` (o sin dato) deja el nombre
   * pelado, que es el que manda `render()`. El sello de heat (`data-heat`)
   * es un ::after del CSS y NO se toca: los dos conviven.
   *
   * @param {number} n oleada actual (1..N); 0 = sin oleada
   */
  setSurvivalWave(n) {
    this._survivalWave = Math.max(0, payloadInt(n) ?? 0);
    const el = this.el?.stageName;
    if (!el) return;
    const text = this._stageNameText(this._lastStageName ?? 'Supervivencia');
    if (el.textContent !== text) el.textContent = text;
  }

  // ---------- Pantallas overlay (§2.10) ----------
  /**
   * name ∈ FSM §1.3. data = resumen STAGE_CLEAR/GAME_OVER (null =
   * plantillas estáticas). 'PLAYING' oculta el overlay y muestra el HUD.
   */
  /**
   * fase 75 — Limpia confirmaciones inline al cambiar de pantalla.
   *
   * Antes `_confirmingReset` no se reseteaba en los early return de
   * PLAYING/CARD_CHOICE, `_abandonPending` sobrevivía a la pausa y
   * `_perkResetArmed` a TORRETAS: al volver, el botón destructivo quedaba
   * armado y se ejecutaba con un solo click.
   */
  _resetTransientUi(name) {
    if (name !== 'MENU') this._confirmingReset = false;
    if (name !== 'PAUSED') this._abandonPending = null;
    if (name !== 'TORRETAS') this._perkResetArmed = {};
  }

  showScreen(name, data = null) {
    const el = this.overlayRoot;
    if (!el) return;
    const changed = this._lastScreen !== name;
    this._lastScreen = name;
    this._resetTransientUi(name);
    // Sin jefe fuera del campo: tampoco puede quedar el aviso de JEFE.
    if (name !== 'PLAYING') {
      this.hideBossBar();
      this.hideBossWarning();
      // fase 75: los avisos de fase/ultimate no deben quedar flotando
      // sobre el menú hasta que expire su timer.
      if (name !== 'CARD_CHOICE') this.clearAvisos();
    }
    if (name === 'PLAYING') {
      el.classList.add('hidden');
      this.setPlaying(true);
      return;
    }
    if (name === 'CARD_CHOICE') {
      // El modal de cartas (§4.4) es un nodo propio gestionado por
      // showCardChoice()/hideCardChoice(): el overlay genérico queda
      // oculto y el HUD sigue visible DEBAJO del modal.
      el.classList.add('hidden');
      this.setPlaying(true);
      return;
    }
    // dev-7 fase 57: el velo del MENÚ (claro, de "portada") y el de
    // TORRETAS solo se usan cuando el overlay NO es de pantalla
    // completa (escritorio): en móvil el velo es UNIFORME para todas las
    // pantallas (ver #overlay-stage[data-full] en el CSS).
    el.classList.toggle('backdrop-warm', name === 'MENU');
    // v3.5: TORRETAS también translúcida — la noche estrellada se ve detrás
    el.classList.toggle('backdrop-meta', name === 'TORRETAS');
    this.setPlaying(false);
    el.classList.remove('hidden');
    switch (name) {
      case 'MENU':
        el.innerHTML = this._screenMenu();
        this._bindThemePicker();
        this._bindResetProgress();
        break;
      case 'SELECT_STAGE': el.innerHTML = this._screenSelectStage(); break;
      // fase 69: el menú de handicaps del heat. No es UI de combate: solo
      // emite `heat-*` y main.js mueve el protocolo.
      // fase 71: cada ± re-renderiza la pantalla; conservar scroll y foco
      // para no devolver la vista al principio de la lista.
      case 'PROTOCOLO': {
        const prevScroll = readProtocolScroll(el);
        const prevFocus = readProtocolFocus(el);
        el.innerHTML = this._screenProtocol();
        restoreProtocolScroll(el, prevScroll);
        restoreProtocolFocus(el, prevFocus);
        break;
      }
      // fase 70: la sala de récords de los cinco modos. Tampoco es UI de
      // combate: solo emite `menu`/`select-stage`.
      case 'RECORDS': el.innerHTML = this._screenRecords(); break;
      // fase 72: créditos y licencias. Pantalla estática, sin payload ni
      // re-render en caliente (no tiene controles que muten estado).
      case 'CREDITS': el.innerHTML = this._screenCredits(); break;
      case 'PAUSED':
        el.innerHTML = this._screenPaused();
        this._bindPauseActions();
        // dev-7 fase 55: el selector de tema tambien esta en la pausa.
        this._bindThemePicker();
        break;
      case 'STAGE_CLEAR': el.innerHTML = this._screenStageClear(data); break;
      case 'GAME_OVER': el.innerHTML = this._screenGameOver(data); break;
      case 'TORRETAS': // v3.5 meta-game (pantalla del diseño base)
        // dev-7 fase 36: se guarda el scroll de la grilla ANTES de
        // re-crear el DOM y se restaura después. Sin esto, cada mejora
        // (MEJORAR / perk ✦ / REDISTRIBUIR) devolvía la vista al
        // principio y había que volver a scrollear.
        {
          const prevScroll = readMetaScroll(el);
          // dev-7 fase 41: la leyenda arranca CERRADA cada vez que se entra
          // a la pantalla (es un toggle, no un panel que queda pegado).
          this._legendOpen = false;
          // dev-7 fase 43: la explicación del banner también arranca
          // CERRADA (es un toggle, no una prosa que ocupa 130 px).
          this._bannerMoreOpen = false;
          el.innerHTML = this._screenTorretas();
          this._paintMetaIcons();
          this._bindMetaNav();
          // dev-7 fase 41: re-aplica el estado del toggle de la leyenda
          // (el re-render la vuelve a crear desde cero).
          this._showMetaSection('torretas');
          // dev-7 fase 43: y el del banner (idem: arranca cerrado).
          this._syncMetaBanner(false);
          restoreMetaScroll(el, prevScroll);
        }
        break;
      default: el.innerHTML = '';
    }
    // fase 75: al entrar a una pantalla nueva, el foco no puede quedar en
    // <body>. Se enfoca el título (tabindex -1) o el primer control; en
    // re-renders de la MISMA pantalla no se toca para no perder foco/scroll.
    if (changed) this._focusScreen(el);
  }

  /** Enfoca el encabezado o el primer control de una pantalla. */
  _focusScreen(root) {
    if (!root || typeof root.querySelector !== 'function') return;
    const target = root.querySelector('h1,h2,.screen-title')
      ?? root.querySelector('button:not([disabled]),[href],[tabindex]');
    if (!target || typeof target.focus !== 'function') return;
    const tag = target.tagName ?? '';
    if (/^H[12]$/.test(tag) && typeof target.hasAttribute === 'function'
      && !target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
    }
    try { target.focus({ preventScroll: true }); } catch (_err) {
      try { target.focus(); } catch (_err2) { /* sin foco */ }
    }
  }

  _screenMenu() {
    // dev-7 fase 13: selector de temas — reskinea el HUD/paneles/botones
    // (no el canvas del juego, ver theme.js). El activo queda marcado.
    // dev-7 fase 19: calidad gráfica (ver quality.js).
    // dev-7 fase 14: "Borrar progreso" — confirmación inline en 2 pasos.
    return buildMenuScreen({
      theme: loadTheme(),
      quality: loadQuality(),
      confirmingReset: this._confirmingReset,
      // dev-7 fase 59.4: el aviso de mejoras pendientes (el meta era
      // invisible: el jugador no sabía que podía subir sus torretas).
      meta: this._metaState(),
    });
  }

  /**
   * Clicks en los swatches de tema — aplica al instante y persiste.
   *
   * dev-7 fase 55: YA NO re-renderiza la pantalla al cambiar de tema (
   * eso hacia parpadear el menu entero y perder el foco del boton).
   * Ahora solo se marca el nuevo swatch activo y se actualiza el
   * rótulo: el resto de la pantalla no se toca.
   */
  _bindThemePicker() {
    this.overlayRoot.querySelectorAll('[data-theme-id]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.themeId;
        saveTheme(id);
        // dev-7 fase 54: el tema tiñe tambien el canvas del juego.
        applyThemeToGame(id, this.engine);
        // dev-7 fase 55: marcar el activo en el sitio, sin re-renderizar.
        this._markActiveTheme(id);
      });
    });
    // dev-7 fase 19: calidad gráfica — aplica YA al contexto/motor vivos
    // (sin esto habría que recargar la página para que surta efecto).
    this.overlayRoot.querySelectorAll('[data-quality-id]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.qualityId;
        saveQuality(id);
        // fase 75: aplicar a TODOS los contexts (visible + 4 caches
        // offscreen), no solo al visible. Antes el fondo/niebla/deck
        // seguían con shadowBlur en calidad baja hasta el próximo resize.
        this.engine.applyQualityTo(applyQualityToContext, id);
        this.engine.setParticleCap(particleCapFor(id));
        // dev-7 fase 29: la calidad también se aplica a la capa DOM (el
        // desenfoque de los overlays se apaga en "baja": sin GPU, el blur
        // del modal de cartas costaba 34 FPS → 4,6 FPS).
        applyQualityToDom(id);
        this.showScreen('MENU');
      });
    });
  }

  /** Clicks del botón "Borrar progreso" y su confirmación (dev-7 fase 14). */
  _bindResetProgress() {
    this.overlayRoot.querySelectorAll('[data-action-reset]').forEach((b) => {
      b.addEventListener('click', () => {
        const step = b.dataset.actionReset;
        if (step === 'ask') {
          this._confirmingReset = true;
        } else if (step === 'cancel') {
          this._confirmingReset = false;
        } else if (step === 'confirm') {
          resetProgress();
          resetMeta();
          this._confirmingReset = false;
          // Refleja el borrado en la Game viva (igual que el patrón ya
          // usado al mejorar una torreta desde TORRETAS). OJO: el campo
          // real es `progressData` (desbloqueo de stages) — `progress`
          // es un campo DISTINTO (0..1, progreso de oleada del HUD).
          if (typeof window !== 'undefined' && window.__GDF__?.game) {
            window.__GDF__.game.progressData = undefined;
            window.__GDF__.game.meta = undefined;
          }
        }
        this.showScreen('MENU');
      });
    });
  }

  _screenSelectStage() {
    // Datos reales de stages + desbloqueo persistente (dev-5, §2.9/§2.10)
    const data = this._selectData();
    if (!data) {
      // Fallback sin datos (debería ser transitorio): todo bloqueado salvo 1.
      // Sin payload no hay tarjetas del ∞: el endgame necesita el récord real.
      return this._renderStageList(
        [{ id: 1, name: 'Normal Stage 1', unlocked: true, bestScore: null }],
      );
    }
    // fase 67: el ∞ y el diario llegan ya calculados (`data.endless`).
    // fase 69: y el heat activo/récord en `data.heat` (tarjeta PROTOCOLO).
    // fase 70: y el récord de oleadas en `data.survival` (tarjeta ARCADE).
    return this._renderStageList(
      data.stages,
      data.endless ?? null,
      data.heat ?? null,
      data.survival ?? null,
    );
  }

  /**
   * Lista de stages agrupada por DÉCADAS (T1): cada bloque de 10 lleva
   * su cabecera y cada fila su identidad (punto de tema, insignia de
   * JEFE, récord). El HTML lo arma buildStageList() (función pura).
   *
   * dev-7 fase 59.4: encima de la lista va el AVISO de mejoras de
   * torretas pendientes — el selector es donde el jugador elige el
   * stage siguiente, o sea el último lugar donde puede ver que tiene
   * poder sin gastar antes de entrar a la battle. El aviso lleva su
   * botón a la pantalla de torretas (desde acá no hay otro camino).
   *
   * fase 67: `endless` es el payload del endgame (`_selectData().endless`).
   * Sin él (o cerrado) no se pinta ninguna tarjeta.
   *
   * fase 69: `heat` (`_selectData().heat`) antepone la tarjeta del
   * PROTOCOLO. Sin payload no se pinta: el fallback es el de siempre.
   *
   * fase 70: `survival` (`_selectData().survival`) añade la tarjeta del
   * modo arcade al final de las de arriba; sin payload tampoco se pinta.
   */
  _renderStageList(stages, endless = null, heat = null, survival = null) {
    return `
      <section class="screen">
        <div class="panel">
          <h2 class="screen-title">SELECCIONAR STAGE</h2>
          ${buildPendingNoticeHtml(this._metaState(), { withButton: true })}
          ${buildStageList(stages, { familyOf: stageFamilyOf, endless, heat, survival })}
        </div>
      </section>`;
  }

  /**
   * Pantalla PROTOCOLO (fase 69): el menú de handicaps del heat. El HTML
   * lo arma `buildProtocolHtml()` (pura) con `_heatData()`; sin juego vivo
   * cae en el aviso + VOLVER.
   */
  _screenProtocol() {
    return `
      <section class="screen">
        <div class="panel protocol-panel">${buildProtocolHtml(this._heatData())}</div>
      </section>`;
  }

  /**
   * Pantalla RÉCORDS (fase 70): los cinco modos en un solo sitio. El HTML
   * lo arma `buildRecordsHtml()` (pura) con `_recordsData()`; sin juego
   * vivo cae en el aviso + la salida.
   */
  _screenRecords() {
    return `
      <section class="screen">
        <div class="panel records-panel">${buildRecordsHtml(this._recordsData())}</div>
      </section>`;
  }

  /**
   * Pantalla CRÉDITOS Y LICENCIAS (fase 72). El HTML lo arma
   * `buildCreditsHtml()` (pura): el contenido es estático y vive embebido en
   * js/licenses.js, así que no hay `_data()` que consultar ni juego vivo que
   * pueda faltar. Mismo molde que `_screenRecords()`.
   */
  _screenCredits() {
    return `
      <section class="screen">
        <div class="panel credits-panel">${buildCreditsHtml()}</div>
      </section>`;
  }

  /**
   * dev-7 fase 39 — Pantalla de PAUSA.
   *
   * v5 5a/5: navegación real desde PAUSA — 4 acciones: continuar,
   * torretas (mejoras), menú principal y elegir stage (la anterior
   * etiqueta "SALIR AL MENÚ" iba al selector y engañaba). Salir de la
   * run por TORRETAS/MENÚ/ELEGIR STAGE abandona la partida en curso
   * (sin recompensa): startStage() arranca una run limpia.
   *
   * dev-7 fase 39: abandonarla ahora PIDE CONFIRMACIÓN (2 pasos): un
   * toque por error no puede costarte la run.
   *
   * Antes, "TORRETAS", "MENÚ PRINCIPAL" y "ELEGIR STAGE" destruían la
   * partida EN CURSO sin preguntar: un toque por error y perdías la run
   * (con sus fragmentos). Ahora pide confirmación (2 pasos, el mismo
   * patrón inline de "Borrar progreso" del menú).
   */
  _screenPaused() {
    const p = this._abandonPending;
    // Un botón destructivo: primero pregunta, después actúa (el
    // `data-action` real sólo aparece en el segundo paso).
    // dev-7 fase 41: los iconos son SVG inline (antes eran emoji del
    // sistema, que se veían distintos en cada plataforma).
    const exit = (act, label, icon) => (p === act
      ? `<button class="btn ghost danger" data-action="${act}">${UI_ICONS.aviso} ${label} · ¿SEGURO?</button>`
      : `<button class="btn ghost" data-abandon="${act}">${icon} ${label}</button>`);
    return `
      <section class="screen">
        <div class="panel">
          <h2 class="screen-title">PAUSA</h2>
          <p class="hint pause-hint">[P]/[Esc] continuar · [1][2][3] velocidad x1/x1.5/x2 · [Espacio] ultimate</p>
          ${buildDamageLegendHtml()}
          <div class="theme-picker" role="radiogroup" aria-label="Tema de la interfaz">
            ${buildThemeSwatches(loadTheme())}
          </div>
          <p class="theme-picker-label" data-theme-label>Tema: ${THEMES.find((t) => t.id === loadTheme())?.name ?? loadTheme()}</p>
          <button class="btn" data-action="resume">▶ CONTINUAR</button>
          ${exit('torretas', 'TORRETAS', UI_ICONS.torreta)}
          ${exit('menu', 'MENÚ PRINCIPAL', UI_ICONS.menu)}
          ${exit('select-stage', 'ELEGIR STAGE', UI_ICONS.batalla)}
          ${p ? '<button class="btn ghost" data-abandon-cancel>SEGUIR JUGANDO</button>' : ''}
        </div>
      </section>`;
  }

  /**
   * dev-7 fase 55 — Marca el tema activo SIN re-renderizar la pantalla.
   *
   * Actualiza la clase `active` y el `aria-checked` de los swatches (los
   * dos pueden estar en pantalla a la vez: el del menu y el de la pausa) y
   * el rótulo con el nombre del tema.
   *
   * @param {string} id id del tema activo
   */
  _markActiveTheme(id) {
    const root = this.overlayRoot;
    if (!root) return;
    root.querySelectorAll('[data-theme-id]').forEach((b) => {
      const activo = b.dataset.themeId === id;
      b.classList.toggle('active', activo);
      b.setAttribute('aria-checked', String(activo));
    });
    const nombre = THEMES.find((t) => t.id === id)?.name ?? id;
    const label = root.querySelector('.theme-picker-label[data-theme-label]');
    if (label) label.textContent = `Tema: ${nombre}`;
  }

  /**
   * dev-7 fase 39 — Enlaza los botones de "abandonar la partida" de la
   * pantalla de pausa (2 pasos: preguntar → confirmar).
   */
  _bindPauseActions() {
    const root = this.overlayRoot;
    if (!root) return;
    root.querySelectorAll('[data-abandon]').forEach((b) => {
      b.addEventListener('click', () => {
        this._abandonPending = b.dataset.abandon;
        this.showScreen('PAUSED');
      });
    });
    root.querySelectorAll('[data-abandon-cancel]').forEach((b) => {
      b.addEventListener('click', () => {
        this._abandonPending = null;
        this.showScreen('PAUSED');
      });
    });
  }

  /** STAGE CLEAR real (§2.10): score total + bonus desglosado + kills. */
  _screenStageClear(d) {
    if (!d) {
      return `<section class="screen"><div class="panel">
        <h2 class="screen-title gold">STAGE CLEAR</h2>
        <button class="btn" data-action="select-stage">ELEGIR STAGE</button>
      </div></section>`;
    }
    // fase 67: en el ∞ el botón CONTINÚA la profundidad (`endless.next` ya
    // viene calculado); en campaña sigue siendo "SIGUIENTE STAGE". Los dos
    // carteles pueden convivir en el S50: "campaña completa" + continuar.
    const endlessNext = payloadInt(d.endless?.next);
    const nextLabel = endlessNext != null
      ? `▶ CONTINUAR — ETAPA ${endlessNext}`
      : '▶ SIGUIENTE STAGE';
    // `isFinal` lo manda main.js; si todavía no llega se DEDUCE del último
    // stage de la campaña (es el único que no es ∞), para no perder el
    // cartel de "campaña completa" que ya existía.
    const campaignFinal = d.isFinal === true
      || (d.isFinal == null && d.endless == null && d.stageId === STAGES.length);
    return `
      <section class="screen">
        <div class="panel">
          <img class="clear-sparkle tl" src="assets/sprites/ui_tinted/sparkle_gold.png" alt="">
          <img class="clear-sparkle tr" src="assets/sprites/ui_tinted/sparkle_gold.png" alt="">
          <img class="clear-sparkle br" src="assets/sprites/ui_tinted/sparkle_gold.png" alt="">
          <h2 class="screen-title gold">STAGE CLEAR</h2>
          <p class="hint">${esc(d.stageName)} · ${fmtTime(d.time)}</p>
          <dl class="summary">
            <div><dt>SCORE TOTAL</dt><dd>${fmt(d.score)}</dd></div>
            ${d.scoreKills != null ? `<div><dt>&nbsp;· por kills</dt><dd>${fmt(d.scoreKills)}</dd></div>` : ''}
            <div><dt>BONUS DE OLA/CLEAR</dt><dd class="ok">+${fmt(d.clearBonus)}</dd></div>
            <div><dt>NIVEL ALCANZADO</dt><dd>Lv.${d.lv}</dd></div>
            ${d.cards ? `<div><dt>MEJORAS APLICADAS</dt><dd>${d.cards}</dd></div>` : ''}
            <div><dt>KILLS</dt><dd>${d.kills}</dd></div>
            ${d.leaks != null ? `<div><dt>FUGAS</dt><dd>${d.leaks ?? 0}</dd></div>` : ''}
            ${d.hpFrac != null ? `<div><dt>INTEGRIDAD DE LA BASE</dt><dd>${Math.round(d.hpFrac * 100)} %</dd></div>` : ''}
            ${d.metaFrags ? `<div><dt>FRAGMENTOS META (por torreta)</dt><dd class="ok">+${d.metaFrags}${d.metaFirst ? ' · ×2 1ª vez' : ''}</dd></div>` : ''}
            ${d.metaGold ? `<div><dt>ORO META${d.metaGoldBonus ? ' · campaña completa' : ''}</dt><dd class="ok">+${d.metaGold}</dd></div>` : ''}
            ${endlessSummaryRows(d.endless, { milestone: true })}
            ${heatSummaryRows(d.heat)}
            ${dailySummaryRow(d.daily)}
          </dl>
          <div class="stage-actions">
          ${campaignFinal ? '<p class="hint ok">¡CAMPAÑA COMPLETA! Seguí en el modo infinito</p>' : ''}
          ${d.hasNext ? `<button class="btn big" data-action="next-stage">${nextLabel}</button>` : ''}
          ${d.metaFrags ? `<button class="btn big" data-action="torretas" title="Gastar los fragmentos que ganaste en subir de nivel tus torretas">${UI_ICONS.torreta} MEJORAR TORRETAS</button>` : ''}
          <button class="btn ghost" data-action="retry">↻ REINTENTAR</button>
          <button class="btn" data-action="select-stage">ELEGIR STAGE</button>
          </div>
        </div>
      </section>`;
  }

  /** GAME OVER real (§2.10): score, stage alcanzado, kills. */
  _screenGameOver(d) {
    if (!d) {
      return `<section class="screen"><div class="panel">
        <h2 class="screen-title danger"><img class="danger-icon" src="assets/sprites/ui_tinted/icon_boss_warning_red.png" alt="">LA BASE HA CAÍDO</h2>
        <button class="btn" data-action="menu">MENÚ</button>
      </div></section>`;
    }
    return `
      <section class="screen">
        <div class="panel">
          <h2 class="screen-title danger"><img class="danger-icon" src="assets/sprites/ui_tinted/icon_boss_warning_red.png" alt="">LA BASE HA CAÍDO</h2>
          <p class="hint">${esc(d.stageName)}</p>
          <dl class="summary">
            <div><dt>SCORE</dt><dd>${fmt(d.score)}</dd></div>
            <div><dt>KILLS</dt><dd>${d.kills}</dd></div>
            ${d.leaks != null ? `<div><dt>FUGAS</dt><dd>${d.leaks ?? 0}</dd></div>` : ''}
            ${d.maxHp ? `<div><dt>INTEGRIDAD</dt><dd>${Math.round(100 * (d.hpLeft ?? 0) / d.maxHp)} %</dd></div>` : ''}
            <div><dt>TIEMPO</dt><dd>${fmtTime(d.time)}</dd></div>
            ${heatSummaryRows(d.heat, { defeat: true })}
            ${dailySummaryRow(d.daily)}
          </dl>
          ${endlessDefeatBlock(d.endless)}
          ${survivalDefeatBlock(d.survival)}
          ${d.fragsLost ? `
          <div class="lost-box">
            <p class="lost-title">LO QUE LOGRASTE</p>
            <dl class="summary">
              <div><dt>NIVEL ALCANZADO</dt><dd>Lv.${d.lv ?? 1}</dd></div>
              <div><dt>MEJORAS APLICADAS</dt><dd>${d.cards ?? 0}</dd></div>
            </dl>
            <p class="lost-title">LO QUE NO TE LLEVASTE</p>
            <dl class="summary">
              <div><dt>FRAGMENTOS META</dt><dd>${d.fragsLost}</dd></div>
              <div><dt>ORO META</dt><dd>${d.goldLost ?? 0}</dd></div>
            </dl>
          </div>` : ''}
          <button class="btn big" data-action="retry">↻ REINTENTAR</button>
          <button class="btn" data-action="select-stage">ELEGIR STAGE</button>
          <button class="btn ghost" data-action="menu">${UI_ICONS.menu} MENÚ PRINCIPAL</button>
        </div>
      </section>`;
  }

  // ---------- v3.5 META-GAME: pantalla TORRETAS (reference-torretas.jpg) ----------

  /** Estado meta actual (la Game lo recarga al entrar; fallback a storage). */
  _metaState() {
    return typeof window !== 'undefined' ? (window.__GDF__?.game?.meta ?? loadMeta()) : loadMeta();
  }

  /**
   * Pantalla meta del diseño base: barra superior (badge circular + nombre
   * + oro) + grilla de las torretas del meta (fragmentos por card) + nav
   * inferior fija de 5 pestañas con "Torreta" activa.
   *
   * dev-7 fase 18 (pedido del usuario, sigue vigente tras el trabajo
   * externo de fases 16-17 — confirmado con perks-choice-torretas.png):
   * el banner de arriba mostraba "Incremento Total del DAÑO Crítico" con
   * el viejo `critBonusPct()` — un número que NUNCA se lee en el combate real (el
   * crítico de verdad ahora sale de los perks elegidos, `critChanceAdd`/
   * `critDmgMul` en towers.js/enemies.js — completamente aparte). Sigue
   * siendo el mismo "recurso sin usar" que el usuario reportó, con perks
   * A/B de por medio. Reemplazado por una explicación clara y siempre
   * visible del proceso real: fragmentos (subir de nivel, compartidos
   * entre todas las torretas) vs. oro (redistribuir perks elegidos). El
   * botón "＋" de oro también salía (implica una compra que no existe — no
   * hay tienda).
   *
   * El HTML lo arma buildTorretasScreen() (puro, testeable sin DOM) y
   * TODOS los conteos salen de META_TOWERS/META_MAX_LEVEL.
   */
  _screenTorretas() {
    // El HTML lo arma buildTorretasScreen() (función pura, testeable en
    // Node sin DOM): los conteos de torretas y niveles salen de los DATOS
    // (META_TOWERS / META_MAX_LEVEL), nunca de literales.
    return buildTorretasScreen(this._metaState(), {
      resetArmed: this._perkResetArmed,
    });
  }

  /** Dibuja los íconos canvas de las tarjetas (render REAL de la torre)
   *  y los del bestiario (render REAL del enemigo). */
  _paintMetaIcons() {
    const canvases = this.overlayRoot?.querySelectorAll('[data-meta-icon]') ?? [];
    for (const c of canvases) renderTowerIcon(c, c.dataset.metaIcon);
    // dev-7 fase 40: los iconos del bestiario (el enemigo de verdad).
    // fase 65/68: las fichas de VARIANTE de élite pasan su id por
    // `data-bestiary-variant` para que el icono dibuje el rasgo (escudo,
    // líneas de velocidad, aura de cura, placas...) — el mismo render que
    // en el campo, no un dibujo aparte.
    const bestiario = this.overlayRoot?.querySelectorAll('[data-bestiary-icon]') ?? [];
    for (const c of bestiario) {
      renderEnemyIcon(c, c.dataset.bestiaryIcon, c.dataset.bestiaryVariant ?? null);
    }
  }

  /** Flash del hint #meta-hint (re-query cada vez: sobrevive re-renders). */
  _metaFlash(text, ms = 1600) {
    const hint = this.overlayRoot?.querySelector('#meta-hint');
    if (!hint) return;
    hint.textContent = text;
    hint.classList.remove('show');
    void hint.offsetWidth;
    hint.classList.add('show');
    clearTimeout(this._metaHintT);
    this._metaHintT = setTimeout(() => hint.classList.remove('show'), ms);
  }

  /** Panel PROGRESO con datos reales del meta (v5 5b/5, sin MTX). dev-7
   *  fase 18: la fila "DAÑO CRÍTICO" mostraba un bono que no se usa en
   *  el combate real (el crítico de verdad sale de los perks elegidos,
   *  no de esta fórmula global) — reemplazada por el bono de daño que
   *  SÍ es real (metaDmgMul, el mismo que ya se ve por torreta arriba).
   *  dev-7 fase 39: se renombró de "DEFENSA" a "PROGRESO" (no defendía
   *  nada: mostraba la progresión) y pasó a ser una SECCIÓN propia. */
  _metaProgresoHtml(meta) {
    const maxedCount = META_TOWERS.filter((t) => (meta.levels?.[t.key] ?? 1) >= META_MAX_LEVEL).length;
    // dev-7 fase 59.4: el PODER del meta (el multiplicador REAL de daño
    // que leen las torres en el combate) frente al que tenía sin
    // mejoras (×1,0): es lo que hace fuerte al jugador.
    const power = metaPowerMul(meta);
    return `
      <div class="meta-def-row"><span class="meta-def-k">Poder en partida</span><b>${fmtMul(power)} de daño (sin mejoras: ×1,0)</b></div>
      <div class="meta-def-row"><span class="meta-def-k">Bono de daño por nivel</span><b>+${Math.round(META_DMG_PER_LEVEL * 100)}% (por torreta, acumulable)</b></div>
      <div class="meta-def-row"><span class="meta-def-k">Niveles totales de torreta</span><b>${totalMetaLevels(meta)}</b></div>
      <div class="meta-def-row"><span class="meta-def-k">Torretas al máximo</span><b>${maxedCount} de ${META_TOWERS.length}</b></div>
      <div class="meta-def-row"><span class="meta-def-k">Victorias</span><b>${meta.victories ?? 0}</b></div>
      <div class="meta-def-row"><span class="meta-def-k">Fragmentos por victoria</span><b>${META_FRAG_PER_VICTORY} (×2 la primera vez por stage)</b></div>
      <div class="meta-def-row"><span class="meta-def-k">Oro</span><b>${metaGold(meta)}● (se gasta en REDISTRIBUIR perks)</b></div>`;
  }

  /**
   * dev-7 fase 39 — Cambia de SECCIÓN dentro de la pantalla de torretas.
   *
   * Antes la nav tenía 5 pestañas y sólo 2 eran secciones reales: "Tienda"
   * y "Enemigos" eran callejones sin salida (un toast cada uno) y
   * "Defensa" abría un panel ABSOLUTO que tapaba la grilla. Ahora hay 3
   * secciones (Torreta, Bestiario, Progreso) y 2 salidas (Batalla, Menú).
   *
   * Las secciones son contenedores propios: se muestra una y se ocultan
   * las otras, y sólo se resalta la pestaña de la sección visible (antes
   * la pestaña de un callejón sin salida quedaba resaltada con la grilla
   * delante: la UI se contradecía).
   *
   * dev-7 fase 41: la LEYENDA de tipos de daño es un TOGGLE dentro de la
   * sección "Torreta" (ver _toggleMetaLegend): abierta, reemplaza la
   * grilla —si no, la tabla queda aplastada y su última fila detrás de
   * la nav fija—; cerrada, la grilla vuelve a ocupar la pantalla.
   */
  _showMetaSection(name) {
    const root = this.overlayRoot;
    if (!root) return;
    // Al salir de la sección "Torreta" la leyenda se cierra: es parte de
    // esa sección, no un panel flotante.
    if (name !== 'torretas') this._legendOpen = false;
    const VIEWS = {
      bestiario: ['meta-bestiario'],
      progreso: ['meta-progreso'],
    };
    for (const [view, ids] of Object.entries(VIEWS)) {
      const on = view === name;
      for (const id of ids) {
        const el = root.querySelector('#' + id);
        if (el) el.classList.toggle('hidden', !on);
      }
    }
    // El banner y la grilla son de la sección "Torreta"; con la leyenda
    // abierta ceden el lugar (la tabla necesita el ancho y el alto).
    const legendOpen = name === 'torretas' && this._legendOpen;
    const banner = root.querySelector('#meta-banner');
    if (banner) banner.classList.toggle('hidden', name !== 'torretas' || legendOpen);
    const grid = root.querySelector('#meta-grid');
    if (grid) grid.classList.toggle('hidden', name !== 'torretas' || legendOpen);
    // dev-7 fase 59.4: la línea de PODER y el botón "SUBIR TODO" son de
    // la sección "Torreta" también: se ocultan con la leyenda (que
    // necesita el alto) y con las otras secciones.
    for (const id of ['#meta-power', '#meta-upgrade-all-bar']) {
      const el = root.querySelector(id);
      if (el) el.classList.toggle('hidden', name !== 'torretas' || legendOpen);
    }
    this._syncMetaLegend(legendOpen);
    if (name === 'progreso') {
      const sec = root.querySelector('#meta-progreso');
      if (sec) sec.innerHTML = this._metaProgresoHtml(this._metaState());
    }
    // El resalte: sólo la sección visible (las salidas nunca se resaltan).
    root.querySelectorAll('[data-meta-tab]').forEach((x) => {
      if (x.dataset.action) return;
      x.classList.toggle('active', x.dataset.metaTab === name);
    });
  }

  /**
   * dev-7 fase 41 — Refleja el estado del TOGGLE de la leyenda en el DOM.
   *
   * - la leyenda se muestra/oculta con la CLASE "hidden" (la que usa todo
   *   el resto de la UI), NUNCA con el atributo hidden del HTML: son dos
   *   mecanismos distintos y mezclarlos deja el nodo sin caja;
   * - el botón lleva `aria-expanded` (accesibilidad) y su texto cambia:
   *   cerrado dice "VER TIPOS DE DAÑO", abierto "OCULTAR TIPOS DE DAÑO".
   *
   * @param {boolean} [open] el estado a aplicar (por defecto, el actual)
   * @returns {boolean} el estado que quedó
   */
  _syncMetaLegend(open = this._legendOpen) {
    const root = this.overlayRoot;
    if (!root) return !!open;
    this._legendOpen = !!open;
    const legend = root.querySelector('#meta-legend');
    if (legend) legend.classList.toggle('hidden', !this._legendOpen);
    const btn = root.querySelector('[data-meta-legend-toggle]');
    if (btn) {
      btn.setAttribute('aria-expanded', this._legendOpen ? 'true' : 'false');
      btn.textContent = this._legendOpen ? 'OCULTAR TIPOS DE DAÑO' : 'VER TIPOS DE DAÑO';
    }
    return this._legendOpen;
  }

  /**
   * dev-7 fase 41 — Abre/cierra la LEYENDA de tipos de daño.
   *
   * Antes la tabla estaba siempre abierta al final de la pantalla de
   * torretas, FUERA del área scrolleable, y en móvil quedaba detrás de
   * la nav inferior (la última fila era ilegible). Ahora es un toggle:
   * abierta, la tabla tiene su propio scroll y se lee ENTERA.
   *
   * @param {boolean} [force] abre (true) o cierra (false) sin alternar
   */
  _toggleMetaLegend(force) {
    const next = force === undefined ? !this._legendOpen : !!force;
    this._legendOpen = next;
    // La leyenda es parte de la sección "Torreta": al abrirla se vuelve a
    // esa sección (si el jugador estaba en el bestiario o el progreso).
    this._showMetaSection('torretas');
    return this._legendOpen;
  }

  /**
   * dev-7 fase 43 — Refleja el estado del TOGGLE del banner en el DOM.
   *
   * - la explicación se muestra/oculta con la CLASE "hidden" (la que usa
   *   todo el resto de la UI), NUNCA con el atributo hidden del HTML: son
   *   dos mecanismos distintos y mezclarlos deja el nodo sin caja;
   * - el botón lleva `aria-expanded` (accesibilidad) y su aria-label
   *   cambia: cerrado dice "Ver cómo se sube de nivel", abierto
   *   "Ocultar cómo se sube de nivel".
   *
   * @param {boolean} [open] el estado a aplicar (por defecto, el actual)
   * @returns {boolean} el estado que quedó
   */
  _syncMetaBanner(open = this._bannerMoreOpen) {
    const root = this.overlayRoot;
    if (!root) return !!open;
    this._bannerMoreOpen = !!open;
    const more = root.querySelector('#meta-banner-more');
    if (more) more.classList.toggle('hidden', !this._bannerMoreOpen);
    const btn = root.querySelector('[data-meta-banner-toggle]');
    if (btn) {
      btn.setAttribute('aria-expanded', this._bannerMoreOpen ? 'true' : 'false');
      btn.setAttribute('aria-label', this._bannerMoreOpen
        ? 'Ocultar cómo se sube de nivel'
        : 'Ver cómo se sube de nivel');
    }
    return this._bannerMoreOpen;
  }

  /**
   * dev-7 fase 43 — Abre/cierra la EXPLICACIÓN del banner "¿Cómo subo de
   * nivel?".
   *
   * Antes era una prosa siempre visible que se comía 130 px de una
   * pantalla de 844 (medido) para explicar algo que se lee UNA vez. Ahora
   * la cabecera (título + contador) queda siempre visible y la
   * explicación está plegada detrás del botón "?".
   *
   * @param {boolean} [force] abre (true) o cierra (false) sin alternar
   * @returns {boolean} el estado que quedó
   */
  _toggleMetaBanner(force) {
    const next = force === undefined ? !this._bannerMoreOpen : !!force;
    this._bannerMoreOpen = next;
    this._syncMetaBanner(this._bannerMoreOpen);
    return this._bannerMoreOpen;
  }

  /** Nav inferior: las 3 SECCIONES (Torreta/Bestiario/Progreso) y las 2
   *  SALIDAS (Batalla/Menú, que las maneja bindActions); MEJORAR →
   *  upgradeTower + re-render + feedback. */
  _bindMetaNav() {
    const root = this.overlayRoot;
    if (!root) return;
    const flash = (text, ms) => this._metaFlash(text, ms);
    root.querySelectorAll('[data-meta-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.action) return; // Batalla / Menú: los maneja bindActions
        const tab = b.dataset.metaTab;
        if (tab === 'torretas' || tab === 'bestiario' || tab === 'progreso') {
          this._showMetaSection(tab);
        }
      });
    });
    // dev-7 fase 41: el botón de la LEYENDA de tipos de daño (abre/cierra
    // la tabla). No es una pestaña: es un toggle de la sección "Torreta".
    root.querySelectorAll('[data-meta-legend-toggle]').forEach((b) => {
      b.addEventListener('click', () => this._toggleMetaLegend());
    });
    // dev-7 fase 43: el botón "?" del banner "¿Cómo subo de nivel?" (abre
    // y cierra la explicación plegable).
    root.querySelectorAll('[data-meta-banner-toggle]').forEach((b) => {
      b.addEventListener('click', () => this._toggleMetaBanner());
    });
    // Botón MEJORAR por card (v5 5b/5): gasta fragmentos → +1 nivel YA.
    root.querySelectorAll('[data-meta-upgrade]').forEach((b) => {
      b.addEventListener('click', () => {
        const res = upgradeTower(this._metaState(), b.dataset.metaUpgrade);
        if (!res.ok) {
          flash(res.reason === 'maxed'
            ? `Esta torreta ya está al máximo (Nvl.${META_MAX_LEVEL})`
            : `Faltan fragmentos: ganá stages para recibir ${META_FRAG_PER_VICTORY}`);
          return;
        }
        // Mantener la vista al día: la Game relee storage al volver (toTorretas)
        if (typeof window !== 'undefined' && window.__GDF__?.game) {
          window.__GDF__.game.meta = res.meta;
        }
        try { this.audio.sfx('levelup'); } catch (_err) { /* sin ctx aún */ }
        this.showScreen('TORRETAS'); // re-render: banner/barra/botones frescos
        // El bono se anuncia con el multiplicador REAL (curva × hitos).
        const type = META_TOWERS.find((t) => t.key === b.dataset.metaUpgrade)?.type;
        const pct = type ? Math.round((metaDmgMul(type, res.meta) - 1) * 100) : 0;
        requestAnimationFrame(() => flash(`¡TORRETA MEJORADA! +${pct}% daño en partida`));
      });
    });
    // dev-7 fase 59.4: SUBIR TODO LO POSIBLE — UN toque sube cada
    // torreta lo que pueda (el mismo camino que el botón MEJORAR de
    // cada card: guarda el meta, suena, repinta la pantalla y avisa).
    // Sin esto la campaña entera son ~484 clics de MEJORAR.
    root.querySelectorAll('[data-meta-upgrade-all]').forEach((b) => {
      b.addEventListener('click', () => {
        const res = upgradeAllTowers(this._metaState());
        if (!res.levels) {
          flash('No hay mejoras pendientes: ganá stages para sumar fragmentos');
          return;
        }
        // Mantener la vista al día: la Game relee storage al volver (toTorretas)
        if (typeof window !== 'undefined' && window.__GDF__?.game) {
          window.__GDF__.game.meta = res.meta;
        }
        try { this.audio.sfx('levelup'); } catch (_err) { /* sin ctx aún */ }
        this.showScreen('TORRETAS'); // re-render: niveles ya subidos
        // El aviso dice el PODER nuevo (el multiplicador real del meta).
        const mul = metaPowerMul(res.meta);
        requestAnimationFrame(() => flash(
          `¡${res.levels} NIVEL${res.levels === 1 ? '' : 'ES'} SUBIDO${res.levels === 1 ? '' : 'S'}! Tus torretas hacen ${fmtMul(mul)} de daño`,
        ));
      });
    });
    // fase 16: ELEGIR PERK pendiente → modal A/B (primer tier sin elegir).
    root.querySelectorAll('[data-perk-pick]').forEach((b) => {
      b.addEventListener('click', () => this._showPerkChoiceModal(b.dataset.perkPick));
    });
    // fase 16: REDISTRIBUIR — 2 pasos inline (sin confirm() nativo).
    root.querySelectorAll('[data-perk-reset-ask]').forEach((b) => {
      b.addEventListener('click', () => {
        const meta = this._metaState();
        const gold = meta.gold ?? 0;
        if (gold < PERK_RESET_COST) {
          flash(`Te faltan ${PERK_RESET_COST - gold} de oro para redistribuir (ganá stages para recibirlo)`);
          return;
        }
        this._perkResetArmed = { ...(this._perkResetArmed ?? {}), [b.dataset.perkResetAsk]: true };
        this.showScreen('TORRETAS');
      });
    });
    root.querySelectorAll('[data-perk-reset-cancel]').forEach((b) => {
      b.addEventListener('click', () => {
        this._perkResetArmed = { ...(this._perkResetArmed ?? {}), [b.dataset.perkResetCancel]: false };
        this.showScreen('TORRETAS');
      });
    });
    root.querySelectorAll('[data-perk-reset-confirm]').forEach((b) => {
      b.addEventListener('click', () => {
        const res = resetPerks(b.dataset.perkResetConfirm, this._metaState());
        this._perkResetArmed = { ...(this._perkResetArmed ?? {}), [b.dataset.perkResetConfirm]: false };
        if (!res.ok) {
          flash(res.reason === 'insufficient' ? 'Oro insuficiente para redistribuir' : 'No se pudo redistribuir');
          this.showScreen('TORRETAS');
          return;
        }
        // Mantener la vista al día: la Game relee storage al volver (toTorretas)
        if (typeof window !== 'undefined' && window.__GDF__?.game) {
          window.__GDF__.game.meta = res.meta;
        }
        try { this.audio.sfx('levelup'); } catch (_err) { /* sin ctx aún */ }
        this.showScreen('TORRETAS');
        requestAnimationFrame(() => flash('Perks redistribuidos: volvé a elegirlos'));
      });
    });
  }

  /**
   * fase 16 — Modal de elección A/B (reutiliza #card-choice, mismo patrón
   * que CARD_CHOICE). Muestra el PRIMER tier pendiente de la torreta y
   * persiste con setPerkChoice; al elegir re-renderiza la vista.
   *
   * Accesibilidad: rol de diálogo (aria-label por tipo), Esc cierra SOLO
   * este modal (sin navegar) y el foco entra al primer botón de opción.
   */
  _showPerkChoiceModal(type) {
    this._ensureCardModal();
    if (!this.cardModal) return;
    const meta = this._metaState();
    const pendientes = pendingPerkTiers(type, meta);
    const entry = META_TOWERS.find((t) => t.type === type);
    if (!pendientes.length || !entry) return;
    const tierIdx = pendientes[0];
    const opts = getPerkOptions(type, tierIdx);
    const tierLv = (tierIdx + 1) * PERK_EVERY;
    if (!opts) return;
    const restantes = pendientes.length - 1;
    this._captureFocus();
    this.cardModal.innerHTML = `
      <h2 class="card-title">Perk · ${entry.name}</h2>
      <p class="hint">Nvl.${tierLv} desbloqueado — elegí 1 de 2${restantes > 0 ? ` (${restantes} tier pendiente más)` : ''}</p>
      <div class="perk-choice-row">
        <button class="perk-choice-btn" data-perk-choose="0">
          <b>${opts.A.desc}</b>
          <i>Opción A</i>
        </button>
        <button class="perk-choice-btn" data-perk-choose="1">
          <b>${opts.B.desc}</b>
          <i>Opción B</i>
        </button>
      </div>
      <p class="hint">La opción no elegida queda descartada · REDISTRIBUIR (${PERK_RESET_COST}●) la devuelve</p>
      <button class="btn ghost small" data-perk-close>CERRAR</button>`;
    this.cardModal.classList.remove('hidden');
    this._modalKind = 'perk';
    this._setModalLabel(`Elegí un perk para ${entry.name} — Nvl.${tierLv}`);
    // El foco entra al primer botón de opción (accesibilidad de teclado).
    const firstChoice = this.cardModal.querySelector('[data-perk-choose]');
    if (firstChoice && typeof firstChoice.focus === 'function') {
      try { firstChoice.focus(); } catch (_err) { /* sin foco */ }
    }
    this.cardModal.querySelectorAll('[data-perk-close]').forEach((b) => {
      b.addEventListener('click', () => this.hideCardChoice());
    });
    this.cardModal.querySelectorAll('[data-perk-choose]').forEach((b) => {
      b.addEventListener('click', () => {
        const res = setPerkChoice(type, tierIdx, Number(b.dataset.perkChoose), meta);
        if (!res.ok) {
          this.hideCardChoice();
          this._metaFlash('No se pudo guardar la elección', 2200);
          return;
        }
        if (typeof window !== 'undefined' && window.__GDF__?.game) {
          window.__GDF__.game.meta = res.meta;
        }
        try { this.audio.sfx('levelup'); } catch (_err) { /* sin ctx aún */ }
        // Re-render ANTES de cerrar: así el foco devuelto por
        // hideCardChoice() cae en el botón ✦ de la card nueva (el de la
        // vista vieja ya fue reemplazado por el re-render).
        this.showScreen('TORRETAS'); // re-render: card con el perk elegido
        this.hideCardChoice();
        this._metaFlash('Perk elegido', 1800);
      });
    });
  }

  /** Delegación de clicks de los overlays (main.js cablea las acciones). */
  bindActions(handlers) {
    if (!this.overlayRoot) return;
    this.overlayRoot.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const fn = handlers[btn.dataset.action];
      if (fn) fn(btn); // el handler recibe el botón (data-stage, etc.)
    });
  }

  // ---------- Modal CARD_CHOICE (v3-1/7, §4.4/D7) ----------

  /**
   * dev-7 fase 57 — El HOST de los overlays: el escenario de PANTALLA
   * COMPLETA (#overlay-stage).
   *
   * Antes los nodos de los overlays (#card-choice y #combo-panel) se
   * colgan de `this.root.parentElement`, que es #marco-portrait: su
   * caja era la del MARCO (607 px en un móvil de 390×844) y el
   * `overflow: hidden` del marco los recortaba → la columna de cartas
   * scrolleaba dentro (432 px útiles de 500) y la 3.ª carta se cortaba
   * a media descripción, con 227 px de negro sin usar abajo.
   *
   * Ahora cuelgan de #overlay-stage, un nodo fijo FUERA del marco: la
   * caja es la del marco en ancho y la de la pantalla en alto (el
   * CSS hace la cuenta) → en escritorio el overlay se ve igual que
   * antes y en móvil las 3 cartas entran enteras.
   *
   * @returns {Element|null} el nodo donde colgar los overlays
   */
  _overlayHost() {
    if (typeof document === 'undefined') return null;
    // El escenario (index.html). Si no está (DOM de prueba), el marco
    // como antes: nunca se rompe el juego por falta de un nodo.
    const stage = document.getElementById?.('overlay-stage') ?? null;
    if (stage) return stage;
    return this.root?.parentElement ?? document.body ?? null;
  }

  /**
   * Crea el nodo del modal en el escenario de overlays (#overlay-stage)
   * si no existe.
   */
  _ensureCardModal() {
    if (this.cardModal) return;
    const host = this._overlayHost(); // #overlay-stage (pantalla real)
    if (!host) return;
    const div = document.createElement('div');
    div.id = 'card-choice';
    div.classList.add('hidden');
    // dev-7 fase 46: el velo (oscuro + blur) es la clase CSS .overlay-veil,
    // la MISMA que usa el panel de combos: no se replica en inline.
    // (El nodo lo comparten el modal de cartas y el de perk: la clase no
    // rompe ninguno — solo pinta el fondo.)
    div.classList.add(OVERLAY_VEIL_CLASS);
    // Semántica de diálogo modal (accesibilidad): el nodo lo comparten el
    // modal de cartas y el de perk (el panel de combo tiene el suyo:
    // #combo-panel, ver _ensureComboPanel).
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-label', 'Selección de mejora');
    host.appendChild(div);
    // Tap en carta → evento canónico 'card:pick' (main.js aplica y sigue)
    div.addEventListener('click', (ev) => {
      const card = ev.target.closest('[data-card-id]');
      if (!card) return;
      // T4 — la carta ya se eligió: no se puede volver a tapar.
      if (card.classList.contains('dealt-out')) return;
      // T4 — anti-doble-toque: dos toques seguidos sobre la MISMA oferta
      // cuentan como uno (el modal se re-renderiza con la oferta siguiente
      // bajo el dedo y el 2º toque aplicaba OTRA carta).
      const now = Date.now();
      const ok = canPickCard({
        lastPickAt: this._lastCardPickAt,
        now,
        pickedIds: this._cardPickedIds,
        offerId: this._cardOfferId,
        cardId: card.dataset.cardId,
      });
      if (!ok) return;
      // Marca la carta: se atenúa (CSS .dealt-out) y deja de capturar toques.
      card.classList.add('dealt-out');
      this._cardPickedIds.push(card.dataset.cardId);
      this._lastCardPickAt = { at: now, offerId: this._cardOfferId };
      this.engine.emit('card:pick', { cardId: card.dataset.cardId });
    });
    // Teclado dentro del modal: Esc cierra SOLO el modal de perk (el de
    // cartas no se puede cerrar sin elegir, o la run queda trabada) y Tab
    // queda atrapado dentro del diálogo (focus trap).
    div.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (this._modalKind !== 'perk') return;
        // stopPropagation: el Esc NO debe seguir al window (main.js
        // navegaría al menú y dejaría el modal arriba del menú).
        ev.stopPropagation();
        ev.preventDefault();
        this.hideCardChoice();
        return;
      }
      if (ev.key === 'Tab') this._trapModalFocus(ev);
    });
    this.cardModal = div;
  }

  /**
   * Crea el nodo PROPIO del panel combo (#combo-panel) en el escenario
   * de overlays (#overlay-stage, pantalla real).
   *
   * El combo NO puede reutilizar #card-choice: ese nodo es el modal de
   * cartas, que no se puede cerrar sin elegir (o la run queda trabada) y
   * antes el combo pisaba su innerHTML → la oferta de 3 cartas
   * desaparecía y la run quedaba TRABADA en CARD_CHOICE (soft-lock).
   * Con nodos separados, abrir el combo no toca la oferta.
   */
  _ensureComboPanel() {
    if (this.comboPanel) return;
    const host = this._overlayHost(); // #overlay-stage (pantalla real)
    if (!host) return;
    const div = document.createElement('div');
    div.id = 'combo-panel';
    div.classList.add('hidden');
    // dev-7 fase 46: el VELO (oscuro + blur) lo pone la clase CSS
    // .overlay-veil (la misma del modal de cartas): el panel NO lleva
    // el velo en inline.
    div.classList.add(OVERLAY_VEIL_CLASS);
    // Solo el LAYOUT del overlay (posición + capas + centrado) queda
    // inline: depende del nodo propio del combo.
    div.setAttribute('style', COMBO_OVERLAY_LAYOUT);
    // Semántica de diálogo modal (accesibilidad): el combo es un overlay
    // de SOLO LECTURA que sí se puede cerrar.
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-label', 'Lista de combos');
    host.appendChild(div);
    // Teclado dentro del panel: Esc cierra SOLO el combo (el modal de
    // cartas no se puede cerrar sin elegir) y Tab queda atrapado dentro
    // del diálogo (focus trap).
    div.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        // stopPropagation: el Esc NO debe seguir al window (main.js
        // navegaría al menú y dejaría el panel arriba del menú).
        ev.stopPropagation();
        ev.preventDefault();
        this.hideComboPanel();
        return;
      }
      if (ev.key === 'Tab') this._trapModalFocus(ev, this.comboPanel);
    });
    this.comboPanel = div;
  }

  /** Etiqueta accesible del modal según su tipo (cartas/perk). */
  _setModalLabel(text) {
    if (!this.cardModal) return;
    this.cardModal.setAttribute('aria-label', text);
  }

  /** Guarda el elemento enfocado antes de abrir un modal (para devolverlo). */
  _captureFocus() {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    this._focusBeforeModal = (active && active !== document.body) ? active : null;
  }

  /** Devuelve el foco al elemento previo al abrir el modal (si sigue vivo). */
  _restoreFocus() {
    const el = this._focusBeforeModal;
    this._focusBeforeModal = null;
    if (!el || typeof el.focus !== 'function') return;
    if (el.isConnected !== false) {
      try { el.focus(); } catch (_err) { /* nodo ya desconectado */ }
      return;
    }
    // El nodo anterior se reemplazó (re-render de la pantalla): enfocar un
    // control equivalente de la vista actual.
    const alt = this.overlayRoot?.querySelector('[data-perk-pick], [data-meta-upgrade], button');
    if (alt && typeof alt.focus === 'function') {
      try { alt.focus(); } catch (_err) { /* sin foco disponible */ }
    }
  }

  /** Guarda el elemento enfocado antes de abrir el panel combo. */
  _captureComboFocus() {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    this._focusBeforeCombo = (active && active !== document.body) ? active : null;
  }

  /**
   * Devuelve el foco al elemento previo al abrir el panel combo (p.ej. el
   * botón "Lista de Combos" del modal de cartas).
   */
  _restoreComboFocus() {
    const el = this._focusBeforeCombo;
    this._focusBeforeCombo = null;
    if (!el || typeof el.focus !== 'function') return;
    if (el.isConnected === false) return; // el nodo ya no está en el DOM
    try { el.focus(); } catch (_err) { /* nodo desconectado */ }
  }

  /**
   * Focus trap: el Tab cicla dentro del modal abierto (por defecto el de
   * cartas/perk; el panel combo pasa su propio nodo).
   */
  _trapModalFocus(ev, modal = this.cardModal) {
    if (!modal) return;
    const nodes = modal.querySelectorAll(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!nodes.length) return;
    const list = Array.from(nodes);
    const first = list[0];
    const last = list[list.length - 1];
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const inside = !!active && modal.contains(active);
    if (ev.shiftKey) {
      if (!inside || active === first) {
        ev.preventDefault();
        last.focus();
      }
    } else if (!inside || active === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  /**
   * Muestra el modal LEVEL UP con la oferta [card, card, card] (§4.4):
   * fila de torres poseídas + pips arriba, 3 cartas con reveal flip
   * escalonado 0/120/240 ms, glow en hover, SFX de reveal.
   */
  showCardChoice(offer = []) {
    this._ensureCardModal();
    if (!this.cardModal) return;
    // Si el panel combo quedó abierto (p.ej. durante PLAYING), se cierra:
    // su overlay cubre la pantalla y taparía la oferta de cartas.
    this.hideComboPanel();
    // T4 — la oferta VIVA cambia: se reinician las cartas ya elegidas,
    // pero el guard anti-doble-toque SIGUE VIVO (una cadena de ofertas
    // por multi-level-up es la MISMA decisión: el 2º toque del doble
    // toque cae sobre la oferta nueva y también debe quedar bloqueado).
    this._cardPickedIds = [];
    if (this._cardOfferId == null) this._cardOfferId = `o${this._cardSession}`;
    // El foco se captura ANTES de que el modal lo tome (se devuelve al
    // cerrar): sin esto el HUD de atrás queda tabulable por debajo.
    // Solo la PRIMERA apertura captura: el re-render de la oferta
    // siguiente (multi-level-up) no debe pisar el elemento de referencia.
    if (this.cardModal.classList.contains('hidden')) this._captureFocus();
    const game = typeof window !== 'undefined' ? window.__GDF__?.game : null;
    // Fila de TORRES POSEÍDAS. fase 61: el arsenal tope son 5 torres
    // (CONFIG.SLOTS, una sola fila), así que la fila muestra como máximo
    // 5 fichas — las que haya en `slots` (con el Guardian siempre en la
    // del centro) y nunca una 6.ª. Sin torres (caso defensivo: la run
    // real arranca con el Guardian puesto) queda el guion.
    const towers = (game?.fortress?.slots ?? []).filter(Boolean);
    // Estética v3.1 (reference-levelup): diamantes de rareza — llenos en
    // dorado según el nivel de la unidad, vacíos hasta 5.
    const gems = (lv) => '◆'.repeat(lv) + '◇'.repeat(Math.max(0, 5 - lv));
    // dev-7 fase 39: la RAREZA la declara la carta (cards.js) y mide su
    // POTENCIA. Antes se derivaba del `weight` (la probabilidad de
    // sorteo): "Abanico Ampliado" salía LEGENDARIO y "Reparación de
    // Campo" también, porque ambos pesaban 10. El jugador leía la
    // etiqueta como si fuera la potencia de la carta y no lo era.
    const rarityGems = (tier) => '◆'.repeat(tier) + '◇'.repeat(4 - tier);
    const towerRow = towers.length
      ? towers.map((t) => `
          <span class="own-tower" title="Lv.${t.level}">
            <b>${esc(t.data?.name ?? t.type)}</b>
            <i>${gems(t.level ?? 1)}</i>
          </span>`).join('')
      : '<span class="own-tower"><b>—</b></span>';
    // Encabezado "Fase Normal N · Nvl.X" (fiel a la referencia).
    const stageNo = game?.stageId ?? 1;
    const headRow = `
      <div class="card-head">
        <span>Fase Normal ${stageNo}</span>
        <span>Nvl.${game?.lv ?? 1}</span>
      </div>`;
    // Botón verde "Lista de Combos" (abre el panel real vía evento canónico).
    const comboBtn = `<button class="combo-btn" data-action-combo>Lista de Combos</button>`;
    // dev-7 fase 64: el pie del modal dice lo que la oferta NO puede decir
    // por sí sola — cuántos niveles quedan en cola (el multikill abre una
    // oferta por nivel, ver main.js `_pendingLevels`) y si el tope de
    // cartas de la etapa ya se alcanzó (la energía pasa a valer SCORE).
    const hint = cardHintText({
      pendingLevels: game?._pendingLevels ?? 0,
      lv: game?.lv ?? 1,
      maxLevel: levelCap(game?.maxLevel),
    });
    const cards = offer.map((c, i) => {
      const r = cardRarity(c);
      const isUnlock = Boolean(c.tower || c.drone);
      // dev-7 fase 49: el GLIFO del TIPO DE DAÑO de la carta, con su
      // color. Los datos son los de DAMAGE_TYPES (js/damagetypes.js) y
      // el tipo lo declara la propia carta (`card.dmgType`, en cards.js):
      // las que suben el daño de una unidad toman el tipo de ESA unidad.
      // La clase .leg-glyph es la MISMA de la leyenda de tipos: el glifo
      // se ve igual que allí.
      const t = DAMAGE_TYPES[c.dmgType];
      const typeBadge = t
        ? `<span class="card-dmg-glyph leg-glyph" style="color:${attr(t.color)}"`
          + ` title="${attr(`Tipo de daño: ${t.name} — ${t.desc}`)}" aria-hidden="true">${t.glyph}</span>`
        : '';
      // La descripción de las cartas de daño tiene DOS partes (qué hace y
      // la SINONERGIA con cada familia): la segunda va en su propia línea,
      // con la tipografía de dato de la leyenda.
      const [desc, ...resto] = String(c.desc ?? '').split('\n');
      const synergy = resto.join('\n');
      return `
        <button class="card-choice-card rarity-${r.cls}" data-card-id="${c.id}" style="--deal-delay:${i * 120}ms">
          <span class="card-inner">
            <span class="card-lv-badge${isUnlock ? ' is-new' : ''}">${isUnlock ? 'NUEVO' : '+1'}</span>
            <span class="card-title-row">
              <span class="card-name">${esc(c.name)}</span>
              ${typeBadge}
            </span>
            <i class="card-gems" title="${r.label}">${rarityGems(r.tier)}</i>
            <span class="card-rarity-label">${r.label}</span>
            <span class="card-desc">${esc(desc)}</span>
            ${synergy ? `<span class="card-synergy">${esc(synergy)}</span>` : ''}
          </span>
        </button>`;
    }).join('');
    this.cardModal.innerHTML = `
      <h2 class="card-title">Mejora de Nivel</h2>
      ${headRow}
      <div class="own-row">${towerRow}${comboBtn}</div>
      <div class="cards-row">${cards}</div>
      <p class="hint">${hint}</p>`;
    this.cardModal.querySelector('[data-action-combo]')
      ?.addEventListener('click', () => this.engine.emit('ui:combo_list'));
    this.cardModal.classList.remove('hidden');
    this._modalKind = 'cards';
    // T7 — el rótulo accesible dice la cantidad REAL de cartas de la
    // oferta (puede ser 1, no siempre 3) y el modal TOMA el foco (si no,
    // el focus trap y el Esc no engages y el HUD queda tabulable detrás).
    const n = offer.length;
    this._setModalLabel(`Mejora de nivel — elegí 1 de ${n} ${n === 1 ? 'mejora' : 'mejoras'}`);
    const firstCard = this.cardModal.querySelector('[data-card-id]');
    if (firstCard && typeof firstCard.focus === 'function') {
      try { firstCard.focus(); } catch (_err) { /* sin foco */ }
    }
    // SFX de revelado (D7); el flip lo hace CSS con --deal-delay
    try { this.audio.sfx('card'); } catch (_err) { /* sin ctx aún */ }
  }

  /**
   * Cierra los modales: el de cartas/perk (#card-choice) y el panel combo
   * (#combo-panel). IDEMPOTENTE y null-safe: llamarlo con ningún modal
   * abierto no rompe nada (main.js lo llama en cada cambio de estado, así
   * que NINGÚN modal sobrevive a una transición de la FSM).
   */
  hideCardChoice() {
    // El combo tiene su propio nodo: se cierra acá también (si no
    // quedaría flotando sobre la pantalla siguiente).
    this.hideComboPanel();
    if (this.cardModal) {
      this.cardModal.classList.add('hidden');
      this.cardModal.innerHTML = '';
    }
    this._modalKind = null;
    // T4 — el modal se cerró: la próxima oferta es una decisión NUEVA, así
    // que el guard anti-doble-toque se reinicia.
    this._cardSession += 1;
    this._cardOfferId = null;
    this._cardPickedIds = [];
    this._lastCardPickAt = null;
    this._restoreFocus();
  }

  // ---------- Panel COMBO LIST (BUG-005, 🃏/U — §1.5/§4.4) ----------

  /** Panel con torres poseídas + niveles + modificadores activos. */
  showComboPanel(sum) {
    this._ensureComboPanel(); // nodo PROPIO (#combo-panel)
    if (!this.comboPanel) return;
    // El rótulo del slot es S + (slotIndex + 1): con los 5 slots de la
    // fase 61 los índices van de S1 a S5 (antes había 9 y llegaba a S9).
    const rows = sum.towers.map((t) => `
      <div class="combo-row">
        <b>${esc(t.name)}</b>
        <span class="combo-slot">S${t.slot + 1}</span>
        ${t.level > 1 ? `<i>${'★'.repeat(t.level)}${'☆'.repeat(Math.max(0, 5 - t.level))}</i>` : ''}
        ${typeBadgeHtml(t.dmgType)}
        <small>DMG ×${t.dmgMul}${t.cadMul !== 1 ? ` · REC ×${t.cadMul.toFixed(2)}` : ''}</small>
      </div>`).join('');
    const mods = [
      ...(sum.tags ?? []).map((tag) => `<span>#${esc(tag)}</span>`),
      sum.pierce > 0 ? `<span>Perforación +${sum.pierce}</span>` : '',
      sum.xpMul !== 1 ? `<span>Energía ×${sum.xpMul.toFixed(2)}</span>` : '',
      sum.scoreMul !== 1 ? `<span>Score ×${sum.scoreMul.toFixed(2)}</span>` : '',
      sum.streakShields > 0 ? `<span>Escudo de racha ×${sum.streakShields}</span>` : '',
      sum.orbitalDmgMul !== 1 ? `<span>Orbital ×${sum.orbitalDmgMul.toFixed(2)}</span>` : '',
    ].filter(Boolean).join('');
    // Arsenal §2.3: drones activos + medidor de Black Hole (v4 4b/5)
    const dronesRow = (sum.drones ?? []).map((d) => `
      <div class="combo-row"><b>${d.name}</b><span class="combo-slot">DRON</span>${typeBadgeHtml(d.dmgType)}</div>`).join('');
    const bhPct = Math.round((sum.blackHoleCharge ?? 0) * 100);
    const bhRow = bhPct > 0
      ? `<div class="combo-row"><b>Black Hole</b><span class="combo-slot">${bhPct >= 100 ? 'LISTO' : `${bhPct}%`}</span></div>`
      : '';
    this.comboPanel.innerHTML = `
      <h2 class="card-title">COMBO LIST</h2>
      <div class="combo-panel">
        ${rows || '<p class="hint">Sin torres… ¿estás jugando?</p>'}
        ${dronesRow}${bhRow}
        <div class="combo-mods">${mods || '<p class="hint">Sin modificadores activos</p>'}</div>
        <p class="hint">Nv.${sum.lv} · ${sum.kills} bajas · [🃏] o [U] para cerrar</p>
      </div>
      <button class="btn ghost" data-combo-close>CERRAR</button>`;
    this.comboPanel.querySelector('[data-combo-close]')
      ?.addEventListener('click', () => this.hideComboPanel());
    // Foco: se recuerda el elemento que lo tenía (p.ej. el botón "Lista de
    // Combos") y el foco entra al panel (overlay modal).
    this._captureComboFocus();
    this.comboPanel.classList.remove('hidden');
    const closeBtn = this.comboPanel.querySelector('[data-combo-close]');
    if (closeBtn && typeof closeBtn.focus === 'function') {
      try { closeBtn.focus(); } catch (_err) { /* sin foco */ }
    }
  }

  /**
   * Cierra SOLO el panel combo (#combo-panel). NO toca el modal de cartas:
   * la oferta de cartas sobrevive intacta (elegir una carta sigue siendo
   * posible) — ese era el soft-lock.
   */
  hideComboPanel() {
    if (this.comboPanel) {
      this.comboPanel.classList.add('hidden');
      this.comboPanel.innerHTML = '';
    }
    this._restoreComboFocus();
  }

  /** ¿Está abierto el panel COMBO? (para el toggle con U) */
  comboOpen() {
    return !!this.comboPanel
      && !this.comboPanel.classList.contains('hidden');
  }

  /**
   * ¿Hay ALGÚN modal abierto sobre la pantalla? Cubre el modal de cartas y
   * el de perk (#card-choice) y el panel combo (#combo-panel).
   *
   * El modal de PERK cierra con [data-perk-close], por eso la detección
   * anterior (solo combo) daba false con el perk abierto: el modal
   * sobrevivía al cambio de estado y tapaba el menú entero. main.js usa
   * esto para decidir si cerrar el modal.
   */
  anyModalOpen() {
    // El panel combo tiene su propio nodo (#combo-panel).
    if (this.comboPanel && !this.comboPanel.classList.contains('hidden')) return true;
    if (!this.cardModal) return false;
    if (this.cardModal.classList.contains('hidden')) return false;
    // El modal de PERK cierra con [data-perk-close].
    if (this.cardModal.querySelector('[data-perk-close]')) return true;
    // El modal de CARTAS no tiene botón de cierre (elegir es obligatorio),
    // pero igual ocupa la pantalla: también cuenta como modal abierto.
    return !!this.cardModal.querySelector('[data-card-id]');
  }

  // ---------- Aviso de JEFE (T9: banner WARNING de 2 s) ----------

  /**
   * Crea el nodo del aviso de JEFE bajo #marco-portrait si no existe.
   */
  // ---------- LA CAPA DE AVISOS (fase 52) ----------

  /**
   * dev-7 fase 52 — Crea el nodo de la pila de avisos bajo
   * #marco-portrait (una sola vez).
   *
   * Antes cada tipo de aviso hacia lo suyo (el banner del jefe, el del
   * cambio de fase, el toast del meta) y cada uno con su nodo, su estilo
   * y su animacion. Ahora todos pasan por el MISMO componente: una pila
   * de banners en la parte de arriba del campo (nunca en el centro,
   * que es por donde caen los enemigos).
   */
  /** fase 75: limpia la pila de avisos y sus timers. */
  clearAvisos() {
    const pila = this.el?.avisos;
    if (!pila) return;
    for (const el of [...(pila.children ?? [])]) {
      clearTimeout(el._avisoTimer);
      clearTimeout(el._avisoOutTimer);
      el.remove?.();
    }
    pila.replaceChildren?.();
  }

  _ensureAvisosNode() {
    if (this.el.avisos) return this.el.avisos;
    const host = this.root?.parentElement; // #marco-portrait
    if (!host || typeof host.appendChild !== 'function') return null;
    const div = document.createElement('div');
    div.id = 'avisos';
    div.setAttribute('role', 'status');
    div.setAttribute('aria-live', 'polite');
    host.appendChild(div);
    this.el.avisos = div;
    return div;
  }

  /**
   * dev-7 fase 52 — Muestra un aviso en la pila (un banner que se
   * va solo). Es el unico camino de los avisos de la partida.
   *
   * @param {object} o {variant, title, name, rule, icon, ms, sound}
   *   variant: 'jefe' | 'fase' | 'info' (el color de la placa)
   *   title: el rótulo ("¡JEFE EN CAMINO!", "EL JEFE CAMBIA")
   *   name: la línea grande (el nombre del jefe o de la fase)
   *   rule: la línea de la regla (opcional)
   *   icon: ruta del sprite del icono (opcional)
   *   ms: duración en pantalla
   *   sound: id de sonido a reproducir
   */
  /**
   * dev-7 fase 52 \u2014 AVISO de "el ultimate est\u00e1 listo".
   *
   * El sonido 'ult_ready' ya lo pon\u00eda player.js; lo que faltaba era
   * el AVISO visible (el medidor se llena en un instante y el bot\u00f3n
   * solo pulsa: sin un aviso el jugador se pierde la ventana).
   *
   * @param {string} qu\u00e9 'ultimate' | 'blackhole'
   */
  showUltimateReady(qu\u00e9 = 'ultimate') {
    const esBH = qu\u00e9 === 'blackhole';
    // En un tel\u00f3fono no hay teclado: el aviso dice "toc\u00e1" en vez
    // de "[Espacio]" (el hint de teclado se oculta con puntero grueso).
    const tactil = (() => {
      try {
        return typeof window !== 'undefined'
          && typeof window.matchMedia === 'function'
          && window.matchMedia('(pointer: coarse)').matches;
      } catch (_err) { return false; }
    })();
    const accion = tactil
      ? (esBH ? 'TOC\u00c1 EL BOT\u00d3N NEGRO' : 'TOC\u00c1 EL BOT\u00d3N DE LA BARRA')
      : (esBH ? 'PULSA [B]' : 'PULSA [ESPACIO]');
    return this.showAviso({
      variant: 'info',
      title: esBH ? '\u00a1BLACK HOLE LISTO!' : '\u00a1ULTIMATE LISTO!',
      name: accion,
      ms: 1800,
    });
  }

  showAviso(o = {}) {
    const pila = this._ensureAvisosNode();
    if (!pila) return null;
    const variant = o.variant ?? 'info';
    const el = document.createElement('div');
    el.className = `aviso aviso--${variant}`;
    el.innerHTML = `
      ${o.title ? `<span class="aviso-head">
        ${o.icon ? `<img class="aviso-icon" src="${attr(o.icon)}" alt="">` : ''}
        <span class="aviso-title">${esc(o.title)}</span>
      </span>` : ''}
      ${o.name ? `<span class="aviso-name">${esc(o.name)}</span>` : ''}
      ${o.rule ? `<span class="aviso-rule">${esc(o.rule)}</span>` : ''}
    `;
    pila.appendChild(el);
    // Un aviso nuevo desplaza al anterior (la pila se vacía sola).
    const ms = o.ms ?? 2200;
    el._avisoTimer = setTimeout(() => {
      el.classList.add('aviso-out');
      el._avisoOutTimer = setTimeout(() => el.remove(), 300);
    }, ms);
    if (o.sound) { try { this.audio.sfx(o.sound); } catch (_err) { /* sin ctx aún */ } }
    return el;
  }

  /**
   * Muestra el aviso de JEFE: banner "¡JEFE EN CAMINO!" durante ~2 s con
   * la sombra creciendo (docs/DESIGN.md §4.4 lo prometía, pero en el DOM solo
   * existían el shake y el sonido).
   *
   * @param {string} [name] nombre del jefe (opcional)
   */
  showBossWarning(name = '') {
    // dev-7 fase 52: pasa a la CAPA DE AVISOS (la pila comun).
    const who = String(name ?? '').trim();
    this.el.bossWarning = this.showAviso({
      variant: 'jefe',
      title: '¡JEFE EN CAMINO!',
      name: who,
      icon: 'assets/sprites/ui_tinted/icon_boss_warning_red.png',
      ms: BOSS_WARNING_MS,
    });
  }

  /**
   * oleadas-dinámicas — El banner CORTO del arquetipo que ENTRA (design
   * §Decisión 8).
   *
   * Mismo lenguaje visual que el aviso de jefe (la pila común de avisos y
   * su placa), pero SOBRIO: variante `info`, sin icono, sin sonido y
   * ~1,4 s. Hay una descarga cada pocos segundos y el aviso no puede
   * tapar el campo. El texto sale de `archetypeBannerText` (pura) y el
   * FILTRO de ruido de `shouldAnnounceArchetype` (pura): un arquetipo
   * desconocido —o uno de los que se leen solos— no pinta NADA.
   *
   * @param {string|null} archetype id del arquetipo (waves.js)
   * @returns {Element|null} el aviso, o null si no se anuncia
   */
  showArchetypeBanner(archetype) {
    if (!shouldAnnounceArchetype(archetype)) return null;
    const text = archetypeBannerText(archetype);
    if (!text) return null;
    return this.showAviso({ variant: 'info', title: text, ms: ARCHETYPE_BANNER_MS });
  }

  /** Oculta el aviso de JEFE (lo llama el timeout o un cambio de estado). */
  hideBossWarning() {
    const el = this.el.bossWarning;
    if (!el) return;
    // dev-7 fase 52: el aviso vive en la pila común, así que se
    // quita del DOM (con su animación de salida).
    clearTimeout(el._avisoTimer);
    clearTimeout(el._avisoOutTimer);
    el.classList.add('aviso-out');
    setTimeout(() => el.remove(), 300);
    this.el.bossWarning = null;
  }

  // ---------- Aviso de CAMBIO DE FASE del jefe (fase 47) ----------

  /**
   * dev-7 fase 47: el aviso de que el jefe ha cambiado de fase.
   *
   * El evento `boss:phase2` ya lo emitía el enemigo, pero **nadie lo
   * escuchaba**: el jugador veía al jefe acelerar y soltar esbirros sin
   * aviso, así que las reglas nuevas (a qué tipo de daño le pega más, o
   * que se está regenerando) llegaban sin explicar. Ahora el HUD anuncia
   * la fase y, con ella, la regla.
   *
   * @param {object|null} phase la fase nueva (enemigos.js: phases[])
   */
  showBossPhase(phase) {
    if (!phase || !phase.name) return;
    // La regla de la fase, en palabras del juego.
    let regla = '';
    if (phase.weakTo) {
      const t = DAMAGE_TYPES[phase.weakTo];
      regla = `AHORA ES VULNERABLE A ${esc((t?.name ?? phase.weakTo).toUpperCase())} \u00d71,5`;
    } else if (phase.resist) {
      const t = DAMAGE_TYPES[phase.resist];
      regla = `AHORA RESISTE EL DA\u00d1O ${esc((t?.name ?? phase.resist).toUpperCase())} \u00d70,5`;
    }
    if (phase.regen) {
      regla += regla ? ' \u00b7 SE REGENERA CON SU ESCOLTA' : 'SE REGENERA CON SU ESCOLTA';
    }
    // dev-7 fase 52: pasa a la CAPA DE AVISOS (la pila comun).
    this.showAviso({
      variant: 'fase',
      title: 'EL JEFE CAMBIA',
      name: phase.name,
      rule: regla,
      ms: BOSS_PHASE_MS,
      sound: 'warning',
    });
  }

  // ---------- Barra de jefe (D11: banner BOSS + HP roja + ×N) ----------

  /** Crea el nodo bajo #marco-portrait si no existe. */
  _ensureBossNode() {
    if (this.el.boss) return;
    const host = this.root?.parentElement; // #marco-portrait
    if (!host) return;
    const div = document.createElement('div');
    div.id = 'boss-bar';
    div.classList.add('hidden');
    div.innerHTML = buildBossBarHtml();
    host.appendChild(div);
    this.el.boss = div;
    this.el.bossFill = div.querySelector('.boss-hp-fill');
    this.el.bossMult = div.querySelector('.boss-mult');
    // dev-7 fase 46: el <b data-boss-name> de la etiqueta .boss-tag es
    // donde se escribe el NOMBRE del jefe (propio de cada stage).
    this.el.bossName = div.querySelector('[data-boss-name]');
    // dev-7 fase 43: la etiqueta de RECOMPENSA acompaña al "×2": a secas
    // el jugador lo leía como multiplicador de DAÑO. El CSS decide si hay
    // sitio para el texto (en un marco angosto lo oculta).
    this._lastBossPct = -1;
    this._lastBossName = '';
    this._bossHidden = true; // evita re-escribir la clase cada frame
  }

  /**
   * snapshot del jefe activo o null:
   * {name, hpFrac(0..1), rewardMul(≥10)} — lo llama main.update().
   */
  renderBossBar(bossInfo) {
    if (!bossInfo || !(bossInfo.hpFrac > 0)) { this.hideBossBar(); return; }
    this._ensureBossNode();
    if (!this.el.boss) return;
    const frac = Math.max(0, Math.min(1, bossInfo.hpFrac));
    const pct = Math.round(frac * 100);
    if (pct !== this._lastBossPct) {
      this._lastBossPct = pct;
      if (this.el.bossFill) {
        this.el.bossFill.style.width = `${pct}%`;
        this.el.bossFill.parentElement?.setAttribute('aria-valuenow', String(pct));
      }
    }
    // dev-7 fase 46: la etiqueta .boss-tag ya no dice "BOSS" fijo: dice el
    // NOMBRE del jefe (waves.js: uno propio por stage de jefe).
    const label = String(bossInfo.name ?? '').trim() || 'JEFE';
    if (label !== this._lastBossName) {
      this._lastBossName = label;
      if (this.el.bossName) this.el.bossName.textContent = label;
      if (this.el.bossMult) {
        this.el.bossMult.textContent = `×${bossInfo.rewardMul ?? 10}`;
        // dev-7 fase 37: el "×2" no decía QUÉ era. Es el factor de
        // RECOMPENSA (la primera vez que se limpia un stage vale el doble),
        // no de daño: sin etiqueta el jugador lo lee como multiplicador de
        // daño. Se rotula con un title y un aria-label.
        this.el.bossMult.title = 'Recompensa: la PRIMERA vez que limpiás este stage vale el doble';
        this.el.bossMult.setAttribute('aria-label',
          `Recompensa ×${bossInfo.rewardMul ?? 10}: la primera vez que limpiás este stage vale el doble`);
      }
    }
    if (this._bossHidden) {
      this._bossHidden = false;
      this.el.boss.classList.remove('hidden');
    }
  }

  hideBossBar() {
    this._lastBossPct = -1;
    if (!this.el.boss) return;
    if (this._bossHidden) return;
    this._bossHidden = true;
    this.el.boss.classList.add('hidden');
  }

  // ---------- HUD por frame ----------
  /**
   * Invalida el cache de render: fuerza a que el próximo frame reescriba
   * todos los valores del HUD (se usa al volver a mostrarlo).
   */
  _invalidateRenderCache() {
    this._lastStageName = null;
    this._lastProgressPct = null;
    this._lastLvText = null;
    this._lastXpPct = null;
    this._lastMultText = null;
    this._lastMultHidden = null;
    this._lastSpeedLabel = null;
    this._lastUltDeg = null;
    this._lastUltReady = null;
    this._lastBhHidden = null;
    this._lastBhDeg = null;
    this._lastBhReady = null;
    this._lastBhLabel = null;
    // T8 — la tira de estado de batalla también se refresca al volver.
    // dev-7 fase 43: solo quedan ENEMIGOS y DPS.
    this._lastStatEnemies = null;
    this._lastStatDps = null;
    // Sin esto, al volver a jugar saltaría un "level up" falso.
    this._lastLv = null;
  }

  /**
   * snapshot: {stageName, progress(0..1), lv, xpFrac(0..1), timer(s),
   * score, mult(1|1.5|2|3), speed, ultCharge(0..1), ultReady,
   * boss:{name, hpFrac, rewardMul}|null}
   * Valores REALES desde main.js (dev-4/dev-5).
   *
   * T8 — la tira de estado de batalla lee 2 claves más del payload:
   * enemiesAlive y dps (sin ellas los read-outs muestran "—").
   * dev-7 fase 43: seQuitaron OLAS (duplicaba la barra de progreso del
   * stage) y RACHA (duplicaba el badge ×N del score).
   *
   * BUG 5: solo se escribe en el DOM lo que CAMBIÓ (cache por valor, como
   * el score y el timer) y con el HUD oculto no se escribe nada. Durante
   * PLAYING las barras/anillos siguen actualizándose en vivo.
   */
  render(s) {
    // HUD oculto (menú / torretas / pausa): no tocar el DOM.
    if (!this._hudVisible) {
      this.renderBossBar(null);
      return;
    }
    if (this.el.stageName && s.stageName !== undefined && s.stageName !== this._lastStageName) {
      this._lastStageName = s.stageName;
      this.el.stageName.textContent = this._stageNameText(s.stageName);
    }
    if (this.el.progress) {
      const pct = Math.round((s.progress ?? 0) * 100);
      if (pct !== this._lastProgressPct) {
        this._lastProgressPct = pct;
        this.el.progress.style.width = `${pct}%`;
        this.el.progress.parentElement?.setAttribute('aria-valuenow', String(pct));
      }
    }
    if (this.el.lv) {
      const lv = s.lv ?? 1;
      const wentUp = this._lastLv != null && lv > this._lastLv;
      this._lastLv = lv;
      // dev-7 fase 64: al tope de la run `xpFrac` vale 1 y la barra queda
      // llena — se leía como "a un pelo del nivel que viene", que ya no
      // existe. El rótulo lo DICE (ver `levelLabelText`); la barra se deja
      // llena a propósito. fase 71: el tope lo manda main (21 o 31).
      const txt = levelLabelText({ lv, maxLevel: s.maxLevel });
      if (txt !== this._lastLvText) {
        this._lastLvText = txt;
        this.el.lv.textContent = txt;
      }
      if (wentUp) {   // D14/D7: el label y la barra XP "chispean" al subir
        this.el.lv.classList.remove('lv-pop');
        void this.el.lv.offsetWidth;
        this.el.lv.classList.add('lv-pop');
        if (this.el.xp) {
          this.el.xp.classList.remove('xp-flash');
          void this.el.xp.offsetWidth;
          this.el.xp.classList.add('xp-flash');
        }
      }
    }
    if (this.el.xp) {
      const pct = Math.round((s.xpFrac ?? 0) * 100);
      if (pct !== this._lastXpPct) {
        this._lastXpPct = pct;
        this.el.xp.style.width = `${pct}%`;
        this.el.xp.parentElement?.setAttribute('aria-valuenow', String(pct));
      }
    }

    // Timer MM:SS cuenta hacia arriba (§6 decisión 7)
    // dev-7 fase 41: el reloj es un SVG inline en index.html (antes era el
    // emoji ⏱, que cada plataforma dibujaba distinto). Acá va solo el
    // número.
    if (this.el.timer) {
      const t = Math.max(0, Math.floor(s.timer ?? 0));
      if (t !== this._timerSecs) {
        this._timerSecs = t;
        this.el.timer.textContent = fmtTime(t);
      }
    }

    // Score: solo toco DOM cuando cambia (6 veces/seg no hace falta)
    if (this.el.score) {
      const shown = Math.floor(s.score ?? 0);
      if (shown !== this._lastScoreShown) {
        this._lastScoreShown = shown;
        this.el.score.textContent = fmt(shown);
      }
    }

    // Badge multiplicador de racha (D3): pop al subir, oculto en ×1
    if (this.el.mult) {
      const m = s.mult ?? 1;
      const changed = this._lastMult !== undefined && this._lastMult !== m;
      this._lastMult = m;
      if (m > 1) {
        const txt = `×${m}`;
        if (txt !== this._lastMultText) {
          this._lastMultText = txt;
          this.el.mult.textContent = txt;
        }
        if (this._lastMultHidden !== false) {
          this._lastMultHidden = false;
          this.el.mult.classList.remove('hidden');
        }
        if (changed) {
          this.el.mult.classList.remove('pop');
          void this.el.mult.offsetWidth; // reinicia la animación
          this.el.mult.classList.add('pop');
        }
      } else if (this._lastMultHidden !== true) {
        this._lastMultHidden = true;
        this.el.mult.classList.add('hidden');
      }
    }

    // Botón velocidad: refleja el timeScale actual (D13)
    if (this.el.speed) {
      const label = { 1: 'x1', 1.5: 'x1.5', 2: 'x2' }[s.speed ?? 1] ?? 'x1';
      if (label !== this._lastSpeedLabel) {
        this._lastSpeedLabel = label;
        this.el.speed.textContent = label;
      }
    }

    // Ultimate: anillo de carga cónico + pulso al 100% (D9, carga real)
    if (this.el.ultRing) {
      const deg = Math.round((s.ultCharge ?? 0) * 360);
      if (deg !== this._lastUltDeg) {
        this._lastUltDeg = deg;
        this.el.ultRing.style.background =
          `conic-gradient(var(--crit-gold) ${deg}deg, rgb(var(--crit-gold-rgb) / .15) ${deg}deg)`;
      }
    }
    if (this.el.ult) {
      const ready = !!s.ultReady;
      if (ready !== this._lastUltReady) {
        this._lastUltReady = ready;
        this.el.ult.classList.toggle('ready', ready);
      }
    }

    // Botón Black Hole (v4 4b/5): medidor 0..1 por kills como el ultimate —
    // anillo de carga violeta + % / LISTO. dev-7 fase 12: el botón entero
    // queda oculto hasta desbloquear la carta 'black_hole' (antes decía
    // "Siempre visible, carga por kills" — ya no carga nada sin
    // desbloquear, ver player.js chargeBlackHole()).
    if (this.el.bh) {
      const unlocked = !!s.bhUnlocked;
      if (unlocked !== this._lastBhHidden) {
        this._lastBhHidden = unlocked;
        this.el.bh.classList.toggle('hidden', !unlocked);
      }
      const charge = s.bhCharge ?? 0;
      if (this.el.bhRing) {
        const deg = Math.round(charge * 360);
        if (deg !== this._lastBhDeg) {
          this._lastBhDeg = deg;
          this.el.bhRing.style.background =
            `conic-gradient(#B48CFF ${deg}deg, rgba(180,140,255,.15) ${deg}deg)`;
        }
      }
      const bhReady = !!s.bhReady;
      if (bhReady !== this._lastBhReady) {
        this._lastBhReady = bhReady;
        this.el.bh.classList.toggle('ready', bhReady);
      }
      const label = this.el.bhCount;
      if (label) {
        const txt = charge >= 1 ? 'LISTO' : `${Math.round(charge * 100)}%`;
        if (txt !== this._lastBhLabel) {
          this._lastBhLabel = txt;
          label.textContent = txt;
        }
      }
    }

    // Barra de jefe viva mientras pelea (D11)
    this.renderBossBar(s.boss ?? null);

    // T8 — estado de batalla (enemigos / DPS).
    this._renderStatus(s);
  }
}
