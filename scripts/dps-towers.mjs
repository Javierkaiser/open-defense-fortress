// ============================================================
// dps-towers.mjs — DPS NOMINAL por unidad (fase 66)
//
// Instrumento de medición: lee las tablas TOWERS/DRONES (js/towers-data.js) y
// calcula, con una fórmula DECLARADA acá y la misma para todas las unidades,
// el DPS contra UN blanco y (donde aplica) contra un grupo. Sirve para
// comparar ANTES/DESPUÉS de un rework sin depender de una corrida del
// simulador. La columna "después" aplica `dpsScaleFor()` — el dial de
// presentación/balance de towers-data.js — igual que el combate.
//
//   node scripts/dps-towers.mjs
//
// FÓRMULA (base, Lv1, sin cartas ni meta):
//   · cañón/bala        → damage / cooldown
//   · beam              → promedio del ciclo de ventana (ramp incluido):
//                         ∫ damagePerSec·ramp dt / (beamBurst + beamCooldown)
//   · chain (tesla)     → suma de la descarga / cooldown, con falloff por salto
//   · bolt (thunder)    → damage / cooldown; multi = principal + mini rayos
//                         de área (areaTargets × areaFrac)
//   · mortar            → damage / cooldown (sin contar el área)
//   · gauss             → damage / cooldown (sin contar la perforación)
//   · laser             → damagePerSec × laserDuration / cooldown
//   · fan (guardian)    → damage / cooldown (1 bala; el abanico no se cuenta)
//   · homing (missile)  → el combate aplica el 50 % del daño en el splash
//                         (towers-projectiles.js `_explode`), así que el DPS
//                         de un blanco es damage × 0,5 / cooldown
//   · drones            → su daño propio + su DoT (ver `dpsOfDrone`)
// ============================================================

import { TOWERS, DRONES, dpsScaleFor } from '../js/towers-data.js';

/** DPS contra un blanco único (y contra N blancos en las que reparten). */
function dpsOf(type) {
  const d = TOWERS[type];
  if (!d) return null;
  switch (d.kind) {
    case 'fan': // guardian
      return { single: d.damage / d.cooldown, multi: null, nota: '1 bala' };
    case 'homing': { // missile
      // El combate escala el daño y RECIÉN DESPUÉS redondea el splash:
      // Math.round(damage × 0.75 × 0.5). Modelarlo al revés daba 19.9 en
      // vez de los 20.0 reales.
      const base = (d.damage * 0.5) / d.cooldown;
      const final = Math.round(d.damage * dpsScaleFor('missile') * 0.5) / d.cooldown;
      return { single: base, final, multi: null, nota: 'splash al 50 % (sin área)' };
    }
    case 'beam': {
      const rate = d.beamRampPerSec ?? 0.6;
      const cap = d.beamRampMax ?? 3;
      const pico = Math.round(d.damagePerSec * cap);
      if (!Number.isFinite(d.beamBurst)) {
        // Haz CONTINUO (código viejo, sin ventana): el DPS medio de una pelea
        // larga es el saturado (el ramp llega al tope en ~3 s y se queda).
        return { single: pico, multi: null, nota: `continuo (sin ventana) · saturado ${pico}` };
      }
      const burst = d.beamBurst;
      const cd = d.beamCooldown ?? 0;
      const tCap = Math.min(burst, (cap - 1) / (rate || 1));
      const area = tCap + (rate * tCap * tCap) / 2 + Math.max(0, burst - tCap) * cap;
      return {
        single: (d.damagePerSec * area) / (burst + cd),
        multi: null,
        nota: `ventana ${burst}s + cd ${cd}s · pico ${pico}`,
      };
    }
    case 'bolt': { // thunderstroke
      // fase 73: un rayo principal + estallido de mini rayos de área.
      const mini = (d.areaTargets ?? 0) * d.damage * (d.areaFrac ?? 0);
      return {
        single: d.damage / d.cooldown,
        multi: (d.damage + mini) / d.cooldown,
        nota: `1 principal + ${d.areaTargets ?? 0} mini rayos (${Math.round((d.areaFrac ?? 0) * 100)} %)`,
      };
    }
    case 'chain': {
      // `jumps` = cantidad de blancos de la descarga (criterio de la tabla
      // vieja: 3) y el daño cae con `falloff` por salto.
      const blancos = d.jumps ?? 1;
      let d2 = d.damage;
      let tot2 = 0;
      for (let i = 0; i < blancos; i++) { tot2 += d2; d2 *= d.falloff ?? 1; }
      return {
        single: d.damage / d.cooldown,
        multi: tot2 / d.cooldown,
        nota: `${blancos} blancos · falloff ${d.falloff}`,
      };
    }
    case 'mortar':
      return {
        single: d.damage / d.cooldown,
        multi: null,
        nota: `sin área · cráter ${d.mech?.dps ?? 0} DPS ${d.mech?.duration ?? 0}s`,
      };
    case 'gauss':
      return { single: d.damage / d.cooldown, multi: null, nota: 'sin perforación' };
    case 'laser':
      return {
        single: (d.damagePerSec * d.laserDuration) / d.cooldown,
        multi: null,
        nota: `rayo ${d.laserDuration}s / cd ${d.cooldown}s`,
      };
    default:
      return null;
  }
}

