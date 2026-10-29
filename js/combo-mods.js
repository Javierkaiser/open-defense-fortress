// =============================================================================
// combo-mods.js — schema único de los flags de combos
// -----------------------------------------------------------------------------
// El contenedor `fortress.comboMods` se inicializaba DOS veces (player.js y
// cards.js) con los mismos campos. Al agregar un combo nuevo había que
// acordarse de los dos sitios; si uno quedaba viejo, el combo leía
// `undefined`. `createComboMods()` es ahora la única definición.
// =============================================================================

export function createComboMods() {
  return {
    slowLightVuln: 1,
    slowBlastVuln: 1,
    slowCritChanceAdd: 0,
    slowCritDmgAdd: 0,
    slowFreezeChance: 0,
    explosionSlowFrac: 0,
    explosionSlowTime: 0,
    poisonRegen: 0,
    railMark: 0,
    swarmMark: 0,
    judgment: 0,
    bounceElectric: 0,
    pierceBleed: 0,
    // Fase 76 — combos de identidad (cada uno consume una marca o cambia
    // target/cantidad; ninguno es sólo un +X%).
    overload: 0,      // Thunder + Tesla: el ión del racimo refuerza el área
    prismLoop: 0,     // Beam + Láser: el ramp del Beam no se resetea
    siegeSync: 0,     // Missile + Mortar: el cráter marca `siege`
    arcGuard: 0,      // Guardian + Tesla: la bala consume `charged`
    coup: 0,          // Missile + Thunder: remate contra `judgment`
    ignition: 0,      // Guardian + Firewheel: la bala detona `burn`
    venomShell: 0,    // Mortar + Wasps: el cráter propaga veneno
    bubbleChain: 0,   // Tesla + Forcefield: salta a la burbuja sin falloff
    railstorm: 0,     // Gauss + Thunder: el rayo consume `rail`
    meltRail: 0,      // Beam + Gauss: el riel propaga `rail` desde `melt`
    slowSiege: 0,     // Mortar + Forcefield: apunta al centro de la burbuja
  };
}
