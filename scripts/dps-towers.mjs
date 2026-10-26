// ============================================================
// dps-towers.mjs — DPS NOMINAL por torre (fase 66)
//
// Instrumento de medición: lee la tabla TOWERS (js/towers.js) y calcula,
// con una fórmula DECLARADA acá y la misma para todas las torres, el DPS
// contra UN blanco y (donde aplica) contra un grupo. Sirve para comparar
// ANTES/DESPUÉS de un rework sin depender de una corrida del simulador.
//
//   node scripts/dps-towers.mjs
//
// FÓRMULA (base, Lv1, sin cartas ni meta):
//   · cañón/bala        → damage / cooldown
//   · beam              → promedio del ciclo de ventana (ramp incluido):
//                         ∫ damagePerSec·ramp dt / (beamBurst + beamCooldown)
//   · chain (tesla)     → suma de la descarga / cooldown, con falloff por salto
//   · bolt (thunder)    → damage / cooldown
//   · mortar            → damage / cooldown (sin contar el área)
//   · gauss             → damage / cooldown (sin contar la perforación)
//   · laser             → damagePerSec × laserDuration / cooldown
//   · fan (guardian)    → damage / cooldown (1 bala; el abanico no se cuenta)
// ============================================================

import { TOWERS } from '../js/towers.js';

/** DPS contra un blanco único (y contra N blancos en las que reparten). */
function dpsOf(type) {
  const d = TOWERS[type];
  if (!d) return null;
  switch (d.kind) {
    case 'fan': // guardian
      return { single: d.damage / d.cooldown, multi: null, nota: '1 bala' };
    case 'homing': // missile
      return { single: d.damage / d.cooldown, multi: null, nota: 'sin splash' };
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
    case 'bolt': // thunderstroke
      return { single: d.damage / d.cooldown, multi: null, nota: 'sin stun' };
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
      return { single: d.damage / d.cooldown, multi: null, nota: 'sin área' };
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

const types = Object.keys(TOWERS);
let totalSingle = 0;
console.log('| Torre | kind | DPS 1 blanco | DPS grupo | detalle |');
console.log('|---|---|---|---|---|');
for (const t of types) {
  const r = dpsOf(t);
  if (!r) continue;
  totalSingle += r.single;
  console.log(`| ${TOWERS[t].name} | ${TOWERS[t].kind} | ${r.single.toFixed(1)} | `
    + `${r.multi != null ? r.multi.toFixed(1) : '—'} | ${r.nota} |`);
}
console.log(`\nSuma de las ${types.length} torres (1 blanco, base): **${totalSingle.toFixed(1)} DPS**`);
