// ============================================================
// perks.js - mecánicas de perks en combate (dev-7 fases 23-25)
//
// MÓDULO NUEVO que unifica la lógica de perks que estaba DUPLICADA en
// dos archivos (la causa raíz de que un bug existiera en un solo camino):
//
//   - towers.js   hurtP()          → remate / robo de vida / explosión
//   - enemies.js  projectileStrike() → los mismos 3, sobre proyectiles
//   - towers.js   procFx()         → señal visual+sonora del perk
//   - enemies.js  procFxE()        → la MISMA señal, copia literal
//
// Ahora hay UNA sola implementación de cada cosa y las dos rutas
// (torre/dron y proyectil) comparten EXACTAMENTE la misma semántica.
//
// Regla de dependencias: este módulo NO importa nada de meta.js, ni de
// towers.js, ni de enemies.js (para no crear ciclos nuevos). Recibe los
// `mods` ya resueltos por parámetro y solo usa helpers puros de engine.js.
//
// Todas las llamadas son duck-typed (toleran dummies de test sin
// takeDamage) y devuelven false si no hubo impacto.
//
// dev-7 fase 51: este módulo es además el CANAL DE CARTAS — el sitio
// donde se guardan y acumulan los mods que una carta le da a una
// unidad (`unit.cardMods`), para que una carta pueda dar MECÁNICAS
// (rebote, perforación, explosión, ralentizar, crítico, robo de vida,
// aturdir, remate) y no sólo multiplicadores. La FUSIÓN con los perks
// de meta es `unitMods()` (js/towers.js).
// ============================================================

import { dist } from './engine.js';
import { healBase } from './base-heal.js';

/** Daño a un blanco duck-typed (tolera dummies de test sin takeDamage). */
function hurt(enemy, n, kind) {
  if (enemy && !enemy.dead && typeof enemy.takeDamage === 'function') {
    return enemy.takeDamage(n, kind);
  }
  return false;
}

/**
 * dev-7 fase 25: señal visible/sonora cuando se activa un perk raro
 * (remate / explosión al matar). Texto flotante + evento 'perk:proc' que
 * main.js traduce a sonido (las torres no importan audio). Limitado a
 * 1 señal cada 0.15 s POR TIPO para no saturar pantalla ni audio ('execute'
 * y 'boom' throttlean por separado, no globalmente).
 *
 * Antes esta función estaba COPIADA en towers.js y enemies.js; ahora vive
 * acá una sola vez y las dos rutas la comparten.
 */
export function procFx(game, kind, x, y) {
  const eng = game?.engine;
  if (!eng) return;
  const now = eng._t ?? 0;
  const last = (eng._procAt ??= {});
  if (now - (last[kind] ?? -9) < 0.15) return;
  last[kind] = now;
  const isExec = kind === 'execute';
  eng.floatText?.(x, y - 18, isExec ? '¡REMATE!' : '¡BOOM!', isExec ? '#FF5555' : '#FFB36A');
  eng.emit?.('perk:proc', { kind });
}

/**
 * fase 72 — TOPE del robo de vida por golpe.
 *
 * Los valores de los perks bajan ~4× (1-6 %) y este tope impide que una
 * build con varias capas (meta + carta) se vuelva inmortal: ninguna unidad
 * cura más del 10 % del daño efectivo que hace. Con la fuga a HP máximo y
 * la base como única condición, el robo compra aguante, no invulnerabilidad.
 */
export const LIFESTEAL_CAP = 0.10;

/**
 * Cura al escudo de la base con el robo de vida del perk.
 *
 * Reglas (fase 25):
 *  - cura el DAÑO EFECTIVAMENTE HECHO, no el sobredaño: un golpe de 500 a
 *    un enemigo de 10 HP cura 10 × lifesteal, no 500 × lifesteal;
 *  - NUNCA resucita la base: si la fortaleza ya está en 0 (GAME_OVER) no se
 *    cura (si no, la pantalla de derrota mostraría un escudo vivo y el
 *    estado quedaría inconsistente);
 *  - el tope es `maxHp` (nunca se excede).
 *  - fase 72: el rate se acota a `LIFESTEAL_CAP` (10 %). El evento
 *    `base:healed` lo usa main para el feedback verde (con throttle).
 *
 * @returns {number} cuánto se curó (0 si no se curó)
 */
