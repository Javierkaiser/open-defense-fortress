// =============================================================================
// tower-mechanics.js — IDENTIDAD MECÁNICA DE CADA TORRE/DRON
// -----------------------------------------------------------------------------
// Hasta la fase 75 las 11 unidades compartían el mismo vocabulario: robo de
// vida, remate y explosión al matar aparecían en TODAS. Este módulo declara
// una mecánica FIRMA por unidad y concentra sus efectos en hooks:
//
//   · onMechanicHit()  — impacto de proyectil o golpe instantáneo
//   · onMechanicTick() — tick de un haz/aura (Beam, Láser, Campo de fuerza)
//   · onMechanicKill() — muerte de un enemigo (propagación del veneno)
//   · mechanicDamageMul() — marcas que AMPLIFICAN daño (melt/cut/judgment/ion/rail)
//
// Las torres NO leen estas reglas en su hot loop: el registro vive en datos
// (`mech` en towers-data.js) y los hooks se llaman desde los puntos que ya
// existían (projectileStrike, Tower.fire, Drone.update, LaserStaticFx.update,
// Enemy.die). Así una mecánica nueva no obliga a tocar las 11 unidades.
//
// REGLA DE ORO: una clave genérica (executeThreshold, lifesteal,
// explodeOnKill*, slowOnHit, stunChance, crit*, bounceCount) sólo puede
// vivir en su dueño. El test tests/test-tower-identity.mjs es el guardián.
// =============================================================================

import { DRONES, TOWERS, dpsScaleFor } from './towers-data.js';
import { applyMark, applyPoison, hasMark } from './enemies-status.js';

/**
 * Registro canónico. `owner` es la ÚNICA unidad que puede llevar la mecánica;
 * `hooks` documenta dónde se consume y sirve al test de identidad.
 */
export const MECHANICS = {
  suppression: {
    owner: 'guardian', name: 'Supresión', hooks: ['hit'],
    tagline: 'Impactos consecutivos al mismo blanco acumulan foco y detonan.',
  },
  execute: {
    owner: 'missile', name: 'Ejecución', hooks: ['hit'],
    tagline: 'Remata a la amenaza que cae por debajo del umbral.',
  },
  melt: {
    owner: 'beam', name: 'Fusión', hooks: ['tick'],
    tagline: 'El foco sostenido funde la coraza: cada stack amplifica el daño.',
  },
  judgment: {
    owner: 'thunderstroke', name: 'Juicio', hooks: ['hit'],
    tagline: 'El aturdido queda marcado y recibe más daño eléctrico.',
  },
  ion: {
    owner: 'tesla', name: 'Ionización', hooks: ['hit'],
    tagline: 'La cadena ioniza el racimo: los marcados reciben más eléctrico.',
  },
  crater: {
    owner: 'mortar', name: 'Cráter', hooks: ['explode'],
    tagline: 'El impacto deja una zona de fuego y lodo que castiga el área.',
  },
  rail: {
    owner: 'gauss', name: 'Riel', hooks: ['hit'],
    tagline: 'La marca de riel amplifica el daño balístico de las demás torres.',
  },
  cut: {
    owner: 'laser', name: 'Corte', hooks: ['tick'],
    tagline: 'El rayo corta la estructura: todo el daño sobre el blanco sube.',
  },
  burn: {
    owner: 'firewheel', name: 'Ignición', hooks: ['hit'],
    tagline: 'El contacto prende fuego; la rueda es la única que quema.',
  },
  venom: {
    owner: 'wasps', name: 'Veneno', hooks: ['hit', 'kill'],
    tagline: 'El veneno se propaga a los vecinos cuando el envenenado muere.',
  },
  bubble: {
    owner: 'forcefield', name: 'Burbuja', hooks: ['tick'],
    tagline: 'La burbuja frena, sostiene y marca a todo lo que atrapa.',
  },
};

/** Datos de la mecánica de una unidad (`mech` en towers-data.js). */
export function mechDataOf(type) {
  return TOWERS[type]?.mech ?? DRONES[type]?.mech ?? null;
}

/** Id de la mecánica firma de una unidad (o null). */
export function mechIdOf(type) {
  return mechDataOf(type)?.id ?? null;
}

/** Acepta un tipo o una unidad ({ type }). */
export function mechanicOf(unitOrType) {
  const type = typeof unitOrType === 'string' ? unitOrType : unitOrType?.type;
  return mechDataOf(type);
}

/** ¿`type` es el dueño de la mecánica `id`? */
export function isMechanicOwner(type, id) {
  return mechIdOf(type) === id;
}

// ---------------------------------------------------------------------------
// Amplificadores de marca. Son deliberadamente chicos: la identidad está en
// el estado, no en un +X% gigante. `cut` y `melt` son universales; `judgment`
// e `ion` sólo escalan su propio tipo de daño; `rail` excluye al Gauss para
// que no se buffe con su propia marca.
// ---------------------------------------------------------------------------
const CUT_AMP = 0.08;
const MELT_AMP_PER_STACK = 0.04;
const JUDGMENT_AMP = 0.15;
const ION_AMP = 0.10;
const RAIL_AMP = 0.10;

/**
 * Multiplicador de daño por marcas activas.
 * @param {object} enemy
 * @param {string} kind etiqueta del golpe ('beam', 'bolt', 'chain', 'laser',
 *   'ballistic', 'blast', 'drone', …)
 * @param {string|null} source id de la unidad que golpea (para `rail`)
 * @returns {number}
 */
