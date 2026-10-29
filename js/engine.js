// ============================================================
// engine.js — núcleo del motor (shooter v2, dev-1)
// Loop rAF + dt con clamp ≤ 0.05 s, EventBus, FSM de 8 estados,
// input de teclado (§1.5: el canvas NO captura pointer para
// gameplay), escena volcánica (planeta + grietas + plataforma +
// niebla), partículas, floats y shake.
// Contratos: docs/DESIGN.md §1.2/§1.3/§1.4/§4.2 y firmas de dev-1 (§5).
// Regla de dependencias (§ grafo acíclico): engine.js importa solo sus
// propios helpers — NO importa quality.js aunque lo use fase 19 (ver
// setParticleCap()/el ctx expuesto en this.ctx): quien construye el
// Engine (main.js) es quien aplica la calidad desde afuera.
// ============================================================

// ============================================================
// FASE 58 — GEOMETRÍA VERTICAL DINÁMICA
// ============================================================
// El marco del juego (#marco-portrait, css/style.css) ya NO tiene
// proporción fija 54/88: usa TODO el alto disponible (100dvh - 16px) y
// su ancho se limita a 100vw - 16px. En un móvil (390×844 → marco
// 374×828) el marco es MÁS ALTO que 54:88, así que el alto LÓGICO del
// canvas se deriva de la proporción REAL del marco: 540×1195 en vez de
// 540×880. En un escritorio ancho (1920×1080 → marco 653×1064) el
// marco conserva 54:88 → 540×880 → IDÉNTICO a siempre.
//
// REGLAS de la geometría (todo lo que se mueve, se mueve con el alto):
//   · el ANCHO lógico NO cambia (540): la escena es de diseño fijo;
//   · lo anclado ARRIBA (planeta, spawn) NO se mueve;
//   · lo anclado ABAJO (plataforma, torres, base, arco de HP) BAJA con el
//     alto → el CAMPO DE CAÍDA CRECE (de 970 a ~1285 lógicos en el móvil);
//   · para que el BALANCE no cambie, la velocidad de caída se compensa
//     (LAYOUT.fallScale): el tiempo bajo fuego es EXACTAMENTE el mismo.
//
// NOTA: CONFIG y SCENE son objetos mutables a propósito. `CANVAS_H`,
// `TOWER_Y`, `PLATFORM_Y` y `BASE_ARC_Y` dejan de ser
// constantes: los lee TODO el juego en runtime (engine.js, enemies.js,
// player.js, towers.js, waves.js, main.js, meta.js, effects.js), y
// mutarlos en un solo punto (setLogicalHeight) los mantiene coherentes
// entre sí sin tocar 60 call-sites. Lo que SÍ era una constante de
// MÓDULO (BASE_Y/BOSS_HOVER_Y en enemies.js, DRONE_Y en towers.js,
// ORB_PICKUP_Y en effects.js) se pasó a función/getter: se evalúan al
// importar y nunca habrían visto el nuevo alto.

/** Alto lógico de REFERENCIA (marco 54:88). */
const BASE_CANVAS_H = 880;
/** Y de la plataforma en el layout de referencia. */
const BASE_PLATFORM_Y = 810;
/** Y de la fila FRONTAL de torres en el layout de referencia. */
const BASE_TOWER_Y = 830;
/** Y del arco de HP de la base en el layout de referencia. */
const BASE_BASE_ARC_Y = 710;

/**
 * BAHÍA DE MONTAJE (fase 62): el octágono del deck donde se apoya cada
 * torre. La dibuja la plataforma (acero neutro) y `player.js` enciende su
 * estado "disponible" cuando el slot está vacío.
 *
 * ACOPLAMIENTO POR CONVENCIÓN (engine.js no importa nada, por invariante):
 * `TOWER_PAD` (js/tower-art.js) y el encaje de `player.js` tienen que
 * ENTRAR acá adentro. `tests/test-engine.mjs` verifica la contención
 * importando los tres módulos.
 */
export const TOWER_BAY = {
  halfW: 28,      // semiancho: 56 de ancho (el hueco entre bahías es 44)
  top: -19,       // borde superior, relativo a CONFIG.TOWER_Y
  bottom: 15,     // borde inferior → 34 de alto
  chamfer: 10,    // corte de las esquinas del octágono
  spineY: 24,     // el canal estructural, debajo de las bahías
  railY: 11,      // la tira de estado, DENTRO de la bahía (la enciende player.js)
  railHalfW: 15,
  // Módulos de servicio: SOLO en los huecos entre bahías (los de los
  // extremos no entran: ahí el casco ya se está curvando).
  moduleX: [126, 222, 318, 414],
};
/**
 * Y de spawn de los enemigos (borde superior del disco, arriba del todo).
 * Vive en engine.js para que el cálculo del layout y el de los enemigos
 * no puedan desincronizarse (enemies.js lo reexporta como THREAT_SPAWN_Y).
 */
export const SPAWN_Y = -120;
/**
 * Radio HISTÓRICO de referencia de las viejas torres de alcance limitado
 * (260 px: el extinto círculo del Thunderstroke y la base de la Tesla).
 *
 * fase 73: YA NO es el alcance máximo de una torre. El Thunderstroke pasó
 * a alcance global (como Gauss/Mortar/Láser) y la banda de la Tesla sube
 * 70 px por encima de este borde. La constante se mantiene porque define
 * `LAYOUT.bandY` y el `fallScale` del tramo libre: cambiarla altera el
 * ritmo de caída de TODOS los enemigos.
 */
export const MAX_TOWER_REACH = 260;

// CONFIG — firmas de dev-1. Los módulos de datos no los redefinen.
// OJO (fase 58): los valores marcados como DINÁMICOS los reescribe
// setLogicalHeight() cuando el marco cambia de proporción.
export const CONFIG = {
  CANVAS_W: 540,
  CANVAS_H: BASE_CANVAS_H,          // DINÁMICO (fase 58)
  // v3 3h/7 — PLATAFORMA MÁS BAJA (corrección canónica JK 26-08 #3):
  // PLATFORM_Y 760 → 810; TOWER_Y sigue a PLATFORM_Y+20 (mismo encaje
  // sobre las placas elevadas del deck que en 3g).
  TOWER_Y: BASE_TOWER_Y,            // DINÁMICO (fase 58)
  // 5 slots, TODOS en la misma fila (fase 61): el tope de 5 torres por
  // partida sale de acá — si no queda slot libre, una torre nueva no
  // puede entrar. El slot 2 (x=270) es el del Guardian, alineado con el
  // eje de la base.
  //
  // fase 62: repartidos UNIFORMEMENTE cada 96 px (antes 90/215/270/325/450,
  // con las tres del medio a 55 px: las bahías de montaje se pisaban y la
  // fila se veía apretada). Con 5 slots en una sola fila no hay motivo para
  // el apiñamiento que arrastraba la grilla de 9. Los extremos van 6 px
  // adentro del casco: a 70/470 la bahía se salía por la esquina redondeada
  // del deck (lo cazó el test de contención).
  SLOTS: [78, 174, 270, 366, 462],
  BASE_X: 270,
  MAX_PARTICLES: 400,
};

// Geometría de la escena volcánica (§1.4)
export const SCENE = {
  PLANET_CX: 270,
  PLANET_CY: -150,
  PLANET_R: 450,   // borde inferior del planeta ≈ y 300
  PLATFORM_Y: BASE_PLATFORM_Y, // techo de la plataforma metálica (v3 3h/7: 760→810,
  // piso más delgado ~70px visibles → recupera altura de juego) — DINÁMICO
  BASE_ARC_Y: BASE_BASE_ARC_Y, // arco HP — lo dibuja Fortress.render() (dev-2, §2.1);
  // baja con la plataforma (PLATFORM_Y-100, igual que antes) — DINÁMICO
};

/**
 * FASE 58 — Estado del layout vertical.
 *
 * · `h`      → alto LÓGICO actual del canvas (540×h).
 * · `delta`  → cuánto crece respecto del layout de referencia (h - 880).
 * · `bandY`  → Y del borde superior del tramo de caída "libre" histórico
 *              (CONFIG.TOWER_Y - MAX_TOWER_REACH). fase 73: ya NO marca el
 *              alcance de todas las torres (el Thunderstroke es global y la
 *              Tesla sube 70 px); se mantiene para el ritmo de caída.
 * · `fallScale` → factor de la velocidad de caída en el tramo LIBRE.
 *
 * POR QUÉ `fallScale` > 1: al crecer el marco, el campo de caída crece
 * (de 970 a ~1285 lógicos) y el enemigo tardaría un 32 % más en llegar
 * → el juego se volvería más fácil (más tiempo bajo fuego). Para que el
 * balance sea IDÉNTICO, el tramo libre (donde no hay ninguna torre que
 * pueda disparar) se recorre MÁS RÁPIDO, de modo que:
 *   · el tiempo de spawn→base sigue siendo el mismo, y
 *   · el tiempo bajo fuego de cada torre sigue siendo el mismo
 *     (el tramo bajo fuego se recorre a la velocidad nominal).
 */
export const LAYOUT = {
  baseH: BASE_CANVAS_H,
  minH: BASE_CANVAS_H,   // nunca por debajo del layout de referencia
  maxH: 1400,            // tope (móviles extremos: 344×884 → 1387)
  h: BASE_CANVAS_H,
  delta: 0,
  bandY: BASE_TOWER_Y - MAX_TOWER_REACH,
  fallScale: 1,
};

/**
 * FASE 58 — Y de un enemigo dentro de `T` segundos.
 *
 * La velocidad de caída NO es constante: por encima del borde del "bajo
 * fuego" (LAYOUT.bandY) corre a `LAYOUT.fallScale`× y por debajo a 1×.
 * El lead predictivo de las torres (js/towers.js) tiene que usar esta
 * integración EXACTA: con la aproximación lineal (y + v·T) el blanco
 * "cruzaba" el borde durante el vuelo de la bala, la predicción se
 * quedaba CORTA y las torres fallaban el tiro (el enemigo se escapaba
 * → el balance se movía).
 *
 * @param {number} y Y actual
 * @param {number} vel velocidad vertical nominal (px/s)
 * @param {number} T segundos a proyectar
 * @returns {number} Y dentro de T segundos
 */
export function fallYAfter(y, vel, T) {
  if (!Number.isFinite(y) || !Number.isFinite(vel) || !Number.isFinite(T) || T <= 0) return y;
  if (vel <= 0) return y;
  const scale = y < LAYOUT.bandY ? LAYOUT.fallScale : 1;
  if (scale === 1) return y + vel * T;
  // ¿Cruza el borde del "bajo fuego" dentro de T?
  const t1 = (LAYOUT.bandY - y) / (vel * scale);
  if (t1 >= T) return y + vel * scale * T;
  return LAYOUT.bandY + vel * (T - t1);
}

/**
 * FASE 58 — Aplica un alto LÓGICO nuevo: mueve todo lo anclado abajo y
 * recalcula el factor de compensación de la caída.
 *
 * @param {number} h alto lógico del canvas (540×h)
 * @returns {number} el alto aplicado (acotado a [minH, maxH])
 */
export function setLogicalHeight(h) {
  const raw = Math.round(Number(h));
  const nh = Math.max(LAYOUT.minH, Math.min(LAYOUT.maxH, Number.isFinite(raw) ? raw : LAYOUT.baseH));
  const d = nh - LAYOUT.baseH;

  LAYOUT.h = nh;
  LAYOUT.delta = d;
  CONFIG.CANVAS_H = nh;
  CONFIG.TOWER_Y = BASE_TOWER_Y + d;
  SCENE.PLATFORM_Y = BASE_PLATFORM_Y + d;
  SCENE.BASE_ARC_Y = BASE_BASE_ARC_Y + d;

  // Borde superior del "bajo fuego" (solo las torres de radio limitado).
  LAYOUT.bandY = CONFIG.TOWER_Y - MAX_TOWER_REACH;
  // Compensación: el tramo libre (spawn → bandY) se recorre en el MISMO
  // tiempo que antes, aunque ahora sea más largo.
  const freeNow = LAYOUT.bandY - SPAWN_Y;
  const freeBase = (BASE_TOWER_Y - MAX_TOWER_REACH) - SPAWN_Y;
  LAYOUT.fallScale = freeBase > 0 ? freeNow / freeBase : 1;

  return nh;
}

/**
 * FASE 58 — Alto lógico que corresponde a un marco de `cssW × cssH`.
 *
 * El ancho lógico es FIJO (540): la escena es de diseño fijo, así que la
 * altura lógica sale de la proporción real del marco. Si el marco es (casi)
 * 54:88 se usa el layout de referencia EXACTO (escritorio: cero cambio).
 *
 * @param {number} cssW ancho CSS del marco (px)
 * @param {number} cssH alto CSS del marco (px)
 * @returns {number} alto lógico (acotado)
 */
export function logicalHeightForFrame(cssW, cssH) {
  const w = Number(cssW), h = Number(cssH);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return LAYOUT.baseH;
  // TRUNCADO (no redondeado): el buffer nunca queda más alto que la
  // proporción real del marco → el mundo no se estira verticalmente
  // (la diferencia con el marco es de ~0,04 %, invisible).
  const raw = Math.floor(CONFIG.CANVAS_W * (h / w));
  // A ±2 px del layout de referencia se usa el de referencia: en un
  // escritorio el marco es 54:88 y el juego tiene que ser IDÉNTICO.
  if (Math.abs(raw - LAYOUT.baseH) <= 2) return LAYOUT.baseH;
  return Math.max(LAYOUT.minH, Math.min(LAYOUT.maxH, raw));
}