function applyLifesteal(game, dealt, rate) {
  const capped = Math.max(0, Math.min(LIFESTEAL_CAP, Number(rate) || 0));
  if (!(capped > 0) || !(dealt > 0)) return 0;
  // fase 75: una sola implementación de curación con las guardas comunes
  // (no resucita una base en 0, no supera maxHp, emite base:healed).
  return healBase(game, dealt * capped);
}

/**
 * Tope de profundidad de la reacción en cadena: el vecino al que explota
 * puede detonar a su vez, hasta 3 saltos. Evita la recursión infinita.
 */
const MAX_CHAIN_DEPTH = 3;

/**
 * dev-7 fase 23 (pedido del usuario: "que los perks no sean aburridos,
 * simples mejoras de status" — sin considerar el balance a propósito).
 * Envoltorio de hurt() con 3 mecánicas NUEVAS y de verdad (no
 * decorativas), compartidas entre varias torres via perkMods(type):
 *  - executeThreshold: si el enemigo está POR DEBAJO de ese % de su HP
 *    máximo, lo remata de una (no un simple bonus de daño).
 *  - lifesteal: cura al escudo de la base con una fracción del daño hecho.
 *  - explodeOnKillChance/Dmg/Radius: al matar, con esa probabilidad
 *    detona una explosión que daña a los vecinos (reacción en cadena).
 * Sin ninguno de esos campos en `mods`, se comporta igual que hurt().
 *
 * SEMÁNTICA DEL REMATE (fase 26, bug corregido): el umbral se evalúa
 * contra la vida que el enemigo TIENE ANTES del golpe, no contra la que
 * le quedaría después. Antes se comparaba `(hp - dmg)`, lo que producía
 * un INSTAKILL de jefes: un jefe de 1000 HP al 20 % (200 HP) moría de un
 * solo balazo de 150 porque "200 - 150 <= 100". Con la semántica correcta
 * (ya está por debajo del umbral → remate) el jefe recibe el daño normal.
 * Además el remate NUNCA reduce el daño (`Math.max`), así que el robo de
 * vida no se penaliza por el remate.
 *
 * @param {object} enemy blanco (duck-typed)
 * @param {number} n daño a aplicar
 * @param {string} kind etiqueta informativa del golpe
 * @param {object|null} mods mods del perk (executeThreshold/lifesteal/…)
 * @param {object|null} game para el escudo/engine (señales, curación)
 * @param {Array|null} enemies lista viva para la explosión en área
 * @param {object} [opts] { depth, rng, noLifesteal } (interno)
 * @returns {boolean} true si el golpe mató al enemigo
 */
/**
 * dev-7 fase 50 — MULTIPLICADOR DE CAZA (contra una familia).
 *
 * Las cartas "hunt_*" dan un multiplicador extra contra una familia de
 * enemigo concreta (roca / cristal / espora / virus). Se combina con la
 * matriz de tipos (que ya pondera por familia) y con la regla de fase
 * del jefe.
 *
 * @param {object} mods los mods de la unidad (perks + cartas)
 * @param {object} enemy el enemigo que va a recibir el dano
 * @returns {number} el multiplicador (1 si no hay carta de caza)
 */
