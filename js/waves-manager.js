// =============================================================================
// waves-manager.js — WaveManager y entrada de jefes
// =============================================================================

import { CONFIG, SPAWN_Y, rand } from './engine.js';
import { Enemy } from './enemies.js';
import { scaleFor } from './stages.js';
import { STAGE_WAVES } from './waves-data.js';
import {
  waveSchedule, campaignWaves, generateStageWaves, waveGroups,
  bossNameForStage, bossForStage, archetypeOf, WARNING_SECONDS,
  OPEN_T, WAVE_ARCHETYPES, poolForStage, LANES, VEL_JITTER,
  assignVariant, variantsForStage, pickVariant,
} from './waves.js';

/** Ancho del cono de tiro de la apertura (fase 27). */
const CONE_W = 240;

export const BOSS_ENTRY_ZONES = [
  [0.08, 0.22],   // izquierda
  [0.40, 0.60],   // centro
  [0.78, 0.92],   // derecha
];
let _lastBossZone = -1;
let _lastCenterSweep = 1; // alterna SOLO entre entradas centrales consecutivas

/** Próxima entrada de jefe: {x, sweepDir, zone}. Zona ≠ la anterior (nunca
 * 2 entradas iguales seguidas) y barrido hacia adentro del campo (las
 * esquinas barren hacia el centro; la central alterna dirección cada vez). */
export function nextBossEntry() {
  const options = BOSS_ENTRY_ZONES
    .map((zone, i) => ({ zone, i }))
    .filter(({ i }) => i !== _lastBossZone);
  const pick = options[(Math.random() * options.length) | 0];
  _lastBossZone = pick.i;
  let sweepDir;
  if (pick.i === 0) sweepDir = 1;          // izquierda → barre al centro
  else if (pick.i === 2) sweepDir = -1;    // derecha → barre al centro
  else { _lastCenterSweep = -_lastCenterSweep; sweepDir = _lastCenterSweep; }
  const [a, b] = pick.zone;
  return { x: CONFIG.CANVAS_W * (a + Math.random() * (b - a)), sweepDir, zone: pick.i };
}

