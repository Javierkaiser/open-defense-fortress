// ============================================================
// tower-art.js — ARTE DE LAS TORRES (v7 "silueta primero")
//
// QUÉ ES: los DATOS del rig de cada torre (formas, roles de color,
// anclas de animación) + el renderizador que los pinta. Es un módulo
// PURO de dibujo: no sabe de daño, cadencia, slots ni partidas, y no
// importa nada (hoja del grafo de dependencias).
//
// POR QUÉ EXISTE (fase 60): el render de las 8 torres vivía en un
// `switch` de 537 líneas dentro de `Tower.render()` (js/towers.js) con
// la geometría escrita a mano en cada rama. El análisis visual de esa
// fase encontró tres problemas que venían de ahí:
//   1. SILUETA NULA — un disco de acento de r=32..42 (×1.2 de escala
//      visual = 77..101 px de diámetro en un canvas de 540) se pintaba
//      DETRÁS de cada torre. Con los slots frontales a 55..125 px entre
//      sí, los discos se solapaban: la fila se leía como una hilera de
//      burbujas. Pintando las 8 torres de negro, 7 daban el mismo
//      borrón redondo.
//   2. FORMA REPETIDA — beam, bolt, chain, laser y mortar eran todas
//      "trapecio oscuro + algo de color arriba": solo las distinguía el
//      color.
//   3. DETALLE INVISIBLE — aletas `rgba(0,0,0,0.4)` sobre `#10161A`,
//      rieles `#05070A` sobre `#12141A`, anillos de 1.4 px.
//
// REGLAS DEL LENGUAJE (aprobadas en el rediseño):
//   · Silueta primero: cada torre tiene un ARQUETIPO propio (ancha-baja,
//     triangular, copa, obelisco, aro, diagonal, riel, columna). Ninguna
//     comparte ancho×alto con otra.
//   · Cuerpo a DOS tonos (base oscura + cara superior mezclada con el
//     acento) para que el volumen se lea sobre el cielo.
//   · El acento NO baña: vive en (a) el elemento caliente —lente, orbe,
//     boca—, (b) un rim light de ~1 px en el borde de la silueta y
//     (c) un contacto de luz en la base. Nada de discos.
//   · Estado en el PAD (ticks de nivel + glifo de tipo de daño), no
//     flotando debajo de la torre.
//   Sigue vigente la regla normativa de docs/DESIGN.md §4.2/§4.3:
//   "silueta oscura + acento neón".
//
// CONSTRIZCCIÓN CRÍTICA (ver AGENTS.md): este módulo tiene que importar
// en Node sin canvas. Por eso:
//   · `TOWER_RIGS` es DATA PURA (strings y números).
//   · `Path2D` se usa SOLO si existe el global (navegador) y va cacheado;
//     en Node se cae a un trazador propio (`tracePath`) que reemite el
//     `d` con moveTo/lineTo/closePath del ctx.
//   · Los sprites de glow se cachean en canvas offscreen si hay
//     `document`; si no, se degrada a `createRadialGradient`; si el ctx
//     tampoco lo tiene (stubs de test), el glow simplemente no se pinta.
// ============================================================

/**
 * Escala de DIBUJO de la silueta de la torre (+20 %): se aplica con un
 * ctx.scale() dentro de Tower.render(), no tocando la tabla TOWERS.
 * Vive acá (y no en towers.js) porque el ENCAJE de los slots vacíos
 * (js/player.js) tiene que medir lo MISMO que el pad ya escalado — si no,
 * el hueco vacío y la torre que lo ocupa no coinciden.
 */
export const TOWER_VISUAL_SCALE = 1.2;

/** 2π — evita repetir Math.PI * 2 en cada shape. */
const TAU = Math.PI * 2;

/**
 * PAD COMPARTIDO por las 8 torres (y por el encaje de los slots vacíos
 * de js/player.js, que deriva su caja de estas MISMAS constantes para
 * que la transición vacío→ocupado no sea un salto de lenguaje).
 *
 * `cy` negativo: la plataforma se hunde un poco por debajo del ancla de
 * la torre, que es el origen de coordenadas del render.
 */
export const TOWER_PAD = {
  cy: -2,
  rx: 20,
  ry: 8,
  // El anillo de ticks vive DENTRO de la bahía de montaje del deck
  // (`TOWER_BAY`, js/engine.js). OJO con la escala: el pad se dibuja
  // dentro del ctx.scale(TOWER_VISUAL_SCALE) de la torre y la bahía NO,
  // así que el anillo llega al mundo multiplicado por 1.2 — con rx 25 el
  // anillo medía 60 px y se salía de una bahía de 56.
  ring: { rx: 22, ry: 9.5 },
  plate: '#151B24',
  rim: 'rgba(159, 180, 200, 0.40)',
  glowR: 24,
  glowAlpha: 0.20,
  tick: {
    count: 5,
    width: 2.6,        // tick encendido
    idleWidth: 1.5,    // tick apagado
    idleColor: 'rgba(120, 140, 160, 0.30)',
    inset: 0.12,       // rad de separación con el borde del semicírculo
    gap: 0.24,         // rad de separación entre ticks
    litAlpha: 1,
    idleAlpha: 1,
  },
};

/**
 * GLIFO DEL TIPO DE DAÑO en el pad: `y` relativo al ancla de la torre
 * (sobre la mitad delantera del pad) y tamaño de fuente. El glifo y su
 * color salen de `DAMAGE_TYPES` (js/damagetypes.js) — aquí solo la
 * colocación.
 */
export const PAD_GLYPH = { y: 5, size: 10 };