export function familyHuntMul(mods, enemy) {
  if (!mods || !enemy) return 1;
  const fam = enemy.data?.family ?? enemy.family ?? null;
  if (!fam) return 1;
  const key = `fam${fam[0].toUpperCase()}${fam.slice(1)}Mul`;
  const v = mods[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 1;
}
export function applyPerkDamage(enemy, n, kind, mods, game, enemies, opts = {}) {
  if (!enemy || enemy.dead) return false;
  const depth = opts.depth ?? 0;
  const rng = opts.rng ?? Math.random;
  let dmg = n;
  // dev-7 fase 50: la CAZA DE FAMILIA. Un multiplicador extra contra
  // una familia concreta (roca/cristal/espora/virus). Se aplica aqui,
  // el UNICO punto por el que pasa todo el dano de una torre, para que
  // sirva igual en proyectiles (balas, misiles) y en el dano instantaneo
  // (haz, cadena, descarga).
  dmg *= familyHuntMul(mods, enemy);
  let executed = false;
  // La geoda esconde el cuerpo detrás de las placas: el umbral de remate
  // mira el HP VISIBLE (cuerpo + placas), no sólo el cuerpo.
  const hpForThreshold = enemy.hpDisplay ?? enemy.hp;
  if (mods?.executeThreshold && enemy.hpMax
    && hpForThreshold <= enemy.hpMax * mods.executeThreshold) {
    executed = dmg < hpForThreshold; // solo cuenta si el remate hizo falta
    dmg = Math.max(dmg, hpForThreshold); // remate garantizado, sin REDUCIR el daño
  }
  const hpBefore = enemy.hpDisplay ?? enemy.hp;
  const killed = hurt(enemy, dmg, kind);
  // Daño REALMENTE hecho (acotado por la vida que le quedaba): el robo de
  // vida cura sobre el daño efectivo, nunca sobre el sobredaño. `hpDisplay`
  // incluye las placas de la geoda: romper blindaje también es daño hecho.
  const hpAfter = killed ? 0 : (enemy.hpDisplay ?? enemy.hp ?? 0);
  const dealt = Math.max(0, hpBefore - hpAfter);
  if (killed && executed) procFx(game, 'execute', enemy.x, enemy.y);
  // El robo de vida se aplica UNA vez por golpe/proyectil. En un área (splash
  // de N enemigos) cada blanco aporta su `dealt` y el total se cura una sola
  // vez — que es lo mismo que curar el % sobre el daño total, pero evita
  // que el tope de maxHp se alcance N veces seguidas.
  if (!opts.noLifesteal) applyLifesteal(game, dealt, mods?.lifesteal ?? 0);
  if (killed && mods?.explodeOnKillChance && rng() < mods.explodeOnKillChance) {
    const radius = mods.explodeOnKillRadius ?? 70;
    const blastDmg = mods.explodeOnKillDmg ?? 20;
    for (const e2 of enemies || []) {
      if (!e2 || e2.dead || e2 === enemy) continue;
      if (dist(e2.x, e2.y, enemy.x, enemy.y) <= radius) {
        // La cadena: el vecino alcanzado puede detonar a su vez (hasta el
        // tope de profundidad). El daño de la cadena NO cura al escudo
        // (noLifesteal) para que una cadena larga no vacíe la vida.
        if (depth < MAX_CHAIN_DEPTH) {
          applyPerkDamage(e2, blastDmg, 'explode-kill', mods, game, enemies, {
            depth: depth + 1,
            rng,
            noLifesteal: true,
          });
        } else {
          hurt(e2, blastDmg, 'explode-kill');
        }
      }
    }
    procFx(game, 'boom', enemy.x, enemy.y);
    game?.engine?.spawnParticles?.(enemy.x, enemy.y, '#FFB36A', 10, {
      speedMin: 60, speedMax: 160, lifeMin: 0.2, lifeMax: 0.4,
    });
  }
  return killed;
}

/**
 * Campos de "al golpear" de los perks (fase 23) que viajan en el
 * proyectil — los lee la ruta de proyectil (enemies.js).
 */
export function onHitOpts(mods, game) {
  return {
    executeThreshold: mods?.executeThreshold ?? 0,
    lifesteal: mods?.lifesteal ?? 0,
    explodeOnKillChance: mods?.explodeOnKillChance ?? 0,
    explodeOnKillDmg: mods?.explodeOnKillDmg ?? 20,
    explodeOnKillRadius: mods?.explodeOnKillRadius ?? 70,
    // fase 74: explosión AL IMPACTAR (Balas Detonantes).
    impactExplodeChance: mods?.impactExplodeChance ?? 0,
    impactExplodeFrac: mods?.impactExplodeFrac ?? 0,
    impactExplodeRadius: mods?.impactExplodeRadius ?? 0,
    // dev-7 fase 50: la CAZA DE FAMILIA (cartas "hunt_*"): un
    // multiplicador extra contra una familia concreta de enemigo.
    famRockMul: mods?.famRockMul ?? 1,
    famCrystalMul: mods?.famCrystalMul ?? 1,
    famSporeMul: mods?.famSporeMul ?? 1,
    famVirusMul: mods?.famVirusMul ?? 1,
    game,
  };
}

/**
 * Igual que onHitOpts() pero SIN pisar `game` si ya viene seteado
 * (HomingMissile setea this.game en su constructor).
 */
export function pickOnHit(o) {
  return {
    executeThreshold: o.executeThreshold ?? 0,
    lifesteal: o.lifesteal ?? 0,
    explodeOnKillChance: o.explodeOnKillChance ?? 0,
    explodeOnKillDmg: o.explodeOnKillDmg ?? 20,
    explodeOnKillRadius: o.explodeOnKillRadius ?? 70,
    // fase 74: explosión al impactar (Balas Detonantes).
    impactExplodeChance: o.impactExplodeChance ?? 0,
    impactExplodeFrac: o.impactExplodeFrac ?? 0,
    impactExplodeRadius: o.impactExplodeRadius ?? 0,
    // dev-7 fase 50: la caza de familia viaja con el proyectil.
    famRockMul: o.famRockMul ?? 1,
    famCrystalMul: o.famCrystalMul ?? 1,
    famSporeMul: o.famSporeMul ?? 1,
    famVirusMul: o.famVirusMul ?? 1,
    ...(o.game ? { game: o.game } : {}),
  };
}

// ============================================================
// dev-7 fase 51 — CANAL DE CARTAS: MECÁNICAS en una partida
// ============================================================
//
// Hasta la fase 50 las CARTAS (js/cards.js) sólo tocaban
// multiplicadores y contadores sueltos (`dmgMul`, `cadMul`,
// `fortress.pierce`…): NO podían dar MECÁNICAS. Los perks de meta
// (js/meta.js) sí: son el vocabulario completo (rebote, perforación,
// explosión al morir, ralentizar, crítico, robo de vida, aturdir,
// remate).
//
// Este módulo es el CANAL: guarda y ACUMULA los mods que una carta
// le da a una unidad (`unit.cardMods`). La FUSIÓN de esos mods con
// los del perk vive en `unitMods()` (js/towers.js), que ya importa
// `perkMods`/`mergeMods` de meta.js.
//
// OJO — este módulo NO importa meta.js (ni towers.js, ni enemies.js):
// la regla de dependencias de la cabecera de este archivo vale también
// para el canal. Por eso el canal sólo guarda/acumula (lógica pura) y
// la fusión (que necesita la política de mods de meta.js) está en
// towers.js.

/**
 * Nº de veces que se ha aplicado una carta concreta a una unidad.
 * Lo usa el TOPE del catálogo (`CAPS` en js/cards.js).
 * @param {object} unit torre o dron (duck-typed)
 * @param {string} cardId id de la carta
 * @returns {number}
 */
export function cardApps(unit, cardId) {
  return unit?.cardApps?.[cardId] ?? 0;
}

/**
 * Acumula los mods de una carta en una unidad (y cuenta la
 * aplicación para el TOPE).
 *
 * Reglas de composición del canal:
 *  - CONTADORES y PROBABILIDADES (lo normal en una carta de técnica:
 *    pierceCount, bounceCount, stunChance, lifesteal, slowOnHit,
 *    critChanceAdd, explodeOnKill*) se SUMAN: dos "Rebote Magnético"
 *    = 2 rebotes;
 *  - MULTIPLICADORES (las claves que acaban en 'Mul') se MULTIPLICAN:
 *    dos "×1.3 de daño" = ×1.69;
 *  - el TOPE lo aplica el llamante (cards.js): `CAPS[cardId]`.
 *
 * @param {object} unit torre o dron (duck-typed)
 * @param {object} mods mods a acumular ({clave: valor})
 * @param {string} cardId id de la carta (para el contador de apps)
 * @returns {boolean} true si se aplicó
 */
export function addCardMods(unit, mods, cardId) {
  if (!unit || !mods || typeof mods !== 'object') return false;
  const cm = (unit.cardMods = unit.cardMods ?? {});
  for (const [k, v] of Object.entries(mods)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (k.endsWith('Mul')) cm[k] = (cm[k] ?? 1) * v;
    else cm[k] = (cm[k] ?? 0) + v;
  }
  const apps = (unit.cardApps = unit.cardApps ?? {});
  apps[cardId] = (apps[cardId] ?? 0) + 1;
  return true;
}
