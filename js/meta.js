// ============================================================
// meta.js — META-GAME v3.5 (task t_1c22add3): pantalla TORRETAS
// Mejoras PERMANENTES entre partidas, fiel a reference-torretas.jpg.
// localStorage['gdf_meta'] = {
//   levels: {key: 1..100}, frags: {key: N},   // por torreta meta (11 torretas)
//   victories: N, firstClear: [stageIds],     // doble fragmento 1ª vez
//   gold: N,                                  // oro gastable (reset de perks)
//   perkChoices: {key: [null|0|1] × 10},      // elección A/B por tier (fase 16)
// }
// Funciones PURAS y testeables desde Node (storage inyectable, igual
// que progress.js). CICLO ESM INTENCIONAL: towers.js importa meta.js
// (metaDmgMul en Tower.damage) y meta.js importa towers.js (Tower/Drone
// para renderTowerIcon) — safe porque ambos bindings se usan SOLO en
// runtime, nunca durante la evaluación del módulo.
//
// Además del estado guardado, este módulo define dos progresiones que
// son DERIVADAS (no se persisten aparte):
//   - RANGOS del jugador (META_RANKS): función de `victories`.
//   - HITOS por torreta (META_MILESTONES): función del nivel meta de
//     cada torre (Nvl.25/50/75/100 → +2% de daño cada uno).
// Balance y decisiones: ver docs/BALANCE.md §"Meta-game v3.5".
// ============================================================

import { Tower, Drone, DRONES, TOWERS } from './towers.js';
import { CONFIG } from './engine.js';
// fase 60: `rigBox` encuadra el ícono con la caja REAL de cada torre.
import { rigBox } from './tower-art.js';
// fase 67: la recompensa del infinito escala con la profundidad (reglas
// puras en endless.js — este módulo NO las reimplementa).
import { isEndless, endlessRewardMul } from './endless.js';
import { safeLocalStorage } from './storage.js';

const KEY = 'gdf_meta';

// ---------- Constantes de balance (DECISIONES anotadas en docs/BALANCE.md) ----------
/** Fragmentos por victoria (cada torreta meta recibe los mismos). */
export const META_FRAG_PER_VICTORY = 60;
/** Bonus ×2 por la PRIMERA vez que se completa cada stage. */
export const META_FIRST_CLEAR_MULT = 2;
/** Coste base por nivel (v6): 75 en la primera década; sube +35 por década
 *  (75, 110, 145, … 390 en Nvl.91-100) — campaña de 100 niveles. */
export const META_FRAG_PER_LEVEL = 75;
/** Tope de nivel meta por torreta (v6, JK 28-08: hasta Lvl.100). */
export const META_MAX_LEVEL = 100;
/**
 * +18% de daño base por nivel meta (fase 59.3; antes 5%).
 *
 * POR QUÉ SUBIRLO: la economía de la campaña exige que el PODER
 * PERMANENTE del jugador crezca al ritmo de la ola. Medido (fase
 * 59.1-59.2): el HP total de la ola crece ×17,6 del S1 al S50 (9 494 →
 * 167 321 HP) mientras que la curva del meta sólo crecía ×3,2 (5 %/nivel
 * → Nvl.44 = ×3,15). La distancia DPS-vs-HP se abría ×5,5 y el jugador
 * se quedaba sin arsenal (7 ofertas de cartas en el S50) para una ola
 * ×17,6 más dura: la espiral de la muerte (sin XP no hay cartas, sin
 * cartas no hay bajas).
 *
 * Las cartas NO pueden tapar ese hueco: su techo es el catálogo (los topes
 * de CAPS), y con el techo de cartas el S50 se resuelve al 94-100 % — o
 * sea, el catálogo sobra y lo que faltaba era el poder PERMANENTE.
 *
 * Con 18 %/nivel la trayectoria real (Nvl.44 en el S50) da ×7,9 de daño
 * base: ×3,15 → ×7,9 con los mismos fragmentos de siempre.
 */
export const META_DMG_PER_LEVEL = 0.18;
/** Dron de Interferencia: +1 p.p. de slow por nivel meta (parte de 30%). */
export const META_SLOW_PER_LEVEL = 0.01;
/** Slow base del Campo de Fuerza (Nvl.1): 30%. */
export const META_SLOW_BASE = 0.30;
/**
 * Tope del slow del Campo de Fuerza (antes 50%).
 *
 * Con el tope viejo el dron se CONGELABA en Nvl.21 y sus 79 niveles
 * restantes no daban NADA (21 120 fragmentos por torreta tirados a la
 * basura). Con 75% los enemigos quedan al 25% de velocidad al tope; el
 * slow COMBINADO (meta + perks) lo topa el combate en towers.js, hoy en
 * 0.60 — ese tope tiene que subir a 0.75 para que la curva meta se vea.
 */
export const META_SLOW_CAP = 0.75;
/**
 * HITOS por torreta: los 4 niveles en los que una torreta recibe una
 * recompensa visible y real. Cada hito suma +2% de daño a ESA torreta
 * (acumulables): Nvl.25 → +2% · Nvl.50 → +4% · Nvl.75 → +6% ·
 * Nvl.100 → +8%.
 *
 * Motivo: sin esto los niveles 46-100 de cada torreta eran 100%
 * decorativos (la campaña ya está ganada y el +5%/nivel de daño no se
 * nota). El hito se aplica dentro de `metaDmgMul()` (multiplicador que
 * ya leen las 11 torres) — ver el comentario de esa función.
 */
export const META_MILESTONES = [25, 50, 75, 100];
/** Bonus de daño por hito alcanzado (2% cada uno, acumulable). */
export const META_MILESTONE_DMG_PER_HIT = 0.02;
/** Perks meta: un efecto especial por torre cada 10 niveles (v6, JK 28-08). */
export const PERK_EVERY = 10;
/** Cantidad de tiers de perks por torreta (10 décadas hasta Nvl.100). */
export const PERK_TIERS = META_MAX_LEVEL / PERK_EVERY;
/**
 * Versión del CONTENIDO A/B de los perks. Cambiar una opción A por otra
 * mecánica reinterpreta el índice guardado (0/1): un save viejo que eligió
 * "remate" pasaría a tener "crítico" sin avisar. Al cargar un save con una
 * versión distinta se RESETEAN las elecciones (nivel, fragmentos y oro se
 * conservan y el jugador vuelve a elegir). Subir esta constante cada vez que
 * se cambie el significado de un tier.
 */
export const PERK_SCHEMA_VERSION = 2;
/** Oro inicial del jugador (fase 16: oro almacenado y gastable). */
export const META_GOLD_START = 100;
/** Coste en oro de redistribuir (resetear) los perks de una torreta entera. */
export const PERK_RESET_COST = 500;
/**
 * dev-7 fase 10 → fase 16 (elección binaria, pedido del usuario: "elegir
 * entre 2 opciones de perks cada 10 lvls; perks más variados; reset
 * costoso"). El sistema viejo (PERK_INFO, mismo efecto escalando ×N por
 * década) ya fue reemplazado en fase 10 por perks distintos por década;
 * la fase 16 agrega la ELECCIÓN A/B por tier y el reset en oro.
 *
 * Los tiers desbloqueados se acumulan (al llegar a Nvl.30 los 3 primeros
 * elegidos siguen activos). Cada opción tiene un campo `mods` con uno o
 * varios pares clave-valor; CÓMO se combinan entre sí lo decide la
 * POLÍTICA POR CLAVE (`MOD_POLICY` en este archivo, ver más abajo):
 *  - multiplicadores ('dmgMul', 'cadMul', 'areaMul'): por PRODUCTO,
 *  - umbrales ('critDmgMul', 'executeThreshold'): se queda con el MEJOR,
 *  - probabilidades y contadores: por SUMA (con tope donde hace falta).
 * towers.js los lee todos juntos vía `perkMods(type)` en vez de leer
 * `perkCount(type)` y aplicar una fórmula propia por sitio — así un
 * solo lugar (mergeMods) controla cómo se combinan, nunca una fórmula
 * suelta por torre.
 *
 * Magnitudes: deliberadamente MÁS MODESTAS que el sistema viejo (ver
 * docs/BALANCE.md "Plan integral — dev-7 §3.2": Nvl.100 con el sistema viejo
 * ya dejaba los 5 stages en 100% HP / 0 leaks). Con 10 tiers de elección
 * (1 de 2 por década), el total por torre a Nvl.100 queda entre 1/3 y
 * 1/2 del máximo viejo (ver comentario numérico en cada tabla) —
 * variedad sin agravar la trivialización ya medida.
 */
/**
 * dev-7 fase 10 → fase 16 (elección binaria): cada década de nivel meta
 * (10, 20, …, 100) desbloquea un TIER con 2 opciones (A y B); el jugador
 * elige 1 en la pantalla de torretas (perkChoices). Los tiers elegidos se
 * acumulan; los tiers sin elegir no aportan nada.
 *
 * Cada opción tiene `mods` con uno o varios pares clave-valor; la
 * POLÍTICA POR CLAVE (`MOD_POLICY`, más abajo en este archivo) decide cómo
 * se combinan entre sí: producto para los multiplicadores, "se queda con
 * el mejor" para los umbrales, suma (con tope) para probabilidades y
 * contadores.
 * towers.js los lee todos juntos vía `perkMods(type)` en vez de leer
 * `perkCount(type)` y aplicar una fórmula propia por sitio — así un
 * solo lugar (mergeMods) controla cómo se combinan.
 *
 * OJO — lo que NO es un perk:
 *   - Los HITOS por torreta (Nvl.25/50/75/100, `META_MILESTONES`) no son
 *     perks: son un premio por nivel, y no se eligen. Dan +2% de daño
 *     acumulables a la torreta (+2/+4/+6/+8%) y se aplican dentro de
 *     `metaDmgMul()` — el multiplicador que ya leen las 11 torres — para
 *     que el combate los reciba sin tocar towers.js.
 *   - El `thornDps` del Campo de Fuerza es un número BASE ("daña 8/s
 *     base"): las espinas NO tienen campo `damage`, así que su valor se
 *     multiplica por el bono de nivel meta con `perkDmgFor(type, meta)`.
 *     Por eso las descripciones dicen "8/s base" y no "8/s".
 *
 * Magnitudes: deliberadamente MÁS MODESTAS que el sistema v6 viejo (ver
 * docs/BALANCE.md "Plan integral — dev-7 §3.2": Nvl.100 viejo dejaba los 5
 * stages en 100% HP / 0 leaks). Con 10 tiers de elección, el total por
 * torre a Nvl.100 queda entre 1/3 y 1/2 del máximo viejo.
 *
 * Tablas PROVISIONALES de la fase 16 (pares de paridad con mods stat);
 * las identidades reales por torre (con perks sistemáticos) están en la
 * fase 17 (tarea 6.1). Índice = tier (0 → Nvl.10, 9 → Nvl.100).
 */