// ------------------------------------------------------------
// RIGS — un arquetipo de silueta por `kind` de TOWERS.
//
// PARTE (part): una pieza del rig. Campos:
//   role    color lógico: body | bodyTop | dark | metal | accent | hot | core
//   d       path SVG (M/L/H/V/C/Q/Z, absoluto o relativo) → relleno o trazo
//   circle  [cx, cy, r]          · ellipse [cx, cy, rx, ry]
//   rect    [x, y, w, h]         · line [x1, y1, x2, y2] (siempre trazo)
//   alpha   0..1
//   pivot   [x, y] traslación previa; la rotación gira alrededor de él
//   rot     rotación fija (rad)   · rotTrack 'aim'|'spin' + rotMul / spin
//   recoil  true → retrocede con el disparo (solo tiene sentido dentro
//           de un pivot rotado: el retroceso va por el eje del cañón)
//   pulse   'charge' | 'wave' | 'flicker' | 'breathe' (modula alpha; en
//           circle/ellipse también el radio) · wave: desfase en rad
//           OJO: 'charge' SOLO tiene sentido en las torres que cargan de
//           verdad (Gauss y Thunderstroke: `_charge` se actualiza en
//           update()). En el resto `_charge` es 0 y la pieza quedaría
//           apagada al 45 % — para lentes y orbes en reposo, 'breathe'.
//   stroke  true → se traza en vez de rellenarse · width grosor del trazo
//
// El orden del array ES el orden de pintado.
//
// `texture` (opcional) = { key, clip, x, y, w, h } + los MISMOS campos de
// transformación que una pieza (pivot / rot / rotTrack / recoil): la
// textura del chasis se recorta con `clip` y se dibuja encima del cuerpo,
// así que si el cuerpo gira, la textura gira con él.
// ------------------------------------------------------------
export const TOWER_RIGS = {
  // ---- Guardian: ANCHA-BAJA (bunker). La torre más ancha del juego:
  // torso achaflanado + hombreras que sobresalen + 2 cañones gemelos que
  // rotan hacia el blanco. Caja 50×39 (la más baja de las 8).
  fan: {
    bbox: { x: -25, y: -42, w: 50, h: 39 },
    shadow: { rx: 30, ry: 7, oy: 4 },
    texture: { key: 'fan', clip: 'M-19,-5 L-14,-28 L14,-28 L19,-5 Z', x: -19, y: -28, w: 38, h: 26 },
    parts: [
      { id: 'torso', role: 'body', d: 'M-19,-5 L-14,-28 L14,-28 L19,-5 Z' },
      { id: 'torsoTop', role: 'bodyTop', d: 'M-14,-28 L14,-28 L11,-22 L-11,-22 Z' },
      { id: 'shoulderL', role: 'body', d: 'M-25,-26 L-18,-27 L-19,-9 L-25,-8 Z' },
      { id: 'shoulderR', role: 'body', d: 'M25,-26 L18,-27 L19,-9 L25,-8 Z' },
      { id: 'shoulderLTop', role: 'bodyTop', d: 'M-25,-26 L-18,-27 L-18.6,-24.4 L-24.6,-23.4 Z' },
      { id: 'shoulderRTop', role: 'bodyTop', d: 'M25,-26 L18,-27 L18.6,-24.4 L24.6,-23.4 Z' },
      { id: 'torsoRim', role: 'accent', d: 'M-19,-5 L-14,-28 L14,-28 L19,-5 Z', stroke: true, width: 1.1, alpha: 0.42 },
      { id: 'visor', role: 'dark', d: 'M-13,-19 L13,-19 L13,-16 L-13,-16 Z' },
      { id: 'visorEye', role: 'accent', d: 'M-7,-19 L7,-19 L7,-17.4 L-7,-17.4 Z', alpha: 0.95, pulse: 'flicker' },
      { id: 'chest', role: 'accent', d: 'M-4,-13 L0,-17 L4,-13 L0,-9 Z', alpha: 0.75 },
      // Cañones gemelos: mismo pivote y misma pista de apuntado que el
      // fogonazo (rig.hot), así el disparo sale SIEMPRE de la boca real.
      { id: 'barrelLHousing', role: 'bodyTop', d: 'M-9.5,4 L-9.5,-15 L-3.5,-15 L-3.5,4 Z', pivot: [0, -27], rotTrack: 'aim', recoil: true },
      { id: 'barrelLCore', role: 'accent', d: 'M-9.5,2 L-9.5,-13 L-3.5,-13 L-3.5,2 Z', pivot: [0, -27], rotTrack: 'aim', recoil: true, alpha: 0.9 },
      { id: 'barrelLBore', role: 'dark', d: 'M-9.5,2 L-9.5,-6 L-3.5,-6 L-3.5,2 Z', pivot: [0, -27], rotTrack: 'aim', recoil: true },
      { id: 'barrelRHousing', role: 'bodyTop', d: 'M3.5,4 L3.5,-15 L9.5,-15 L9.5,4 Z', pivot: [0, -27], rotTrack: 'aim', recoil: true },
      { id: 'barrelRCore', role: 'accent', d: 'M3.5,2 L3.5,-13 L9.5,-13 L9.5,2 Z', pivot: [0, -27], rotTrack: 'aim', recoil: true, alpha: 0.9 },
      { id: 'barrelRBore', role: 'dark', d: 'M3.5,2 L3.5,-6 L9.5,-6 L9.5,2 Z', pivot: [0, -27], rotTrack: 'aim', recoil: true },
    ],
    hot: { pivot: [0, -27], dist: 16, rotTrack: 'aim', r: 3.4 },
  },

  // ---- Missile: TRIANGULAR (rack en A). Trípode + rack inclinado con 4
  // tubos y 2 ojivas, que GIRA hacia su blanco (fase 60: el misil es
  // teledirigido, así que la torre mira al enemigo — no a donde va a
  // estar). Es la única silueta con base ancha y cima estrecha.
  homing: {
    bbox: { x: -18, y: -47, w: 36, h: 47 },
    shadow: { rx: 28, ry: 7, oy: 4 },
    texture: { key: 'homing', clip: 'M-13,3 L-13,-24 L13,-24 L13,3 Z', x: -13, y: -24, w: 26, h: 27, pivot: [0, -12], rot: -0.2, rotTrack: 'aim', recoil: true },
    parts: [
      // El trípode NO gira: el rack se inclina sobre él (por eso el
      // pivote de todo el conjunto es su centro, [0,-12]).
      { id: 'legL', role: 'body', line: [-2, -14, -15, -3], width: 5.5, cap: 'round' },
      { id: 'legR', role: 'body', line: [2, -14, 15, -3], width: 5.5, cap: 'round' },
      { id: 'legLTint', role: 'bodyTop', line: [-2, -14, -15, -3], width: 1.8, cap: 'round', alpha: 0.8 },
      { id: 'legRTint', role: 'bodyTop', line: [2, -14, 15, -3], width: 1.8, cap: 'round', alpha: 0.8 },
      { id: 'rack', role: 'body', d: 'M-13,3 L-13,-24 L13,-24 L13,3 Z', pivot: [0, -12], rot: -0.2, rotTrack: 'aim', recoil: true },
      { id: 'rackTop', role: 'bodyTop', d: 'M-13,-24 L13,-24 L11,-19 L-11,-19 Z', pivot: [0, -12], rot: -0.2, rotTrack: 'aim', recoil: true },
      { id: 'rackRim', role: 'accent', d: 'M-13,3 L-13,-24 L13,-24 L13,3 Z', pivot: [0, -12], rot: -0.2, rotTrack: 'aim', recoil: true, stroke: true, width: 1.1, alpha: 0.20 },
      { id: 'tube1', role: 'dark', d: 'M-10.4,3 L-10.4,-22 L-8,-22 L-8,3 Z', pivot: [0, -12], rot: -0.2, rotTrack: 'aim', recoil: true, alpha: 0.85 },
      { id: 'tube2', role: 'dark', d: 'M-4.2,3 L-4.2,-22 L-1.8,-22 L-1.8,3 Z', pivot: [0, -12], rot: -0.2, rotTrack: 'aim', recoil: true, alpha: 0.85 },
      { id: 'tube3', role: 'dark', d: 'M1.8,3 L1.8,-22 L4.2,-22 L4.2,3 Z', pivot: [0, -12], rot: -0.2, rotTrack: 'aim', recoil: true, alpha: 0.85 },
      { id: 'tube4', role: 'dark', d: 'M8,3 L8,-22 L10.4,-22 L10.4,3 Z', pivot: [0, -12], rot: -0.2, rotTrack: 'aim', recoil: true, alpha: 0.85 },
      { id: 'nose1', role: 'hot', d: 'M-8.6,-24 L-5.4,-24 L-7,-34 Z', pivot: [0, -12], rot: -0.2, rotTrack: 'aim', recoil: true, alpha: 0.95 },
      { id: 'nose2', role: 'hot', d: 'M5.4,-24 L8.6,-24 L7,-34 Z', pivot: [0, -12], rot: -0.2, rotTrack: 'aim', recoil: true, alpha: 0.95 },
    ],
    hot: { pivot: [0, -12], rot: -0.2, rotTrack: 'aim', dist: 30, r: 3.2 },
  },

  // ---- Beam: COPA (trompeta). Estrecha en la base y ABIERTA arriba,
  // con aletas de refrigeración y un anillo de foco que MIRA al blanco. Es la única
  // que se ensancha hacia arriba.
  beam: {
    bbox: { x: -22, y: -48, w: 44, h: 45 },
    shadow: { rx: 30, ry: 7, oy: 4 },
    texture: { key: 'beam', clip: 'M-6,-5 L-19,-43 L19,-43 L6,-5 Z', x: -19, y: -43, w: 38, h: 38 },
    parts: [
      { id: 'flare', role: 'body', d: 'M-6,-5 L-19,-43 L19,-43 L6,-5 Z' },
      { id: 'flareIn', role: 'dark', d: 'M-6,-5 L-11,-24 L11,-24 L6,-5 Z' },
      { id: 'flareTint', role: 'accent', d: 'M-6,-5 L-19,-43 L19,-43 L6,-5 Z', alpha: 0.10 },
      { id: 'flareRim', role: 'accent', d: 'M-6,-5 L-19,-43 L19,-43 L6,-5 Z', stroke: true, width: 1.1, alpha: 0.40 },
      // Aletas de refrigeración: el ancho de cada travesaño sigue la
      // pendiente REAL del cono (a y=-18 el cono mide ±10.45 px, etc.).
      { id: 'slat1', role: 'accent', d: 'M-10.4,-18 L10.4,-18 L10.4,-16 L-10.4,-16 Z', alpha: 0.22 },
      { id: 'slat2', role: 'accent', d: 'M-13.2,-26 L13.2,-26 L13.2,-24 L-13.2,-24 Z', alpha: 0.22 },
      { id: 'slat3', role: 'accent', d: 'M-15.9,-34 L15.9,-34 L15.9,-32 L-15.9,-32 Z', alpha: 0.22 },
      { id: 'finL', role: 'body', d: 'M-16,-40 L-22,-36 L-22,-30 L-16,-32 Z' },
      { id: 'finR', role: 'body', d: 'M16,-40 L22,-36 L22,-30 L16,-32 Z' },
      { id: 'finLTint', role: 'bodyTop', d: 'M-16,-40 L-22,-36 L-22,-34 L-16,-38 Z' },
      { id: 'finRTint', role: 'bodyTop', d: 'M16,-40 L22,-36 L22,-34 L16,-38 Z' },
      { id: 'mouth', role: 'dark', ellipse: [0, -43, 17, 5], pivot: [0, -34], rotTrack: 'aim', rotMul: 1 },
      { id: 'mouthRing', role: 'accent', ellipse: [0, -43, 17, 5], stroke: true, width: 2, alpha: 0.85, pivot: [0, -34], rotTrack: 'aim', rotMul: 1 },
      { id: 'lens', role: 'hot', circle: [0, -43, 5.4], pulse: 'breathe', pivot: [0, -34], rotTrack: 'aim', rotMul: 1 },
      { id: 'lensCore', role: 'core', circle: [0, -43, 2.2], alpha: 0.8, pivot: [0, -34], rotTrack: 'aim', rotMul: 1 },
    ],
    hot: { pivot: [0, -34], dist: 9, rotTrack: 'aim', r: 5.4 },
  },

  // ---- Thunderstroke: OBELISCO (alto y fino). Columna estrecha con 4
  // anillos de bobina que se encienden en cascada + esfera en la punta.
  // Caja 26×46: la más estrecha de las altas.
  bolt: {
    bbox: { x: -13, y: -49, w: 26, h: 46 },
    shadow: { rx: 22, ry: 6, oy: 3 },
    texture: { key: 'bolt', clip: 'M-7,-11 L-4,-36 L4,-36 L7,-11 Z', x: -7, y: -36, w: 14, h: 25 },
    parts: [
      { id: 'base', role: 'body', d: 'M-13,-4 L-12,-11 L12,-11 L13,-4 Z' },
      { id: 'baseTop', role: 'bodyTop', d: 'M-12,-11 L12,-11 L11.4,-9 L-11.4,-9 Z' },
      { id: 'column', role: 'body', d: 'M-7,-11 L-4,-36 L4,-36 L7,-11 Z' },
      { id: 'columnLit', role: 'bodyTop', d: 'M-7,-11 L-4,-36 L0,-36 L0,-11 Z', alpha: 0.55 },
      { id: 'columnRim', role: 'accent', d: 'M-7,-11 L-4,-36 L4,-36 L7,-11 Z', stroke: true, width: 1.1, alpha: 0.35 },
      { id: 'coil1', role: 'accent', ellipse: [0, -15, 11, 3.5], stroke: true, width: 2.2, alpha: 0.75, pulse: 'wave', wave: 0 },
      { id: 'coil2', role: 'accent', ellipse: [0, -21.5, 9.6, 3.1], stroke: true, width: 2.2, alpha: 0.75, pulse: 'wave', wave: 1.1 },
      { id: 'coil3', role: 'accent', ellipse: [0, -28, 8.2, 2.7], stroke: true, width: 2.2, alpha: 0.75, pulse: 'wave', wave: 2.2 },
      { id: 'coil4', role: 'accent', ellipse: [0, -34.5, 6.8, 2.3], stroke: true, width: 2.2, alpha: 0.75, pulse: 'wave', wave: 3.3 },
      { id: 'clampL', role: 'body', line: [-5, -30, -4, -36], width: 2.5 },
      { id: 'clampR', role: 'body', line: [5, -30, 4, -36], width: 2.5 },
      { id: 'orb', role: 'hot', circle: [0, -42, 6.4], pulse: 'charge' },
      { id: 'orbCore', role: 'core', circle: [-1.6, -43.6, 2.2], alpha: 0.75 },
    ],
    hot: { at: [0, -42], r: 6.4 },
  },

  // ---- Tesla: ARO (ancha y baja). Base ancha, columna corta y 3
  // anillos GRANDES de plasma con nodos de chispa arriba. Caja 34×47:
  // se distingue del Thunderstroke por ancho y por la ausencia de esfera.
  chain: {
    bbox: { x: -17, y: -50, w: 34, h: 47 },
    shadow: { rx: 26, ry: 7, oy: 4 },
    texture: { key: 'chain', clip: 'M-9,-12 L-11,-28 L11,-28 L9,-12 Z', x: -11, y: -28, w: 22, h: 16 },
    parts: [
      { id: 'base', role: 'body', d: 'M-16,-4 L-14,-12 L14,-12 L16,-4 Z' },
      { id: 'baseTop', role: 'bodyTop', d: 'M-14,-12 L14,-12 L13,-9.6 L-13,-9.6 Z' },
      { id: 'column', role: 'body', d: 'M-9,-12 L-11,-28 L11,-28 L9,-12 Z' },
      { id: 'columnTint', role: 'accent', d: 'M-9,-12 L-11,-28 L0,-28 L0,-12 Z', alpha: 0.12 },
      { id: 'columnRim', role: 'accent', d: 'M-9,-12 L-11,-28 L11,-28 L9,-12 Z', stroke: true, width: 1.1, alpha: 0.35 },
      { id: 'ring1', role: 'accent', ellipse: [0, -17, 16, 4.5], stroke: true, width: 2.6, alpha: 0.8, pulse: 'wave', wave: 0 },
      { id: 'ring2', role: 'accent', ellipse: [0, -25, 13.8, 3.9], stroke: true, width: 2.6, alpha: 0.8, pulse: 'wave', wave: 1.4 },
      { id: 'ring3', role: 'accent', ellipse: [0, -33, 11.6, 3.3], stroke: true, width: 2.6, alpha: 0.8, pulse: 'wave', wave: 2.8 },
      { id: 'rod', role: 'body', line: [0, -32, 0, -46], width: 2.5 },
      { id: 'nodeCore', role: 'hot', circle: [0, -46, 3.4] },
      { id: 'nodeL', role: 'hot', circle: [-6, -46, 2], alpha: 0.8, pulse: 'flicker', wave: 1.7 },
      { id: 'nodeR', role: 'hot', circle: [6, -46, 2], alpha: 0.8, pulse: 'flicker', wave: 3.4 },
    ],
    hot: { at: [0, -46], r: 3.6 },
  },

  // ---- Mortar: DIAGONAL GRUESA. Placa de asiento pesada + tubo corto y
  // gordo a −20° con aro de boca, que TRAVERSA hacia su blanco. Es la única con el volumen en diagonal
  // y la única que apunta en el plano del dibujo, no hacia arriba.
  mortar: {
    bbox: { x: -22, y: -48, w: 42, h: 47 },
    shadow: { rx: 30, ry: 7, oy: 4 },
    texture: { key: 'homing', clip: 'M-11,8 L-9,-31 L9,-31 L11,8 Z', x: -11, y: -31, w: 22, h: 39, pivot: [0, -12], rot: -0.35, rotTrack: 'aim', rotMul: 1 },
    parts: [
      { id: 'plate', role: 'body', d: 'M-19,-4 L-18,-10 L18,-10 L19,-4 Z' },
      { id: 'plateTop', role: 'bodyTop', d: 'M-18,-10 L18,-10 L17,-7.6 L-17,-7.6 Z' },
      { id: 'footL', role: 'body', line: [-13, -9, -19, -2], width: 3.5 },
      { id: 'footR', role: 'body', line: [13, -9, 19, -2], width: 3.5 },
      { id: 'tube', role: 'body', d: 'M-11,8 L-9,-31 L9,-31 L11,8 Z', pivot: [0, -12], rot: -0.35, rotTrack: 'aim', rotMul: 1 , recoil: true },
      { id: 'tubeTint', role: 'accent', d: 'M-11,8 L-9,-31 L0,-31 L0,8 Z', pivot: [0, -12], rot: -0.35, rotTrack: 'aim', rotMul: 1, alpha: 0.10 , recoil: true },
      { id: 'tubeRim', role: 'accent', d: 'M-11,8 L-9,-31 L9,-31 L11,8 Z', pivot: [0, -12], rot: -0.35, rotTrack: 'aim', rotMul: 1, stroke: true, width: 1.1, alpha: 0.40 , recoil: true },
      // Bandas de refuerzo: en `metal` (gris claro) y no en negro, que
      // era justo el detalle que se perdía sobre el cuerpo oscuro.
      { id: 'band1', role: 'metal', d: 'M-10.4,-6 L10.4,-6 L10.4,-4.4 L-10.4,-4.4 Z', pivot: [0, -12], rot: -0.35, rotTrack: 'aim', rotMul: 1, alpha: 0.35 },
      { id: 'band2', role: 'metal', d: 'M-10.4,-14 L10.4,-14 L10.4,-12.4 L-10.4,-12.4 Z', pivot: [0, -12], rot: -0.35, rotTrack: 'aim', rotMul: 1, alpha: 0.35 },
      { id: 'muzzleBlock', role: 'body', d: 'M-11,-33 L11,-33 L11,-29 L-11,-29 Z', pivot: [0, -12], rot: -0.35, rotTrack: 'aim', rotMul: 1 , recoil: true },
      { id: 'bore', role: 'dark', ellipse: [0, -31, 8.4, 3.2], pivot: [0, -12], rot: -0.35, rotTrack: 'aim', rotMul: 1 , recoil: true },
      { id: 'boreRing', role: 'accent', ellipse: [0, -31, 9.4, 3.6], stroke: true, width: 2.2, alpha: 0.95, pivot: [0, -12], rot: -0.35, rotTrack: 'aim', rotMul: 1 , recoil: true },
      { id: 'cradleL', role: 'body', line: [-6, -2, -11, -12], width: 3 },
      { id: 'cradleR', role: 'body', line: [6, -2, 11, -12], width: 3 },
    ],
    // La boca va DONDE ESTÁ EL TUBO (rotado y traversado), no en (0,-52) como
    // antes: el fogonazo del mortero flotaba en el aire, a 19 px del
    // cañón. Mismo cálculo que el resto del rig.
    hot: { pivot: [0, -12], rot: -0.35, rotTrack: 'aim', dist: 31, r: 3.6 },
  },

  // ---- Gauss: RIEL (largo y fino). Riel de 42 px sobre un gimbal
  // bajo, con raíles CLAROS (antes #05070A sobre #12141A: invisibles) y
  // 4 bobinas. Es la única silueta de gran relación largo/ancho.
  gauss: {
    bbox: { x: -14, y: -48, w: 28, h: 46 },
    shadow: { rx: 24, ry: 6, oy: 3 },
    texture: { key: 'beam', clip: 'M-8,20 L-7,-22 L7,-22 L8,20 Z', x: -8, y: -22, w: 16, h: 42, pivot: [0, -22], rotTrack: 'aim' },
    parts: [
      { id: 'gimbal', role: 'body', d: 'M-12,-4 L-10,-13 L10,-13 L12,-4 Z' },
      { id: 'gimbalTop', role: 'bodyTop', d: 'M-10,-13 L10,-13 L9,-10.4 L-9,-10.4 Z' },
      { id: 'rail', role: 'body', d: 'M-8,20 L-7,-22 L7,-22 L8,20 Z', pivot: [0, -22], rotTrack: 'aim', recoil: true },
      { id: 'railTint', role: 'accent', d: 'M-8,20 L-7,-22 L0,-22 L0,20 Z', pivot: [0, -22], rotTrack: 'aim', recoil: true, alpha: 0.09 },
      { id: 'railRim', role: 'accent', d: 'M-8,20 L-7,-22 L7,-22 L8,20 Z', pivot: [0, -22], rotTrack: 'aim', recoil: true, stroke: true, width: 1.1, alpha: 0.40 },
      { id: 'channel', role: 'dark', d: 'M-4,-22 L4,-22 L4,-4 L-4,-4 Z', pivot: [0, -22], rotTrack: 'aim', recoil: true },
      // Los raíles son un FILO brillante en el canto (una línea fina), no
      // dos barrotes claros: con los barrotes anchos + 4 bobinas el arma
      // se leía como una ESCALERA.
      { id: 'railEdgeL', role: 'metal', line: [-7.4, -20, -7.4, 17], width: 1.3, alpha: 0.34, pivot: [0, -22], rotTrack: 'aim', recoil: true },
      { id: 'railEdgeR', role: 'metal', line: [7.4, -20, 7.4, 17], width: 1.3, alpha: 0.34, pivot: [0, -22], rotTrack: 'aim', recoil: true },
      { id: 'coil1', role: 'accent', d: 'M-9.4,12 L-5.6,12 L-5.6,10.2 L-9.4,10.2 Z M5.6,12 L9.4,12 L9.4,10.2 L5.6,10.2 Z', pivot: [0, -22], rotTrack: 'aim', recoil: true, alpha: 0.60 },
      { id: 'coil2', role: 'accent', d: 'M-9.4,3 L-5.6,3 L-5.6,1.2 L-9.4,1.2 Z M5.6,3 L9.4,3 L9.4,1.2 L5.6,1.2 Z', pivot: [0, -22], rotTrack: 'aim', recoil: true, alpha: 0.60 },
      { id: 'coil3', role: 'accent', d: 'M-9.4,-6 L-5.6,-6 L-5.6,-7.8 L-9.4,-7.8 Z M5.6,-6 L9.4,-6 L9.4,-7.8 L5.6,-7.8 Z', pivot: [0, -22], rotTrack: 'aim', recoil: true, alpha: 0.60 },
      { id: 'coil4', role: 'accent', d: 'M-9.4,-15 L-5.6,-15 L-5.6,-16.8 L-9.4,-16.8 Z M5.6,-15 L9.4,-15 L9.4,-16.8 L5.6,-16.8 Z', pivot: [0, -22], rotTrack: 'aim', recoil: true, alpha: 0.60, pulse: 'charge' },
      { id: 'brake', role: 'body', d: 'M-9,-26 L9,-26 L9,-22 L-9,-22 Z', pivot: [0, -22], rotTrack: 'aim', recoil: true },
      { id: 'brakeTip', role: 'hot', d: 'M-7,-24.4 L7,-24.4 L7,-23 L-7,-23 Z', pivot: [0, -22], rotTrack: 'aim', recoil: true, alpha: 0.95 },
    ],
    hot: { pivot: [0, -22], dist: 24.5, rotTrack: 'aim', r: 3.6 },
  },

  // ---- Láser: COLUMNA FINA (vertical). Cuerpo estrecho con disipadores
  // claros + capucha larga y lente pequeña. Es la más esbelta de las 8:
  // se lee como un "rifle" vertical, no como un cono.
  laser: {
    bbox: { x: -10, y: -50, w: 20, h: 47 },
    shadow: { rx: 20, ry: 6, oy: 3 },
    texture: { key: 'bolt', clip: 'M-9,-11 L-6,-32 L6,-32 L9,-11 Z', x: -9, y: -32, w: 18, h: 21 },
    parts: [
      { id: 'base', role: 'body', d: 'M-9,-4 L-8,-11 L8,-11 L9,-4 Z' },
      { id: 'baseTop', role: 'bodyTop', d: 'M-8,-11 L8,-11 L7.4,-8.6 L-7.4,-8.6 Z' },
      { id: 'body', role: 'body', d: 'M-9,-11 L-6,-32 L6,-32 L9,-11 Z', pivot: [0, -9], rotTrack: 'aim'  },
      { id: 'bodyTint', role: 'accent', d: 'M-9,-11 L-6,-32 L0,-32 L0,-11 Z', alpha: 0.10, pivot: [0, -9], rotTrack: 'aim'  },
      { id: 'bodyRim', role: 'accent', d: 'M-9,-11 L-6,-32 L6,-32 L9,-11 Z', stroke: true, width: 1.1, alpha: 0.40, pivot: [0, -9], rotTrack: 'aim'  },
      { id: 'sink1', role: 'metal', d: 'M-8,-16 L-3,-16 L-3,-14.8 L-8,-14.8 Z M3,-16 L8,-16 L8,-14.8 L3,-14.8 Z', alpha: 0.38, pivot: [0, -9], rotTrack: 'aim'  },
      { id: 'sink2', role: 'metal', d: 'M-7.6,-22 L-3,-22 L-3,-20.8 L-7.6,-20.8 Z M3,-22 L7.6,-22 L7.6,-20.8 L3,-20.8 Z', alpha: 0.38, pivot: [0, -9], rotTrack: 'aim'  },
      { id: 'sink3', role: 'metal', d: 'M-7.2,-28 L-3,-28 L-3,-26.8 L-7.2,-26.8 Z M3,-28 L7.2,-28 L7.2,-26.8 L3,-26.8 Z', alpha: 0.38, pivot: [0, -9], rotTrack: 'aim'  },
      { id: 'shroud', role: 'body', d: 'M-5,-32 L-5,-45 L5,-45 L5,-32 Z', pivot: [0, -9], rotTrack: 'aim'  },
      { id: 'shroudTint', role: 'accent', d: 'M-5,-32 L-5,-45 L0,-45 L0,-32 Z', alpha: 0.14, pivot: [0, -9], rotTrack: 'aim'  },
      { id: 'shroudRim', role: 'accent', d: 'M-5,-32 L-5,-45 L5,-45 L5,-32 Z', stroke: true, width: 1.1, alpha: 0.45, pivot: [0, -9], rotTrack: 'aim'  },
      { id: 'hood', role: 'dark', d: 'M-3,-46 L3,-46 L3,-42 L-3,-42 Z', pivot: [0, -9], rotTrack: 'aim'  },
      { id: 'lens', role: 'hot', circle: [0, -45, 4.6], pulse: 'breathe', pivot: [0, -9], rotTrack: 'aim'  },
      { id: 'lensCore', role: 'core', circle: [-0.4, -45.8, 1.6], alpha: 0.8, pivot: [0, -9], rotTrack: 'aim'  },
    ],
    hot: { pivot: [0, -9], dist: 36, rotTrack: 'aim', r: 4.6 },
  },
};