// Temas por stage (dev-5, §2.9) + disparadores de escena (v3 3c/7):
// paletas de cielo/planeta/grietas/niebla + feature (corteza propia),
// heat (halo térmico del cielo) y fogMul (densidad de la niebla densa).
// volcanic = del diseño base (dev-1). feature:'rich' reproduce EXACTO.
export const THEMES = {
  volcanic: {
    skyTop: '#1C1F26', skyDeep: '#14161C',
    planetCoreDeep: '#4E2008',
    planetCoreWarm: '#5E2712', planetEdgeBody: '#A8480E',
    planetCore: '#E8641F', planetEdge: '#F7A824', cracks: '#FFDD55',
    glowColor: 'rgba(232, 100, 31, 0.22)', fog: '58, 65, 72', skyline: false,
    feature: 'rich', heat: ['232, 100, 31', '180, 60, 20'], heatA: 1, fogMul: 1,
    nebulaA: 1, spawnGlow: '255, 221, 85',
  },
  volcanic2: { // volcánico oscurecido + cenizas (Stage 2, v3 3c/7)
    skyTop: '#14161B', skyDeep: '#0E1014',
    planetCoreDeep: '#381505',
    planetCoreWarm: '#4A1D0B', planetEdgeBody: '#7E360A',
    planetCore: '#A8440F', planetEdge: '#D07818', cracks: '#FFAA33',
    glowColor: 'rgba(190, 80, 20, 0.18)', fog: '42, 46, 52', skyline: false,
    feature: 'dormant', heat: ['200, 80, 24', '150, 50, 16'], heatA: 0.85, fogMul: 0.9,
    nebulaA: 0.95, spawnGlow: '255, 170, 51',
  },
  graveyard: { // cementerio espacial (Stage 3, v3 3c/7)
    skyTop: '#101318', skyDeep: '#0A0C10',
    planetCoreDeep: '#151C24',
    planetCoreWarm: '#2E3A46', planetEdgeBody: '#46586A',
    planetCore: '#3E4A56', planetEdge: '#5E7080', cracks: '#9FDFFF',
    glowColor: 'rgba(120, 160, 200, 0.14)', fog: '36, 42, 50', skyline: false,
    feature: 'graveyard', heat: ['96, 132, 176', '60, 82, 118'], heatA: 0.8, fogMul: 0.8,
    nebulaA: 1.05, spawnGlow: '159, 223, 255',
  },
  nightcity: { // ciudad nocturna en silueta (Stage 4, v3 3c/7)
    skyTop: '#0D1220', skyDeep: '#090C16',
    planetCoreDeep: '#071627',
    planetCoreWarm: '#12283F', planetEdgeBody: '#20415F',
    planetCore: '#1E3A5F', planetEdge: '#35C8FF', cracks: '#7FDFFF',
    glowColor: 'rgba(53, 200, 255, 0.12)', fog: '28, 40, 60', skyline: true,
    feature: 'city', heat: ['72, 128, 210', '44, 76, 148'], heatA: 0.85, fogMul: 0.85,
    nebulaA: 1, spawnGlow: '127, 223, 255',
  },
  core: { // núcleo volcánico rojo (Stage 5, v3 3c/7)
    skyTop: '#22090A', skyDeep: '#160406',
    planetCoreDeep: '#5C0C02',
    planetCoreWarm: '#521007', planetEdgeBody: '#96200A',
    planetCore: '#FF3018', planetEdge: '#FF7733', cracks: '#FFE044',
    glowColor: 'rgba(255, 48, 24, 0.26)', fog: '70, 30, 30', skyline: false,
    feature: 'core', heat: ['224, 60, 22', '150, 32, 12'], heatA: 1.1, fogMul: 1,
    nebulaA: 0.9, spawnGlow: '255, 224, 68',
  },
  night: { // v3 3c/7: fondo GENERAL — cielo azul-negro, estrellas protagonistas
    skyTop: '#0A1330', skyDeep: '#02040E',
    planetCoreDeep: '#0A0F22',
    planetCoreWarm: '#101830', planetEdgeBody: '#1A2440',
    planetCore: '#24355E', planetEdge: '#5E8CFF', cracks: '#9FC0FF',
    glowColor: 'rgba(80, 120, 255, 0.10)', fog: '24, 32, 48', skyline: false,
    feature: 'night', heat: ['74, 106, 224', '40, 60, 160'], heatA: 0.5, fogMul: 0.55,
    nebulaA: 1.15, spawnGlow: '159, 192, 255',
  },
};

// T1 — Nebulosa de fondo: el rango de alpha de las manchas frías que dan
// profundidad a la franja de espacio (donde caen los enemigos).
// El techo es BAJO a propósito: la nebulosa tiene que leerse como BRUMA,
// nunca como una mancha de color que compita con el planeta o con el neón
// de las torretas (dirección de arte: silueta oscura + acento neón).
export const NEBULA_ALPHA_MIN = 0.05;
export const NEBULA_ALPHA_MAX = 0.13;

// Estados canónicos de la FSM (§1.3)
export const STATES = [
  'BOOT', 'MENU', 'SELECT_STAGE', 'PLAYING',
  'PAUSED', 'CARD_CHOICE', 'STAGE_CLEAR', 'GAME_OVER',
  'TORRETAS', // v3.5 meta-game: pantalla de mejoras permanentes
  // fase 69: el PROTOCOLO de asedio (heat). NO es estado de pausa: se entra
  // desde el menú/selector, cuando el juego ya está fuera de PLAYING.
  'PROTOCOLO',
  // fase 70: la SALA DE RÉCORDS (los cinco modos). Tampoco es pausa: es una
  // pantalla de consulta que se abre desde el menú/selector.
  'RECORDS',
  // fase 72: CRÉDITOS Y LICENCIAS — la pantalla que cumple, DENTRO de la
  // obra distribuida, la atribución CC BY 3.0 del icono del Ultimate
  // (Lorc / game-icons.net, recoloreado) y que muestra el texto de OFL 1.1,
  // que la licencia exige que viaje con las fuentes (docs/ no se publica).
  // Tampoco es pausa: se entra desde el menú, con el juego ya fuera de
  // PLAYING, igual que PROTOCOLO y RECORDS.
  'CREDITS',
];
const PAUSE_STATES = ['PAUSED', 'CARD_CHOICE'];

// Helpers puros
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const rand = (min = 0, max = 1) => min + Math.random() * (max - min);

// ------------------------------------------------------------
// EventBus — comunicación desacoplada (§1.1)
// ------------------------------------------------------------
class EventBus {
  constructor() { this._map = new Map(); }

  on(evt, cb) {
    if (!this._map.has(evt)) this._map.set(evt, new Set());
    this._map.get(evt).add(cb);
    return cb; // para off() cómodo
  }

  off(evt, cb) {
    const set = this._map.get(evt);
    if (set) set.delete(cb);
  }

