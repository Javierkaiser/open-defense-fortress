// ============================================================
// audio.js — AudioManager (v3 5/7, BUG-004: música techno real)
// SFX: desde dev-7 fase 5, los eventos con un .ogg real equivalente en
// assets/sfx/ (ver SFX_FILES) usan ese sample; el resto sigue por
// síntesis WebAudio como antes (cero archivo, restricción §0).
// El sintetizado de cada caso queda como FALLBACK si el sample real no
// está disponible/falla — nunca se pierde el sonido.
// Loop techno/psytrance sigue 100% por síntesis (no se descargó música,
// solo SFX puntuales): kick 4/4 + bajo en La menor con capas por
// intensidad (calma → ola → boss → crítico), fades suaves y ducking en
// pausa.
// dev-7 fase 25: el pool de <audio> está dimensionado por la duración
// real de cada sample (pool × throttle ≥ duración → el sample NO se
// corta) y un elemento que ya está sonando nunca se reinicia.
// dev-7 fase 26: se conectan los 7 samples que estaban sin usar (el
// arsenal por fin se oye), la base al recibir daño deja de ser muda,
// 'gameover' deja de compartir archivo con 'explosion' y la música
// gana un 4º nivel de intensidad (presión máxima).
// ============================================================

// ---------- dev-7 fase 5: mapa evento → sample real ----------
// <audio> plano (no AudioBufferSource/decodeAudioData) a propósito: bajo
// file:// (abrir index.html con doble clic, soportado por el README)
// fetch() puede fallar por CORS, mientras que <audio src="local.ogg">
// carga igual con o sin servidor. `gain` es una atenuación relativa
// (0-1) para no perder la mezcla ya afinada de la versión sintetizada —
// los .ogg de Kenney vienen normalizados más "fuerte" que los tonos
// sintetizados base, así que no se puede poner todo a volumen 1.
// Es un primer ajuste a ojo/oreja del propio dev-7: si algo suena
// desbalanceado en juego real, tocar solo estos números.
// dev-7 fase 9: exportados (antes internos) para que tests/test-audio.mjs
// pueda verificar que cada archivo referenciado existe de verdad en
// assets/sfx/, sin duplicar este mapa a mano en el test.
//
// ---------- fase 26: tabla del arsenal (un sample por torre/dron) ----------
// Cada torre tiene su PROPIO archivo: el jugador tiene que distinguir de
// un vistazo qué está disparando. Solo se reutiliza un archivo cuando las
// dos torres suenan igual por naturaleza (proyectil), y el matiz se saca
// del gain y del throttle:
//   missile → shot_pew.ogg       (235 ms)  Lanzamiento de misil: "pew" retro
//   gauss   → laser_digital.ogg  (1100 ms) Cañón de agujas: zap digital largo
//   beam    → shield_field.ogg   (954 ms)  Haz continuo: zumbido de campo
//   bolt    → click_ui.ogg       (100 ms)  Thunderstroke: rayo seco y corto
//   chain   → click_ui_alt.ogg   (367 ms)  Tesla: crepitar con más cuerpo
//   mortar  → blob_slime.ogg     (500 ms)  Impacto blando del mortero
//   drone   → shot_pew.ogg       (235 ms)  Dron: proyectil pequeño → comparte
//                                          el "pew" del misil (misma familia
//                                          "torre de proyectil"); se distingue
//                                          por gain (0.25) y throttle (140 ms)
//   laser   → laser_beam.ogg     (744 ms)  Torre Láser (ya existía)
// La torre Beam NO comparte con la Láser: son dos torres distintas
// (haz verde continuo vs láser rojo) y suenan distinto.
// Nota: 'gameover' y 'explosion' tampoco comparten archivo (perder la base
// no puede sonar igual que matar a un jefe).
export const SFX_FILES = {
  shot: 'assets/sfx/shot_bullet.ogg',
  kill: 'assets/sfx/explosion_small.ogg',
  explosion: 'assets/sfx/explosion_alt.ogg',
  levelup: 'assets/sfx/level_up.ogg',
  stageclear: 'assets/sfx/stage_clear.ogg',
  gameover: 'assets/sfx/explosion.ogg', // la base explota (archivo propio: ≠ 'explosion')
  warning: 'assets/sfx/boss_warning.ogg',
  card: 'assets/sfx/card_select.ogg',
  ultimate: 'assets/sfx/ultimate.ogg',
  laser: 'assets/sfx/laser_beam.ogg',
  // --- fase 26: la base deja de ser muda ---
  baseHit: 'assets/sfx/impact_light.ogg',  // la base recibe daño
  baseBlocked: 'assets/sfx/shield_field.ogg', // golpe ABSORBIDO por el Escudo de Base
  // --- fase 26: el arsenal se oye (eventos que emite js/towers.js) ---
  missile: 'assets/sfx/shot_pew.ogg',      // missile:fire
  gauss: 'assets/sfx/laser_digital.ogg',  // gauss:fire
  beam: 'assets/sfx/shield_field.ogg',    // beam:fire
  bolt: 'assets/sfx/click_ui.ogg',        // bolt:fire  (Thunderstroke)
  chain: 'assets/sfx/click_ui_alt.ogg',   // chain:fire (Tesla)
  mortar: 'assets/sfx/blob_slime.ogg',    // mortar:fire
  drone: 'assets/sfx/shot_pew.ogg',        // drone:fire (los 3 drones)
  // dev-7 fase 25: señal sonora de perks raros (ver procFx en towers.js)
  perkExecute: 'assets/sfx/impact_hit.ogg',   // remate
  perkBoom: 'assets/sfx/explosion.ogg',        // explosión al matar
};
export const SFX_GAIN = {
  shot: 0.2, kill: 0.5, explosion: 0.85, levelup: 0.6, stageclear: 0.7,
  gameover: 0.85, warning: 0.75, card: 0.55, ultimate: 0.8, laser: 0.5,
  // fase 26: 'shot' bajó a 0.2 (era un fondo que tapaba todo lo demás) y
  // 'warning' subió a 0.75: el aviso de jefe es la alerta más importante.
  baseHit: 0.75, baseBlocked: 0.5,
  missile: 0.3, gauss: 0.45, beam: 0.35, bolt: 0.32, chain: 0.32,
  mortar: 0.5, drone: 0.25,
  perkExecute: 0.5, perkBoom: 0.45,
};
// ---------- dev-7 fase 25: pool dimensionado por duración real ----------
// Tamaño de pool por sonido (permite solapar disparos rápidos sin cortar
// la instancia anterior).
// REGLA: el pool debe ser lo bastante grande para que
// pool × throttle ≥ duración del sample; si no, el sample se corta
// (el elemento del pool se reinicia con currentTime = 0 mientras suena).
// Duraciones medidas de los .ogg reales (44100 Hz, leídas del contenedor
// Ogg — ver tests/test-audio.mjs):
//   shot_bullet.ogg 239 ms · explosion_small.ogg 777 ms · laser_beam.ogg 744 ms
//   impact_hit.ogg 688 ms · explosion.ogg 1256 ms · explosion_alt.ogg 1553 ms
//   level_up.ogg 444 ms · stage_clear.ogg 392 ms · boss_warning.ogg 165 ms
//   card_select.ogg 290 ms · ultimate.ogg 340 ms
//   shot_pew.ogg 235 ms · laser_digital.ogg 1100 ms · blob_slime.ogg 500 ms
//   shield_field.ogg 954 ms · click_ui.ogg 100 ms · click_ui_alt.ogg 367 ms
//   impact_light.ogg 118 ms
export const SFX_POOL_SIZE = {
  // --- sonidos con throttle (pueden solaparse rápido) ---
  shot: 6,         // 6 × 90 ms = 540 ms ≥ 239 ms
  kill: 20,        // 20 × 40 ms = 800 ms ≥ 777 ms
  perkExecute: 5,  // 5 × 150 ms = 750 ms ≥ 688 ms
  perkBoom: 9,     // 9 × 150 ms = 1350 ms ≥ 1256 ms
  baseHit: 4,      // 4 × 120 ms = 480 ms ≥ 118 ms
  baseBlocked: 5,  // 5 × 200 ms = 1000 ms ≥ 954 ms
  missile: 4,      // 4 × 120 ms = 480 ms ≥ 235 ms
  gauss: 4,        // 4 × 300 ms = 1200 ms ≥ 1100 ms
  beam: 3,         // 3 × 340 ms = 1020 ms ≥ 954 ms
  bolt: 4,         // 4 × 110 ms = 440 ms ≥ 100 ms
  chain: 3,        // 3 × 180 ms = 540 ms ≥ 367 ms
  mortar: 3,       // 3 × 300 ms = 900 ms ≥ 500 ms
  drone: 4,        // 4 × 140 ms = 560 ms ≥ 235 ms
  // 'kill' sube el pool (no el throttle) a propósito: subir el throttle a
  // 100 ms pediría solo 8 elementos, pero cambiaría la densidad de "pops"
  // de muerte (25/s → 10/s) y se oiría peor en las matanzas masivas.
  // --- sonidos de evento único (sin throttle: no se solapan en la práctica) ---
  laser: 3,        // 744 ms — el láser dispara espaciado, no hace falta más
  explosion: 3,    // 1553 ms (explosion_alt) — muerte de jefe: muy rara, 3 de margen
  levelup: 2,
  stageclear: 2,
  gameover: 2,     // 1256 ms (explosion.ogg, archivo PROPIO ya que ≠ 'explosion')
  warning: 2,      // los 3 pulsos del sting van con setTimeout (620/1240 ms)
  card: 2,
  ultimate: 2,
};
// Pool por defecto para nombres sin entrada explícita (eventos nuevos).
export const SFX_POOL_DEFAULT = 2;

