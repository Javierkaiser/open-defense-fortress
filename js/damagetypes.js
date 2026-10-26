// ============================================================
// damagetypes.js — dev-7 fase 32
//
// TIPOS DE DAÑO: la "física" del combate. Cada torreta y cada dron
// pertenece a un TIPO de daño y cada enemigo a una FAMILIA; la matriz
// tipo × familia decide cuánto hace ese daño contra ese enemigo.
//
// Por qué: hasta ahora el daño era plano — la misma bala hacia un
// meteorito que hacia un blob. Con los tipos, el jugador tiene una
// decisión real ("contra este jefe de roca, balístico o explosión") y
// el arsenal deja de ser una lista de números.
//
// La REGLA DE ORO: cada tipo tiene exactamente UNA fortaleza (×1,5) y
// UNA debilidad (×0,5), así que su media es ×1,0 EXACTO: el balance
// global no se mueve por la existencia de la matriz, sólo por la
// MEZCLA de enemigos de cada stage (que se mide con el simulador).
//
// Módulo PURO: sin DOM, sin canvas, sin estado. Todo son tablas y
// funciones — se testea entero en Node.
//
// Lo importan towers.js, enemies.js, cards.js y hud.js.
//
// dev-7 fase 40: para el BESTIARIO hace falta saber de qué enemigos
// hay (js/enemies.js). Eso mete un CICLO INTENCIONAL con enemies.js
// (que ya importa las tablas de este módulo): es seguro porque
// NINGUNO de los dos usa al otro al EVALUAR el módulo — todo el uso
// es dentro de funciones (buildBestiaryHtml), que se llaman cuando
// los dos módulos ya terminaron de evaluarse. Es el mismo patrón que
// el ciclo meta.js ↔ towers.js (ver la cabecera de meta.js).
// ============================================================

import { ENEMY_TYPES, ENEMY_ICON_SIZE } from './enemies.js';

/**
 * Los 5 TIPOS DE DAÑO (lado atacante).
 * `glyph` es un carácter unicode (sin assets nuevos) y `color` se usa
 * en el feedback: el float de daño se pinta con el color del TIPO que
 * golpeó (antes se pintaba con el del enemigo, así que no se sabía
 * quién pegaba).
 */
export const DAMAGE_TYPES = {
  ballistic: {
    id: 'ballistic',
    name: 'Balístico',
    color: '#E8C46A',
    glyph: '◆',
    desc: 'Proyectiles y cinética. Parte la roca; rebota en el cristal.',
  },
  light: {
    id: 'light',
    name: 'Luz',
    color: '#7FE8FF',
    glyph: '✦',
    desc: 'Haces y fotones. Vaporiza el virus; se dispersa en la roca.',
  },
  blast: {
    id: 'blast',
    name: 'Explosión',
    color: '#FF8A4A',
    glyph: '✸',
    desc: 'Onda de choque con área. Revienta las esporas; la roca la absorbe.',
  },
  electric: {
    id: 'electric',
    name: 'Eléctrico',
    color: '#C08BFF',
    glyph: '⚡',
    desc: 'Arcos y descargas. Corre por el cristal; se dispersa en el tejido blando.',
  },
  drone: {
    id: 'drone',
    name: 'Dron',
    color: '#A8FF6A',
    glyph: '✷',
    desc: 'Enjambre y ácido. Devora las esporas; resbala en la roca.',
  },
};

/** Orden canónico (para la leyenda y los paneles). */
export const DAMAGE_TYPE_IDS = ['ballistic', 'light', 'blast', 'electric', 'drone'];

/**
 * Las 4 FAMILIAS de enemigo (lado defensor).
 * `color`/`glyph` sirven para marcar al enemigo en la pantalla: el
 * jugador tiene que poder LEER la amenaza.
 */
export const ENEMY_FAMILIES = {
  rock: {
    id: 'rock',
    name: 'Roca',
    color: '#9AA7B4',
    glyph: '▲',
    desc: 'Piedra y metal blindado. Aguanta casi todo.',
  },
  crystal: {
    id: 'crystal',
    name: 'Cristal',
    color: '#FF6A6A',
    glyph: '◆',
    desc: 'Mineral translúcido: conduce la electricidad.',
  },
  spore: {
    id: 'spore',
    name: 'Espora',
    color: '#FF9EC4',
    glyph: '●',
    desc: 'Polvo biológico volátil. Revienta con una onda de choque.',
  },
  virus: {
    id: 'virus',
    name: 'Virus',
    color: '#7BE07B',
    glyph: '⬢',
    desc: 'Materia orgánica blanda. La luz la vaporiza.',
  },
};