// ------------------------------------------------------------
// WaveManager — firma §5 dev-3: {stage, t, update(dt, game),
// progress, onBossDead(cb)}
// ------------------------------------------------------------
export class WaveManager {
  /**
   * @param {number} stage id del stage (1..50)
   * @param {{
   *   powerMul?: number, seed?: number, runMods?: object|null,
   *   survival?: boolean, extend?: ((wm: WaveManager) => unknown)|null,
   *   bossKind?: string|null, bossName?: string|null,
   * }} [opts]
   *   `powerMul` = multiplicador de
   *   meta del jugador (js/meta.js metaDmgMul del Guardian). La apertura
   *   se modela con esa potencia real: sin ella, en los stages finales
   *   el pool "matable" se degradaba a un solo tipo y la apertura no
   *   llegaba al piso de XP (el jugador se quedaba en Lv1). Ver
   *   generateStageWaves().
   *   `seed` (uint32) fija la composición de la etapa: lo usa el desafío
   *   diario (fase 67) para que todas las olas del día sean idénticas
   *   para todos. Sin seed, se sortea por run (comportamiento clásico).
   *   `runMods` (fase 69) = diales del Protocolo (js/heat.js heatMods):
   *   entran en la composición, en la escala del spawn y en el jefe.
   *   `survival` (fase 70) = el modo Supervivencia: la cola NO se genera
   *   entera (sería infinita) sino por bloques que pide `extend(this)`
   *   cuando la arena queda limpia. `bossKind`/`bossName` fuerzan el jefe
   *   del check de la run (sin ellos, el jefe es el de la etapa).
   */
  constructor(stage = 1, opts = {}) {
    this.stage = stage;
    this.t = 0;             // cronómetro del stage (s)
    // v6: stages 1..5 usan sus tablas manuales; 6..50 el generador
    // procedural con seed POR RUN (más random, JK 28-08).
    const seed = Number.isFinite(opts.seed) ? opts.seed >>> 0 : (Math.random() * 1e9) | 0;
    // fase 70: SUPERVIVENCIA. El hook `extend` empuja el bloque siguiente
    // (main lo cablea con survivalWaveChunk) y es lo ÚNICO que mantiene
    // viva la run: por eso la cola arranca vacía y la inyecta `extendNow()`.
    this.survival = opts.survival === true;
    this.extend = typeof opts.extend === 'function' ? opts.extend : null;
    this.survivalWave = 0;  // última oleada NORMAL despachada (HUD)
    this.bossKind = opts.bossKind ?? null;
    this.bossName = opts.bossName ?? null;
    this.queue = this.survival ? [] : [...campaignWaves(stage, seed, opts)];
    // fase 65: SPAWNS DIFERIDOS. Al despachar una descarga, su agenda
    // (waveSchedule: puro y determinista) se encola acá y update() la
    // suelta cuando llega cada instante. Sin escalonado, todos los
    // eventos caen en el mismo frame que antes (comportamiento intacto).
    this.pending = [];
    // fase 69 (Protocolo/Heat): `runMods` son los diales del Protocolo
    // (js/heat.js heatMods) y la escala es la EFECTIVA: la del stage ×
    // Vigor/Prisa. Es la que aplica el spawn (`_spawnGroup` → Enemy), la
    // de la escolta del jefe y la que ya usó generateStageWaves() para la
    // composición y la apertura.
    this.runMods = opts.runMods ?? null;
    const baseScale = scaleFor(stage);
    this.scale = {
      hpMul: baseScale.hpMul * (this.runMods?.hpMul ?? 1),
      velMul: baseScale.velMul * (this.runMods?.velMul ?? 1),
    };
    this.dispatched = 0;    // olas despachadas (progreso §2.5)
    this.warningLeft = 0;   // s restantes de banner WARNING
    this.bossSpawned = false;
    this.bossRef = null;    // referencia viva al boss del stage
    this._bossDeadCb = null;
    this._wavesDoneCb = null; // v6: fin de olas sin jefe
    this._doneT = 0;          // temporizador de cierre tras la última ola
    this._endFlagged = false; // clear ya emitido, no repetir
  }

  /** Progreso 0..1: olas despachadas / total (+ tramo WARNING→kill). */
  get progress() {
    if (!this.queue.length && !this.total) return this.bossSpawned ? 1 : 0;
    return clamp01(this.dispatched / this.total);
  }

  get total() {
    const src = STAGE_WAVES[this.stage];
    return src ? src.length : this.queue.length + this.dispatched;
  }

  /** Callback único cuando muere el boss (main lo usa para clear real). */
  onBossDead(cb) { this._bossDeadCb = cb; }

  /** Callback cuando se COMPLETAN las olas sin jefe (v6: stages 2..9, 11..). */
  onWavesDone(cb) { this._wavesDoneCb = cb; }

  /**
   * Inyecta el primer bloque de olas en supervivencia: el constructor no
   * conoce el game, así que el arranque lo dispara main a mano.
   * @returns {boolean} true si había un hook que llamar
   */
  extendNow() {
    if (!this.extend) return false;
    this.extend(this);
    return true;
  }