  emit(evt, payload = null) {
    const set = this._map.get(evt);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[engine] handler error en "${evt}":`, err);
      }
    }
  }
}

// ------------------------------------------------------------
// Stars — estrellas tenues en la franja de juego (y 330–745).
// El planeta volcánico ocupa el tramo superior; las estrellas
// solo salpican el espacio oscuro intermedio (§1.4).
// v3 3c/7: modo 'night' para el fondo GENERAL (menú/selector/fin
// de partida): todo el cielo, MÁS estrellas, tamaños variables,
// tintes cálidos/fríos, parpadeo sutil y banda de vía láctea.
// ------------------------------------------------------------
class Stars {
  constructor() {
    this.mode = 'game';
    this.yMin = 330;
    this.yMax = 745;
    this.layers = [];
    // La vía láctea se genera LAZY al primer modo night: en modo game el
    // consumo de Math.random() queda IDÉNTICO al histórico (control Stage 1).
    this.milky = [];
    this._build('game');
  }

  _conf(mode) {
    // FASE 58: la franja de estrellas acompaña al campo de juego (que
    // crece con el alto lógico): el tope inferior se ancla a la
    // plataforma (PLATFORM_Y - 65 en el layout de referencia = 745).
    const yMax = mode === 'night' ? SCENE.PLATFORM_Y - 60 : SCENE.PLATFORM_Y - 65;
    return mode === 'night'
      ? { counts: [150, 60], speeds: [2.5, 6], sizes: [1.1, 2.0], alphas: [0.42, 0.75], yMin: 0, yMax, tw: 2.6, twBase: 0.7, twAmp: 0.3 }
      : { counts: [60, 25], speeds: [3, 8], sizes: [0.9, 1.5], alphas: [0.22, 0.45], yMin: 330, yMax, tw: 2, twBase: 0.75, twAmp: 0.25 };
  }

  _build(mode) {
    const c = this._conf(mode);
    this.yMin = c.yMin;
    this.yMax = c.yMax;
    this.layers = c.counts.map((n, i) => ({
      speed: c.speeds[i],
      stars: Array.from({ length: n }, () => ({
        x: rand(0, CONFIG.CANVAS_W),
        y: rand(c.yMin, c.yMax),
        size: c.sizes[i] * rand(0.7, 1.3),
        alpha: c.alphas[i] * rand(0.6, 1),
        twinkle: rand(0, Math.PI * 2),
        // En fondo night una parte de las estrellas es de color (blue/warm)
        color: mode === 'night' && Math.random() < 0.22
          ? (Math.random() < 0.6 ? '#BFD6FF' : '#FFE6C2')
          : '#FFFFFF',
      })),
    }));
    this._tw = c.tw;
    this._twBase = c.twBase;
    this._twAmp = c.twAmp;
  }

  /** Cambia de modo solo si hace falta (game ↔ night). */
  setMode(mode) {
    if (mode !== this.mode) {
      this.mode = mode;
      if (mode === 'night' && !this.milky.length) this.milky = this._buildMilky();
      this._build(mode);
    }
  }

  /**
   * FASE 58 — Reconstruye las estrellas con la geometría actual (el alto
   * lógico cambió): la franja se estira con el campo de juego.
   */
  rebuild() {
    const wasMilky = this.milky.length > 0;
    if (wasMilky) this.milky = this._buildMilky();
    this._build(this.mode);
  }

  /** Banda diagonal difusa (vía láctea) — blobs pre-generados, 0 aloc por frame. */
  _buildMilky() {
    const blobs = [];
    // FASE 58: la banda se reparte por la ALTURA del canvas (el cielo
    // crece con el marco): 90..610 en el layout de referencia (880).
    const k = CONFIG.CANVAS_H / 880;
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      blobs.push({
        x: 40 + t * (CONFIG.CANVAS_W - 80) + rand(-24, 24),
        y: (90 + t * 520) * k + rand(-28, 28),
        rx: rand(46, 110),
        ry: rand(7, 16),
        a: rand(0.05, 0.13),
      });
    }
    return blobs;
  }

  update(dtReal) {
    // Corre con dt REAL: la pausa congela el juego, no la escena.
    for (const layer of this.layers) {
      for (const s of layer.stars) {
        s.y += layer.speed * dtReal;
        s.twinkle += dtReal * this._tw;
        if (s.y > this.yMax) {
          s.y = this.yMin;
          s.x = rand(0, CONFIG.CANVAS_W);
        }
      }
    }
  }

  draw(ctx) {
    if (this.mode === 'night') {
      // Vía láctea difusa detrás de las estrellas (modo aditivo)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const b of this.milky) {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.rx);
        g.addColorStop(0, `rgba(148, 176, 255, ${b.a})`);
        g.addColorStop(1, 'rgba(148, 176, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.rx, b.ry, -0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const layer of this.layers) {
      for (const s of layer.stars) {
        const tw = this._twBase + this._twAmp * Math.sin(s.twinkle);
        ctx.globalAlpha = s.alpha * tw;
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------
// Engine
// ------------------------------------------------------------
export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // DPR: render nítido (§1.4) — canvas.width = 540 * dpr + ctx.scale
    this.dpr = 1;
    if (typeof window !== 'undefined' && window.devicePixelRatio) {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    }
    // FASE 58 — el alto lógico se deriva del MARCO real antes de construir
    // nada (los caches offscreen y el buffer nacen con el alto correcto).
    this._applyFrameLayout();
    canvas.width = CONFIG.CANVAS_W * this.dpr;
    canvas.height = CONFIG.CANVAS_H * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);

    // dev-7 fase 28 (accesibilidad): `prefers-reduced-motion` NO lo
    // cubría nada, porque todo el juego es canvas y el CSS sólo puede
    // anular animaciones de CSS. Ahora el motor lo consulta y reduce la
    // sacudida de pantalla (un 75 % menos) y los destellos de pantalla
    // completa. Un jugador con fotosensibilidad lo nota de verdad.
    this.reducedMotion = false;
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (_err) { /* matchMedia no disponible */ }
    }

    // dev-7 fase 19 (pedido del usuario: "anda lento en mobile/PC vieja,
    // aun en 2x"): _drawSky()/_drawPlanet() crean ~15 gradientes desde
    // cero en CADA frame para un fondo que cambia muy poco (solo un par
    // de pulsos sinusoidales lentos). Se cachean en 2 canvas offscreen y
    // se refrescan cada pocos frames en vez de 60 veces por segundo — ver
    // _refreshBgCacheIfNeeded() más abajo.
    this._bgFrameSkip = 0;
    this._bgDirty = true;
    this._skyCache = this._makeOffscreen();
    this._planetCache = this._makeOffscreen();
    // fase 62: el deck (plataforma) es estático salvo el layout, así que va
    // en su PROPIO cache — más chico que los del fondo (solo la franja de
    // la plataforma) y redibujado únicamente cuando el layout cambia.
    this._deckCache = this._makeOffscreen(this._deckHeight());
    this._deckDirty = true;
    // fase 75: bahías activas del deck. Arsenal puede reducir la Fortress
    // a 4 slots; el dibujo debe seguir ese número, no las 5 de CONFIG.
    this._deckSlots = CONFIG.SLOTS.length;
    // dev-7 fase 28: 3er cache para la niebla (8 gradientes radiales por
    // frame = 3.34 Mpx de relleno alpha, el mayor coste de fill-rate).
    this._fogCache = this._makeOffscreen();
    this._fogFrameSkip = 0;
    this._fogDirty = true;
    // dev-7 fase 19: tope de partículas simultáneas — mutable en runtime
    // vía setParticleCap() (quality.js decide el valor; engine.js no lo
    // importa a propósito, sigue sin ninguna dependencia — lo aplica
    // quien construye el Engine, ver main.js).
    this._particleCap = CONFIG.MAX_PARTICLES;

    this.bus = new EventBus();
    this.state = 'BOOT';
    this.timeScale = 1;
    this._savedSpeed = 1; // velocidad elegida, se restaura al salir de pausa
    this.running = false;

    // Reloj del loop + tiempo real acumulado (flicker/niebla)
    this._last = 0;
    this._t = 0;
    this._loopBound = this.loop.bind(this);

    // Entidades genéricas (torres/enemigos desde dev-2/dev-3) y
    // efectos transitorios con update(dt)/draw(ctx,t)/life propios.
    /** @type {Array} */
    this.entities = [];
    /** @type {Array} */
    this.effects = [];

    /**
     * Hook por frame para la capa de aplicación (main.js): se llama
     * con (dt escalado, dtReal) tras el update del motor.
     */
    this.onFrame = null;

    /**
     * Hook de render para la capa de aplicación (main.js): se llama con
     * (ctx) tras la escena (plataforma/niebla) y ANTES de las entidades,
     * para que Fortress (torres/arco/cúpula) quede bajo los proyectiles.
     */
    this.onRenderExtra = null;

    // Juice (presupuesto §4): pool con reciclado FIFO
    /** @type {Array} */
    this.particles = [];
    /** @type {Array} */
    this.floats = [];
    this.shakePx = 0;
    this.shakeMsLeft = 0;

    // Escena volcánica: grietas pre-generadas (NO regenerar por frame),
    // manchas de roca, bandas de niebla y temporizador de llamaradas.
    // Estética v3.1 delta A (referencia Play Store #3): POCA red, GRUESA —
    // fallas tectónicas anchas sobre corteza oscura dominante (la luz cubre
    // <30 % del disco). Grietas = LA fuente de luz del planeta.
    this.cracks = this._generateCracks(15);
    // Costra volcánica: placas oscuras grandes + grano fino (relieve).
    this._rockSpots = [];
    for (let i = 0; i < 18; i++) {
      this._rockSpots.push({
        x: CONFIG.CANVAS_W / 2 + rand(-255, 255),
        y: rand(15, 285),
        r: rand(65, 165),
      });
    }
    this._rockGrain = [];
    for (let i = 0; i < 22; i++) {
      this._rockGrain.push({
        x: CONFIG.CANVAS_W / 2 + rand(-255, 255),
        y: rand(10, 290),
        r: rand(6, 18),
      });
    }
    // Lagos de magma (estética v3.1 delta A): pocos pozos irregulares donde
    // la falla se abre — no solo líneas (referencia: charcos de lava).
    this._lavaLakes = [];
    for (let i = 0; i < 9; i++) {
      const lx = rand(60, 480);
      const ly = rand(40, 270);
      const lobes = Array.from({ length: 4 }, () => ({
        dx: rand(-20, 20), dy: rand(-14, 14), r: rand(9, 17),
      }));
      const nearCrack = Math.min(...this.cracks.map((c) => {
        let best = Infinity;
        for (const p of c.pts) best = Math.min(best, Math.hypot(p.x - lx, p.y - ly));
        return best;
      }));
      if (nearCrack < 58 && this._lavaLakes.length < 10) {
        this._lavaLakes.push({ x: lx, y: ly, lobes });
      }
    }
    // Venas de lava blanco-cálidas + puntos incandescentes (dev-6): el
    // planeta agrietado del diseño base tiene llamaradas blancas en el borde.
    this.hotVeins = this._generateCracks(9);
    this.hotVeins.forEach((v) => { v.width = rand(1.5, 2.5); });
    // Flujos de LAVA OSCURA entre placas (estética v3.1): cintas gruesas
    // con núcleo incandescente que late — superficie volcánica RICA.
    this._lavaFlows = [];
    for (let i = 0; i < 4; i++) {
      const flow = this._generateCracks(1)[0];
      this._lavaFlows.push({ pts: flow.pts, w: rand(7, 13), speed: rand(0.8, 1.6), phase: rand(0, Math.PI * 2) });
    }
    this._hotSpots = [];
    for (let i = 0; i < 6; i++) {
      this._hotSpots.push({
        x: 70 + i * 80 + rand(-14, 14),
        y: rand(170, 295),
        r: rand(10, 19),
      });
    }
    this.fogBands = this._buildFogBands();
    this._flareT = rand(1.5, 3.5);
    // Estética v3.1: brasas ascendentes MÁS VISIBLES (referencia: chispas
    // cálidas continuas sobre el volcán).
    this._emberT = rand(0.05, 0.18);

    this.stars = new Stars();

    // Tema visual activo (dev-5): volcanic por defecto (§1.4).
    this.theme = THEMES.volcanic;

    // Skyline de la ciudad nocturna (Stage 4): siluetas pre-generadas.
    this._skyline = this._generateSkyline();

    // v3 3c/7 — decoración distintiva por THEME (pre-generada 1 vez):
    // · graveyard: cráteres muertos + lápidas en el limbo + luna pálida
    //   + velos de nebulosa (cementerio espacial).
    // · dormant: columnas de ceniza en los BORDES del disco (el centro
    //   queda tapado por el planeta).
    // · city: retícula de luces urbanas en el limbo (X/Y del disco).
    // · core: turbina radial del reactor + chispas orbitando el limbo.
    this._gvCraters = Array.from({ length: 12 }, () => ({
      x: rand(60, 480), y: rand(30, 260), r: rand(8, 26),
    }));
    this._gvTombs = Array.from({ length: 7 }, () => ({
      x: rand(40, 500), y: rand(238, 290), w: rand(10, 16), h: rand(14, 30),
    }));
    this._gvMoon = { x: rand(60, 110), y: rand(110, 160), r: rand(38, 48) };
    this._gvNebula = Array.from({ length: 3 }, () => ({
      x: rand(120, 460), y: rand(60, 220), r: rand(70, 130),
      a: rand(0.08, 0.15), col: '96, 118, 178',
    }));
    this._ashPlumes = Array.from({ length: 4 }, () => ({
      x: Math.random() < 0.5 ? rand(12, 70) : rand(470, 528),
      w: rand(36, 90), h: rand(90, 170), ph: rand(0, Math.PI * 2), sp: rand(0.25, 0.5),
    }));
    this._cityLights = Array.from({ length: 60 }, () => ({
      x: rand(30, 510), y: rand(150, 285), s: rand(1, 2.6),
      ph: rand(0, Math.PI * 2), warm: Math.random() < 0.7,
    }));
    this._coreTurbine = Array.from({ length: 10 }, () => ({
      ang: rand(0, Math.PI * 2), len: rand(150, 390), w: rand(4, 8), ph: rand(0, Math.PI * 2),
    }));
    this._coreSparks = [{ ang: 0.5 }, { ang: 2.1 }];

    // T1 — Nebulosa de fondo: 3 manchas frías (azul-violeta / cian) MUY
    // suaves en la mitad inferior del cielo, la franja que se leía como
    // negro puro. Descendradas del centro (x=270) a propósito: alineadas
    // formarían un eje con el planeta y delatarían la composición.
    // `a` (alpha base) vive dentro de NEBULA_ALPHA_MIN..NEBULA_ALPHA_MAX y
    // `period` (s) es el ciclo del pulso lentísimo: 20-40 s, imperceptible.
    this._nebula = this._buildNebula();

    this._bindInput();
    this._bindResize();
  }

  // ------------------------------------------------------------
  // FASE 58 — LAYOUT DINÁMICO (el alto lógico sale del marco)
  // ------------------------------------------------------------

  /**
   * Mide el marco (el canvas) y devuelve el alto lógico que le
   * corresponde. Sin DOM (tests en Node) devuelve el de referencia.
   *
   * @returns {number} alto lógico
   */
  _frameLogicalHeight() {
    const rect = this.canvas?.getBoundingClientRect?.();
    const w = rect?.width ?? 0;
    const h = rect?.height ?? 0;
    return logicalHeightForFrame(w, h);
  }

  /**
   * Aplica el layout del marco actual (alto lógico + geometría).
   * Se llama en el constructor (antes de construir los buffers) y en
   * cada relayout.
   */
  _applyFrameLayout() {
    const nh = this._frameLogicalHeight();
    if (nh !== LAYOUT.h) setLogicalHeight(nh);
    return LAYOUT.h;
  }

  /**
   * FASE 58 — Re-mide el marco y, si el alto lógico cambió, redimensiona
   * el buffer del canvas y los 3 caches offscreen, recoloca la decoración
   * (estrellas / niebla / nebulosa) y fuerza el redibujado del fondo.
   *
   * @returns {boolean} true si el layout cambió
   */
  relayout() {
    const nh = this._frameLogicalHeight();
    if (nh === LAYOUT.h) return false;
    setLogicalHeight(nh);
    this._resizeBuffers();
    this._rebuildDecor();
    this.emit('layout:changed', { h: LAYOUT.h, delta: LAYOUT.delta });
    return true;
  }

  /**
   * fase 75 — Ajusta cuántas bahías dibuja el deck (Arsenal deja 4).
   * El estado de la Fortress es la fuente; el engine solo cachea el
   * número para no recorrer CONFIG.SLOTS completo.
   * @param {number} n
   * @returns {boolean} true si cambió
   */
  setDeckSlotCount(n) {
    const raw = Math.trunc(Number(n));
    const count = Math.max(1, Math.min(CONFIG.SLOTS.length,
      Number.isFinite(raw) ? raw : CONFIG.SLOTS.length));
    if (count === this._deckSlots) return false;
    this._deckSlots = count;
    this._deckDirty = true;
    return true;
  }

  /**
   * Redimensiona el buffer del canvas y los caches offscreen al alto
   * lógico actual. OJO: cambiar width/height de un canvas RESETEA su
   * contexto (transformación y ajustes de calidad): hay que reaplicar
   * el scale del DPR y el nivel de calidad.
   */
  _resizeBuffers() {
    const w = CONFIG.CANVAS_W;
    const h = CONFIG.CANVAS_H;
    const dpr = this.dpr;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.scale(dpr, dpr);
    for (const c of [this._skyCache, this._planetCache, this._fogCache]) {
      if (!c) continue;
      c.canvas.width = w * dpr;
      c.canvas.height = h * dpr;
      c.ctx.scale(dpr, dpr);
    }
    this._resizeDeckCache();
    // La calidad (shadowBlur) se pierde con el reset: se reaplica.
    if (this._qualityApply) this.applyQualityTo(this._qualityApply, this._qualityId);
    this._bgDirty = true;
    this._fogDirty = true;
    this._deckDirty = true;
  }

  /**
   * Recoloca la decoración que depende de la geometría vertical: las
   * bandas de niebla (abrazan la plataforma) y la nebulosa (se reparte
   * por la altura del cielo).
   */
  _rebuildDecor() {
    this.fogBands = this._buildFogBands();
    this._nebula = this._buildNebula();
    this.stars?.rebuild?.();
  }

  /**
   * Bandas de niebla: abrazan la plataforma (offsets FIJOS respecto de
   * PLATFORM_Y) → bajan con ella cuando crece el alto lógico.
   */
  _buildFogBands() {
    const off = SCENE.PLATFORM_Y - BASE_PLATFORM_Y;
    const bands = [
      // v3 3h/7: bandas re-escaladas a la plataforma baja (760→810, +50)
      { y: 765 + off, rx: 340, ry: 34, a: 0.10, sp: 0.10, ph: 0.0 },
      { y: 825 + off, rx: 380, ry: 40, a: 0.13, sp: 0.13, ph: 2.1 },
      { y: 895 + off, rx: 420, ry: 46, a: 0.16, sp: 0.08, ph: 4.2 },
    ];
    // Estética v3 4/7 (diseño base): niebla gris EXTRA que abraza la base de
    // la plataforma — el diseño base muestra bruma densa a los pies de las
    // torres, separando la plataforma del espacio oscuro.
    bands.push({ y: 850 + off, rx: 300, ry: 30, a: 0.14, sp: 0.11, ph: 1.2 });
    bands.push({ y: 785 + off, rx: 260, ry: 24, a: 0.09, sp: 0.16, ph: 5.4 });
    // Estética v3.1 delta C: velo extra sobre el borde de la plataforma
    // y colchón ancho bajo la base — la niebla densa #3A4148 de la
    // referencia envuelve el punto de impacto de los enemigos.
    bands.push({ y: 798 + off, rx: 380, ry: 30, a: 0.20, sp: 0.09, ph: 3.3 });
    bands.push({ y: 898 + off, rx: 520, ry: 52, a: 0.28, sp: 0.05, ph: 6.1 });
    return bands;
  }

  /**
   * Nebulosa de fondo: 3 manchas frías repartidas por la ALTURA del
   * cielo (que crece con el marco) → se escalan con el alto lógico.
   */
  _buildNebula() {
    const k = CONFIG.CANVAS_H / BASE_CANVAS_H;
    return [
      { x: rand(95, 145), y: rand(385, 445) * k, r: rand(280, 320), a: rand(0.08, 0.12), col: '82, 92, 196', phase: rand(0, 6.28), period: rand(26, 30) },
      { x: rand(395, 445), y: rand(515, 575) * k, r: rand(330, 420), a: rand(0.07, 0.11), col: '58, 132, 186', phase: rand(0, 6.28), period: rand(30, 34) },
      { x: rand(190, 240), y: rand(655, 715) * k, r: rand(262, 300), a: rand(0.06, 0.10), col: '108, 84, 186', phase: rand(0, 6.28), period: rand(34, 40) },
    ];
  }

  /**
   * FASE 58 — El marco puede cambiar de proporción (rotación, barra del
   * navegador en móvil, redimensionar la ventana): el motor se re-mide
   * solo. Se marca una bandera y el relayout se hace en el siguiente
   * frame (en un 'resize' pueden dispararse decenas de eventos).
   */
  _bindResize() {
    if (typeof window === 'undefined') return;
    this._needsRelayout = false;
    const onResize = () => { this._needsRelayout = true; };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }

  /**
   * dev-7 fase 54 — EL TINTE DE ESCENA del tema de UI.
   *
   * A diferencia de `setTheme()` (la paleta del STAGE, que define la
   * identidad del mundo: volcanico, cementerio, ciudad, nucleo), esto es
   * el tinte que el jugador elige en el menu: una capa de color que se
   * mezcla sobre el fondo ya dibujado.
   *
   * El modo `soft-light` conserva la luminancia (las grietas siguen
   * brillando) y desplaza solo el tono: la identidad del stage se mantiene
   * y las ENTIDADES no se tiñen (se pintan despues de esta capa, asi que
   * sus colores semanticos quedan intactos).
   *
   * @param {?string} color color CSS del tinte (null = sin tinte)
   * @param {number} alpha fuerza 0..1 (0 = sin tinte)
   */
  setSceneTint(color, alpha = 0) {
    const a = Number(alpha);
    this._sceneTint = (color && Number.isFinite(a) && a > 0)
      ? { color, alpha: Math.min(1, a) }
      : null;
  }

  /** Cambia la paleta del stage (main.js en startStage, §2.9). */
  setTheme(name) {
    if (THEMES[name]) this.theme = THEMES[name];
    this._bgDirty = true; // dev-7 fase 19: fuerza redibujar el cache YA, sin esperar el próximo ciclo de refresh (evita 1 frame de fondo viejo)
    this._fogDirty = true; // dev-7 fase 28: la niebla tiene su propio cache
  }

  /**
   * Tope de partículas simultáneas (dev-7 fase 19): lo decide quality.js
   * desde fuera de engine.js, que sigue sin ninguna dependencia (el
   * shadowBlur lo aplica quien llama directamente sobre `this.ctx`).
   * Cambia en caliente, sin reiniciar la partida: al bajar el tope se
   * TRUNCAN las partículas vivas — si no, quedan cientos vivas con un
   * tope de 150 y la calidad "Baja" no se respeta hasta la próxima run.
   */
  setParticleCap(n) {
    this._particleCap = Math.max(0, n | 0);
    if (this.particles.length > this._particleCap) this.particles.length = this._particleCap;
  }

  /** Canvas offscreen del tamaño real (con DPR) para cachear fondo (fase 19).
   *  null fuera de un navegador (tests Node) — el caller cae a dibujar directo. */
  /**
   * Canvas offscreen para los caches. `alto` permite caches PARCIALES (el
   * deck solo ocupa la franja de la plataforma, no los 880 px de alto).
   */
  _makeOffscreen(alto = CONFIG.CANVAS_H) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = CONFIG.CANVAS_W * this.dpr;
    c.height = alto * this.dpr;
    const cctx = c.getContext('2d');
    cctx.scale(this.dpr, this.dpr);
    return { canvas: c, ctx: cctx, h: alto };
  }

  /**
   * Aplica un nivel de calidad gráfica a TODOS los contexts del engine
   * (dev-7 fase 28).
   *
   * Antes sólo se aplicaba a `this.ctx` (el visible), y los dos caches
   * offscreen del fondo seguían con su `shadowBlur` nativo: 34 operaciones
   * de blur por software (hasta 22 px) cada 3 frames, en calidad "baja" —
   * justo lo que la calidad promete apagar.
   *
   * `applyQuality` es la función de js/quality.js; se recibe por parámetro
   * para NO crear una dependencia: engine.js no importa quality.js (regla
   * de dependencias de docs/DESIGN.md §1.1 — engine.js sólo importa lo suyo).
   */
  applyQualityTo(applyQuality, qualityId) {
    if (typeof applyQuality !== 'function') return;
    applyQuality(this.ctx, qualityId);
    applyQuality(this._skyCache?.ctx, qualityId);
    applyQuality(this._planetCache?.ctx, qualityId);
    // dev-7 fase 28: el 3er cache (niebla) también es un contexto 2D
    // real — sin esto seguía con su shadowBlur nativo en calidad "baja".
    applyQuality(this._fogCache?.ctx, qualityId);
    // fase 62: el cache del deck, por el mismo motivo.
    applyQuality(this._deckCache?.ctx, qualityId);
    this._qualityId = qualityId;
    // FASE 58: se guarda la función para poder reaplicarla después de
    // redimensionar el canvas (el resize resetea el contexto).
    this._qualityApply = applyQuality;
  }

  /** Redibuja sky+planeta en sus cachés cada BG_REFRESH_EVERY frames (o
   *  ya, si algo los invalidó — cambio de tema). El pulso sinusoidal de
   *  fondo queda a ~20fps en vez de 60 — imperceptible (ciclos de varios
   *  segundos), pero corta ~2/3 del costo de gradientes de esta parte. */
  _refreshBgCacheIfNeeded() {
    if (!this._skyCache || !this._planetCache) return;
    const BG_REFRESH_EVERY = 3;
    this._bgFrameSkip = (this._bgFrameSkip + 1) % BG_REFRESH_EVERY;
    if (!this._bgDirty && this._bgFrameSkip !== 0) return;
    this._bgDirty = false;
    const sctx = this._skyCache.ctx;
    sctx.clearRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
    this._drawSky(sctx);
    const pctx = this._planetCache.ctx;
    pctx.clearRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
    if ((this.theme?.feature ?? 'rich') !== 'night') this._drawPlanet(pctx);
  }

  /** Blit del cielo cacheado (dispara el refresh compartido con el planeta,
   *  ver _refreshBgCacheIfNeeded — se llama antes en el orden de render()). */
  _drawSkyCached(ctx) {
    this._refreshBgCacheIfNeeded();
    if (this._skyCache) ctx.drawImage(this._skyCache.canvas, 0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
    else this._drawSky(ctx); // sin document (Node): dibuja directo, sin cache
  }

  /** Blit del planeta cacheado (el refresh ya lo disparó _drawSkyCached). */
  _drawPlanetCached(ctx) {
    if (this._planetCache) ctx.drawImage(this._planetCache.canvas, 0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
    else this._drawPlanet(ctx);
  }

  // ---------- Ciclo de vida ----------
  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    requestAnimationFrame(this._loopBound);
  }

  stop() {
    this.running = false; // el próximo frame corta la cadena de rAF
  }

  loop(ts) {
    if (!this.running) return;
    const dtRaw = (ts - this._last) / 1000;
    this._last = ts;
    const dtReal = Math.min(dtRaw, 0.05);           // clamp 50 ms (§1.2)
    const dt = dtReal * this.timeScale;             // timeScale ∈ {0, 1, 1.5, 2}
    this._t += dtReal;

    // dev-7 fase 28: el loop NO puede morir por una excepción. Antes,
    // `requestAnimationFrame` era la ÚLTIMA instrucción: si update() o
    // render() lanzaba (un draw() de torre con un campo faltante, un nodo
    // del HUD en null, un enemy con datos corruptos), la cadena de rAF no
    // se reprogramaba NUNCA MÁS: el juego se congelaba en el último frame
    // y había que recargar la página, perdiendo la partida.
    // Verificado: con update() lanzando, `_t` se quedaba congelado para
    // siempre mientras `running` seguía en true.
    // `EventBus.emit` ya protegía a los handlers de eventos; aquí falta
    // la protección del frame completo.
    try {
      this.update(dt, dtReal);
      this.render();
    } catch (err) {
      console.error('[engine] error en el frame:', err);
      if (!this._frameErrorShown) {
        this._frameErrorShown = true;
        this.onFatalError?.(err);
      }
    } finally {
      // La cadena de rAF se reprograma SIEMPRE, pase lo que pase.
      requestAnimationFrame(this._loopBound);
    }
  }

  /**
   * Orden de update (§1.2): waveManager → enemies → towers → fortress →
   * proyectiles → colisiones → partículas/floats/efectos. En dev-1 solo
   * hay escena + juice; los subsistemas se enchufan en dev-2+.
   */
  update(dt, dtReal) {
    // FASE 58 — si el marco cambió (resize / rotación), se re-mide y se
    // redimensiona el buffer antes de dibujar nada.
    if (this._needsRelayout) {
      this._needsRelayout = false;
      this.relayout();
    }
    this.stars.update(dtReal);
    this._updateFlares(dtReal);
    this._updateEmbers(dtReal);

    if (dt > 0) {
      for (const e of this.entities) e.update(dt);
      // Entidades muertas (dead=true) se reciclan — mismo contrato que
      // los efectos; lo usan proyectiles (dev-2) y enemigos (dev-3).
      for (let i = this.entities.length - 1; i >= 0; i--) {
        if (this.entities[i].dead) this.entities.splice(i, 1);
      }
      this._updateEffects(dt);
      this._updateParticles(dt);
    }
    // Shake y animaciones DOM siguen a dt real (§1.2)
    this._updateShake(dtReal);

    // Capa de aplicación (Game): HUD sin acoplar engine→main
    if (this.onFrame) this.onFrame(dt, dtReal);
  }

  // ---------- FSM ----------
  setState(next) {
    if (!STATES.includes(next)) throw new Error(`Estado desconocido: ${next}`);
    if (next === this.state) return;
    const prev = this.state;
    this.state = next;
    // Regla §1.2: PAUSED/CARD_CHOICE → timeScale 0; al volver a PLAYING
    // se restaura la velocidad elegida (x1/x1.5/x2). El freeze usa
    // setTimeScale(0) (x=0 no dispara el guarda de pausa) y la restauración
    // usa la velocidad guardada, no la del estado anterior.
    if (PAUSE_STATES.includes(next)) {
      if (this.timeScale > 0) this._savedSpeed = this.timeScale;
      this.setTimeScale(0);
    } else if (PAUSE_STATES.includes(prev) && next === 'PLAYING') {
      this.setTimeScale(this.resumeSpeed);
    }
    this.emit('state:changed', { prev, next });
  }

  /**
   * Cambia la velocidad de juego (x1 / x1.5 / x2).
   * En los estados de pausa (PAUSED/CARD_CHOICE) NO reanuda la simulación:
   * solo guarda la velocidad elegida para cuando se vuelva a PLAYING
   * (§1.2) — el mundo sigue congelado con timeScale 0. Sin este guarda,
   * la tecla [1] en pausa dejaba el juego corriendo con score/XP vivos.
   */
  setTimeScale(x) {
    if (x > 0 && PAUSE_STATES.includes(this.state)) {
      this._savedSpeed = x; // velocidad de reanudación (no descongela)
      this.emit('timescale:changed', this.timeScale);
      return;
    }
    this.timeScale = x;
    if (x > 0) this._savedSpeed = x; // velocidad elegida (cambiable en pausa vía HUD)
    this.emit('timescale:changed', x);
  }

  /** Velocidad con la que se reanudará la partida (x1 / x1.5 / x2). */
  get resumeSpeed() { return this._savedSpeed || 1; }

  /** Cicla velocidad x1 → x1.5 → x2 → x1 (botón HUD / teclas 1-2-3). */
  cycleSpeed() {
    // Con el mundo congelado (pausa) el ciclo sigue sobre la velocidad
    // GUARDADA, no sobre 0 (si no, el botón volvería siempre a x1).
    const cur = this.timeScale > 0 ? this.timeScale : this.resumeSpeed;
    const next = cur === 1 ? 1.5 : cur === 1.5 ? 2 : 1;
    this.setTimeScale(next);
    return next;
  }

  // ---------- EventBus ----------
  on(evt, cb) { return this.bus.on(evt, cb); }
  off(evt, cb) { this.bus.off(evt, cb); }
  emit(evt, payload) { this.bus.emit(evt, payload); }

  // ---------- Entidades ----------
  /**
   * dev-7 fase 28: tope defensivo de entidades. `particles` tiene tope
   * 400 y `effects` 200, pero `entities` (enemigos + proyectiles) no tenía
   * ninguno: un bug en una carta o un bucle mal acotado en las fases de
   * jefe podía hacer crecer la lista sin límite — y `entities` se recorre
   * entero en update() y en render() cada frame.
   * Medido: el máximo real es 41 (stage 50), así que 300 es holgado.
   */
  addEntity(e) {
    if (this.entities.length >= 300) this.entities.shift();
    this.entities.push(e);
  }
  removeEntity(e) {
    const i = this.entities.indexOf(e);
    if (i >= 0) this.entities.splice(i, 1);
  }

  // ---------- Efectos transitorios ----------
  /** fx: {update(dt)?, draw(ctx,t)?, life, age, dead} */
  addEffect(fx) {
    if (fx.age === undefined) fx.age = 0;
    if (!fx.life) fx.life = 0.2;
    // dev-7 fase 4: tope defensivo (igual que this.particles con
    // MAX_PARTICLES) — en partidas normales nunca se acerca a esto, pero
    // evita un crecimiento sin límite si algo llegara a encadenar efectos
    // más rápido de lo que expiran (ej. muchos multi-kill seguidos).
    if (this.effects.length >= 200) this.effects.shift();
    this.effects.push(fx);
    return fx;
  }

  _updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const f = this.effects[i];
      f.age += dt;
      if (f.update) f.update(dt);
      if (f.dead || f.age >= f.life) this.effects.splice(i, 1);
    }
  }

  // ---------- Juice: partículas / floats / shake ----------
  spawnParticles(x, y, color, n = 8, opts = {}) {
    // dev-7 fase 28: NO construir partículas que van a ser descartadas.
    // Antes, con el tope lleno, se construía la partícula, se metía y el
    // `shift()` expulsaba otra: en una muerte masiva (20 enemigos) se
    // construían 634 partículas y se destruían 234 en el acto — 34 µs/frame
    // medidos en el micro-bench, con el `shift()` O(n) de fondo.
    const room = this._particleCap - this.particles.length;
    if (room <= 0) return;
    const count = Math.min(n, room);
    for (let i = 0; i < count; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(opts.speedMin ?? 40, opts.speedMax ?? 140);
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - (opts.upBias ?? 0),
        life: rand(opts.lifeMin ?? 0.35, opts.lifeMax ?? 0.7),
        age: 0,
        size: rand(opts.sizeMin ?? 1.5, opts.sizeMax ?? 3.5),
        color,
        gravity: opts.gravity ?? 60,
      });
    }
  }

  /**
   * Texto flotante (números de daño, avisos).
   * dev-7 fase 28: `scale` permite que el texto se LEA: antes un "-8" de
   * una espora y un "-120" de un cañonazo tenían exactamente el mismo
   * tamaño (17-22 px fijos), así que el jugador no distinguía un golpe
   * fuerte de uno flojo. Ahora el llamador pasa la magnitud relativa.
   */
  floatText(x, y, text, color = '#FFD24A', scale = 1) {
    if (this.floats.length >= 60) this.floats.shift(); // presupuesto §4
    this.floats.push({ x, y, text, color, age: 0, life: 0.9, scale });
  }

  shake(px, ms = 200) {
    // dev-7 fase 28: con `prefers-reduced-motion` la sacudida se reduce
    // (o se anula). Ver el constructor (this.reducedMotion).
    const k = this.reducedMotion ? 0.25 : 1;
    this.shakePx = Math.min(this.shakePx + px * k, 10); // acumulable máx 10 px
    this.shakeMsLeft = Math.max(this.shakeMsLeft, ms);
  }

  _updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.age += dt;
      f.y -= 30 * dt; // flotan hacia arriba
      if (f.age >= f.life) this.floats.splice(i, 1);
    }
  }

  _updateShake(dtReal) {
    if (this.shakeMsLeft > 0) {
      this.shakeMsLeft -= dtReal * 1000;
      if (this.shakeMsLeft <= 0) this.shakePx = 0;
    } else {
      this.shakePx = 0;
    }
  }

  // ---------- Escena volcánica (§4.2, vectorial + glow) ----------
  _generateCracks(n) {
    const cracks = [];
    for (let i = 0; i < n; i++) {
      const sx = rand(40, 500);
      const sy = rand(20, 230);
      const pts = [{ x: sx, y: sy }];
      // Estética v3.1 delta A: red MULTIDIRECCIONAL orgánica (malla tipo
      // vidrio roto/barro seco de la referencia), ya NO radial al borde.
      let ang = rand(0, Math.PI * 2);
      let len = rand(42, 96);
      const segs = 3 + ((Math.random() * 3) | 0);
      for (let s = 0; s < segs; s++) {
        ang += rand(-0.6, 0.6);
        const last = pts[pts.length - 1];
        pts.push({ x: last.x + Math.cos(ang) * len, y: last.y + Math.sin(ang) * len });
        len *= rand(0.7, 1.0);
      }
      cracks.push({ pts, phase: rand(0, Math.PI * 2), speed: rand(1.5, 3), width: rand(2.2, 4.2) });
    }
    return cracks;
  }

  _updateFlares(dtReal) {
    // Llamaradas blancas ocasionales desde las grietas (§4.2).
    // v3 3c/7: en el fondo general night no hay volcán → sin llamaradas.
    if ((this.theme?.feature ?? 'rich') === 'night') return;
    this._flareT -= dtReal;
    if (this._flareT > 0) return;
    this._flareT = rand(1.5, 3.5);
    const c = this.cracks[(Math.random() * this.cracks.length) | 0];
    const p = c.pts[c.pts.length - 1];
    this.spawnParticles(p.x, p.y, '#FFE9B0', 5, {
      speedMin: 15, speedMax: 60, upBias: 50,
      gravity: -40, lifeMin: 0.4, lifeMax: 0.9, sizeMin: 1, sizeMax: 2.5,
    });
  }

  /** Brasas que ascienden del volcán hacia el espacio (dev-6): pocas, lentas. */
  _updateEmbers(dtReal) {
    // v3 3c/7: en el fondo general night no hay volcán → sin brasas.
    if ((this.theme?.feature ?? 'rich') === 'night') return;
    this._emberT -= dtReal;
    if (this._emberT > 0) return;
    this._emberT = rand(0.06, 0.2);
    const x = rand(40, CONFIG.CANVAS_W - 40);
    const y = rand(140, 305);
    this.spawnParticles(x, y, Math.random() < 0.45 ? '#FFB36A' : '#FFE9B0', 1, {
      speedMin: 8, speedMax: 26, upBias: 70, gravity: -14,
      lifeMin: 1.5, lifeMax: 2.6, sizeMin: 1.2, sizeMax: 3,
    });
  }

  // ---------- Input (§1.5: solo teclado; HUD por DOM) ----------
  _bindInput() {
    // Guards typeof: permiten instanciar el Engine fuera del DOM (tests Node)
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (ev) => this._onKeyDown(ev));
    }
    // dev-7 fase 4: pausa automática al cambiar de pestaña/app. Sin esto
    // el rAF sigue (algunos navegadores lo throttlean, otros no) y el
    // jugador puede volver con la base ya destruida por enemigos que
    // cayeron mientras no miraba — mala UX en un juego mobile-first.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'PLAYING') this.setState('PAUSED');
      });
    }
  }

  /**
   * Teclado global (§1.5): P/Esc pausa · 1/2/3 velocidad · Espacio
   * ultimate · U Combo List · B Black Hole · M música (v3 5/7).
   */
  _onKeyDown(ev) {
    // dev-7 fase 28: ignorar el auto-repito del teclado. Sin esto, mantener
    // pulsada una tecla de toggle (P, Esc, M) la dispara a la velocidad de
    // repetición del SO: con Esc pulsado en PLAYING la partida parpadeaba
    // entre PLAYING y PAUSED, y con M la música parpadeaba.
    if (ev.repeat) return;
    const k = ev.key.toLowerCase();
    switch (k) {
      case 'p':
        if (this.state === 'PLAYING') this.setState('PAUSED');
        else if (this.state === 'PAUSED') this.setState('PLAYING');
        break;
      case 'escape':
        if (this.state === 'PLAYING') this.setState('PAUSED');
        else this.emit('key:escape');
        break;
      case 'enter': this.emit('key:confirm'); break;
      case '1': this.setTimeScale(1); break;
      case '2': this.setTimeScale(1.5); break;
      case '3': this.setTimeScale(2); break;
      case ' ':
        // dev-7 fase 28: `preventDefault()` sólo en juego. Antes era
        // incondicional, así que el "Espacio activa el botón" del
        // navegador se cancelaba en TODAS las pantallas (menú, pausa,
        // torretas): con el teclado, Espacio no funcionaba en ningún
        // botón del juego salvo jugando.
        if (this.state === 'PLAYING') ev.preventDefault();
        this.emit('ultimate:fire');
        break;
      case 'u':
        // Combo List (§1.5): toggle del panel — abrir en PLAYING,
        // cerrar si ya está visible (el botón 🃏 emite lo mismo).
        if (this.state === 'PLAYING' || this.state === 'CARD_CHOICE') {
          this.emit('ui:combo_list');
        }
        break;
      case 'b':
        // BLACK HOLE (v3-3/7, §2.3): carta activa del arsenal extendido
        this.emit('blackhole:fire');
        break;
      case 'm':
        // Música on/off (v3 5/7, BUG-004): toggle ♪ — main.js decide
        // arrancar/parar según el estado FSM actual.
        if (this.state === 'PLAYING' || this.state === 'PAUSED' || this.state === 'CARD_CHOICE') {
          this.emit('ui:music_toggle');
        }
        break;
      default: break;
    }
  }

  // ---------- Render ----------
  render() {
    const ctx = this.ctx;
    ctx.save();

    // Shake acumulado (translate aleatorio dentro del radio actual)
    if (this.shakePx > 0) {
      ctx.translate(
        rand(-this.shakePx, this.shakePx),
        rand(-this.shakePx, this.shakePx),
      );
    }

    this._drawSkyCached(ctx);
    // v3 3c/7: modo night (fondo general) ↔ game según el tema activo
    this.stars.setMode((this.theme?.feature ?? 'rich') === 'night' ? 'night' : 'game');
    this.stars.draw(ctx);
    // v3 3c/7: decoración de fondo DETRÁS del planeta (luna, cenizas, velos)
    this._drawThemeBackdrop(ctx);
    // night = fondo general: NO se dibuja planeta (estrellas protagonistas)
    if ((this.theme?.feature ?? 'rich') !== 'night') this._drawPlanetCached(ctx);
    // T3 — Halo del punto de spawn: resplandor MUY tenue en el borde
    // superior (x = BASE_X), de donde entran los enemigos. Un solo
    // gradiente radial por frame: avisa de dónde viene la amenaza sin
    // distraer (va ENCIMA del planeta: el spawn es arriba del todo).
    this._drawSpawnHalo(ctx);
    this._drawPlatform(ctx);
    this._drawFog(ctx);
    // v3 3c/7: chispas del reactor orbitando el limbo (Stage 5)
    if ((this.theme?.feature ?? 'rich') === 'core') this._drawCoreSparks(ctx);

    // dev-7 fase 54 — EL TINTE DEL TEMA sobre el fondo YA DIBUJADO (cielo,
    // nebulosa, estrellas, velos, planeta, plataforma y niebla). Va aquí, y
    // no despues, a propósito: las ENTIDADES (base, torres, enemigos,
    // proyectiles) se pintan en los siguientes bloques y quedan con sus
    // colores semánticos intactos.
    // Un `fillRect` con `soft-light` por frame: medido a 60 FPS con 400
    // particulas y 3 enemigos, sin diferencia con el tinte puesto.
    if (this._sceneTint) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = this._sceneTint.alpha;
      ctx.fillStyle = this._sceneTint.color;
      ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
      ctx.restore();
    }

    // Capa de aplicación (Fortress: cúpula + arco HP + torres) bajo las
    // entidades para que los proyectiles pasen por encima
    if (this.onRenderExtra) this.onRenderExtra(ctx);

    // Entidades (torres/enemigos) + efectos transitorios
    for (const e of this.entities) e.draw(ctx);
    for (const f of this.effects) {
      const t = f.life > 0 ? Math.max(0, 1 - f.age / f.life) : 0;
      if (f.draw) {
        try { f.draw(ctx, t); } catch (_err) { /* un fx roto nunca tira el frame */ }
      }
    }

    // Juice encima
    this._drawJuice(ctx);

    ctx.restore();
  }

  _drawSky(ctx) {
    // Cielo: theme.skyTop → theme.skyDeep (§4.1, temas dev-5)
    const th = this.theme ?? THEMES.volcanic;
    const g = ctx.createLinearGradient(0, 0, 0, CONFIG.CANVAS_H);
    g.addColorStop(0, th.skyTop);
    g.addColorStop(1, th.skyDeep);
    ctx.fillStyle = g;
    ctx.fillRect(-12, -12, CONFIG.CANVAS_W + 24, CONFIG.CANVAS_H + 24);

    // T1 — NEBULOSA: manchas frías (azul-violeta / cian) MUY suaves en la
    // mitad inferior del cielo, la franja que se leía como negro puro y
    // mataba la profundidad de la escena. El alpha es BAJO a propósito
    // (0.05-0.13): tiene que verse como BRUMA, no como una mancha de color.
    // Va DETRÁS de las estrellas porque vive en el cache del cielo, que se
    // blitea antes que ellas (render(): _drawSkyCached → stars.draw).
    this._drawNebula(ctx);

    // Resplandor cálido/frío alrededor del planeta
    const { PLANET_CX: cx, PLANET_CY: cy, PLANET_R: r } = SCENE;
    const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.05);
    glow.addColorStop(0, th.glowColor);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);

    // Halos térmicos superpuestos (dev-6): luz cálida que se desvanece del
    // borde inferior del planeta hacia el espacio intermedio (fiel a la
    // diseño base: el cielo intermedio conserva un tono cálido/rojizo).
    // v3 3c/7: el color/alfa del halo es POR TEMA (night → azul frío, bajo).
    const th2 = this.theme ?? THEMES.volcanic;
    const heatRGB = th2.heat ?? ['232, 100, 31', '180, 60, 20'];
    const heatA = th2.heatA ?? 1;
    const pulse = 0.75 + 0.25 * Math.sin(this._t * 1.6);
    const heat = ctx.createRadialGradient(cx, cy + 60, r * 0.1, cx, cy + 120, r * 0.72);
    heat.addColorStop(0, `rgba(${heatRGB[0]}, ${(0.16 * pulse * heatA).toFixed(4)})`);
    heat.addColorStop(0.6, `rgba(${heatRGB[1]}, ${(0.07 * pulse * heatA).toFixed(4)})`);
    heat.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = heat;
    ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  }

  /**
   * T1 — Nebulosa de fondo: 3 manchas radiales grandes en la mitad inferior
   * del cielo. Alpha MUY bajo: es bruma que le da PROFUNDIDAD al espacio
   * vacío, no una mancha de color. Pulso lentísimo (20-40 s) para que la
   * escena respire sin distraer al jugador.
   */
  _drawNebula(ctx) {
    for (const n of this._nebula) {
      const a = this._nebulaAlpha(n);
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0, `rgba(${n.col}, ${a.toFixed(4)})`);
      g.addColorStop(0.55, `rgba(${n.col}, ${(a * 0.45).toFixed(4)})`);
      g.addColorStop(1, `rgba(${n.col}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
  }

  /**
   * Alpha efectivo de una mancha de nebulosa (base x pulso x tema), acotado
   * a NEBULA_ALPHA_MIN..NEBULA_ALPHA_MAX: por más que el tema la pida
   * visible, la nebulosa nunca puede pasar de "bruma".
   */
  _nebulaAlpha(n) {
    const mul = this.theme?.nebulaA ?? 1;
    const pulse = 0.85 + 0.15 * Math.sin((this._t / n.period) * Math.PI * 2 + n.phase);
    return clamp(n.a * pulse * mul, NEBULA_ALPHA_MIN, NEBULA_ALPHA_MAX);
  }

  _drawPlanet(ctx) {
    const { PLANET_CX: cx, PLANET_CY: cy, PLANET_R: r } = SCENE;

    // Cuerpo: gradiente radial theme.planetCore → theme.planetEdge
    const th = this.theme ?? THEMES.volcanic;
    const f = th.feature ?? 'rich';
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    // Estética v3.1 delta A: corteza oscura DOMINANTE pero CÁLIDA — medición
    // vs referencia (dark≈46 %): el centro vira al tono ígneo del TEMA
    // (planetCoreWarm) y SOLO la periferia llega a planetEdgeBody. Sin
    // fallbacks: cada stage define su par y los stages fríos (3/4) mantienen
    // su planeta azul/gris sin teñirse de marrón.
    const body = ctx.createRadialGradient(cx, cy + 30, r * 0.05, cx, cy, r * 1.02);
    body.addColorStop(0, th.planetCoreWarm);
    body.addColorStop(0.55, th.planetCoreWarm);
    body.addColorStop(1, th.planetEdgeBody);
    ctx.fillStyle = body;
    ctx.fill();

    // Recorte: manchas de roca + grietas viven DENTRO del disco
    ctx.clip();

    // v3 3c/7: corteza específica por THEME — cada stage un fondo PROPIO.
    // feature:'rich' (volcanic) reproduce EXACTO el código histórico.
    if (f === 'dormant') this._crustDormant(ctx);
    else if (f === 'graveyard') this._crustGraveyard(ctx);
    else if (f === 'city') this._crustCity(ctx);
    else if (f === 'core') this._crustCore(ctx);
    else this._crustRich(ctx);

    // T2 — Terminador: el lado NO iluminado se apaga. Va DESPUÉS de la
    // costra para que también atenúe las fallas lejanas (el magma del lado
    // en sombra brilla menos). Con el limbo iluminado del lado opuesto, el
    // disco deja de leerse como plano y se lee como ESFERA.
    this._drawTerminator(ctx);

    ctx.restore();

    // Borde del planeta con glow
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = th.planetEdge;
    ctx.lineWidth = 3.5;
    ctx.shadowColor = th.planetEdge;
    ctx.shadowBlur = 22;
    ctx.stroke();
    ctx.restore();

    // Halo exterior pulsante (dev-6): corona difusa que late como el magma,
    // sin tapar nunca las entidades (alpha bajo, siempre detrás del juego).
    // v3 3c/7: el color de corona/limbo es POR TEMA (reactor rojo, ciudad
    // cian, cementerio gris-azul, cenizas anaranjadas apagadas).
    const limbC = this._limbColors(f);
    const coronaA = 0.10 + 0.08 * (0.5 + 0.5 * Math.sin(this._t * 1.2));
    ctx.save();
    const corona = ctx.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.22);
    corona.addColorStop(0, `rgba(${limbC.corona0}, ${coronaA})`);
    corona.addColorStop(0.7, `rgba(${limbC.corona1}, ${coronaA * 0.6})`);
    corona.addColorStop(1, `rgba(${limbC.corona1}, 0)`);
    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Banda periférica (estética v3.1 delta A): el limbo del planeta
    // conserva la paleta canónica — esfera oscura ILUMINADA desde dentro,
    // como la referencia (la corteza fría domina el centro).
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const limb = ctx.createRadialGradient(cx, cy, r * 0.68, cx, cy, r * 0.99);
    limb.addColorStop(0, `rgba(${limbC.corona1}, 0)`);
    limb.addColorStop(0.75, `rgba(${limbC.limbInner}, ${0.22 + 0.08 * Math.sin(this._t * 1.4)})`);
    limb.addColorStop(1, `rgba(${limbC.limbEdge}, 0.30)`);
    ctx.fillStyle = limb;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // T2 — Halo del limbo en el lado ILUMINADO: un arco claro pegado al
    // borde, del color del limbo (limbEdge). Da nitidez al borde y
    // completa el terminador (borde claro / lado en sombra).
    this._drawLimbHalo(ctx, limbC);
  }

