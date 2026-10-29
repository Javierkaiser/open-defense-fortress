// =============================================================================
// towers-data.js — stats canónicas de torres y drones
// -----------------------------------------------------------------------------
// Extraído de towers.js (fase 75). Data pura: towers.js reexporta para no
// romper imports de tests/scripts. Los números siguen siendo la fuente única.
// =============================================================================


export const TOWERS = {
  guardian: {
    name: 'Guardian',
    dmgType: 'ballistic', // fase 32: tipo de daño (js/damagetypes.js)
    kind: 'fan',
    cooldown: 0.23, damage: 8, spreadDeg: 14, detectHalfWidth: Infinity, // v4 4a: cadencia rápida + tracking GLOBAL (cualquier enemigo izq/der)
    bulletSpeed: 920, bulletColor: '#35C8FF', // v5 5c/5: balas 920 px/s (vuelo a fondo ~0.3-0.4 s; antes 780)
    bodyColor: '#0E1216', accent: '#35C8FF',
    // v3 3b/7 (corrección canónica JK 26-08): el Guardian NO dispara en
    // abanico siempre. Lv.1 → 1 bala DIRIGIDA al enemigo más cercano;
    // cada mejora (+1 nivel) suma 1 bala PARALELA (spread 0); desde Lv.4
    // el disparo se abre en ABANICO con spread proporcional al nivel.
  },
  missile: {
    name: 'Missile',
    dmgType: 'blast', // fase 32: tipo de daño
    kind: 'homing',
    cooldown: 1.2, damage: 35, splashR: 60,
    speed: 260, turnRate: 4.5, detectHalfWidth: Infinity, // homing global
    bodyColor: '#141A22', accent: '#FFB36A', trailColor: '#FFB36A',
  },
  beam: {
    name: 'Beam',
    dmgType: 'light', // fase 32: tipo de daño
    kind: 'beam',
    // dev-7 fase 34: el haz alcanza 260 px A CADA LADO y TODO el alto
    // (el "rango" del juego es un ancho de detección; las torres disparan
    // hacia arriba sin límite de Y). Antes era una columna de 20 px con
    // ventana de caza de ±80 px: el haz sólo se activaba para lo que
    // pasaba por su carril y el jugador lo veía "limitado por un ángulo".
    // OJO: un radio CIRCULAR de 260 px medido desde la torre (y=830) NO
    // serviría: dejaría fuera la parte alta de la pantalla (el jefe a
    // 800 px) y el haz perdería alcance.
    // El ancho NO reparte daño: el haz lastima SOLO al blanco elegido y
    // `columnHalfWidth` es la ventana de adquisición (y el grosor visual).
    // fase 66 — CICLO DEL HAZ (antes: 24 DPS continuos, techo ×3 = 72):
    // entra con el damagePerSec BAJO de la tabla y el RAMP de foco lo lleva
    // a ×4,5 (10 → 45 DPS a los ~4,4 s sobre el MISMO blanco). Dispara en
    // VENTANAS de beamBurst y, al cerrarse una, entra un cooldown de
    // beamCooldown con el haz APAGADO y sin adquirir: 4,5 s encendido +
    // 2,5 s apagado = 64 % de servicio. Dentro de la ventana el haz PUEDE
    // cambiar de blanco (si el enemigo muere re-adquiere y sigue, con el
    // ramp reiniciado): el cooldown castiga CERRAR la ventana, no matar.
    damagePerSec: 10, columnHalfWidth: 260,
    beamRampPerSec: 0.8, beamRampMax: 4.5, beamBurst: 4.5, beamCooldown: 2.5,
    coreColor: '#E8FFE8', beamColor: '#39FF6A',
    bodyColor: '#10161A', accent: '#39FF6A',
  },
  thunderstroke: {
    name: 'Thunderstroke',
    dmgType: 'electric', // fase 32: tipo de daño
    kind: 'bolt',
    // fase 73 — TIRO LARGO GLOBAL: mismo patrón que Gauss/Mortar/Láser
    // (`detectHalfWidth: Infinity`), sin el círculo de 260 px que lo
    // limitaba a la mitad de la pantalla. Sigue apuntando al MÁS LEJANO
    // (farthest, sticky).
    // DIFERENCIA CON LA TESLA: la Tesla ENCADENA saltos de enemigo a
    // enemigo (falloff); el Thunderstroke dispara UN rayo principal al
    // blanco elegido y, en el punto de impacto, abre MINI RAYOS de área
    // a los vecinos. `areaR`/`areaFrac`/`areaTargets`/`areaStun` son ese
    // estallido; los perks extraCount/chainFork suman mini rayos, no
    // rayos principales.
    cooldown: 1.6, damage: 65, stun: 0.2,
    areaR: 130, areaFrac: 0.5, areaTargets: 3, areaStun: 0.1,
    detectHalfWidth: Infinity,
    color: '#B48CFF', coreColor: '#FFFFFF',
    bodyColor: '#12101C', accent: '#B48CFF',
  },
  tesla: {
    name: 'Tesla',
    dmgType: 'electric', // fase 32: tipo de daño
    kind: 'chain',
    // fase 66 — BANDA DE COBERTURA + ENJAMBRE: el alcance deja de ser un
    // círculo de 260 px medido desde la torre (un enjambre que caía por
    // la esquina OPUESTA quedaba fuera — justo el caso que esta torre
    // tiene que resolver) y pasa a ser una BANDA horizontal: sin tope de
    // X y 330 px de alto sobre la fila (`reachY`; ver targetInRange,
    // rangeBand). Con la cobertura la cadencia sube y el daño por golpe
    // baja: 5+3,75+2,8+2,1+1,6 = 15,25 por 0,7 s ≈ 22 DPS repartidos en 5
    // blancos (antes 22+16,5+12,4 = 50,9 por 1,9 s ≈ 27 DPS en 3) y a UN
    // solo blanco baja (11,6 → 7,1). La CALIBRACIÓN de la fase 66 movió las
    // dos palancas del daño: `damage` 6 → 5 y `cooldown` 0,6 → 0,7 s. Con
    // 0,6 el escenario Guardian+Tesla quedaba en 92 % de bajas en el S50 y
    // la campaña en 93 % (contra el 73 % y el 80 % del cierre de la 65);
    // con 0,8 el escenario caía a 77 % y perdía el S50. El ALCANCE no se
    // toca: es la identidad de la torre (anti-enjambre de banda).
    cooldown: 0.7, damage: 5, falloff: 0.75, jumps: 5,
    rangeBand: true, reachY: 330,
    // `detectHalfWidth: Infinity`: la banda no tiene tope de X. Sin esto
    // `detectWidth()` caería al respaldo de 60 px (ya no hay `range`) y la
    // banda quedaría tan angosta como la vieja ventana del Beam.
    detectHalfWidth: Infinity,
    color: '#9A6CFF', coreColor: '#FFFFFF',
    bodyColor: '#12101C', accent: '#9A6CFF',
  },
  // Arsenal extendido (§2.3) — entran al pool de cartas desde Stage 2
  mortar: {
    name: 'Mortar',
    dmgType: 'blast', // fase 32: tipo de daño
    kind: 'mortar',
    // dev-7 fase 34: el radio de la explosión pasa de 110 a 150 px. Con
    // 110 sólo entraban los enemigos a ≤122 px del blanco (radio + r del
    // enemigo): dos enemigos separados 150 px (lo normal en una oleada)
    // veían cómo el obús mataba a UNO solo.
    cooldown: 2.2, damage: 45, blastR: 150,
    speed: 300, bodyColor: '#16181D', accent: '#FFD24A',
    detectHalfWidth: Infinity, // artillería anti-área: apunta a TODO el campo
  },
  gauss: {
    name: 'Gauss',
    dmgType: 'ballistic', // fase 32: tipo de daño
    kind: 'gauss',
    cooldown: 3.5, damage: 120,
    speed: 1400, bodyColor: '#12141A', accent: '#7FDFFF',
    detectHalfWidth: Infinity, // v5: el riel apunta a CUALQUIER X (elige al
    // enemigo más avanzado y rota — corrección JK "apuntar antes de disparar")
  },
  laser: {
    // v4 4c/5 (corrección canónica JK 27-08): torre LÁSER NUEVA — un
    // DISPARO CON DURACIÓN: rayo recto hacia el enemigo que queda
    // ESTÁTICO unos segundos, dañando (penetrante) todo lo que toque.
    name: 'Láser',
    dmgType: 'light', // fase 32: tipo de daño
    kind: 'laser',
    cooldown: 4.0, damagePerSec: 45, laserDuration: 3.2, // arranque: ver docs/BALANCE.md "v4 4c"
    // fase 66: el par se mueve JUNTO (duración 2,5 → 3,2 y cooldown 3,2 →
    // 4,0). Con el cooldown viejo la duración nueva lo empataba y el rayo
    // quedaba SIEMPRE encendido (100 % de servicio = buff gratis): así el
    // DPS medio se mantiene (~36) y el haz dura más y se lee mejor.
    // dev-7 fase 29: el rayo pasa a LIMA (#9DFF3C, la firma de su boca) —
    // antes era #3DFC5A, un verde casi igual al del Beam (#39FF6A) y las
    // dos torres parecían la misma. Solo es color: el daño y el ancho del
    // rayo (LASER_WIDTH) no cambian.
    beamColor: '#9DFF3C', coreColor: '#E8FFE8',
    bodyColor: '#10161A', accent: '#3DFC5A',
    detectHalfWidth: Infinity, // apunta al enemigo más avanzado SIN límite de X
  },
}