export const PERKS = {
  guardian: [
    { A: { desc: 'Ojo de halcón: +15% de crítico', mods: { critChanceAdd: 0.15 } },
      B: { desc: 'Rebote: la bala salta a otro enemigo cercano', mods: { bounceCount: 1 } } },
    { A: { desc: 'Perforación: la bala atraviesa +1 enemigo', mods: { pierceCount: 1 } },
      B: { desc: 'Balas hipersónicas: +10% de velocidad de bala', mods: { bulletSpeedMul: 1.1 } } },
    { A: { desc: 'Servos ligeros: -10% de enfriamiento', mods: { cadMul: 0.9 } },
      B: { desc: 'Críticos brutales: los críticos hacen x3', mods: { critDmgMul: 3 } } },
    { A: { desc: 'Puntería sostenida: +10% de crítico y críticos x3', mods: { critChanceAdd: 0.1, critDmgMul: 3 } },
      B: { desc: 'Rebote II: un rebote más', mods: { bounceCount: 1 } } },
    { A: { desc: 'Ojo de halcón II: +15% de crítico', mods: { critChanceAdd: 0.15 } },
      B: { desc: 'Perforación II: atraviesa +1 más', mods: { pierceCount: 1 } } },
    { A: { desc: 'Balas hipersónicas II: +10% de velocidad', mods: { bulletSpeedMul: 1.1 } },
      B: { desc: 'Servos ligeros II: -10% de enfriamiento', mods: { cadMul: 0.9 } } },
    { A: { desc: 'Rebote III: un rebote más', mods: { bounceCount: 1 } },
      B: { desc: 'Precisión: +20% de crítico', mods: { critChanceAdd: 0.2 } } },
    { A: { desc: 'Perforación III: la bala atraviesa +1 enemigo más', mods: { pierceCount: 1 } },
      B: { desc: 'Ojo de halcón III: +15% de crítico', mods: { critChanceAdd: 0.15 } } },
    { A: { desc: 'Servos ligeros III: -10% de enfriamiento', mods: { cadMul: 0.9 } },
      B: { desc: 'Balas hipersónicas III: +15% de velocidad', mods: { bulletSpeedMul: 1.15 } } },
    { A: { desc: 'DEFINITIVO Tormenta de balas: +25% de crítico y críticos x3', mods: { critChanceAdd: 0.25, critDmgMul: 3 } },
      B: { desc: 'DEFINITIVO Supresión: +2 rebotes, +1 perforación y -10% de enfriamiento', mods: { bounceCount: 2, pierceCount: 1, cadMul: 0.9 } } },
  ],
  missile: [
    { A: { desc: 'Remate: remata bajo 10% de vida', mods: { executeThreshold: 0.1 } },
      B: { desc: 'Guiado mejorado: los misiles giran más rápido', mods: { homingStrength: 1 } } },
    { A: { desc: '+1 misil por salva', mods: { extraCount: 1 } },
      B: { desc: 'Guiado II: seguimiento casi perfecto', mods: { homingStrength: 1 } } },
    { A: { desc: 'Remate II: remata bajo 12% de vida', mods: { executeThreshold: 0.12 } },
      B: { desc: 'Ojiva pesada: +15% de daño del misil', mods: { dmgMul: 1.15 } } },
    { A: { desc: 'Guiado III: seguimiento casi perfecto', mods: { homingStrength: 1 } },
      B: { desc: '+1 misil por salva (II)', mods: { extraCount: 1 } } },
    { A: { desc: 'Remate III: remata bajo 15% de vida', mods: { executeThreshold: 0.15 } },
      B: { desc: 'Recarga rápida: -10% de enfriamiento', mods: { cadMul: 0.9 } } },
    { A: { desc: 'Ojiva pesada II: +20% de daño', mods: { dmgMul: 1.2 } },
      B: { desc: '+1 misil por salva (III)', mods: { extraCount: 1 } } },
    { A: { desc: 'Guiado IV: seguimiento casi perfecto', mods: { homingStrength: 1 } },
      B: { desc: 'Remate IV: remata bajo 18% de vida', mods: { executeThreshold: 0.18 } } },
    { A: { desc: 'Recarga rápida II: -10% de enfriamiento', mods: { cadMul: 0.9 } },
      B: { desc: 'Ojiva pesada III: +20% de daño', mods: { dmgMul: 1.2 } } },
    { A: { desc: 'Remate V: remata bajo 20% de vida', mods: { executeThreshold: 0.2 } },
      B: { desc: '+1 misil por salva (IV)', mods: { extraCount: 1 } } },
    { A: { desc: 'DEFINITIVO Ojiva cazadora: guiado máximo y +20% de daño', mods: { homingStrength: 2, dmgMul: 1.2 } },
      B: { desc: 'DEFINITIVO Lluvia de misiles: +2 misiles y +20% de daño', mods: { extraCount: 2, dmgMul: 1.2 } } },
  ],
  beam: [
    { A: { desc: 'Drenaje: el 2,5% del daño cura al escudo', mods: { lifesteal: 0.025 } },
      B: { desc: 'Rayo gélido: ralentiza un 20%', mods: { slowOnHit: 0.2 } } },
    { A: { desc: 'Foco acelerado: el ramp sube +0,2/s', mods: { beamRampPerSecAdd: 0.2 } },
      B: { desc: 'Lente potente: +10% de daño del haz', mods: { dmgMul: 1.1 } } },
    { A: { desc: 'Rayo gélido II: +20% de ralentización', mods: { slowOnHit: 0.2 } },
      B: { desc: 'Drenaje II: +2,5% de robo de vida', mods: { lifesteal: 0.025 } } },
    { A: { desc: 'Foco acelerado II: el ramp sube +0,2/s', mods: { beamRampPerSecAdd: 0.2 } },
      B: { desc: 'Lente potente II: +15% de daño', mods: { dmgMul: 1.15 } } },
    { A: { desc: 'Lente potente III: +15% de daño', mods: { dmgMul: 1.15 } },
      B: { desc: 'Foco acelerado III: el ramp sube +0,2/s', mods: { beamRampPerSecAdd: 0.2 } } },
    { A: { desc: 'Rayo gélido III: +15% de ralentización', mods: { slowOnHit: 0.15 } },
      B: { desc: 'Foco acelerado IV: el ramp sube +0,3/s', mods: { beamRampPerSecAdd: 0.3 } } },
    { A: { desc: 'Drenaje III: +2% de robo de vida', mods: { lifesteal: 0.02 } },
      B: { desc: 'Lente potente IV: +20% de daño', mods: { dmgMul: 1.2 } } },
    { A: { desc: 'Foco acelerado V: el ramp sube +0,3/s', mods: { beamRampPerSecAdd: 0.3 } },
      B: { desc: 'Rayo gélido IV: +15% de ralentización', mods: { slowOnHit: 0.15 } } },
    { A: { desc: 'Lente potente V: +20% de daño', mods: { dmgMul: 1.2 } },
      B: { desc: 'Foco acelerado VI: el ramp sube +0,3/s', mods: { beamRampPerSecAdd: 0.3 } } },
    { A: { desc: 'DEFINITIVO Foco perfecto: el ramp sube +0,5/s y +20% de daño', mods: { beamRampPerSecAdd: 0.5, dmgMul: 1.2 } },
      B: { desc: 'DEFINITIVO Drenaje total: 2,5% de robo de vida y +20% de ralentización', mods: { lifesteal: 0.025, slowOnHit: 0.2 } } },
  ],
  thunderstroke: [
    { A: { desc: 'Descarga paralizante: 25% de aturdir', mods: { stunChance: 0.25 } },
      B: { desc: 'Tormenta ramificada: +1 objetivo de área', mods: { areaTargetsAdd: 1 } } },
    { A: { desc: 'Parálisis larga: +0,15 s de aturdimiento', mods: { stunDurationAdd: 0.15 } },
      B: { desc: 'Rayo cargado: +10% de daño', mods: { dmgMul: 1.1 } } },
    { A: { desc: 'Tormenta ramificada II: +1 objetivo de área', mods: { areaTargetsAdd: 1 } },
      B: { desc: 'Recarga rápida: -10% de enfriamiento', mods: { cadMul: 0.9 } } },
    { A: { desc: 'Parálisis II: +20% de aturdir', mods: { stunChance: 0.2 } },
      B: { desc: 'Rayo cargado II: +15% de daño', mods: { dmgMul: 1.15 } } },
    { A: { desc: 'Parálisis larga II: +0,2 s de aturdimiento', mods: { stunDurationAdd: 0.2 } },
      B: { desc: 'Tormenta ramificada III: +1 objetivo de área', mods: { areaTargetsAdd: 1 } } },
    { A: { desc: 'Rayo cargado III: +15% de daño', mods: { dmgMul: 1.15 } },
      B: { desc: 'Parálisis III: +20% de aturdir', mods: { stunChance: 0.2 } } },
    { A: { desc: 'Tormenta ramificada IV: +1 objetivo de área', mods: { areaTargetsAdd: 1 } },
      B: { desc: 'Parálisis larga III: +0,2 s de aturdimiento', mods: { stunDurationAdd: 0.2 } } },
    { A: { desc: 'Recarga rápida II: -10% de enfriamiento', mods: { cadMul: 0.9 } },
      B: { desc: 'Rayo cargado IV: +20% de daño', mods: { dmgMul: 1.2 } } },
    { A: { desc: 'Parálisis IV: +20% de aturdir', mods: { stunChance: 0.2 } },
      B: { desc: 'Tormenta ramificada V: +1 objetivo de área', mods: { areaTargetsAdd: 1 } } },
    { A: { desc: 'DEFINITIVO Tormenta eléctrica: +2 objetivos de área y +0,3 s de aturdimiento', mods: { areaTargetsAdd: 2, stunDurationAdd: 0.3 } },
      B: { desc: 'DEFINITIVO Juicio final: +25% de daño y 30% de aturdir', mods: { dmgMul: 1.25, stunChance: 0.3 } } },
  ],
  tesla: [
    { A: { desc: '+1 salto de cadena', mods: { extraCount: 1 } },
      B: { desc: 'Arco bifurcado: la cadena se divide a +1 vecino', mods: { chainFork: 1 } } },
    { A: { desc: 'Bobina larga: +40 px de alcance de salto', mods: { chainRangeAdd: 40 } },
      B: { desc: 'Chispa cargada: +10% de daño', mods: { dmgMul: 1.1 } } },
    { A: { desc: '+1 salto de cadena (II)', mods: { extraCount: 1 } },
      B: { desc: 'Bifurcación II: otro vecino más', mods: { chainFork: 1 } } },
    { A: { desc: 'Recarga rápida: -10% de enfriamiento', mods: { cadMul: 0.9 } },
      B: { desc: 'Bobina larga II: +40 px de alcance', mods: { chainRangeAdd: 40 } } },
    { A: { desc: '+1 salto de cadena (III)', mods: { extraCount: 1 } },
      B: { desc: 'Chispa cargada II: +15% de daño', mods: { dmgMul: 1.15 } } },
    { A: { desc: 'Bifurcación III: otro vecino más', mods: { chainFork: 1 } },
      B: { desc: 'Bobina larga III: +40 px de alcance', mods: { chainRangeAdd: 40 } } },
    { A: { desc: '+1 salto de cadena (IV)', mods: { extraCount: 1 } },
      B: { desc: 'Chispa cargada III: +10% de daño', mods: { dmgMul: 1.1 } } },
    { A: { desc: 'Bifurcación IV: otro vecino más', mods: { chainFork: 1 } },
      B: { desc: 'Recarga rápida II: -10% de enfriamiento', mods: { cadMul: 0.9 } } },
    { A: { desc: '+1 salto de cadena (V)', mods: { extraCount: 1 } },
      B: { desc: 'Bobina larga IV: +40 px de alcance', mods: { chainRangeAdd: 40 } } },
    { A: { desc: 'DEFINITIVO Red Tesla: +2 saltos y bifurca +1', mods: { extraCount: 2, chainFork: 1 } },
      B: { desc: 'DEFINITIVO Tormenta de iones: +25% de daño y +80 px de alcance', mods: { dmgMul: 1.25, chainRangeAdd: 80 } } },
  ],
  mortar: [
    { A: { desc: 'Ojiva ancha: +20% de radio de explosión', mods: { areaMul: 1.2 } },
      B: { desc: 'Cráter ardiente: +4 de daño por segundo del cráter', mods: { craterDpsAdd: 4 } } },
    { A: { desc: 'Cráter persistente: +1 s de duración', mods: { craterTimeAdd: 1 } },
      B: { desc: 'Pólvora pesada: +15% de daño', mods: { dmgMul: 1.15 } } },
    { A: { desc: 'Ojiva ancha II: +20% de radio', mods: { areaMul: 1.2 } },
      B: { desc: 'Cráter ardiente II: +4 de daño por segundo', mods: { craterDpsAdd: 4 } } },
    { A: { desc: 'Recarga rápida: -10% de enfriamiento', mods: { cadMul: 0.9 } },
      B: { desc: 'Cráter persistente II: +1 s de duración', mods: { craterTimeAdd: 1 } } },
    { A: { desc: 'Pólvora pesada II: +15% de daño', mods: { dmgMul: 1.15 } },
      B: { desc: 'Ojiva ancha III: +20% de radio', mods: { areaMul: 1.2 } } },
    { A: { desc: 'Cráter ardiente III: +4 de daño por segundo', mods: { craterDpsAdd: 4 } },
      B: { desc: 'Recarga rápida II: -10% de enfriamiento', mods: { cadMul: 0.9 } } },
    { A: { desc: 'Cráter persistente III: +1 s de duración', mods: { craterTimeAdd: 1 } },
      B: { desc: 'Pólvora pesada III: +20% de daño', mods: { dmgMul: 1.2 } } },
    { A: { desc: 'Ojiva ancha IV: +20% de radio', mods: { areaMul: 1.2 } },
      B: { desc: 'Cráter ardiente IV: +4 de daño por segundo', mods: { craterDpsAdd: 4 } } },
    { A: { desc: 'Pólvora pesada IV: +15% de daño', mods: { dmgMul: 1.15 } },
      B: { desc: 'Cráter persistente IV: +1 s de duración', mods: { craterTimeAdd: 1 } } },
    { A: { desc: 'DEFINITIVO Bombardeo masivo: +40% de radio y +10 de daño del cráter', mods: { areaMul: 1.4, craterDpsAdd: 10 } },
      B: { desc: 'DEFINITIVO Tierra arrasada: +30% de daño y +2 s de cráter', mods: { dmgMul: 1.3, craterTimeAdd: 2 } } },
  ],
  gauss: [
    { A: { desc: 'Riel reforzado: +15% de daño', mods: { dmgMul: 1.15 } },
      B: { desc: 'Puntería de riel: 20% de crítico', mods: { critChanceAdd: 0.2 } } },
    { A: { desc: 'Críticos brutales: los críticos hacen x3', mods: { critDmgMul: 3 } },
      B: { desc: 'Puntería II: +15% de crítico', mods: { critChanceAdd: 0.15 } } },
    { A: { desc: 'Puntería III: +20% de crítico', mods: { critChanceAdd: 0.2 } },
      B: { desc: 'Recarga rápida: -10% de enfriamiento', mods: { cadMul: 0.9 } } },
    { A: { desc: 'Puntería IV: +15% de crítico', mods: { critChanceAdd: 0.15 } },
      B: { desc: 'Críticos brutales II: los críticos hacen x3', mods: { critDmgMul: 3 } } },
    { A: { desc: 'Críticos brutales III: los críticos hacen x3', mods: { critDmgMul: 3 } },
      B: { desc: 'Recarga rápida II: -10% de enfriamiento', mods: { cadMul: 0.9 } } },
    { A: { desc: 'Riel reforzado II: +15% de daño', mods: { dmgMul: 1.15 } },
      B: { desc: 'Puntería V: +20% de crítico', mods: { critChanceAdd: 0.2 } } },
    { A: { desc: 'Recarga rápida III: -10% de enfriamiento', mods: { cadMul: 0.9 } },
      B: { desc: 'Críticos brutales IV: los críticos hacen x3', mods: { critDmgMul: 3 } } },
    { A: { desc: 'Puntería VI: +20% de crítico', mods: { critChanceAdd: 0.2 } },
      B: { desc: 'Riel reforzado III: +15% de daño', mods: { dmgMul: 1.15 } } },
    { A: { desc: 'Riel reforzado IV: +15% de daño', mods: { dmgMul: 1.15 } },
      B: { desc: 'Recarga rápida IV: -10% de enfriamiento', mods: { cadMul: 0.9 } } },
    { A: { desc: 'DEFINITIVO Cañón orbital: +25% de daño y +25% de crítico', mods: { dmgMul: 1.25, critChanceAdd: 0.25 } },
      B: { desc: 'DEFINITIVO Riel infinito: críticos x3, +15% de daño y -10% de enfriamiento', mods: { critDmgMul: 3, dmgMul: 1.15, cadMul: 0.9 } } },
  ],
  firewheel: [
    { A: { desc: 'Fuego intenso: +8 de DPS', mods: { dpsAdd: 8 } },
      B: { desc: 'Combustión: +3 de daño por segundo de quemadura', mods: { burnDpsAdd: 3 } } },
    { A: { desc: 'Rueda ancha: +14 px de radio', mods: { radiusAdd: 14 } },
      B: { desc: 'Brasas duraderas: +1 s de quemadura', mods: { burnTimeAdd: 1 } } },
    { A: { desc: 'Brasas: 40% de explotar al matar', mods: { explodeOnKillChance: 0.4, explodeOnKillDmg: 35 } },
      B: { desc: 'Combustión II: +3 de daño por segundo', mods: { burnDpsAdd: 3 } } },
    { A: { desc: 'Fuego intenso II: +8 de DPS', mods: { dpsAdd: 8 } },
      B: { desc: 'Rueda ancha II: +14 px de radio', mods: { radiusAdd: 14 } } },
    { A: { desc: 'Brasas duraderas II: +1 s de quemadura', mods: { burnTimeAdd: 1 } },
      B: { desc: 'Brasas II: 40% de explotar al matar con más daño', mods: { explodeOnKillChance: 0.4, explodeOnKillDmg: 45 } } },
    { A: { desc: 'Combustión III: +3 de daño por segundo', mods: { burnDpsAdd: 3 } },
      B: { desc: 'Fuego intenso III: +8 de DPS', mods: { dpsAdd: 8 } } },
    { A: { desc: 'Rueda ancha III: +14 px de radio', mods: { radiusAdd: 14 } },
      B: { desc: 'Brasas duraderas III: +1 s de quemadura', mods: { burnTimeAdd: 1 } } },
    { A: { desc: 'Brasas III: 40% de explotar al matar con más daño', mods: { explodeOnKillChance: 0.4, explodeOnKillDmg: 55 } },
      B: { desc: 'Fuego intenso IV: +8 de DPS', mods: { dpsAdd: 8 } } },
    { A: { desc: 'Combustión IV: +3 de daño por segundo', mods: { burnDpsAdd: 3 } },
      B: { desc: 'Rueda ancha IV: +14 px de radio', mods: { radiusAdd: 14 } } },
    { A: { desc: 'DEFINITIVO Infierno: +20 de DPS y 50% de explotar al matar', mods: { dpsAdd: 20, explodeOnKillChance: 0.5, explodeOnKillDmg: 70, explodeOnKillRadius: 90 } },
      B: { desc: 'DEFINITIVO Sol vivo: +30 px de radio, +6 de quemadura y +2 s', mods: { radiusAdd: 30, burnDpsAdd: 6, burnTimeAdd: 2 } } },
  ],
  forcefield: [
    { A: { desc: 'Campo de espinas: daña 12/s base a todo lo que está adentro', mods: { thornDps: 12 } },
      B: { desc: 'Regeneración: +1,5 HP/s al escudo por cada enemigo atrapado', mods: { bubbleRegen: 1.5 } } },
    { A: { desc: 'Burbuja ancha: +6 px de radio', mods: { radiusAdd: 6 } },
      B: { desc: 'Regeneración II: +1,5 HP/s por enemigo', mods: { bubbleRegen: 1.5 } } },
    { A: { desc: 'Espinas letales: espinas 10/s base', mods: { thornDps: 10 } },
      B: { desc: 'Burbuja ancha II: +6 px de radio', mods: { radiusAdd: 6 } } },
    { A: { desc: 'Regeneración III: +2 HP/s por enemigo', mods: { bubbleRegen: 2 } },
      B: { desc: 'Espinas II: +12 de daño por segundo (base)', mods: { thornDps: 12 } } },
    { A: { desc: 'Burbuja ancha III: +6 px de radio', mods: { radiusAdd: 6 } },
      B: { desc: 'Espinas III: +15 de daño por segundo (base)', mods: { thornDps: 15 } } },
    { A: { desc: 'Regeneración IV: +2 HP/s por enemigo', mods: { bubbleRegen: 2 } },
      B: { desc: 'Burbuja ancha IV: +6 px de radio', mods: { radiusAdd: 6 } } },
    { A: { desc: 'Espinas IV: +15 de daño por segundo (base)', mods: { thornDps: 15 } },
      B: { desc: 'Regeneración V: +2 HP/s por enemigo', mods: { bubbleRegen: 2 } } },
    { A: { desc: 'Burbuja ancha V: +10 px de radio', mods: { radiusAdd: 10 } },
      B: { desc: 'Espinas V: +20 de daño por segundo (base)', mods: { thornDps: 20 } } },
    { A: { desc: 'Regeneración VI: +3 HP/s por enemigo', mods: { bubbleRegen: 3 } },
      B: { desc: 'Burbuja ancha VI: +10 px de radio', mods: { radiusAdd: 10 } } },
    { A: { desc: 'DEFINITIVO Fortaleza: +10 px de radio y +4 HP/s por enemigo atrapado', mods: { radiusAdd: 10, bubbleRegen: 4 } },
      B: { desc: 'DEFINITIVO Cámara de tortura: espinas 40/s base y +10 px de radio', mods: { thornDps: 40, radiusAdd: 10 } } },
  ],
  wasps: [
    { A: { desc: '+1 avispa', mods: { extraCount: 1 } },
      B: { desc: 'Veneno fuerte: +1 de daño por segundo', mods: { venomDpsAdd: 1 } } },
    { A: { desc: 'Veneno duradero: +1 s de veneno', mods: { venomTimeAdd: 1 } },
      B: { desc: 'Néctar: 2% del daño cura al escudo', mods: { lifesteal: 0.02 } } },
    { A: { desc: 'Aguijón potente: +20% de daño de picadura', mods: { dmgMul: 1.2 } },
      B: { desc: 'Cría rápida: -15% de tiempo entre picaduras', mods: { cadMul: 0.85 } } },
    { A: { desc: 'Veneno fuerte II: +1 de daño por segundo', mods: { venomDpsAdd: 1 } },
      B: { desc: 'Néctar II: +2% de robo de vida', mods: { lifesteal: 0.02 } } },
    { A: { desc: 'Veneno duradero II: +1 s de veneno', mods: { venomTimeAdd: 1 } },
      B: { desc: 'Aguijón potente II: +20% de daño', mods: { dmgMul: 1.2 } } },
    { A: { desc: '+1 avispa (II)', mods: { extraCount: 1 } },
      B: { desc: 'Cría rápida II: -15% entre picaduras', mods: { cadMul: 0.85 } } },
    { A: { desc: 'Veneno fuerte III: +1 de daño por segundo', mods: { venomDpsAdd: 1 } },
      B: { desc: 'Aguijón potente III: +20% de daño', mods: { dmgMul: 1.2 } } },
    { A: { desc: 'Veneno duradero III: +1 s de veneno', mods: { venomTimeAdd: 1 } },
      B: { desc: 'Néctar III: +2,5% de robo de vida', mods: { lifesteal: 0.025 } } },
    { A: { desc: 'Veneno fuerte IV: +1 de daño por segundo', mods: { venomDpsAdd: 1 } },
      B: { desc: 'Cría rápida III: -15% entre picaduras', mods: { cadMul: 0.85 } } },
    { A: { desc: 'DEFINITIVO Enjambre: +1 avispa y -25% entre picaduras', mods: { extraCount: 1, cadMul: 0.75 } },
      B: { desc: 'DEFINITIVO Reina asesina: +40% de daño, +3 de veneno y +2 s', mods: { dmgMul: 1.4, venomDpsAdd: 3, venomTimeAdd: 2 } } },
  ],
  laser: [
    { A: { desc: '+1 disparo simultáneo', mods: { extraCount: 1 } },
      B: { desc: 'Lente potente: +10% de daño del rayo', mods: { dmgMul: 1.1 } } },
    { A: { desc: 'Rayo duradero: +0,8 s de duración', mods: { laserDurationAdd: 0.8 } },
      B: { desc: 'Recarga rápida: -10% de enfriamiento', mods: { cadMul: 0.9 } } },
    { A: { desc: 'Lente potente II: +15% de daño', mods: { dmgMul: 1.15 } },
      B: { desc: '+1 disparo simultáneo (II)', mods: { extraCount: 1 } } },
    { A: { desc: 'Rayo duradero II: +0,8 s', mods: { laserDurationAdd: 0.8 } },
      B: { desc: 'Recarga rápida II: -10%', mods: { cadMul: 0.9 } } },
    { A: { desc: '+1 disparo simultáneo (III)', mods: { extraCount: 1 } },
      B: { desc: 'Lente potente III: +15% de daño', mods: { dmgMul: 1.15 } } },
    { A: { desc: 'Rayo duradero III: +0,8 s', mods: { laserDurationAdd: 0.8 } },
      B: { desc: 'Lente potente IV: +10% de daño', mods: { dmgMul: 1.1 } } },
    { A: { desc: 'Recarga rápida III: -10%', mods: { cadMul: 0.9 } },
      B: { desc: '+1 disparo simultáneo (IV)', mods: { extraCount: 1 } } },
    { A: { desc: 'Rayo duradero IV: +0,8 s', mods: { laserDurationAdd: 0.8 } },
      B: { desc: 'Lente potente V: +10% de daño', mods: { dmgMul: 1.1 } } },
    { A: { desc: '+1 disparo simultáneo (V)', mods: { extraCount: 1 } },
      B: { desc: 'Rayo duradero V: +0,8 s', mods: { laserDurationAdd: 0.8 } } },
    { A: { desc: 'DEFINITIVO Triple foco: +2 disparos y +20% de daño', mods: { extraCount: 2, dmgMul: 1.2 } },
      B: { desc: 'DEFINITIVO Rayo solar: +2 s de duración y +30% de daño', mods: { laserDurationAdd: 2, dmgMul: 1.3 } } },
  ],
};

