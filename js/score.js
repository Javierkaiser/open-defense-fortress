// ============================================================
// score.js — fórmulas puras de economía (dev-4, §2.6/§2.7/§2.8)
// Score + multiplicador de racha + XP/nivel del jugador.
// Sin estado: funciones puras testeables desde Node. El estado
// vivo (racha, xp, nivel) vive en main.js (Game) — acá solo
// matemática canónica compartida entre juego y tests.
//
// dev-7 fase 59.3 — LA ECONOMÍA DE LAS BAJAS: el XP por kill pasa a
// ESCALAR con el stage (ver `xpForKill`). Antes el XP era el score plano
// del enemigo, un valor FIJO por tipo que no dependía de la etapa: en el
// S50 el jugador de la trayectoria mataba el 8 % de la ola (16 enemigos)
// y se quedaba en el Nvl 7,8 — 7 ofertas de cartas para una ola ×17,6
// más dura: la espiral de la muerte. El SCORE de la leaderboard sigue
// siendo plano a propósito (no tiene que escalar ×12 en el S50); lo que
// escala es la ENERGÍA.
//
// CÓMO SE CABLEA EN main.js (3 sitios + el score del desborde):
//   1. el import:  xpForLevel, multForStreak, baseScoreForEnemy, speedMult,
//                   stageClearBonus, xpForKill, applyXp, overflowScore,
//   2. `_onKill`:  this._gainXp(xpForKill(enemy, this.stageId)
//                    * (1 + bonusFrac))
//      (el SCORE de la baja sigue usando `base`: la leaderboard no escala)
//   3. `_gainXp`:  `applyXp(lv, xp, amount, stage)`
//                    → { lv, xp, ups, overflow }: `ups` son los niveles
//                    ganados (uno por carta), `overflow` es el XP que ya
//                    no cupo en el tope de la etapa (MAX_LEVEL_PER_STAGE).
//      (y `this.xpFrac = xp / xpForLevel(lv, this.stageId)`)
//   4. `_onKill`:  `overflowScore(overflow, this.stageId)` se suma a
//                  `this.score`: llegado el tope, la baja sigue puntuando.
//
// dev-7 fase 64 — EL TECHO DE CARTAS POR ETAPA (ver `MAX_CARDS_PER_STAGE`):
// con el índice del precio viejo (+2 %/etapa) el número de niveles por etapa
// CRECÍA con la campaña (13 en el S1 → 35 en el S50, medido con el
// simulador): 35 ofertas de carta en UNA etapa vuelven la run abrumadora
// (y fácil: 35 mejoras contra una ola que sólo creció ×8,7). Ahora el precio
// sube al mismo ritmo que la fuente de XP y la etapa entrega del orden de
// MAX_CARDS_PER_STAGE cartas repartidas a lo largo de la etapa.
// ============================================================

import { scaleFor } from './stages.js';

// ------------------------------------------------------------
// dev-7 fase 64 — EL PRESUPUESTO DE CARTAS DE UNA ETAPA
// ------------------------------------------------------------
// El reporte del usuario (S50, 2026-10-23): "subir de nivel tan rápido es
// abrumador" — llegaba al Nvl 35 en UNA sola etapa, o sea 35 pantallas de
// elección de carta repartidas dentro de la misma ola. No era un bug: era la
// calibración (el XP por kill escalaba ×8,7 con el `hpMul` del S50 y el
// precio del nivel sólo ×1,98). La run se volvía abrumadora y FÁCIL: 35
// mejoras contra una ola que creció ×8,7 y un arsenal limitado a 5 slots + 1 dron).
//
// El diseño pasa a ser "del orden de MAX_CARDS_PER_STAGE cartas por etapa,
// REPARTIDAS". Dos piezas, una calibrable y otra no:
//   1. `LEVEL_PRICE_PER_STAGE` — el dial de la curva (provisional; se
//      calibra con el simulador, ver docs/BALANCE.md).
//   2. `MAX_LEVEL_PER_STAGE`   — el tope DURO, independiente de la
//      calibración: la garantía de que nunca vuelven a ser 35 cartas.
// El XP que ya no puede comprar niveles no se tira: vale SCORE
// (`overflowScore`), porque después del tope la baja tiene que seguir
// significando algo (y el tope no es una meta que el jugador persiga:
// le llega por matar).

