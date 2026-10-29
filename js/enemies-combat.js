// =============================================================================
// enemies-combat.js — colisión y daño de proyectiles contra enemigos
// =============================================================================

import { pointSegmentDistance } from './geometry.js';
import { applyStun, rollCrit, tryFreeze } from './combat-crit.js';
import { applyPerkDamage } from './perks.js';
import { applyPoison, applySlow, applyMark, hasMark } from './enemies-status.js';

export function projectileRadius(p) {
  if (typeof p.splashR === 'number') return p.splashR;      // HomingMissile (área)
  if (typeof p.radius === 'number') return p.radius;         // Bullet con radio explícito (Gauss)
  return p.damage != null && p.color ? 4 : 6;               // Bullet vs genérico
}

/** Daño crítico propio de un proyectil (perks sistemáticos, fase 17):
 *  critChance × critMul, compuesto SOLO en el proyectil (el bonus global
 *  del meta es aparte). Sin critChance → daño tal cual.
 *  fase 74.2 — Fractura Criogénica: contra un enemigo ralentizado suma
 *  `slowCritChanceAdd` y `slowCritDmgAdd` de `fortress.comboMods`. */
function rollProjectileCrit(p, e = null) {
  let chance = p.critChance ?? 0;
  let critMul = p.critMul ?? 2;
  const cm = p.game?.fortress?.comboMods;
  if (e && (e.slowTimer ?? 0) > 0) {
    chance += cm?.slowCritChanceAdd ?? 0;
    critMul += cm?.slowCritDmgAdd ?? 0;
  }
  const { crit, mul } = rollCrit(chance, critMul);
  p._lastCrit = crit;
  return crit ? Math.round(p.damage * mul) : p.damage;
}

/** Debuffs de impacto de un proyectil (perks sistemáticos, fase 17):
 *  slowOnHit como slowFactor visual/existente del enemigo (nunca sube el
 *  slow actual) y stunChance con una base de 0.5 s (piso sobre el stun
 *  previo). Sin claves → no toca nada (comportamiento histórico). */
function applyProjectileDebuffs(p, e) {
  if ((p.slowOnHit ?? 0) > 0) {
    applySlow(e, p.slowOnHit, p.slowDuration ?? 1.5, 'projectile');
  }
  if ((p.stunChance ?? 0) > 0 && Math.random() < p.stunChance) {
    applyStun(e, 0.5);
  }
}

/** dev-7 fase 25: señal visible/sonora cuando se activa un perk raro
 *  (remate / explosión al matar). Texto flotante + evento 'perk:proc' que
 *  main.js traduce a sonido (las torres no importan audio). Limitado a
 *  1 señal cada 0.15 s por tipo para no saturar pantalla ni audio.
 *  dev-7 fase 26: la implementación vive en perks.js (antes estaba
 *  COPIADA acá y en towers.js — dos copias que podían divergir). */

/** Golpe de un proyectil sobre un enemigo, con las 3 mecánicas nuevas de
 *  perks (dev-7 fase 23). La implementación real vive en perks.js
 *  (applyPerkDamage) — la MISMA que usan las torres y drones, así que
 *  ambas rutas comparten exactamente la misma semántica:
 *  p.executeThreshold (remate bajo ese % de HP máx), p.lifesteal (cura al
 *  escudo de la base), p.explodeOnKillChance/Dmg/Radius (explosión al
 *  matar). `p.game` da acceso a fortress/engine. Ausentes → idéntico a
 *  takeDamage(rollProjectileCrit(p)). Devuelve true si el golpe mató.
 *
 *  NOTA sobre el lifesteal en splash: `applyProjectileHit` llama a esta
 *  función UNA VEZ POR ENEMIGO dentro del radio. Cada llamada cura su
 *  propio daño efectivo, así que el total curado es el % del daño TOTAL
 *  del área (no el % por enemigo) — que es lo que promete el perk.
 */