export const MAX_TOWER_LEVEL = 5;

export const DRONES = {
  firewheel: {
    name: 'Dron Rueda de Fuego', kind: 'firewheel',
    dmgType: 'drone', // fase 32: tipo de daño
    radius: 120, dps: 25, accent: '#FF7A3D', bodyColor: '#1C1410',
  },
  wasps: {
    name: 'Dron Avispas', kind: 'wasps',
    dmgType: 'drone', // fase 32: tipo de daño
    // dev-7 fase 30 (rework del dron): antes la avispa picaba UNA vez y
    // desaparecía `respawnTime` (4 s). Eso la convertía en 3 × 12 dmg /
    // 4 s = 9 DPS: el peor del arsenal (la Rueda da 25) y con el 75 % del
    // tiempo muerta. Ahora la avispa pica, entra en COOLDOWN y sigue
    // volando: el DPS lo marca el ritmo de picadura, no el downtime.
    count: 3,
    stingDamage: 14,
    stingCooldown: 1.9,   // s entre picaduras de la misma avispa
  // dev-7 fase 33: los drones VARIAN. Cada avispa re-elige blanco cada
    // VENENO: la picadura envenena al objetivo (D0T). Así la picadura
    // sigue rindiendo aunque el objetivo NO muera con ella (antes se
    // consumía igual: contra un jefe el 90 % del daño se perdía).
    venomDps: 2,
    venomTime: 2.5,
    accent: '#FFE24A', bodyColor: '#1C1A0E',
  },
  forcefield: {
    name: 'Dron Campo de Fuerza', kind: 'forcefield',
    dmgType: 'drone', // fase 32: tipo de daño
    bubbleR: 140, slowFrac: 0.30, // reduce 30% la velocidad de caída
    accent: '#7FDFFF', bodyColor: '#10181C',
  },
};