  /**
   * Tick de spawns. game.fortress.enemies es la lista viva compartida
   * con las torres (contrato dev-2); cada enemigo entra también como
   * entidad del engine para update/draw.
   */
  update(dt, game) {
    if (dt <= 0) return;

    // WARNING en curso: congela los spawns hasta que entre el boss. Al
    // ARRANCAR el aviso se vació `pending` (fase 65): durante el aviso no
    // puede colarse ningún enemigo normal.
    if (this.warningLeft > 0) {
      this.warningLeft -= dt;
      if (this.warningLeft <= 0) {
        // fase 71: NORMALIZAR a 0. Si queda un residuo negativo (p. ej.
        // −0,03), el guard `if (!this.warningLeft)` de abajo es siempre
        // falso y `_flushPending()` deja de correr para el resto de la
        // partida: en Supervivencia, tras el primer jefe, las olas
        // normales se anunciaban pero no spawneaban (sólo los jefes).
        this.warningLeft = 0;
        this._spawnBoss(game);
      }
      return;
    }

    // fase 70: SUPERVIVENCIA — no hay cierre de etapa. Cuando la cola y la
    // agenda se vacían, el bloque siguiente entra en cuanto la arena queda
    // limpia de enemigos NORMALES (el jefe puede seguir vivo: si no, la run
    // esperaría a matarlo para seguir tirando olas).
    if (this.survival && !this.queue.length && !this.pending.length) {
      const limpiando = (game?.fortress?.enemies ?? [])
        .some((e) => e && !e.dead && !e.isBoss);
      if (!limpiando) this.extend?.(this);
      return;
    }

    // v6 — sin jefe: al vaciar la queue y no quedar enemigos vivos, el
    // stage termina tras un respiro de 1.2 s (STAGE_CLEAR como en boss).
    // fase 65: la etapa NO se declara terminada mientras queden spawns
    // diferidos sin entrar (spec gameplay/wave-director §Escalonado).
    if (!this.bossSpawned && !this.queue.length && !this.pending.length) {
      if (!this._endFlagged) {
        this._doneT += dt;
        const alive = (game?.fortress?.enemies ?? [])
          .some((e) => e && !e.dead && !e.isBoss);
        if (!alive && this._doneT >= 1.2) {
          this._endFlagged = true;
          this._wavesDoneCb?.();
        }
      }
      return;
    }

    this.t += dt;

    while (this.queue.length && this.queue[0].t <= this.t) {
      const w = this.queue.shift();
      // Fase 27: la ola de jefe puede venir en el formato legacy
      // ({type:'boss',pattern:'boss'}) o en el de grupos. Se detecta por
      // cualquiera de las dos formas.
      const groups = waveGroups(w);
      if (w.pattern === 'boss' || groups.some((g) => g.type === 'boss' || g.pattern === 'boss')) {
        this.warningLeft = WARNING_SECONDS;
        // fase 65: el aviso CANCELA lo pendiente — "esos spawns se
        // descartan y no aparece ningún enemigo normal durante el aviso".
        this.pending.length = 0;
        // dev-7 fase 28: el payload lleva el NOMBRE del jefe, para que el
        // banner DOM que pinta el HUD (js/hud.js showBossWarning) pueda
        // dizer de quién se trata ("¡JEFE EN CAMINO! — Meteorito Gigante").
        const bossName = this._bossName() ?? 'BOSS';
        game.engine.emit('boss:warning', { name: bossName });   // banner + sombra (D10)
        this.dispatched += 1;
        break; // no más spawns mientras dura el aviso
      }
      this._spawnWave(w, game);
      this.dispatched += 1;
      // fase 70: el HUD de la run muestra la oleada; la de JEFE no mueve el
      // contador (mantiene la última normal, que es la que se juega).
      if (this.survival && Number.isInteger(w.wave)) this.survivalWave = w.wave;
    }

    // fase 65: los eventos vencidos entran acá — los de descargas
    // anteriores y los que la recién despachada agenda para este mismo
    // instante (at = t): sin escalonado entran en el MISMO frame que en la
    // fase 27 (comportamiento intacto), y `pending` está ordenado por
    // tiempo, así que el orden de spawn es el del reloj.
    // Con el aviso de jefe en curso NO se suelta nada: acabó de vaciarse.
    // fase 71: `<= 0` (no `!`): si el aviso terminó, el reloj puede haber
    // quedado en un residuo negativo con dt variable; el flush tiene que
    // correr igual.
    if (this.warningLeft <= 0) this._flushPending(game);
  }

  /**
   * Suelta los enemigos diferidos cuyo instante (`at`) ya llegó (fase 65).
   * El orden de spawn es el de `pending` (ordenado por tiempo), así que
   * una descarga con `delay` no adelanta a los rezagados de la anterior.
   */
  _flushPending(game) {
    if (!this.pending.length) return;
    // `pending` está ordenado por `at`: los vencidos son SIEMPRE el prefijo.
    // Antes se hacían dos `filter()` sobre todo el array en cada frame
    // (incluso cuando no había nada vencido).
    let dueCount = 0;
    while (dueCount < this.pending.length && this.pending[dueCount].at <= this.t) {
      dueCount += 1;
    }
    if (!dueCount) return;
    const due = this.pending.splice(0, dueCount);
    for (const ev of due) this._spawnOne(ev, game);
  }