/**
 * Cuánto sube el PRECIO del nivel por etapa (fase 64): 1 + 0,07×(stage−1).
 *
 * Es el dial del número de niveles por etapa. El criterio: para que el
 * número de niveles de una etapa NO crezca con la campaña, el precio del
 * nivel tiene que crecer al mismo ritmo que su fuente de XP — la identidad
 * TTL = XPToNext / XPRate. El XP por kill escala con el `hpMul`
 * (×8,7 en el S50), así que un precio de +2 %/etapa dejaba al S50 con
 * ×2,7 los niveles del S1 (13 → 30,2 medido en el sim; 35 en la run real
 * del jugador). Con +7 %/etapa el S50 queda en ×4,43 (con el tope de
 * `MAX_LEVEL_PER_STAGE` encima) y las etapas bajas casi no se mueven:
 * `levelScaleForStage(1)` sigue siendo 1.
 *
 * CALIBRACIÓN (simulador, `--mode=inteligente --meta=trajectory --seeds=5`,
 * niveles finales del S50): 0,02 → 30,2 (histórico) · 0,10 → 16,4
 * (demasiado duro) · 0,08 → 18,6 · **0,07 → 19,2 (la meta "≈20 cartas")**.
 * El valor NO se elige a ojo: el dial mueve ~1-2 cartas por cada +0,01 en el
 * S50, y cada vez menos a medida que aprieta — menos cartas = menos bajas =
 * menos energía (el lazo que deja al jugador sin arsenal si se pasa de rosca).
 */
export const LEVEL_PRICE_PER_STAGE = 0.07;

/** Cartas de mejora que puede recibir el jugador en UNA etapa (fase 64). */
export const MAX_CARDS_PER_STAGE = 20;

/**
 * Nivel máximo del jugador dentro de una etapa (fase 64): el nivel ARRANCA
 * en 1 en cada etapa, así que 20 subidas = 20 cartas = Nvl 21.
 */
export const MAX_LEVEL_PER_STAGE = MAX_CARDS_PER_STAGE + 1;

/**
 * Umbral XP para pasar de Lv.n al siguiente (§2.7).
 *
 * dev-7 fase 59.3: el umbral ESCALA con la etapa (`stage`), con un índice
 * MÁS SUAVE que el del XP por kill (`xpScaleForStage` = hpMul).
 *
 * dev-7 fase 64: el índice pasa de +2 % a +LEVEL_PRICE_PER_STAGE por etapa
 * (ver `levelScaleForStage`) para que el número de niveles por etapa deje de
 * crecer con la campaña. El umbral ya no queda barato contra la energía que
 * hay en juego, así que la etapa reparte del orden de `MAX_CARDS_PER_STAGE`
 * cartas (y `MAX_LEVEL_PER_STAGE` le pone el techo duro si la calibración del
 * índice cambia).
 *
 * @param {number} n nivel actual (1..)
 * @param {number} [stage] id de la etapa (1..50); 1 = sin escala
 */
export function xpForLevel(n, stage = 1) {
  return Math.round((60 + 45 * (n - 1)) * levelScaleForStage(stage));
}

/**
 * Multiplicador de racha (D3): a racha 10 → ×1.5, 25 → ×2, 50 → ×3.
 * Devuelve el valor EXACTO del badge HUD (x1 no se muestra).
 * @param {number} streak kills consecutivos sin que un enemigo toque la base
 */
export function multForStreak(streak) {
  if (streak >= 50) return 3;
  if (streak >= 25) return 2;
  if (streak >= 10) return 1.5;
  return 1;
}

/** Puntos base por kill según §2.4 (scoreReward del Enemy ya lo resuelve). */
export function baseScoreForEnemy(enemy) {
  const raw = enemy?.scoreReward;
  return typeof raw === 'function' ? raw.call(enemy)
    : typeof raw === 'number' ? raw : 0;
}

/**
 * Reparte un score fraccionario en PUNTOS ENTEROS con carry.
 *
 * Las crías de mecánicas pagan el 10 % de un tipo de 5 puntos = 0,5. Sumar
 * 0,5 al score dejaría un HUD con decimales; redondear a 1 pagaría el 20 %.
 * El carry acumula la fracción: la primera cría paga 0 y la segunda 1, o
 * sea el 10 % exacto en agregado y el score sigue siendo entero.
 *
 * @param {number} raw score bruto (puede ser fraccionario)
 * @param {number} [carry] fracción acumulada de bajas anteriores
 * @returns {{gained:number, carry:number}}
 */
export function scoreWithCarry(raw, carry = 0) {
  const r = Number.isFinite(Number(raw)) ? Math.max(0, Number(raw)) : 0;
  const c = Number.isFinite(Number(carry)) ? Math.max(0, Number(carry)) : 0;
  const total = r + c;
  const gained = Math.floor(total);
  return { gained, carry: total - gained };
}

