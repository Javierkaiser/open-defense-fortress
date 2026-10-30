// =============================================================================
// hud-core.js — clase HUD (DOM, eventos y render)
// -----------------------------------------------------------------------------
// Extraído de hud.js (fase 75). Usa los builders puros de hud-builders.js;
// hud.js queda como fachada para no cambiar imports de tests/main.
// =============================================================================

// ============================================================
// hud.js — clase HUD (dev-1 → dev-4 → dev-5)
// HUD DOM superior/inferior (§4.4) + pantallas overlay (§2.10)
// con DATOS REALES de la run (score, bonus desglosado, Lv,
// kills). Badge de racha con pop, botón ultimate y barra de
// jefe con banner BOSS + xN (D11) ya vivos.
// Importa audio.js/meta.js/theme.js/stages.js (regla §1.1: nunca
// hud/cards/main). stages.js es un módulo de DATOS puros: de ahí sale
// el nº real de stages (el tagline del menú) y el tema de cada uno.
// ============================================================

import { AudioManager } from './audio.js';
import { VERSION } from './version.js';
import { STAGES } from './stages.js';
// fase 72: los créditos y los TEXTOS LEGALES embebidos. Módulo de datos puro
// (cero imports, cero DOM): la pantalla CREDITS se arma sin payload y sin red.
import { LICENSES, ATTRIBUTIONS, FONTS, CODE } from './licenses.js';
// dev-7 fase 37: el ancho LÓGICO del canvas, para saber si el marco
// (DOM) es más estrecho que el diseño y hay que compactar el HUD.
import { CONFIG } from './engine.js';
import {
  META_TOWERS, META_MAX_LEVEL, META_RANKS,
  META_PLAYER_NAME, META_FRAG_PER_VICTORY, META_DMG_PER_LEVEL, META_GOLD_START,
  META_UNLOCK_COSTS, loadMeta, fragCost, metaGold, metaDmgMul, playerRank,
  totalMetaLevels, renderTowerIcon, upgradeTower, unlockTower,
  PERKS, PERK_TIERS, PERK_EVERY, PERK_RESET_COST,
  pendingPerkTiers, tierAtLevel, getPerkOptions, setPerkChoice, resetPerks,
} from './meta.js';
import { THEMES, loadTheme, saveTheme, applyThemeToGame } from './theme.js';
import { loadSkin } from './tower-skins.js';
import { QUALITY_LEVELS, loadQuality, saveQuality, applyQualityToContext, applyQualityToDom, particleCapFor } from './quality.js';
import { resetProgress } from './progress.js';
import { resetMeta } from './meta.js';
// dev-7 fase 64: el TOPE de nivel de una etapa (`MAX_LEVEL_PER_STAGE`, el
// techo de cartas de score.js). Sin ciclo: score.js sólo importa stages.js
// (la regla §1.1 sigue viva — hud.js nunca importa main.js/cards.js).
import { MAX_LEVEL_PER_STAGE } from './score.js';
// dev-7 fase 32: tipos de daño (glifo por unidad + leyenda de la matriz).
// oleadas-dinámicas: ENEMY_FAMILIES da el nombre legible de cada familia
// para el sesgo de etapa del selector ("roca / virus").
import { DAMAGE_TYPES, ENEMY_FAMILIES, buildDamageLegendHtml, buildBestiaryHtml } from './damagetypes.js';
// dev-7 fase 40: el bestiario dibuja al ENEMIGO de verdad (el mismo
// render que la partida) en un canvasito.
import { renderEnemyIcon } from './enemies-bestiary.js';
// oleadas-dinámicas: `ENEMY_VARIANTS` (las variantes de élite) para el
// bestiario. Va por NAMESPACE a propósito: la tabla la escribe WS-B, y un
// `import { ENEMY_VARIANTS }` reventaría el módulo ENTERO al enlazar
// mientras el símbolo no exista. Con el namespace, si falta es
// `undefined` y el bestiario simplemente no pinta la sección.
import * as enemyModule from './enemies.js';
// oleadas-dinámicas: `campaignPoolForStage` (sesgo real por etapa) para el
// selector de etapa. Mismo criterio: namespace, porque el director lo
// escribe WS-A y el HUD no puede romperse por un dato que aún no llega
// (ver stageFamilyOf()).
import * as waves from './waves.js';

import {
  svgIcon,
  UI_ICONS,
  typeBadgeHtml,
  fmt,
  fmtTime,
  META_TOTAL_MAX_LEVELS,
  attr,
  esc,
  buildRankBadge,
  STAGE_GROUP_SIZE,
  STAGE_THEME_COLORS,
  STAGE_THEME_BY_ID,
  stageThemeColor,
  stageNumber,
  compactStageName,
  buildStageGroups,
  STAGE_FAMILY_SECOND_SHARE,
  stageFamilyText,
  stageFamilyTag,
  stageFamilyOf,
  findStageHighlights,
  stageRowHtml,
  ENDLESS_MIN_STAGE,
  payloadInt,
  buildEndlessCardHtml,
  buildDailyCardHtml,
  endlessSummaryRows,
  dailySummaryRow,
  heatSummaryRows,
  endlessDefeatBlock,
  survivalDefeatBlock,
  fmtRewardMul,
  heatInt,
  buildProtocolCardHtml,
  protocolRowHtml,
  buildProtocolHtml,
  buildStageList,
  buildSurvivalCardHtml,
  recordRowHtml,
  buildRecordsHtml,
  CARD_RARITIES,
  cardRarity,
  CARD_PICK_DEBOUNCE_MS,
  buildCreditsHtml,
  readMetaScroll,
  restoreMetaScroll,
  readProtocolScroll,
  restoreProtocolScroll,
  readProtocolFocus,
  restoreProtocolFocus,
  canPickCard,
  levelCap,
  cardHintText,
  levelLabelText,
  fmtDps,
  formatBattleStatus,
  buildStatusStripHtml,
  buildBossBarHtml,
  towerDps,
  fortressDps,
  BOSS_WARNING_MS,
  BOSS_PHASE_MS,
  ARCHETYPE_BANNER_MS,
  ARCHETYPE_BANNER_TEXT,
  archetypeBannerText,
  ARCHETYPE_BANNER_NOTABLE,
  shouldAnnounceArchetype,
  COMBO_OVERLAY_LAYOUT,
  OVERLAY_VEIL_CLASS,
  overlayStageBox,
  buildThemeSwatches,
  buildMenuScreen,
  fmtFrags,
  metaPowerMul,
  fmtMul,
  buildPowerLineHtml,
  buildTowerCards,
  buildTorretasScreen,
} from './hud-builders.js';

export class HUD {
  /**
   * @param {import('./engine.js').Engine} engine
   */
  constructor(engine) {
    this.engine = engine;
    this.audio = new AudioManager();
    // dev-7 fase 14: estado del botón "Borrar progreso" (confirmación
    // inline en 2 pasos, ver _screenMenu()/_bindResetProgress()).
    this._confirmingReset = false;
    // dev-7 fase 39: acción pendiente de CONFIRMAR antes de abandonar la
    // partida en curso desde la pausa ('torretas' | 'menu' |
    // 'select-stage' | null).
    this._abandonPending = null;
    // fase 16: confirmación inline de "REDISTRIBUIR" por torreta (type → bool).
    this._perkResetArmed = {};
    // v2: confirmación inline de "DESBLOQUEAR" por unidad (key → bool).
    // Se compra con oro y no se puede deshacer: un toque por error no
    // puede gastarlo.
    this._unlockArmed = {};
    // dev-7 fase 41: la LEYENDA de tipos de daño es un toggle (arranca
    // cerrada: la tabla tapaba la nav inferior en móvil).
    this._legendOpen = false;
    this._lastScreen = null; // fase 75: detectar cambio real de pantalla
    // dev-7 fase 43: la EXPLICACIÓN del banner "¿Cómo subo de nivel?" es
    // un toggle (arranca cerrada: la prosa se comía 130 px de 844 para
    // algo que se lee una vez).
    this._bannerMoreOpen = false;
    // dev-7 fase 13: aplica el tema guardado ANTES del primer render,
    // para no mostrar un flash con el tema viejo/default.
    // dev-7 fase 54: `applyThemeToGame` aplica ademas el TINTE DE ESCENA
    // (el que tiñe el canvas del juego, no solo el DOM).
    applyThemeToGame(loadTheme(), this.engine, loadSkin());

    // Cache de nodos DOM
    this.root = document.getElementById('hud-top');
    this.bottom = document.getElementById('hud-bottom');
    this.overlayRoot = document.getElementById('overlay-root');
    this.el = {
      stageName: document.getElementById('hud-stage-name'),
      progress: document.getElementById('hud-progress'),
      lv: document.getElementById('hud-lv'),
      xp: document.getElementById('hud-xp'),
      timer: document.getElementById('hud-timer'),
      score: document.getElementById('hud-score'),
      mult: document.getElementById('hud-mult'),
      speed: document.getElementById('btn-speed'),
      ult: document.getElementById('btn-ultimate'),
      ultRing: document.querySelector('#btn-ultimate .ult-ring'),
      bh: document.getElementById('btn-blackhole'),
      bhRing: document.querySelector('#btn-blackhole .bh-ring'),
      // fase 75: nodo cacheado; antes se hacía querySelector por frame.
      bhCount: document.querySelector('#btn-blackhole .bh-count'),
      music: document.getElementById('btn-music'), // v3 5/7 (BUG-004)
      // T8: tira de estado de batalla (se crea abajo, tras tener el root).
      // dev-7 fase 43: solo ENEMIGOS y DPS (OLAS y RACHA duplicaban datos
      // que ya están en la barra de progreso y en el badge del score).
      status: null,
      statEnemies: null,
      statDps: null,
      // T9: banner de aviso de JEFE (se crea bajo demanda).
      bossWarning: null,
    };
    this._timerSecs = -1;
    this._lastScoreShown = null;
    this._lastLv = null; // detección de LEVEL UP en render (dev-6, D14)
    // fase 70: oleada de SUPERVIVENCIA que acompaña al nombre del stage en
    // el HUD ("Supervivencia · Oleada N"). 0 = no es una run de arcade.
    this._survivalWave = 0;

    // BUG 5: el HUD escribe estilos en el DOM en CADA frame aunque esté
    // oculto (menú/torretas/pausa) y aunque el valor no haya cambiado.
    // `_hudVisible` + el cache de render evitan esas escrituras; al
    // volver a mostrarlo se invalida el cache para refrescar todo.
    this._hudVisible = false;

    // Modal (#card-choice) compartido por CARTAS y PERK: se recuerda qué
    // tipo está abierto para que Esc y la devolución del foco sean
    // correctos (bug: el modal de perk no se cerraba y tapaba el menú).
    this._modalKind = null; // 'cards' | 'perk' | null
    this._focusBeforeModal = null;

    // El panel COMBO tiene su PROPIO nodo (#combo-panel): antes
    // reutilizaba #card-choice y al abrirlo pisaba la oferta de cartas
    // (bug de soft-lock: la run quedaba trabada en CARD_CHOICE sin cartas
    // que elegir). Nodo aparte = oferta de cartas siempre intacta.
    this.comboPanel = null;
    this._focusBeforeCombo = null;

    // Barra de jefe (D11): DOM creado bajo demanda en render()
    this._bossHidden = true;

    // T4 — anti-doble-toque del modal de cartas: oferta VIVA (estable
    // mientras el modal sigue abierto: una cadena de ofertas por
    // multi-level-up es la MISMA decisión), cartas ya elegidas de la
    // oferta actual e instante del último pick.
    this._cardSession = 0;
    this._cardOfferId = null;
    this._cardPickedIds = [];
    this._lastCardPickAt = null;

    // T8 — tira de estado de batalla (enemigos / DPS): segunda fila del
    // HUD, creada junto con el HUD.
    // dev-7 fase 43: la tira tenía 4 píldoras; OLAS y RACHA duplicaban
    // la barra de progreso del stage y el badge ×N del score.
    this._ensureStatusStrip();

    // T9 — aviso de JEFE (banner WARNING de 2 s que docs/DESIGN.md promete y
    // que no existía en el DOM). El engine emite 'boss:warning' cuando
    // el jefe se acerca (waves.js) → el HUD muestra el banner.
    this.engine?.on?.('boss:warning', (data) => this.showBossWarning(data?.name));
    // dev-7 fase 47: el jefe avisa de su cambio de fase (y con ella, de
    // la regla nueva: a qué tipo le pega más). El evento ya lo emitía el
    // enemigo desde la fase 28, pero nadie lo escuchaba.
    this.engine?.on?.('boss:phase2', (enemy) => this.showBossPhase(enemy?._phase));
    // oleadas-dinámicas: el director anuncia el ARQUETIPO que ESTÁ
    // entrando ("¡CONVOY!"). Sin preview de la próxima ola (decisión del
    // usuario): lo único que se avisa es lo que ya está en el campo.
    this.engine?.on?.('wave:incoming', (data) => this.showArchetypeBanner(data?.archetype));
    // dev-7 fase 52: el "ultimate listo" y el "black hole listo" son
    // AVISOS de la partida como el del jefe: pasan por la misma pila.
    this.engine?.on?.('ultimate:ready', () => this.showUltimateReady('ultimate'));
    this.engine?.on?.('blackhole:ready', () => this.showUltimateReady('blackhole'));

    this._bindButtons();

    // v3 5/7 (BUG-004): reflejar la preferencia guardada del toggle ♪.
    // Hoy el default es música ON (sin clase .muted); si mañana se
    // persiste la preferencia, el botón nace coherente.
    if (this.audio.musicMuted) this.setMusicMuted(true);

    // dev-7 fase 37: el marco puede ser más estrecho que el canvas de
    // diseño (540 px). Ver refreshFrameMode().
    this.refreshFrameMode();
  }