/** Oro por stage completado (fase 16: oro almacenado y gastable). */
export const META_GOLD_PER_CLEAR = 25;
/** Oro bonus por completar la campaña completa (stage final, fase 16). */
export const META_GOLD_PER_VICTORY = 150;
/** Nombre del jugador en la barra superior (sin login). */
export const META_PLAYER_NAME = 'Planet Defender';

/**
 * dev-7 fase 21 (reportado jugando por el usuario: "siguen con nombres
 * distintos" y "falta el dron de avispas"): esta lista usaba nombres "de
 * fantasía" tomados de una diseño de referencia (reference-torretas.jpg)
 * en vez de los nombres reales de `towers.js`/`cards.js` — la fase 8 solo
 * había corregido el caso de Beam/Láser (una colisión real de nombres),
 * pero dejó el resto sin tocar porque no chocaban entre sí. El problema
 * seguía existiendo igual: la carta dice "Torre MISSILE" pero acá decía
 * "Penetrador" — nombres distintos para la misma torre, sin necesidad de
 * colisión para confundir. Renombradas TODAS al nombre real (el mismo
 * `.name` de `TOWERS`/`DRONES` en towers.js):
 *   Guardián del Cielo → Guardian   ·  Rayo → Tesla
 *   Dron de Interferencia → Dron Campo de Fuerza (nombre real del dron)
 *   Aeroexplosión → Mortar          ·  Trueno → Thunderstroke
 *   Penetrador → Missile            ·  Cañón de Riel → Gauss
 *   Dron de Rueda de Fuego → Dron Rueda de Fuego (sin el "de" de más)
 * Beam ya se había corregido en la fase 8.
 *
 * También se agrega el Dron Avispas (`wasps`), que había quedado
 * EXCLUIDO a propósito porque la diseño de referencia solo mostraba 9
 * lugares — pero la grilla de esta pantalla ya tiene scroll (`.meta-grid`
 * en css/style.css), así que esa limitación de "slots fijos" ya no
 * aplica de verdad. Con esto quedan las 10 torres/drones reales del
 * juego representadas (fase 21).
 *
 * dev-7 fase 22: se agregó la 11ª entrada, `laser` (Láser del arsenal
 * extendido) → hoy son 11 torres/drones en total. Tope real de niveles
 * meta: 11 × META_MAX_LEVEL = 1100.
 *
 * INVARIANTE: en TODAS las entradas `key` === `type` (ver
 * assertMetaTowerInvariants más abajo). La API de perks guarda por `key`
 * y el combate lee por `type`: si se separaran, el perk elegido no se
 * aplicaría, en silencio.
 */