// ------------------------------------------------------------
// dev-7 fase 59.3 — LA ENERGÍA (XP) ESCALA CON EL STAGE
// ------------------------------------------------------------
//
// EL PROBLEMA (medido con el simulador, fase 59.1-59.2): el XP por kill
// era el MISMO número que el score — un valor plano por tipo de enemigo
// (espora 5, blob 60) que NO dependía de la etapa. En el S50 el jugador
// de la trayectoria mataba el 8 % de la ola (16 enemigos), ganaba ~1 300
// XP, se quedaba en el Nvl 7,8 y por lo tanto NO recibía cartas de daño
// ni desbloqueaba torres: mataba aún menos. La espiral de la muerte.
//
// LA SOLUCIÓN: el XP se paga en proporción a lo que el enemigo vale en
// esa etapa — o sea, al HP que tenía (el `hpMul` del stage). Así el XP
// disponible en una etapa es proporcional al HP total de su ola, y el
// jugador que mata una Babosa Colosal del S50 recibe la misma energía que
// quien mata 12 esporas del S1.
//
// POR QUÉ EL SCORE NO ESCALA: el score es el marcador de la leaderboard
// (`progressData.bestScore[stageId]`, por etapa) y el número que se ve
// flotando sobre la base. Si escalara con el HP, el S50 puntuaría ×12
// que el S1 sin que el jugador jugara mejor: la tabla de récords
// compararía stages distintos con reglas distintas. El score sigue plano;
// lo que escala es la ENERGÍA, que es una Moneda INTERNA de la partida.
//
// POR QUÉ EL JEFE NO ESCALA: el jefe muere AL FINAL de la etapa (§6 D7:
// la etapa termina al matar al jefe), o sea, su XP llega cuando ya no
// hay nada que gastar. Escalarlo ×12 en el S50 sería REGALAR 20 niveles
// fantasma. El jefe conserva su XP plano (500-1000 + 200), que además
// ya es la mayor fuente de XP del juego.

/**
 * Escala de energía por kill de una etapa: el `hpMul` de `stages.js`
 * (cuánto más duro es el stage, más cara es la baja). Mínimo 1.
 * @param {number} stage id de la etapa (1..50)
 * @returns {number} multiplicador de XP
 */
export function xpScaleForStage(stage) {
  const n = Math.trunc(Number(stage));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.max(1, scaleFor(n).hpMul);
}

/**
 * Índice de PRECIO del nivel en una etapa (fase 59.3, recalibrado en la
 * 64): el nivel cuesta más conforme la etapa es más dura.
 *
 * POR QUÉ UN ÍNDICE LINEAL Y SUAVE, PERO MÁS EMPINADO (fase 64): el
 * criterio viejo era que el número de niveles por etapa CRECIERA con la
 * campaña (el jugador "necesita" un arsenal más grande en el S50) — con
 * +2 %/etapa daba 13 niveles en el S1 y 35 en el S50. El usuario jugó eso y
 * el resultado medido en cancha fue el contrario del esperado: 35 cartas en
 * una etapa son ABRUMADORAS (35 pantallas de elección) y vuelven la run
 * FÁCIL (35 mejoras contra una ola que sólo creció ×8,7 de HP). El techo de
 * arsenal ya lo pone el límite de 5 slots + 1 dron (fase 61), no el número
 * de cartas.
 *
 * AHORA EL PRECIO CRECE AL RITMO DEL XP (identidad TTL = XPToNext/XPRate):
 * si la energía de la etapa se multiplica por el `hpMul` y el precio del
 * nivel se multiplica por el mismo orden, el número de niveles por etapa
 * (≈20) deja de crecer con la campaña. Un índice EXACTAMENTE igual al
 * `hpMul` lo volvía constante y no hace falta tanta pendiente: +7 % por
 * etapa (`LEVEL_PRICE_PER_STAGE`) lleva el S50 a ×4,43 contra un ×8,7 de
 * energía, y el tope duro de `MAX_LEVEL_PER_STAGE` cierra el resto.
 *
 * OJO: `LEVEL_PRICE_PER_STAGE` es un DIAL (se calibra con el simulador, ver
 * el comentario de la constante). El S1 no se toca nunca:
 * `levelScaleForStage(1)` = 1.
 *
 * @param {number} stage id de la etapa (1..50)
 * @returns {number} multiplicador del umbral de nivel
 */
export function levelScaleForStage(stage) {
  const n = Math.trunc(Number(stage));
  if (!Number.isFinite(n) || n < 1) return 1;
  return 1 + LEVEL_PRICE_PER_STAGE * (n - 1);
}

/**
 * Energía (XP) que da una baja (fase 59.3).
 *
 * @param {object} enemy  la instancia de Enemy que murió
 * @param {number} [stage] id de la etapa en curso (1..50)
 * @returns {number} XP de la baja (0 si el enemigo no da nada)
 */
export function xpForKill(enemy, stage) {
  const base = baseScoreForEnemy(enemy);
  if (!(base > 0)) return 0;
  if (enemy?.isBoss) return base; // el jefe muere al final: su XP no escala
  return base * xpScaleForStage(stage);
}