  /**
   * dev-7 fase 37 — ¿El MARCO es más estrecho que el canvas de diseño?
   *
   * El canvas se dibuja a 540×880 lógicos y se estira con CSS al marco
   * (`width:100%`), pero el HUD es DOM con px FIJOS: en cualquier
   * pantalla cuyo marco mida menos de 540 px (todo móvil, y casi todo
   * portátil) la fila superior se salía y el marco la recortaba — el
   * reloj y el botón de ULTIMATE quedaban FUERA de la pantalla. Medido a
   * 390 px: el timer se salía 41 px y el ultimate 91 px (fuera entero).
   *
   * Aquí se marca `#marco-portrait` con `data-narrow` para que el CSS
   * reparta el HUD en dos filas (controles / datos) y lo compacte. Se
   * mide el MARCO, no el viewport: el marco es `alto × 0,614` de ancho,
   * así que en un landscape puede ser estrecho aunque la ventana sea
   * ancha.
   *
   * @returns {boolean} true si el marco es estrecho
   */
  refreshFrameMode() {
    const frame = this.root?.closest?.('#marco-portrait');
    if (!frame) return false;
    const narrow = frame.clientWidth > 0 && frame.clientWidth < CONFIG.CANVAS_W;
    if (narrow) frame.setAttribute('data-narrow', '');
    else frame.removeAttribute('data-narrow');
    this.refreshOverlayMode(frame);
    return narrow;
  }

  /**
   * dev-7 fase 57 — ¿El overlay es de PANTALLA COMPLETA?
   *
   * El escenario (#overlay-stage) mide el ancho del marco y el alto de
   * la pantalla. Cuando el marco es ALTO-limitado (escritorio) el
   * escenario coincide con él y el overlay se ve EXACTAMENTE como antes.
   * Cuando el marco es ANCHO-limitado (móvil) el escenario ocupa la
   * pantalla real y lleva el VELO UNIFORME (el mismo
   * para el menú, la pausa, el selector y el fin de partida → se ve
   * como una pantalla propia del juego, sin el mundo volcánico atrás).
   *
   * La marca se lee del DOM (el atributo `data-full` del escenario) y
   * la pone el CSS.
   *
   * @param {Element} frame el #marco-portrait
   * @returns {boolean} true si el overlay ocupa la pantalla real
   */
  refreshOverlayMode(frame = this.root?.closest?.('#marco-portrait')) {
    if (typeof document === 'undefined') return false;
    const stage = document.getElementById?.('overlay-stage') ?? null;
    if (!stage || !frame) return false;
    // El overlay es de PANTALLA COMPLETA cuando el marco es ANCHO-limitado
    // (el del teléfono: la pantalla es más angosta que alta y el marco la
    // ocupa de lado a lado). En escritorio el marco es alto-limitado (queda
    // angosto en una pantalla ancha) y el overlay se ve como antes.
    // OJO: desde la fase 58 el marco SIEMPRE llena el alto, así que la
    // diferencia de alturas ya no dice nada: lo dice el ANCHO.
    // Y se mide el ancho EXTERIOR (el borde va por dentro): `clientWidth`
    // es 2 px menor y con el borde el marco da justo los 374 px del móvil.
    const vw = document.documentElement?.clientWidth
      || (typeof window !== 'undefined' ? window.innerWidth : 0)
      || 0;
    const fw = frame.getBoundingClientRect?.().width || frame.clientWidth || 0;
    const full = fw > 0 && fw >= vw - 2 * 8 - 1;
    if (typeof stage.toggleAttribute === 'function') {
      stage.toggleAttribute('data-full', full);
    } else if (full) {
      stage.setAttribute?.('data-full', '');
    } else {
      stage.removeAttribute?.('data-full');
    }
    return full;
  }

  /** Datos frescos para SELECT_STAGE (dev-5): main ya refrescó progreso. */
  _selectData() {
    return typeof window !== 'undefined'
      ? window.__GDF__?.game?._selectData?.() ?? null
      : null;
  }

  /**
   * Datos frescos del PROTOCOLO (fase 69): main los arma en `_heatData()`
   * (mods, total, preset, recompensa, récord y los catálogos). El HUD no
   * toca el estado: si no hay juego vivo, `null` → pantalla de aviso.
   */
  _heatData() {
    return typeof window !== 'undefined'
      ? window.__GDF__?.game?._heatData?.() ?? null
      : null;
  }

  /**
   * Datos frescos de la SALA DE RÉCORDS (fase 70): main los arma en
   * `_recordsData()` (los cinco modos y sus próximos hitos ya resueltos).
   * El HUD no toca el progreso: si no hay juego vivo, `null` → aviso.
   */
  _recordsData() {
    return typeof window !== 'undefined'
      ? window.__GDF__?.game?._recordsData?.() ?? null
      : null;
  }

  // ---------- T8: estado de batalla (enemigos / DPS) ----------

  /**
   * Crea la tira de ESTADO DE BATALLA (segunda fila del HUD): el jugador
   * veía nivel, XP, score y timer, pero no cuántos enemigos quedaban
   * vivos ni su DPS real — no podía saber si el stage venía bien.
   *
   * dev-7 fase 43: la tira tenía 4 píldoras (OLAS / ENEMIGOS / DPS /
   * RACHA) y 2 DUPLICABAN datos que ya están en el HUD: "OLAS 3/33" era
   * la barra de progreso del stage (mismo dato) y "RACHA ×1" era el badge
   * ×1.5 del score. Se eliminan: quedan 2 píldoras y se libera el ancho.
   *
   * Los 2 read-outs se escriben en render() (payload de main.js:
   * enemiesAlive y dps).
   */
  _ensureStatusStrip() {
    if (this.el.status) return;
    const host = this.root; // #hud-top (fila 2, debajo de la principal)
    if (!host || typeof host.appendChild !== 'function') return;
    const div = document.createElement('div');
    div.id = 'hud-status';
    div.className = 'hud-status';
    div.setAttribute('role', 'status');
    div.setAttribute('aria-label', 'Estado de la batalla');
    div.innerHTML = buildStatusStripHtml();
    host.appendChild(div);
    this.el.status = div;
    this.el.statEnemies = div.querySelector('[data-stat="enemies"]');
    this.el.statDps = div.querySelector('[data-stat="dps"]');
  }

  /**
   * Pinta la tira de estado de batalla. Cache por valor: render() corre en
   * cada frame y solo se escribe en el DOM lo que CAMBIÓ.
   */
  _renderStatus(s) {
    if (!this.el.status) return;
    const st = formatBattleStatus(s);
    if (this.el.statEnemies && st.enemies !== this._lastStatEnemies) {
      this._lastStatEnemies = st.enemies;
      this.el.statEnemies.textContent = st.enemies;
    }
    if (this.el.statDps && st.dps !== this._lastStatDps) {
      this._lastStatDps = st.dps;
      this.el.statDps.textContent = st.dps;
    }
  }