// Throttle por nombre (ms): evita ametrallar el grafo de audio cuando
// muchas balas conectan en un mismo frame (presupuesto de nodos).
// Solo nombres VIVOS: cada clave debe existir en SFX_FILES o ser un `case`
// real del switch de sfx() (lo verifica tests/test-audio.mjs).
export const SFX_THROTTLE_MS = {
  shot: 90, kill: 40, perkExecute: 150, perkBoom: 150,
  // fase 26: el 'shot' genérico pasó de 45 a 90 ms (a 45 ms era un fondo
  // continuo que tapaba el resto del arsenal) y cada torre tiene su
  // propio ritmo según lo rápido que dispara.
  baseHit: 120, baseBlocked: 200,
  missile: 120, gauss: 300, beam: 340, bolt: 110, chain: 180,
  mortar: 300, drone: 140,
};
// Throttle por defecto (ms) para sonidos sin entrada explícita.
export const SFX_THROTTLE_DEFAULT = 25;

/** Tamaño del pool de `name` (nº de <audio> disponibles). */
export function poolSize(name) {
  return SFX_POOL_SIZE[name] ?? SFX_POOL_DEFAULT;
}

/** Throttle de `name` en ms. */
export function throttleMs(name) {
  return SFX_THROTTLE_MS[name] ?? SFX_THROTTLE_DEFAULT;
}