  /**
   * T2 — Dirección de la luz por feature (unitario; pantalla: x a la
   * derecha, y abajo). La comparten el TERMINADOR y los rim-lights de los
   * cráteres: si no coinciden, la esfera miente. Los temas fríos usan la
   * convención de arriba-izquierda (la misma que la luna y los cráteres del
   * cementerio); los temas de magma, de abajo (su luz sale de la lava).
   */
  _lightDir(f) {
    switch (f) {
      case 'dormant': return { x: 0.44, y: 0.90 };
      case 'graveyard': return { x: -0.62, y: -0.78 };
      case 'city': return { x: 0.52, y: 0.85 };
      case 'core': return { x: -0.30, y: 0.95 };
      default: return { x: -0.42, y: 0.91 };
    }
  }

  /**
   * T2 — Terminador: oscurecimiento DIRECCIONAL del lado no iluminado.
   * Alpha máximo 0.40 (sutil a propósito: el planeta es la fuente de luz
   * del juego, no puede apagarse). El eje va anclado en el centro de la
   * parte VISIBLE del disco (la tapa inferior) para que el degradado caiga
   * dentro de lo que se ve en pantalla.
   */
  _drawTerminator(ctx) {
    const L = this._lightDir(this.theme?.feature ?? 'rich');
    const { PLANET_CX: cx, PLANET_CY: cy, PLANET_R: r } = SCENE;
    const ay = cy + r * 0.55;
    const R = r * 0.95;
    const g = ctx.createLinearGradient(
      cx + L.x * R, ay + L.y * R,
      cx - L.x * R, ay - L.y * R,
    );
    // El ramp está comprimido: casi todo el recorrido cae DENTRO de la parte
    // visible del disco (si no, el sombreado se desperdicia fuera de
    // pantalla y el planeta sigue leyéndose plano).
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(0.25, 'rgba(0, 0, 0, 0.04)');
    g.addColorStop(0.55, 'rgba(0, 0, 0, 0.20)');
    g.addColorStop(0.8, 'rgba(0, 0, 0, 0.40)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.40)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  /**
   * T2 — Halo direccional del limbo: arco claro en el borde que mira a la
   * luz. Mismo `lighter` que la banda periférica, así se funde con ella.
   */
  _drawLimbHalo(ctx, limbC) {
    const L = this._lightDir(this.theme?.feature ?? 'rich');
    const { PLANET_CX: cx, PLANET_CY: cy, PLANET_R: r } = SCENE;
    const ang = Math.atan2(L.y, L.x);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${limbC.limbEdge}, 0.32)`;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = `rgba(${limbC.limbEdge}, 0.8)`;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.5, ang - 0.62, ang + 0.62);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * T2 — Rim light en las manchas GRANDES de la corteza: un arco de luz
   * fino en el borde que mira a la luz. Sin esto las manchas son círculos
   * planos pegados al disco. Solo las grandes (el grano fino no se toca) y
   * como mucho 14 arcos por llamada (es un bucle por frame, aunque dentro
   * del cache del planeta).
   */
  _rimLightSpots(ctx, spots, maxArcs = 14) {
    const f = this.theme?.feature ?? 'rich';
    const L = this._lightDir(f);
    const limbC = this._limbColors(f);
    const base = Math.atan2(L.y, L.x);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${limbC.limbEdge}, 0.22)`;
    ctx.lineWidth = 1.4;
    ctx.shadowColor = `rgba(${limbC.limbEdge}, 0.9)`;
    ctx.shadowBlur = 6;
    for (const s of spots.slice(0, maxArcs)) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 0.96, base - 0.95, base + 0.95);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** v3 3c/7: colores de corona/limbo por feature (rich = los canónicos). */
  _limbColors(f) {
    switch (f) {
      case 'dormant': return { corona0: '200, 100, 40', corona1: '190, 80, 30', limbInner: '190, 90, 34', limbEdge: '216, 130, 44' };
      case 'graveyard': return { corona0: '120, 150, 190', corona1: '80, 104, 140', limbInner: '96, 116, 146', limbEdge: '140, 160, 190' };
      case 'city': return { corona0: '90, 160, 220', corona1: '60, 110, 180', limbInner: '70, 130, 200', limbEdge: '110, 190, 240' };
      case 'core': return { corona0: '255, 90, 40', corona1: '220, 60, 24', limbInner: '230, 60, 26', limbEdge: '255, 110, 50' };
      default: return { corona0: '255, 180, 80', corona1: '232, 100, 31', limbInner: '232, 110, 40', limbEdge: '247, 168, 36' };
    }
  }

  /**
   * T3 — Halo del punto de spawn: resplandor muy tenue (alpha 0.05-0.10)
   * en el borde superior, del color del tema. Los enemigos caen desde ahí
   * (SPAWN_Y en waves.js, sobre el borde superior) y el halo hace que el
   * jugador lea de dónde viene la amenaza sin que estorbe.
   */
  _drawSpawnHalo(ctx) {
    // El fondo general 'night' no tiene partida: el halo no aplica.
    if ((this.theme?.feature ?? 'rich') === 'night') return;
    const th = this.theme ?? THEMES.volcanic;
    const col = th.spawnGlow ?? '180, 200, 255';
    const x = CONFIG.BASE_X;
    const y = -8;
    const r = 150;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col}, 0.09)`);
    g.addColorStop(0.45, `rgba(${col}, 0.045)`);
    g.addColorStop(1, `rgba(${col}, 0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  // ---------- Cortezas por theme (v3 3c/7) ----------

  /** volcanic (Stage 1, APROBADO por JK): el código histórico + el rim
   *  light (T2) sobre las placas grandes. */
  _crustRich(ctx) {
    // Costra volcánica (estética v3.1 delta A): la corteza oscura domina
    // pero SIN aplastar la luz (medición: objetivo dark≈50 %, bright≈15-20 %
    // como la referencia) — placas grandes + grano fino de relieve.
    ctx.fillStyle = 'rgba(26, 12, 5, 0.24)';
    for (const s of this._rockSpots) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // T2 — rim light en las placas grandes (el lado que mira a la luz).
    this._rimLightSpots(ctx, this._rockSpots);
    ctx.fillStyle = 'rgba(14, 7, 3, 0.28)';
    for (const gspot of this._rockGrain) {
      ctx.beginPath();
      ctx.arc(gspot.x, gspot.y, gspot.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flujos de lava oscura entre placas (estética v3.1): cintas oscuras
    // con NÚCLEO incandescente que late — superficie volcánica rica como
    // en la referencia (no un disco liso).
    for (const f of this._lavaFlows) {
      const k = 0.5 + 0.5 * Math.sin(this._t * f.speed + f.phase);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(20, 10, 6, 0.55)';
      ctx.lineWidth = f.w;
      ctx.beginPath();
      ctx.moveTo(f.pts[0].x, f.pts[0].y);
      for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i].x, f.pts[i].y);
      ctx.stroke();
      ctx.globalAlpha = 0.30 + 0.40 * k;
      ctx.strokeStyle = 'rgba(255, 120, 30, 0.75)';
      ctx.lineWidth = f.w * 0.42;
      ctx.shadowColor = '#FF8020';
      ctx.shadowBlur = 7;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    // Lagos de magma (estética v3.1 delta A): pocos pozos irregulares
    // brillantes con flicker — la falla se ABRE en charcos de lava.
    for (const lake of this._lavaLakes) {
      const lk = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(this._t * 1.8 + lake.x));
      ctx.beginPath();
      for (const lb of lake.lobes) {
        ctx.moveTo(lake.x + lb.dx, lake.y + lb.dy);
        ctx.arc(lake.x + lb.dx, lake.y + lb.dy, lb.r, 0, Math.PI * 2);
      }
      ctx.fillStyle = `rgba(255, 170, 60, ${0.42 * lk})`;
      ctx.fill();
      ctx.shadowColor = this.theme?.cracks ?? '#FFDD55';
      ctx.shadowBlur = 16;
      ctx.globalAlpha = Math.min(1, 0.72 + 0.45 * lk);
      ctx.beginPath();
      for (const lb of lake.lobes) {
        ctx.moveTo(lake.x + lb.dx, lake.y + lb.dy);
        ctx.arc(lake.x + lb.dx, lake.y + lb.dy, lb.r * 0.72, 0, Math.PI * 2);
      }
      const lg = ctx.createRadialGradient(lake.x, lake.y, 2, lake.x, lake.y, 30);
      lg.addColorStop(0, 'rgba(255, 240, 190, 0.95)');
      lg.addColorStop(0.55, 'rgba(255, 200, 90, 0.85)');
      lg.addColorStop(1, 'rgba(255, 160, 50, 0)');
      ctx.fillStyle = lg;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    // Grietas incandescentes theme.cracks — FUENTE DE LUZ del planeta
    // (estética v3.1 delta A): en la referencia son FALLAS TECTÓNICAS
    // gruesas con lagos de lava, no hilos capilares. Pase ancho oscuro
    // (zanja), halo cálido y núcleo incandescente con flicker fuerte.
    const th = this.theme ?? THEMES.volcanic;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const c of this.cracks) {
      const flicker = 0.5 + 0.5 * Math.sin(this._t * c.speed * 1.4 + c.phase);
      ctx.beginPath();
      ctx.moveTo(c.pts[0].x, c.pts[0].y);
      for (let i = 1; i < c.pts.length; i++) ctx.lineTo(c.pts[i].x, c.pts[i].y);
      // Pase 1: zanja oscura profunda (la costra se ABRE — contraste)
      ctx.globalAlpha = 0.80;
      ctx.strokeStyle = 'rgba(20, 9, 4, 0.95)';
      ctx.lineWidth = c.width * 4.2;
      ctx.stroke();
      // Pase 2: halo cálido ancho en modo aditivo (bloom barato que SÍ
      // suma área incandescente medible, como la referencia)
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.20 + 0.34 * flicker;
      ctx.strokeStyle = 'rgba(255, 150, 40, 0.95)';
      ctx.lineWidth = c.width * 3.4;
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      // Pase 3: grieta incandescente con glow del tema
      ctx.shadowColor = th.cracks;
      ctx.shadowBlur = 18;
      ctx.globalAlpha = Math.min(1, 0.72 + 0.38 * flicker);
      ctx.strokeStyle = th.cracks;
      ctx.lineWidth = Math.max(3.4, c.width * 1.5);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Venas de lava blanco-cálidas (dev-6): llamaradas blancas del planeta
    // agrietado — MÁX 5, puntuales (v3.1 delta A: la luz no debe tapar la
    // costra; las fallas gruesas son las protagonistas).
    ctx.strokeStyle = '#FFE9B0';
    ctx.shadowColor = '#FFE9B0';
    for (const v of this.hotVeins.slice(0, 5)) {
      ctx.globalAlpha = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(this._t * v.speed * 1.6 + v.phase));
      ctx.lineWidth = v.width + 1;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(v.pts[0].x, v.pts[0].y);
      for (let i = 1; i < v.pts.length; i++) ctx.lineTo(v.pts[i].x, v.pts[i].y);
      ctx.stroke();
    }

    // Puntos incandescentes (magma blanco-amarillo) — MÁX 5 (v3.1 delta A:
    // acentos puntuales, el grueso de la luz vive en las fallas).
    for (const s of this._hotSpots.slice(0, 5)) {
      const sp = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(this._t * 2.2 + s.x));
      const spot = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      spot.addColorStop(0, `rgba(255, 240, 200, ${0.85 * sp})`);
      spot.addColorStop(0.5, `rgba(255, 200, 90, ${0.45 * sp})`);
      spot.addColorStop(1, 'rgba(255, 170, 60, 0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = spot;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  /** volcanic2 (Stage 2): volcán dormido — cenizas, grietas apagadas. */
  _crustDormant(ctx) {
    ctx.fillStyle = 'rgba(24, 20, 18, 0.30)';
    for (const s of this._rockSpots) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // T2 — rim light en las placas grandes (el lado que mira a la luz).
    this._rimLightSpots(ctx, this._rockSpots);
    ctx.fillStyle = 'rgba(12, 10, 9, 0.34)';
    for (const g of this._rockGrain) {
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Flujos apagados: cintas oscuras con núcleo anaranjado tenue (sin bloom)
    ctx.lineCap = 'round';
    for (const fl of this._lavaFlows) {
      const k = 0.35 + 0.3 * Math.sin(this._t * fl.speed + fl.phase);
      ctx.strokeStyle = 'rgba(16, 12, 10, 0.6)';
      ctx.lineWidth = fl.w;
      ctx.beginPath();
      ctx.moveTo(fl.pts[0].x, fl.pts[0].y);
      for (let i = 1; i < fl.pts.length; i++) ctx.lineTo(fl.pts[i].x, fl.pts[i].y);
      ctx.stroke();
      ctx.globalAlpha = 0.10 + 0.14 * k;
      ctx.strokeStyle = 'rgba(190, 90, 34, 0.6)';
      ctx.lineWidth = fl.w * 0.3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Grietas en su mayoría apagadas (8 de 15, parpadeo lento y débil)
    const th = this.theme ?? THEMES.volcanic;
    ctx.lineJoin = 'round';
    for (const c of this.cracks.slice(0, 8)) {
      const flicker = 0.3 + 0.3 * Math.sin(this._t * c.speed * 0.8 + c.phase);
      ctx.beginPath();
      ctx.moveTo(c.pts[0].x, c.pts[0].y);
      for (let i = 1; i < c.pts.length; i++) ctx.lineTo(c.pts[i].x, c.pts[i].y);
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = 'rgba(16, 12, 10, 0.9)';
      ctx.lineWidth = c.width * 4;
      ctx.stroke();
      ctx.shadowColor = th.cracks;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.35 + 0.4 * flicker;
      ctx.strokeStyle = th.cracks;
      ctx.lineWidth = Math.max(2.6, c.width * 1.1);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // Brasas frías: manchas anaranjadas tenues (sin blanco-amarillo)
    for (const s of this._hotSpots.slice(0, 3)) {
      const sp = 0.5 + 0.3 * Math.sin(this._t * 1.4 + s.x);
      const spot = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      spot.addColorStop(0, `rgba(200, 110, 40, ${0.4 * sp})`);
      spot.addColorStop(1, 'rgba(200, 110, 40, 0)');
      ctx.fillStyle = spot;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  /** graveyard (Stage 3): cementerio espacial — cráteres, lápidas, sin lava. */
  _crustGraveyard(ctx) {
    ctx.fillStyle = 'rgba(8, 12, 18, 0.34)';
    for (const s of this._rockSpots) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // T2 — rim light en las placas grandes (el lado que mira a la luz).
    this._rimLightSpots(ctx, this._rockSpots);
    // Cráteres muertos con borde iluminado desde arriba-izquierda
    for (const cr of this._gvCraters) {
      ctx.beginPath();
      ctx.arc(cr.x, cr.y, cr.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10, 14, 20, 0.5)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cr.x - cr.r * 0.22, cr.y - cr.r * 0.22, cr.r * 0.82, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(168, 190, 216, 0.16)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    // Lápidas: siluetas oscuras con cruz ancladas al limbo del planeta
    for (const t of this._gvTombs) {
      ctx.fillStyle = 'rgba(16, 22, 30, 0.92)';
      this._roundRect(ctx, t.x - t.w / 2, t.y - t.h, t.w, t.h, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160, 184, 210, 0.28)';
      ctx.lineWidth = 1.4;
      this._roundRect(ctx, t.x - t.w / 2, t.y - t.h, t.w, t.h, 3);
      ctx.stroke();
      ctx.fillStyle = 'rgba(150, 172, 198, 0.4)';
      ctx.fillRect(t.x - 2.6, t.y - t.h + 5, 5.2, 14);
      ctx.fillRect(t.x - 6.5, t.y - t.h + 8, 13, 5);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  /** nightcity (Stage 4): planeta-ciudad — grietas cian + luces urbanas. */
  _crustCity(ctx) {
    const th = this.theme ?? THEMES.volcanic;
    ctx.fillStyle = 'rgba(5, 10, 20, 0.30)';
    for (const s of this._rockSpots) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // T2 — rim light en las placas grandes (el lado que mira a la luz).
    this._rimLightSpots(ctx, this._rockSpots);
    ctx.fillStyle = 'rgba(3, 6, 12, 0.34)';
    for (const g of this._rockGrain) {
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Grietas cian del tema, suaves (sin lava — planeta de ciudad)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const c of this.cracks.slice(0, 12)) {
      const flicker = 0.4 + 0.4 * Math.sin(this._t * c.speed + c.phase);
      ctx.beginPath();
      ctx.moveTo(c.pts[0].x, c.pts[0].y);
      for (let i = 1; i < c.pts.length; i++) ctx.lineTo(c.pts[i].x, c.pts[i].y);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'rgba(6, 12, 22, 0.9)';
      ctx.lineWidth = c.width * 3.6;
      ctx.stroke();
      ctx.shadowColor = th.cracks;
      ctx.shadowBlur = 12;
      ctx.globalAlpha = 0.30 + 0.4 * flicker;
      ctx.strokeStyle = th.cracks;
      ctx.lineWidth = Math.max(2.4, c.width * 1.2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // Luces de la ciudad en el limbo: puntos cálidos y cian parpadeando
    for (const L of this._cityLights) {
      const tw = 0.5 + 0.5 * Math.sin(this._t * 2.4 + L.ph);
      ctx.globalAlpha = 0.18 + 0.42 * tw;
      ctx.fillStyle = L.warm ? '#FFD9A0' : '#9FD8FF';
      ctx.fillRect(L.x, L.y, L.s, L.s * 0.8);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  /** core (Stage 5): reactor — turbina radial girando sobre costra negra. */
  _crustCore(ctx) {
    ctx.fillStyle = 'rgba(10, 3, 3, 0.32)';
    for (const s of this._rockSpots) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // T2 — rim light en las placas grandes (el lado que mira a la luz).
    this._rimLightSpots(ctx, this._rockSpots);
    ctx.fillStyle = 'rgba(6, 2, 2, 0.36)';
    for (const g of this._rockGrain) {
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Turbina del reactor: aspas radiales que GIRAN despacio alrededor del
    // centro del planeta (núcleo máquina, no un volcán más).
    ctx.lineCap = 'round';
    const spin = this._t * 0.10;
    for (const tb of this._coreTurbine) {
      const a = tb.ang + spin;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const x1 = SCENE.PLANET_CX + dx * 30;
      const y1 = SCENE.PLANET_CY + dy * 30;
      const x2 = SCENE.PLANET_CX + dx * tb.len;
      const y2 = SCENE.PLANET_CY + dy * tb.len;
      const pulse = 0.6 + 0.4 * Math.sin(this._t * 1.8 + tb.ph);
      // Zanja oscura
      ctx.strokeStyle = 'rgba(18, 4, 3, 0.85)';
      ctx.lineWidth = tb.w * 2.6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // Núcleo rojo con glow
      ctx.shadowColor = '#FF3018';
      ctx.shadowBlur = 14;
      ctx.globalAlpha = 0.55 + 0.35 * pulse;
      ctx.strokeStyle = '#FF4018';
      ctx.lineWidth = tb.w;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    // Puntos incandescentes del núcleo (blanco-cálidos, pocos)
    for (const s of this._hotSpots.slice(0, 3)) {
      const sp = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(this._t * 2.2 + s.x));
      const spot = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      spot.addColorStop(0, `rgba(255, 210, 160, ${0.8 * sp})`);
      spot.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.fillStyle = spot;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  /**
   * v3 3c/7 — decoración de fondo DETRÁS del planeta por theme:
   * · graveyard: luna muerta craterizada + velos de nebulosa.
   * · dormant: columnas de ceniza en los flancos del disco.
   * · core: aurora roja del reactor en el cielo alto.
   * city/rich: sin decoración propia (skyline / planeta rico).
   */
  _drawThemeBackdrop(ctx) {
    const f = (this.theme ?? THEMES.volcanic).feature ?? 'rich';
    if (f === 'graveyard') {
      const m = this._gvMoon;
      ctx.save();
      const mg = ctx.createRadialGradient(m.x - m.r * 0.3, m.y - m.r * 0.3, m.r * 0.1, m.x, m.y, m.r);
      mg.addColorStop(0, '#93A2B8');
      mg.addColorStop(1, '#3A4454');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(20, 26, 36, 0.5)';
      for (const c of this._gvCraters.slice(0, 4)) {
        ctx.beginPath();
        ctx.arc(m.x + (c.x - 270) * 0.3, m.y + (c.y - 150) * 0.3, c.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // Velos de nebulosa muerta (aditivo, tenues)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const n of this._gvNebula) {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        g.addColorStop(0, `rgba(${n.col}, ${n.a})`);
        g.addColorStop(1, `rgba(${n.col}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
      }
      ctx.restore();
    } else if (f === 'dormant') {
      // Columnas de ceniza ascendiendo por los flancos del volcán dormido
      ctx.save();
      for (const p of this._ashPlumes) {
        const drift = Math.sin(this._t * p.sp + p.ph) * 22;
        const g = ctx.createLinearGradient(0, 300, 0, 300 - p.h);
        g.addColorStop(0, 'rgba(108, 118, 126, 0.15)');
        g.addColorStop(1, 'rgba(108, 118, 126, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(p.x + drift - p.w / 2, 300);
        ctx.quadraticCurveTo(p.x + drift, 300 - p.h * 0.6, p.x + drift + p.w * 0.6, 300 - p.h);
        ctx.lineTo(p.x + drift + p.w * 1.9, 300 - p.h);
        ctx.quadraticCurveTo(p.x + drift + p.w, 300 - p.h * 0.55, p.x + drift + p.w / 2, 300);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    } else if (f === 'core') {
      // Aurora roja del reactor en el cielo alto (velo difuso)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(430, 90, 0, 430, 90, 190);
      g.addColorStop(0, 'rgba(255, 70, 30, 0.12)');
      g.addColorStop(1, 'rgba(255, 70, 30, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(240, 0, 300, 220);
      ctx.restore();
    }
  }

  /** core (Stage 5): chispas orbitando el limbo del planeta-reactor. */
  _drawCoreSparks(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = SCENE.PLANET_R - 2;
    for (let i = 0; i < 2; i++) {
      const a = this._coreSparks[i].ang + this._t * 0.55 * (i ? -1 : 1);
      const x = SCENE.PLANET_CX + Math.cos(a) * r;
      const y = SCENE.PLANET_CY + Math.sin(a) * r;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
      g.addColorStop(0, 'rgba(255, 200, 120, 0.95)');
      g.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 9, y - 9, 18, 18);
    }
    ctx.restore();
  }

  /**
   * BAHÍA DE MONTAJE de un slot (fase 62): el octágono achatado del deck
   * donde se apoya la torre. Lo dibuja la plataforma (acá, en acero
   * neutro) y `player.js` pinta encima el estado "disponible" del slot
   * vacío (abrazaderas + tira de estado en el acento de la ranura).
   *
   * OJO — ACOPLAMIENTO POR CONVENCIÓN: `TOWER_PAD` (js/tower-art.js), el
   * pad que dibuja la torre, tiene que ENTRAR acá adentro, y el encaje de
   * `player.js` sale de la MISMA caja. `engine.js` no importa nada (por
   * invariante, ver AGENTS.md), así que la contención la verifica
   * `tests/test-engine.mjs` importando los tres módulos.
   *
   * `top`/`bottom` son relativos a `CONFIG.TOWER_Y` (el ancla de la torre).
   */
  /**
   * Traza el octágono de una bahía centrada en `sx`. `grow` lo agranda
   * (bisel) o lo encoge (interior).
   */
  _bayPath(ctx, sx, grow = 0) {
    const b = TOWER_BAY;
    const t = CONFIG.TOWER_Y + b.top - grow;
    const bo = CONFIG.TOWER_Y + b.bottom + grow;
    const hw = b.halfW + grow;
    const ch = b.chamfer;
    ctx.beginPath();
    ctx.moveTo(sx - hw + ch, t);
    ctx.lineTo(sx + hw - ch, t);
    ctx.lineTo(sx + hw, t + ch);
    ctx.lineTo(sx + hw, bo - ch);
    ctx.lineTo(sx + hw - ch, bo);
    ctx.lineTo(sx - hw + ch, bo);
    ctx.lineTo(sx - hw, bo - ch);
    ctx.lineTo(sx - hw, t + ch);
    ctx.closePath();
  }

  /**
   * Dimensiona el cache del deck. Su alto depende del layout (PLATFORM_Y
   * baja con el marco), así que se recalcula en cada resize.
   */
  _resizeDeckCache() {
    const c = this._deckCache;
    if (!c) return;
    const alto = this._deckHeight();
    c.canvas.width = CONFIG.CANVAS_W * this.dpr;
    c.canvas.height = alto * this.dpr;
    c.ctx.scale(this.dpr, this.dpr);
    c.h = alto;
    // La calidad la reaplica applyQualityTo (que ya incluye el deck).
    this._deckDirty = true;
  }

  /** Refresca el cache del deck si hace falta (solo cambia con el layout). */
  _refreshDeckCacheIfNeeded() {
    if (!this._deckCache || !this._deckDirty) return;
    this._deckDirty = false;
    const dctx = this._deckCache.ctx;
    dctx.clearRect(0, 0, CONFIG.CANVAS_W, this._deckHeight());
    dctx.save();
    dctx.translate(0, -SCENE.PLATFORM_Y); // el cache empieza en PLATFORM_Y
    this._drawDeckStatic(dctx);
    dctx.restore();
  }

  /** Alto del cache del deck (de la plataforma al borde inferior). */
  _deckHeight() {
    return CONFIG.CANVAS_H - SCENE.PLATFORM_Y + 12;
  }

  /**
   * PLATAFORMA: casco metálico + las 5 bahías de montaje + labio frontal.
   * La parte estructural es ESTÁTICA (va cacheada: se dibuja una vez por
   * layout) y encima van, por frame, las partes animadas (balizas ámbar y
   * el pulso de energía que recorre el espinazo). El cache permite mucho
   * más detalle del que se podía pagar dibujando todo cada frame.
   */
  _drawPlatform(ctx) {
    this._refreshDeckCacheIfNeeded();
    if (this._deckCache) {
      ctx.drawImage(this._deckCache.canvas, 0, SCENE.PLATFORM_Y,
        CONFIG.CANVAS_W, this._deckHeight());
    } else {
      this._drawDeckStatic(ctx); // sin document (Node): dibuja directo
    }
    this._drawDeckAnimated(ctx);
  }

  /** Parte ANIMADA del deck: balizas de los módulos + pulso del espinazo. */
  _drawDeckAnimated(ctx) {
    const top = SCENE.PLATFORM_Y;
    const T = CONFIG.TOWER_Y;
    // Balizas ámbar de los módulos de servicio (una por hueco entre bahías).
    // Con 4 bahías hay 3 huecos: no dibujar el módulo del extremo recortado.
    const modules = TOWER_BAY.moduleX.slice(0, Math.max(0, this._deckSlots - 1));
    for (const mx of modules) {
      const bp = 0.5 + 0.5 * Math.sin(this._t * 2.4 + mx);
      ctx.globalAlpha = 0.30 + 0.55 * bp;
      ctx.shadowColor = '#FFC46A';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#FFC46A';
      ctx.beginPath();
      ctx.arc(mx, top + 20, 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    // PULSO DE ENERGÍA: un latido cian que sale de la cúpula y recorre el
    // espinazo hacia los dos extremos (2.6 s por vuelta). Comunica que el
    // deck está VIVO y conecta visualmente la base con las bahías.
    const spineY = T + TOWER_BAY.spineY;
    const phase = (this._t * 0.38) % 1;
    const span = CONFIG.BASE_X - 46;
    for (const dir of [-1, 1]) {
      const px = CONFIG.BASE_X + dir * (18 + phase * span);
      const fade = Math.sin(Math.PI * phase); // aparece y se apaga
      ctx.globalAlpha = 0.30 * fade;
      ctx.fillStyle = '#35E0C8';
      ctx.fillRect(px - 16, spineY - 1, 32, 2);
      ctx.globalAlpha = 0.55 * fade;
      ctx.fillRect(px - 5, spineY - 1.5, 10, 3);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Parte ESTÁTICA del deck (cacheada): casco, espinazo, las 5 bahías, los
   * módulos de servicio, el labio frontal y el borde superior iluminado.
   */
  _drawDeckStatic(ctx) {
    const top = SCENE.PLATFORM_Y;
    const x = 18;
    const w = CONFIG.CANVAS_W - x * 2;
    const T = CONFIG.TOWER_Y;
    const b = TOWER_BAY;
    const r = 34;
    const slotXs = CONFIG.SLOTS.slice(0, this._deckSlots);

    // Cuerpo: silueta redondeada (esquinas superiores)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, CONFIG.CANVAS_H + 12);
    ctx.lineTo(x, top + r);
    ctx.arcTo(x, top, x + r, top, r);
    ctx.lineTo(x + w - r, top);
    ctx.arcTo(x + w, top, x + w, top + r, r);
    ctx.lineTo(x + w, CONFIG.CANVAS_H + 12);
    ctx.closePath();
    const body = ctx.createLinearGradient(0, top, 0, CONFIG.CANVAS_H);
    body.addColorStop(0, '#2B2F36');
    body.addColorStop(1, '#191C21');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.clip();

    // Sheen metálico vertical (dev-6): luz cenital que da volumen.
    const sheen = ctx.createLinearGradient(0, top, 0, CONFIG.CANVAS_H);
    sheen.addColorStop(0, 'rgba(159, 180, 200, 0.16)');
    sheen.addColorStop(0.18, 'rgba(159, 180, 200, 0.02)');
    sheen.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x, top, w, CONFIG.CANVAS_H - top);

    // Corrugado metálico horizontal (bandas tenues) + reflejo cian de la cúpula
    ctx.fillStyle = 'rgba(0, 0, 0, 0.10)';
    for (let yy = top + 26, i = 0; yy < CONFIG.CANVAS_H; yy += 34, i++) {
      ctx.fillRect(x, yy + (i % 2) * 8, w, 3);
    }
    const domeGlow = ctx.createRadialGradient(CONFIG.BASE_X, top, 6, CONFIG.BASE_X, top, 120);
    domeGlow.addColorStop(0, 'rgba(53, 224, 200, 0.10)');
    domeGlow.addColorStop(1, 'rgba(53, 224, 200, 0)');
    ctx.fillStyle = domeGlow;
    ctx.fillRect(CONFIG.BASE_X - 130, top - 10, 260, 120);

    // Sombra proyectada por la FILA de bahías sobre el deck: es lo que
    // hace que las bahías se lean HUNDIDAS en el casco y no pegadas encima.
    const rowShadow = ctx.createLinearGradient(0, T + b.bottom, 0, T + b.bottom + 9);
    rowShadow.addColorStop(0, 'rgba(0, 0, 0, 0.38)');
    rowShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = rowShadow;
    ctx.fillRect(x, T + b.bottom, w, 9);

    // ---- ESPINAZO: el canal estructural que alimenta las bahías ----
    // Un rebaje horizontal bajo la fila de bahías, con el bisel clásico
    // (luz arriba, sombra abajo). Las derivaciones verticales suben hasta
    // cada bahía, así el deck se lee como UNA pieza y no como pads sueltos.
    const spineY = T + b.spineY;
    ctx.fillStyle = '#14181D';
    ctx.fillRect(x + 22, spineY, w - 44, 7);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x + 22, spineY, w - 44, 2);
    ctx.fillStyle = 'rgba(159, 180, 200, 0.16)';
    ctx.fillRect(x + 22, spineY + 7, w - 44, 1);
    for (let i = 0; i < slotXs.length; i++) {
      const sx = slotXs[i];
      ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
      ctx.fillRect(sx - 4, spineY - 5, 8, 6);
      ctx.fillStyle = 'rgba(159, 180, 200, 0.10)';
      ctx.fillRect(sx - 4, spineY - 5, 1.5, 6);
    }

    // ---- LAS 5 BAHÍAS DE MONTAJE ----
    for (let i = 0; i < slotXs.length; i++) {
      const sx = slotXs[i];
      const isGuardian = i === 2;
      const byTop = T + b.top;
      const byBot = T + b.bottom;
      const hw = b.halfW;
      // Bisel exterior (marco): más claro cuanto más cerca del borde libre.
      this._bayPath(ctx, sx, 2);
      ctx.fillStyle = 'rgba(159, 180, 200, 0.26)';
      ctx.fill();
      // Plato hundido
      this._bayPath(ctx, sx, 0);
      ctx.fillStyle = isGuardian ? '#131A1E' : '#12161B';
      ctx.fill();
      ctx.save();
      this._bayPath(ctx, sx, 0);
      ctx.clip();
      // Luz cenital dentro del plato (el deck se hunde)
      const inTop = ctx.createLinearGradient(0, byTop, 0, byTop + 12);
      inTop.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
      inTop.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = inTop;
      ctx.fillRect(sx - hw, byTop, hw * 2, 12);
      // Rieles de guía laterales: por dónde entra la torre al montarse
      ctx.fillStyle = 'rgba(159, 180, 200, 0.10)';
      ctx.fillRect(sx - hw + 4, byTop + 4, 2, byBot - byTop - 8);
      ctx.fillRect(sx + hw - 6, byTop + 4, 2, byBot - byTop - 8);
      // Punto de anclaje central (el eje de la torre)
      ctx.fillStyle = 'rgba(159, 180, 200, 0.13)';
      ctx.beginPath();
      ctx.arc(sx, T - 1, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Abrazaderas: dos mordazas que agarran la base de la torre
      for (const s of [-1, 1]) {
        const cx2 = sx + s * (hw - 3);
        ctx.fillStyle = '#1D232B';
        ctx.fillRect(cx2 - 3, byTop + 6, 6, 11);
        ctx.fillStyle = 'rgba(159, 180, 200, 0.30)';
        ctx.fillRect(cx2 - 3, byTop + 6, 6, 1.5);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(cx2 - 3, byTop + 15.5, 6, 1.5);
      }
      // PATAS: atan la bahía al espinazo, así la fila se lee como una
      // bancada montada sobre el casco y no como pads sueltos.
      for (const s2 of [-1, 1]) {
        const px2 = sx + s2 * (hw - 11);
        ctx.fillStyle = '#191E24';
        ctx.fillRect(px2 - 5, byBot - 2, 10, b.spineY - b.bottom + 4);
        ctx.fillStyle = 'rgba(159, 180, 200, 0.13)';
        ctx.fillRect(px2 - 5, byBot - 2, 1.5, b.spineY - b.bottom + 4);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(px2 + 3.5, byBot - 2, 1.5, b.spineY - b.bottom + 4);
      }
      // Tira de ESTADO dentro de la bahía: el hueco que `player.js`
      // enciende con el acento de la ranura cuando el slot está libre.
      ctx.fillStyle = '#0E1115';
      ctx.fillRect(sx - b.railHalfW, T + b.railY, b.railHalfW * 2, 4);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(sx - b.railHalfW, T + b.railY, b.railHalfW * 2, 1.5);
      ctx.fillStyle = 'rgba(159, 180, 200, 0.12)';
      ctx.fillRect(sx - b.railHalfW, T + b.railY + 4, b.railHalfW * 2, 1);
    }

    // ---- MÓDULOS DE SERVICIO (en los huecos, alineados a la fila) ----
    for (const mx of TOWER_BAY.moduleX) {
      const my = top + 8;
      const mw = 30;
      const mh = 24;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(mx - mw / 2 + 3, my + mh, mw, 4);   // sombra proyectada
      ctx.fillStyle = '#22262D';
      ctx.fillRect(mx - mw / 2, my, mw, mh);
      ctx.fillStyle = 'rgba(159, 180, 200, 0.26)';
      ctx.fillRect(mx - mw / 2, my, mw, 2);
      ctx.fillRect(mx - mw / 2, my, 2, mh);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.fillRect(mx - mw / 2, my + mh - 2, mw, 2);
      ctx.fillRect(mx + mw / 2 - 2, my, 2, mh);
      // Rejilla de ventilación
      ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
      for (let g = 0; g < 3; g++) ctx.fillRect(mx - 9, my + 9 + g * 4, 18, 2);
      // Pernos
      ctx.fillStyle = 'rgba(159, 180, 200, 0.45)';
      for (const [bx2, by2] of [
        [mx - mw / 2 + 5, my + 5], [mx + mw / 2 - 5, my + 5],
        [mx - mw / 2 + 5, my + mh - 5], [mx + mw / 2 - 5, my + mh - 5],
      ]) {
        ctx.beginPath();
        ctx.arc(bx2, by2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // La baliza ámbar se dibuja por frame (arriba, en _drawDeckAnimated)
    }

    // Remaches del casco a lo largo del borde superior
    for (let ix = x + 14; ix < x + w - 10; ix += 24) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
      ctx.beginPath();
      ctx.arc(ix, top + 9, 3.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(159, 180, 200, 0.60)';
      ctx.beginPath();
      ctx.arc(ix, top + 9, 2.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(235, 245, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(ix - 0.6, top + 8.4, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, top + 15, w, 1.5); // junta sombreada

    // ---- LABIO FRONTAL: el canto del deck ----
    const lipY = CONFIG.CANVAS_H - 20;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.fillRect(x, lipY, w, CONFIG.CANVAS_H - lipY + 12);
    ctx.fillStyle = 'rgba(159, 180, 200, 0.30)';
    ctx.fillRect(x, lipY, w, 1.6);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, lipY + 1.6, w, 1.2);
    // Franjas de peligro en los extremos (lectura industrial inmediata)
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 8, lipY + 6, 84, 12);
    ctx.rect(x + w - 92, lipY + 6, 84, 12);
    ctx.clip();
    for (let hx = x - 40; hx < x + w + 40; hx += 16) {
      ctx.fillStyle = 'rgba(255, 196, 106, 0.26)';
      ctx.beginPath();
      ctx.moveTo(hx, lipY + 18);
      ctx.lineTo(hx + 8, lipY + 6);
      ctx.lineTo(hx + 16, lipY + 6);
      ctx.lineTo(hx + 8, lipY + 18);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Remaches del labio
    for (let ix = x + 30; ix < x + w - 24; ix += 34) {
      if (ix > x + 96 && ix < x + w - 100) continue; // saltear las franjas
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.arc(ix, lipY + 12, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(159, 180, 200, 0.5)';
      ctx.beginPath();
      ctx.arc(ix, lipY + 12, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Borde superior iluminado CON glow exterior (estética v3.1 delta A):
    // banda difusa que separa el casco del espacio + línea #9FB4C8 nítida.
    // Fuera del clip para que la luz sangre por encima del borde.
    const edgeGlow = ctx.createLinearGradient(0, top - 9, 0, top + 3);
    edgeGlow.addColorStop(0, 'rgba(159, 180, 200, 0)');
    edgeGlow.addColorStop(1, 'rgba(159, 180, 200, 0.17)');
    ctx.fillStyle = edgeGlow;
    ctx.fillRect(x + 4, top - 9, w - 8, 12);
    ctx.strokeStyle = 'rgba(159, 180, 200, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 6, top + 1);
    ctx.lineTo(x + w - 6, top + 1);
    ctx.stroke();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  _drawFog(ctx) {
    // Niebla: bandas grises con alpha del tema, drift lento (§1.4)
    const th = this.theme ?? THEMES.volcanic;
    for (const f of this.fogBands) {
      const xoff = Math.sin(this._t * f.sp + f.ph) * 30;
      ctx.save();
      ctx.translate(CONFIG.CANVAS_W / 2 + xoff, f.y);
      ctx.scale(1, f.ry / f.rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, f.rx);
      g.addColorStop(0, `rgba(${th.fog}, ${f.a})`);
      g.addColorStop(1, `rgba(${th.fog}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, f.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Niebla Densa envolvente (estética v3.1 delta C): capas bajas que
    // abrazan la plataforma de la que EMERGEN los enemigos (referencia
    // Stage 1). El diseño base la muestra BLANQUECINA y LUMINOSA
    // (translúcida, difumina los pies de las torres, borde superior en
    // fade suave) → base oscura del TEMA + velo claro lechoso por encima,
    // alpha creciente hacia abajo, drift lento y asimétrico.
    // v3 3c/7: la base oscura usa el color de niebla del tema y la densidad
    // total escala con fogMul (night: menos bruma para el fondo general).
    //
    // dev-7 fase 28: la niebla se CACHEA en un 3er canvas offscreen.
    // Antes se dibujaban 8 gradientes radiales POR FRAME (cada uno un arco
    // de hasta 460x64 px = 3.34 Mpx de relleno alpha por frame, el 32 % del
    // fill-rate del juego). La niebla deriva muy despacio (0.04-0.12 rad/s),
    // así que refrescarla cada 3 frames es imperceptible.
    this._drawFogCached(ctx, th);
  }

  /**
   * Blit de la niebla desde su cache (dev-7 fase 28). El cache se
   * refresca cada 3 frames o cuando el tema cambia.
   */
  _drawFogCached(ctx, th) {
    if (!this._fogCache) {
      // Sin document (tests Node) o sin cache: se dibuja directo.
      this._drawFogDirect(ctx, th);
      return;
    }
    this._fogFrameSkip = (this._fogFrameSkip + 1) % 3;
    // Flag propio: `_bgDirty` lo consume el refresh del fondo (que corre
    // antes), así que la niebla necesita el suyo para invalidarse al
    // cambiar de tema.
    if (this._fogDirty || this._fogFrameSkip === 0) {
      this._fogDirty = false;
      const fctx = this._fogCache.ctx;
      fctx.clearRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
      this._drawFogDirect(fctx, th, true);
    }
    ctx.drawImage(this._fogCache.canvas, 0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
    // La silueta de la ciudad va DETRÁS de la plataforma: se dibuja aquí,
    // en el orden correcto (antes se dibujaba al final de la niebla, es
    // decir, ENCIMA de la plataforma, contra su propio comentario).
    if (th.skyline) this._drawSkyline(ctx);
  }

  /** Dibuja la niebla directamente (usado para llenar el cache). */
  _drawFogDirect(ctx, th, isCache = false) {
    const fMul = th.fogMul ?? 1;
    const dense = [
      // v3 3h/7: capas +50 px, abrazando la plataforma baja (810) y el
      // punto de impacto (BASE_Y 850) sin invadir el área de juego.
      { y: 764, rx: 340, ry: 46, a: 0.30, sp: 0.10, ph: 2.6 },
      { y: 802, rx: 380, ry: 52, a: 0.38, sp: 0.08, ph: 0.8 },
      { y: 850, rx: 420, ry: 58, a: 0.48, sp: 0.06, ph: 5.0 },
      { y: 900, rx: 460, ry: 64, a: 0.55, sp: 0.04, ph: 3.1 },
      { y: 750, rx: 300, ry: 40, a: 0.26, sp: 0.12, ph: 1.7, col: '150, 162, 178' },
      { y: 792, rx: 350, ry: 48, a: 0.32, sp: 0.09, ph: 4.2, col: '150, 162, 178' },
      { y: 842, rx: 400, ry: 54, a: 0.38, sp: 0.07, ph: 2.0, col: '150, 162, 178' },
      { y: 896, rx: 440, ry: 60, a: 0.42, sp: 0.05, ph: 5.7, col: '150, 162, 178' },
    ];
    for (const f of dense) {
      const xoff = Math.sin(this._t * f.sp + f.ph) * 26;
      const fcol = f.col ?? th.fog;
      ctx.save();
      ctx.translate(CONFIG.CANVAS_W / 2 + xoff, f.y);
      ctx.scale(1, f.ry / f.rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, f.rx);
      g.addColorStop(0, `rgba(${fcol}, ${(f.a * fMul).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(${fcol}, ${(f.a * fMul * 0.6).toFixed(3)})`);
      g.addColorStop(1, `rgba(${fcol}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, f.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Siluetas pre-generadas de edificios con ventanas encendidas. */
  _generateSkyline() {
    const buildings = [];
    let x = -10;
    while (x < CONFIG.CANVAS_W) {
      const w = rand(34, 72);
      buildings.push({
        x, w,
        h: rand(70, 190),
        windows: Array.from({ length: 3 + ((Math.random() * 5) | 0) }, () => ({
          dx: rand(6, 0.7 * w),
          dy: rand(10, 0.85 * 190),
          on: Math.random() < 0.55,
        })),
      });
      x += w + rand(-4, 8);
    }
    return buildings;
  }

  _drawSkyline(ctx) {
    const baseY = SCENE.PLATFORM_Y + 2; // nacen tras la plataforma
    ctx.save();
    ctx.fillStyle = 'rgba(10, 14, 24, 0.92)';
    for (const b of this._skyline) {
      ctx.fillRect(b.x, baseY - b.h, b.w, b.h);
    }
    // Ventanas encendidas: puntos cálidos tenues
    ctx.fillStyle = 'rgba(255, 214, 130, 0.5)';
    for (const b of this._skyline) {
      for (const win of b.windows) {
        if (!win.on) continue;
        ctx.fillRect(b.x + win.dx, baseY - b.h + win.dy, 3, 4);
      }
    }
    // Antena parpadeante en un edificio alto
    const tall = this._skyline.reduce((a, b) => (b.h > a.h ? b : a), this._skyline[0]);
    if (tall) {
      const blink = 0.5 + 0.5 * Math.sin(this._t * 3);
      ctx.globalAlpha = 0.35 + 0.65 * blink;
      ctx.fillStyle = '#FF5555';
      ctx.beginPath();
      ctx.arc(tall.x + tall.w / 2, baseY - tall.h - 6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawJuice(ctx) {
    // Partículas: círculos que se apagan con la vida (glow suave dev-6)
    for (const p of this.particles) {
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Floats: números/texto flotante LEGIBLES (contorno oscuro + glow + pop)
    for (const f of this.floats) {
      const t = 1 - f.age / f.life;
      const grow = 1 + 0.5 * (1 - t);            // escala: grande al nacer
      // dev-7 fase 28: `f.scale` (la magnitud del golpe) hace que un
      // cañonazo se lea distinto de un tiro flojo. Antes el tamaño era
      // fijo (17-22 px) para todos los impactos.
      const size = Math.round((17 + 5 * (1 - t)) * grow * (f.scale ?? 1));
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 1.35);
      // dev-7 fase 37: 'Share Tech Mono' NO está embebida (su licencia no
      // lo permite) → el canvas caía a la monoespaciada del sistema, que
      // es visualmente de otro juego. Ahora usa la tabular embebida
      // (ChakraPetch → Exo2, igual que el HUD DOM).
      ctx.font = `${size}px 'ChakraPetch', 'Exo2', ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}

// ------------------------------------------------------------
// FASE 58 — ALTO LÓGICO FORZADO (headless).
//
// En el navegador el alto lógico sale del marco real (relayout()). En
// Node no hay marco: para poder COMPARAR layouts (el simulador de
// balance, los tests) se puede forzar con la variable de entorno
// GDF_LOGICAL_H:
//
//   GDF_LOGICAL_H=1195 node scripts/balance-sim.mjs --stage=10 --seeds=6
//
// Con 880 (o sin la variable) el layout es el de referencia: el juego
// se comporta EXACTAMENTE como antes de la fase 58.
// ------------------------------------------------------------
if (typeof process !== 'undefined' && process?.env?.GDF_LOGICAL_H) {
  const forced = Number(process.env.GDF_LOGICAL_H);
  if (Number.isFinite(forced) && forced > 0) setLogicalHeight(forced);
}