/** Todos los `kind` con rig — lo usa tests/test-tower-art.mjs. */
export const RIG_KINDS = Object.keys(TOWER_RIGS);

// ------------------------------------------------------------
// Renderizador
// ------------------------------------------------------------

/** Cache de Path2D por string `d` (navegador). En Node queda vacía. */
const PATH_CACHE = new Map();

/** Cache de sprites de glow por color (canvas offscreen, 64×64). */
const GLOW_CACHE = new Map();

/** Retroceso máximo del cañón, en px (antes de la escala visual). */
const RECOIL_PX = 3;

/** Mezcla dos colores hex `#RRGGBB` (t=0 → a, t=1 → b). */
export function mixHex(a, b, t) {
  if (typeof a !== 'string' || typeof b !== 'string' || a[0] !== '#' || b[0] !== '#') return a;
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1).toUpperCase();
}

/** `#RRGGBB` + alpha → `rgba(...)`. Tolera colores que ya son rgba. */
function hexA(hex, a) {
  if (typeof hex !== 'string' || hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * Traza un `d` con la API del ctx. FALLBACK de `Path2D`: en Node no
 * existe el global y los tests renderizan con stubs de ctx, así que el
 * rig tiene que poder dibujarse con moveTo/lineTo/closePath.
 * Soporta M/L/H/V/C/Q/Z en absoluto y relativo (el rig no usa arcos:
 * los círculos son shapes `circle`/`ellipse`, que sí son nativos).
 */
function tracePath(ctx, d) {
  const seg = /([MmLlHhVvCcQqZz])([^MmLlHhVvCcQqZz]*)/g;
  let m;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  while ((m = seg.exec(d)) !== null) {
    const cmd = m[1];
    const nums = (m[2].match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || []).map(Number);
    const rel = cmd !== cmd.toUpperCase();
    const up = cmd.toUpperCase();
    const bx = rel ? cx : 0;
    const by = rel ? cy : 0;
    if (up === 'M') {
      cx = bx + nums[0]; cy = by + nums[1];
      ctx.moveTo(cx, cy);
      sx = cx; sy = cy;
      for (let i = 2; i + 1 < nums.length; i += 2) {
        cx = bx + nums[i]; cy = by + nums[i + 1];
        ctx.lineTo(cx, cy);
      }
    } else if (up === 'L') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        cx = bx + nums[i]; cy = by + nums[i + 1];
        ctx.lineTo(cx, cy);
      }
    } else if (up === 'H') {
      for (let i = 0; i < nums.length; i++) { cx = bx + nums[i]; ctx.lineTo(cx, cy); }
    } else if (up === 'V') {
      for (let i = 0; i < nums.length; i++) { cy = by + nums[i]; ctx.lineTo(cx, cy); }
    } else if (up === 'C') {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        ctx.bezierCurveTo(bx + nums[i], by + nums[i + 1], bx + nums[i + 2], by + nums[i + 3],
          bx + nums[i + 4], by + nums[i + 5]);
        cx = bx + nums[i + 4]; cy = by + nums[i + 5];
      }
    } else if (up === 'Q') {
      for (let i = 0; i + 3 < nums.length; i += 4) {
        ctx.quadraticCurveTo(bx + nums[i], by + nums[i + 1], bx + nums[i + 2], by + nums[i + 3]);
        cx = bx + nums[i + 2]; cy = by + nums[i + 3];
      }
    } else if (up === 'Z') {
      ctx.closePath();
      cx = sx; cy = sy;
    }
  }
}