export const META_TOWERS = [
  { key: 'guardian',      name: 'Guardian',             type: 'guardian' },
  { key: 'tesla',         name: 'Tesla',                type: 'tesla' },
  { key: 'forcefield',    name: 'Dron Campo de Fuerza', type: 'forcefield' },
  { key: 'mortar',        name: 'Mortar',               type: 'mortar' },
  { key: 'thunderstroke', name: 'Thunderstroke',        type: 'thunderstroke' },
  { key: 'beam',          name: 'Beam',                 type: 'beam' },
  { key: 'firewheel',     name: 'Dron Rueda de Fuego',  type: 'firewheel' },
  { key: 'missile',       name: 'Missile',              type: 'missile' },
  { key: 'gauss',         name: 'Gauss',                type: 'gauss' },
  { key: 'wasps',         name: 'Dron Avispas',         type: 'wasps' },
  // dev-7 fase 22 (reportado jugando: "la torre láser tampoco figura"):
  // Láser (arsenal extendido, kind 'laser' en towers.js) había quedado
  // afuera igual que Avispas en la fase 21 — mismo motivo (el límite de
  // "9/10 slots" de la diseño de referencia ya no aplica, la grilla
  // scrollea). Nombre EXACTO al de towers.js (ya se había corregido en
  // la fase 8 la colisión donde Beam usaba este mismo nombre).
  { key: 'laser',         name: 'Láser',                type: 'laser' },
];

/** type (TOWERS/DRONES) → key meta (para el getter de daño). */
const TYPE_TO_KEY = Object.fromEntries(META_TOWERS.map((t) => [t.type, t.key]));

// ---------- Estado ----------

/**
 * INVARIANTE (tarea T4): en `META_TOWERS` la clave `key` DEBE ser igual
 * al `type` de la torre/dron. Hoy es así en las 11 entradas, pero el
 * código escribe y lee de dos maneras distintas:
 *   - `setPerkChoice()` (y el resto de la API) guardan por `key`.
 *   - `perkMods()` / `metaDmgMul()` leen por `type` (`PERKS[type]`,
 *     `TYPE_TO_KEY[type]`).
 * Si una entrada nueva tuviera `key !== type`, la elección se guardaría
 * en un sitio y se leería de otro: el perk elegido NO se aplicaría, en
 * silencio. Para que eso no pueda pasar, se verifica aquí y se lanza un
 * error claro al cargar el módulo (y en cada normalización).
 */