  _bindButtons() {
    const on = (id, fn) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', fn);
    };
    on('btn-pause', () => {
      if (this.engine.state === 'PLAYING') this.engine.setState('PAUSED');
      else if (this.engine.state === 'PAUSED') this.engine.setState('PLAYING');
    });
    on('btn-speed', () => {
      this.audio.init();
      this.audio.resume();
      this.engine.cycleSpeed();
    });
    on('btn-ultimate', () => this.engine.emit('ultimate:fire'));
    on('btn-blackhole', () => this.engine.emit('blackhole:fire'));
    on('btn-combo', () => this.engine.emit('ui:combo_list'));
    on('btn-music', () => this.engine.emit('ui:music_toggle')); // v3 5/7
  }

  /**
   * Estado visual del toggle ♪ (v3 5/7): muted = icono atenuado con
   * tachado. Lo llama main._toggleMusic() tras cambiar audio.musicOn.
   */
  setMusicMuted(muted) {
    if (!this.el.music) return;
    this.el.music.classList.toggle('muted', !!muted);
    this.el.music.setAttribute('aria-pressed', String(!!muted));
  }

  // ---------- Visibilidad ----------
  setPlaying(v) {
    const on = !!v;
    this.root?.classList.toggle('hidden', !on);
    this.bottom?.classList.toggle('hidden', !on);
    // BUG 5: con el HUD oculto no se escribe nada en el DOM. Al volver a
    // mostrarlo se invalida el cache para que el primer frame refresque
    // barras, anillos y textos (el HUD queda en pausa = congelado).
    if (on && !this._hudVisible) this._invalidateRenderCache();
    this._hudVisible = on;
    this._syncHeatBadge(on);
  }

  /**
   * Badge del PROTOCOLO en el HUD (fase 69): `#hud-stage-name` lleva
   * `data-heat` y el CSS escribe " · HEAT N" detrás del nombre del stage.
   * El heat lo dice `game.runMods` (el HUD no lo calcula); fuera de la
   * batalla se borra para que no quede pegado en menú/pausa.
   *
   * @param {boolean} on el HUD está visible (batalla en curso)
   */
  _syncHeatBadge(on) {
    const el = this.el?.stageName;
    if (!el || typeof el.removeAttribute !== 'function') return;
    const heat = on && typeof window !== 'undefined'
      ? Math.max(0, payloadInt(window.__GDF__?.game?.runMods?.heat) ?? 0)
      : 0;
    if (heat > 0) el.setAttribute?.('data-heat', String(heat));
    else el.removeAttribute('data-heat');
  }

  /**
   * Nombre del stage que se escribe en el HUD. En SUPERVIVENCIA (fase 70)
   * el modo no tiene etapas: lo que orienta es la OLEADA, así que el texto
   * pasa a "Supervivencia · Oleada N". Con `_survivalWave` en 0 devuelve
   * el mismo compacto de siempre (campaña y ∞ no cambian).
   *
   * @param {string} name nombre crudo del stage (`game.stageName`)
   * @returns {string} etiqueta del HUD
   */
  _stageNameText(name) {
    const base = compactStageName(name);
    return this._survivalWave > 0 ? `${base} · Oleada ${this._survivalWave}` : base;
  }

  /**
   * Oleada de SUPERVIVENCIA en el HUD de batalla (fase 70). La llama main
   * al cerrar cada bloque de olas; con `0` (o sin dato) deja el nombre
   * pelado, que es el que manda `render()`. El sello de heat (`data-heat`)
   * es un ::after del CSS y NO se toca: los dos conviven.
   *
   * @param {number} n oleada actual (1..N); 0 = sin oleada
   */
  setSurvivalWave(n) {
    this._survivalWave = Math.max(0, payloadInt(n) ?? 0);
    const el = this.el?.stageName;
    if (!el) return;
    const text = this._stageNameText(this._lastStageName ?? 'Supervivencia');
    if (el.textContent !== text) el.textContent = text;
  }

  // ---------- Pantallas overlay (§2.10) ----------
  /**
   * name ∈ FSM §1.3. data = resumen STAGE_CLEAR/GAME_OVER (null =
   * plantillas estáticas). 'PLAYING' oculta el overlay y muestra el HUD.
   */
  /**
   * fase 75 — Limpia confirmaciones inline al cambiar de pantalla.
   *
   * Antes `_confirmingReset` no se reseteaba en los early return de
   * PLAYING/CARD_CHOICE, `_abandonPending` sobrevivía a la pausa y
   * `_perkResetArmed` a TORRETAS: al volver, el botón destructivo quedaba
   * armado y se ejecutaba con un solo click. Lo mismo vale para
   * `_unlockArmed` (la compra de una unidad con oro).
   */
  _resetTransientUi(name) {
    if (name !== 'MENU') this._confirmingReset = false;
    if (name !== 'PAUSED') this._abandonPending = null;
    if (name !== 'TORRETAS') {
      this._perkResetArmed = {};
      this._unlockArmed = {};
    }
  }

  showScreen(name, data = null) {
    const el = this.overlayRoot;
    if (!el) return;
    const changed = this._lastScreen !== name;
    this._lastScreen = name;
    this._resetTransientUi(name);
    // Sin jefe fuera del campo: tampoco puede quedar el aviso de JEFE.
    if (name !== 'PLAYING') {
      this.hideBossBar();
      this.hideBossWarning();
      // fase 75: los avisos de fase/ultimate no deben quedar flotando
      // sobre el menú hasta que expire su timer.
      if (name !== 'CARD_CHOICE') this.clearAvisos();
    }
    if (name === 'PLAYING') {
      el.classList.add('hidden');
      this.setPlaying(true);
      return;
    }
    if (name === 'CARD_CHOICE') {
      // El modal de cartas (§4.4) es un nodo propio gestionado por
      // showCardChoice()/hideCardChoice(): el overlay genérico queda
      // oculto y el HUD sigue visible DEBAJO del modal.
      el.classList.add('hidden');
      this.setPlaying(true);
      return;
    }
    // dev-7 fase 57: el velo del MENÚ (claro, de "portada") y el de
    // TORRETAS solo se usan cuando el overlay NO es de pantalla
    // completa (escritorio): en móvil el velo es UNIFORME para todas las
    // pantallas (ver #overlay-stage[data-full] en el CSS).
    el.classList.toggle('backdrop-warm', name === 'MENU');
    // v3.5: TORRETAS también translúcida — la noche estrellada se ve detrás
    el.classList.toggle('backdrop-meta', name === 'TORRETAS');
    this.setPlaying(false);
    el.classList.remove('hidden');
    switch (name) {
      case 'MENU':
        el.innerHTML = this._screenMenu();
        this._bindThemePicker();
        this._bindResetProgress();
        break;
      case 'SELECT_STAGE': el.innerHTML = this._screenSelectStage(); break;
      // fase 69: el menú de handicaps del heat. No es UI de combate: solo
      // emite `heat-*` y main.js mueve el protocolo.
      // fase 71: cada ± re-renderiza la pantalla; conservar scroll y foco
      // para no devolver la vista al principio de la lista.
      case 'PROTOCOLO': {
        const prevScroll = readProtocolScroll(el);
        const prevFocus = readProtocolFocus(el);
        el.innerHTML = this._screenProtocol();
        restoreProtocolScroll(el, prevScroll);
        restoreProtocolFocus(el, prevFocus);
        break;
      }
      // fase 70: la sala de récords de los cinco modos. Tampoco es UI de
      // combate: solo emite `menu`/`select-stage`.
      case 'RECORDS': el.innerHTML = this._screenRecords(); break;
      // fase 72: créditos y licencias. Pantalla estática, sin payload ni
      // re-render en caliente (no tiene controles que muten estado).
      case 'CREDITS': el.innerHTML = this._screenCredits(); break;
      case 'PAUSED':
        el.innerHTML = this._screenPaused();
        this._bindPauseActions();
        // dev-7 fase 55: el selector de tema tambien esta en la pausa.
        this._bindThemePicker();
        break;
      case 'STAGE_CLEAR': el.innerHTML = this._screenStageClear(data); break;
      case 'GAME_OVER': el.innerHTML = this._screenGameOver(data); break;
      case 'TORRETAS': // v3.5 meta-game (pantalla del diseño base)
        // dev-7 fase 36: se guarda el scroll de la grilla ANTES de
        // re-crear el DOM y se restaura después. Sin esto, cada mejora
        // (MEJORAR / perk ✦ / REDISTRIBUIR) devolvía la vista al
        // principio y había que volver a scrollear.
        {
          const prevScroll = readMetaScroll(el);
          // dev-7 fase 41: la leyenda arranca CERRADA cada vez que se entra
          // a la pantalla (es un toggle, no un panel que queda pegado).
          this._legendOpen = false;
          // dev-7 fase 43: la explicación del banner también arranca
          // CERRADA (es un toggle, no una prosa que ocupa 130 px).
          this._bannerMoreOpen = false;
          el.innerHTML = this._screenTorretas();
          this._paintMetaIcons();
          this._bindMetaNav();
          // dev-7 fase 41: re-aplica el estado del toggle de la leyenda
          // (el re-render la vuelve a crear desde cero).
          this._showMetaSection('torretas');
          // dev-7 fase 43: y el del banner (idem: arranca cerrado).
          this._syncMetaBanner(false);
          restoreMetaScroll(el, prevScroll);
        }
        break;
      default: el.innerHTML = '';
    }
    // fase 75: al entrar a una pantalla nueva, el foco no puede quedar en
    // <body>. Se enfoca el título (tabindex -1) o el primer control; en
    // re-renders de la MISMA pantalla no se toca para no perder foco/scroll.
    if (changed) this._focusScreen(el);
  }

  /** Enfoca el encabezado o el primer control de una pantalla. */
  _focusScreen(root) {
    if (!root || typeof root.querySelector !== 'function') return;
    const target = root.querySelector('h1,h2,.screen-title')
      ?? root.querySelector('button:not([disabled]),[href],[tabindex]');
    if (!target || typeof target.focus !== 'function') return;
    const tag = target.tagName ?? '';
    if (/^H[12]$/.test(tag) && typeof target.hasAttribute === 'function'
      && !target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
    }
    try { target.focus({ preventScroll: true }); } catch (_err) {
      try { target.focus(); } catch (_err2) { /* sin foco */ }
    }
  }

  _screenMenu() {
    // dev-7 fase 13: selector de temas — reskinea el HUD/paneles/botones
    // (no el canvas del juego, ver theme.js). El activo queda marcado.
    // dev-7 fase 19: calidad gráfica (ver quality.js).
    // dev-7 fase 14: "Borrar progreso" — confirmación inline en 2 pasos.
    return buildMenuScreen({
      theme: loadTheme(),
      quality: loadQuality(),
      confirmingReset: this._confirmingReset,
    });
  }

  /**
   * Clicks en los swatches de tema — aplica al instante y persiste.
   *
   * dev-7 fase 55: YA NO re-renderiza la pantalla al cambiar de tema (
   * eso hacia parpadear el menu entero y perder el foco del boton).
   * Ahora solo se marca el nuevo swatch activo y se actualiza el
   * rótulo: el resto de la pantalla no se toca.
   */
  _bindThemePicker() {
    this.overlayRoot.querySelectorAll('[data-theme-id]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.themeId;
        saveTheme(id);
        // dev-7 fase 54: el tema tiñe tambien el canvas del juego.
        applyThemeToGame(id, this.engine, loadSkin());
        // dev-7 fase 55: marcar el activo en el sitio, sin re-renderizar.
        this._markActiveTheme(id);
      });
    });
    // dev-7 fase 19: calidad gráfica — aplica YA al contexto/motor vivos
    // (sin esto habría que recargar la página para que surta efecto).
    this.overlayRoot.querySelectorAll('[data-quality-id]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.qualityId;
        saveQuality(id);
        // fase 75: aplicar a TODOS los contexts (visible + 4 caches
        // offscreen), no solo al visible. Antes el fondo/niebla/deck
        // seguían con shadowBlur en calidad baja hasta el próximo resize.
        this.engine.applyQualityTo(applyQualityToContext, id);
        this.engine.setParticleCap(particleCapFor(id));
        // dev-7 fase 29: la calidad también se aplica a la capa DOM (el
        // desenfoque de los overlays se apaga en "baja": sin GPU, el blur
        // del modal de cartas costaba 34 FPS → 4,6 FPS).
        applyQualityToDom(id);
        this.showScreen('MENU');
      });
    });
  }

  /** Clicks del botón "Borrar progreso" y su confirmación (dev-7 fase 14). */
  _bindResetProgress() {
    this.overlayRoot.querySelectorAll('[data-action-reset]').forEach((b) => {
      b.addEventListener('click', () => {
        const step = b.dataset.actionReset;
        if (step === 'ask') {
          this._confirmingReset = true;
        } else if (step === 'cancel') {
          this._confirmingReset = false;
        } else if (step === 'confirm') {
          resetProgress();
          resetMeta();
          this._confirmingReset = false;
          // Refleja el borrado en la Game viva (igual que el patrón ya
          // usado al mejorar una torreta desde TORRETAS). OJO: el campo
          // real es `progressData` (desbloqueo de stages) — `progress`
          // es un campo DISTINTO (0..1, progreso de oleada del HUD).
          if (typeof window !== 'undefined' && window.__GDF__?.game) {
            window.__GDF__.game.progressData = undefined;
            window.__GDF__.game.meta = undefined;
          }
        }
        this.showScreen('MENU');
      });
    });
  }

  _screenSelectStage() {
    // Datos reales de stages + desbloqueo persistente (dev-5, §2.9/§2.10)
    const data = this._selectData();
    if (!data) {
      // Fallback sin datos (debería ser transitorio): todo bloqueado salvo 1.
      // Sin payload no hay tarjetas del ∞: el endgame necesita el récord real.
      return this._renderStageList(
        [{ id: 1, name: 'Normal Stage 1', unlocked: true, bestScore: null }],
      );
    }
    // fase 67: el ∞ y el diario llegan ya calculados (`data.endless`).
    // fase 69: y el heat activo/récord en `data.heat` (tarjeta PROTOCOLO).
    // fase 70: y el récord de oleadas en `data.survival` (tarjeta ARCADE).
    return this._renderStageList(
      data.stages,
      data.endless ?? null,
      data.heat ?? null,
      data.survival ?? null,
    );
  }

  /**
   * Lista de stages agrupada por DÉCADAS (T1): cada bloque de 10 lleva
   * su cabecera y cada fila su identidad (punto de tema, insignia de
   * JEFE, récord). El HTML lo arma buildStageList() (función pura).
   *
   * fase 67: `endless` es el payload del endgame (`_selectData().endless`).
   * Sin él (o cerrado) no se pinta ninguna tarjeta.
   *
   * fase 69: `heat` (`_selectData().heat`) antepone la tarjeta del
   * PROTOCOLO. Sin payload no se pinta: el fallback es el de siempre.
   *
   * fase 70: `survival` (`_selectData().survival`) añade la tarjeta del
   * modo arcade al final de las de arriba; sin payload tampoco se pinta.
   */
  _renderStageList(stages, endless = null, heat = null, survival = null) {
    return `
      <section class="screen">
        <div class="panel">
          <h2 class="screen-title">SELECCIONAR STAGE</h2>
          ${buildStageList(stages, { familyOf: stageFamilyOf, endless, heat, survival })}
        </div>
      </section>`;
  }

  /**
   * Pantalla PROTOCOLO (fase 69): el menú de handicaps del heat. El HTML
   * lo arma `buildProtocolHtml()` (pura) con `_heatData()`; sin juego vivo
   * cae en el aviso + VOLVER.
   */
  _screenProtocol() {
    return `
      <section class="screen">
        <div class="panel protocol-panel">${buildProtocolHtml(this._heatData())}</div>
      </section>`;
  }

  /**
   * Pantalla RÉCORDS (fase 70): los cinco modos en un solo sitio. El HTML
   * lo arma `buildRecordsHtml()` (pura) con `_recordsData()`; sin juego
   * vivo cae en el aviso + la salida.
   */
  _screenRecords() {
    return `
      <section class="screen">
        <div class="panel records-panel">${buildRecordsHtml(this._recordsData())}</div>
      </section>`;
  }

  /**
   * Pantalla CRÉDITOS Y LICENCIAS (fase 72). El HTML lo arma
   * `buildCreditsHtml()` (pura): el contenido es estático y vive embebido en
   * js/licenses.js, así que no hay `_data()` que consultar ni juego vivo que
   * pueda faltar. Mismo molde que `_screenRecords()`.
   */
  _screenCredits() {
    return `
      <section class="screen">
        <div class="panel credits-panel">${buildCreditsHtml()}</div>
      </section>`;
  }

  /**
   * dev-7 fase 39 — Pantalla de PAUSA.
   *
   * v5 5a/5: navegación real desde PAUSA — 4 acciones: continuar,
   * torretas (mejoras), menú principal y elegir stage (la anterior
   * etiqueta "SALIR AL MENÚ" iba al selector y engañaba). Salir de la
   * run por TORRETAS/MENÚ/ELEGIR STAGE abandona la partida en curso
   * (sin recompensa): startStage() arranca una run limpia.
   *
   * dev-7 fase 39: abandonarla ahora PIDE CONFIRMACIÓN (2 pasos): un
   * toque por error no puede costarte la run.
   *
   * Antes, "TORRETAS", "MENÚ PRINCIPAL" y "ELEGIR STAGE" destruían la
   * partida EN CURSO sin preguntar: un toque por error y perdías la run
   * (con sus fragmentos). Ahora pide confirmación (2 pasos, el mismo
   * patrón inline de "Borrar progreso" del menú).
   */
  _screenPaused() {
    const p = this._abandonPending;
    // Un botón destructivo: primero pregunta, después actúa (el
    // `data-action` real sólo aparece en el segundo paso).
    // dev-7 fase 41: los iconos son SVG inline (antes eran emoji del
    // sistema, que se veían distintos en cada plataforma).
    const exit = (act, label, icon) => (p === act
      ? `<button class="btn ghost danger" data-action="${act}">${UI_ICONS.aviso} ${label} · ¿SEGURO?</button>`
      : `<button class="btn ghost" data-abandon="${act}">${icon} ${label}</button>`);
    return `
      <section class="screen">
        <div class="panel">
          <h2 class="screen-title">PAUSA</h2>
          <p class="hint pause-hint">[P]/[Esc] continuar · [1][2][3] velocidad x1/x1.5/x2 · [Espacio] ultimate</p>
          ${buildDamageLegendHtml()}
          <div class="theme-picker" role="radiogroup" aria-label="Tema de la interfaz">
            ${buildThemeSwatches(loadTheme())}
          </div>
          <p class="theme-picker-label" data-theme-label>Tema: ${THEMES.find((t) => t.id === loadTheme())?.name ?? loadTheme()}</p>
          <button class="btn" data-action="resume">▶ CONTINUAR</button>
          ${exit('torretas', 'TORRETAS', UI_ICONS.torreta)}
          ${exit('menu', 'MENÚ PRINCIPAL', UI_ICONS.menu)}
          ${exit('select-stage', 'ELEGIR STAGE', UI_ICONS.batalla)}
          ${p ? '<button class="btn ghost" data-abandon-cancel>SEGUIR JUGANDO</button>' : ''}
        </div>
      </section>`;
  }

  /**
   * dev-7 fase 55 — Marca el tema activo SIN re-renderizar la pantalla.
   *
   * Actualiza la clase `active` y el `aria-checked` de los swatches (los
   * dos pueden estar en pantalla a la vez: el del menu y el de la pausa) y
   * el rótulo con el nombre del tema.
   *
   * @param {string} id id del tema activo
   */
  _markActiveTheme(id) {
    const root = this.overlayRoot;
    if (!root) return;
    root.querySelectorAll('[data-theme-id]').forEach((b) => {
      const activo = b.dataset.themeId === id;
      b.classList.toggle('active', activo);
      b.setAttribute('aria-checked', String(activo));
    });
    const nombre = THEMES.find((t) => t.id === id)?.name ?? id;
    const label = root.querySelector('.theme-picker-label[data-theme-label]');
    if (label) label.textContent = `Tema: ${nombre}`;
  }

  /**
   * dev-7 fase 39 — Enlaza los botones de "abandonar la partida" de la
   * pantalla de pausa (2 pasos: preguntar → confirmar).
   */
  _bindPauseActions() {
    const root = this.overlayRoot;
    if (!root) return;
    root.querySelectorAll('[data-abandon]').forEach((b) => {
      b.addEventListener('click', () => {
        this._abandonPending = b.dataset.abandon;
        this.showScreen('PAUSED');
      });
    });
    root.querySelectorAll('[data-abandon-cancel]').forEach((b) => {
      b.addEventListener('click', () => {
        this._abandonPending = null;
        this.showScreen('PAUSED');
      });
    });
  }

  /** STAGE CLEAR real (§2.10): score total + bonus desglosado + kills. */
  _screenStageClear(d) {
    if (!d) {
      return `<section class="screen"><div class="panel">
        <h2 class="screen-title gold">STAGE CLEAR</h2>
        <button class="btn" data-action="select-stage">ELEGIR STAGE</button>
      </div></section>`;
    }
    // fase 67: en el ∞ el botón CONTINÚA la profundidad (`endless.next` ya
    // viene calculado); en campaña sigue siendo "SIGUIENTE STAGE". Los dos
    // carteles pueden convivir en el S50: "campaña completa" + continuar.
    const endlessNext = payloadInt(d.endless?.next);
    const nextLabel = endlessNext != null
      ? `▶ CONTINUAR — ETAPA ${endlessNext}`
      : '▶ SIGUIENTE STAGE';
    // `isFinal` lo manda main.js; si todavía no llega se DEDUCE del último
    // stage de la campaña (es el único que no es ∞), para no perder el
    // cartel de "campaña completa" que ya existía.
    const campaignFinal = d.isFinal === true
      || (d.isFinal == null && d.endless == null && d.stageId === STAGES.length);
    return `
      <section class="screen">
        <div class="panel">
          <img class="clear-sparkle tl" src="assets/sprites/ui_tinted/sparkle_gold.png" alt="">
          <img class="clear-sparkle tr" src="assets/sprites/ui_tinted/sparkle_gold.png" alt="">
          <img class="clear-sparkle br" src="assets/sprites/ui_tinted/sparkle_gold.png" alt="">
          <h2 class="screen-title gold">STAGE CLEAR</h2>
          <p class="hint">${esc(d.stageName)} · ${fmtTime(d.time)}</p>
          <dl class="summary">
            <div><dt>SCORE TOTAL</dt><dd>${fmt(d.score)}</dd></div>
            ${d.scoreKills != null ? `<div><dt>&nbsp;· por kills</dt><dd>${fmt(d.scoreKills)}</dd></div>` : ''}
            <div><dt>BONUS DE OLA/CLEAR</dt><dd class="ok">+${fmt(d.clearBonus)}</dd></div>
            <div><dt>NIVEL ALCANZADO</dt><dd>Lv.${d.lv}</dd></div>
            ${d.cards ? `<div><dt>MEJORAS APLICADAS</dt><dd>${d.cards}</dd></div>` : ''}
            <div><dt>KILLS</dt><dd>${d.kills}</dd></div>
            ${d.leaks != null ? `<div><dt>FUGAS</dt><dd>${d.leaks ?? 0}</dd></div>` : ''}
            ${d.hpFrac != null ? `<div><dt>INTEGRIDAD DE LA BASE</dt><dd>${Math.round(d.hpFrac * 100)} %</dd></div>` : ''}
            ${d.metaFrags ? `<div><dt>FRAGMENTOS META (al pool)</dt><dd class="ok">+${d.metaFrags}${d.metaFirst ? ' · ×2 1ª vez' : ''}</dd></div>` : ''}
            ${d.metaGold ? `<div><dt>ORO META${d.metaGoldBonus ? ' · campaña completa' : ''}</dt><dd class="ok">+${d.metaGold}</dd></div>` : ''}
            ${endlessSummaryRows(d.endless, { milestone: true })}
            ${heatSummaryRows(d.heat)}
            ${dailySummaryRow(d.daily)}
          </dl>
          <div class="stage-actions">
          ${campaignFinal ? '<p class="hint ok">¡CAMPAÑA COMPLETA! Seguí en el modo infinito</p>' : ''}
          ${d.hasNext ? `<button class="btn big" data-action="next-stage">${nextLabel}</button>` : ''}
          ${d.metaFrags ? `<button class="btn big" data-action="torretas" title="Gastar los fragmentos que ganaste en subir de nivel tus torretas">${UI_ICONS.torreta} MEJORAR TORRETAS</button>` : ''}
          <button class="btn ghost" data-action="retry">↻ REINTENTAR</button>
          <button class="btn" data-action="select-stage">ELEGIR STAGE</button>
          </div>
        </div>
      </section>`;
  }

  /** GAME OVER real (§2.10): score, stage alcanzado, kills. */
  _screenGameOver(d) {
    if (!d) {
      return `<section class="screen"><div class="panel">
        <h2 class="screen-title danger"><img class="danger-icon" src="assets/sprites/ui_tinted/icon_boss_warning_red.png" alt="">LA BASE HA CAÍDO</h2>
        <button class="btn" data-action="menu">MENÚ</button>
      </div></section>`;
    }
    return `
      <section class="screen">
        <div class="panel">
          <h2 class="screen-title danger"><img class="danger-icon" src="assets/sprites/ui_tinted/icon_boss_warning_red.png" alt="">LA BASE HA CAÍDO</h2>
          <p class="hint">${esc(d.stageName)}</p>
          <dl class="summary">
            <div><dt>SCORE</dt><dd>${fmt(d.score)}</dd></div>
            <div><dt>KILLS</dt><dd>${d.kills}</dd></div>
            ${d.leaks != null ? `<div><dt>FUGAS</dt><dd>${d.leaks ?? 0}</dd></div>` : ''}
            ${d.maxHp ? `<div><dt>INTEGRIDAD</dt><dd>${Math.round(100 * (d.hpLeft ?? 0) / d.maxHp)} %</dd></div>` : ''}
            <div><dt>TIEMPO</dt><dd>${fmtTime(d.time)}</dd></div>
            ${heatSummaryRows(d.heat, { defeat: true })}
            ${dailySummaryRow(d.daily)}
          </dl>
          ${endlessDefeatBlock(d.endless)}
          ${survivalDefeatBlock(d.survival)}
          ${d.fragsLost ? `
          <div class="lost-box">
            <p class="lost-title">LO QUE LOGRASTE</p>
            <dl class="summary">
              <div><dt>NIVEL ALCANZADO</dt><dd>Lv.${d.lv ?? 1}</dd></div>
              <div><dt>MEJORAS APLICADAS</dt><dd>${d.cards ?? 0}</dd></div>
            </dl>
            <p class="lost-title">LO QUE NO TE LLEVASTE</p>
            <dl class="summary">
              <div><dt>FRAGMENTOS META</dt><dd>${d.fragsLost}</dd></div>
              <div><dt>ORO META</dt><dd>${d.goldLost ?? 0}</dd></div>
            </dl>
          </div>` : ''}
          <button class="btn big" data-action="retry">↻ REINTENTAR</button>
          <button class="btn" data-action="select-stage">ELEGIR STAGE</button>
          <button class="btn ghost" data-action="menu">${UI_ICONS.menu} MENÚ PRINCIPAL</button>
        </div>
      </section>`;
  }

  // ---------- v3.5 META-GAME: pantalla TORRETAS (reference-torretas.jpg) ----------

  /** Estado meta actual (la Game lo recarga al entrar; fallback a storage). */
  _metaState() {
    return typeof window !== 'undefined' ? (window.__GDF__?.game?.meta ?? loadMeta()) : loadMeta();
  }

  /**
   * Pantalla meta del diseño base: barra superior (badge circular + nombre
   * + oro) + grilla de las torretas del meta (fragmentos por card) + nav
   * inferior fija de 5 pestañas con "Torreta" activa.
   *
   * dev-7 fase 18 (pedido del usuario, sigue vigente tras el trabajo
   * externo de fases 16-17 — confirmado con perks-choice-torretas.png):
   * el banner de arriba mostraba "Incremento Total del DAÑO Crítico" con
   * el viejo `critBonusPct()` — un número que NUNCA se lee en el combate real (el
   * crítico de verdad ahora sale de los perks elegidos, `critChanceAdd`/
   * `critDmgMul` en towers.js/enemies.js — completamente aparte). Sigue
   * siendo el mismo "recurso sin usar" que el usuario reportó, con perks
   * A/B de por medio. Reemplazado por una explicación clara y siempre
   * visible del proceso real: fragmentos (subir de nivel, compartidos
   * entre todas las torretas) vs. oro (redistribuir perks elegidos). El
   * botón "＋" de oro también salía (implica una compra que no existe — no
   * hay tienda).
   *
   * El HTML lo arma buildTorretasScreen() (puro, testeable sin DOM) y
   * TODOS los conteos salen de META_TOWERS/META_MAX_LEVEL.
   */
  _screenTorretas() {
    // El HTML lo arma buildTorretasScreen() (función pura, testeable en
    // Node sin DOM): los conteos de torretas y niveles salen de los DATOS
    // (META_TOWERS / META_MAX_LEVEL), nunca de literales.
    return buildTorretasScreen(this._metaState(), {
      resetArmed: this._perkResetArmed,
      unlockArmed: this._unlockArmed,
    });
  }

  /** Dibuja los íconos canvas de las tarjetas (render REAL de la torre)
   *  y los del bestiario (render REAL del enemigo). */
  _paintMetaIcons() {
    const canvases = this.overlayRoot?.querySelectorAll('[data-meta-icon]') ?? [];
    for (const c of canvases) {
      renderTowerIcon(c, c.dataset.metaIcon, {
        themeId: loadTheme(),
        skinId: loadSkin(),
      });
    }
    // dev-7 fase 40: los iconos del bestiario (el enemigo de verdad).
    // fase 65/68: las fichas de VARIANTE de élite pasan su id por
    // `data-bestiary-variant` para que el icono dibuje el rasgo (escudo,
    // líneas de velocidad, aura de cura, placas...) — el mismo render que
    // en el campo, no un dibujo aparte.
    const bestiario = this.overlayRoot?.querySelectorAll('[data-bestiary-icon]') ?? [];
    for (const c of bestiario) {
      renderEnemyIcon(c, c.dataset.bestiaryIcon, c.dataset.bestiaryVariant ?? null);
    }
  }

  /** Flash del hint #meta-hint (re-query cada vez: sobrevive re-renders). */
  _metaFlash(text, ms = 1600) {
    const hint = this.overlayRoot?.querySelector('#meta-hint');
    if (!hint) return;
    hint.textContent = text;
    hint.classList.remove('show');
    void hint.offsetWidth;
    hint.classList.add('show');
    clearTimeout(this._metaHintT);
    this._metaHintT = setTimeout(() => hint.classList.remove('show'), ms);
  }

  /** Panel PROGRESO con datos reales del meta (v5 5b/5, sin MTX). dev-7
   *  fase 18: la fila "DAÑO CRÍTICO" mostraba un bono que no se usa en
   *  el combate real (el crítico de verdad sale de los perks elegidos,
   *  no de esta fórmula global) — reemplazada por el bono de daño que
   *  SÍ es real (metaDmgMul, el mismo que ya se ve por torreta arriba).
   *  dev-7 fase 39: se renombró de "DEFENSA" a "PROGRESO" (no defendía
   *  nada: mostraba la progresión) y pasó a ser una SECCIÓN propia. */
  _metaProgresoHtml(meta) {
    const maxedCount = META_TOWERS.filter((t) => (meta.levels?.[t.key] ?? 1) >= META_MAX_LEVEL).length;
    // dev-7 fase 59.4: el PODER del meta (el multiplicador REAL de daño
    // que leen las torres en el combate) frente al que tenía sin
    // mejoras (×1,0): es lo que hace fuerte al jugador.
    const power = metaPowerMul(meta);
    return `
      <div class="meta-def-row"><span class="meta-def-k">Poder en partida</span><b>${fmtMul(power)} de daño (sin mejoras: ×1,0)</b></div>
      <div class="meta-def-row"><span class="meta-def-k">Bono de daño por nivel</span><b>+${Math.round(META_DMG_PER_LEVEL * 100)}% (por torreta, acumulable)</b></div>
      <div class="meta-def-row"><span class="meta-def-k">Niveles totales de torreta</span><b>${totalMetaLevels(meta)}</b></div>
      <div class="meta-def-row"><span class="meta-def-k">Torretas al máximo</span><b>${maxedCount} de ${META_TOWERS.length}</b></div>
      <div class="meta-def-row"><span class="meta-def-k">Victorias</span><b>${meta.victories ?? 0}</b></div>
      <div class="meta-def-row"><span class="meta-def-k">Fragmentos por victoria</span><b>${META_FRAG_PER_VICTORY} al pool (×2 la primera vez por stage)</b></div>
      <div class="meta-def-row"><span class="meta-def-k">Oro</span><b>${metaGold(meta)}● (se gasta en desbloquear unidades y redistribuir perks)</b></div>`;
  }

  /**
   * dev-7 fase 39 — Cambia de SECCIÓN dentro de la pantalla de torretas.
   *
   * Antes la nav tenía 5 pestañas y sólo 2 eran secciones reales: "Tienda"
   * y "Enemigos" eran callejones sin salida (un toast cada uno) y
   * "Defensa" abría un panel ABSOLUTO que tapaba la grilla. Ahora hay 3
   * secciones (Torreta, Bestiario, Progreso) y 2 salidas (Batalla, Menú).
   *
   * Las secciones son contenedores propios: se muestra una y se ocultan
   * las otras, y sólo se resalta la pestaña de la sección visible (antes
   * la pestaña de un callejón sin salida quedaba resaltada con la grilla
   * delante: la UI se contradecía).
   *
   * dev-7 fase 41: la LEYENDA de tipos de daño es un TOGGLE dentro de la
   * sección "Torreta" (ver _toggleMetaLegend): abierta, reemplaza la
   * grilla —si no, la tabla queda aplastada y su última fila detrás de
   * la nav fija—; cerrada, la grilla vuelve a ocupar la pantalla.
   */
  _showMetaSection(name) {
    const root = this.overlayRoot;
    if (!root) return;
    // Al salir de la sección "Torreta" la leyenda se cierra: es parte de
    // esa sección, no un panel flotante.
    if (name !== 'torretas') this._legendOpen = false;
    const VIEWS = {
      bestiario: ['meta-bestiario'],
      progreso: ['meta-progreso'],
    };
    for (const [view, ids] of Object.entries(VIEWS)) {
      const on = view === name;
      for (const id of ids) {
        const el = root.querySelector('#' + id);
        if (el) el.classList.toggle('hidden', !on);
      }
    }
    // El banner y la grilla son de la sección "Torreta"; con la leyenda
    // abierta ceden el lugar (la tabla necesita el ancho y el alto).
    const legendOpen = name === 'torretas' && this._legendOpen;
    const banner = root.querySelector('#meta-banner');
    if (banner) banner.classList.toggle('hidden', name !== 'torretas' || legendOpen);
    const grid = root.querySelector('#meta-grid');
    if (grid) grid.classList.toggle('hidden', name !== 'torretas' || legendOpen);
    // dev-7 fase 59.4: la línea de PODER es de la sección "Torreta"
    // también: se oculta con la leyenda (que necesita el alto) y con las
    // otras secciones.
    const power = root.querySelector('#meta-power');
    if (power) power.classList.toggle('hidden', name !== 'torretas' || legendOpen);
    this._syncMetaLegend(legendOpen);
    if (name === 'progreso') {
      const sec = root.querySelector('#meta-progreso');
      if (sec) sec.innerHTML = this._metaProgresoHtml(this._metaState());
    }
    // El resalte: sólo la sección visible (las salidas nunca se resaltan).
    root.querySelectorAll('[data-meta-tab]').forEach((x) => {
      if (x.dataset.action) return;
      x.classList.toggle('active', x.dataset.metaTab === name);
    });
  }

  /**
   * dev-7 fase 41 — Refleja el estado del TOGGLE de la leyenda en el DOM.
   *
   * - la leyenda se muestra/oculta con la CLASE "hidden" (la que usa todo
   *   el resto de la UI), NUNCA con el atributo hidden del HTML: son dos
   *   mecanismos distintos y mezclarlos deja el nodo sin caja;
   * - el botón lleva `aria-expanded` (accesibilidad) y su texto cambia:
   *   cerrado dice "VER TIPOS DE DAÑO", abierto "OCULTAR TIPOS DE DAÑO".
   *
   * @param {boolean} [open] el estado a aplicar (por defecto, el actual)
   * @returns {boolean} el estado que quedó
   */
  _syncMetaLegend(open = this._legendOpen) {
    const root = this.overlayRoot;
    if (!root) return !!open;
    this._legendOpen = !!open;
    const legend = root.querySelector('#meta-legend');
    if (legend) legend.classList.toggle('hidden', !this._legendOpen);
    const btn = root.querySelector('[data-meta-legend-toggle]');
    if (btn) {
      btn.setAttribute('aria-expanded', this._legendOpen ? 'true' : 'false');
      btn.textContent = this._legendOpen ? 'OCULTAR TIPOS DE DAÑO' : 'VER TIPOS DE DAÑO';
    }
    return this._legendOpen;
  }

  /**
   * dev-7 fase 41 — Abre/cierra la LEYENDA de tipos de daño.
   *
   * Antes la tabla estaba siempre abierta al final de la pantalla de
   * torretas, FUERA del área scrolleable, y en móvil quedaba detrás de
   * la nav inferior (la última fila era ilegible). Ahora es un toggle:
   * abierta, la tabla tiene su propio scroll y se lee ENTERA.
   *
   * @param {boolean} [force] abre (true) o cierra (false) sin alternar
   */
  _toggleMetaLegend(force) {
    const next = force === undefined ? !this._legendOpen : !!force;
    this._legendOpen = next;
    // La leyenda es parte de la sección "Torreta": al abrirla se vuelve a
    // esa sección (si el jugador estaba en el bestiario o el progreso).
    this._showMetaSection('torretas');
    return this._legendOpen;
  }

  /**
   * dev-7 fase 43 — Refleja el estado del TOGGLE del banner en el DOM.
   *
   * - la explicación se muestra/oculta con la CLASE "hidden" (la que usa
   *   todo el resto de la UI), NUNCA con el atributo hidden del HTML: son
   *   dos mecanismos distintos y mezclarlos deja el nodo sin caja;
   * - el botón lleva `aria-expanded` (accesibilidad) y su aria-label
   *   cambia: cerrado dice "Ver cómo se sube de nivel", abierto
   *   "Ocultar cómo se sube de nivel".
   *
   * @param {boolean} [open] el estado a aplicar (por defecto, el actual)
   * @returns {boolean} el estado que quedó
   */
  _syncMetaBanner(open = this._bannerMoreOpen) {
    const root = this.overlayRoot;
    if (!root) return !!open;
    this._bannerMoreOpen = !!open;
    const more = root.querySelector('#meta-banner-more');
    if (more) more.classList.toggle('hidden', !this._bannerMoreOpen);
    const btn = root.querySelector('[data-meta-banner-toggle]');
    if (btn) {
      btn.setAttribute('aria-expanded', this._bannerMoreOpen ? 'true' : 'false');
      btn.setAttribute('aria-label', this._bannerMoreOpen
        ? 'Ocultar cómo se sube de nivel'
        : 'Ver cómo se sube de nivel');
    }
    return this._bannerMoreOpen;
  }

  /**
   * dev-7 fase 43 — Abre/cierra la EXPLICACIÓN del banner "¿Cómo subo de
   * nivel?".
   *
   * Antes era una prosa siempre visible que se comía 130 px de una
   * pantalla de 844 (medido) para explicar algo que se lee UNA vez. Ahora
   * la cabecera (título + contador) queda siempre visible y la
   * explicación está plegada detrás del botón "?".
   *
   * @param {boolean} [force] abre (true) o cierra (false) sin alternar
   * @returns {boolean} el estado que quedó
   */
  _toggleMetaBanner(force) {
    const next = force === undefined ? !this._bannerMoreOpen : !!force;
    this._bannerMoreOpen = next;
    this._syncMetaBanner(this._bannerMoreOpen);
    return this._bannerMoreOpen;
  }

  /** Nav inferior: las 3 SECCIONES (Torreta/Bestiario/Progreso) y las 2
   *  SALIDAS (Batalla/Menú, que las maneja bindActions); MEJORAR →
   *  upgradeTower + re-render + feedback. */
  _bindMetaNav() {
    const root = this.overlayRoot;
    if (!root) return;
    const flash = (text, ms) => this._metaFlash(text, ms);
    root.querySelectorAll('[data-meta-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.action) return; // Batalla / Menú: los maneja bindActions
        const tab = b.dataset.metaTab;
        if (tab === 'torretas' || tab === 'bestiario' || tab === 'progreso') {
          this._showMetaSection(tab);
        }
      });
    });
    // dev-7 fase 41: el botón de la LEYENDA de tipos de daño (abre/cierra
    // la tabla). No es una pestaña: es un toggle de la sección "Torreta".
    root.querySelectorAll('[data-meta-legend-toggle]').forEach((b) => {
      b.addEventListener('click', () => this._toggleMetaLegend());
    });
    // dev-7 fase 43: el botón "?" del banner "¿Cómo subo de nivel?" (abre
    // y cierra la explicación plegable).
    root.querySelectorAll('[data-meta-banner-toggle]').forEach((b) => {
      b.addEventListener('click', () => this._toggleMetaBanner());
    });
    // Botón MEJORAR por card (v5 5b/5): gasta fragmentos → +1 nivel YA.
    // v2: los fragmentos son UN pool compartido (no por torreta).
    root.querySelectorAll('[data-meta-upgrade]').forEach((b) => {
      b.addEventListener('click', () => {
        const meta = this._metaState();
        const res = upgradeTower(meta, b.dataset.metaUpgrade);
        if (!res.ok) {
          flash(res.reason === 'maxed'
            ? `Esta torreta ya está al máximo (Nvl.${META_MAX_LEVEL})`
            : res.reason === 'locked'
              ? 'Esa unidad está bloqueada'
              : `Faltan fragmentos: el pool tiene ${fmtFrags(meta.fragsPool ?? 0)} y cada victoria suma ${META_FRAG_PER_VICTORY}`);
          return;
        }
        // Mantener la vista al día: la Game relee storage al volver (toTorretas)
        if (typeof window !== 'undefined' && window.__GDF__?.game) {
          window.__GDF__.game.meta = res.meta;
        }
        try { this.audio.sfx('levelup'); } catch (_err) { /* sin ctx aún */ }
        this.showScreen('TORRETAS'); // re-render: banner/barra/botones frescos
        // El bono se anuncia con el multiplicador REAL (curva × hitos).
        const type = META_TOWERS.find((t) => t.key === b.dataset.metaUpgrade)?.type;
        const pct = type ? Math.round((metaDmgMul(type, res.meta) - 1) * 100) : 0;
        requestAnimationFrame(() => flash(`¡TORRETA MEJORADA! +${pct}% daño en partida`));
      });
    });
    // v2: DESBLOQUEAR una unidad con ORO — 2 pasos (el mismo patrón inline
    // de REDISTRIBUIR: nada de confirm() nativo). El primer toque arma la
    // compra (la card muestra "¿SEGURO?"), el segundo la paga.
    root.querySelectorAll('[data-meta-unlock]').forEach((b) => {
      b.addEventListener('click', () => {
        const key = b.dataset.metaUnlock;
        const entry = META_TOWERS.find((t) => t.key === key);
        const name = entry?.name ?? key;
        const cost = META_UNLOCK_COSTS[key] ?? 0;
        const meta = this._metaState();
        if (!this._unlockArmed?.[key]) {
          const gold = metaGold(meta);
          if (gold < cost) {
            flash(`Te faltan ${cost - gold} de oro para desbloquear ${name} (ganá stages para recibirlo)`);
            return;
          }
          this._unlockArmed = { ...(this._unlockArmed ?? {}), [key]: true };
          this.showScreen('TORRETAS');
          requestAnimationFrame(() => flash(`Tocá otra vez para desbloquear ${name} (${cost}●)`, 2400));
          return;
        }
        this._unlockArmed = { ...(this._unlockArmed ?? {}), [key]: false };
        const res = unlockTower(meta, key);
        if (!res.ok) {
          flash(res.reason === 'insufficient'
            ? 'Oro insuficiente para desbloquear'
            : res.reason === 'owned'
              ? 'Esa unidad ya está desbloqueada'
              : 'No se pudo desbloquear');
          this.showScreen('TORRETAS');
          return;
        }
        // Mantener la vista al día: la Game relee storage al volver (toTorretas)
        if (typeof window !== 'undefined' && window.__GDF__?.game) {
          window.__GDF__.game.meta = res.meta;
        }
        try { this.audio.sfx('levelup'); } catch (_err) { /* sin ctx aún */ }
        this.showScreen('TORRETAS'); // re-render: la card pasa a MEJORAR
        requestAnimationFrame(() => flash(`¡${name.toUpperCase()} DESBLOQUEADA!`));
      });
    });
    // fase 16: ELEGIR PERK pendiente → modal A/B (primer tier sin elegir).
    root.querySelectorAll('[data-perk-pick]').forEach((b) => {
      b.addEventListener('click', () => this._showPerkChoiceModal(b.dataset.perkPick));
    });
    // fase 16: REDISTRIBUIR — 2 pasos inline (sin confirm() nativo).
    root.querySelectorAll('[data-perk-reset-ask]').forEach((b) => {
      b.addEventListener('click', () => {
        const meta = this._metaState();
        const gold = meta.gold ?? 0;
        if (gold < PERK_RESET_COST) {
          flash(`Te faltan ${PERK_RESET_COST - gold} de oro para redistribuir (ganá stages para recibirlo)`);
          return;
        }
        this._perkResetArmed = { ...(this._perkResetArmed ?? {}), [b.dataset.perkResetAsk]: true };
        this.showScreen('TORRETAS');
      });
    });
    root.querySelectorAll('[data-perk-reset-cancel]').forEach((b) => {
      b.addEventListener('click', () => {
        this._perkResetArmed = { ...(this._perkResetArmed ?? {}), [b.dataset.perkResetCancel]: false };
        this.showScreen('TORRETAS');
      });
    });
    root.querySelectorAll('[data-perk-reset-confirm]').forEach((b) => {
      b.addEventListener('click', () => {
        const res = resetPerks(b.dataset.perkResetConfirm, this._metaState());
        this._perkResetArmed = { ...(this._perkResetArmed ?? {}), [b.dataset.perkResetConfirm]: false };
        if (!res.ok) {
          flash(res.reason === 'insufficient' ? 'Oro insuficiente para redistribuir' : 'No se pudo redistribuir');
          this.showScreen('TORRETAS');
          return;
        }
        // Mantener la vista al día: la Game relee storage al volver (toTorretas)
        if (typeof window !== 'undefined' && window.__GDF__?.game) {
          window.__GDF__.game.meta = res.meta;
        }
        try { this.audio.sfx('levelup'); } catch (_err) { /* sin ctx aún */ }
        this.showScreen('TORRETAS');
        requestAnimationFrame(() => flash('Perks redistribuidos: volvé a elegirlos'));
      });
    });
  }

  /**
   * fase 16 — Modal de elección A/B (reutiliza #card-choice, mismo patrón
   * que CARD_CHOICE). Muestra el PRIMER tier pendiente de la torreta y
   * persiste con setPerkChoice; al elegir re-renderiza la vista.
   *
   * Accesibilidad: rol de diálogo (aria-label por tipo), Esc cierra SOLO
   * este modal (sin navegar) y el foco entra al primer botón de opción.
   */
  _showPerkChoiceModal(type) {
    this._ensureCardModal();
    if (!this.cardModal) return;
    const meta = this._metaState();
    const pendientes = pendingPerkTiers(type, meta);
    const entry = META_TOWERS.find((t) => t.type === type);
    if (!pendientes.length || !entry) return;
    const tierIdx = pendientes[0];
    const opts = getPerkOptions(type, tierIdx);
    const tierLv = (tierIdx + 1) * PERK_EVERY;
    if (!opts) return;
    const restantes = pendientes.length - 1;
    this._captureFocus();
    this.cardModal.innerHTML = `
      <h2 class="card-title">Perk · ${entry.name}</h2>
      <p class="hint">Nvl.${tierLv} desbloqueado — elegí 1 de 2${restantes > 0 ? ` (${restantes} tier pendiente más)` : ''}</p>
      <div class="perk-choice-row">
        <button class="perk-choice-btn" data-perk-choose="0">
          <b>${opts.A.desc}</b>
          <i>Opción A</i>
        </button>
        <button class="perk-choice-btn" data-perk-choose="1">
          <b>${opts.B.desc}</b>
          <i>Opción B</i>
        </button>
      </div>
      <p class="hint">La opción no elegida queda descartada · REDISTRIBUIR (${PERK_RESET_COST}●) la devuelve</p>
      <button class="btn ghost small" data-perk-close>CERRAR</button>`;
    this.cardModal.classList.remove('hidden');
    this._modalKind = 'perk';
    this._setModalLabel(`Elegí un perk para ${entry.name} — Nvl.${tierLv}`);
    // El foco entra al primer botón de opción (accesibilidad de teclado).
    const firstChoice = this.cardModal.querySelector('[data-perk-choose]');
    if (firstChoice && typeof firstChoice.focus === 'function') {
      try { firstChoice.focus(); } catch (_err) { /* sin foco */ }
    }
    this.cardModal.querySelectorAll('[data-perk-close]').forEach((b) => {
      b.addEventListener('click', () => this.hideCardChoice());
    });
    this.cardModal.querySelectorAll('[data-perk-choose]').forEach((b) => {
      b.addEventListener('click', () => {
        const res = setPerkChoice(type, tierIdx, Number(b.dataset.perkChoose), meta);
        if (!res.ok) {
          this.hideCardChoice();
          this._metaFlash('No se pudo guardar la elección', 2200);
          return;
        }
        if (typeof window !== 'undefined' && window.__GDF__?.game) {
          window.__GDF__.game.meta = res.meta;
        }
        try { this.audio.sfx('levelup'); } catch (_err) { /* sin ctx aún */ }
        // Re-render ANTES de cerrar: así el foco devuelto por
        // hideCardChoice() cae en el botón ✦ de la card nueva (el de la
        // vista vieja ya fue reemplazado por el re-render).
        this.showScreen('TORRETAS'); // re-render: card con el perk elegido
        this.hideCardChoice();
        this._metaFlash('Perk elegido', 1800);
      });
    });
  }

  /** Delegación de clicks de los overlays (main.js cablea las acciones). */
  bindActions(handlers) {
    if (!this.overlayRoot) return;
    this.overlayRoot.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const fn = handlers[btn.dataset.action];
      if (fn) fn(btn); // el handler recibe el botón (data-stage, etc.)
    });
  }

  // ---------- Modal CARD_CHOICE (v3-1/7, §4.4/D7) ----------

  /**
   * dev-7 fase 57 — El HOST de los overlays: el escenario de PANTALLA
   * COMPLETA (#overlay-stage).
   *
   * Antes los nodos de los overlays (#card-choice y #combo-panel) se
   * colgan de `this.root.parentElement`, que es #marco-portrait: su
   * caja era la del MARCO (607 px en un móvil de 390×844) y el
   * `overflow: hidden` del marco los recortaba → la columna de cartas
   * scrolleaba dentro (432 px útiles de 500) y la 3.ª carta se cortaba
   * a media descripción, con 227 px de negro sin usar abajo.
   *
   * Ahora cuelgan de #overlay-stage, un nodo fijo FUERA del marco: la
   * caja es la del marco en ancho y la de la pantalla en alto (el
   * CSS hace la cuenta) → en escritorio el overlay se ve igual que
   * antes y en móvil las 3 cartas entran enteras.
   *
   * @returns {Element|null} el nodo donde colgar los overlays
   */
  _overlayHost() {
    if (typeof document === 'undefined') return null;
    // El escenario (index.html). Si no está (DOM de prueba), el marco
    // como antes: nunca se rompe el juego por falta de un nodo.
    const stage = document.getElementById?.('overlay-stage') ?? null;
    if (stage) return stage;
    return this.root?.parentElement ?? document.body ?? null;
  }

  /**
   * Crea el nodo del modal en el escenario de overlays (#overlay-stage)
   * si no existe.
   */
  _ensureCardModal() {
    if (this.cardModal) return;
    const host = this._overlayHost(); // #overlay-stage (pantalla real)
    if (!host) return;
    const div = document.createElement('div');
    div.id = 'card-choice';
    div.classList.add('hidden');
    // dev-7 fase 46: el velo (oscuro + blur) es la clase CSS .overlay-veil,
    // la MISMA que usa el panel de combos: no se replica en inline.
    // (El nodo lo comparten el modal de cartas y el de perk: la clase no
    // rompe ninguno — solo pinta el fondo.)
    div.classList.add(OVERLAY_VEIL_CLASS);
    // Semántica de diálogo modal (accesibilidad): el nodo lo comparten el
    // modal de cartas y el de perk (el panel de combo tiene el suyo:
    // #combo-panel, ver _ensureComboPanel).
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-label', 'Selección de mejora');
    host.appendChild(div);
    // Tap en carta → evento canónico 'card:pick' (main.js aplica y sigue)
    div.addEventListener('click', (ev) => {
      const card = ev.target.closest('[data-card-id]');
      if (!card) return;
      // T4 — la carta ya se eligió: no se puede volver a tapar.
      if (card.classList.contains('dealt-out')) return;
      // T4 — anti-doble-toque: dos toques seguidos sobre la MISMA oferta
      // cuentan como uno (el modal se re-renderiza con la oferta siguiente
      // bajo el dedo y el 2º toque aplicaba OTRA carta).
      const now = Date.now();
      const ok = canPickCard({
        lastPickAt: this._lastCardPickAt,
        now,
        pickedIds: this._cardPickedIds,
        offerId: this._cardOfferId,
        cardId: card.dataset.cardId,
      });
      if (!ok) return;
      // Marca la carta: se atenúa (CSS .dealt-out) y deja de capturar toques.
      card.classList.add('dealt-out');
      this._cardPickedIds.push(card.dataset.cardId);
      this._lastCardPickAt = { at: now, offerId: this._cardOfferId };
      this.engine.emit('card:pick', { cardId: card.dataset.cardId });
    });
    // Teclado dentro del modal: Esc cierra SOLO el modal de perk (el de
    // cartas no se puede cerrar sin elegir, o la run queda trabada) y Tab
    // queda atrapado dentro del diálogo (focus trap).
    div.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (this._modalKind !== 'perk') return;
        // stopPropagation: el Esc NO debe seguir al window (main.js
        // navegaría al menú y dejaría el modal arriba del menú).
        ev.stopPropagation();
        ev.preventDefault();
        this.hideCardChoice();
        return;
      }
      if (ev.key === 'Tab') this._trapModalFocus(ev);
    });
    this.cardModal = div;
  }

  /**
   * Crea el nodo PROPIO del panel combo (#combo-panel) en el escenario
   * de overlays (#overlay-stage, pantalla real).
   *
   * El combo NO puede reutilizar #card-choice: ese nodo es el modal de
   * cartas, que no se puede cerrar sin elegir (o la run queda trabada) y
   * antes el combo pisaba su innerHTML → la oferta de 3 cartas
   * desaparecía y la run quedaba TRABADA en CARD_CHOICE (soft-lock).
   * Con nodos separados, abrir el combo no toca la oferta.
   */
  _ensureComboPanel() {
    if (this.comboPanel) return;
    const host = this._overlayHost(); // #overlay-stage (pantalla real)
    if (!host) return;
    const div = document.createElement('div');
    div.id = 'combo-panel';
    div.classList.add('hidden');
    // dev-7 fase 46: el VELO (oscuro + blur) lo pone la clase CSS
    // .overlay-veil (la misma del modal de cartas): el panel NO lleva
    // el velo en inline.
    div.classList.add(OVERLAY_VEIL_CLASS);
    // Solo el LAYOUT del overlay (posición + capas + centrado) queda
    // inline: depende del nodo propio del combo.
    div.setAttribute('style', COMBO_OVERLAY_LAYOUT);
    // Semántica de diálogo modal (accesibilidad): el combo es un overlay
    // de SOLO LECTURA que sí se puede cerrar.
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-label', 'Lista de combos');
    host.appendChild(div);
    // Teclado dentro del panel: Esc cierra SOLO el combo (el modal de
    // cartas no se puede cerrar sin elegir) y Tab queda atrapado dentro
    // del diálogo (focus trap).
    div.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        // stopPropagation: el Esc NO debe seguir al window (main.js
        // navegaría al menú y dejaría el panel arriba del menú).
        ev.stopPropagation();
        ev.preventDefault();
        this.hideComboPanel();
        return;
      }
      if (ev.key === 'Tab') this._trapModalFocus(ev, this.comboPanel);
    });
    this.comboPanel = div;
  }

  /** Etiqueta accesible del modal según su tipo (cartas/perk). */
  _setModalLabel(text) {
    if (!this.cardModal) return;
    this.cardModal.setAttribute('aria-label', text);
  }

  /** Guarda el elemento enfocado antes de abrir un modal (para devolverlo). */
  _captureFocus() {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    this._focusBeforeModal = (active && active !== document.body) ? active : null;
  }

  /** Devuelve el foco al elemento previo al abrir el modal (si sigue vivo). */
  _restoreFocus() {
    const el = this._focusBeforeModal;
    this._focusBeforeModal = null;
    if (!el || typeof el.focus !== 'function') return;
    if (el.isConnected !== false) {
      try { el.focus(); } catch (_err) { /* nodo ya desconectado */ }
      return;
    }
    // El nodo anterior se reemplazó (re-render de la pantalla): enfocar un
    // control equivalente de la vista actual.
    const alt = this.overlayRoot?.querySelector('[data-perk-pick], [data-meta-upgrade], button');
    if (alt && typeof alt.focus === 'function') {
      try { alt.focus(); } catch (_err) { /* sin foco disponible */ }
    }
  }

  /** Guarda el elemento enfocado antes de abrir el panel combo. */
  _captureComboFocus() {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    this._focusBeforeCombo = (active && active !== document.body) ? active : null;
  }

  /**
   * Devuelve el foco al elemento previo al abrir el panel combo (p.ej. el
   * botón "Lista de Combos" del modal de cartas).
   */
  _restoreComboFocus() {
    const el = this._focusBeforeCombo;
    this._focusBeforeCombo = null;
    if (!el || typeof el.focus !== 'function') return;
    if (el.isConnected === false) return; // el nodo ya no está en el DOM
    try { el.focus(); } catch (_err) { /* nodo desconectado */ }
  }

  /**
   * Focus trap: el Tab cicla dentro del modal abierto (por defecto el de
   * cartas/perk; el panel combo pasa su propio nodo).
   */
  _trapModalFocus(ev, modal = this.cardModal) {
    if (!modal) return;
    const nodes = modal.querySelectorAll(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!nodes.length) return;
    const list = Array.from(nodes);
    const first = list[0];
    const last = list[list.length - 1];
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const inside = !!active && modal.contains(active);
    if (ev.shiftKey) {
      if (!inside || active === first) {
        ev.preventDefault();
        last.focus();
      }
    } else if (!inside || active === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  /**
   * Muestra el modal LEVEL UP con la oferta [card, card, card] (§4.4):
   * fila de torres poseídas + pips arriba, 3 cartas con reveal flip
   * escalonado 0/120/240 ms, glow en hover, SFX de reveal.
   */
  showCardChoice(offer = []) {
    this._ensureCardModal();
    if (!this.cardModal) return;
    // Si el panel combo quedó abierto (p.ej. durante PLAYING), se cierra:
    // su overlay cubre la pantalla y taparía la oferta de cartas.
    this.hideComboPanel();
    // T4 — la oferta VIVA cambia: se reinician las cartas ya elegidas,
    // pero el guard anti-doble-toque SIGUE VIVO (una cadena de ofertas
    // por multi-level-up es la MISMA decisión: el 2º toque del doble
    // toque cae sobre la oferta nueva y también debe quedar bloqueado).
    this._cardPickedIds = [];
    if (this._cardOfferId == null) this._cardOfferId = `o${this._cardSession}`;
    // El foco se captura ANTES de que el modal lo tome (se devuelve al
    // cerrar): sin esto el HUD de atrás queda tabulable por debajo.
    // Solo la PRIMERA apertura captura: el re-render de la oferta
    // siguiente (multi-level-up) no debe pisar el elemento de referencia.
    if (this.cardModal.classList.contains('hidden')) this._captureFocus();
    const game = typeof window !== 'undefined' ? window.__GDF__?.game : null;
    // Fila de TORRES POSEÍDAS. fase 61: el arsenal tope son 5 torres
    // (CONFIG.SLOTS, una sola fila), así que la fila muestra como máximo
    // 5 fichas — las que haya en `slots` (con el Guardian siempre en la
    // del centro) y nunca una 6.ª. Sin torres (caso defensivo: la run
    // real arranca con el Guardian puesto) queda el guion.
    const towers = (game?.fortress?.slots ?? []).filter(Boolean);
    // Estética v3.1 (reference-levelup): diamantes de rareza — llenos en
    // dorado según el nivel de la unidad, vacíos hasta 5.
    const gems = (lv) => '◆'.repeat(lv) + '◇'.repeat(Math.max(0, 5 - lv));
    // dev-7 fase 39: la RAREZA la declara la carta (cards.js) y mide su
    // POTENCIA. Antes se derivaba del `weight` (la probabilidad de
    // sorteo): "Abanico Ampliado" salía LEGENDARIO y "Reparación de
    // Campo" también, porque ambos pesaban 10. El jugador leía la
    // etiqueta como si fuera la potencia de la carta y no lo era.
    const rarityGems = (tier) => '◆'.repeat(tier) + '◇'.repeat(4 - tier);
    const towerRow = towers.length
      ? towers.map((t) => `
          <span class="own-tower" title="Lv.${t.level}">
            <b>${esc(t.data?.name ?? t.type)}</b>
            <i>${gems(t.level ?? 1)}</i>
          </span>`).join('')
      : '<span class="own-tower"><b>—</b></span>';
    // Encabezado "Fase Normal N · Nvl.X" (fiel a la referencia).
    const stageNo = game?.stageId ?? 1;
    const headRow = `
      <div class="card-head">
        <span>Fase Normal ${stageNo}</span>
        <span>Nvl.${game?.lv ?? 1}</span>
      </div>`;
    // Botón verde "Lista de Combos" (abre el panel real vía evento canónico).
    const comboBtn = `<button class="combo-btn" data-action-combo>Lista de Combos</button>`;
    // dev-7 fase 64: el pie del modal dice lo que la oferta NO puede decir
    // por sí sola — cuántos niveles quedan en cola (el multikill abre una
    // oferta por nivel, ver main.js `_pendingLevels`) y si el tope de
    // cartas de la etapa ya se alcanzó (la energía pasa a valer SCORE).
    const hint = cardHintText({
      pendingLevels: game?._pendingLevels ?? 0,
      lv: game?.lv ?? 1,
      maxLevel: levelCap(game?.maxLevel),
    });
    const cards = offer.map((c, i) => {
      const r = cardRarity(c);
      const isUnlock = Boolean(c.tower || c.drone);
      // dev-7 fase 49: el GLIFO del TIPO DE DAÑO de la carta, con su
      // color. Los datos son los de DAMAGE_TYPES (js/damagetypes.js) y
      // el tipo lo declara la propia carta (`card.dmgType`, en cards.js):
      // las que suben el daño de una unidad toman el tipo de ESA unidad.
      // La clase .leg-glyph es la MISMA de la leyenda de tipos: el glifo
      // se ve igual que allí.
      const t = DAMAGE_TYPES[c.dmgType];
      const typeBadge = t
        ? `<span class="card-dmg-glyph leg-glyph" style="color:${attr(t.color)}"`
          + ` title="${attr(`Tipo de daño: ${t.name} — ${t.desc}`)}" aria-hidden="true">${t.glyph}</span>`
        : '';
      // La descripción de las cartas de daño tiene DOS partes (qué hace y
      // la SINONERGIA con cada familia): la segunda va en su propia línea,
      // con la tipografía de dato de la leyenda.
      const [desc, ...resto] = String(c.desc ?? '').split('\n');
      const synergy = resto.join('\n');
      return `
        <button class="card-choice-card rarity-${r.cls}" data-card-id="${c.id}" style="--deal-delay:${i * 120}ms">
          <span class="card-inner">
            <span class="card-lv-badge${isUnlock ? ' is-new' : ''}">${isUnlock ? 'NUEVO' : '+1'}</span>
            <span class="card-title-row">
              <span class="card-name">${esc(c.name)}</span>
              ${typeBadge}
            </span>
            <i class="card-gems" title="${r.label}">${rarityGems(r.tier)}</i>
            <span class="card-rarity-label">${r.label}</span>
            <span class="card-desc">${esc(desc)}</span>
            ${synergy ? `<span class="card-synergy">${esc(synergy)}</span>` : ''}
          </span>
        </button>`;
    }).join('');
    this.cardModal.innerHTML = `
      <h2 class="card-title">Mejora de Nivel</h2>
      ${headRow}
      <div class="own-row">${towerRow}${comboBtn}</div>
      <div class="cards-row">${cards}</div>
      <p class="hint">${hint}</p>`;
    this.cardModal.querySelector('[data-action-combo]')
      ?.addEventListener('click', () => this.engine.emit('ui:combo_list'));
    this.cardModal.classList.remove('hidden');
    this._modalKind = 'cards';
    // T7 — el rótulo accesible dice la cantidad REAL de cartas de la
    // oferta (puede ser 1, no siempre 3) y el modal TOMA el foco (si no,
    // el focus trap y el Esc no engages y el HUD queda tabulable detrás).
    const n = offer.length;
    this._setModalLabel(`Mejora de nivel — elegí 1 de ${n} ${n === 1 ? 'mejora' : 'mejoras'}`);
    const firstCard = this.cardModal.querySelector('[data-card-id]');
    if (firstCard && typeof firstCard.focus === 'function') {
      try { firstCard.focus(); } catch (_err) { /* sin foco */ }
    }
    // SFX de revelado (D7); el flip lo hace CSS con --deal-delay
    try { this.audio.sfx('card'); } catch (_err) { /* sin ctx aún */ }
  }

  /**
   * Cierra los modales: el de cartas/perk (#card-choice) y el panel combo
   * (#combo-panel). IDEMPOTENTE y null-safe: llamarlo con ningún modal
   * abierto no rompe nada (main.js lo llama en cada cambio de estado, así
   * que NINGÚN modal sobrevive a una transición de la FSM).
   */
  hideCardChoice() {
    // El combo tiene su propio nodo: se cierra acá también (si no
    // quedaría flotando sobre la pantalla siguiente).
    this.hideComboPanel();
    if (this.cardModal) {
      this.cardModal.classList.add('hidden');
      this.cardModal.innerHTML = '';
    }
    this._modalKind = null;
    // T4 — el modal se cerró: la próxima oferta es una decisión NUEVA, así
    // que el guard anti-doble-toque se reinicia.
    this._cardSession += 1;
    this._cardOfferId = null;
    this._cardPickedIds = [];
    this._lastCardPickAt = null;
    this._restoreFocus();
  }

  // ---------- Panel COMBO LIST (BUG-005, 🃏/U — §1.5/§4.4) ----------

  /** Panel con torres poseídas + niveles + modificadores activos. */
  showComboPanel(sum) {
    this._ensureComboPanel(); // nodo PROPIO (#combo-panel)
    if (!this.comboPanel) return;
    // El rótulo del slot es S + (slotIndex + 1): con los 5 slots de la
    // fase 61 los índices van de S1 a S5 (antes había 9 y llegaba a S9).
    const rows = sum.towers.map((t) => `
      <div class="combo-row">
        <b>${esc(t.name)}</b>
        <span class="combo-slot">S${t.slot + 1}</span>
        ${t.level > 1 ? `<i>${'★'.repeat(t.level)}${'☆'.repeat(Math.max(0, 5 - t.level))}</i>` : ''}
        ${typeBadgeHtml(t.dmgType)}
        <small>DMG ×${t.dmgMul}${t.cadMul !== 1 ? ` · REC ×${t.cadMul.toFixed(2)}` : ''}</small>
      </div>`).join('');
    const mods = [
      ...(sum.tags ?? []).map((tag) => `<span>#${esc(tag)}</span>`),
      sum.pierce > 0 ? `<span>Perforación +${sum.pierce}</span>` : '',
      sum.baseShields > 0 ? `<span>Escudo de Base ×${sum.baseShields}</span>` : '',
      sum.orbitalDmgMul !== 1 ? `<span>Orbital ×${sum.orbitalDmgMul.toFixed(2)}</span>` : '',
    ].filter(Boolean).join('');
    // Arsenal §2.3: drones activos + medidor de Black Hole (v4 4b/5)
    const dronesRow = (sum.drones ?? []).map((d) => `
      <div class="combo-row"><b>${d.name}</b><span class="combo-slot">DRON</span>${typeBadgeHtml(d.dmgType)}</div>`).join('');
    const bhPct = Math.round((sum.blackHoleCharge ?? 0) * 100);
    const bhRow = bhPct > 0
      ? `<div class="combo-row"><b>Black Hole</b><span class="combo-slot">${bhPct >= 100 ? 'LISTO' : `${bhPct}%`}</span></div>`
      : '';
    this.comboPanel.innerHTML = `
      <h2 class="card-title">COMBO LIST</h2>
      <div class="combo-panel">
        ${rows || '<p class="hint">Sin torres… ¿estás jugando?</p>'}
        ${dronesRow}${bhRow}
        <div class="combo-mods">${mods || '<p class="hint">Sin modificadores activos</p>'}</div>
        <p class="hint">Nv.${sum.lv} · ${sum.kills} bajas · [🃏] o [U] para cerrar</p>
      </div>
      <button class="btn ghost" data-combo-close>CERRAR</button>`;
    this.comboPanel.querySelector('[data-combo-close]')
      ?.addEventListener('click', () => this.hideComboPanel());
    // Foco: se recuerda el elemento que lo tenía (p.ej. el botón "Lista de
    // Combos") y el foco entra al panel (overlay modal).
    this._captureComboFocus();
    this.comboPanel.classList.remove('hidden');
    const closeBtn = this.comboPanel.querySelector('[data-combo-close]');
    if (closeBtn && typeof closeBtn.focus === 'function') {
      try { closeBtn.focus(); } catch (_err) { /* sin foco */ }
    }
  }

  /**
   * Cierra SOLO el panel combo (#combo-panel). NO toca el modal de cartas:
   * la oferta de cartas sobrevive intacta (elegir una carta sigue siendo
   * posible) — ese era el soft-lock.
   */
  hideComboPanel() {
    if (this.comboPanel) {
      this.comboPanel.classList.add('hidden');
      this.comboPanel.innerHTML = '';
    }
    this._restoreComboFocus();
  }

  /** ¿Está abierto el panel COMBO? (para el toggle con U) */
  comboOpen() {
    return !!this.comboPanel
      && !this.comboPanel.classList.contains('hidden');
  }

  /**
   * ¿Hay ALGÚN modal abierto sobre la pantalla? Cubre el modal de cartas y
   * el de perk (#card-choice) y el panel combo (#combo-panel).
   *
   * El modal de PERK cierra con [data-perk-close], por eso la detección
   * anterior (solo combo) daba false con el perk abierto: el modal
   * sobrevivía al cambio de estado y tapaba el menú entero. main.js usa
   * esto para decidir si cerrar el modal.
   */
  anyModalOpen() {
    // El panel combo tiene su propio nodo (#combo-panel).
    if (this.comboPanel && !this.comboPanel.classList.contains('hidden')) return true;
    if (!this.cardModal) return false;
    if (this.cardModal.classList.contains('hidden')) return false;
    // El modal de PERK cierra con [data-perk-close].
    if (this.cardModal.querySelector('[data-perk-close]')) return true;
    // El modal de CARTAS no tiene botón de cierre (elegir es obligatorio),
    // pero igual ocupa la pantalla: también cuenta como modal abierto.
    return !!this.cardModal.querySelector('[data-card-id]');
  }

  // ---------- Aviso de JEFE (T9: banner WARNING de 2 s) ----------

  /**
   * Crea el nodo del aviso de JEFE bajo #marco-portrait si no existe.
   */
  // ---------- LA CAPA DE AVISOS (fase 52) ----------

  /**
   * dev-7 fase 52 — Crea el nodo de la pila de avisos bajo
   * #marco-portrait (una sola vez).
   *
   * Antes cada tipo de aviso hacia lo suyo (el banner del jefe, el del
   * cambio de fase, el toast del meta) y cada uno con su nodo, su estilo
   * y su animacion. Ahora todos pasan por el MISMO componente: una pila
   * de banners en la parte de arriba del campo (nunca en el centro,
   * que es por donde caen los enemigos).
   */
  /** fase 75: limpia la pila de avisos y sus timers. */
  clearAvisos() {
    const pila = this.el?.avisos;
    if (!pila) return;
    for (const el of [...(pila.children ?? [])]) {
      clearTimeout(el._avisoTimer);
      clearTimeout(el._avisoOutTimer);
      el.remove?.();
    }
    pila.replaceChildren?.();
  }

  _ensureAvisosNode() {
    if (this.el.avisos) return this.el.avisos;
    const host = this.root?.parentElement; // #marco-portrait
    if (!host || typeof host.appendChild !== 'function') return null;
    const div = document.createElement('div');
    div.id = 'avisos';
    div.setAttribute('role', 'status');
    div.setAttribute('aria-live', 'polite');
    host.appendChild(div);
    this.el.avisos = div;
    return div;
  }

  /**
   * dev-7 fase 52 — Muestra un aviso en la pila (un banner que se
   * va solo). Es el unico camino de los avisos de la partida.
   *
   * @param {object} o {variant, title, name, rule, icon, ms, sound}
   *   variant: 'jefe' | 'fase' | 'info' (el color de la placa)
   *   title: el rótulo ("¡JEFE EN CAMINO!", "EL JEFE CAMBIA")
   *   name: la línea grande (el nombre del jefe o de la fase)
   *   rule: la línea de la regla (opcional)
   *   icon: ruta del sprite del icono (opcional)
   *   ms: duración en pantalla
   *   sound: id de sonido a reproducir
   */
  /**
   * dev-7 fase 52 \u2014 AVISO de "el ultimate est\u00e1 listo".
   *
   * El sonido 'ult_ready' ya lo pon\u00eda player.js; lo que faltaba era
   * el AVISO visible (el medidor se llena en un instante y el bot\u00f3n
   * solo pulsa: sin un aviso el jugador se pierde la ventana).
   *
   * @param {string} qu\u00e9 'ultimate' | 'blackhole'
   */
  showUltimateReady(qu\u00e9 = 'ultimate') {
    const esBH = qu\u00e9 === 'blackhole';
    // En un tel\u00f3fono no hay teclado: el aviso dice "toc\u00e1" en vez
    // de "[Espacio]" (el hint de teclado se oculta con puntero grueso).
    const tactil = (() => {
      try {
        return typeof window !== 'undefined'
          && typeof window.matchMedia === 'function'
          && window.matchMedia('(pointer: coarse)').matches;
      } catch (_err) { return false; }
    })();
    const accion = tactil
      ? (esBH ? 'TOC\u00c1 EL BOT\u00d3N NEGRO' : 'TOC\u00c1 EL BOT\u00d3N DE LA BARRA')
      : (esBH ? 'PULSA [B]' : 'PULSA [ESPACIO]');
    return this.showAviso({
      variant: 'info',
      title: esBH ? '\u00a1BLACK HOLE LISTO!' : '\u00a1ULTIMATE LISTO!',
      name: accion,
      ms: 1800,
    });
  }

  showAviso(o = {}) {
    const pila = this._ensureAvisosNode();
    if (!pila) return null;
    const variant = o.variant ?? 'info';
    const el = document.createElement('div');
    el.className = `aviso aviso--${variant}`;
    el.innerHTML = `
      ${o.title ? `<span class="aviso-head">
        ${o.icon ? `<img class="aviso-icon" src="${attr(o.icon)}" alt="">` : ''}
        <span class="aviso-title">${esc(o.title)}</span>
      </span>` : ''}
      ${o.name ? `<span class="aviso-name">${esc(o.name)}</span>` : ''}
      ${o.rule ? `<span class="aviso-rule">${esc(o.rule)}</span>` : ''}
    `;
    pila.appendChild(el);
    // Un aviso nuevo desplaza al anterior (la pila se vacía sola).
    const ms = o.ms ?? 2200;
    el._avisoTimer = setTimeout(() => {
      el.classList.add('aviso-out');
      el._avisoOutTimer = setTimeout(() => el.remove(), 300);
    }, ms);
    if (o.sound) { try { this.audio.sfx(o.sound); } catch (_err) { /* sin ctx aún */ } }
    return el;
  }

  /**
   * Muestra el aviso de JEFE: banner "¡JEFE EN CAMINO!" durante ~2 s con
   * la sombra creciendo (docs/DESIGN.md §4.4 lo prometía, pero en el DOM solo
   * existían el shake y el sonido).
   *
   * @param {string} [name] nombre del jefe (opcional)
   */
  showBossWarning(name = '') {
    // dev-7 fase 52: pasa a la CAPA DE AVISOS (la pila comun).
    const who = String(name ?? '').trim();
    this.el.bossWarning = this.showAviso({
      variant: 'jefe',
      title: '¡JEFE EN CAMINO!',
      name: who,
      icon: 'assets/sprites/ui_tinted/icon_boss_warning_red.png',
      ms: BOSS_WARNING_MS,
    });
  }

  /**
   * oleadas-dinámicas — El banner CORTO del arquetipo que ENTRA (design
   * §Decisión 8).
   *
   * Mismo lenguaje visual que el aviso de jefe (la pila común de avisos y
   * su placa), pero SOBRIO: variante `info`, sin icono, sin sonido y
   * ~1,4 s. Hay una descarga cada pocos segundos y el aviso no puede
   * tapar el campo. El texto sale de `archetypeBannerText` (pura) y el
   * FILTRO de ruido de `shouldAnnounceArchetype` (pura): un arquetipo
   * desconocido —o uno de los que se leen solos— no pinta NADA.
   *
   * @param {string|null} archetype id del arquetipo (waves.js)
   * @returns {Element|null} el aviso, o null si no se anuncia
   */
  showArchetypeBanner(archetype) {
    if (!shouldAnnounceArchetype(archetype)) return null;
    const text = archetypeBannerText(archetype);
    if (!text) return null;
    return this.showAviso({ variant: 'info', title: text, ms: ARCHETYPE_BANNER_MS });
  }

  /** Oculta el aviso de JEFE (lo llama el timeout o un cambio de estado). */
  hideBossWarning() {
    const el = this.el.bossWarning;
    if (!el) return;
    // dev-7 fase 52: el aviso vive en la pila común, así que se
    // quita del DOM (con su animación de salida).
    clearTimeout(el._avisoTimer);
    clearTimeout(el._avisoOutTimer);
    el.classList.add('aviso-out');
    setTimeout(() => el.remove(), 300);
    this.el.bossWarning = null;
  }

  // ---------- Aviso de CAMBIO DE FASE del jefe (fase 47) ----------

  /**
   * dev-7 fase 47: el aviso de que el jefe ha cambiado de fase.
   *
   * El evento `boss:phase2` ya lo emitía el enemigo, pero **nadie lo
   * escuchaba**: el jugador veía al jefe acelerar y soltar esbirros sin
   * aviso, así que las reglas nuevas (a qué tipo de daño le pega más, o
   * que se está regenerando) llegaban sin explicar. Ahora el HUD anuncia
   * la fase y, con ella, la regla.
   *
   * @param {object|null} phase la fase nueva (enemigos.js: phases[])
   */
  showBossPhase(phase) {
    if (!phase || !phase.name) return;
    // La regla de la fase, en palabras del juego.
    let regla = '';
    if (phase.weakTo) {
      const t = DAMAGE_TYPES[phase.weakTo];
      regla = `AHORA ES VULNERABLE A ${esc((t?.name ?? phase.weakTo).toUpperCase())} \u00d71,5`;
    } else if (phase.resist) {
      const t = DAMAGE_TYPES[phase.resist];
      regla = `AHORA RESISTE EL DA\u00d1O ${esc((t?.name ?? phase.resist).toUpperCase())} \u00d70,5`;
    }
    if (phase.regen) {
      regla += regla ? ' \u00b7 SE REGENERA CON SU ESCOLTA' : 'SE REGENERA CON SU ESCOLTA';
    }
    // dev-7 fase 52: pasa a la CAPA DE AVISOS (la pila comun).
    this.showAviso({
      variant: 'fase',
      title: 'EL JEFE CAMBIA',
      name: phase.name,
      rule: regla,
      ms: BOSS_PHASE_MS,
      sound: 'warning',
    });
  }

  // ---------- Barra de jefe (D11: banner BOSS + HP roja + ×N) ----------

  /** Crea el nodo bajo #marco-portrait si no existe. */
  _ensureBossNode() {
    if (this.el.boss) return;
    const host = this.root?.parentElement; // #marco-portrait
    if (!host) return;
    const div = document.createElement('div');
    div.id = 'boss-bar';
    div.classList.add('hidden');
    div.innerHTML = buildBossBarHtml();
    host.appendChild(div);
    this.el.boss = div;
    this.el.bossFill = div.querySelector('.boss-hp-fill');
    this.el.bossMult = div.querySelector('.boss-mult');
    // dev-7 fase 46: el <b data-boss-name> de la etiqueta .boss-tag es
    // donde se escribe el NOMBRE del jefe (propio de cada stage).
    this.el.bossName = div.querySelector('[data-boss-name]');
    // dev-7 fase 43: la etiqueta de RECOMPENSA acompaña al "×2": a secas
    // el jugador lo leía como multiplicador de DAÑO. El CSS decide si hay
    // sitio para el texto (en un marco angosto lo oculta).
    this._lastBossPct = -1;
    this._lastBossName = '';
    this._bossHidden = true; // evita re-escribir la clase cada frame
  }

  /**
   * snapshot del jefe activo o null:
   * {name, hpFrac(0..1), rewardMul(≥10)} — lo llama main.update().
   */
  renderBossBar(bossInfo) {
    if (!bossInfo || !(bossInfo.hpFrac > 0)) { this.hideBossBar(); return; }
    this._ensureBossNode();
    if (!this.el.boss) return;
    const frac = Math.max(0, Math.min(1, bossInfo.hpFrac));
    const pct = Math.round(frac * 100);
    if (pct !== this._lastBossPct) {
      this._lastBossPct = pct;
      if (this.el.bossFill) {
        this.el.bossFill.style.width = `${pct}%`;
        this.el.bossFill.parentElement?.setAttribute('aria-valuenow', String(pct));
      }
    }
    // dev-7 fase 46: la etiqueta .boss-tag ya no dice "BOSS" fijo: dice el
    // NOMBRE del jefe (waves.js: uno propio por stage de jefe).
    const label = String(bossInfo.name ?? '').trim() || 'JEFE';
    if (label !== this._lastBossName) {
      this._lastBossName = label;
      if (this.el.bossName) this.el.bossName.textContent = label;
      if (this.el.bossMult) {
        this.el.bossMult.textContent = `×${bossInfo.rewardMul ?? 10}`;
        // dev-7 fase 37: el "×2" no decía QUÉ era. Es el factor de
        // RECOMPENSA (la primera vez que se limpia un stage vale el doble),
        // no de daño: sin etiqueta el jugador lo lee como multiplicador de
        // daño. Se rotula con un title y un aria-label.
        this.el.bossMult.title = 'Recompensa: la PRIMERA vez que limpiás este stage vale el doble';
        this.el.bossMult.setAttribute('aria-label',
          `Recompensa ×${bossInfo.rewardMul ?? 10}: la primera vez que limpiás este stage vale el doble`);
      }
    }
    if (this._bossHidden) {
      this._bossHidden = false;
      this.el.boss.classList.remove('hidden');
    }
  }

  hideBossBar() {
    this._lastBossPct = -1;
    if (!this.el.boss) return;
    if (this._bossHidden) return;
    this._bossHidden = true;
    this.el.boss.classList.add('hidden');
  }

  // ---------- HUD por frame ----------
  /**
   * Invalida el cache de render: fuerza a que el próximo frame reescriba
   * todos los valores del HUD (se usa al volver a mostrarlo).
   */
  _invalidateRenderCache() {
    this._lastStageName = null;
    this._lastProgressPct = null;
    this._lastLvText = null;
    this._lastXpPct = null;
    this._lastMultText = null;
    this._lastMultHidden = null;
    this._lastSpeedLabel = null;
    this._lastUltDeg = null;
    this._lastUltReady = null;
    this._lastBhHidden = null;
    this._lastBhDeg = null;
    this._lastBhReady = null;
    this._lastBhLabel = null;
    // T8 — la tira de estado de batalla también se refresca al volver.
    // dev-7 fase 43: solo quedan ENEMIGOS y DPS.
    this._lastStatEnemies = null;
    this._lastStatDps = null;
    // Sin esto, al volver a jugar saltaría un "level up" falso.
    this._lastLv = null;
  }

  /**
   * snapshot: {stageName, progress(0..1), lv, xpFrac(0..1), timer(s),
   * score, mult(1|1.5|2|3), speed, ultCharge(0..1), ultReady,
   * boss:{name, hpFrac, rewardMul}|null}
   * Valores REALES desde main.js (dev-4/dev-5).
   *
   * T8 — la tira de estado de batalla lee 2 claves más del payload:
   * enemiesAlive y dps (sin ellas los read-outs muestran "—").
   * dev-7 fase 43: seQuitaron OLAS (duplicaba la barra de progreso del
   * stage) y RACHA (duplicaba el badge ×N del score).
   *
   * BUG 5: solo se escribe en el DOM lo que CAMBIÓ (cache por valor, como
   * el score y el timer) y con el HUD oculto no se escribe nada. Durante
   * PLAYING las barras/anillos siguen actualizándose en vivo.
   */
  render(s) {
    // HUD oculto (menú / torretas / pausa): no tocar el DOM.
    if (!this._hudVisible) {
      this.renderBossBar(null);
      return;
    }
    if (this.el.stageName && s.stageName !== undefined && s.stageName !== this._lastStageName) {
      this._lastStageName = s.stageName;
      this.el.stageName.textContent = this._stageNameText(s.stageName);
    }
    if (this.el.progress) {
      const pct = Math.round((s.progress ?? 0) * 100);
      if (pct !== this._lastProgressPct) {
        this._lastProgressPct = pct;
        this.el.progress.style.width = `${pct}%`;
        this.el.progress.parentElement?.setAttribute('aria-valuenow', String(pct));
      }
    }
    if (this.el.lv) {
      const lv = s.lv ?? 1;
      const wentUp = this._lastLv != null && lv > this._lastLv;
      this._lastLv = lv;
      // dev-7 fase 64: al tope de la run `xpFrac` vale 1 y la barra queda
      // llena — se leía como "a un pelo del nivel que viene", que ya no
      // existe. El rótulo lo DICE (ver `levelLabelText`); la barra se deja
      // llena a propósito. fase 71: el tope lo manda main (21 o 31).
      const txt = levelLabelText({ lv, maxLevel: s.maxLevel });
      if (txt !== this._lastLvText) {
        this._lastLvText = txt;
        this.el.lv.textContent = txt;
      }
      if (wentUp) {   // D14/D7: el label y la barra XP "chispean" al subir
        this.el.lv.classList.remove('lv-pop');
        void this.el.lv.offsetWidth;
        this.el.lv.classList.add('lv-pop');
        if (this.el.xp) {
          this.el.xp.classList.remove('xp-flash');
          void this.el.xp.offsetWidth;
          this.el.xp.classList.add('xp-flash');
        }
      }
    }
    if (this.el.xp) {
      const pct = Math.round((s.xpFrac ?? 0) * 100);
      if (pct !== this._lastXpPct) {
        this._lastXpPct = pct;
        this.el.xp.style.width = `${pct}%`;
        this.el.xp.parentElement?.setAttribute('aria-valuenow', String(pct));
      }
    }

    // Timer MM:SS cuenta hacia arriba (§6 decisión 7)
    // dev-7 fase 41: el reloj es un SVG inline en index.html (antes era el
    // emoji ⏱, que cada plataforma dibujaba distinto). Acá va solo el
    // número.
    if (this.el.timer) {
      const t = Math.max(0, Math.floor(s.timer ?? 0));
      if (t !== this._timerSecs) {
        this._timerSecs = t;
        this.el.timer.textContent = fmtTime(t);
      }
    }

    // Score: solo toco DOM cuando cambia (6 veces/seg no hace falta)
    if (this.el.score) {
      const shown = Math.floor(s.score ?? 0);
      if (shown !== this._lastScoreShown) {
        this._lastScoreShown = shown;
        this.el.score.textContent = fmt(shown);
      }
    }

    // Badge multiplicador de racha (D3): pop al subir, oculto en ×1
    if (this.el.mult) {
      const m = s.mult ?? 1;
      const changed = this._lastMult !== undefined && this._lastMult !== m;
      this._lastMult = m;
      if (m > 1) {
        const txt = `×${m}`;
        if (txt !== this._lastMultText) {
          this._lastMultText = txt;
          this.el.mult.textContent = txt;
        }
        if (this._lastMultHidden !== false) {
          this._lastMultHidden = false;
          this.el.mult.classList.remove('hidden');
        }
        if (changed) {
          this.el.mult.classList.remove('pop');
          void this.el.mult.offsetWidth; // reinicia la animación
          this.el.mult.classList.add('pop');
        }
      } else if (this._lastMultHidden !== true) {
        this._lastMultHidden = true;
        this.el.mult.classList.add('hidden');
      }
    }

    // Botón velocidad: refleja el timeScale actual (D13)
    if (this.el.speed) {
      const label = { 1: 'x1', 1.5: 'x1.5', 2: 'x2' }[s.speed ?? 1] ?? 'x1';
      if (label !== this._lastSpeedLabel) {
        this._lastSpeedLabel = label;
        this.el.speed.textContent = label;
      }
    }

    // Ultimate: anillo de carga cónico + pulso al 100% (D9, carga real)
    if (this.el.ultRing) {
      const deg = Math.round((s.ultCharge ?? 0) * 360);
      if (deg !== this._lastUltDeg) {
        this._lastUltDeg = deg;
        this.el.ultRing.style.background =
          `conic-gradient(var(--crit-gold) ${deg}deg, rgb(var(--crit-gold-rgb) / .15) ${deg}deg)`;
      }
    }
    if (this.el.ult) {
      const ready = !!s.ultReady;
      if (ready !== this._lastUltReady) {
        this._lastUltReady = ready;
        this.el.ult.classList.toggle('ready', ready);
      }
    }

    // Botón Black Hole (v4 4b/5): medidor 0..1 por kills como el ultimate —
    // anillo de carga violeta + % / LISTO. dev-7 fase 12: el botón entero
    // queda oculto hasta desbloquear la carta 'black_hole' (antes decía
    // "Siempre visible, carga por kills" — ya no carga nada sin
    // desbloquear, ver player.js chargeBlackHole()).
    if (this.el.bh) {
      const unlocked = !!s.bhUnlocked;
      if (unlocked !== this._lastBhHidden) {
        this._lastBhHidden = unlocked;
        this.el.bh.classList.toggle('hidden', !unlocked);
      }
      const charge = s.bhCharge ?? 0;
      if (this.el.bhRing) {
        const deg = Math.round(charge * 360);
        if (deg !== this._lastBhDeg) {
          this._lastBhDeg = deg;
          this.el.bhRing.style.background =
            `conic-gradient(#B48CFF ${deg}deg, rgba(180,140,255,.15) ${deg}deg)`;
        }
      }
      const bhReady = !!s.bhReady;
      if (bhReady !== this._lastBhReady) {
        this._lastBhReady = bhReady;
        this.el.bh.classList.toggle('ready', bhReady);
      }
      const label = this.el.bhCount;
      if (label) {
        const txt = charge >= 1 ? 'LISTO' : `${Math.round(charge * 100)}%`;
        if (txt !== this._lastBhLabel) {
          this._lastBhLabel = txt;
          label.textContent = txt;
        }
      }
    }

    // Barra de jefe viva mientras pelea (D11)
    this.renderBossBar(s.boss ?? null);

    // T8 — estado de batalla (enemigos / DPS).
    this._renderStatus(s);
  }
}