/** Path2D cacheado, o null si el entorno no lo tiene (Node). */
function cachedPath(d) {
  if (typeof Path2D !== 'function') return null;
  let p = PATH_CACHE.get(d);
  if (!p) {
    p = new Path2D(d);
    PATH_CACHE.set(d, p);
  }
  return p;
}

/**
 * Sprite de glow radial por color (64×64, canvas offscreen cacheado).
 * Devuelve null cuando no hay `document` (Node) — el llamador degrada.
 */
function glowSprite(color) {
  if (GLOW_CACHE.has(color)) return GLOW_CACHE.get(color);
  let cv = null;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const g = cv.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, hexA(color, 1));
      grad.addColorStop(0.45, hexA(color, 0.42));
      grad.addColorStop(1, hexA(color, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
  }
  GLOW_CACHE.set(color, cv);
  return cv;
}

/**
 * Halo radial. En navegador usa el sprite cacheado (un drawImage por
 * halo, mucho más barato que un gradiente por frame); en Node, si el
 * ctx trae createRadialGradient, lo usa; si no (stubs de test), no pinta
 * nada — el glow es decorativo y NUNCA debe romper un test.
 */
export function drawGlow(ctx, x, y, r, color, alpha) {
  if (!(r > 0) || !(alpha > 0)) return;
  const spr = glowSprite(color);
  if (spr) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
    ctx.restore();
    return;
  }
  if (typeof ctx.createRadialGradient !== 'function') return;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, hexA(color, alpha));
  grad.addColorStop(1, hexA(color, 0));
  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Colores lógicos del rig a partir de la entrada de TOWERS. */