/** Orden canónico de las familias. */
export const ENEMY_FAMILY_IDS = ['rock', 'crystal', 'spore', 'virus'];

/**
 * Familia de cada tipo de enemigo (js/enemies.js ENEMY_TYPES).
 * Los jefes: el BOSS es un meteorito gigante (roca), el BLINDADO lleva
 * coraza de roca (roca) y el HÍBRIDO tiene cuerpo de meteoro (roca);
 * los blobs de materia orgánica son virus.
 */
export const ENEMY_FAMILY_BY_TYPE = {
  meteor: 'rock',
  fragment: 'rock',
  boss: 'rock',
  armoredBlob: 'rock',
  hybridBoss: 'rock',
  crystal: 'crystal',
  spore: 'spore',
  blob: 'virus',
  miniBlob: 'virus',
  blobBoss: 'virus',
  graveBlob: 'virus',
};

/**
 * LA MATRIZ: tipo de daño × familia de enemigo.
 *   ×1,5 = fortaleza · ×0,5 = debilidad · ×1,0 = neutral
 * Cada fila suma 4,0 (media ×1,0): el balance global no se altera.
 */
export const TYPE_MATRIX = {
  ballistic: { rock: 1.5, crystal: 0.5, spore: 1.0, virus: 1.0 },
  light: { rock: 0.5, crystal: 1.0, spore: 1.0, virus: 1.5 },
  blast: { rock: 0.5, crystal: 1.0, spore: 1.5, virus: 1.0 },
  electric: { rock: 1.0, crystal: 1.5, spore: 1.0, virus: 0.5 },
  drone: { rock: 1.0, crystal: 0.5, spore: 1.5, virus: 1.0 },
};

/**
 * Traduce el `kind` con el que se aplica el daño al TIPO de daño.
 * Los proyectiles llevan su propio tipo (`p.dmgType`), así que aquí sólo
 * se resuelven los ataques directos y los efectos con tipo propio.
 *
 * @param {string} kind 'laser' | 'beam' | 'bolt' | 'chain' | 'drone' | ...
 * @returns {string|null} id del tipo de daño o null si no aplica
 */
export function dmgTypeFor(kind) {
  // Un id de tipo ya es un tipo (idempotente): 'light' → 'light'.
  if (kind && Object.prototype.hasOwnProperty.call(DAMAGE_TYPES, kind)) return kind;
  switch (kind) {
    case 'laser':
    case 'beam':
      return 'light';
    case 'bolt':
    case 'chain':
      return 'electric';
    case 'drone':
      return 'drone';
    case 'blast':
    case 'splash':
    case 'explosion':
    case 'explode-kill':
      return 'blast';
    case 'ballistic':
    case 'bullet':
      return 'ballistic';
    default:
      return null;
  }
}

/**
 * Familia de un tipo de enemigo.
 * @param {string} enemyType id del ENEMY_TYPE
 * @returns {string|null} id de la familia o null si no se conoce
 */
export function familyFor(enemyType) {
  return ENEMY_FAMILY_BY_TYPE[enemyType] ?? null;
}

/**
 * Multiplicador de daño: tipo de daño contra familia de enemigo.
 * Ante cualquier dato raro devuelve ×1 (nunca rompe el combate).
 *
 * @param {string|null} dmgType id del tipo de daño
 * @param {string|null} family id de la familia
 * @returns {number} ×0,5 · ×1,0 · ×1,5
 */
export function dmgMultiplier(dmgType, family) {
  if (!dmgType || !family) return 1;
  const row = TYPE_MATRIX[dmgType];
  if (!row) return 1;
  const m = row[family];
  return typeof m === 'number' ? m : 1;
}

/** ¿Este tipo de daño es la FORTALEZA del enemigo? */
export function isWeakness(dmgType, family) {
  return dmgMultiplier(dmgType, family) > 1;
}

/** ¿Este tipo de daño es la DEBILIDAD del enemigo? */
export function isResisted(dmgType, family) {
  return dmgMultiplier(dmgType, family) < 1;
}