/**
 * DPS nominal de un dron contra UN blanco, incluido su DoT propio.
 * El Campo de Fuerza no tiene daño intrínseco: sus espinas dependen del perk
 * (`perkDmgFor`), así que su DPS base es 0.
 */
function dpsOfDrone(type) {
  const d = DRONES[type];
  if (!d) return null;
  switch (d.kind) {
    case 'firewheel': {
      const burn = d.mech?.dps ?? 0;
      return {
        single: d.dps + burn,
        nota: `${d.dps} de contacto + ${burn} de quemadura (${d.mech?.duration ?? 0}s)`,
      };
    }
    case 'wasps': {
      const n = d.count ?? 1;
      const picadura = (n * d.stingDamage) / d.stingCooldown;
      const veneno = d.venomDps ?? 0;
      return {
        single: picadura + veneno,
        nota: `${n} × ${d.stingDamage} / ${d.stingCooldown}s + ${veneno} de veneno`,
      };
    }
    case 'forcefield':
      return { single: 0, nota: 'solo espinas del perk (0 de base)' };
    default:
      return null;
  }
}

/** Formatea una fila de la tabla. */
function row(name, kind, base, scale, detalle, final = null) {
  const despues = final ?? base * scale;
  const delta = base > 0 ? `${((despues / base - 1) * 100).toFixed(0)} %` : '—';
  return `| ${name} | ${kind} | ${base.toFixed(1)} | ${despues.toFixed(1)} | ${delta} | ${detalle} |`;
}

const TYPES = Object.keys(TOWERS);
const DRONE_TYPES = Object.keys(DRONES);

console.log('## Torres (DPS actual = columna "con dial")\n');
console.log('| Torre | kind | DPS sin dial | DPS con dial | Δ | detalle |');
console.log('|---|---|---|---|---|---|');
let totalTorresAntes = 0;
let totalTorresDespues = 0;
for (const t of TYPES) {
  const r = dpsOf(t);
  if (!r) continue;
  const scale = dpsScaleFor(t);
  totalTorresAntes += r.single;
  totalTorresDespues += r.final ?? r.single * scale;
  console.log(row(TOWERS[t].name, TOWERS[t].kind, r.single, scale, r.nota, r.final));
  if (r.multi != null) {
    console.log(`| ↳ grupo | ${TOWERS[t].kind} | ${r.multi.toFixed(1)} | `
      + `${(r.multi * scale).toFixed(1)} | — | mismo detalle, N blancos |`);
  }
}
console.log(`\nSuma de las ${TYPES.length} torres (1 blanco): **${totalTorresAntes.toFixed(1)} → `
  + `${totalTorresDespues.toFixed(1)} DPS**`);

console.log('\n## Drones (DPS actual = columna "con dial")\n');
console.log('| Dron | kind | DPS sin dial | DPS con dial | Δ | detalle |');
console.log('|---|---|---|---|---|---|');
let totalDronesAntes = 0;
let totalDronesDespues = 0;
for (const t of DRONE_TYPES) {
  const r = dpsOfDrone(t);
  if (!r) continue;
  const scale = dpsScaleFor(t);
  totalDronesAntes += r.single;
  totalDronesDespues += r.single * scale;
  console.log(row(DRONES[t].name, DRONES[t].kind, r.single, scale, r.nota));
}
console.log(`\nSuma de los ${DRONE_TYPES.length} drones (1 blanco): **${totalDronesAntes.toFixed(1)} → `
  + `${totalDronesDespues.toFixed(1)} DPS**`);

console.log(`\nArsenal completo (${TYPES.length} torres + ${DRONE_TYPES.length} drones, 1 blanco): `
  + `**${(totalTorresAntes + totalDronesAntes).toFixed(1)} → `
  + `${(totalTorresDespues + totalDronesDespues).toFixed(1)} DPS**`);