export function rigColors(data, muzzle) {
  const accent = data?.accent ?? '#FFFFFF';
  const body = data?.bodyColor ?? '#10161A';
  return {
    body,
    bodyTop: mixHex(body, accent, 0.20),
    dark: '#05070A',
    metal: '#8FA3B8',
    accent,
    hot: muzzle ?? accent,
    core: '#FFFFFF',
  };
}

/**
 * Punto de la BOCA (fogonazo / pulso en reposo) de un rig.
 * - `at`: punto fijo.
 * - `pivot` + `rot`/`rotTrack:'aim'` + `dist`: punto que gira con el
 *   cañón (Guardian, Gauss) o que vive en una pieza rotada (Missile,
 *   Mortar, Beam, Láser) — así el fogonazo sale SIEMPRE del cañón, no de
 *   (0,-52). `rotMul` escala el apuntado igual que en las piezas (el
 *   lente del Beam gira media vuelta de lo que gira el cañón).
 * @returns {[number, number]}
 */
export function rigHotPoint(rig, aim = 0) {
  const h = rig?.hot;
  if (!h) return [0, -40];
  if (h.at) return [h.at[0], h.at[1]];
  const ang = (h.rot ?? 0) + (h.rotTrack === 'aim' ? aim * (h.rotMul ?? 1) : 0);
  const px = h.pivot?.[0] ?? 0;
  const py = h.pivot?.[1] ?? 0;
  const s = Math.sin(ang);
  const c = Math.cos(ang);
  // Rotación de (0, -dist) alrededor del pivote: hacia arriba (-y) es
  // "el cañón apunta al frente".
  return [px - s * -h.dist, py + c * -h.dist];
}

