// ============================================================
// main.js — clase Game (shooter v2, dev-4)
// Arranque, FSM de alto nivel y wiring. Economía REAL desde
// dev-4 (§2.6/§2.7/§2.8): score con multiplicador de racha,
// floats por kill, bonus de velocidad y de stage clear, XP/nivel
// con feedback, escudo (HP de la base) con game over y ultimate
// ORBITAL STRIKE. Stages/jefes completos en dev-5, cartas y
// pulido fino en las cards siguientes.
// ============================================================

import { Engine, CONFIG, SCENE } from './engine.js';
import { HUD, fortressDps, findStageHighlights } from './hud.js';
import { Fortress, ULT_BOSS_CHARGES, BLACK_HOLE_BOSS_CHARGES } from './player.js';
import { TOWERS, GUARDIAN_SLOT } from './towers.js';
import { collideProjectiles } from './enemies.js';
import { WaveManager, waveGroups } from './waves.js';
import {
  xpForLevel, multForStreak, baseScoreForEnemy, speedMult, stageClearBonus,
  xpForKill, applyXp, overflowScore, MAX_LEVEL_PER_STAGE, scoreWithCarry,
} from './score.js';
import { STAGES } from './stages.js';
import {
  stageDef, isEndless, endlessOpen, bestDepth, nextEndlessStage, isMilestone,
  endlessRewardMul, dailyRun,
} from './endless.js';
import { rollOffer, applyCard, comboSummary } from './cards.js';
import {
  MultiKillWatcher, spawnGoldenFireworks, dropEnergyOrb, starburst,
  spawnSpriteBossExplosion,
} from './effects.js';
import {
  loadProgress, saveProgress, recordVictory, recordDaily, isUnlocked,
  recordHeatRun, claimHeatMilestone, recordSurvival,
} from './progress.js';
import { loadQuality, applyQualityToContext, applyQualityToDom, particleCapFor } from './quality.js';
import {
  loadMeta, saveMeta, rewardVictory, rewardGold, rewardFrags,
  META_GOLD_PER_CLEAR, META_GOLD_PER_VICTORY,
  META_FRAG_PER_VICTORY, META_FIRST_CLEAR_MULT, META_TOWERS,
  metaDmgMul,
} from './meta.js';
// fase 69 — EL PROTOCOLO DE ASEDIO: reglas puras (heat.js) + persistencia
// de récords e hitos (progress.js).
import {
  HEAT_CONDS, HEAT_PRESETS, HEAT_MILESTONES, heatMods, heatTotal,
  heatRewardMul, heatMilestoneBonus, normalizeHeatMods, presetMods, presetFor,
} from './heat.js';
// fase 70 — LA SUPERVIVENCIA: reglas puras del modo (survival.js). La cola de
// olas es INFINITA y se pide por bloques al WaveManager (extend), así que este
// módulo sólo aporta el director y las cuentas, no el estado de la run.
import {
  SURVIVAL, survivalStage, survivalScale, survivalWaveChunk, survivalTheme,
  xpStageForRun,
  survivalBossKind, survivalBossName, survivalReward,
} from './survival.js';
import { NATIVE_EVENTS, backAction } from './native.js';