/**
 * Multiplicador de score por velocidad de juego (§2.6): x1.5 → ×1.1,
 * x2 → ×1.25. Incentivo suave; NO es el badge ×N de racha.
 */
export function speedMult(timeScale) {
  if (timeScale >= 2) return 1.25;
  if (timeScale > 1) return 1.1;
  return 1;
}

/**
 * Bonus STAGE_CLEAR (§2.6): 1000 + 250×stage.
 *
 * dev-7 fase 59: antes sumaba `5×HP restante`. Con la economía nueva la
 * base es un COLCHÓN (el presupuesto de fugas), así que el jugador
 * GOOD termina con el 95-100 % de la base siempre: el bonus era un
 * número fijo enorme (12 750 puntos en el S50) que DOMINABA el score y
 * no medía nada. Ahora el score es lo que el jugador HIZO (las bajas) +
 * un bonus plano por limpiar el stage.
 *
 * Y lo que antes "premiaba" dejar pasar enemigos ya no se premia de
 * ninguna manera: la REGLA del 25 % de fugas (stages.js) decide la
 * victoria.
 */
export function stageClearBonus(stage) {
  return 1000 + 250 * stage;
}

/**
 * Aplica una cantidad de XP sobre {lv, xp} y devuelve los LEVEL UP
 * producidos en `ups` (los niveles alcanzados, puede subir varios con un
 * boss). NO muta: devuelve el nuevo par para que Game decida.
 *
 * dev-7 fase 59.3: `stage` es opcional (1 = sin escala) — el umbral de
 * nivel escala con la etapa (ver `xpForLevel`).
 *
 * dev-7 fase 64: `maxLevel` es el TOPE de la etapa (`MAX_LEVEL_PER_STAGE`).
 * Al alcanzarlo el nivel no sube más, `xp` queda en 0 y todo el XP que ya no
 * puede comprar niveles sale por `overflow` (para `overflowScore`): el
 * sobrante EXACTO del level-up que se pasó del tope incluido. Sin llegar al
 * tope el comportamiento es el de siempre, con `overflow` = 0.
 *
 * @param {number} lv nivel actual (1..)
 * @param {number} xp XP acumulada hacia el próximo nivel (se conserva)
 * @param {number} amount XP entrante (basura o negativo → 0)
 * @param {number} [stage] id de la etapa (1..50); 1 = sin escala
 * @param {number} [maxLevel] tope de nivel de la etapa
 * @returns {{lv: number, xp: number, ups: number[], overflow: number}}
 */
export function applyXp(lv, xp, amount, stage = 1, maxLevel = MAX_LEVEL_PER_STAGE) {
  const cap = Number.isFinite(Number(maxLevel)) && maxLevel >= 1
    ? Math.trunc(Number(maxLevel)) : MAX_LEVEL_PER_STAGE;
  const add = Math.max(0, Number(amount) || 0);
  let cur = lv;
  let rest = Math.max(0, Number(xp) || 0) + add;
  const ups = [];
  while (cur < cap && rest >= xpForLevel(cur, stage)) {
    rest -= xpForLevel(cur, stage);
    cur += 1;
    ups.push(cur);
  }
  // En el tope el XP no se acumula: o se convirtió en nivel, o es overflow.
  const overflow = cur >= cap ? rest : 0;
  return { lv: cur, xp: cur >= cap ? 0 : rest, ups, overflow };
}

/** SCORE que vale el XP que ya no puede convertirse en niveles (fase 64). */
export const OVERFLOW_SCORE_PER_XP = 2;

/**
 * Puntos de SCORE del XP de desborde (fase 64): el XP que llegó con el
 * jugador ya en `MAX_LEVEL_PER_STAGE` no se pierde, se cobra.
 *
 * POR QUÉ SE CONVIERTE A VALOR DE STAGE 1: el XP está escalado por la etapa
 * (`xpScaleForStage` = hpMul) pero el SCORE es PLANO a propósito (es la
 * leaderboard por etapa, ver el bloque de arriba) — si se sumara el XP
 * nominal, matar en el S50 daría ×8,7 que en el S1 sin jugar mejor. Con 2
 * puntos por XP de stage 1, un sobrante de 1000 XP del S50 vale ~230 de
 * score.
 *
 * @param {number} overflowXp XP sobrante (ver `applyXp`)
 * @param {number} [stage] id de la etapa (1..50); 1 = sin escala
 * @returns {number} score a sumar (0 si el sobrante no es finito o es ≤ 0)
 */
export function overflowScore(overflowXp, stage = 1) {
  const xp = Number(overflowXp);
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  return Math.round((xp / xpScaleForStage(stage)) * OVERFLOW_SCORE_PER_XP);
}
