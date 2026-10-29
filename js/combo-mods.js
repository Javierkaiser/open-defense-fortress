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
  };
}