/** Radio de la boca (para escalar el fogonazo). */
export function rigHotRadius(rig) {
  return rig?.hot?.r ?? 3.4;
}

/**
 * Caja TOTAL del rig (silueta + pad) en coordenadas de la torre.
 * La usa el icono del meta-juego (js/meta.js) para encuadrar cada torre
 * con su MISMO criterio: antes había una escala fija de 0.8 para las 8,
 * así que el Guardian (50 px de ancho) y el Láser (20) quedaban muy
 * distintos de tamaño dentro de la misma tarjeta.
 * @returns {{x0:number, x1:number, y0:number, y1:number}}
 */
export function rigBox(kind) {
  const rig = TOWER_RIGS[kind];
  const bb = rig?.bbox ?? { x: -20, y: -40, w: 40, h: 40 };
  const p = TOWER_PAD;
  return {
    x0: Math.min(bb.x, -p.rx),
    x1: Math.max(bb.x + bb.w, p.rx),
    y0: Math.min(bb.y, p.cy - p.ry),
    y1: Math.max(bb.y + bb.h, p.cy + p.ry),
  };
}

/**
 * PAD de la torre: plataforma + contacto de luz + TICKS DE NIVEL.
 * Los ticks sustituyen a los pips que antes flotaban debajo de la torre
 * (fase 60): el estado vive en el pad, alineado con el encaje de los
 * slots vacíos de js/player.js.
 */