/**
 * dev-7 fase 30 (rework del Dron Avispas) — ENJAMBRE CONTINUO.
 *
 * Antes (fase 21): cada avispa era un "misil" de un solo uso — volaba al
 * enemigo más avanzado, le clavaba la picadura y desaparecía 4 s. El
 * resultado medido eran 8,1 DPS por dron (3 × 12 dmg / 4 s): el peor
 * del arsenal, con dos problemas:
 *   - el DPS estaba gateado por el TIEMPO MUERTO, no por el daño;
 *   - la picadura se consumía aunque el objetivo sobreviviera (contra un
 *     jefe de 44 032 HP, las 3 avispas quemaban sus picaduras contra un
 *     blanco que no moría).
 *
 * Ahora la avispa es una unidad persistente: pica, entra en cooldown y
 * sigue volando. Y la picadura aplica VENENO (D0T), de modo que sigue
 * haciendo daño aunque no mate.
 */
export const WASPS = {
  speed: 240,         // px/s de vuelo hacia el blanco
  stingRange: 6,      // px extra de alcance de la picadura
  returnSpeed: 300,   // px/s de regreso al panal (sin enemigos)
  swarmRadius: 9,     // px: separación del enjambre alrededor del blanco
  stingCooldown: 1.9, // s entre picaduras (fallback si falta en la tabla)
  // dev-7 fase 33: los drones VARIAN. Cada avispa re-elige blanco cada
  // WASPS.retarget segundos (o antes si el suyo se aleja más de
  // WASPS.retargetDist px), sin esperar a que muera.
  retarget: 1.4,        // s entre re-elegir blanco
  retargetDist: 220,     // px: si el blanco se aleja más, se cambia ya
  // dev-7 fase 33: los drones VARIAN. Cada avispa re-elige blanco cada
  // Tope del enjambre: 3 avispas de base + hasta 3 del perk de meta
  // ("+1 avispa" ×4 y el capstone "+3"). Con el enjambre continuo cada
  // avispa extra vale 4× más que antes (ya no hay 4 s de tiempo muerto),
  // así que sin tope el dron endgame valía más que una torre entera.
  maxSwarm: 6,
};

