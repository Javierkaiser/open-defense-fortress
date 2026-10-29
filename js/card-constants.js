// =============================================================================
// card-constants.js — diales compartidos por cartas y unidades futuras
// -----------------------------------------------------------------------------
// cards.js aplica los multiplicadores a las unidades PRESENTES y player.js
// los replica para las unidades que se desbloquean DESPUÉS. Tener los
// números en un solo módulo evita que un rebalanceo quede a medias (era
// justo el bug de `hunt_*`: 1,8 hardcodeado en player.js).
// =============================================================================

/** Munición Reforzada (dmg_all): +10 % por stack. */
export const GLOBAL_DMG_MUL = 1.1;
/** Servos Acelerados (cadence_up): −10 % de cooldown por stack. */
export const GLOBAL_CAD_MUL = 0.9;
/** Cartas de daño por tipo: +20 % por stack. */
export const TYPE_DMG_MUL = 1.2;
/** Cartas de caza de familia: ×1,8 contra la familia. */
export const HUNT_DMG_MUL = 1.8;