function assertMetaTowerInvariants() {
  for (const t of META_TOWERS) {
    if (t.key !== t.type) {
      throw new Error(
        `META_TOWERS: la entrada "${t.key}" tiene key="${t.key}" y type="${t.type}": `
        + 'el invariante key === type se rompió (las elecciones se guardan por key '
        + 'y se leen por type)',
      );
    }
  }
}
assertMetaTowerInvariants();

/** Estado por defecto: 11 torretas/drones en Nvl.1, 0 fragmentos,
 *  0 victorias, oro inicial, y todos los tiers de perks sin elegir
 *  (fase 16). */
export function defaultMeta() {
  assertMetaTowerInvariants();
  const levels = {};
  const frags = {};
  const perkChoices = {};
  for (const t of META_TOWERS) {
    levels[t.key] = 1;
    frags[t.key] = 0;
    perkChoices[t.key] = Array(PERK_TIERS).fill(null);
  }
  return {
    levels, frags, victories: 0, firstClear: [], gold: META_GOLD_START,
    perkChoices, perkSchemaVersion: PERK_SCHEMA_VERSION,
  };
}

/** Normaliza un objeto meta arbitrario (tolera datos viejos/corruptos). */
export function normalizeMeta(raw) {
  assertMetaTowerInvariants();
  const m = raw && typeof raw === 'object' ? raw : {};
  const levels = {};
  const frags = {};
  for (const t of META_TOWERS) {
    const lv = clampInt(m.levels?.[t.key], 1, META_MAX_LEVEL, 1);
    levels[t.key] = lv;
    // v6: los fragmentos NO se truncan al coste del nivel — el excedente
    // es legítimo (el jugador acumula +60/victoria y decide cuándo gastar
    // con MEJORAR; sin rollover automático ya no hay sobrante que recortar).
    frags[t.key] = clampInt(m.frags?.[t.key], 0, 999999, 0);
  }
  const victories = Math.max(0, clampInt(m.victories, 0, 999999, 0));
  const firstClear = Array.isArray(m.firstClear)
    ? m.firstClear.map(Number).filter((n) => Number.isInteger(n) && n >= 1)
    : [];
  // fase 16: oro almacenado y gastable. Datos viejos sin `gold` → inicial.
  const gold = clampInt(m.gold, 0, 999999, META_GOLD_START);
  // fase 16: elección de perk por tier (null = sin elegir | 0 = A | 1 = B).
  // Ausente/corrupto/otro valor → null (sin elegir, nunca crash).
  const perkChoices = {};
  for (const t of META_TOWERS) {
    const rawArr = Array.isArray(m.perkChoices?.[t.key]) ? m.perkChoices[t.key] : [];
    const arr = Array(PERK_TIERS);
    for (let i = 0; i < PERK_TIERS; i++) {
      const v = rawArr[i];
      arr[i] = v === 0 || v === 1 ? v : null;
    }
    perkChoices[t.key] = arr;
  }
  return {
    levels, frags, victories, firstClear, gold, perkChoices,
    perkSchemaVersion: PERK_SCHEMA_VERSION,
  };
}