  /**
   * Spawn de UN enemigo de la agenda (fase 65). Va por el MISMO camino
   * que el spawn por lote (`_spawnGroup`) con el índice del evento, así
   * que la formación (vee/line/wall/arco) se conserva y sólo se reparte
   * en el tiempo.
   */
  _spawnOne(ev, game) {
    const list = game?.fortress?.enemies;
    if (!list) return;
    const groups = waveGroups(ev.wave);
    const group = groups[ev.group];
    if (!group) return;
    this._spawnGroup(group, ev.group, groups.length, game, list, ev.wave.t < OPEN_T, ev.index);
  }

  /**
   * Spawns de UNA descarga (fase 27). La descarga puede tener varios
   * GRUPOS (tipos/patrones distintos): cada grupo se dibuja en su propia
   * franja horizontal para que no se pisen entre sí, y con un desfase
   * vertical para que la columna no entre como una placa.
   *
   * fase 65: no spawnea directo — ENCOLA la agenda de la descarga
   * (waveSchedule) y `update()` suelta cada evento en su instante. Una
   * descarga sin `stagger`/`delay` sale entera en este mismo frame.
   */
  _spawnWave(wave, game) {
    const list = game?.fortress?.enemies;
    if (!list) return; // sin fortress no hay dónde anotar enemigos
    const groups = waveGroups(wave);
    if (!groups.length) return;
    // fase 65: aviso de ENTRADA del arquetipo (lo pinta el HUD con el
    // mismo lenguaje del aviso de jefe). Se anuncia lo que ENTRA: no hay
    // preview de la próxima descarga (decisión del usuario).
    const archetype = archetypeOf(wave);
    if (archetype) {
      game.engine?.emit?.('wave:incoming', {
        archetype,
        name: WAVE_ARCHETYPES[archetype].name,
      });
    }
    // La agenda viene ORDENADA de waveSchedule y es puro/determinista.
    this.pending.push(...waveSchedule(wave).map((ev) => ({ ...ev, wave })));
    this.pending.sort((a, b) => a.at - b.at);
  }