/**
 * Ventana de no-truncado de `name` en ms: pool × throttle.
 * Si la duración real del sample supera esta ventana, el sample se corta.
 */
export function poolWindowMs(name) {
  return poolSize(name) * throttleMs(name);
}

export class AudioManager {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    // master × music / master × sfx: los dos buses son independientes, así
    // que se puede silenciar el SFX (accesibilidad) sin tocar la música.
    this.volumes = { master: 0.8, music: 0.6, sfx: 0.85 };
    this.sfxMuted = false;      // mute de SFX (independiente del toggle ♪)
    this._sfxLevel = 0.85;       // último nivel de SFX pedido (para restaurar)
    this.intensity = 1;
    this.musicOn = false;
    this.musicMuted = false; // preferencia del toggle ♪ (default: música ON)
    this.musicPaused = false; // ducking FSM (PAUSED/CARD_CHOICE)
    this._musicTimer = null;  // id del scheduler lookahead
    this._step = 0;           // semicorchea actual (patrón de 64)
    this._nextStepTime = 0;   // tiempo de audio del próximo paso
    // Throttle por nombre: ver SFX_THROTTLE_MS (tabla exportada).
    this._lastAt = new Map();
    this._throttleMs = SFX_THROTTLE_MS;
  }

  /**
   * Crear el AudioContext en el PRIMER gesto del usuario
   * (política de autoplay de navegadores).
   */
  init() {
    if (this.ctx) return;
    if (typeof window === 'undefined') return; // Node/tests: sin audio
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    } catch (_err) {
      this.ctx = null; // sin audio disponible: el juego nunca se bloquea
    }
  }

  resume() {
    if (!this.ctx || this.ctx.state !== 'suspended') return;
    try {
      // Algunos navegadores viejos devuelven undefined en vez de Promise.
      const p = this.ctx.resume();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_err) { /* el audio no puede tumbar el juego */ }
  }

  /** Envoltorio: crea oscilador+ganancia con envelope exponencial. */
  _tone({ type = 'square', f0 = 440, f1 = null, dur = 0.15, vol = 0.3,
    attack = 0.002, when = 0, detune = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    if (t0 < this.ctx.currentTime - 0.05) return; // nunca en el pasado
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t0);
    if (f1 !== null && f1 !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    }
    if (detune) osc.detune.setValueAtTime(detune, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this._sfxBus());
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /** Ruido blanco filtrado para explosiones/impactos. */
  _noise({ dur = 0.3, vol = 0.4, f = 800, q = 0.8, type = 'lowpass', when = 0,
    sweepTo = null }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, Math.max(n, 1), this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f, t0);
    flt.Q.value = q;
    if (sweepTo) flt.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt).connect(g).connect(this._sfxBus());
    src.start(t0);
  }

  /** Bus SFX compartido con el volumen configurado (creado lazy). */
  _sfxBus() {
    if (!this._bus) {
      this._bus = this.ctx.createGain();
      this._bus.gain.value = this.volumes.sfx * this.volumes.master;
      this._bus.connect(this.ctx.destination);
    }
    return this._bus;
  }

  // ---------- dev-7 fase 5: pool de <audio> reales por evento ----------
  /** Crea (lazy, una vez) el pool de <audio> de `name`; null si no hay sample. */
  _realPool(name) {
    if (!this._pools) this._pools = {};
    if (this._pools[name]) return this._pools[name];
    const src = SFX_FILES[name];
    if (!src) return null;
    const size = poolSize(name);
    const list = [];
    for (let i = 0; i < size; i++) {
      try {
        const el = new Audio(src);
        el.preload = 'auto';
        list.push(el);
      } catch (_err) {
        return null; // sin <audio> (entorno raro) → cae a la síntesis
      }
    }
    const pool = { list, idx: 0 };
    this._pools[name] = pool;
    return pool;
  }

  /**
   * true si el <audio> NO está sonando (terminado o en pausa).
   * `paused`/`ended` no existen en navegadores muy antiguos: si no hay
   * dato, se trata el elemento como libre (nunca se pierde un sonido).
   */
  _isIdle(el) {
    try {
      if (el.ended === true) return true;   // el sample ya terminó
      if (el.paused === true) return true;   // en pausa → no suena
      if (el.paused === undefined && el.ended === undefined) return true; // no se puede saber
      return false;                          // paused === false → sonando
    } catch (_err) {
      return true;
    }
  }

  /**
   * Elige un <audio> del pool que NO esté sonando: así `currentTime = 0`
   * nunca corta un sample en curso. Empieza por el índice round-robin para
   * repartir las instancias; si TODOS están ocupados (raro: el pool está
   * dimensionado por pool × throttle ≥ duración del sample) cae al
   * round-robin clásico, que es el último recurso.
   */
  _pickIdle(pool) {
    const list = pool.list;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const k = (pool.idx + i) % n;
      if (this._isIdle(list[k])) {
        pool.idx = (k + 1) % n;
        return list[k];
      }
    }
    const el = list[pool.idx];
    pool.idx = (pool.idx + 1) % n;
    return el;
  }

  /** Intenta reproducir el sample real de `name`. true si lo disparó. */
  _playReal(name) {
    const vol = this.volumes.sfx * this.volumes.master * (SFX_GAIN[name] ?? 0.6);
    // SFX silenciado (volumen 0): no se dispara nada (ni sample ni síntesis).
    if (vol <= 0) return true;
    const pool = this._realPool(name);
    if (!pool) return false;
    const el = this._pickIdle(pool);
    try {
      el.currentTime = 0;
      el.volume = Math.max(0, Math.min(1, vol));
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {}); // autoplay bloqueado: silencio, no rompe nada
      return true;
    } catch (_err) {
      return false; // sin <audio> disponible (entorno raro) → cae al sintetizado
    }
  }

  // ============================================================
  // MÚSICA (v3 5/7, BUG-004): loop techno/psytrance por síntesis.
  // Scheduler lookahead (patrón "tale of two clocks"): un setInterval
  // programa notas ~120 ms adelante sobre ctx.currentTime, inmune a
  // jank del rAF. Capas por ganancia (fades suaves), NO por nodos
  // on/off → sin clicks y transiciones audibles entre estados.
  //   L1 base     : kick 4/4 + bajo psytrance en La menor (siempre)
  //   L2 ola      : hats off-beat + pluck de octava (intensity ≥ 2)
  //   L3 boss     : lead de 16avos + sub-octava del bajo (intensity ≥ 3)
  //   L4 crítico  : clap en el contra-tiempo + arpegio agudo + tom de
  //                 relleno (intensity ≥ 4) — "la base está en peligro"
  // Ducking: PAUSED/CARD_CHOICE → gain global a 35 % (la música no
  // muere, queda "lejos"); PLAYING → 100 %. Volumen music BAJO para
  // no tapear los SFX (bus propio, mezcla master 0.5×0.8).
  // ============================================================
  /** Tempo del loop (BPM). 4 beats/compás; step = semicorchea. */
  static get BPM() { return 138; }
  /** Nº máximo de niveles de intensidad de la música (L1..L4). */
  static get MAX_INTENSITY() { return 4; }

  startMusic(_theme) {
    this.musicOn = true;
    if (!this.ctx) return;
    this.resume();
    if (this._musicTimer !== null) return; // ya corriendo
    if (!this._musicBus) {
      const bus = this.ctx.createGain();
      bus.gain.value = this.volumes.music * this.volumes.master;
      bus.connect(this.ctx.destination);
      this._musicBus = bus;
    }
    // Estado interno del secuenciador
    this._step = 0;
    this._nextStepTime = this.ctx.currentTime + 0.06;
    // Las capas arrancan en el nivel de intensidad ya pedido (si el
    // juego llamó setIntensity antes del primer gesto de usuario).
    this._layerGain(2).gain.value = this.intensity >= 2 ? 1 : 0;
    this._layerGain(3).gain.value = this.intensity >= 3 ? 1 : 0;
    this._layerGain(4).gain.value = this.intensity >= 4 ? 1 : 0;
    this._applyMusicDucking();
    this._musicTimer = setInterval(() => this._musicScheduler(), 25);
    this._musicScheduler();
  }

  stopMusic() {
    this.musicOn = false;
    if (this._musicTimer !== null) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
  }

  /**
   * Intensidad 1|2|3|4 (presión en juego, de menor a mayor):
   *   L1 CALMA   — sin enemigos: kick + bajo. Entre olas / arranque.
   *   L2 OLA     — oleada en curso: + hats off-beat + pluck de octava.
   *   L3 JEFE    — boss en pantalla: + lead de 16avos + sub-grave.
   *   L4 CRÍTICO — la base está en peligro (HP bajo / many leaks): + clap
   *                en el contra-tiempo, arpegio agudo y tom de relleno.
   * Mueve SOLO ganancias de las capas con rampas de ~0.8 s (fade musical,
   * sin clicks). Idempotente. El valor SIEMPRE se guarda: si aún no hay
   * ctx/bus, se aplica al arrancar la música (ver startMusic).
   * Valores fuera de rango se acotan a 1..4 (n|0 trunca decimales).
   */
  setIntensity(n) {
    const target = Math.min(AudioManager.MAX_INTENSITY, Math.max(1, n | 0));
    if (target === this.intensity) return;
    this.intensity = target;
    this._applyIntensityGains();
  }

  /** Rampas de ganancia de capas según this.intensity (no-op sin ctx). */
  _applyIntensityGains() {
    if (!this.ctx || !this._musicBus) return;
    const t0 = this.ctx.currentTime;
    // p ya es el AudioParam (node.gain): cancel → ancla en el valor
    // actual → rampa suave hasta el objetivo.
    const ramp = (p, v) => p.cancelScheduledValues(t0)
      || p.setValueAtTime(p.value, t0)
      || p.linearRampToValueAtTime(v, t0 + 0.8);
    ramp(this._layerGain(2).gain, this.intensity >= 2 ? 1 : 0);
    ramp(this._layerGain(3).gain, this.intensity >= 3 ? 1 : 0);
    ramp(this._layerGain(4).gain, this.intensity >= 4 ? 1 : 0);
  }

  /** Ducking por FSM (main.js): pausa/cartas bajan la música, no la cortan. */
  setPaused(p) {
    this.musicPaused = !!p;
    this._applyMusicDucking();
  }

  _applyMusicDucking() {
    if (!this.ctx || !this._musicBus) return;
    const bus = this._musicBus.gain;
    const target = (this.musicOn && !this.musicPaused)
      ? this.volumes.music * this.volumes.master
      : this.volumes.music * this.volumes.master * 0.35;
    const t0 = this.ctx.currentTime;
    bus.cancelScheduledValues(t0);
    bus.setValueAtTime(bus.value, t0);
    bus.linearRampToValueAtTime(target, t0 + 0.25);
  }

  /**
   * Volúmenes del juego: `{ master, music, sfx }` (0..1).
   * · Los valores se acotan a [0,1] (un valor roto nunca rompe la mezcla).
   * · `sfx: 0` (o `setSfxMuted(true)`) silencia TODO el SFX —samples
   *   reales incluidos— SIN tocar la música: el bus de SFX baja a 0 y los
   *   <audio> dejan de dispararse.
   * · `music` es independiente del SFX (bus propio): se puede bajar la
   *   música o el SFX por separado (accesibilidad).
   */
  setVolumes(v = {}) {
    if (v && typeof v === 'object') {
      for (const key of ['master', 'music', 'sfx']) {
        const val = v[key];
        if (typeof val !== 'number' || !Number.isFinite(val)) continue;
        const c = Math.max(0, Math.min(1, val));
        this.volumes[key] = c;
        if (key === 'sfx') {
          // sfx: 0 = mute; cualquier valor > 0 = nivel pedido (y desmute).
          if (c > 0) { this.sfxMuted = false; this._sfxLevel = c; }
          else this.sfxMuted = true;
        }
      }
    }
    this._applySfxGain();
    this._applyMusicDucking();
  }

  /** Nivel de SFX (0..1). 0 = silenciado. */
  setSfxVolume(v) { this.setVolumes({ sfx: v }); }

  /** Nivel de música (0..1), independiente del SFX. */
  setMusicVolume(v) { this.setVolumes({ music: v }); }

  /**
   * Silencia (o no) TODO el SFX sin tocar la música. Devuelve el estado
   * resultante (true = SFX mudos).
   */
  setSfxMuted(muted) {
    if (muted) {
      this.sfxMuted = true;
      this.volumes.sfx = 0;
    } else {
      this.sfxMuted = false;
      this.volumes.sfx = this._sfxLevel;
    }
    this._applySfxGain();
    return this.sfxMuted;
  }

  /** Invierte el mute de SFX. Devuelve el estado nuevo (true = mudos). */
  toggleSfxMuted() { return this.setSfxMuted(!this.sfxMuted); }

  /** Aplica el volumen de SFX al bus (no-op si aún no hay bus). */
  _applySfxGain() {
    if (!this._bus) return;
    this._bus.gain.value = this.volumes.sfx * this.volumes.master;
  }

  /** Scheduler lookahead: programa todos los pasos cuyo tiempo ya llegó. */
  _musicScheduler() {
    if (!this.ctx || !this.musicOn) return;
    this.resume();
    // Tras una suspensión larga (background) `_nextStepTime` quedó atrás:
    // sin re-sincronizar, el primer tick agenda cientos de pasos de golpe.
    if (this._nextStepTime < this.ctx.currentTime - 0.5) {
      this._nextStepTime = this.ctx.currentTime + 0.05;
    }
    const stepDur = 60 / AudioManager.BPM / 4; // semicorchea
    while (this._nextStepTime < this.ctx.currentTime + 0.12) {
      try {
        this._scheduleStep(this._step, this._nextStepTime);
      } catch (_err) { /* un paso roto nunca mata el loop */ }
      this._nextStepTime += stepDur;
      this._step = (this._step + 1) % 64; // 4 compases de patrón
    }
  }

  /**
   * Un paso de semicorchea (16 steps/compás, patrón de 64).
   * Todo conecta al bus de música con envelope corto por nota.
   */
  _scheduleStep(step, t) {
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const beat = s16 % 4 === 0;

    // --- L1a: kick 4/4 (siempre) ---
    if (beat) this._kick(t);

    // --- L1b: bajo psytrance en La menor — 16avos con acentos (siempre) ---
    // A1 · A1 · C2 · A1 | A1 · G1 · A1 · E2  (raíz variando por compás)
    const ROOTS = [55.0, 55.0, 65.41, 55.0]; // A1 A1 C2 A1
    const ALT = [82.41, 73.42, 82.41, 110.0]; // E2 G1?→A2 G2 A2 (notas de paso)
    if (s16 % 2 === 0) {
      const root = ROOTS[bar];
      const f = (s16 === 6 || s16 === 14) ? ALT[bar] : root;
      this._bass(f, t, s16 % 4 === 0 ? 0.30 : 0.21);
    }
    // Sub-pulso del bajo en el off-beat (sensación psytrance)
    if (s16 % 4 === 2) this._bass(ROOTS[bar] * 2, t, 0.10);

    // --- L2 (intensity ≥ 2): hats off-beat + pluck octava ---
    if (this.intensity >= 2) {
      if (s16 % 4 === 2) this._hat(t, 0.20);
      else if (s16 % 2 === 1 && s16 % 8 >= 5) this._hat(t, 0.10); // ghost 16avos
      // Pluck brillante cada corchea alternando octavas (tensión de ola)
      if (s16 % 2 === 0 && (s16 === 4 || s16 === 10)) {
        this._pluck(ROOTS[bar] * 8, t);
      }
    }

    // --- L3 (intensity = 3): lead 16avos + sub grave extra ---
    if (this.intensity >= 3) {
      const ARP = [220.0, 261.63, 329.63, 261.63]; // Am arpegio
      const arpF = ARP[(step * 3) % ARP.length];
      this._lead(arpF, t, s16 % 4 === 0 ? 0.13 : 0.09);
      if (beat) this._bass(ROOTS[bar], t, 0.16, 0.5); // refuerzo sub
    }

    // --- L4 (intensity ≥ 4): presión máxima — clap, arpegio y relleno ---
    if (this.intensity >= 4) {
      // Clap en el contra-tiempo (beats 2 y 4 del compás)
      if (s16 === 4 || s16 === 12) this._clap(t, 0.20);
      // Arpegio agudo de 16avos: tensión constante por encima del lead
      const ARP4 = [220.0, 261.63, 329.63, 392.0];
      this._arp16(ARP4[(step * 5) % ARP4.length], t, s16 % 4 === 0 ? 0.085 : 0.055);
      // Tom de relleno al final del compás
      if (s16 === 14) this._tom(t, 0.18);
    }
  }

  // ---------- Voces de la música (cada una crea sus nodos y los libera) ----------

  /** Kick sintetizado: sine con pitch-drop 150→45 Hz + click de ataque. */
  _kick(t) {
    const c = this.ctx;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g).connect(this._layerGain(1));
    osc.start(t);
    osc.stop(t + 0.25);
  }

  /** Bajo: sawtooth filtrado lowpass con envelope pluck. */
  _bass(freq, t, vol, decay = 0.16) {
    const c = this.ctx;
    const osc = c.createOscillator();
    const flt = c.createBiquadFilter();
    const g = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(700, t);
    flt.frequency.exponentialRampToValueAtTime(180, t + decay);
    flt.Q.value = 6; // resonancia ácida suave
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.connect(flt).connect(g).connect(this._layerGain(1));
    osc.start(t);
    osc.stop(t + decay + 0.02);
  }

  /** Hat sintetizado: buffer corto de ruido + highpass. */
  _hat(t, vol) {
    const c = this.ctx;
    const n = Math.floor(c.sampleRate * 0.05);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(hp).connect(g).connect(this._layerGain(2));
    src.start(t);
    src.stop(t + 0.05);
  }

  /** Pluck: square corto brillante con decay rápido. */
  _pluck(freq, t) {
    const c = this.ctx;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g).connect(this._layerGain(2));
    osc.start(t);
    osc.stop(t + 0.14);
  }

  /** Lead de boss: sawtooth agudo, doble voz detunada. */
  _lead(freq, t, vol) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    for (const dt of [-7, 7]) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(Math.max(20, freq), t);
      osc.detune.setValueAtTime(dt, t);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.13);
    }
    g.connect(this._layerGain(3));
  }

  /**
   * Gain-node por capa (lazy): las capas SIEMPRE suenan en el scheduler,
   * pero con gain 0 cuando su intensidad no corresponde → los fades de
   * setIntensity() son puramente de ganancia (sin clicks ni huecos).
   */
  _layerGain(n) {
    const key = `_layer${n}`;
    if (!this[key]) {
      const g = this.ctx.createGain();
      g.gain.value = n === 1 ? 1 : 0;
      g.connect(this._musicBus);
      this[key] = g;
    }
    return this[key];
  }

  // ---------- voces de la capa 4 (presión máxima) ----------

  /** Clap: ráfaga de ruido con caída exponencial (contra-tiempo). */
  _clap(t, vol) {
    const c = this.ctx;
    const n = Math.floor(c.sampleRate * 0.14);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 1.1;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.connect(bp).connect(g).connect(this._layerGain(4));
    src.start(t);
    src.stop(t + 0.15);
  }

  /** Arpegio de 16avos (capa 4): sawtooth corto y filtrado. */
  _arp16(freq, t, vol) {
    const c = this.ctx;
    const osc = c.createOscillator();
    const flt = c.createBiquadFilter();
    const g = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(2600, t);
    flt.frequency.exponentialRampToValueAtTime(900, t + 0.09);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(flt).connect(g).connect(this._layerGain(4));
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** Tom de relleno (capa 4): sine con caída de tono. */
  _tom(t, vol) {
    const c = this.ctx;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(210, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.13);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g).connect(this._layerGain(4));
    osc.start(t);
    osc.stop(t + 0.17);
  }

  /** SFX por nombre — todos los eventos canónicos del juego. */
  sfx(name, _opts = {}) {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      // Si el contexto quedó suspendido (background, música muteada), hay
      // que reanudarlo: antes el SFX se descartaba y nadie lo reactivaba.
      this.resume();
      if (this.ctx.state !== 'running') return;
    }
    const now = performance.now();
    const thr = this._throttleMs[name] ?? SFX_THROTTLE_DEFAULT;
    if (now - (this._lastAt.get(name) ?? 0) < thr) return;
    this._lastAt.set(name, now);

    // dev-7 fase 5: sample real primero (ver SFX_FILES). 'warning' repite
    // el sting 3 veces (setTimeout) para conservar el patrón de alerta de
    // 3 pulsos que tenía la versión sintetizada; el resto es reemplazo
    // directo 1:1. Si el sample falla/no está, cae al switch de abajo.
    if (name === 'warning') {
      if (this._playReal('warning')) {
        setTimeout(() => this._playReal('warning'), 620);
        setTimeout(() => this._playReal('warning'), 1240);
        return;
      }
    } else if (SFX_FILES[name] && this._playReal(name)) {
      return;
    }

    switch (name) {
      case 'shot': // bala láser corta descendente
        this._tone({ type: 'square', f0: 950, f1: 320, dur: 0.07, vol: 0.10 });
        break;
      case 'kill': // pop brillante ascendente
        this._tone({ type: 'triangle', f0: 420, f1: 900, dur: 0.12, vol: 0.16 });
        this._noise({ dur: 0.14, vol: 0.14, f: 900, sweepTo: 2400 });
        break;
      case 'explosion': // grave con sub
        this._noise({ dur: 0.5, vol: 0.5, f: 700, sweepTo: 90 });
        this._tone({ type: 'sine', f0: 120, f1: 38, dur: 0.42, vol: 0.35 });
        break;
      case 'levelup': // arpegio dorado ascendente
        [523.25, 659.26, 783.99, 1046.5].forEach((f, i) => {
          this._tone({ type: 'triangle', f0: f, dur: 0.16, vol: 0.22, when: i * 0.09 });
        });
        break;
      case 'stageclear': // fanfarria mayor
        [392, 523.25, 659.26, 783.99, 1046.5].forEach((f, i) => {
          this._tone({ type: 'square', f0: f, dur: 0.22, vol: 0.18, when: i * 0.12 });
        });
        break;
      case 'gameover': // descendente menor
        [392, 349.23, 293.66, 220].forEach((f, i) => {
          this._tone({ type: 'sawtooth', f0: f, dur: 0.34, vol: 0.16, when: i * 0.17 });
        });
        break;
      case 'warning': // sirena dos tonos
        for (let i = 0; i < 3; i++) {
          this._tone({ type: 'square', f0: 740, f1: 480, dur: 0.28, vol: 0.2, when: i * 0.62 });
          this._tone({ type: 'square', f0: 480, f1: 740, dur: 0.28, vol: 0.2, when: i * 0.62 + 0.31 });
        }
        break;
      case 'ult_ready': // pulso doble al completar carga
        this._tone({ type: 'triangle', f0: 660, dur: 0.1, vol: 0.2 });
        this._tone({ type: 'triangle', f0: 880, dur: 0.16, vol: 0.2, when: 0.11 });
        break;
      case 'card': // reveal de cartas LEVEL UP (D7): destello ascendente
        this._tone({ type: 'triangle', f0: 740, f1: 1480, dur: 0.18, vol: 0.22 });
        this._tone({ type: 'sine', f0: 1480, dur: 0.1, vol: 0.12, when: 0.09 });
        break;
      case 'ultimate': // lanzamiento: barrido ascendente masivo
        this._tone({ type: 'sawtooth', f0: 180, f1: 1400, dur: 0.5, vol: 0.3 });
        this._noise({ dur: 0.6, vol: 0.3, f: 400, sweepTo: 3000 });
        break;
      case 'blackhole': // vórtice: caída grave con trémolo de succión
        this._tone({ type: 'sine', f0: 900, f1: 55, dur: 1.2, vol: 0.28 });
        this._noise({ dur: 1.4, vol: 0.22, f: 300, sweepTo: 60, q: 6 });
        break;
      case 'firework': // D6 (BUG-006): campana dorada del multi-kill
        [1318.5, 1568, 2093].forEach((f, i) => {
          this._tone({ type: 'triangle', f0: f, dur: 0.14, vol: 0.16, when: i * 0.05 });
        });
        this._noise({ dur: 0.35, vol: 0.12, f: 2600, sweepTo: 5200 });
        break;
      case 'orb': // BUG-009: recogida del orbe de energía del cristal
        this._tone({ type: 'triangle', f0: 660, f1: 1180, dur: 0.12, vol: 0.18 });
        break;
      case 'laser': // v4 4c/5: torre Láser — zumbido de rayo encendido corto
        this._tone({ type: 'square', f0: 1700, f1: 650, dur: 0.45, vol: 0.12 });
        this._noise({ dur: 0.35, vol: 0.10, f: 2800, type: 'bandpass', q: 2 });
        break;
      // --- fase 26: base y arsenal (fallback sintetizado) ---
      case 'baseHit': // la base recibe daño: golpe grave + impacto
        this._noise({ dur: 0.22, vol: 0.34, f: 420, sweepTo: 120 });
        this._tone({ type: 'sine', f0: 160, f1: 70, dur: 0.22, vol: 0.26 });
        break;
      case 'baseBlocked': // Escudo de Base: campo de fuerza
        this._tone({ type: 'sine', f0: 520, f1: 900, dur: 0.22, vol: 0.18 });
        this._noise({ dur: 0.3, vol: 0.12, f: 2400, type: 'bandpass', q: 3 });
        break;
      case 'missile': // lanzamiento de misil
        this._tone({ type: 'square', f0: 1200, f1: 420, dur: 0.16, vol: 0.14 });
        break;
      case 'gauss': // cañón de agujas
        this._tone({ type: 'sawtooth', f0: 880, f1: 120, dur: 0.3, vol: 0.18 });
        this._noise({ dur: 0.25, vol: 0.12, f: 1800, sweepTo: 400 });
        break;
      case 'beam': // haz continuo
        this._tone({ type: 'sine', f0: 700, f1: 500, dur: 0.3, vol: 0.12 });
        break;
      case 'bolt': // Thunderstroke: rayo seco
        this._noise({ dur: 0.12, vol: 0.16, f: 3200, type: 'highpass' });
        break;
      case 'chain': // Tesla: crepitar con más cuerpo
        this._noise({ dur: 0.2, vol: 0.14, f: 2600, type: 'bandpass', q: 2 });
        break;
      case 'mortar': // impacto blando del mortero
        this._noise({ dur: 0.3, vol: 0.26, f: 500, sweepTo: 110 });
        this._tone({ type: 'sine', f0: 110, f1: 45, dur: 0.26, vol: 0.22 });
        break;
      case 'drone': // dron: proyectil pequeño
        this._tone({ type: 'triangle', f0: 900, f1: 520, dur: 0.1, vol: 0.12 });
        break;
      default:
        break; // desconocido: silencio, nunca romper el frame
    }
  }
}
