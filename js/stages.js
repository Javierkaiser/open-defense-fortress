// ============================================================
// stages.js — datos STAGES 1..50 + escalado (dev-5 → v6, JK 28-08)
// Módulo de DATOS: no importa nada (regla de dependencias §1.1).
// STAGES[n-1]: id, name, theme (clave de THEMES en engine.js), baseHp y
// boss (stage de jefe). Las olas viven en waves.js (STAGE_WAVES + generador).
// v6: campaña ampliada a 50 stages — bosses SOLO en 1, 10, 20, 30,
// 40, 50; el resto termina al completar las olas (WaveManager
// onWavesDone). Tema y HP escalan por etapas; la variación de olas
// es procedural (waves.js generateStageWaves, seed por run).
// ============================================================

/**
 * dev-7 fase 59.2 — VIDA DE LA BASE POR ETAPA (curva recalibrada).
 *
 * La curva vieja era `3000 + 500×(stage−1)`: la base grows lineal mientras
 * el HP de la ola crece ×17,6 de S1 a S50, así que la base valía el 32 %
 * de la ola en el S1 y el 16 % en el S50. Con la economía nueva (la fuga
 * vale el HP restante REAL del enemigo, sin el tope de 50) eso hacía que:
 *   · el jugador que jugaba bien acababa con el 90-100 % de la base
 *     (sin tensión), y
 *   · la base no era el "presupuesto de fugas" sino un colchón infinito.
 *
 * La curva nueva se calibra contra el HP TOTAL que la etapa tira (medido
 * con el simulador, fase 59.1): la base vale ~20-34 % del HP máximo de la
 * ola según la etapa (S5 ~20 %, S10 ~25 %, S43 ~34 %, S50 ~27 %). Con el
 * daño de fuga a HP MÁXIMO (fase 72) eso define el umbral natural: la base
 * cae al escaparse ~20-34 % de los enemigos, sin contador ni regla aparte.
 *
 * Medido (simulador, trayectoria real + modo inteligente): con la curva
 * vieja el jugador acababa al 74-100 % de integridad; con la nueva, al
 * 40-70 % en las etapas con fugas de verdad.
 */
export function baseHpForStage(stage) {
  const s = Math.max(1, Math.trunc(stage));
  return Math.round((BASE_HP_BASE + BASE_HP_PER_STAGE * (s - 1)) / 100) * 100;
}

/** Base de la curva de vida por etapa (S1) y pendiente por etapa. */
const BASE_HP_BASE = 2000;
const BASE_HP_PER_STAGE = 480;

/** @type {Array<{id:number,name:string,theme:string,baseHp:number,boss:boolean}>} */
export const STAGES = [
  { id: 1, name: 'Normal Stage 1', theme: 'volcanic',   baseHp: 2000, boss: true },
  { id: 2, name: 'Normal Stage 2', theme: 'volcanic2',  baseHp: 2500, boss: false },
  { id: 3, name: 'Normal Stage 3', theme: 'graveyard',  baseHp: 2900, boss: false },
  { id: 4, name: 'Normal Stage 4', theme: 'nightcity',  baseHp: 3400, boss: false },
  { id: 5, name: 'Normal Stage 5', theme: 'core',       baseHp: 3800, boss: false },
];

// v6: stages 6..50 generados en código (temas en ciclo; la vida de la base
// sale de la curva de la fase 59.2; jefe SOLO en 1 y cada múltiplo de 10
// según pedido JK).
const THEME_CYCLE = ['volcanic', 'volcanic2', 'graveyard', 'nightcity', 'core'];
for (let id = 6; id <= 50; id++) {
  STAGES.push({
    id,
    name: `Normal Stage ${id}`,
    theme: THEME_CYCLE[(id - 1) % THEME_CYCLE.length],
    baseHp: baseHpForStage(id),
    boss: id % 10 === 0,         // 10, 20, 30, 40, 50
  });
}

/** Stage 1 y cada múltiplo de 10 = stage de JEFE (JK 28-08). */
export function isBossStage(id) {
  return id === 1 || id % 10 === 0;
}