export function drawTowerPad(ctx, colors, lv, t) {
  const p = TOWER_PAD;
  drawGlow(ctx, 0, p.cy, p.glowR, colors.accent, p.glowAlpha);
  ctx.save();
  ctx.fillStyle = p.plate;
  ctx.beginPath();
  ctx.ellipse(0, p.cy, p.rx, p.ry, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = p.rim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, p.cy, p.rx, p.ry, 0, 0, TAU);
  ctx.stroke();
  // Ticks: 5 segmentos en la mitad delantera del anillo; se encienden
  // con el nivel. El primero parpadea muy poco para que el pad no se
  // sienta muerto con la torre en reposo.
  const tk = p.tick;
  const span = Math.PI / tk.count;
  for (let i = 0; i < tk.count; i++) {
    const lit = i < lv;
    const a0 = Math.PI + tk.inset + i * span;
    const a1 = a0 + span - tk.gap;
    ctx.strokeStyle = lit ? colors.accent : tk.idleColor;
    ctx.lineWidth = lit ? tk.width : tk.idleWidth;
    ctx.globalAlpha = lit ? (i === 0 ? 0.82 + 0.18 * Math.sin(t * 2.2) : tk.litAlpha) : tk.idleAlpha;
    ctx.beginPath();
    ctx.ellipse(0, p.cy, p.ring.rx, p.ring.ry, 0, a0, a1);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Pinta el rig completo de una torre.
 *
 * @param {CanvasRenderingContext2D} ctx contexto del juego (o stub)
 * @param {object} opts
 *   · kind    clave del rig ('fan', 'bolt', …)
 *   · data    entrada de TOWERS (bodyColor/accent)
 *   · muzzle  color de firma de la boca (MUZZLE_ACCENT[kind] ?? accent)
 *   · lv      nivel 1-5 (ticks del pad)
 *   · t       reloj en segundos
 *   · aim     ángulo del cañón (rad, 0 = vertical)
 *   · charge  0..1 build-up (Gauss/Thunderstroke y pulso de lentes)
 *   · recoil  0..1 retroceso del disparo
 *   · sprites mapa de chasis cargados ({ ready, img }) indexado por la
 *             clave que declara el propio rig en `texture.key`
 *   · drawPad false → no pintar el pad (lo usa el icono del meta-juego)
 */
export function renderTowerRig(ctx, opts) {
  const rig = TOWER_RIGS[opts.kind];
  if (!rig) return false;
  const c = rigColors(opts.data, opts.muzzle);
  const t = opts.t ?? 0;
  const aim = Number.isFinite(opts.aim) ? opts.aim : 0;
  const charge = Math.max(0, Math.min(1, opts.charge ?? 0));
  const recoil = Math.max(0, Math.min(1, opts.recoil ?? 0));

  if (opts.drawPad !== false) drawTowerPad(ctx, c, opts.lv ?? 1, t);

  // Sombra proyectada sobre la plataforma (la torre se apoya, no flota).
  const sh = rig.shadow;
  if (sh) {
    ctx.save();
    ctx.fillStyle = '#000308';
    ctx.globalAlpha = 0.30;
    ctx.beginPath();
    ctx.ellipse(2, sh.oy, sh.rx, sh.ry, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.ellipse(2, sh.oy, sh.rx * 0.7, sh.ry * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  for (const part of rig.parts) {
    let rot = part.rot ?? 0;
    if (part.rotTrack === 'aim') rot += aim * (part.rotMul ?? 1);
    else if (part.rotTrack === 'spin') rot += t * (part.spin ?? 1);
    let alpha = part.alpha ?? 1;
    let grow = 0;
    if (part.pulse === 'charge') { alpha *= 0.45 + 0.55 * charge; grow = 0.20 * charge; }
    else if (part.pulse === 'wave') alpha *= 0.55 + 0.45 * Math.sin(t * 3.2 - (part.wave ?? 0));
    else if (part.pulse === 'flicker') alpha *= 0.80 + 0.20 * Math.sin(t * 5 + (part.wave ?? 0));
    else if (part.pulse === 'breathe') alpha *= 0.85 + 0.15 * Math.sin(t * 1.6 + (part.wave ?? 0));
    if (alpha <= 0.01) continue;

    ctx.save();
    if (part.pivot) ctx.translate(part.pivot[0], part.pivot[1]);
    if (rot) ctx.rotate(rot);
    if (part.recoil) ctx.translate(0, recoil * RECOIL_PX);
    ctx.globalAlpha = alpha;
    const style = c[part.role] ?? c.body;
    ctx.fillStyle = style;
    ctx.strokeStyle = style;
    if (part.line) {
      ctx.lineWidth = part.width ?? 2;
      if (part.cap) ctx.lineCap = part.cap;
      ctx.beginPath();
      ctx.moveTo(part.line[0], part.line[1]);
      ctx.lineTo(part.line[2], part.line[3]);
      ctx.stroke();
    } else if (part.rect) {
      ctx.fillRect(part.rect[0], part.rect[1], part.rect[2], part.rect[3]);
    } else if (part.circle) {
      ctx.beginPath();
      ctx.arc(part.circle[0], part.circle[1], part.circle[2] * (1 + grow), 0, TAU);
      if (part.stroke) { ctx.lineWidth = part.width ?? 1.5; ctx.stroke(); } else ctx.fill();
    } else if (part.ellipse) {
      ctx.beginPath();
      ctx.ellipse(part.ellipse[0], part.ellipse[1], part.ellipse[2] * (1 + grow),
        part.ellipse[3] * (1 + grow), 0, 0, TAU);
      if (part.stroke) { ctx.lineWidth = part.width ?? 1.5; ctx.stroke(); } else ctx.fill();
    } else if (part.d) {
      ctx.beginPath();
      const p = cachedPath(part.d);
      if (p) { if (part.stroke) { ctx.lineWidth = part.width ?? 1; ctx.stroke(p); } else ctx.fill(p); }
      else {
        tracePath(ctx, part.d);
        if (part.stroke) { ctx.lineWidth = part.width ?? 1; ctx.stroke(); } else ctx.fill();
      }
    }
    ctx.restore();
  }

  // Textura del chasis RECORTADA DENTRO DE LA SILUETA (fase 60): antes
  // el sprite se dibujaba entero, más grande y en 'lighter' — sobre el
  // cono del Beam se veía un marco rectangular flotando, como una
  // puerta. Recortado y en 'overlay' pasa a ser textura del cuerpo.
  const tex = rig.texture;
  const img = tex ? opts.sprites?.[tex.key] : null;
  if (tex && img?.ready && img.img && typeof ctx.clip === 'function'
      && typeof ctx.drawImage === 'function') {
    ctx.save();
    ctx.beginPath();
    const cp = cachedPath(tex.clip);
    if (cp) ctx.clip(cp);
    else { tracePath(ctx, tex.clip); ctx.clip(); }
    if (tex.pivot) ctx.translate(tex.pivot[0], tex.pivot[1]);
    if (tex.rot) ctx.rotate(tex.rot);
    if (tex.rotTrack === 'aim') ctx.rotate(aim);
    // La textura acompaña a las piezas: si el cuerpo gira o retrocede, la
    // textura tiene que hacer lo MISMO o se despega del arma.
    if (tex.recoil) ctx.translate(0, recoil * RECOIL_PX);
    ctx.globalAlpha = 0.20 + 0.05 * ((opts.lv ?? 1) - 1);
    ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(img.img, tex.x, tex.y, tex.w, tex.h);
    ctx.restore();
  }
  return true;
}

/** Limpia las caches (tests y cambios de calidad). */
export function resetTowerArtCaches() {
  PATH_CACHE.clear();
  GLOW_CACHE.clear();
}