  /**
   * Spawn de un grupo dentro de una descarga mixta.
   * @param {object} group {type, count, pattern, lane?, variant?, variants?}
   * @param {number} gi índice del grupo dentro de la descarga
   * @param {number} gn cantidad de grupos de la descarga
   * @param {boolean} [isOpening] descarga dentro de la ventana de apertura
   * @param {number|null} [onlyIndex] instancia un ÚNICO enemigo del grupo
   *   (lo usa el scheduler: la formación se mantiene, el tiempo se reparte)
   */
  _spawnGroup(group, gi, gn, game, list, isOpening = false, onlyIndex = null) {
    const count = Math.max(1, group.count ?? 1);
    const pattern = group.pattern ?? 'rain';
    // Franja horizontal del grupo: la EXPLÍCITA del arquetipo (fase 65:
    // `lane` = izq / centro / der / angosta / full) o, si no la trae, el
    // reparto del canvas entre los grupos de la descarga (con 1 grupo la
    // franja es toda la pantalla — comportamiento histórico intacto).
    //
    // EXCEPCIÓN (fase 27) — la APERTURA: todos los grupos caen DENTRO del
    // cono del Guardian (x ≈ CONFIG.BASE_X = 270), no en franjas separadas.
    // El Guardian dispara en abanico desde el centro y su objetivo se elige
    // por Y (el más avanzado), NO por X: si el enemigo elegido está a 200 px
    // de lado, la bala con spread de 14° falla y no le acierta. Medido: con
    // las franjas, el Guardian disparaba 3 000 balas en S30 y mataba 8
    // enemigos de 171 — el jugador nunca subía de nivel.
    // En la apertura los grupos se reparten alrededor del cono (el más
    // rápido al centro, que es el primero al que apunta la torre).
    const laneSpec = group.lane ? LANES[group.lane] : null;
    const laneW = laneSpec
      ? CONFIG.CANVAS_W * (laneSpec[1] - laneSpec[0])
      : (isOpening ? CONE_W : CONFIG.CANVAS_W / gn);
    const laneX0 = laneSpec
      ? CONFIG.CANVAS_W * laneSpec[0]
      : (isOpening
        ? CONFIG.BASE_X - CONE_W / 2 + (CONE_W / gn) * gi
        : (CONFIG.CANVAS_W / gn) * gi);
    // Desfase vertical por grupo: evita que todos entren en la misma Y
    // (la "placa" uniforme de antes).
    const yOff = gn > 1 ? (gi * 46) % 120 : 0;
    const from = onlyIndex ?? 0;
    const to = onlyIndex ?? count - 1;

    for (let i = from; i <= to; i++) {
      let x;
      switch (pattern) {
        case 'line': x = laneX0 + ((i + 0.5) / count) * laneW; break;
        case 'vee': {
          // V centrada en la franja del grupo. El paso se limita para que
          // no se salga de la franja (y del canvas) cuando hay muchos
          // enemigos: paso = min(46, ancho útil / count).
          const step = Math.min(46, (laneW - 20) / Math.max(1, count));
          const half = (count - 1) / 2;
          x = laneX0 + laneW / 2 + (i - half) * step;
          break;
        }
        case 'wall': { // dos columnas laterales sincronizadas (dev-5)
          const col = i % 2 === 0 ? laneX0 + 90 : laneX0 + laneW - 90;
          x = col + ((i / 2) | 0) * 26 * (i % 4 < 2 ? 1 : -1);
          break;
        }
        case 'burst-diag':
          // Diagonal dentro de la FRANJA del grupo (fase 27): si no, el
          // grupo invadiría la franja del vecino y las descargas se pisarían.
          x = laneX0 + 10 + ((i * 97) % Math.max(1, Math.floor(laneW - 20)));
          break;
        case 'mixed-arc': {
          // Arco disperso: los enemigos se reparten por un arco (no una
          // línea recta) — se ve más orgánico que la hilera.
          const t = count > 1 ? i / (count - 1) : 0.5;
          x = laneX0 + laneW * (0.5 + Math.cos(t * Math.PI - Math.PI / 2) * 0.5);
          break;
        }
        case 'mixed-spread': {
          // Nube dispersa: X y Y al azar dentro de la franja.
          x = laneX0 + rand(20, Math.max(21, laneW - 20));
          break;
        }
        case 'rain':
        default:
          x = laneX0 + rand(Math.min(40, laneW / 2), Math.max(laneW / 2 + 1, laneW - 40));
          break;
      }
      // dev-7 fase 27: red de seguridad — ningún enemigo puede nacer
      // fuera del canvas (las franjas son angostas cuando hay 3 grupos).
      x = Math.max(4, Math.min(CONFIG.CANVAS_W - 4, x));
      // fase 68: doble afijo. `group.variants` es la fuente cuando el
      // director pidió 2; con 1 afijo el grupo sólo trae `variant` y se
      // deriva acá (el constructor prioriza el array si es un array).
      const variants = group.variants ?? (group.variant ? [group.variant] : []);
      const e = new Enemy(group.type, x, {
        game, y: SPAWN_Y - yOff, scale: this.scale, variant: group.variant, variants,
      });
      if (pattern === 'burst-diag') e.phase = 0; // diagonal sincronizada
      // 'mixed-spread' dispersa también en Y (no solo en X).
      if (pattern === 'mixed-spread') e.y = SPAWN_Y - yOff - rand(0, 90);
      // fase 65: JITTER de velocidad por enemigo (±7 %): dentro del mismo
      // tipo conviven velocidades, así que la hilera no entra en bloque.
      // NUNCA en la apertura: su modelo de matabilidad calcula el ttk con
      // la velocidad EXACTA del tipo (y con el jitter el tope por enemigo
      // dejaría de ser cierto). Es multiplicativo, así que compone con el
      // `velMul` de la variante de élite.
      if (!isOpening) e.vel *= 1 + (rand(0, 1) * 2 - 1) * VEL_JITTER;
      game.engine.addEntity(e);
      list.push(e);
    }
  }