/**
 * Datos de una celda de la matriz, para la leyenda y los tooltips.
 * @returns {{dmgType:string, family:string, mul:number, label:string, color:string, weak:boolean, resist:boolean}}
 */
export function typeMatchInfo(dmgType, family) {
  const mul = dmgMultiplier(dmgType, family);
  const t = DAMAGE_TYPES[dmgType];
  const f = ENEMY_FAMILIES[family];
  return {
    dmgType,
    family,
    mul,
    label: `${t?.name ?? dmgType} → ${f?.name ?? family}`,
    color: t?.color ?? '#FFFFFF',
    weak: mul > 1,
    resist: mul < 1,
  };
}

/**
 * Leyenda de la matriz en HTML (para la pantalla de torretas y la de
 * pausa). La tabla es pura: sin DOM.
 *
 * @returns {string} HTML de la leyenda
 */
export function buildDamageLegendHtml() {
  const head = ENEMY_FAMILY_IDS
    .map((f) => `<th><span class="leg-glyph" style="color:${ENEMY_FAMILIES[f].color}">${ENEMY_FAMILIES[f].glyph}</span>${ENEMY_FAMILIES[f].name}</th>`)
    .join('');
  const rows = DAMAGE_TYPE_IDS.map((d) => {
    const cells = ENEMY_FAMILY_IDS.map((f) => {
      const mul = dmgMultiplier(d, f);
      const cls = mul > 1 ? 'leg-weak' : mul < 1 ? 'leg-resist' : '';
      const mark = mul > 1 ? '▲' : mul < 1 ? '▼' : '·';
      return `<td class="${cls}">${mul.toFixed(1).replace('.', ',')}${mark}</td>`;
    }).join('');
    return `<tr><th><span class="leg-glyph" style="color:${DAMAGE_TYPES[d].color}">${DAMAGE_TYPES[d].glyph}</span>${DAMAGE_TYPES[d].name}</th>${cells}</tr>`;
  }).join('');
  return `<table class="dmg-legend"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

// ============================================================
// dev-7 fase 40 — BESTIARIO
//
// La sección "BESTIARIO" de la pantalla de torretas: una tarjeta por
// enemigo con su icono (el DRAW REAL del juego, js/enemies.js
// renderEnemyIcon), su familia (roca/cristal/espora/virus) y su fila
// de resistencias: los 5 tipos de daño contra ESA familia, con la
// MISMA matriz que usa el combate (×1,5 fortaleza · ×0,5 debilidad ·
// ×1,0 neutral).
//
// La fila de resistencias REUSA la clase .dmg-legend (y sus clases
// .leg-weak / .leg-resist) de la leyenda de tipos de daño: el ×1,5
// verde y el ×0,5 rojo son los MISMOS estilos, no una copia.
//
// Sin DOM: esto es sólo una función que devuelve un string HTML.
// ============================================================

/**
 * Los enemigos que salen en el bestiario, EN ORDEN (primero los
 * enemigos base, después los jefes de stages 2..5).
 *
 * Es una lista explícita (y no `Object.keys(ENEMY_TYPES)`) para poder
 * recortar el bestiario a mano: si sólo querés los enemigos base,
 * dejá los 6 primeros. Los tipos que aparezcan en ENEMY_TYPES y NO
 * estén en esta lista se agregan al final (así no se pierde ninguno).
 */
export const BESTIARY_TYPE_IDS = [
  'meteor', 'fragment', 'crystal', 'spore', 'blob', 'boss',
  'blobBoss', 'miniBlob', 'graveBlob', 'armoredBlob', 'hybridBoss',
];

/** Escapa texto para interpolarlo como CONTENIDO HTML (no atributo). */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Escapa texto para interpolarlo dentro de un atributo HTML. */
const attr = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Número para mostrar: si no es un número finito, sale un guion. */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '—');

/** Tipos de enemigo del bestiario: la lista curada + los que falten. */
function bestiaryTypeIds() {
  const extra = Object.keys(ENEMY_TYPES).filter((t) => !BESTIARY_TYPE_IDS.includes(t));
  return [...BESTIARY_TYPE_IDS, ...extra].filter((t) => ENEMY_TYPES[t]);
}

/**
 * Las 5 celdas de resistencias de un enemigo: glifo del tipo de daño +
 * el multiplicador con la flecha (▲ fortaleza · ▼ debilidad · · neutral).
 * Reusa las clases .leg-weak / .leg-resist de la leyenda.
 */
function bestiaryResistCells(familyId, familyName) {
  return DAMAGE_TYPE_IDS.map((dt) => {
    const t = DAMAGE_TYPES[dt];
    const mul = dmgMultiplier(dt, familyId);
    const cls = mul > 1 ? 'leg-weak' : mul < 1 ? 'leg-resist' : '';
    const mark = mul > 1 ? '▲' : mul < 1 ? '▼' : '·';
    const value = mul.toFixed(1).replace('.', ',');
    const kind = mul > 1 ? 'fortaleza' : mul < 1 ? 'debilidad' : 'neutral';
    const label = `${t.name} contra ${familyName}: ×${value} (${kind})`;
    return `<td${cls ? ` class="${cls}"` : ''} title="${attr(label)}" aria-label="${attr(label)}">`
      + `<span class="bestiary-cell">`
      + `<span class="bestiary-cell-glyph" style="color:${attr(t.color)}" aria-hidden="true">${esc(t.glyph)}</span>`
      + `<span class="bestiary-cell-mul">${esc(value)}${esc(mark)}</span>`
      + `</span></td>`;
  }).join('');
}

/** La tarjeta de un enemigo del bestiario. */
function bestiaryCardHtml(type) {
  const d = ENEMY_TYPES[type];
  if (!d) return '';
  const famId = d.family ?? null;
  const fam = ENEMY_FAMILIES[famId] ?? null;
  const famName = fam?.name ?? '—';
  const famGlyph = fam?.glyph ?? '?';
  const famColor = fam?.color ?? '#FFFFFF';
  const name = d.name ?? type;
  return `<li class="bestiary-card${d.boss ? ' is-boss' : ''}" data-bestiary-entry="${attr(type)}">`
    + `<div class="bestiary-head">`
    + `<canvas class="bestiary-icon" width="${num(ENEMY_ICON_SIZE)}" height="${num(ENEMY_ICON_SIZE)}" data-bestiary-icon="${attr(type)}"`
    + ` role="img" aria-label="${attr(name)}"></canvas>`
    + `<div class="bestiary-ident">`
    + `<span class="bestiary-name">${esc(name)}</span>`
    + (d.boss ? '<span class="bestiary-badge">JEFE</span>' : '')
    + `<span class="bestiary-family" style="--fam-color:${attr(famColor)}">`
    + `<span class="bestiary-family-glyph" aria-hidden="true">${esc(famGlyph)}</span>${esc(famName)}`
    + `</span>`
    + `</div></div>`
    + `<dl class="bestiary-stats">`
    + `<div class="bestiary-stat"><dt>HP</dt><dd>${num(d.hp)}</dd></div>`
    + `<div class="bestiary-stat"><dt>Vel</dt><dd>${num(d.vel)}</dd></div>`
    + `<div class="bestiary-stat"><dt>Puntos</dt><dd>${num(d.score)}</dd></div>`
    + `</dl>`
    + `<table class="dmg-legend bestiary-resist" aria-label="${attr(`Resistencias de ${name}`)}">`
    + `<tbody><tr>${bestiaryResistCells(famId, famName)}</tr></tbody>`
    + `</table>`
    + `</li>`;
}

// ============================================================
// oleadas-dinámicas — LAS VARIANTES DE ÉLITE EN EL BESTIARIO
//
// La spec "Variantes legibles" pide que cada variante esté documentada
// en el bestiario con su efecto. Acá va esa sección: nombre, qué hace
// y cómo se contrarresta, en el idioma del juego (sin tecnicismos).
//
// Los DATOS (nombre, textos y modificadores) NO viven en este módulo:
// llegan por PARÁMETRO desde `ENEMY_VARIANTS` (js/enemies.js), que es de
// quien es la mecánica. Así el bestiario no puede mentir si el balance
// mueve un dial, y los tests le pasan una tabla propia sin depender de
// enemies.js. Fase 68: cada variante trae su `desc`/`counter` y el
// bestiario los usa TAL CUAL (sólo las tablas mínimas viejas, con los
// modificadores sueltos, caen en los textos de respaldo).
// ============================================================

/**
 * Las SIETE variantes de élite, EN ORDEN de aparición en la campaña
 * (escudado S10 · veloz S12 · divisor S18 · sanador S22 · regenerador
 * S25 · acorazado S30 · tenaz S35). Las décadas las fija el director.
 */
export const BESTIARY_VARIANT_IDS = [
  'escudado', 'rapido', 'divisor', 'sanador', 'regenerador', 'acorazado', 'tenaz',
];

/**
 * Enemigo de EJEMPLO con el que se ilustra cada variante en el bestiario:
 * el icono dibuja el RASGO con el render del juego (aro del escudo,
 * líneas de velocidad, onda de división, aura de cura, placas del
 * acorazado, cadenas del tenaz). El más representativo de cada una:
 * `escudado` = el tanque (donde el aro frontal se lee mejor), `rapido` =
 * el tipo más veloz del catálogo, `regenerador` y `sanador` = los blobs
 * de la década del virus (donde esas variantes entran), `acorazado` = el
 * meteorito (el que más aguanta) y `tenaz` = el fragmento.
 */
export const BESTIARY_VARIANT_SAMPLE = {
  escudado: 'blob',
  rapido: 'fragment',
  divisor: 'blob',
  sanador: 'miniBlob',
  regenerador: 'miniBlob',
  acorazado: 'meteor',
  tenaz: 'fragment',
};

/** Porcentaje redondeado de una fracción (0.4 → 40); null si no es número. */
const pctOf = (frac) => {
  const v = Number(frac);
  return Number.isFinite(v) ? Math.round(v * 100) : null;
};

/** Cuánto SUMA un multiplicador (1.4 → 40); null si no es > 1. */
const surplusPct = (mul) => {
  const v = Number(mul);
  return Number.isFinite(v) && v > 1 ? Math.round((v - 1) * 100) : null;
};

/** Cuánto RESTA un multiplicador (0.7 → 30); null si no es < 1. */
const deficitPct = (mul) => {
  const v = Number(mul);
  return Number.isFinite(v) && v > 0 && v < 1 ? Math.round((1 - v) * 100) : null;
};

/** ¿Es un texto usable? (string con algo más que espacios). */
const hasText = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * El texto de UNA variante de élite: nombre, qué hace y contra-juego.
 *
 * Fase 68: si el dato trae `desc` y `counter` (el catálogo de 7 los
 * trae), se usan TAL CUAL — el texto es del catálogo, no del bestiario.
 *
 * Si no (tablas mínimas con sólo `shieldFrac`/`velMul`/`regenFrac`), se
 * cae en los textos de respaldo de las tres variantes históricas, que
 * nombran los NÚMEROS del DATO: la variante se explica igual (sin
 * número) y el bestiario nunca queda vacío ni miente.
 *
 * @param {string} id id de la variante
 * @param {object} d modificadores de esa variante (ENEMY_VARIANTS[id])
 * @returns {{id:string,name:string,effect:string,counter:string}|null}
 */
export function variantInfo(id, d) {
  if (!id || !d || typeof d !== 'object') return null;
  const name = String(d.name ?? id);
  if (hasText(d.desc) && hasText(d.counter)) {
    return { id, name, effect: d.desc, counter: d.counter };
  }
  if (id === 'escudado') {
    const shield = pctOf(d.shieldFrac);
    return {
      id,
      name,
      effect: 'Sale con un escudo frontal'
        + (shield != null ? ` del ${shield} % de su vida` : '')
        + ': los primeros golpes se los come el escudo.',
      counter: 'El escudo NO vuelve: se rompe y queda desnudo.'
        + ' Un golpe fuerte (o una ráfaga entera) lo revienta antes de que llegue a la base.',
    };
  }
  if (id === 'rapido') {
    const fast = surplusPct(d.velMul);
    const frail = deficitPct(d.hpMul);
    return {
      id,
      name,
      effect: `Es más rápido${fast != null ? ` (un ${fast} % más)` : ''}`
        + ` y más frágil${frail != null ? ` (un ${frail} % menos de vida)` : ''}`
        + ': llega antes, pero cae de menos golpes.',
      counter: 'Cerrale los huecos: si te confiás se cuela por donde no hay cobertura.'
        + ' Las torres pegan al más avanzado, así que contra una punta rápida el foco se va solo.',
    };
  }
  if (id === 'regenerador') {
    const regen = pctOf(d.regenFrac);
    return {
      id,
      name,
      effect: 'Se cura mientras vive'
        + (regen != null ? ` (un ${regen} % de su vida por segundo)` : '')
        + '.',
      counter: 'Enfocalo: el daño repartido no alcanza y, si lo dejás vivo, se recupera entero.'
        + ' El daño concentrado (o un remate) lo baja antes de que se cure.',
    };
  }
  return null;
}

/** La tarjeta de UNA variante de élite ('' si la variante no tiene datos). */
function variantCardHtml(id, d) {
  const v = variantInfo(id, d);
  if (!v) return '';
  // El icono dibuja el RASGO de la variante con el render del JUEGO (el
  // mismo `renderEnemyIcon` de las fichas de enemigo): `data-bestiary-variant`
  // es lo que el HUD le pasa al renderizador para que pinte el rasgo de la
  // variante (escudo, líneas de velocidad, aura de cura, placas, etc.).
  const sample = BESTIARY_VARIANT_SAMPLE[id] ?? null;
  const icon = sample
    ? `<canvas class="bestiary-icon" width="${num(ENEMY_ICON_SIZE)}" height="${num(ENEMY_ICON_SIZE)}"`
      + ` data-bestiary-icon="${attr(sample)}" data-bestiary-variant="${attr(id)}"></canvas>`
    : '';
  return `<li class="bestiary-card bestiary-variant" data-variant="${attr(v.id)}">`
    + `<div class="bestiary-head">`
    + icon
    + `<div class="bestiary-ident">`
    + `<span class="bestiary-name">${esc(v.name)}</span>`
    + `<span class="bestiary-badge">VARIANTE</span>`
    + `</div></div>`
    + `<p class="bestiary-variant-effect"><i>Qué hace:</i> ${esc(v.effect)}</p>`
    + `<p class="bestiary-variant-counter"><i>Cómo se contrarresta:</i> ${esc(v.counter)}</p>`
    + `</li>`;
}

/**
 * La sección de VARIANTES DE ÉLITE del bestiario ('' si no hay tabla).
 *
 * Sin tabla (o con una que no trae ninguna de las siete) devuelve '' : el
 * bestiario de enemigos se pinta igual. Una tabla PARCIAL pinta sólo las
 * variantes que trae: no inventa las que faltan.
 *
 * @param {Record<string, object>|null} [variants] la tabla de variantes
 * @returns {string} HTML de la sección
 */
export function bestiaryVariantsHtml(variants = null) {
  const table = variants && typeof variants === 'object' ? variants : null;
  if (!table) return '';
  const cards = BESTIARY_VARIANT_IDS
    .map((id) => variantCardHtml(id, table[id]))
    .filter(Boolean)
    .join('');
  if (!cards) return '';
  return `<section class="bestiary-variants" aria-label="Variantes de élite">`
    + `<h3 class="bestiary-title">VARIANTES DE ÉLITE</h3>`
    + `<p class="bestiary-note">Algunos enemigos entran con una variante y se ven distintos.`
    + ` Ninguna es inmune: se mata con cualquier torreta, sólo cuesta más.</p>`
    + `<ul class="bestiary-grid">${cards}</ul>`
    + `</section>`;
}

/**
 * El BESTIARIO en HTML (la sección nueva de la pantalla de torretas).
 * La tabla es pura: sin DOM, se testea entero en Node.
 *
 * oleadas-dinámicas: al final va la sección de VARIANTES DE ÉLITE. Los
 * datos llegan por parámetro (el sitio de llamada pasa `ENEMY_VARIANTS`
 * de js/enemies.js): este módulo no los importa.
 *
 * @param {Record<string, object>|null} [variants] tabla de variantes
 * @returns {string} HTML del bestiario
 */
export function buildBestiaryHtml(variants = null) {
  const cards = bestiaryTypeIds().map((t) => bestiaryCardHtml(t)).join('');
  return `<section class="bestiary" aria-label="Bestiario de enemigos">`
    + `<h2 class="bestiary-title">BESTIARIO</h2>`
    + `<p class="bestiary-note">▲ hace ×1,5 · ▼ hace ×0,5 · · neutral.`
    + ` Cada familia aguanta un tipo de daño y es débil a otro:`
    + ` elegí la torreta según la familia del enemigo.</p>`
    + `<ul class="bestiary-grid">${cards}</ul>`
    + bestiaryVariantsHtml(variants)
    + `</section>`;
}