export function mechanicDamageMul(enemy, kind, source = null) {
  if (!enemy || enemy.dead) return 1;
  let mul = 1;
  if (hasMark(enemy, 'cut')) mul *= 1 + CUT_AMP;
  if (hasMark(enemy, 'melt')) {
    const stacks = Math.max(1, Math.min(3, enemy.meltStacks ?? 1));
    mul *= 1 + MELT_AMP_PER_STACK * stacks;
  }
  if (kind === 'bolt' && hasMark(enemy, 'judgment')) mul *= 1 + JUDGMENT_AMP;
  if (kind === 'chain' && hasMark(enemy, 'ion')) mul *= 1 + ION_AMP;
  if (kind === 'ballistic' && source !== 'gauss' && hasMark(enemy, 'rail')) {
    mul *= 1 + RAIL_AMP;
  }
  return mul;
}

/** Tiempo de juego seguro para tests sin engine. */
function nowOf(game) {
  return game?.engine?._t ?? 0;
}

/**
 * Hook de impacto. `ctx` puede traer { p, mods, dmg, killed, list, dt, unit }.
 * No devuelve nada: el daño base ya se aplicó; acá sólo se agrega el estado
 * de la mecánica (y, en Supresión, el estallido de foco).
 */
export function onMechanicHit(type, enemy, game, ctx = {}) {
  if (!enemy || enemy.dead) return;
  const mech = mechDataOf(type);
  if (!mech) return;
  switch (mech.id) {
    case 'suppression': {
      // Foco: impactos consecutivos del Guardian sobre el MISMO enemigo.
      const now = nowOf(game);
      const window = mech.window ?? 1.5;
      if (now - (enemy._supAt ?? -Infinity) > window) enemy._sup = 0;
      enemy._sup = Math.min(mech.maxStacks ?? 3, (enemy._sup ?? 0) + 1);
      enemy._supAt = now;
      if (enemy._sup >= (mech.maxStacks ?? 3)) {
        enemy._sup = 0;
        enemy._supAt = now;
        const burst = Math.round((ctx.dmg ?? 0) * (mech.burstFrac ?? 0.45));
        if (burst > 0) {
          if (typeof enemy.takeDamage === 'function') enemy.takeDamage(burst, 'ballistic');
          game?.engine?.spawnParticles?.(enemy.x, enemy.y, '#35C8FF', 6, {
            speedMin: 30, speedMax: 120, gravity: 0,
            lifeMin: 0.12, lifeMax: 0.28, sizeMin: 1, sizeMax: 2.4,
          });
        }
      }
      break;
    }
    case 'judgment':
      applyMark(enemy, 'judgment', mech.duration ?? 2);
      break;
    case 'ion':
      applyMark(enemy, 'ion', mech.duration ?? 2);
      break;
    case 'rail':
      applyMark(enemy, 'rail', mech.duration ?? 2);
      break;
    case 'cut':
      applyMark(enemy, 'cut', mech.duration ?? 2);
      break;
    case 'burn': {
      // La quemadura es el DoT propio de la Rueda de Fuego: escala con el
      // dial de la unidad (base + `burnDpsAdd`). La duración no se toca.
      const dps = ((mech.dps ?? 8) + (ctx.mods?.burnDpsAdd ?? 0))
        * dpsScaleFor('firewheel');
      const time = (mech.duration ?? 3) + (ctx.mods?.burnTimeAdd ?? 0);
      applyPoison(enemy, dps, time, 'burn');
      break;
    }
    case 'bubble':
      applyMark(enemy, 'bubble', 0.35);
      break;
    default:
      break;
  }
}

/**
 * Hook de tick para haces/auras. El Beam acumula stacks de fusión como máximo
 * cada `mech.stackEvery` segundos (la torre lleva el acumulador en `ctx.unit`).
 */
export function onMechanicTick(type, enemy, game, ctx = {}) {
  if (!enemy || enemy.dead) return;
  const mech = mechDataOf(type);
  if (!mech) return;
  switch (mech.id) {
    case 'melt': {
      const unit = ctx.unit;
      const every = mech.stackEvery ?? 0.6;
      if (unit) {
        unit._meltAcc = (unit._meltAcc ?? 0) + (ctx.dt ?? 0);
        if (unit._meltAcc < every) return;
        unit._meltAcc = 0;
      }
      // Si la marca expiró, los stacks viejos no cuentan.
      const stacks = hasMark(enemy, 'melt') ? (enemy.meltStacks ?? 0) : 0;
      enemy.meltStacks = Math.min(mech.maxStacks ?? 3, stacks + 1);
      applyMark(enemy, 'melt', mech.duration ?? 2.5);
      break;
    }
    case 'cut':
      applyMark(enemy, 'cut', mech.duration ?? 2);
      break;
    case 'bubble':
      applyMark(enemy, 'bubble', 0.35);
      break;
    default:
      break;
  }
}

/**
 * Hook de muerte: el veneno de los Mosquitos se propaga a los vecinos. Se llama
 * desde Enemy.die() ANTES de limpiar el estado de veneno.
 */
export function onMechanicKill(enemy, game) {
  if (!enemy || enemy.poisonKind !== 'poison' || !(enemy.poisonDps > 0)) return;
  const list = game?.fortress?.enemies;
  if (!Array.isArray(list)) return;
  const mech = DRONES.wasps?.mech ?? {};
  const frac = mech.spreadFrac ?? 0.5;
  const max = mech.spreadTargets ?? 2;
  const radius = mech.spreadRadius ?? 110;
  const candidatos = [];
  for (const other of list) {
    if (!other || other.dead || other === enemy) continue;
    const dd = Math.hypot(other.x - enemy.x, other.y - enemy.y);
    if (dd <= radius + (other.r ?? 10)) candidatos.push({ other, dd });
  }
  candidatos.sort((a, b) => a.dd - b.dd);
  for (const { other } of candidatos.slice(0, max)) {
    applyPoison(other, Math.max(1, Math.round(enemy.poisonDps * frac)), 2, 'poison');
  }
}