  /**
   * Tipo del jefe que entra: el forzado por la run (supervivencia) o el de
   * la etapa. `_spawnBoss` y el aviso comparten esta decisión.
   */
  _bossKind() {
    return this.bossKind ?? bossForStage(this.stage) ?? 'boss';
  }

  /** Nombre propio del jefe que entra (misma precedencia que el tipo). */
  _bossName() {
    return this.bossName ?? bossNameForStage(this.stage);
  }

  _spawnBoss(game) {
    this.bossSpawned = true;
    const list = game?.fortress?.enemies;
    if (!list) return;
    // v6: en la campaña de 50 stages los jefes ESCALAN +12% HP por stage
    // (stage 10 ≈ ×2.08, stage 50 ≈ ×6.88) para seguir siendo el hito
    // de cada década con el meta de 100 niveles.
    // 3e/7: entra por una X aleatoria variada (zona ≠ la del jefe anterior)
    // con barrido lateral alternado (vive en enemies.js vía sweepDir).
    const entry = nextBossEntry();
    // fase 70: en supervivencia el jefe lo fija la run (bossKind/bossName);
    // en campaña y ∞ es el de la etapa, como siempre.
    const boss = new Enemy(this._bossKind(), entry.x,
      { game, y: -120, sweepDir: entry.sweepDir });
    // dev-7 fase 46: el jefe se presenta con el NOMBRE PROPIO de su
    // stage (lo leen la barra de jefe y el aviso de jefe). Se copia la
    // ficha del tipo con ese nombre: ENEMY_TYPES es compartida, mutarla
    // renombraría a todos los enemigos de ese tipo.
    const nombreJefe = this._bossName();
    if (nombreJefe) boss.data = { ...boss.data, name: nombreJefe };
    // fase 69 (Protocolo/Jefes): el HP del jefe escala con `bossHpMul`
    // (+20 % por rango). Sin Protocolo el multiplicador es 1 y la cuenta
    // es EXACTAMENTE la de la fase 67.
    boss.hpMax = Math.round(
      boss.hpMax * (1 + 0.15 * Math.max(0, this.stage - 1)) * (this.runMods?.bossHpMul ?? 1),
    );
    boss.hp = boss.hpMax;
    game.engine.addEntity(boss);
    list.push(boss);
    this.bossRef = boss;
    this._spawnBossEscort(game, list, entry.x);
  }

  /**
   * ESCOLTA del jefe (fase 69 — Protocolo/Jefes, 2 élites por rango).
   *
   * Son enemigos NORMALES de la oleada del jefe: una variante de las que
   * ya permite la etapa, tipadas desde el bioma y entrando a los lados de
   * la puerta del jefe. NO llevan `escortOf` a propósito: no curan al
   * jefe, no cuentan como esbirros y no tienen trato especial en la regla
   * de fugas.
   *
   * @param {object} game
   * @param {Array<object>} list game.fortress.enemies
   * @param {number} x X de entrada del jefe
   */
  _spawnBossEscort(game, list, x) {
    const count = Math.trunc(this.runMods?.bossEscort ?? 0);
    if (count <= 0) return;
    const tipos = poolForStage(this.stage)
      .map((p) => p.type)
      .filter((t) => t !== 'crystal' && t !== 'boss');
    const pool = tipos.length ? tipos : ['spore'];
    const allowed = variantsForStage(this.stage);
    for (let i = 0; i < count; i++) {
      const type = pool[i % pool.length];
      const variant = allowed.length ? pickVariant(allowed, rand(0, 1)) : undefined;
      const dx = (i % 2 === 0 ? -1 : 1) * (40 + 26 * Math.floor(i / 2));
      const ex = Math.max(4, Math.min(CONFIG.CANVAS_W - 4, x + dx));
      const e = new Enemy(type, ex, { game, y: -100, scale: this.scale, variant });
      game.engine.addEntity(e);
      list.push(e);
    }
  }

  /** Llamar desde main tras el update: detecta kill del boss (D11). */
  checkBossDead() {
    if (this.bossSpawned && !this._bossDone && this.bossRef?.dead) {
      this._bossDone = true;
      this._bossDeadCb?.(this.bossRef);
      return true;
    }
    return false;
  }
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