/**
 * scaleFor(stage) → {hpMul, velMul} — §2.4/§2.9. Curva corta (1..5,
 * balance base simulado) + curva LARGA v6 para la campaña de 50:
 * crecimiento suave y rejugable con el meta de 100 niveles. Los bosses
 * NO escalan por esta vía (su escala propia vive en waves.js _spawnBoss).
 *
 * dev-7 fase 7 (bug real, ver docs/BALANCE.md "Plan integral §4"): la curva
 * larga arrancaba SIEMPRE desde la base (1 + 0.11×(stage−1)), lo que en
 * stage 6 daba hpMul 1.55 — MENOS que el 2.40 del stage 5. Es decir, la
 * dificultad CAÍA justo al pasar del tramo hecho a mano al procedural,
 * contradiciendo el diseño ("la campaña debe ir siendo más difícil").
 * Fix: la curva larga ahora CONTINÚA desde el valor exacto de stage 5
 * (ancla en s=5) en vez de reiniciar — monótona creciente en toda la
 * campaña, sin tocar el tramo 1-5 ya simulado/validado.
 *
 * dev-7 fase 28 — MURO DE DIFICULTAD: la pendiente de la curva larga era
 * 0.11 de HP por stage, y el meta-game sube el daño del jugador ~0.10 por
 * stage (5 %/nivel × 10 niveles por década): las DOS curvas iban EN
 * PARALELO, así que la campaña no tenía muro — medido sobre la
 * trayectoria REAL del jugador, S25/S45/S50 salían MÁS FÁCILES que
 * S20/S40 (100 % de win en todas, con 87/82/81 % de HP final) y los
 * "boss spikes" eran cinco mesetas iguales.
 * Pendiente nueva: 0.22 de HP por stage (el doble) — el HP enemigo crece
 * al doble de ritmo que el daño del meta, la tensión deja de desinflarse y
 * los bosses vuelven a ser picos reales, sin que la campaña deje de ser
 * ganable en la trayectoria real (medido: 100 % de win de S10 a S50 con
 * la escala nueva). 0.30 se descartó: convertía S20 en un muro demasiado
 * temprano (31 % de HP final).
 *
 * dev-7 fase 59.5 — LA PENDIENTE BAJA A 0.14 DE HP POR STAGE.
 *
 * El "muro" de la fase 28 se calculó con una medida incompleta: el
 * simulador medía el PISO (meta Nvl.1) y no la trayectoria real, así que
 * seemed que 0.22 era el justo. Con la medición correcta (fase 59.1: la
 * trayectoria real y el modo que optimiza) la cuenta es otra: el HP de la
 * ola crece ×17,6 de S1 a S50 mientras el poder del meta crece ×3,2, así
 * que la distancia DPS-vs-HP estaba ×5,5 abierta. Medido con 0.22, el
 * jugador de la trayectoria mataba solo el 51-73 % de la ola en las etapas
 * tardías — y con la regla del 25 % de fugas (fase 59.2) ESO ES PERDER.
 *
 * Con 0.14 la distancia se cierra: la tasa de bajas del jugador de la
 * trayectoria queda en 86-100 % (mínimo 86 %) y gana el 100 % de las
 * etapas. La campaña sigue hardening por otras vías (la velocidad: +0,02
 * por stage = ×2,2 en el S50; el jefe: ×6,88 de HP; la composición de la
 * ola; y el presupuesto de fugas, que es la regla del 25 %).
 */
export function scaleFor(stage) {
  if (stage <= 5) {
    return { hpMul: 1 + 0.35 * (stage - 1), velMul: 1 + 0.08 * (stage - 1) };
  }
  const hpAtFive = 1 + 0.35 * 4;   // 2.40 — mismo valor exacto que scaleFor(5)
  const velAtFive = 1 + 0.08 * 4;  // 1.32 — ídem
  return {
    hpMul: hpAtFive + 0.14 * (stage - 5),
    velMul: velAtFive + 0.02 * (stage - 5),
  };
}

export const BASE_HP_BY_STAGE = Object.fromEntries(STAGES.map((s) => [s.id, s.baseHp]));

// ============================================================
// fase 72 — EL DAÑO DE FUGA ES EL HP MÁXIMO DEL ENEMIGO
// ============================================================
// La regla del 25 % (fase 59) hacía que la base muriera por un contador
// aunque le sobrara HP: el robo de vida no tenía sentido y una fuga de un
// enemigo casi muerto apenas dolía. Ahora el daño de fuga usa el HP MÁXIMO
// del enemigo: una fuga siempre pesa lo que vale el bicho y la base cae
// por daño acumulado, no por un umbral binario. Como la base vale ~20-34 %
// del HP total de la ola, la run se pierde al escapar ese porcentaje de
// enemigos (varía por etapa y por la composición), y el robo de vida puede
// comprar aguante extra.
//
// No hay contador ni presupuesto: `_leaks` es sólo una estadística. Los
// jefes, élites y crías usan su propio `hpMax` (una cría del divisor vale
// el 35 %, un jefe muchísimo más).

/** Fracción del HP máximo que duele una fuga (1 = vida completa). */
export const LEAK_HP_FRAC = 1.0;

/**
 * Daño que inflige a la base un enemigo que llega al fondo.
 *
 * Usa `hpMax` (no `hp`) a propósito: si el jugador lo dejó casi muerto,
 * la fuga sigue costando la vida completa del tipo. Es la diferencia con
 * la economía vieja (HP restante), que premiaba dejar pasar tanques
 * maltrechos y hacía que la base fuera una esponja.
 *
 * @param {{hpMax?: number}|null|undefined} enemy
 * @param {number} [frac] fracción opcional (diales de balance)
 * @returns {number} daño entero >= 0
 */
export function leakDamageFor(enemy, frac = LEAK_HP_FRAC) {
  const maxHp = Number(enemy?.hpMax);
  const f = Number.isFinite(Number(frac)) ? Math.max(0, Number(frac)) : LEAK_HP_FRAC;
  if (!Number.isFinite(maxHp) || maxHp <= 0 || f <= 0) return 0;
  return Math.max(1, Math.round(maxHp * f));
}