/**
 * v3 3f/7 — DRON RUEDA DE FUEGO: comportamiento del diseño base. La rueda NO
 * se queda orbitando la base: con enemigos vivos SALE hacia el más avanzado
 * (mayor Y, el que está más cerca de la base), lo sobrevuela con un barrido
 * circular chico (daño por contacto) y luego elige el siguiente. Sin
 * enemigos en pantalla vuelve a la base y retoma la órbita clásica.
 * Números: avance ~140 px/s (spec 120-160), barrido a r = r_enemigo + 8
 * (contacto garantizado: toca a r ≤ r+14), 0.9 s por sobrevuelo.
 */
export const FIREWHEEL = {
  // dev-7 fase 31: la velocidad de vuelo subió de 140 a 180 px/s. El
  // trayecto era la mayor causa del DPS perdido: la rueda pasa el
  // 31-47 % de su vida volando (medido en una etapa real) y ese tiempo
  // no es daño. Con 180 el DPS realizado sube del 74-83 % al 88-99 %
  // del nominal.
  speed: 180,        // px/s de avance hacia el blanco
  returnSpeed: 170,  // px/s de regreso a la base (sin blancos)
  sweepOmega: 3.4,   // rad/s del barrido circular sobre el blanco
  // dev-7 fase 31: `sweepTime` (0.9 s) era el tiempo MÁXIMO que la rueda
  // pasaba con cada blanco: al cumplirse, la abandonaba AUNQUE SIGUIERA
  // VIVO (towers.js: fwTarget = null) y volaba al siguiente. Su salida
  // real no era "25 DPS" sino "0,9 s de daño por viaje", y el hueco
  // CRECÍA con el meta (80 % a 74 % realizado): al matar más rápido
  // re-elegía blanco más a menudo y pasaba más tiempo volando.
  // Ahora la rueda se queda con el blanco HASTA MATARLO (maxDwell es el
  // tope de seguridad para no clavarse con un jefe de 44 032 HP).
  maxDwell: 6,       // s máximos con un mismo blanco antes de cambiar
  sweepPad: 8,       // radio del barrido = r del blanco + pad
  engageRange: 22,   // dist. blanco que dispara el barrido (= r + pad)
  orbitEps: 26,      // dist. al centro de la base para retomar la órbita
  // dev-7 fase 31: si aparece un enemigo claramente MÁS AVANZADO
  // (más cerca de la base) mientras la rueda quema a otro, cambia de
  // blanco: si no, podía terminar con un blob lento mientras un fragmento
  // se le acercaba a la base.
  switchMargin: 70,  // px de ventaja que justifican cambiar de blanco
}