function clampInt(v, min, max, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Lee el meta del storage (o default). Cachea para el hot-path de daño. */
let _cache = null;
export function loadMeta(storage = safeLocalStorage()) {
  invalidateMetaCaches();
  try {
    const raw = JSON.parse(storage.getItem(KEY));
    // Migración explícita: un save anterior al rework de identidad guardaba
    // índices A/B con OTRO significado. Se conservan nivel/frags/oro y se
    // limpian SOLO las elecciones (el jugador vuelve a elegir sus perks).
    if (raw && typeof raw === 'object' && raw.perkSchemaVersion !== PERK_SCHEMA_VERSION) {
      raw.perkChoices = {};
    }
    _cache = normalizeMeta(raw);
  } catch (_err) {
    _cache = defaultMeta();
  }
  return _cache;
}

/** Guarda el meta normalizado y refresca la caché; devuelve lo guardado. */
export function saveMeta(meta, storage = safeLocalStorage()) {
  invalidateMetaCaches();
  const m = normalizeMeta(meta);
  _cache = m;
  try {
    storage.setItem(KEY, JSON.stringify(m));
  } catch (_err) { /* storage lleno/bloqueado: la partida sigue igual */ }
  return m;
}

/** Borra el meta-juego (niveles/fragmentos/victorias de las 11
 *  torretas/drones) — vuelve al default (Nvl.1 en todas). Usado por el
 *  botón "Borrar progreso" del menú (dev-7 fase 14). No toca el progreso
 *  de stages ni el tema — eso son funciones separadas (ver progress.js/
 *  theme.js). */
export function resetMeta(storage = safeLocalStorage()) {
  return saveMeta(defaultMeta(), storage);
}

/** Estado meta actual (usa caché si existe). */
export function currentMeta() {
  return _cache ?? loadMeta();
}

// ---------- Costes y fórmulas (docs/BALANCE.md §Meta-game v3.5) ----------

/**
 * Coste de subir de `level` a `level+1` (v6, campaña de 100 niveles):
 * coste por DÉCADA — 75 (Nvl.1–10), 110 (11–20), 145 (21–30), …, 390
 * (91–100). Los primeros niveles conservan el coste histórico 75; el
 * total REAL para llevar una torreta de Nvl.1 a Nvl.100 es de 22 860
 * fragmentos (suma de fragCost(1..99)), lo que sostiene una progresión
 * larga sin volverse inalcanzable con +60 por victoria.
 */
export function fragCost(level) {
  const lv = Math.max(1, Math.trunc(level || 1));
  const decade = Math.floor((lv - 1) / PERK_EVERY);
  return META_FRAG_PER_LEVEL + 35 * decade;
}

/**
 * Perks activos de una torreta: 1 cada 10 niveles meta (Nvl.10 → 1,
 * Nvl.100 → 10/10). 0 en Nvl.1–9.
 *
 * @deprecated Sin uso en el código de producción: desde la fase 16 los
 * perks SON las elecciones A/B de `PERKS` y lo que aporta cada uno se lee
 * con `perkMods(type)`. Esta función solo queda referenciada por los tests
 * (tests/test-meta.mjs) como documentación del umbral de desbloqueo; NO
 * borrar mientras esos tests la usen.
 */
export function perkCount(type, meta = currentMeta()) {
  const key = TYPE_TO_KEY[type];
  if (!key) return 0;
  const lv = normalizeMeta(meta).levels[key] ?? 1;
  return Math.floor(Math.max(1, Math.min(META_MAX_LEVEL, lv)) / PERK_EVERY);
}

// ---------- Composición de mods: POLÍTICA POR CLAVE (CONTRATO) ----------

/**
 * Política de composición por clave de mod. ESTE ES EL CONTRATO con el
 * código de combate (towers.js / enemies.js): cada clave dice CÓMO se
 * combinan los `mods` de varios perks elegidos.
 *
 * ops:
 *   'mul' → PRODUCTO (1.15 × 1.20 = 1.38). Para los multiplicadores
 *           "más daño / más rápido / más radio": dos perks se potencian.
 *   'sum' → SUMA (0.15 + 0.10 = 0.25). Para contadores y probabilidades.
 *   'max' → se QUEDA CON EL MEJOR (0.10 vs 0.15 → 0.15). Para UMBRALES y
 *           para valores donde dos perks NO deben multiplicarse.
 * clamp: tope duro del resultado (una probabilidad nunca pasa de 1).
 *
 * Por qué cada política (reglas del contrato):
 *  - dmgMul / cadMul / areaMul → 'mul': son multiplicadores de una
 *    estadística; componerlos por producto es lo esperado.
 *  - critDmgMul → 'max': es la MULTIPLICACIÓN del crítico ("los críticos
 *    hacen x3"). Si dos perks dicen x3, el jugador quiere x3, NO x9.
 *    Multiplicarlo convertía un perk de crítico en un multiplicador de
 *    daño bestial.
 *  - executeThreshold → 'max': es un UMBRAL ("remata bajo 15% de vida"),
 *    no un incremento. El jugador se queda con el mejor umbral, y los
 *    valores de cada tier están calibrados para que el último sea
 *    estrictamente mejor (ver PERKS). Sumarlos disparaba umbrales
 *    incontrolados (50% = remate instantáneo) y hacía que un perk de
 *    nivel bajo "machacara" al de nivel alto.
 *  - critChanceAdd / explodeOnKillChance / stunChance / lifesteal → 'sum'
 *    con clamp 1: son PROBABILIDADES (o fracciones); 40% + 40% = 80% está
 *    bien, 40% + 40% + 50% = 130% no existe → tope a 100%.
 *  - slowOnHit → 'sum' con clamp 0.75: un slow más fuerte que 75% es
 *    absurdo (el juego queda congelado); towers.js además topa el slow
 *    COMBINADO del Campo de Fuerza en 0.60 (el tope META del dron es
 *    0.75 — ver META_SLOW_CAP).
 *  - explodeOnKillDmg / explodeOnKillRadius → 'sum': son magnitudes de la
 *    explosión, no probabilidades.
 *  - el resto (extraCount, chainFork, homingStrength, dpsAdd, rangeAdd,
 *    radiusAdd, thornDps, bubbleRegen, pierceCount, bounceCount) → 'sum':
 *    son contadores o magnitudes que se acumulan.
 *  - bulletSpeedMul → 'sum' (así está en el contrato; hoy ningún perk de
 *    PERKS lo usa, así que la elección es inocua hoy).
 *
 * Reglas para claves DESCONOCIDAS (a prueba de futuro):
 *   - terminan en 'Mul' → 'mul' (multiplicador por defecto).
 *   - cualquier otra    → 'sum' (acumulador por defecto).
 */
const MOD_POLICY = {
  // --- multiplicadores que se potencian entre sí ---
  dmgMul: { op: 'mul' },
  cadMul: { op: 'mul' },
  areaMul: { op: 'mul' },
  // --- umbrales / topes: se queda con el MEJOR ---
  critDmgMul: { op: 'max' },
  executeThreshold: { op: 'max' },
  // --- probabilidades: suma con tope a 100% ---
  critChanceAdd: { op: 'sum', clamp: 1 },
  explodeOnKillChance: { op: 'sum', clamp: 1 },
  stunChance: { op: 'sum', clamp: 1 },
  lifesteal: { op: 'sum', clamp: 1 },
  // --- magnitudes de la explosión al matar ---
  explodeOnKillDmg: { op: 'sum' },
  explodeOnKillRadius: { op: 'sum' },
  // --- contadores / acumuladores ---
  extraCount: { op: 'sum' },
  chainFork: { op: 'sum' },
  homingStrength: { op: 'sum' },
  dpsAdd: { op: 'sum' },
  rangeAdd: { op: 'sum' },
  radiusAdd: { op: 'sum' },
  thornDps: { op: 'sum' },
  bubbleRegen: { op: 'sum' },
  pierceCount: { op: 'sum' },
  bounceCount: { op: 'sum' },
  bulletSpeedMul: { op: 'sum' },
  // --- lentitud: suma con tope (un slow > 75% no tiene sentido) ---
  slowOnHit: { op: 'sum', clamp: 0.75 },
};

/** Política de una clave (explícita o por defecto según el sufijo). */
function modPolicy(key) {
  const p = MOD_POLICY[key];
  if (p) return p;
  return key.endsWith('Mul') ? { op: 'mul' } : { op: 'sum' };
}

/**
 * Composición de mods (fase 16/17): según la POLÍTICA POR CLAVE de arriba.
 * Exportado para los tests de techo (recorren ramas directamente).
 */
export function mergeMods(list) {
  const out = {};
  for (const perk of list) {
    for (const [k, v] of Object.entries(perk.mods)) {
      const pol = modPolicy(k);
      if (pol.op === 'mul') out[k] = (out[k] ?? 1) * v;
      else if (pol.op === 'max') out[k] = Math.max(out[k] ?? -Infinity, v);
      else out[k] = (out[k] ?? 0) + v;
      if (pol.clamp !== undefined && Number.isFinite(out[k])) {
        out[k] = Math.min(out[k], pol.clamp);
      }
    }
  }
  return out;
}

// ---------- Caché de normalización (hot path de daño) ----------

/**
 * `perkMods()` y `metaDmgMul()` se llaman varias veces por torreta y por
 * frame (getters de `damage`/`cooldown`). Normalizar el meta entero en
 * cada llamada costaba microsegundos por llamada. Se cachea por
 * IDENTIDAD del objeto meta crudo (WeakMap) y se invalida al guardar.
 *
 * OJO: la caché es SOLO de lectura. `normalizeMeta()` sigue devolviendo
 * una copia nueva (los que mutan el estado —rewardVictory, setPerkChoice,
 * upgradeTower— necesitan poder modificar su copia sin corromper la caché).
 */
let _normCache = new WeakMap();   // meta crudo → meta normalizado
let _perkCache = new WeakMap();   // meta crudo → { [tipo]: mods ya fusionados }

/** Invalida las cachés (cuando el estado del meta cambia de verdad). */
function invalidateMetaCaches() {
  _normCache = new WeakMap();
  _perkCache = new WeakMap();
}

/** Normaliza un meta crudo con caché por identidad (solo lectura). */
function cachedMeta(raw) {
  if (!raw || typeof raw !== 'object') return normalizeMeta(raw);
  const hit = _normCache.get(raw);
  if (hit) return hit;
  const norm = normalizeMeta(raw);
  _normCache.set(raw, norm);
  return norm;
}

/**
 * Combina los `mods` de los perks YA ELEGIDOS de una torreta (perkChoices,
 * uno por tier desbloqueado; los tiers sin elegir no aportan nada).
 *
 * El resultado se cachea por identidad del meta (invalidad al guardar) y
 * se devuelve como COPIA superficial: el llamador nunca debe poder
 * mutar el objeto cacheado (towers.js hace `Object.assign(this, ...)` y
 * `{...onHitOpts(gpm, game)}` con los campos sueltos).
 */
export function perkMods(type, meta = currentMeta()) {
  const tiers = PERKS[type];
  if (!tiers) return {};
  const cacheable = meta && typeof meta === 'object';
  let byType = cacheable ? _perkCache.get(meta) : null;
  if (!byType) {
    byType = {};
    if (cacheable) _perkCache.set(meta, byType);
  }
  const hit = byType[type];
  if (hit) return { ...hit };
  const choices = cachedMeta(meta).perkChoices?.[type];
  const chosen = [];
  for (let i = 0; i < tiers.length; i++) {
    const c = choices?.[i];
    if (c === 0) chosen.push(tiers[i].A);
    else if (c === 1) chosen.push(tiers[i].B);
    // null → tier sin elegir: no aporta nada
  }
  const merged = mergeMods(chosen);
  byType[type] = merged;
  return { ...merged };
}

// ---------- fase 16: elección binaria de perks por tier ----------

/** Índice del tier desbloqueado según nivel meta: 0 en Nvl.10, 9 en
 *  Nvl.100, -1 si el nivel todavía no desbloqueó ningún tier. */
export function tierAtLevel(level) {
  const lv = Math.min(META_MAX_LEVEL, Math.max(1, Math.trunc(level || 1)));
  return Math.floor(lv / PERK_EVERY) - 1;
}

/** Opciones A ({ desc, mods }) y B de un tier, para el modal de elección
 *  (null si el tipo o el tier no existen). */
export function getPerkOptions(type, tier) {
  const table = PERKS[type];
  if (!table) return null;
  const t = Number.isInteger(tier) && tier >= 0 ? tier : -1;
  return table[t] ?? null;
}

/**
 * Tiers desbloqueados (por nivel meta) que aún no tienen elección
 * registrada — pueden acumularse varios si el jugador no eligió al
 * subir. Devuelve índices de tier en orden ascendente.
 */
export function pendingPerkTiers(type, meta = currentMeta()) {
  const key = TYPE_TO_KEY[type];
  if (!key || !PERKS[type]) return [];
  const m = normalizeMeta(meta);
  const maxTier = tierAtLevel(m.levels[key] ?? 1);
  const choices = m.perkChoices?.[type] ?? [];
  const pending = [];
  for (let i = 0; i <= maxTier; i++) {
    if (choices[i] !== 0 && choices[i] !== 1) pending.push(i);
  }
  return pending;
}

/**
 * Registra la elección de un tier (0 = opción A, 1 = opción B) y
 * persiste. Valida que el tier exista, esté desbloqueado por nivel
 * (docs/DESIGN.md D4: (tier+1)×PERK_EVERY <= nivel) y que la elección sea
 * 0|1. Devuelve { ok, reason, meta } — en éxito meta = estado persistido
 * (saveMeta); en rechazo meta = entrada normalizada SIN cambios.
 * reason: 'unknown' | 'badTier' | 'locked' | 'badChoice'.
 */
export function setPerkChoice(type, tier, choice, meta = currentMeta(), storage = safeLocalStorage()) {
  const m = normalizeMeta(meta);
  const key = TYPE_TO_KEY[type];
  if (!key || !PERKS[type]) return { ok: false, reason: 'unknown', meta: m };
  const t = Number.isInteger(tier) ? tier : -1;
  if (t < 0 || t >= PERK_TIERS) return { ok: false, reason: 'badTier', meta: m };
  const lv = m.levels[key] ?? 1;
  if ((t + 1) * PERK_EVERY > lv) return { ok: false, reason: 'locked', meta: m };
  if (choice !== 0 && choice !== 1) return { ok: false, reason: 'badChoice', meta: m };
  m.perkChoices[key][t] = choice;
  return { ok: true, reason: null, meta: saveMeta(m, storage) };
}

/**
 * Redistribución de perks de una torreta COMPLETA (fase 16, docs/DESIGN.md
 * D4): cuesta PERK_RESET_COST de oro; los 10 tiers vuelven a "sin
 * elegir" para poder re-elegir. El nivel meta, los fragmentos y las
 * victorias NO se tocan. Devuelve { ok, reason, meta } —
 * reason: 'unknown' | 'insufficient'.
 */
export function resetPerks(type, meta = currentMeta(), storage = safeLocalStorage()) {
  const m = normalizeMeta(meta);
  const key = TYPE_TO_KEY[type];
  if (!key || !PERKS[type]) return { ok: false, reason: 'unknown', meta: m };
  if ((m.gold ?? 0) < PERK_RESET_COST) return { ok: false, reason: 'insufficient', meta: m };
  m.gold -= PERK_RESET_COST;
  m.perkChoices[key] = Array(PERK_TIERS).fill(null);
  return { ok: true, reason: null, meta: saveMeta(m, storage) };
}

// ---------- HITOS por torreta (Nvl.25 / 50 / 75 / 100) ----------

/**
 * Factor de daño por HITOS alcanzados (multiplicador): 1 + 2% por hito.
 * Nvl.24 → 1 · Nvl.25 → 1.02 · Nvl.50 → 1.04 · Nvl.75 → 1.06 ·
 * Nvl.100 → 1.08. Es una función PURA del nivel meta de la torreta.
 *
 * Tabla precalculada por nivel (índice = nivel meta) para que el hot path
 * (metaDmgMul se llama ~20 veces por frame) no recorra los hitos cada vez.
 */
const MILESTONE_FACTOR_BY_LEVEL = (() => {
  const arr = new Array(META_MAX_LEVEL + 1).fill(1);
  let hits = 0;
  for (let lv = 1; lv <= META_MAX_LEVEL; lv++) {
    if (META_MILESTONES.includes(lv)) hits++;
    arr[lv] = 1 + META_MILESTONE_DMG_PER_HIT * hits;
  }
  return arr;
})();

/**
 * Multiplicador de daño por hitos de una torreta (1 + 2% por hito
 * alcanzado). Lo consume `metaDmgMul()` (que es el multiplicador que ya
 * leen las 11 torres).
 */
export function milestoneDmgMul(type, meta = currentMeta()) {
  const key = TYPE_TO_KEY[type];
  if (!key) return 1;
  const lv = cachedMeta(meta).levels[key] ?? 1;
  return MILESTONE_FACTOR_BY_LEVEL[lv] ?? 1;
}

/**
 * Niveles de HITO alcanzados por una torreta (ascendentes) — para marcar
 * ★/✦/♦/🏆 en la UI. Nvl.24 → [] · Nvl.25 → [25] · Nvl.50 → [25, 50] ·
 * Nvl.100 → [25, 50, 75, 100].
 */
export function towerMilestones(type, meta = currentMeta()) {
  const key = TYPE_TO_KEY[type];
  if (!key) return [];
  const lv = cachedMeta(meta).levels[key] ?? 1;
  return META_MILESTONES.filter((ms) => lv >= ms);
}

/**
 * Multiplicador de daño meta de un tipo (v6, 100 niveles): 1 + 5%×(nivel−1)
 *  — Nvl.100 = ×5.95 — MÁS el bonus de HITOS de esa torreta (+2% por hito
 *  alcanzado: ×1.08 en Nvl.100 con los 4 hitos).
 * (Comentario viejo corregido: NO es "10%×tope Nvl.5", esa era la v3.5
 *  base; ver META_DMG_PER_LEVEL/META_MAX_LEVEL arriba y docs/BALANCE.md
 *  "Plan integral — dev-7" para la medición real del techo.)
 *
 * POR QUÉ los hitos van ACÁ y no en `perkMods()`: `perkMods().dmgMul` NO
 * lo lee la Rueda de Fuego (su DPS va por `d.dps × metaDmgMul + dpsAdd`)
 * ni el Campo de Fuerza (su daño son las espinas). Con el bono en
 * metaDmgMul las 11 torres lo reciben de verdad, sin tocar towers.js más
 * que el cableado de las espinas (`perkDmgFor`).
 */
export function metaDmgMul(type, meta = currentMeta()) {
  const key = TYPE_TO_KEY[type];
  if (!key) return 1;
  // cachedMeta(): la normalización va cacheada por identidad (el hot path
  // la llama varias veces por torreta y frame). NO se comparte el objeto
  // normalizado con quien lo muta: aquí solo se lee.
  const lv = cachedMeta(meta).levels[key] ?? 1;
  const curva = 1 + META_DMG_PER_LEVEL * Math.max(0, lv - 1);
  return curva * milestoneDmgMul(type, meta);
}

/**
 * Fracción de slow del Dron de Interferencia: 30% base + 1 p.p. por nivel
 * meta (tope 75%: al tope los enemigos quedan al 25% de velocidad).
 * Antes el tope era 50% y el dron se congelaba en Nvl.21 — sus 79 niveles
 * restantes no daban NADA. Solo aplica a forcefield; resto → undefined.
 *
 * OJO: el slow COMBINADO (meta + perks) lo topa el combate en 0.60
 * (towers.js) — ese tope tiene que subir a META_SLOW_CAP para que la
 * curva meta se vea en partida.
 */
export function metaSlowFrac(type, meta = currentMeta()) {
  if (type !== 'forcefield') return undefined;
  const lv = cachedMeta(meta).levels.forcefield ?? 1;
  return Math.min(META_SLOW_CAP, META_SLOW_BASE + META_SLOW_PER_LEVEL * (lv - 1));
}

/**
 * DPS REAL de las espinas de una torre (hoy: el Campo de Fuerza).
 *
 * El `thornDps` de los perks es un número PLANO (8/s, 12/s, 40/s) y el
 * Campo de Fuerza NO tiene campo `damage` (towers.js): su único daño son
 * las espinas. Sin este helper sus 100 niveles de meta no escalaban
 * (solo el slow, que además estaba topado en 50%).
 *
 * towers.js debe llamarlo donde hoy usa el valor plano:
 *   `hurtP(e, perkDmgFor('forcefield', meta) * dt, 'drone', ffm, game, enemies)`
 * (si no hay espinas elegidas → 0).
 */
export function perkDmgFor(type, meta = currentMeta()) {
  const base = perkMods(type, meta).thornDps ?? 0;
  if (!(base > 0)) return 0;
  return base * metaDmgMul(type, meta);
}

/** Saldo de oro almacenado (fase 16: ya no es derivado — se gana y se gasta). */
export function metaGold(meta = currentMeta()) {
  return normalizeMeta(meta).gold;
}

/**
 * Suma `n` de oro al saldo almacenado y persiste (fase 16). Clamp a
 * [0, 999999]. Devuelve el estado persistido (saveMeta).
 * Puntos de llamada: resultados de partida (stage clear / campaña) en
 * main.js — ver rewardVictory para las ganancias de fragmentos.
 */
export function rewardGold(n, meta = currentMeta(), storage = safeLocalStorage()) {
  const m = normalizeMeta(meta);
  const add = Number.isFinite(n) ? Math.trunc(n) : 0;
  m.gold = clampInt((m.gold ?? 0) + Math.max(0, add), 0, 999999, m.gold ?? 0);
  return saveMeta(m, storage);
}

// ---------- RANGOS del jugador (badge de la pantalla TORRETAS) ----------

/**
 * RANGOS del jugador. Antes el badge mostraba `1 + victorias` (un
 * CONTADOR disfrazado: "Nivel 332" sin nombres, sin umbrales y sin
 * consecuencia — no era un nivel). Ahora hay 6 rangos con nombre y color.
 *
 * El rango NO se persiste: es una FUNCIÓN de `victories` (misma idea que
 * el nivel meta, que también se deriva del progreso).
 *
 * UMBRALES y por qué son esos (cifras reales del meta-juego):
 *  - 0 victorias → Aprendiz: cuenta nueva.
 *  - 10 victorias → Centinela: ~600 fragmentos por torreta (Nvl.5-9).
 *  - 50 victorias → Guardia: ~3 000 fragmentos (Nvl.28-30: ya hay 2-3
 *    perks elegidos por torreta).
 *  - 150 victorias → Comandante: ~9 000 fragmentos (Nvl.57-60: la mitad
 *    de los perks de cada torre).
 *  - 331 victorias → Almirante: 22 860 fragmentos por torreta = Nvl.100
 *    EXACTO (60 por victoria × 331 + 60 extra por cada uno de los 50
 *    primacleares de la campaña). Sin el bonus de primera vez harían
 *    falta 381 victorias (22 860 / 60).
 *  - 1000 victorias → Arquitecto: 60 000 fragmentos por torreta = las 2
 *    primeras torres al máximo (Nvl.100) y una tercera a ~Nvl.85.
 */
export const META_RANKS = [
  { id: 'aprendiz',   name: 'Aprendiz',   min: 0,    color: 'var(--rank-1)' },
  { id: 'centinela',  name: 'Centinela',  min: 10,   color: 'var(--rank-2)' },
  { id: 'guardia',    name: 'Guardia',    min: 50,   color: 'var(--rank-3)' },
  { id: 'comandante', name: 'Comandante', min: 150,  color: 'var(--rank-4)' },
  { id: 'almirante',  name: 'Almirante',  min: 331,  color: 'var(--rank-5)' },
  { id: 'arquitecto', name: 'Arquitecto', min: 1000, color: 'var(--rank-6)' },
];

/**
 * Rango actual del jugador (el de mayor umbral que las victorias alcanzan).
 * Devuelve el objeto de META_RANKS: { id, name, min, color }.
 *
 * dev-7 fase 53: `color` es una REFERENCIA a un token CSS
 * (`var(--rank-N)`), no un hexadecimal suelto: los colores viven en
 * css/style.css, igual que los de la rareza y los tipos de dano.
 */
export function playerRank(meta = currentMeta()) {
  const v = normalizeMeta(meta).victories;
  let rango = META_RANKS[0];
  for (const r of META_RANKS) if (v >= r.min) rango = r;
  return rango;
}

/**
 * Nivel de RANGO del jugador (1..6) — el número del badge.
 *
 * ANTES devolvía `1 + victorias` (un contador disfrazado: 332 en una
 * campaña de 1100 niveles). Ahora es el número de RANGO; para mostrar el
 * nombre del rango usar `playerRank(meta).name`.
 */
export function playerLevel(meta = currentMeta()) {
  return META_RANKS.indexOf(playerRank(meta)) + 1;
}

/** Suma de niveles meta de las 11 torretas/drones (Rayo25 + Trueno35…). */
export function totalMetaLevels(meta = currentMeta()) {
  const m = normalizeMeta(meta);
  let sum = 0;
  for (const t of META_TOWERS) sum += m.levels[t.key] ?? 1;
  return sum;
}

// ---------- Recompensas ----------

/**
 * Victoria de stage: +60 fragmentos a CADA torreta meta (×2 la primera vez
 * que se completa ese stage). Los fragmentos se ACUMULAN puros en la barra
 * y el nivel sube SOLO con el botón MEJORAR (upgradeTower) — corrección
 * v6 (JK 28-08): el rollover automático consumía la barra antes de llegar
 * al coste, dejando el botón MEJORAR permanentemente deshabilitado en el
 * flujo real. Ahora el jugador junta 75/150/… y decide cuándo gastar; el
 * excedente se conserva (normalizeMeta ya no lo trunca). Adjunta
 * lastGain/lastFirst para el resumen STAGE_CLEAR (fuera de normalizeMeta
 * a propósito).
 *
 * fase 67: en el INFINITO la ganancia escala con la profundidad
 * (`endlessRewardMul`: ×1 en 51-60, ×2 en 61-70, … + ×1,5 en los hitos) y
 * `firstClear` NO se toca (no puede crecer sin techo).
 *
 * fase 69: `heatMul` (`heatRewardMul`, 1 + 0,08 × heat) multiplica la
 * ganancia por torreta. Nunca reduce: el Protocolo es opcional y el heat 0
 * paga exactamente lo de la fase 68.
 *
 * @param {object} meta
 * @param {number} stageId
 * @param {object} [storage]
 * @param {{heatMul?:number}} [opts]
 */
export function rewardVictory(meta, stageId, storage = safeLocalStorage(), { heatMul = 1 } = {}) {
  const m = normalizeMeta(meta);
  const id = Number(stageId);
  // fase 67: el INFINITO no escribe `firstClear` — sería un array sin techo
  // y un ×2 permanente por cada etapa nueva. Su recompensa sale del
  // multiplicador de profundidad (endlessRewardMul: escalera + hito ×1,5).
  const first = !isEndless(id) && !m.firstClear.includes(id);
  const gain = Math.round(
    (first ? META_FRAG_PER_VICTORY * META_FIRST_CLEAR_MULT : META_FRAG_PER_VICTORY)
    * endlessRewardMul(id)
    * (Math.max(1, Number(heatMul) || 1)),
  );
  // v6: acumulación SIN rollover — el nivel lo sube el botón MEJORAR
  // (upgradeTower). En Nvl.100 (maxed) los fragmentos siguen acumulándose
  // (barra MÁX en pantalla) sin efecto.
  for (const t of META_TOWERS) {
    m.frags[t.key] = (m.frags[t.key] ?? 0) + gain;
  }
  m.victories += 1;
  if (first) m.firstClear.push(id);
  const saved = saveMeta(m, storage);
  saved.lastGain = gain;   // por torreta (60 | 120 | ∞) — no persisten
  saved.lastFirst = first; // solo para el resumen STAGE_CLEAR
  return saved;
}

/**
 * fase 69 — BONUS de fragmentos por torreta, sin victoria: lo paga el hito
 * del Protocolo (5/10/20/35) UNA sola vez por cuenta (`progress.heat.
 * claimed`). Mismo patrón de guardado que `rewardVictory`, pero NO suma
 * `victories` ni escribe `firstClear` (un hito no es un stage limpiado).
 *
 * No adjunta `lastGain`: el resumen sigue leyendo el desglose de la
 * victoria (`rewardVictory`), que se llama después de los hitos.
 *
 * @param {object} meta
 * @param {number} perTower fragmentos por torreta
 * @param {object} [storage]
 * @returns {object} meta persistido
 */
export function rewardFrags(meta, perTower, storage = safeLocalStorage()) {
  const m = normalizeMeta(meta);
  const add = Number.isFinite(perTower) ? Math.trunc(perTower) : 0;
  if (add <= 0) return saveMeta(m, storage);
  for (const t of META_TOWERS) {
    m.frags[t.key] = (m.frags[t.key] ?? 0) + add;
  }
  return saveMeta(m, storage);
}

/**
 * v5 5b/5 + v6 — Upgrade MANUAL (botón MEJORAR en la pantalla TORRETAS).
 * Gasta fragCost(level) fragmentos y sube 1 nivel al instante, siempre
 * que haya fragmentos suficientes y la torreta no esté maxeada. Desde
 * v6 es LA ÚNICA vía de subir de nivel (rewardVictory solo acumula
 * fragmentos). Devuelve { ok, reason, meta } — en éxito meta = estado
 * persistido (saveMeta); en rechazo meta = entrada normalizada SIN
 * cambios. reason: 'unknown' | 'maxed' | 'insufficient'.
 */
export function upgradeTower(meta, towerKey, storage = safeLocalStorage()) {
  const base = normalizeMeta(meta);
  const t = META_TOWERS.find((x) => x.key === towerKey);
  if (!t) return { ok: false, reason: 'unknown', meta: base };
  const lv = base.levels[towerKey] ?? 1;
  if (lv >= META_MAX_LEVEL) return { ok: false, reason: 'maxed', meta: base };
  const cost = fragCost(lv);
  // Fragmentos del input CRUDO (no de base): la normalización trunca todo
  // sobrante a fragCost(lv), y un excedente legítimo (80 en Nvl.1) debe
  // poder gastarse entero y conservar el resto del sobrante.
  const frags = clampInt(meta?.frags?.[towerKey], 0, 999999, 0);
  if (frags < cost) return { ok: false, reason: 'insufficient', meta: base };
  base.levels[towerKey] = lv + 1;
  base.frags[towerKey] = frags - cost;
  return { ok: true, reason: null, meta: saveMeta(base, storage) };
}

// ---------- SUBIR TODO LO POSIBLE (fase 59.3) ----------

/**
 * PLAN de mejora de las 11 torretas: cuántos niveles pagaría el jugador
 * con los fragmentos que tiene, torreta por torreta.
 *
 * POR QUÉ EXISTE (el diagnóstico de la UX, fase 59.3): el meta es
 * MANUAL y el coste de un nivel es 75-390 fragmentos. Con 11 torres, la
 * campaña entera son ~484 clics y el jugador NO VE que puede subir: llegó
 * al S21 con 5 000 fragmentos acumulados sin gastarlos nunca. El plan es
 * la versión de lectura de "subir todo lo posible" (la UI puede pintar el
 * número sin tocar nada) y `upgradeAllTowers` es la versión que escribe.
 *
 * La política es GREEDY por torreta: subir mientras
 * `frags >= fragCost(nivel)`. Es la misma política que usa el simulador
 * para la trayectoria real (`trajectoryMetaLevel` en balance-sim.mjs), así
 * que lo que el jugador ve al pulsar el botón es lo que el juego mide.
 *
 * @param {object} meta estado meta (crudo o normalizado)
 * @returns {{key:string, from:number, to:number, cost:number}[]}
 */
export function upgradePlan(meta = currentMeta()) {
  const m = normalizeMeta(meta);
  const plan = [];
  for (const t of META_TOWERS) {
    let frags = m.frags[t.key] ?? 0;
    let lv = m.levels[t.key] ?? 1;
    const from = lv;
    let cost = 0;
    while (lv < META_MAX_LEVEL && frags >= fragCost(lv)) {
      const c = fragCost(lv);
      frags -= c;
      cost += c;
      lv += 1;
    }
    plan.push({ key: t.key, from, to: lv, cost });
  }
  return plan;
}

/**
 * Niveles de mejora que el jugador PODRÍA subir YA con sus fragmentos
 * (sin gastarlos todavía). Es el aviso de la UI: "hay mejoras
 * pendientes" → el botón "SUBIR TODO LO POSIBLE" se enciende.
 *
 * @param {object} meta estado meta
 * @returns {number} total de niveles disponibles (0 = nada que hacer)
 */
export function pendingUpgrades(meta = currentMeta()) {
  return upgradePlan(meta).reduce((s, p) => s + (p.to - p.from), 0);
}

/**
 * Fragmentos que costaría SUBIR TODO (fase 59.4): la suma de los costes
 * del plan greedy.
 *
 * POR QUÉ hace falta: el botón "SUBIR TODO" tiene que DECIR lo que va a
 * gastar (si no, el jugador no sabe si le conviene). Es la suma de
 * `upgradePlan` — el mismo plan que `upgradeAllTowers` ejecuta, así que
 * el número del botón y el gasto real coinciden siempre.
 *
 * @param {object} meta estado meta
 * @returns {number} fragmentos que se gastarían (0 si no hay nada que subir)
 */
export function pendingUpgradeCost(meta = currentMeta()) {
  return upgradePlan(meta).reduce((s, p) => s + p.cost, 0);
}

/**
 * SUBIR TODO LO POSIBLE (fase 59.3): gasta TODOS los fragmentos
 * disponibles subiendo cada torreta lo que pueda (política greedy, la
 * misma que `upgradePlan`). Es la respuesta al meta invisible: el jugador
 * apretó 484 veces "MEJORAR" en la campaña; con este botón apretó UNA.
 *
 * Función PURA y testeable: recibe el meta y el storage inyectables (como
 * el resto de meta.js), NO muta la entrada (normaliza a una copia) y
 * persiste el resultado con `saveMeta`.
 *
 * @param {object} meta estado meta
 * @param {object} [storage] storage inyectable (localStorage por defecto)
 * @returns {{meta: object, levels: number}} el meta guardado y los niveles
 *   que se subieron en total
 */
export function upgradeAllTowers(meta, storage = safeLocalStorage()) {
  const m = normalizeMeta(meta);
  const plan = upgradePlan(m);
  let levels = 0;
  for (const p of plan) {
    if (p.to <= p.from) continue;
    m.levels[p.key] = p.to;
    m.frags[p.key] = Math.max(0, (m.frags[p.key] ?? 0) - p.cost);
    levels += p.to - p.from;
  }
  const saved = saveMeta(m, storage);
  saved.lastUpgrades = levels; // no persiste (como lastGain/lastFirst)
  return { meta: saved, levels };
}

// ---------- Icono (reusa el render canvas real de la torre/dron) ----------

const ICON_W = 84;
const ICON_H = 72;
/** Margen del ícono (px por lado) y tope de escala. */
const ICON_MARGIN = 5;
const ICON_MAX_SCALE = 1.15;

/**
 * fase 60 — ENCUADRE del ícono de una torre: escala y centro para que la
 * caja REAL del rig (silueta + pad) entre en el canvas con el mismo
 * margen. Está exportada para poder testearla sin canvas.
 *
 * OJO con la clave: recibe un `kind` de rig ('fan', 'bolt', …), NO una
 * clave de TOWERS ('guardian', 'thunderstroke', …). Pasarla mal NO
 * revienta: `rigBox` cae a una caja genérica y el ícono se recorta en
 * silencio (fue el bug de la fase 60: el Tesla y el Thunderstroke
 * perdían los nodos de chispa y el orbe por arriba).
 * @param {string} kind clave de TOWER_RIGS
 * @returns {{s:number, cx:number, cy:number}}
 */
export function towerIconFit(kind) {
  const box = rigBox(kind);
  const s = Math.min(
    (ICON_W - ICON_MARGIN * 2) / (box.x1 - box.x0),
    (ICON_H - ICON_MARGIN * 2) / (box.y1 - box.y0),
    ICON_MAX_SCALE,
  );
  return { s, cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2 };
}

/**
 * Dibuja el ícono de la torreta meta en un <canvas> reusando el render
 * REAL del juego (Tower.render / Drone.draw — "el ícono se reusa del
 * render canvas de la torre"). Escala por tipo para que quepa la burbuja
 * del Dron de Interferencia.
 */
export function renderTowerIcon(canvas, metaKey) {
  if (!canvas || canvas.tagName !== 'CANVAS') return;
  const entry = META_TOWERS.find((t) => t.key === metaKey);
  if (!entry) return;
  let ctx;
  try { ctx = canvas.getContext('2d'); } catch (_e) { return; }
  canvas.width = ICON_W;
  canvas.height = ICON_H;
  ctx.clearRect(0, 0, ICON_W, ICON_H);
  ctx.save();

  const isDrone = !!DRONES[entry.type];
  // dev-7 fase 21: Avispas es un dron chico (panal de 8 px de radio, sin
  // burbuja) — con la escala 0.30 pensada para Campo de Fuerza (burbuja
  // de 140 px) quedaría casi invisible en el ícono.
  const s = isDrone
    ? (entry.type === 'firewheel' ? 1.5 : entry.type === 'wasps' ? 2.4 : 0.30) // burbuja 140 → r=42 px
    : 1;
  // FASE 58: el anclaje del dron sigue al layout (baja con el alto
  // lógico). El offset de 130 px mantiene el MISMO dibujo que antes
  // (el dron real vuela 50 px por debajo de este ancla).
  const y0 = isDrone ? CONFIG.TOWER_Y - 130 : CONFIG.TOWER_Y; // centro del render (Tower.render
  const x0 = CONFIG.BASE_X;                   // / Drone.draw traducen a (x, y))
  if (isDrone) {
    // Transformación: (42, 65) = origen del render en el canvas del ícono.
    ctx.translate(ICON_W / 2 - x0 * s, 65 - y0 * s);
    ctx.scale(s, s);
    const d = new Drone(entry.type, { engine: { _t: 0 } }, 0);
    d.draw(ctx);
  } else {
    // fase 60: la torre se ENCUADRA con su caja real (rigBox: silueta +
    // pad) en vez de una escala fija de 0.8 para las 8. Con la escala
    // fija, el Guardian (50 px de ancho) y el Láser (20 px) quedaban muy
    // distintos dentro de la misma tarjeta; ahora todos llenan el ícono
    // con el mismo margen. El nivel se pasa en 0 para que el pad del
    // ícono NO muestre ticks (el nivel de la tarjeta es el del
    // meta-juego, no el de la run).
    const { s: sT, cx, cy } = towerIconFit(TOWERS[entry.type].kind);
    ctx.translate(ICON_W / 2 - (x0 + cx) * sT, ICON_H / 2 - (y0 + cy) * sT);
    ctx.scale(sT, sT);
    // Nivel 0 → el pad del ícono no enciende ningún tick de nivel (el
    // nivel de la tarjeta es el del META-juego, no el de la run).
    const t = new Tower(entry.type, x0, 0);
    t.render(ctx);
  }
  ctx.restore();
}