function projectileStrike(p, e, kind, list) {
  // fase 74.2 — marcas de combo: Gauss marca 'rail'; los drones marcan
  // 'swarm'. Se aplican antes del daño.
  if (p.markOnHit) applyMark(e, p.markOnHit, p.markDuration ?? 2);
  let markMul = 1;
  if (p.source === 'guardian') {
    const cm = p.game?.fortress?.comboMods;
    if (cm?.railMark && hasMark(e, 'rail')) markMul *= 1.25;
    if (cm?.swarmMark && hasMark(e, 'swarm')) markMul *= 1.15;
  }
  const dmg = Math.round(rollProjectileCrit(p, e) * markMul);
  // dev-7 fase 32: el proyectil lleva su TIPO de daño (`p.dmgType`), que
  // es el que decide el multiplicador contra la familia del enemigo
  // (se aplica en takeDamage). El `kind` ('bullet'/'splash') es sólo el
  //Fallback para los proyectiles sin tipo explícito.
  const dmgKind = p.dmgType ?? kind;
  // Los mods viajan en el propio proyectil (onHitOpts) — se pasan tal cual.
  const killed = applyPerkDamage(e, dmg, dmgKind, p, p.game, list);

  // fase 74.2 — Fractura Criogénica: un crítico contra un enemigo
  // ralentizado puede congelarlo.
  const cm = p.game?.fortress?.comboMods;
  if (p._lastCrit && !killed && e && (e.slowTimer ?? 0) > 0) {
    tryFreeze(e, cm?.slowFreezeChance, 0.5);
  }

  // fase 74 — Balas Detonantes: explosión AL IMPACTAR, una vez por
  // proyectil. Excluye al blanco directo (ya comió el daño pleno) y usa
  // el radio/porcentaje que viajan en el proyectil. El tipo del estallido
  // es `blast` aunque la bala sea balística.
  if (kind === 'bullet' && !p._impactExploded && (p.impactExplodeChance ?? 0) > 0) {
    if (Math.random() < Math.min(1, p.impactExplodeChance)) {
      p._impactExploded = true;
      const R = p.impactExplodeRadius ?? 70;
      const splash = Math.round(dmg * (p.impactExplodeFrac ?? 0.4));
      if (splash > 0) {
        for (const other of list) {
          if (!other || other.dead || other === e) continue;
          if (Math.hypot(other.x - e.x, other.y - e.y) > R + (other.r ?? 10)) continue;
          applyPerkDamage(other, splash, 'blast', p, p.game, list);
          const cm = p.game?.fortress?.comboMods;
          if (cm?.explosionSlowFrac > 0) {
            applySlow(other, cm.explosionSlowFrac, cm.explosionSlowTime ?? 2, 'explosion');
          }
        }
      }
      // Singularidad: las explosiones dejan un mini Black Hole.
      p.game?.fortress?.spawnMiniBlackHole?.(e.x, e.y, p.game);
    }
  }
  return killed;
}

/**
 * Distancia mínima de un punto (cx,cy) al segmento (px,py)→(x,y).
 * Se usa para CCD: una bala rápida no se salta al enemigo entre frames.
 * Es el equivalente a barrer un círculo (la bala) contra el círculo del
 * enemigo: el radio de captura se suma aparte en `applyProjectileHit`.
 */
/**
 * Aplica el daño de un proyectil sobre la lista viva de enemigos.
 * Bala recta: primer enemigo alcanzado (más cercano a la torre).
 * Splash (missile/mortar): TODOS los enemigos dentro del radio.
 * Devuelve true si el proyectil debe morir.
 * Helper puro testeable — main.js lo enchufa vía onFrame (§1.2 orden).
 * Perks sistemáticos (fase 17): p.bounce (rebotes restantes, re-apunta al
 * enemigo vivo más cercano al impacto, sin repetir el último), p.slowOnHit,
 * p.stunChance, p.critChance/critMul — ausentes = comportamiento histórico.
 * CCD: si el proyectil trae `_px/_py` (Bullet.update los guarda), el impacto
 * directo se testea contra el SEGMENTO recorrido. Ausentes → test puntual
 * histórico (tests/stubs y proyectiles sin update).
 */