export class Game {
  /**
   * @param {Engine} engine
   * @param {HUD} hud
   */
  constructor(engine, hud) {
    this.engine = engine;
    this.hud = hud;
    this.audio = hud.audio; // una sola instancia de AudioManager para todo el juego

    // Estado de run (§2.6/§2.7/§2.8)
    this.stageId = null;
    this.stageName = 'Normal Stage 1';
    this.progress = 0;   // 0..1 — progreso de olas (WaveManager dev-3)
    this.lv = 1;
    this.xp = 0;
    this.xpFrac = 0;     // fracción de barra XP (§2.7)
    this.timer = 0;      // cronómetro del stage (§6 decisión 7)
    this.score = 0;
    this._spawnScoreCarry = 0; // fracción de score de crías de mecánicas
    this.streak = 0;     // kills consecutivos sin que la base reciba daño
    this.mult = 1;       // multiplicador de racha (D3)
    this.kills = 0;
    this._leaks = 0;
    this.waveManager = null; // se crea en startStage()
    this._ended = false;     // evita carreras STAGE_CLEAR ↔ GAME_OVER

    // CARD_CHOICE (v3-1/7, BUG-001): oferta pendiente de LEVEL UP.
    // El estado CARD_CHOICE congela el mundo (timeScale 0, §1.2) y el
    // modal DOM vive en hud.js (§4.4).
    this.pendingOffer = null;

    /** Resumen de fin de run para las pantallas HUD (§2.10). */
    this.summary = null;

    // Progreso persistente (dev-5, §2.9): desbloqueo + mejor score.
    this.progressData = loadProgress();

    // dev-7 fase 28: velocidad preferida por el jugador (x1/x1.5/x2) —
    // se conserva entre stages (antes cada stage arrancaba a x1).
    this._preferredSpeed = 1;
    // ¿El panel 🃏 congeló el mundo? (fase 28)
    this._comboPaused = false;
    // fase 72: acumulador del feedback de robo de vida (evita un float por
    // cada impacto; se muestra como mucho uno cada 0,4 s).
    this._healAcc = 0;
    this._lastHealFloatAt = -Infinity;
    // fase 70: MODO de la run ('campaign' | 'survival'). Lo fijan startStage
    // y startSurvival; las ramas que difieren (récords, fugas, XP, derrota,
    // reintento) lo consultan sin null-checks.
    this.mode = 'campaign';
    // fase 70: semilla de la run de supervivencia (la reusa `retry`).
    this.survivalSeed = 0;
    // fase 67: CÓMO se lanzó la run (semilla y, si es el desafío diario,
    // su fecha). El reintento tiene que reusar la semilla del día o el
    // récord sería trampeable (rerolear hasta una composición cómoda).
    this._runOpts = null;
    // fase 69: los diales del Protocolo de la run activa. SIEMPRE existe
    // (heat 0 neutral): el HUD lee `game.runMods.heat` para el badge y los
    // tests/balance-sim lo consultan sin null-checks. startStage lo reemplaza.
    this.runMods = heatMods({});

    // Meta-game v3.5 (§task t_1c22add3): mejoras permanentes de torretas.
    // localStorage['gdf_meta'] — los multiplicadores de daño los lee
    // towers.js vía metaDmgMul (caché refrescada por saveMeta).
    this.meta = loadMeta();

    // Fortress (dev-2/dev-4): la base con sus torres. §6 decisión 3: el
    // desbloqueo es SOLO por cartas (cards.js v3-1/7); startStage() coloca
    // Guardian en S3 vía _ensureTestTowers().
    this.fortress = new Fortress(this);

    // Suscripciones (nombres de eventos canónicos)
    // fase 75: el relayout mueve la plataforma (CONFIG.TOWER_Y) pero la
    // Fortress y sus torres guardaban la Y vieja. Recolocarlas al cambiar
    // el alto lógico evita que queden flotando tras un resize/rotación.
    engine.on('layout:changed', () => this.fortress?.relayout?.());
    engine.on('state:changed', ({ next }) => {
      // Música por FSM (v3 5/7, BUG-004): PLAYING la sube; PAUSED/
      // CARD_CHOICE la dejan en ducking (queda "lejos", no muere);
      // menú/pantallas de fin la detienen.
      this._musicForState(next);
      // v3 3c/7: NOCHE ESTRELLADA como fondo general — menú principal,
      // selector de stages, transiciones y fin de partida. PLAYING
      // conserva el tema del stage (lo fija startStage). v3.5: la pantalla
      // meta TORRETAS también sobre la noche estrellada (semitransparencias).
      if (next === 'MENU' || next === 'SELECT_STAGE'
        || next === 'STAGE_CLEAR' || next === 'GAME_OVER'
        || next === 'TORRETAS' || next === 'PROTOCOLO'
        // fase 72: CRÉDITOS (y, de paso, RÉCORDS, que faltaba desde la
        // fase 70) también van sobre la noche estrellada. Sin esto la
        // pantalla hereda el tema del stage anterior.
        || next === 'RECORDS' || next === 'CREDITS') {
        this.engine.setTheme('night');
      }
      // Modal de cartas (§4.4): entra/sale con la FSM CARD_CHOICE
      if (next === 'CARD_CHOICE') {
        this.hud.showCardChoice(this.pendingOffer ?? []);
      } else {
        // NINGÚN modal sobrevive a un cambio de estado: el de cartas, el
        // de perk (TORRETAS) y el panel 🃏 reutilizan el MISMO nodo
        // #card-choice. Si queda abierto (p.ej. el de perk al salir al
        // menú) tapa el frame entero y bloquea todos los clicks.
        // hideCardChoice() es idempotente (no-op si el modal no existe).
        this.hud.hideCardChoice();
      }
      hud.showScreen(next, this._screenData(next));
      this._playing = next === 'PLAYING';
    });

    // Toggle música (botón ♪ HUD / tecla M): apaga o re-arranca el loop
    engine.on('ui:music_toggle', () => this._toggleMusic());

    // Juice del hit (D5) + reseteo de racha (§2.6: tocar la base la pierde)
    engine.on('base:damaged', ({ amount }) => {
      // dev-7 fase 28: el golpe a la base es el evento MÁS IMPORTANTE del
      // juego y era el ÚNICO evento crítico sin sonido (el jugador se
      // enteraba de perder HP por un número que se movía, no por un golpe).
      // Además el shake escala con la magnitud real del daño: con el tope
      // de leak (50 sobre 3000 de HP) un golpe del 1.7 % no debería mover
      // la pantalla.
      this.audio.sfx('baseHit');
      const maxHp = this.fortress?.maxHp ?? 3000;
      const frac = maxHp > 0 ? amount / maxHp : 0;
      engine.shake(1 + 4 * frac, 120 + 200 * frac);
      engine.floatText(CONFIG.BASE_X, SCENE.BASE_ARC_Y - 56, `-${amount}`, '#FF5555', 1 + 2 * frac);
      // Flash rojo radial breve sobre la base (dev-6, D5): el golpe se siente
      engine.addEffect({ life: 0.28, draw: (ctx, t) => {
        ctx.save();
        ctx.globalAlpha = t * 0.20;
        const g = ctx.createRadialGradient(CONFIG.BASE_X, SCENE.BASE_ARC_Y, 16,
          CONFIG.BASE_X, SCENE.BASE_ARC_Y, 320);
        g.addColorStop(0, 'rgba(255, 60, 60, 0.95)');
        g.addColorStop(1, 'rgba(255, 60, 60, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
        ctx.restore();
      } });
      if (this.streak > 0 || this.mult > 1) {
        this.streak = 0;
        this.mult = 1;
      }
    });

    // v3 3j/7 (BUG-R1): golpe ABSORBIDO por Escudo de Racha — float `~N` cian
    // con el daño REAL bloqueado (payload base:blocked ya trae blocked).
    engine.on('base:blocked', ({ blocked }) => {
      // dev-7 fase 28: el Escudo de Racha es un SALVAVIDAS: el jugador
      // tiene que OÍR que su escudo bloqueó el golpe, no ver un float
      // cian que se pierde entre el ruido.
      this.audio.sfx('baseBlocked');
      engine.floatText(CONFIG.BASE_X, SCENE.BASE_ARC_Y - 56, `~${blocked}`, '#3FD4FF');
    });

    // fase 72: robo de vida → un `+N` verde acumulado (throttle 0.4 s). El
    // jugador tiene que ver que la base se está curando, sobre todo ahora
    // que las tasas son bajas y las fugas duelen el HP máximo.
    engine.on('base:healed', ({ amount }) => {
      const n = Number(amount);
      if (Number.isFinite(n) && n > 0) this._healAcc += n;
    });

    engine.on('timescale:changed', () => {
      this._refreshSpeed();
      // dev-7 fase 28: la velocidad ELEGIDA por el jugador se recuerda
      // entre stages (antes cada stage arrancaba a x1).
      const r = this.engine.resumeSpeed;
      if (r > 0) this._preferredSpeed = r;
    });

    // v4 4c/5 — torre LÁSER: sfx de rayo al disparar (el FX lo emite al
    // spawn; el conteo de proyectiles de main.js NO lo cuenta).
    engine.on('laser:start', () => this.audio.sfx('laser'));
    // dev-7 fase 25: remate / explosión al matar (emitido por towers.js/enemies.js)
    engine.on('perk:proc', (e) => this.audio.sfx(e?.kind === 'execute' ? 'perkExecute' : 'perkBoom'));

    // dev-7 fase 28: cada torre tiene SU propio sonido de ataque. Antes
    // sonaba un 'shot' genérico como máximo 1 vez por frame (con 8 torres
    // disparando era un beep indistinguible) y 6 de las 8 torres + los 3
    // drones eran mudos: el jugador no podía OÍR qué estaba trabajando su
    // arsenal. Los eventos los emite towers.js (mismo patrón que el
    // 'laser:start' que ya existía).
    const towerSfx = {
      'missile:fire': 'missile', 'gauss:fire': 'gauss', 'beam:fire': 'beam',
      'bolt:fire': 'bolt', 'chain:fire': 'chain', 'mortar:fire': 'mortar',
      'drone:fire': 'drone',
    };
    for (const [evt, sfx] of Object.entries(towerSfx)) {
      engine.on(evt, () => this.audio.sfx(sfx));
    }

    // Enemigos (dev-3/dev-4): kills alimentan score/XP/racha/ultimate.
    engine.on('enemy:killed', (e) => this._onKill(e));
    // D6 (BUG-006): 3+ kills en 0.5 s → FIREWORKS dorados (effects.js).
    this._multiKill = new MultiKillWatcher(engine);
    // La llegada a la base ya aplicó su daño al escudo (Fortress.takeDamage
    // dentro de Enemy.update §2.1); acá solo contamos para la estadística
    // final. fase 72: NO hay contador/regla de fugas: la base es la única
    // condición de derrota y las crías del divisor, la escolta del jefe y
    // cualquier enemigo que llegue cuentan como fuga en el resumen.
    engine.on('enemy:reached', () => {
      this._leaks += 1;
    });

    // Escudo vacío → derrota (§2.1/§2.10)
    engine.on('base:destroyed', (payload) => {
      if (this._ended || !this._playing) return;
      this._ended = true;
      this.audio.sfx('gameover');
      // fase 70 — DERROTA en SUPERVIVENCIA: no hay etapa ni "lo que perdiste".
      // La métrica es la OLEADA alcanzada; se guarda el récord, se paga sólo
      // por las oleadas NUEVAS (×heat) y el resumen lleva `survival`.
      if (this.mode === 'survival') {
        const wave = this.waveManager?.survivalWave ?? 0;
        const prevBest = this.progressData.survival.bestWave;
        const isRecord = wave > prevBest;
        const heat = this.runMods?.heat ?? 0;
        const reward = survivalReward(wave, prevBest, heat);
        this.progressData = saveProgress(
          recordSurvival(this.progressData, { wave, score: this.score, heat }),
        );
        if (reward.frags > 0) this.meta = rewardFrags(this.meta, reward.frags, undefined);
        if (reward.gold > 0) this.meta = rewardGold(reward.gold, this.meta, undefined);
        // Sin `daily` en `_runOpts` esto es null, pero el día que exista un
        // diario de supervivencia el score ya queda registrado.
        this._recordDaily(false);
        this.summary = {
          type: 'GAME_OVER',
          stageId: SURVIVAL.baseStage,
          stageName: 'Supervivencia',
          score: this.score,
          kills: this.kills,
          time: this.timer,
          lv: this.lv,
          cards: this._cardsApplied ?? 0,
          leaks: this._leaks,
          hpLeft: 0,
          maxHp: this.fortress?.maxHp ?? 0,
          reason: payload?.reason ?? 'hp',
          survival: {
            wave,
            best: Math.max(prevBest, wave),
            isRecord,
            score: this.score,
            runs: this.progressData.survival.runs,
            rewardFrags: reward.frags,
            rewardGold: reward.gold,
            heat,
          },
          heat: heat > 0 ? {
            heat,
            best: this.progressData.heat.best,
            record: 0,
            isRecord: false,
            milestones: [],
            milestoneFrags: 0,
          } : null,
          daily: null,
        };
        this.engine.setState('GAME_OVER');
        return;
      }
      // dev-7 fase 28: el resumen de derrota dice QUÉ se perdió. Antes
      // sólo decía "terminaste con N puntos": el jugador no sabía qué
      // había hecho en la run ni lo que esa run le costó.
      const stageId = this.stageId ?? 1;
      const endless = isEndless(stageId);
      // fase 67: en el ∞ no hay "primera vez" (firstClear es de la campaña)
      // y lo que la run valía escala con la profundidad. Con la fórmula de
      // campaña el resumen de derrota sobrestimaba lo perdido (×2 + base).
      const primeraVez = !endless && !this.meta?.firstClear?.includes(stageId);
      const fragsPorTorreta = endless
        ? Math.round(META_FRAG_PER_VICTORY * endlessRewardMul(stageId))
        : META_FRAG_PER_VICTORY * (primeraVez ? META_FIRST_CLEAR_MULT : 1);
      const oroPotencial = endless
        ? Math.round(META_GOLD_PER_CLEAR * endlessRewardMul(stageId))
        : META_GOLD_PER_CLEAR;
      // fase 67: en el diario el score se registra gane o pierda (es una
      // caza de score); perder NO toca la profundidad del infinito.
      const daily = this._recordDaily(false);
      // fase 69: el Protocolo también aparece en la derrota. Perder NO
      // toca récords (`recordHeatRun` sólo corre en el clear): se muestran
      // el récord vigente del modo y el heat que se estaba jugando.
      const heat = this.runMods?.heat ?? 0;
      this.summary = {
        type: 'GAME_OVER',
        stageId,
        stageName: this.stageName,
        score: this.score,
        kills: this.kills,
        time: this.timer,
        // Lo que la run valía y no se llevó:
        lv: this.lv,
        cards: this._cardsApplied ?? 0,
        fragsLost: fragsPorTorreta * META_TOWERS.length,
        goldLost: oroPotencial,
        primeraVez,
        // fase 72: la base sólo cae por daño acumulado; ya no hay un
        // `reason` de regla de fugas. `leaks` queda como estadística.
        reason: 'hp',
        leaks: this._leaks,
        hpLeft: Math.max(0, this.fortress?.hp ?? 0),
        maxHp: this.fortress?.maxHp ?? 0,
        // fase 67: profundidad alcanzada (isRecord siempre false: perder no
        // mejora el récord) y resultado del desafío diario.
        endless: endless ? {
          depth: stageId,
          best: bestDepth(this.progressData),
          next: nextEndlessStage(this.progressData),
          isRecord: false,
          milestone: isMilestone(stageId),
        } : null,
        daily,
        heat: heat > 0 ? {
          heat,
          best: this.progressData.heat.best,
          record: endless
            ? (this.progressData.heat.endless[heat] ?? 0)
            : (this.progressData.heat.byStage[stageId] ?? 0),
          isRecord: false,
          milestones: [],
          milestoneFrags: 0,
        } : null,
      };
      this.engine.setState('GAME_OVER');
    });

    // Boss muerto → STAGE_CLEAR con bonus (§2.6). El evento lo emite el
    // callback de WaveManager registrado en startStage().
    engine.on('stage:cleared', () => {
      // fase 70: la Supervivencia NO cierra etapa nunca (el manager no emite
      // onWavesDone/onBossDead en modo survival). Guarda de seguridad: si algo
      // llegara a emitirlo, el resumen de campaña no debe pisar la run.
      if (this.mode === 'survival') return;
      if (this._ended || !this._playing) return;
      this._ended = true;
      const stageId = this.stageId ?? 1;
      // fase 67: el infinito es un loop que nunca "termina" la campaña —
      // el +150 de campaña completa se paga UNA vez (S50), no en cada ∞.
      const endless = isEndless(stageId);
      const clearBonus = stageClearBonus(stageId);
      this.score += clearBonus;
      this.audio.sfx('stageclear');
      // fase 67: la profundidad de ANTES de recordar, contra la que se
      // decide "¡NUEVO RÉCORD!" en el resumen.
      const prevBest = bestDepth(this.progressData);
      // fase 69: los récords de HEAT de ANTES de recordar (mismo criterio:
      // el resumen compara contra lo que había, no contra lo recién escrito).
      const heat = this.runMods?.heat ?? 0;
      const prevStageHeat = this.progressData.heat.byStage[stageId] ?? 0;
      const prevDepthHeat = this.progressData.heat.endless[heat] ?? 0;
      // Persistencia (§2.9): victoria → desbloquea N+1 + mejor score
      // (∞: sube la profundidad récord, no `unlocked`).
      this.progressData = saveProgress(
        recordVictory(this.progressData, stageId, this.score),
      );
      // fase 69: un clear con Protocolo escribe el récord del modo
      // (campaña: byStage[etapa]; ∞: mejor profundidad POR nivel de heat).
      this.progressData = saveProgress(recordHeatRun(this.progressData, {
        heat,
        stageId: endless ? null : stageId,
        endlessDepth: endless ? stageId : null,
      }));
      // v3.5 meta-game: la victoria entrega fragmentos a las torretas del meta
      // (×2 la primera vez por stage) y ORO al saldo meta (fase 16: +25 por
      // stage, +150 bonus si es el stage final = campaña completa). rewardVictory
      // guarda y refresca la caché de daño meta (metaDmgMul) y adjunta
      // lastGain/lastFirst para el resumen STAGE_CLEAR.
      const isFinal = !endless && stageId >= STAGES.length;
      // fase 67: oro y fragmentos escalan con la profundidad (el ×1,5 del
      // hito lo aplica endlessRewardMul; rewardVictory lo lleva por dentro).
      // fase 69: y con el heat (heatRewardMul = 1 + 0,08 × heat).
      const rewardMul = heatRewardMul(heat);
      const goldGain = Math.round(
        (META_GOLD_PER_CLEAR + (isFinal ? META_GOLD_PER_VICTORY : 0))
        * endlessRewardMul(stageId)
        * rewardMul,
      );
      // fase 69: HITOS de heat (5/10/20/35). Se cobran UNA sola vez por
      // cuenta y pagan un bonus de fragmentos por torreta. Van ANTES de
      // rewardVictory para que el `lastGain` que lee el resumen siga
      // siendo el desglose de la victoria.
      let milestoneFrags = 0;
      const nuevos = heat > 0
        ? HEAT_MILESTONES.filter(
          (t) => heat >= t && !this.progressData.heat.claimed.includes(t),
        )
        : [];
      if (nuevos.length > 0) {
        for (const t of nuevos) {
          const claim = claimHeatMilestone(this.progressData, t);
          this.progressData = claim.progress;
          if (claim.claimed) milestoneFrags += heatMilestoneBonus(t);
        }
        this.progressData = saveProgress(this.progressData);
        this.meta = rewardFrags(this.meta, milestoneFrags, undefined);
      }
      this.meta = rewardGold(goldGain, this.meta, undefined); // primero oro (preserva lastGain luego)
      this.meta = rewardVictory(this.meta, stageId, undefined, { heatMul: rewardMul });
      const daily = this._recordDaily(true);
      // fase 69: ¿la run mejora el récord del modo? Campaña: heat máximo
      // limpiado en ESA etapa. ∞: profundidad máxima a ESE heat. El heat 0
      // nunca es récord (es la run base).
      const isRecord = heat > 0
        && (endless ? stageId > prevDepthHeat : heat > prevStageHeat);
      this.summary = {
        type: 'STAGE_CLEAR',
        stageId,
        stageName: this.stageName,
        score: this.score,
        // dev-7 fase 28: el desglose del score. El score final son los
        // puntos por kill MÁS el bonus de clear; sin el desglose el
        // jugador no sabe cuánto vino de cada cosa.
        scoreKills: this.score - clearBonus,
        clearBonus,
        lv: this.lv,
        cards: this._cardsApplied ?? 0,
        kills: this.kills,
        time: this.timer,
        // fase 59.4/72: el resumen dice CÓMO se ganó: cuántas bajas,
        // cuántas fugas y la integridad que quedó. Sin presupuesto: las
        // fugas son un dato, no una regla.
        leaks: this._leaks,
        hpFrac: this.fortress.maxHp > 0 ? this.fortress.hp / this.fortress.maxHp : 0,
        // fase 67: el S50 tiene "siguiente" (el 51) y el ∞ siempre lo tiene.
        hasNext: endless || stageId < STAGES.length || endlessOpen(this.progressData),
        // fase 67: "campaña completa" es SOLO el S50 (el +150 y el cartel);
        // el ∞ no vuelve a "terminar" la campaña. Explícito para el HUD.
        isFinal,
        metaFrags: this.meta.lastGain,     // por torreta (60 | 120 | ∞)
        metaFirst: this.meta.lastFirst,    // bonus primera vez del stage
        metaGold: goldGain,                // fase 16: oro ganado en total
        metaGoldBonus: isFinal,            // incluye +150 de campaña completa
        // fase 67: profundidad del infinito (null en la campaña).
        endless: endless ? {
          depth: stageId,
          best: bestDepth(this.progressData),
          next: nextEndlessStage(this.progressData),
          isRecord: stageId > prevBest,
          milestone: isMilestone(stageId),
        } : null,
        daily,
        // fase 69: el desglose del Protocolo. `record` es el récord contra
        // el que se compite (ya con esta run dentro); `milestones` son los
        // hitos cobrados en ESTE clear y `milestoneFrags` su bonus por
        // torreta.
        heat: heat > 0 ? {
          heat,
          best: this.progressData.heat.best,
          record: endless
            ? Math.max(prevDepthHeat, stageId)
            : Math.max(prevStageHeat, heat),
          isRecord,
          milestones: nuevos,
          milestoneFrags,
        } : null,
      };
      this.engine.setState('STAGE_CLEAR');
    });

    // Ultimate (§2.8): botón HUD y tecla Espacio emiten 'ultimate:fire'
    engine.on('ultimate:fire', () => this._tryFireUltimate());

    // dev-7 fase 28 — HIT-STOP: el mundo se congela un instante tras un
    // impacto fuerte. Sin esto, un meteorito o un jefe mueren "en el
    // aire" y el golpe no se siente: el jugador ve el número flotar y
    // sigue. 40 ms es lo justo para que se lea como un golpe sin cortar
    // el ritmo (medido: a 60 fps son ~2-3 frames).
    engine.on('enemy:killed', (e) => {
      const puntos = e?.score ?? 0;
      if (puntos >= 500) this._hitStop(90);        // jefe
      else if (puntos >= 30) this._hitStop(40);    // blob / crystal
    });

    // BLACK HOLE (v3-3/7, §2.3): carta ACTIVA — botón HUD y tecla B
    // consumen 1 carga y sueltan el vórtice.
    engine.on('blackhole:fire', () => this._tryFireBlackHole());

    // Orbe de energía recogido (BUG-009): campanita corta de recogida.
    engine.on('orb:collected', () => this.audio.sfx('orb'));

    // Subida de nivel (§2.7/D14): feedback + oferta de 3 cartas.
    // El nivel SOLO dispara CARD_CHOICE (§2.7): pausa el mundo y abre el
    // modal. Un boss puede subir VARIOS niveles con un kill: los niveles
    // pendientes se ACUMULAN y cada uno abre su PROPIA oferta.
    //
    // dev-7 fase 64 — LA OFERTA ES PEREZOSA: hasta acá el handler sorteaba
    // la oferta en el MISMO instante del level-up
    // (`this._offerQueue.push(rollOffer(this))`), así que las ofertas de un
    // multikill se calculaban TODAS con el estado ANTERIOR a la primera
    // elección. Bug real del usuario (S50): un multikill de 2 niveles le
    // ofreció MISSILE, la eligió, y la 2.ª oferta —ya sorteada— volvió a
    // ofrecer MISSILE: quedó con DOS torres misiles. Ahora la cola guarda
    // NIVELES (un contador), no ofertas: el sorteo ocurre al abrirse cada
    // modal (ver `_maybeOpenCards`), con las cartas ya aplicadas a la vista.
    this._pendingLevels = 0;
    engine.on('levelup', ({ lv }) => {
      this._levelUpFeedback(lv);
      this._pendingLevels += 1;
      this._maybeOpenCards();
    });

    // Elección de carta (hud.js §4.4): tap en carta → aplicar y seguir.
    engine.on('card:pick', ({ cardId }) => this.pickCard(cardId));

    // Botón combo 🃏 / tecla U (BUG-005, §1.5): toggle del panel con
    // torres poseídas + niveles + arsenal activo (comboSummary real).
    //
    // dev-7 fase 28: era un toggle ROTO. En PLAYING la primera rama
    // SIEMPRE coincidía, así que el panel sólo podía ABRIRSE (la rama
    // de cerrar era inalcanzable) y además el mundo seguía simulando
    // detrás del panel: el jugador podía perder la base mientras leía
    // sus torres. Ahora es un toggle real en cualquier estado y el
    // juego se PAUSA mientras el panel está abierto.
    engine.on('ui:combo_list', () => {
      if (this.hud.comboOpen()) {
        this.hud.hideComboPanel();
        this._resumeAfterCombo();
        return;
      }
      if (this.engine.state === 'PLAYING') {
        this.hud.showComboPanel(comboSummary(this));
        this._pauseForCombo();
      } else if (this.engine.state === 'CARD_CHOICE') {
        // Estética v3.1: botón verde "Lista de Combos" del modal LEVEL UP —
        // abre el panel sobre las cartas (hideCardChoice re-renderiza al
        // volver, así que la oferta no se pierde).
        this.hud.showComboPanel(comboSummary(this));
      }
    });

    engine.on('boss:warning', () => {
      engine.shake(2, 300);          // D10 (banner DOM llega con dev-6)
      this.audio.sfx('warning');
      // dev-7 fase 28: el banner DOM que docs/DESIGN.md:222 promete lo pinta
      // el HUD, que se suscribe a este mismo evento ('boss:warning').
    });

    // Teclas de navegación FSM (§1.5)
    engine.on('key:confirm', () => this._onConfirm());
    engine.on('key:escape', () => this._onEscape());

    // Acciones de overlays (botones DOM)
    hud.bindActions({
      // dev-7 fase 39: "JUGAR" y "SELECCIONAR STAGE" hacían EXACTAMENTE lo
      // mismo (los dos iban al selector). Ahora "JUGAR" arranca directo el
      // stage que toca (el siguiente disponible) y "SELECCIONAR STAGE"
      // sigue abriendo la lista.
      play: () => this.startStage(this._nextStageId()),
      'start-stage': (btn) => this.startStage(Number(btn.dataset.stage)),
      // fase 67: tarjeta del DESAFÍO DIARIO del selector (endless.js).
      'start-daily': () => this.startDaily(),
      // fase 70: tarjeta de SUPERVIVENCIA y sala de RÉCORDS (hud.js).
      'start-survival': () => this.startSurvival(),
      records: () => this.toRecords(),
      // fase 72: la pantalla de créditos y licencias (atribución CC BY 3.0).
      credits: () => this.toCredits(),
      resume: () => this.resume(),
      'select-stage': () => this.toSelectStage(),
      'next-stage': () => this.startStage((this.stageId ?? 1) + 1),
      // fase 67: el reintento conserva la semilla de la run (`_runOpts`); si
      // no, reintentar el diario rerolearía la composición del día.
      // fase 70: en supervivencia rejuega la MISMA semilla (ver startSurvival).
      retry: () => {
        if (this.mode === 'survival') {
          this.startSurvival({ seed: this._runOpts?.seed });
          return;
        }
        this.startStage(this.stageId ?? 1, this._runOpts ?? {});
      },
      // v5 5a/5: volver al menú principal desde PAUSA (data-action="menu")
      menu: () => this.toMenu(),
      // v3.5 meta-game: pantalla TORRETAS desde el menú / nav inferior
      torretas: () => this.toTorretas(),
      // fase 69: pantalla PROTOCOLO (heat) y sus ajustes. El handler recibe
      // el botón: la fila trae data-cond y los presets data-preset.
      protocol: () => this.toProtocol(),
      'heat-plus': (btn) => this._heatAdjust(btn.dataset.cond, 1),
      'heat-minus': (btn) => this._heatAdjust(btn.dataset.cond, -1),
      'heat-preset': (btn) => this._heatPreset(btn.dataset.preset),
      'heat-close': () => this.toSelectStage(),
    });

    // Hook por frame: HUD sin acoplar engine→hud
    engine.onFrame = (_dt, _dtReal) => this.update(_dt);

    // Render de la Fortress (cúpula + arco HP + torres) en cada frame
    engine.onRenderExtra = (ctx) => this.fortress.render(ctx);
  }

  // ---------- Navegación FSM (§1.3) ----------
  /**
   * Limpia el campo de batalla al salir a una pantalla de menú (fase 28).
   *
   * Antes, al volver al menú / al selector / a las torretas se veía la
   * partida CONGELADA detrás del overlay: enemigos suspendidos en el
   * aire, textos flotantes ("¡MULTI KILL!"), partículas y restos de
   * explosiones. El overlay es translúcido, así que esa imagen compite
   * con el texto del menú y hace dudar de si se está jugando.
   *
   * Se limpian entidades, efectos, floats y partículas — pero NO las
   * torres: el arsenal del jugador queda en la base como "trofeo" y
   * hace de ancla visual del menú (se ve bien).
   */
  _clearBattlefield() {
    const e = this.engine;
    e.entities.length = 0;
    e.effects.length = 0;
    e.floats.length = 0;
    e.particles.length = 0;
    if (this.fortress) this.fortress.enemies.length = 0;
    this.waveManager = null;
  }

  toMenu() {
    this._clearBattlefield();
    this.engine.setState('MENU');
  }

  /** v3.5 meta-game: pantalla TORRETAS (mejoras permanentes). Recarga el
   *  estado meta fresco por si cambió (victorias en otra vista) y pinta. */
  toTorretas() {
    this._clearBattlefield();
    this.meta = loadMeta();
    this.engine.setState('TORRETAS');
    this.hud.showScreen('TORRETAS'); // setState no-op re-render (mismo estado)
  }

  toSelectStage() {
    this._clearBattlefield();
    this.progressData = loadProgress(); // refresca desbloqueos/best scores
    if (this.engine.state === 'SELECT_STAGE') {
      // setState() es no-op con el mismo estado: re-render manual para que
      // los candados/récords reflejen el progreso recién cargado (dev-5).
      this.hud.showScreen('SELECT_STAGE');
      return;
    }
    this.engine.setState('SELECT_STAGE'); // HUD toma datos frescos al renderizar
  }

  // ---------- Protocolo de asedio / HEAT (fase 69) ----------

  /**
   * Pantalla PROTOCOLO (menú de handicaps). El estado lo pinta el HUD con
   * `_heatData()`; acá sólo se refresca el progreso y se navega.
   */
  toProtocol() {
    this._clearBattlefield();
    this.progressData = loadProgress();
    this.engine.setState('PROTOCOLO');
    // setState() es no-op con el mismo estado: re-render manual para que
    // los rangos recién guardados se vean al instante (mismo patrón que
    // toTorretas/toSelectStage).
    this.hud.showScreen('PROTOCOLO');
  }

  /**
   * Datos de la pantalla PROTOCOLO — CONTRATO CONGELADO con el HUD.
   *
   * @returns {{mods:object,total:number,preset:string|null,rewardMul:number,
   *   best:number,conds:Array,presets:Array,milestones:number[]}}
   */
  _heatData() {
    if (!this.progressData) this.progressData = loadProgress();
    const last = normalizeHeatMods(this.progressData.heat.last);
    const dials = heatMods(last);
    return {
      // `mods` es el MAPA DE RANGOS ({ asedio: 2 }), que es lo que pinta el
      // HUD fila a fila; los diales ya resueltos viven en `game.runMods`.
      mods: last,
      total: dials.heat,
      preset: presetFor(last)?.id ?? null,
      rewardMul: heatRewardMul(dials.heat),
      best: this.progressData.heat.best,
      conds: HEAT_CONDS,
      presets: HEAT_PRESETS.map((p) => ({
        id: p.id, name: p.name, heat: heatTotal(p.mods),
      })),
      milestones: HEAT_MILESTONES,
    };
  }

  /**
   * ±1 rango de una condición. El heat no se puede editar DURANTE una run
   * (la pantalla sólo se abre desde el menú), así que se relee el progreso
   * para no pisar récords de otra vista.
   *
   * @param {string} id condición (data-cond)
   * @param {number} delta +1 / −1
   */
  _heatAdjust(id, delta) {
    const cond = HEAT_CONDS.find((c) => c.id === id);
    if (!cond) return;
    this.progressData = loadProgress();
    const last = normalizeHeatMods(this.progressData.heat.last);
    const step = Number.isFinite(delta) ? Math.trunc(delta) : 0;
    const rank = Math.max(0, Math.min(cond.ranks, (last[id] ?? 0) + step));
    if (rank > 0) last[id] = rank;
    else delete last[id];
    this.progressData.heat.last = last;
    this.progressData = saveProgress(this.progressData);
    this.hud.showScreen('PROTOCOLO');
  }

  /**
   * Aplica un preset curado (I..V). Ojo: `presetMods` devuelve `{}` si el
   * id no existe — un preset desconocido deja el Protocolo neutral, mismo
   * criterio que un heat 0.
   *
   * @param {string} id 'I'..'V' (data-preset)
   */
  _heatPreset(id) {
    this.progressData = loadProgress();
    this.progressData.heat.last = presetMods(id);
    this.progressData = saveProgress(this.progressData);
    this.hud.showScreen('PROTOCOLO');
  }

  /**
   * Arranca una etapa de la CAMPAÑA (1..50) o del INFINITO (≥51).
   *
   * fase 67: la etapa se resuelve con `stageDef()` (endless.js), que genera
   * el ∞ con el mismo director de olas, el tema en ciclo y el HP de la
   * curva real. `opts.seed` fija la composición de olas (desafío diario) y
   * `opts.daily` marca la run como diaria; ambos se guardan en `_runOpts`
   * para que el reintento rejuegue EXACTAMENTE lo mismo.
   *
   * fase 69: `opts.heatMods` es el PROTOCOLO de la run. `undefined` lee el
   * activo (`progress.heat.last`); `null` fuerza heat 0 (el desafío diario
   * y los tests son siempre neutrales). Los diales resultantes viven en
   * `this.runMods`, el objeto ÚNICO que leen las torres, las olas, la base
   * y las cartas.
   *
   * @param {number} stageId 1..∞
   * @param {{seed?:number, daily?:string, heatMods?:object|null}} [opts]
   */
  startStage(stageId, opts = {}) {
    const def = stageDef(stageId);
    if (!def) throw new Error(`[main] stage desconocido: ${stageId}`);
    if (!isUnlocked(this.progressData, def.id)) return; // candado §2.9
    this.mode = 'campaign'; // fase 70: cualquier etapa devuelve el modo de campaña
    // fase 70: limpiar el sufijo "· Oleada N" de una run de Supervivencia
    // anterior; si no, el HUD de campaña lo arrastraría (showScreen no toca
    // el estado interno del nombre de etapa).
    this.hud.setSurvivalWave?.(0);
    const heatProtocol = isEndless(def.id) || opts.heatMods === null
      ? {} // fase 69 v1: el ∞ y el diario juegan SIN Protocolo (ver docs/BALANCE.md)
      : (opts.heatMods ?? this.progressData.heat.last);
    const runMods = heatMods(heatProtocol);
    this.runMods = runMods;
    // El reintento rejuega la MISMA dificultad: si el jugador edita el
    // Protocolo a mitad de run, retry no puede cambiarle la vara.
    this._runOpts = { seed: opts.seed, daily: opts.daily, heatMods: heatProtocol };
    this.stageId = def.id;
    this.stageName = def.name;
    this.engine.setTheme(def.theme);          // paleta del stage (§2.9)
    // dev-7 fase 28: meta fresca — la potencia del Guardian (multiplicador
    // de meta) se usa para modelar la apertura del stage.
    this.meta = loadMeta();
    this.progress = 0;
    this.lv = 1;        // el Lv arranca en 1 cada stage (roguelike §2.7)
    this.xp = 0;
    this.xpFrac = 0;
    this.timer = 0;
    this.score = 0;
    this._spawnScoreCarry = 0;
    this.streak = 0;
    this.mult = 1;
    this.kills = 0;
    this._leaks = 0;
    this._ended = false;
    // dev-7 fase 28: cartas aplicadas en esta run (lo usa el resumen de
    // fin de partida para decir qué se perdió).
    this._cardsApplied = 0;
    // Reloj del hit-stop (0 = sin hit-stop activo).
    this._hitStopUntil = 0;
    this._healAcc = 0;
    this._lastHealFloatAt = -Infinity;
    this.summary = null;
    this.pendingOffer = null;   // card system: sin ofertas entre stages
    // dev-7 fase 64: la cola es un contador de NIVELES sin carta (no de
    // ofertas ya sorteadas): un stage nuevo arranca sin nada pendiente.
    this._pendingLevels = 0;
    this.engine.entities.length = 0;
    this.engine.effects.length = 0;
    this._multiKill?.reset();   // D6: ventana de multi-kill fresca por stage
    this.audio.setIntensity(1); // música arranca en calma (capas suben solas)

    // Fortress nueva por stage: HP de la etapa. fase 67: `def.baseHp` (el ∞
    // lo trae de `baseHpForStage`, la misma curva del S50). Con el viejo
    // `BASE_HP_BY_STAGE[id] ?? 3000` una etapa 51 arrancaba con 3000 HP:
    // MÁS fácil que la 50 (25 500).
    // §6 decisión 3: arranca SOLO Guardian (S3); Missile/Thunderstroke/
    // Tesla/Beam entran por sus cartas de desbloqueo (cards.js v3-1/7).
    this.fortress = new Fortress(this);
    // fase 69 — condición Fragilidad: la base arranca con menos HP. El
    // Math.max(1, …) garantiza una base viva incluso con un baseHpMul
    // degenerado (el piso real de heat.js es 0,7: −30 %).
    this.fortress.maxHp = Math.max(1, Math.round(def.baseHp * runMods.baseHpMul));
    this.fortress.hp = this.fortress.maxHp;
    // fase 69 — condición Arsenal: una ranura menos ANTES de colocar al
    // Guardian (con la base vacía es seguro encoger slots/_slotGeom).
    if (runMods.slotDelta < 0) this.fortress.dropLastSlot?.();
    this._ensureTestTowers(); // Guardian SIEMPRE en S3 (§6 decisión 2/3)

    // WaveManager del stage (dev-3): olas §2.5 + WARNING + boss.
    // dev-7 fase 28: se le pasa la potencia REAL del Guardian (multiplicador
    // de meta) para que la apertura se modele como el jugador la va a
    // vivir. Sin esto, en los stages finales el pool "matable" se
    // degradaba a un solo tipo y la apertura no llegaba al piso de XP: el
    // jugador se quedaba en Lv1 y el stage era injugable (medido: S45 y
    // S50 entregaban 80-100 XP de los 315 necesarios).
    this.waveManager = new WaveManager(def.id, {
      powerMul: metaDmgMul('guardian', this.meta),
      // fase 67: semilla INYECTABLE (desafío diario: todos los jugadores
      // juegan la MISMA composición; reintento: la misma de la run).
      seed: opts.seed,
      // fase 69: Vigor/Prisa/Leva/Élites/Jefes/Doble élite viven en el
      // director de olas; acá sólo se le pasa el protocolo ya resuelto.
      runMods,
    });
    this.waveManager.onBossDead(() => this.engine.emit('stage:cleared', { stage: def.id }));
    // v6: los stages SIN jefe (2..9, 11..) terminan al completar las olas.
    this.waveManager.onWavesDone(() => this.engine.emit('stage:cleared', { stage: def.id }));

    // v5 5a/5 (run zombie): si se abandonó desde PAUSA, engine.timeScale
    // quedó en 0 (setState('PAUSED') lo congela) y _savedSpeed guarda la
    // velocidad vieja. setState('PLAYING') solo restaura cuando el estado
    // PREVIO es PAUSED/CARD_CHOICE — desde MENU/TORRETAS/SELECT_STAGE la
    // run nueva arrancaría CONGELADA. Forzar la velocidad elegida aquí
    // resetea ambos.
    //
    // dev-7 fase 28: se fuerza la velocidad PREFERIDA del jugador, no
    // siempre x1: antes cada stage arrancaba a x1 y el jugador perdía
    // su ajuste (x2 en el stage 5 → x1 en el 6).
    this.engine.setTimeScale(this._preferredSpeed || 1);

    this.engine.setState('PLAYING');
  }

  /**
   * fase 67 — DESAFÍO DIARIO: la etapa y la semilla salen de la fecha LOCAL
   * del jugador (`dailyRun()`, endless.js), así todos juegan la misma
   * composición ese día. Sólo existe con la campaña completa; los intentos
   * son ilimitados y `retry` reusa la semilla (si no, el récord del día se
   * podría rerolear).
   */
  startDaily() {
    if (!endlessOpen(this.progressData)) return;
    const run = dailyRun();
    // fase 69: el desafío diario es la vara COMÚN de la fecha — siempre a
    // heat 0 (`heatMods: null`), sin importar el Protocolo activo.
    this.startStage(run.stage, { seed: run.seed, daily: run.date, heatMods: null });
  }

  /**
   * fase 70 — SUPERVIVENCIA: una run de olas infinitas en una arena.
   *
   * No hay etapa: la base (25 500 HP, la del S50) aguanta por atrición
   * (cada fuga resta el HP MÁXIMO del enemigo, `leakDamageFor`) y la base
   * es la ÚNICA condición de derrota. La cola de olas se pide por bloques
   * de 5 (`SURVIVAL.chunk`) al WaveManager vía `extend`.
   *
   * El Protocolo SÍ se aplica (heat 0 incluido): `runMods` sale del
   * Protocolo activo y lo leen la base, las olas, la oferta y el Ultimate.
   *
   * @param {{seed?:number}} [opts] semilla de la run (el reintento la reusa)
   */
  startSurvival({ seed } = {}) {
    // El modo es el endgame de después del primer clear: sin la campaña
    // completa no hay tarjeta ni entrada (el jugador todavía no tiene meta).
    if (!endlessOpen(this.progressData)) return;
    this.mode = 'survival';
    // fase 70: una run nueva arranca en la oleada 0 (sin sufijo en el HUD).
    this.hud.setSurvivalWave?.(0);
    const runMods = heatMods(this.progressData.heat.last);
    this.runMods = runMods;
    this.survivalSeed = Number.isFinite(seed) ? (seed >>> 0) : ((Math.random() * 1e9) | 0);
    // fase 70: el reintento rejuega la MISMA run (las olas son deterministas
    // por semilla), igual que el diario. `survival: true` marca el modo.
    this._runOpts = { seed: this.survivalSeed, survival: true };
    this.stageId = SURVIVAL.baseStage; // stage virtual de la oleada 0 (curva del S1)
    this.stageName = 'Supervivencia';
    this.engine.setTheme(survivalTheme(1));
    // Mismo reset de run que startStage: cada run es una partida nueva.
    this.meta = loadMeta();
    this.progress = 0;
    this.lv = 1;
    this.xp = 0;
    this.xpFrac = 0;
    this.timer = 0;
    this.score = 0;
    this._spawnScoreCarry = 0;
    this.streak = 0;
    this.mult = 1;
    this.kills = 0;
    this._leaks = 0;
    this._ended = false;
    this._cardsApplied = 0;
    this._hitStopUntil = 0;
    this._healAcc = 0;
    this._lastHealFloatAt = -Infinity;
    this.summary = null;
    this.pendingOffer = null;
    this._pendingLevels = 0;
    this.engine.entities.length = 0;
    this.engine.effects.length = 0;
    this._multiKill?.reset();
    this.audio.setIntensity(1);

    // Base de la run: los 25 500 HP del S50 × condición Fragilidad. El
    // Math.max(1, …) garantiza una base viva con un baseHpMul degenerado.
    this.fortress = new Fortress(this);
    this.fortress.maxHp = Math.max(1, Math.round(SURVIVAL.baseHp * runMods.baseHpMul));
    this.fortress.hp = this.fortress.maxHp;
    // Condición Arsenal: una ranura menos ANTES de colocar al Guardian.
    if (runMods.slotDelta < 0) this.fortress.dropLastSlot?.();
    this._ensureTestTowers();

    // El manager arranca VACÍO de olas: `extendNow()` inyecta el primer
    // bloque (el constructor no conoce el game, ver design §Decisión 3).
    this.waveManager = new WaveManager(SURVIVAL.baseStage, {
      powerMul: metaDmgMul('guardian', this.meta),
      seed: this.survivalSeed,
      runMods,
      survival: true,
      extend: (wm) => this._extendSurvival(wm),
    });
    this.waveManager.extendNow();

    this.engine.setTimeScale(this._preferredSpeed || 1);
    this.engine.setState('PLAYING');
  }

  /**
   * fase 70 — Un bloque de 5 olas más para la cola de la supervivencia.
   *
   * Lo llama el WaveManager cuando se queda sin cola ni spawns pendientes.
   * `wm.survivalWave` lo actualiza el MANAGER al despachar (acá sólo se
   * lee para saber por dónde va el bloque), y `stage`/`scale`/`boss*` se
   * mueven al ÚLTIMO stage virtual del bloque: el director escala la
   * dificultad con la oleada, no con la etapa.
   *
   * @param {WaveManager} wm
   * @returns {boolean} siempre extiende (la run es infinita)
   */
  _extendSurvival(wm) {
    const from = (wm.survivalWave ?? 0) + 1;
    const waves = survivalWaveChunk(from, SURVIVAL.chunk, this.survivalSeed, {
      runMods: this.runMods,
    });
    // `t` RELATIVOS del bloque → absolutos del manager (1,5 s de respiro).
    const base = wm.t + 1.5;
    for (const w of waves) w.t += base;
    wm.queue.push(...waves);
    wm.queue.sort((a, b) => a.t - b.t);
    const last = from + SURVIVAL.chunk - 1;
    wm.stage = survivalStage(last);
    wm.scale = survivalScale(last, this.runMods);
    wm.bossKind = survivalBossKind(last);
    wm.bossName = survivalBossName(last);
    this.engine.setTheme(survivalTheme(from)); // el tema rota cada 5 oleadas
    return true;
  }

  resume() { this.engine.setState('PLAYING'); }

  // ---------- Música por FSM (v3 5/7, BUG-004) ----------

  /**
   * Acorde la música al estado FSM:
   * · PLAYING       → re-arranca (idempotente) y quita el ducking
   * · PAUSED/CARD_CHOICE → ducking (queda de fondo, no muere)
   * · resto (menú, fin de run) → stop
   * Si el usuario la silenció (toggle ♪), no se re-activa sola.
   */
  _musicForState(state) {
    const a = this.audio;
    if (state === 'PLAYING') {
      // BUG-004: primer arranque por FSM — el default del juego es música
      // ON, así que entrar a PLAYING enciende el loop aunque el usuario
      // nunca tocó ♪ (el ctx ya está desbloqueado por su gesto de jugar).
      if (!a.musicOn && !a.musicMuted) a.startMusic();
      if (a.musicOn) {
        a.setPaused(false);
        a.startMusic(); // idempotente si ya corre
      }
    } else if (state === 'PAUSED' || state === 'CARD_CHOICE') {
      // Si aún no arrancó (p.ej. pausa antes del primer PLAYING), no la
      // enciende a mitad de overlay: solo ducking si ya estaba sonando.
      if (a.musicOn) a.setPaused(true);
    } else {
      a.stopMusic();
    }
  }

  /** Toggle ♪ (botón HUD / tecla M): apaga o re-arranca según el estado. */
  _toggleMusic() {
    this.audio.init();
    this.audio.resume();
    const a = this.audio;
    a.musicMuted = a.musicOn; // preferencia para el próximo PLAYING
    if (a.musicOn) {
      a.stopMusic();
    } else {
      a.startMusic();
      this._musicForState(this.engine.state); // respeta pausa/cartas
    }
    this.hud.setMusicMuted(!a.musicOn);
  }

  // ---------- Card system roguelike (v3-1/7, BUG-001/D7) ----------

  /**
   * Abre CARD_CHOICE si hay niveles pendientes y la run sigue viva.
   *
   * dev-7 fase 64: la oferta se SORTEA ACÁ (no en el handler del level-up)
   * → el sorteo ve el estado REAL del jugador, con las cartas de las
   * ofertas anteriores ya aplicadas. Si la base cayó mientras el modal
   * estaba abierto, los pendientes se descartan (GAME_OVER manda) — ver
   * pickCard().
   */
  _maybeOpenCards() {
    if (this._ended || this.engine.state !== 'PLAYING') return;
    if (!this._pendingLevels) return;
    this.pendingOffer = rollOffer(this);
    this.engine.setState('CARD_CHOICE');
  }

  /**
   * Tap en una carta del modal CARD_CHOICE: aplica el efecto REAL y
   * continúa (o abre la siguiente oferta si el mismo kill subió varios
   * niveles). La run terminada nunca re-abre cartas.
   */
  pickCard(cardId) {
    if (this.engine.state !== 'CARD_CHOICE' || !this.pendingOffer) return;
    const card = this.pendingOffer.find((c) => c.id === cardId);
    if (!card) return;
    applyCard(card, this);
    this.audio.sfx('card');
    // dev-7 fase 28: contador de cartas aplicadas en la run (lo usa el
    // resumen de fin de partida para decir qué se perdió/perdió).
    this._cardsApplied = (this._cardsApplied ?? 0) + 1;
    // Estética v3.1 (eye-of-the-void): feedback de BUFF en verde sobre la
    // base al aplicar la mejora — texto canonico de stages altos.
    const buffY = SCENE.BASE_ARC_Y - 40;
    // dev-7 fase 28: estaba en inglés ("Powered up") — el ÚNICO string en
    // inglés que veía el jugador en un juego enteramente en español.
    this.engine.floatText(CONFIG.BASE_X, buffY, `¡MEJORA! ${card.name}`, '#4BE89A');
    this.pendingOffer = null;
    // La carta elegida consume UN nivel pendiente (fase 64).
    this._pendingLevels = Math.max(0, this._pendingLevels - 1);
    if (this._ended || !this._pendingLevels) {
      this._pendingLevels = 0;
      if (this._ended) { this.engine.setState('SELECT_STAGE'); return; }
      this.engine.setState('PLAYING');
      return;
    }
    // Multi-level-up: la oferta SIGUIENTE se sortea AHORA, con la carta
    // recién aplicada (fase 64: la cola vieja traía ofertas ya sorteadas y
    // repetía la torre que el jugador acababa de desbloquear).
    //
    // NO se llama hideCardChoice(): eso reiniciaría el guard
    // anti-doble-toque (hud.js) y las dos ofertas encadenadas son la MISMA
    // decisión (el 2.º toque del doble toque cae sobre la oferta nueva).
    this.pendingOffer = rollOffer(this);
    this.hud.showCardChoice(this.pendingOffer);
  }

  /**
   * Guardian inicial en S3 (§6 decisión 3: Stage arranca con SOLO Guardian,
   * como el diseño base). Las ranuras S1/S2/S4/S5 quedan vacías — la plataforma
   * dibuja pedestales (§2.1) donde se montan Missile/Thunderstroke/Tesla/
   * Beam al llegar su carta de desbloqueo (cards.js v3-1/7).
   * Idempotente: re-add sobre slot ocupado es no-op (addTower → null).
   */
  _ensureTestTowers() {
    // fase 63: el Guardian es la ÚNICA torre con lugar fijo, y lo pide acá
    // EXPLÍCITO (el resto cae en el primer slot libre). Va al centro porque
    // es el eje de la base: la cúpula, el arco de HP y el núcleo están ahí.
    if (!this.fortress.slots[GUARDIAN_SLOT]) this.fortress.addTower('guardian', GUARDIAN_SLOT);
  }

  _onConfirm() {
    switch (this.engine.state) {
      case 'MENU': this.startStage(this._nextStageId()); break;
      // dev-7 fase 39: Enter arrancaba SIEMPRE la stage 1, no la marcada
      // con "▶" en el selector. Ahora arranca la que toca.
      case 'SELECT_STAGE': this.startStage(this._nextStageId()); break;
      case 'PAUSED': this.resume(); break;
      default: break;
    }
  }

  /**
   * dev-7 fase 39 — El stage que toca: el siguiente disponible (el
   * mismo que marca con "▶" el selector). Si no hay ninguno, el 1.
   *
   * fase 67: con el modo ∞ abierto "JUGAR"/Enter continúa el infinito
   * (mejor profundidad + 1). Antes se llamaba con el array CRUDO de
   * `STAGES`, sin `unlocked` → `nextId` siempre null → S1.
   * @returns {number}
   */
  _nextStageId() {
    const data = this._selectData();
    if (data.endless.open) return data.endless.next;
    return findStageHighlights(data.stages).nextId ?? 1;
  }

  /**
   * fase 67 — Cierra la run del DESAFÍO DIARIO (si lo es): registra el
   * score del día gane o pierda (es una caza de score) y devuelve el
   * resumen que pinta el HUD.
   *
   * El récord se compara contra el de HOY: al cambiar la fecha el récord
   * anterior se descarta solo (progress.js:recordDaily).
   *
   * @param {boolean} cleared ¿se completó la etapa?
   * @returns {{date:string,stage:number,score:number,best:number,isRecord:boolean,cleared:boolean}|null}
   */
  _recordDaily(cleared) {
    const daily = this._runOpts?.daily;
    if (!daily) return null;
    const stageId = this.stageId ?? 1;
    const score = this.score;
    const prev = this.progressData?.endless?.daily;
    const prevScore = prev?.date === daily ? prev.bestScore : 0;
    this.progressData = saveProgress(recordDaily(this.progressData, daily, score));
    return {
      date: daily,
      stage: stageId,
      score,
      best: this.progressData.endless.daily.bestScore,
      isRecord: score > prevScore,
      cleared,
    };
  }

  /**
   * fase 75 — Back nativo/Android. Usa las transiciones REALES de Game
   * (toMenu/toSelectStage) en vez de `setState` directo: el back desde una
   * pantalla de fin o pausa dejaba enemigos/proyectiles congelados detrás
   * del menú porque `_clearBattlefield()` nunca corría.
   * @returns {boolean} true si el juego consumió el back
   */
  handleBack() {
    const action = backAction(this.engine.state);
    if (!action.handled) return false;
    if (action.next === 'MENU') this.toMenu();
    else if (action.next === 'SELECT_STAGE') this.toSelectStage();
    else if (action.next) this.engine.setState(action.next);
    return true;
  }

  _onEscape() {
    // Esc en PAUSA = continuar (lo promete la pantalla de pausa:
    // "[P]/[Esc] continuar"). Reusa el mismo camino que el botón CONTINUAR.
    // dev-7 fase 28: Esc con el panel 🃏 abierto lo CIERRA (y reanuda el
    // mundo que el panel tenía congelado) en vez de no hacer nada.
    if (this.hud.comboOpen()) {
      this.hud.hideComboPanel();
      this._resumeAfterCombo();
      return;
    }
    if (this.engine.state === 'PAUSED') this.resume();
    else if (this.engine.state === 'SELECT_STAGE') this.toMenu();
    else if (this.engine.state === 'TORRETAS') this.toMenu(); // v3.5
    // fase 69: el Protocolo se abre desde el selector, así que Esc vuelve ahí
    else if (this.engine.state === 'PROTOCOLO') this.toSelectStage();
    else if (this.engine.state === 'STAGE_CLEAR' || this.engine.state === 'GAME_OVER') this.toSelectStage();
    // fase 72: los créditos se abren desde el menú, así que Esc vuelve ahí.
    else if (this.engine.state === 'CREDITS') this.toMenu();
    // deuda de la fase 70 que este diff cierra: RÉCORDS tampoco tenía salida
    // con Esc (se abría desde el menú y Esc no hacía nada).
    else if (this.engine.state === 'RECORDS') this.toMenu();
  }

  /** Datos para SELECT_STAGE (§2.10): desbloqueo + mejor score reales. */
  _selectData() {
    if (!this.progressData) this.progressData = loadProgress();
    // fase 67: la tarjeta ∞ y el desafío diario del selector. El récord del
    // día sólo vale si es de HOY (el de ayer lo descarta progress.js).
    const today = dailyRun();
    const daily = this.progressData?.endless?.daily;
    // fase 69: el Protocolo activo y su récord. El selector muestra
    // "Heat N · récord H" y la tarjeta ∞ la mejor profundidad a ESE heat.
    const activeHeat = heatTotal(this.progressData.heat.last);
    return {
      stages: STAGES.map((s) => ({
        id: s.id,
        name: s.name,
        boss: s.boss, // v6: hitos de jefe cada 10 stages (1,10,20…)
        unlocked: isUnlocked(this.progressData, s.id),
        // dev-7 fase 28: la clave es `bestScore` (js/progress.js lo escribe
        // así). Antes se leía `progressData.best`, que NO existe → el
        // récord de cada stage se guardaba pero NUNCA se mostraba (el
        // selector decía "disponible" siempre).
        bestScore: this.progressData?.bestScore?.[s.id] ?? null,
      })),
      endless: {
        open: endlessOpen(this.progressData),
        best: bestDepth(this.progressData),
        next: nextEndlessStage(this.progressData),
        daily: {
          date: today.date,
          stage: today.stage,
          bestScore: daily?.date === today.date ? daily.bestScore : 0,
        },
      },
      heat: { active: activeHeat, best: this.progressData.heat.best },
      // fase 70: la tarjeta de SUPERVIVENCIA del selector (mejor oleada).
      // Se abre con la campaña completa, igual que el ∞ y el Protocolo: es
      // el modo de después del primer clear (el jugador ya tiene meta).
      survival: endlessOpen(this.progressData) ? {
        bestWave: this.progressData.survival.bestWave,
        bestScore: this.progressData.survival.bestScore,
        runs: this.progressData.survival.runs,
      } : null,
    };
  }

  /**
   * fase 70 — SALA DE RÉCORDS: el estado de los cinco modos en una sola
   * pantalla (design §Decisión 5). CONTRATO CONGELADO con el HUD.
   *
   * @returns {{campaign:{cleared:number,bestScore:number},
   *   endless:{best:number,next:number},
   *   heat:{best:number,stage50:number,next:number|null},
   *   survival:{bestWave:number,bestScore:number,runs:number,nextWave:number},
   *   daily:{date:string,bestScore:number}}}
   */
  _recordsData() {
    if (!this.progressData) this.progressData = loadProgress();
    const p = this.progressData;
    // Campaña: las etapas con récord escrito (1..50) y el mejor score. Una
    // clave con 0 también cuenta: el stage se limpió, sólo que sin puntos.
    let cleared = 0;
    let bestScore = 0;
    for (let id = 1; id <= STAGES.length; id++) {
      const s = p.bestScore?.[id];
      if (!Number.isFinite(s) || s < 0) continue;
      cleared += 1;
      if (s > bestScore) bestScore = s;
    }
    // fase 70: el próximo hito de la supervivencia es la siguiente decena
    // de 5 oleadas (la primera es la 5 si todavía no hay récord).
    const bestWave = p.survival.bestWave;
    const today = dailyRun();
    return {
      campaign: { cleared, bestScore },
      endless: { best: bestDepth(p), next: nextEndlessStage(p) },
      heat: {
        best: p.heat.best,
        stage50: p.heat.byStage[50] ?? 0,
        next: HEAT_MILESTONES.find((t) => !p.heat.claimed.includes(t)) ?? null,
      },
      survival: {
        bestWave,
        bestScore: p.survival.bestScore,
        runs: p.survival.runs,
        nextWave: Math.ceil((bestWave + 1) / SURVIVAL.checkEvery) * SURVIVAL.checkEvery,
      },
      daily: {
        date: today.date,
        bestScore: p.endless.daily.date === today.date ? p.endless.daily.bestScore : 0,
      },
    };
  }

  /**
   * Navega a la sala de RÉCORDS (fase 70). El estado `RECORDS` lo pinta el
   * HUD; acá se limpia el campo y se relee el progreso, como en SELECT_STAGE.
   */
  toRecords() {
    this._clearBattlefield();
    this.progressData = loadProgress();
    this.engine.setState('RECORDS');
    // setState() es no-op con el mismo estado: re-render manual (mismo
    // patrón que toSelectStage/toTorretas).
    this.hud.showScreen('RECORDS');
  }

  /**
   * Navega a CRÉDITOS Y LICENCIAS (fase 72). Es una pantalla ESTÁTICA: el
   * HUD la arma con los textos embebidos en js/licenses.js, así que no hay
   * datos que recargar (a diferencia de toRecords/toSelectStage). Se limpia
   * el campo para que no quede la partida congelada detrás del overlay.
   */
  toCredits() {
    this._clearBattlefield();
    this.engine.setState('CREDITS');
    // setState() es no-op con el mismo estado: re-render manual (mismo
    // patrón que toSelectStage/toTorretas/toRecords).
    this.hud.showScreen('CREDITS');
  }

  _refreshSpeed() {
    this._speedDirty = true; // el label del botón se refresca en update()
  }

  // ---------- Economía de kills (§2.6/§2.7/§2.8) ----------

  /** Un enemigo murió: score ×mult ×velocidad, float, XP, racha, ultimate. */
  _onKill(enemy) {
    this.kills += 1;
    const base = baseScoreForEnemy(enemy);
    // Prima de Combate (scoreMul) se apila al multiplicador de racha y
    // al bonus de velocidad (§2.6 + cartas v3-1/7).
    const raw = base * this.mult * speedMult(this.engine.timeScale)
      * (this.fortress.scoreMul ?? 1);
    let gained;
    if (enemy?.fromSpawn) {
      // Las crías pagan 10 %: con 0,5 de score, el carry paga 0 en la
      // primera y 1 en la segunda (score entero, 10 % en agregado).
      const r = scoreWithCarry(raw, this._spawnScoreCarry);
      gained = r.gained;
      this._spawnScoreCarry = r.carry;
    } else {
      gained = Math.max(1, Math.round(raw));
    }
    if (gained > 0) {
      this.score += gained;
      this.engine.floatText(
        enemy?.x ?? CONFIG.BASE_X,
        Math.min(enemy?.y ?? 300, CONFIG.CANVAS_H - 120),
        `+${gained}`,
        enemy?.isBoss ? '#FF9A3D' : '#FFD24A',
      );
    }

    // Estética (diseño base): destello "estrella" blanco-azul en el impacto.
    if (!enemy?.isBoss) {
      starburst(this.engine, enemy?.x ?? CONFIG.BASE_X,
        Math.min(enemy?.y ?? 300, CONFIG.CANVAS_H - 120),
        enemy && enemy.r >= 20 ? 1.5 : 1);
    } else {
      // dev-7 fase 1: explosión con sprite real (además de la procedural
      // que ya dispara enemy.explode() en enemies.js) para el momento
      // puntual de derrotar al jefe.
      spawnSpriteBossExplosion(this.engine, enemy.x,
        Math.min(enemy.y, CONFIG.CANVAS_H - 120));
    }

    // BUG-009 (D12): el cristal rojo SUELTA un orbe de energía visible
    // que cae hacia la base; al rozarla se recoge (float "+N" + sfx).
    // El bonus XP directo de _gainXp NO cambia: el orbe replica el mismo
    // número como score al recogerse (solo visual + juice).
    dropEnergyOrb(this, enemy, base);

    // Racha → multiplicador visible (D3; el badge hace pop al cambiar)
    this.streak += 1;
    this.mult = multForStreak(this.streak);

    // XP = la ENERGÍA del enemigo, que escala con la etapa (fase 59.3:
    // `xpForKill`) — el SCORE sigue plano (es la leaderboard por etapa).
    // El cristal suma su bonus de energía (§2.4/D12); el Acelerador de
    // Energía multiplica la energía ganada.
    const bonusFrac = enemy?.data?.dropXpBonusFrac ?? 0;
    this._gainXp(xpForKill(enemy, this._xpStageNow())
      * (1 + bonusFrac) * (this.fortress.xpMul ?? 1));

    // Ultimate: carga SOLO por kills (§2.8); el boss suma cargas extra
    this.fortress.chargeUltimate(enemy?.isBoss ? ULT_BOSS_CHARGES : 1);

    // Black Hole (v4 4b/5): medidor por kills como el ultimate — mitad de
    // costo (20 kills), el boss suma cargas extra.
    this.fortress.chargeBlackHole(enemy?.isBoss ? BLACK_HOLE_BOSS_CHARGES : 1);

    this.audio.sfx(enemy?.isBoss ? 'explosion' : 'kill');

    // D6 (BUG-006): 3+ kills en 0.5 s → FIREWORKS dorados + campana.
    if (this._multiKill.feed()) {
      spawnGoldenFireworks(
        this.engine,
        enemy?.x ?? CONFIG.BASE_X,
        Math.min(enemy?.y ?? 300, CONFIG.CANVAS_H - 120) + 40,
      );
      this.audio.sfx('firework');
    }
  }

  /**
   * fase 71 — TOPE de nivel/cartas de la run ACTIVA.
   *
   * La campaña y el ∞ reparten 20 cartas (nivel 21); la Supervivencia, 30
   * (nivel 31). Antes el HUD y el modal de cartas comparaban siempre con
   * `MAX_LEVEL_PER_STAGE` (21) y decían "NIVEL MÁX" en Supervivencia
   * mientras el juego seguía dando upgrades. Este getter es la ÚNICA
   * fuente de verdad para `_gainXp()` y para el HUD.
   *
   * @returns {number}
   */
  get maxLevel() {
    return this.mode === 'survival' ? SURVIVAL.maxLevel : MAX_LEVEL_PER_STAGE;
  }

  /**
   * XP con posible salto de varios niveles (un boss puede dar varios).
   *
   * dev-7 fase 59.3: el UMBRAL DE NIVEL escala con la etapa
   * (`xpForLevel(lv, stage)`): el XP por kill también escala (la energía
   * se paga en proporción a lo que vale el enemigo en esa etapa), así que
   * si el umbral fuera plano el jugador llegaría al Nvl 52 en el S50 (51
   * ofertas de cartas, la mitad con el tope ya gastado).
   *
   * dev-7 fase 64: el bucle de niveles pasa a `applyXp` (score.js) CON
   * TOPE (`MAX_LEVEL_PER_STAGE`): la etapa reparte del orden de
   * MAX_CARDS_PER_STAGE cartas (20) y se acabó — llegado el tope, la baja
   * ya no abre pantallas de elección. La energía que no puede comprar
   * nivel NO se tira: vale SCORE (`overflowScore`), porque después del
   * tope matar tiene que seguir significando algo. El techo es de la
   * ETAPA (el nivel arranca en 1 en cada una), no de la campaña.
   */
  /**
   * fase 75 — Stage virtual que paga el XP de la run.
   *
   * En Supervivencia `stageId` se queda en 1 (curva del S1) mientras
   * `survivalWave` avanza: usar `stageId` para XP hacía que la oleada 40
   * pagara energía de stage 1. El manager actualiza `survivalWave` al
   * despachar cada ola; éste es el stage que corresponde a esa ola.
   */
  _xpStageNow() {
    return xpStageForRun({
      mode: this.mode,
      survivalWave: this.waveManager?.survivalWave,
      stageId: this.stageId,
    });
  }

  _gainXp(amount) {
    const stage = this._xpStageNow();
    // fase 70/71: la Supervivencia reparte 30 cartas (31 niveles); la
    // campaña y el ∞ se quedan en el tope de etapa. `maxLevel` es la
    // fuente ÚNICA (también la lee el HUD).
    const maxLevel = this.maxLevel;
    const { lv, xp, ups, overflow } = applyXp(
      this.lv, this.xp, amount, stage, maxLevel,
    );
    this.lv = lv;
    this.xp = xp;
    // Al tope no hay umbral que prometer: la barra queda llena (1) y el
    // HUD la rotula "NIVEL MÁX" (hud.js), en vez de un porcentaje mentiroso.
    this.xpFrac = lv >= maxLevel ? 1 : xp / xpForLevel(lv, stage);
    // Un 'levelup' por nivel ganado (un boss puede dar varios): el handler
    // acumula el pendiente y cada uno abre su propia oferta de carta.
    for (const up of ups) this.engine.emit('levelup', { lv: up });
    if (overflow > 0) {
      // El número lo calcula score.js (una sola implementación de la
      // economía); acá sólo se cobra y se ve.
      const puntos = overflowScore(overflow, stage);
      this.score += puntos;
      this.engine.floatText(CONFIG.BASE_X, SCENE.BASE_ARC_Y - 40,
        `NIVEL MÁX · +${puntos} SCORE`, '#FFD24A');
    }
  }

  /** Feedback de LEVEL UP (D14): anillo expansivo desde la base + texto dorado + SFX. */
  _levelUpFeedback(lv) {
    this.audio.sfx('levelup');
    const x = CONFIG.BASE_X;
    const y = SCENE.BASE_ARC_Y;
    this.engine.floatText(x, y - 90, `LEVEL UP · ${lv}`, '#35E0C8');
    this.engine.addEffect({ life: 0.6, draw: (ctx, t) => {
      ctx.save();
      ctx.globalAlpha = t * 0.8;
      ctx.strokeStyle = '#35E0C8';
      ctx.shadowColor = '#35E0C8';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 3;
      // dev-7 fase 28: el anillo arranca FUERA del núcleo de la base
      // (halo de ~44 px), no desde el centro: antes cruzaba el núcleo y
      // lo partía en dos durante el primer frame del efecto.
      ctx.beginPath();
      ctx.arc(x, y, 52 + (1 - t) * 150, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } });
    // Ráfaga dorada celebratoria (dev-6, D14): el nivel se siente premiar.
    this.engine.spawnParticles(x, y, '#FFD24A', 18, {
      speedMin: 90, speedMax: 300, gravity: -30,
      lifeMin: 0.4, lifeMax: 0.8, sizeMin: 1.5, sizeMax: 4,
    });
    this.engine.spawnParticles(x, y, '#35E0C8', 10, {
      speedMin: 60, speedMax: 200, lifeMin: 0.3, lifeMax: 0.6, sizeMin: 1, sizeMax: 2.6,
    });
  }

  /** ORBITAL STRIKE (§2.8): solo con carga completa; reinicia el medidor. */
  _tryFireUltimate() {
    if (!this._playing || this.engine.state !== 'PLAYING') return;
    // fase 69 — condición Apagón: la run no tiene Ultimate. El corte va
    // ANTES de `audio.init()`: tampoco suena el disparo.
    if (this.runMods?.noUlt) return;
    this.audio.init();
    this.audio.resume();
    if (this.fortress.fireUltimate(this)) this.audio.sfx('ultimate');
  }

  /** BLACK HOLE (§2.3): solo en PLAYING y con carga disponible. */
  _tryFireBlackHole() {
    if (!this._playing || this.engine.state !== 'PLAYING') return;
    if (this.runMods?.noUlt) return; // fase 69: Apagón también apaga el vórtice
    this.audio.init();
    this.audio.resume();
    if (this.fortress.fireBlackHole(this)) this.audio.sfx('blackhole');
  }

  // ---------- Bucle de run ----------
  /**
   * Update de alto nivel por frame (orden §1.2): cronómetro + olas +
   * torres + colisiones + HUD con valores REALES (dev-4).
   */
  update(dt) {
    // dev-7 fase 28: el hit-stop se evalúa PRIMERO (si se venció, el
    // mundo vuelve a moverse antes de simular este frame).
    this._updateHitStop();
    const playing = this._playing && this.engine.state === 'PLAYING';
    if (playing && dt > 0) this.timer += dt;

    if (playing && this.waveManager && dt > 0) {
      // Proyectiles antes/después → SFX de disparo (desacoplado de towers)
      const shotsBefore = this._countProjectiles();
      this.waveManager.update(dt, this);
      this.waveManager.checkBossDead();
      collideProjectiles(this.engine, this.fortress.enemies);
      if (this._countProjectiles() > shotsBefore) this.audio.sfx('shot');
      // Poda de la lista viva (los muertos ya explotaron y soltaron evento)
      if (this.fortress.enemies.some((e) => e.dead)) {
        this.fortress.enemies = this.fortress.enemies.filter((e) => !e.dead);
      }
    }

    // Fortress: cooldowns, ráfagas, proyectiles y lluvia orbital (solo jugando).
    // En PAUSA el mundo está CONGELADO (timeScale 0): las torres no se
    // actualizan — si lo hicieran, una torre con el cooldown vencido
    // dispararía en cada frame aunque el juego esté pausado.
    if (playing) this.fortress.update(dt);

    // HUD con datos reales de la economía (§2.6/§2.7/§2.8) + jefe vivo (D11)
    this.stageName ??= 'Normal Stage 1';
    const boss = this.waveManager?.bossRef;
    const bossLive = !!(boss && !boss.dead && this.waveManager.bossSpawned);
    // Capas de música por PRESIÓN (fase 28): la música ya no depende
    // sólo de "hay jefe / hay olas", sino de lo que el jugador está
    // viviendo:
    //   1 = calma (nada en pantalla)
    //   2 = oleada normal (hay enemigos)
    //   3 = jefe en la arena
    //   4 = crítico (la base está por debajo del 35 % o la pantalla
    //       está saturada de enemigos)
    // setIntensity es idempotente: sólo cambia si el nivel cambió.
    this.audio.setIntensity(this._musicIntensity(bossLive));
    // fase 70: el HUD de batalla muestra la OLEADA (no el % de la etapa).
    // El `?.` tolera un HUD que todavía no expone el método.
    if (this.mode === 'survival') {
      this.hud.setSurvivalWave?.(this.waveManager?.survivalWave ?? 0);
    }
    this._flushHealFloat();
    this.hud.render({
      stageName: this.stageName,
      progress: this.waveManager?.progress ?? 0,
      lv: this.lv,
      // fase 71: el tope de nivel depende del modo (21 campaña/∞, 31
      // Supervivencia); sin esto el HUD decía "NIVEL MÁX" antes de tiempo.
      maxLevel: this.maxLevel,
      xpFrac: this.xpFrac,
      timer: this.timer,
      score: this.score,
      mult: this.mult,
      // Velocidad del botón: con el mundo congelado (pausa/cartas) se
      // muestra la velocidad con la que se reanudará (§1.2).
      speed: this.engine.timeScale > 0 ? this.engine.timeScale : this.engine.resumeSpeed,
      ultCharge: this.fortress.ultCharge,
      ultReady: this.fortress.ultReady,
      bhUnlocked: this.fortress.blackHoleUnlocked, // dev-7 fase 12
      bhReady: this.fortress.canFireBlackHole(),
      bhCharge: this.fortress.blackHoleCharge, // 0..1 — medidor por kills (v4 4b/5)
      // dev-7 fase 28: estado de la batalla (lo que el jugador NO veía
      // y sin lo cual no puede juzgar si el stage va bien: cuántos
      // enemigos quedan en pantalla y cuánto daño hace su arsenal).
      // dev-7 fase 43: la tira de estado perdió OLAS y RACHA (duplicaban
      // la barra de progreso del stage y el badge ×N del score), así que
      // ya no mandamos waveIndex/waveTotal/streakMult: nadie los lee.
      enemiesAlive: (this.fortress.enemies ?? []).filter((e) => !e.dead).length,
      dps: this._arsenalDps(),
      // fase 72: las fugas son una estadística; ya no hay presupuesto ni
      // píldor de la regla del 25 %.
      leaks: this._leaks,
      boss: bossLive ? {
        name: boss.data.name,
        hpFrac: boss.hpMax > 0 ? boss.hp / boss.hpMax : 0,
        // dev-7 fase 28: el "×10" era INVENTADO (§2.4/D11 lo copiaba
        // del juego, pero aquí no existe tal multiplicador).
        // La recompensa real de un stage es la misma que en cualquier
        // stage: 60 fragmentos por torreta, ×2 la PRIMERA vez que se
        // clears ese stage. Se muestra ese factor real.
        rewardMul: this.meta?.firstClear?.includes(this.stageId ?? 1) ? 1 : 2,
      } : null,
    });
  }

  /**
   * fase 72 — drena el acumulador de cura al escudo a un float verde.
   * Se llama una vez por frame; si no hay cura o pasó menos de 0,4 s, no
   * hace nada. El `+N` es la cura acumulada desde el último aviso.
   */
  _flushHealFloat() {
    if (!(this._healAcc > 0)) return;
    const now = this.engine?._t ?? 0;
    if (now - this._lastHealFloatAt < 0.4) return;
    const amount = Math.max(1, Math.round(this._healAcc));
    this._healAcc = 0;
    this._lastHealFloatAt = now;
    this.engine.floatText(CONFIG.BASE_X, SCENE.BASE_ARC_Y - 56, `+${amount}`, '#7CFF9A', 1);
  }

  /**
   * Hit-stop (fase 28): congela la simulación `ms` milisegundos.
   *
   * Se usa el `timeScale` del engine a 0 (igual que la pausa) pero SIN
   * tocar el estado de la FSM: el mundo se detiene, el HUD y el shake
   * siguen (el engine usa `dtReal` para eso) y la partida no se pausa de
   * verdad. El restore es idempotente: si el jugador pausa durante el
   * hit-stop, no se descongela nada.
   * @param {number} ms duración del congelamiento
   */
  _hitStop(ms) {
    if (this.engine.state !== 'PLAYING') return;
    if (this._hitStopUntil && performance.now() < this._hitStopUntil) return;
    this._hitStopUntil = performance.now() + ms;
    this.engine.setTimeScale(0);
  }

  /** Restaura el tiempo tras un hit-stop (llamado en cada frame). */
  _updateHitStop() {
    if (!this._hitStopUntil) return;
    if (performance.now() < this._hitStopUntil) return;
    this._hitStopUntil = 0;
    if (this.engine.state === 'PLAYING' && this.engine.timeScale === 0) {
      this.engine.setTimeScale(this.engine.resumeSpeed || 1);
    }
  }

  /**
   * Nivel de intensidad de la música según la PRESIÓN real de la
   * partida (fase 28).
   * @param {boolean} bossLive ¿hay jefe en la arena?
   * @returns {1|2|3|4}
   */
  _musicIntensity(bossLive) {
    const alive = this.fortress.enemies?.length ?? 0;
    const maxHp = this.fortress.maxHp ?? 0;
    const hpFrac = maxHp > 0 ? this.fortress.hp / maxHp : 1;
    if (hpFrac < 0.35 || alive >= 14) return 4;   // crítico
    if (bossLive) return 3;                       // jefe
    if (alive > 0) return 2;                      // oleada
    return 1;                                     // calma
  }

  /**
   * Congela el mundo mientras el panel 🃏 está abierto (fase 28).
   *
   * Antes el panel se abría "encima" de la partida y el mundo seguía
   * simulando: el jugador perdía la base mientras leía sus torres. No
   * se cambia de estado (PAUSED abriría la pantalla de pausa y taparía
   * el panel): sólo se congela el tiempo, igual que hace el modal de
   * cartas.
   */
  _pauseForCombo() {
    if (this.engine.state !== 'PLAYING') return;
    this._comboPaused = true;
    this.engine.setTimeScale(0);
  }

  /** Reanuda el mundo tras cerrar el panel 🃏 (si era el panel quien
   *  lo había congelado). */
  _resumeAfterCombo() {
    if (!this._comboPaused) return;
    this._comboPaused = false;
    if (this.engine.state === 'PLAYING') {
      this.engine.setTimeScale(this.engine.resumeSpeed || 1);
    }
  }

  /**
   * DPS real del arsenal (fase 28): lo que las torres del jugador
   * pueden hacer por segundo con su daño y cadencia ACTUALES (ya
   * escalados por nivel, cartas, perks y meta). El cálculo vive en
   * `hud.js` (`fortressDps`), que distingue las torres de daño
   * continuo (beam, láser) de las de disparo por]].
   * @returns {number} DPS redondeado
   */
  _arsenalDps() {
    const torres = (this.fortress.slots ?? []).filter(Boolean);
    return Math.round(fortressDps(torres));
  }

  /** Proyectiles vivos (balas/misiles): los enemigos no exponen damage. */
  _countProjectiles() {
    let n = 0;
    for (const p of this.engine.entities) {
      if (typeof p.damage === 'number' && !p.dead) n += 1;
    }
    return n;
  }

  /** Datos para la pantalla destino (§2.10); null = plantilla estática. */
  _screenData(state) {
    if ((state === 'STAGE_CLEAR' || state === 'GAME_OVER') && this.summary) {
      return this.summary;
    }
    return null;
  }
}

// ------------------------------------------------------------
// BOOT
// ------------------------------------------------------------
const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('[main] no se encontró #game-canvas');

const engine = new Engine(canvas);
// dev-7 fase 19 (rendimiento — reportado lento en mobile/PC viejas):
// aplica la calidad gráfica guardada ANTES del primer frame. engine.js
// sigue sin importar nada — esto vive acá para no romper esa invariante.
const qualityId = loadQuality();
// dev-7 fase 28: la calidad se aplica a TODOS los contexts del engine
// (el visible y los 3 caches offscreen del fondo/niebla). Antes sólo
// alcanzaba al visible, así que en calidad "baja" el planeta seguía
// haciendo 34 operaciones de shadowBlur por software cada 3 frames.
engine.applyQualityTo(applyQualityToContext, qualityId);
engine.setParticleCap(particleCapFor(qualityId));
// dev-7 fase 29: la calidad también llega a la CAPA DOM (el desenfoque
// de los overlays se apaga en calidad "baja": sin GPU, el blur del modal
// de cartas costaba 34 FPS → 4,6 FPS).
applyQualityToDom(qualityId);
// dev-7 fase 54: el HUD aplica el tema guardado (DOM + tinte de escena).
const hud = new HUD(engine);
const game = new Game(engine, hud);

// dev-7 fase 28: si un frame lanza (un draw() con un campo faltante,
// un nodo del HUD en null...), el engine NO se muere pero hay que
// avisarle al jugador: el juego seguiría con el último frame congelado
// sin explicación.
engine.onFatalError = (err) => {
  const el = document.getElementById('boot-error');
  if (!el) return;
  const msg = document.getElementById('boot-error-msg');
  if (msg) {
    msg.textContent = 'Ocurrió un error inesperado y el juego se detuvo. '
      + 'Recargá la página para seguir jugando. Detalle: '
      + (err?.message ?? String(err));
  }
  el.hidden = false;
};

game.toMenu();   // BOOT → MENU
engine.start();  // loop rAF corre desde ya (escena animada en menú)

// Audio: crear/reanudar el AudioContext en el PRIMER gesto del usuario
// (política de autoplay; §audio.js init()).
const unlockAudio = () => { hud.audio.init(); hud.audio.resume(); };
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

// BUG-010 (v3 4/7): orientación portrait forzada en mobile.
// El aviso #rotate-hint solo aparece con pantalla táctil en landscape
// (media query CSS); acá se alterna .show según la orientación REAL
// (matchMedia cubre resize/rotación aunque el SO no dispare eventos).
const rotateHint = document.getElementById('rotate-hint');
if (rotateHint) {
  const coarseMq = window.matchMedia('(pointer: coarse)');
  const landscapeMq = window.matchMedia('(orientation: landscape)');
  const refreshRotateHint = () => {
    const mostrar = coarseMq.matches && landscapeMq.matches;
    rotateHint.classList.toggle('show', mostrar);
    // dev-7 fase 28: girar el móvil PAUSA la partida. Antes el aviso
    // (position:fixed, z-index 999, opaco) tapaba la pantalla pero el
    // mundo seguía corriendo detrás: al volver a portrait el jugador
    // se encontraba con la base destruida, sin aviso. Ahora el juego
    // queda pausado y se ve la pantalla de pausa al volver.
    if (mostrar && engine.state === 'PLAYING') engine.setState('PAUSED');
  };
  const onOrientChange = () => { refreshRotateHint(); }; // compat legacy
  if (typeof coarseMq.addEventListener === 'function') {
    coarseMq.addEventListener('change', refreshRotateHint);
    landscapeMq.addEventListener('change', refreshRotateHint);
  } else {
    // Safari viejo: API addListener
    coarseMq.addListener?.(refreshRotateHint);
    landscapeMq.addListener?.(refreshRotateHint);
  }
  window.addEventListener('orientationchange', onOrientChange);
  window.addEventListener('resize', refreshRotateHint);
  refreshRotateHint();
}

// dev-7 fase 37: el HUD se adapta al MARCO (no al viewport). El marco
// es `alto × 0,614` de ancho, así que puede quedar más estrecho que los
// 540 px del diseño aunque la ventana sea ancha (landscape, portátil
// chico). Si no se re-mide al redimensionar, el HUD se sale del marco.
window.addEventListener('resize', () => hud.refreshFrameMode());
window.addEventListener('orientationchange', () => hud.refreshFrameMode());

// Exposición mínima para smoke tests headless (no usada por el juego).
// La Fortress viva siempre en window.__GDF__.game.fortress (se recrea
// por stage en startStage()).
window.__GDF__ = { game, engine, hud };

// Fix móvil: la guarda de index.html ya no avisa a los 2,5 s. Al terminar
// el boot, cierra la pantalla de carga y cualquier aviso de error tardío.
window.__gdfBootOk?.();

// ------------------------------------------------------------
// Puente nativo (Android/Capacitor)
// ------------------------------------------------------------
// MainActivity.java llama a window.__gdfBack() desde onBackPressed. Si el
// juego no lo maneja, el nativo manda la app a background (no la cierra).
window.__gdfBack = () => game.handleBack();

// Background/foreground: la partida se pausa y la música se detiene/duckea.
// Al volver, el AudioContext se reanuda pero la partida sigue en pausa.
window.addEventListener(NATIVE_EVENTS.pause, () => {
  if (engine.state === 'PLAYING') engine.setState('PAUSED');
  // En Android no alcanza con duckear: el WebView puede seguir sonando en
  // background. Se corta la música; al volver a jugar se rearma sola.
  hud.audio.setPaused(true);
  hud.audio.stopMusic();
});
window.addEventListener(NATIVE_EVENTS.resume, () => {
  hud.audio.resume();
});