export function applyProjectileHit(p, enemies, radiusOverride = undefined) {
  if (!p || p.dead || typeof p.x !== 'number') return false;
  if (typeof p.damage !== 'number') return false; // un enemigo NO es proyectil
  const list = Array.isArray(enemies) ? enemies : [];
  if (!list.length) return false;

  // Splash: daña área (misil ya explota al alcanzar la Y del blanco)
  if (typeof p.splashR === 'number' || radiusOverride !== undefined) {
    const R = radiusOverride ?? p.splashR;
    let hitAny = false;
    for (const e of list) {
      if (!e || e.dead) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) <= R + (e.r ?? 10)) {
        hitAny = true;
        projectileStrike(p, e, 'splash', list);
        applyProjectileDebuffs(p, e);
      }
    }
    return hitAny;
  }

  // Los proyectiles de área (mortero/misil) NO tienen impacto directo:
  // detonan en su propio update y aplican splash una sola vez. Sin este
  // guard, `collideProjectiles` los consumía al primer roce.
  if (p.areaProjectile) return false;

  // Impacto directo: el más cercano al origen del disparo (Y mayor)
  const swept = Number.isFinite(p._px) && Number.isFinite(p._py);
  let best = null;
  for (const e of list) {
    if (!e || e.dead || e === p._lastHit) continue; // fase 17: no repetir tras rebote
    const d = swept
      ? pointSegmentDistance(e.x, e.y, p._px, p._py, p.x, p.y)
      : Math.hypot(e.x - p.x, e.y - p.y);
    if (d > (e.r ?? 10) + projectileRadius(p)) continue;
    if (!best || e.y > best.y) best = e;
  }
  if (!best) return false;
  projectileStrike(p, best, 'bullet', list);
  applyProjectileDebuffs(p, best);
  // dev-7 fase 26 (bug corregido): perforación y rebote son contadores
  // INDEPENDIENTES. Antes el `pierce` se consumía y salía ANTES de mirar
  // el rebote, así que con pierce>0 (Gauss: 999, o el perk de perforación
  // del Guardian) el rebote NUNCA ocurría: los perks "Rebote magnético",
  // "Rebote II" y "DEFINITIVO Rebote infinito" eran CÓDIGO MUERTO.
  //
  // Ahora: se consume una carga de perforación (si queda) y, aparte, se
  // re-apunta si queda rebote. El proyectil sobrevive si tiene cargas de
  // cualquiera de los dos.
  const hasPierce = (p.pierce ?? 0) > 0;
  if (hasPierce) {
    p.pierce -= 1;
    // Marca el último golpeado también en perforación: el perk dice
    // "atraviesa +N ENEMIGOS" — debe ser N enemigos DISTINTOS, no N golpes
    // al mismo (si no, una bala lenta re-golpearía al mismo blanco).
    p._lastHit = best;
    // fase 74.2 — Perforación Compartida: los atravesados sangran un
    // 0.5% de su HP máximo por segundo durante 2 s (usa el DoT existente).
    if (p.game?.fortress?.comboMods?.pierceBleed
      && (p.source === 'guardian' || p.source === 'gauss') && !best.dead) {
      const bleed = Math.max(0.5, (best.hpMax ?? best.hp ?? 100) * 0.005);
      applyPoison(best, bleed, 2);
    }
  }
  // Rebote (perks fase 17): sigue viva y se re-apunta al enemigo vivo más
  // cercano al punto de impacto distinto del último golpeado.
  if ((p.bounce ?? 0) > 0) {
    let nxt = null;
    let bestD = Infinity;
    for (const e of list) {
      if (!e || e.dead || e === best) continue;
      const dd = Math.hypot(e.x - p.x, e.y - p.y);
      if (dd < bestD) { bestD = dd; nxt = e; }
    }
    if (nxt) {
      p.bounce -= 1;
      p._lastHit = best;
      const spd = Math.hypot(p.vx, p.vy);
      if (spd > 0) {
        const ang = Math.atan2(nxt.x - p.x, -(nxt.y - p.y));
        p.vx = Math.sin(ang) * spd;
        p.vy = -Math.cos(ang) * spd;
      }
      // fase 74.2 — Rebote Conductor: la bala rebotada descarga 50% de
      // daño eléctrico en el nuevo objetivo.
      if (p.source === 'guardian' && p.game?.fortress?.comboMods?.bounceElectric) {
        applyPerkDamage(nxt, Math.round(p.damage * 0.5), 'electric', p, p.game, list);
      }
      return false;
    }
  }
  // Sobrevive si le queda carga de perforación (atraviesa enemigos).
  return !hasPierce;
}

/**
 * Paso de colisiones por frame (orden §1.2): recorre los proyectiles
 * vivos del engine y aplica daño. Los FX instantáneos (beam/bolt/chain)
 * NO pasan por acá: sus torres aplican takeDamage() directo al disparar.
 */

