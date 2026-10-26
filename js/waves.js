// ============================================================
// waves.js — STAGE_WAVES + generador procedural v6 + WaveManager
// (dev-3 → dev-5, §2.5; v6 JK 28-08)
// Olas data-driven por stage: {t, type, count, pattern, x?}.
// Patrones: line (fila), vee (V), rain (X aleatoria), wall (dos
// columnas), burst-diag (fragmentos en diagonal), boss (WARNING
// + jefe). Densidad creciente; ~70% del progreso → WARNING
// "¡BOSS APROXIMANDO!" (2 s) → boss → al matarlo: STAGE_CLEAR.
// Stages 2..5 aplican scaleFor() (§2.4) a cada enemigo normal.
// Recibe referencias por parámetro — jamás importa hud/cards/main.
// ============================================================

import { CONFIG, rand } from './engine.js';
// dev-7 fase 27: ENEMY_TYPES se usa para acotar el pool de la apertura por
// MATABILIDAD real (hp/vel base de cada tipo) — ver openingPoolForStage().
// waves.js ya importaba de enemies.js (Enemy), así que no es un ciclo nuevo.
import { Enemy, ENEMY_TYPES } from './enemies.js';
import { scaleFor } from './stages.js';

/** Duración de WARNING antes de que entre el boss (§2.5/D10). */
export const WARNING_SECONDS = 2;

/**
 * Olas de los stages 1..5 (§2.5/§2.9, tablas manuales fieles).
 * Stage 1 volcánico del diseño base; 2 volcánico oscurecido con
 * esporas/blobs; 3 cementerio (miniBlobs + fragmentos blindados);
 * 4 ciudad nocturna (esporas rápidas); 5 núcleo (densidad máxima).
 * El stage NO termina por timer: termina al matar al boss (§6 D7).
 *
 * ── dev-7 fase 27: MIGRADAS AL FORMATO DE GRUPOS ────────────────
 * Las 5 tablas manuales pasan al MISMO formato que el generador
 * procedural de los stages 6..50 (fase 27):
 *
 *   { t, groups: [{ type, count, pattern }, ...] }
 *
 * (antes: { t, type, count, pattern } — una ola = un solo tipo).
 * Una descarga mixta mezcla tipos con velocidades contrastadas: el
 * grupo 0 va en la franja izquierda (y es el más avanzado) y el 1 en
 * la derecha; cada grupo en su propia franja (WaveManager._spawnGroup).
 * El grupo 0 conserva el tipo (y el patrón) de la ola legacy —la
 * descarga mantiene la identidad de la tabla— y el grupo 1 suma un
 * segundo tipo distinto.
 *
 * REGLAS de la migración:
 *   - el TOTAL de enemigos de cada ola se conserva: es la curva de
 *     dificultad validada en docs/BALANCE.md ("Re-verificación dev-5b" y
 *     "Rebalance v3-2b/7"). Sólo cambia QUÉ enemigos hay en cada
 *     ola. Única excepción: el tope de matabilidad de la apertura;
 *   - los TIEMPOS (t) de las olas no se tocan;
 *   - la ola de jefe sigue siendo un grupo único (caso especial);
 *   - una descarga nunca repite tipo.
 *
 * APERTURA (t < OPEN_T = 40): mismas reglas que el generador
 * procedural, porque el arranque es SOLO-Guardian (Lv1) y lo que
 * entra en los primeros 40 s tiene que PODER MORIR:
 *   - sólo tipos ligeros (spore/fragment/meteor/crystal): nada de
 *     miniBlob/blob, cuyo HP escalado los hace inmortales. Los tanques
 *     que la tabla legacy metía en la apertura (S2 t20/t32, S3
 *     t5/t25/t29, S4 t21/t38) salen y su cuenta la hereda el
 *     meteorito (el tipo pesado que sí es matable);
 *   - sólo patrones del cono (vee/line/burst-diag): nunca rain/wall
 *     (las columnas laterales leakean fuera del cono);
 *   - la 1ª ola es spore en vee ("primer XP garantizado") y hay al
 *     menos un crystal en vee (el bonus de XP);
 *   - TOPE POR ENEMIGO: un grupo de la apertura no puede traer más
 *     enemigos de los que el Guardian Lv1 mata dentro de la ventana
 *     de tiro del enemigo (maxKill = floor((FALL_PX/vel) * DPS / hp),
 *     con HP y velocidad ESCALADOS del stage). Con la cuenta legacy
 *     el cristal de S5 (4) era más de lo que el Guardian puede matar
 *     en su ventana → baja a 3: es el único cambio de cuenta de
 *     todo el tramo de apertura.
 */
export const STAGE_WAVES = {
  // ---- Stage 1 · Volcánico (fiel a reference-stage1.jpg, dev-3) ----
  1: [
    { t: 1.0, groups: [{ type: 'spore', count: 2, pattern: 'vee' }] },     // 1ª ola: spore en vee (primer XP garantizado)
    { t: 4.0, groups: [{ type: 'meteor', count: 3, pattern: 'line' }] },
    { t: 7.0, groups: [{ type: 'fragment', count: 4, pattern: 'burst-diag' }] },
    { t: 10.0, groups: [{ type: 'meteor', count: 2, pattern: 'line' }, { type: 'fragment', count: 2, pattern: 'burst-diag' }] },
    { t: 13.0, groups: [{ type: 'crystal', count: 1, pattern: 'vee' }] },
    { t: 15.0, groups: [{ type: 'meteor', count: 5, pattern: 'line' }] },
    { t: 18.0, groups: [{ type: 'fragment', count: 5, pattern: 'burst-diag' }] },
    { t: 21.0, groups: [{ type: 'crystal', count: 2, pattern: 'vee' }] },
    { t: 23.0, groups: [{ type: 'meteor', count: 6, pattern: 'vee' }] },
    { t: 27.0, groups: [{ type: 'crystal', count: 2, pattern: 'vee' }] },
    { t: 29.0, groups: [{ type: 'meteor', count: 4, pattern: 'line' }, { type: 'fragment', count: 3, pattern: 'burst-diag' }] },
    { t: 32.0, groups: [{ type: 'fragment', count: 5, pattern: 'burst-diag' }] },
    { t: 35.0, groups: [{ type: 'crystal', count: 2, pattern: 'vee' }] },
    { t: 37.0, groups: [{ type: 'meteor', count: 8, pattern: 'vee' }] },
    // Tramo final largo (balance dev-5: objetivo §2.9 ~2.5-3 min en S1)
    { t: 42.0, groups: [{ type: 'fragment', count: 6, pattern: 'burst-diag' }] },
    { t: 46.0, groups: [{ type: 'meteor', count: 6, pattern: 'rain' }, { type: 'fragment', count: 3, pattern: 'burst-diag' }] },
    { t: 50.0, groups: [{ type: 'crystal', count: 3, pattern: 'rain' }] },
    { t: 54.0, groups: [{ type: 'meteor', count: 10, pattern: 'vee' }] },
    { t: 59.0, groups: [{ type: 'fragment', count: 7, pattern: 'burst-diag' }] },
    { t: 63.0, groups: [{ type: 'meteor', count: 7, pattern: 'rain' }, { type: 'fragment', count: 4, pattern: 'burst-diag' }] },
    { t: 69.0, groups: [{ type: 'fragment', count: 8, pattern: 'burst-diag' }] },
    { t: 74.0, groups: [{ type: 'meteor', count: 8, pattern: 'rain' }, { type: 'fragment', count: 4, pattern: 'burst-diag' }] },
    { t: 79.0, groups: [{ type: 'crystal', count: 3, pattern: 'rain' }] },
    { t: 85.0, groups: [{ type: 'meteor', count: 13, pattern: 'vee' }] },
    { t: 91.0, groups: [{ type: 'fragment', count: 9, pattern: 'burst-diag' }] },
    { t: 97.0, groups: [{ type: 'meteor', count: 8, pattern: 'rain' }, { type: 'fragment', count: 5, pattern: 'burst-diag' }] },
    { t: 103.0, groups: [{ type: 'crystal', count: 4, pattern: 'rain' }] },
    { t: 109.0, groups: [{ type: 'fragment', count: 10, pattern: 'burst-diag' }] },
    { t: 115.0, groups: [{ type: 'meteor', count: 9, pattern: 'vee' }, { type: 'fragment', count: 6, pattern: 'burst-diag' }] },
    { t: 123.0, groups: [{ type: 'crystal', count: 4, pattern: 'rain' }] },
    { t: 131.0, groups: [{ type: 'meteor', count: 10, pattern: 'rain' }, { type: 'fragment', count: 6, pattern: 'burst-diag' }] },
    { t: 141.0, groups: [{ type: 'fragment', count: 11, pattern: 'burst-diag' }] },
    // Regresión v6 (AGENTS/TESTING): tras la migración "boss solo en stages
    // 1/10/20/30/40/50" la ola boss de S1 se perdió y el stage cerraba por
    // onWavesDone sin jefe. BOSS = meteorito gigante (del diseño base).
    { t: 151.0, groups: [{ type: 'boss', count: 1, pattern: 'boss' }] },
  ],

  // ---- Stage 2 · Volcánico oscurecido: entran espora y blob ----
  // Rebalance v5 5c: la apertura t1–20 es la ÚNICA ventana de leaks (probe
  // v51: 6/6 leaks a t≈13.6, Guardian Lv.1-2). El lead + 920 px/s redujo
  // los leaks 19.4→8.8 y S2 pasó a 99% HP fin; el daño a base = hp restante
  // (enemies.js) con invuln 0.4 s: harina de spores a 1 hp no daña → la
  // palanca son enemigos que llegan con HP ALTO (meteoritos y blob temprano).
  2: [
    { t: 1.0, groups: [{ type: 'spore', count: 6, pattern: 'vee' }] },
    { t: 5.0, groups: [{ type: 'meteor', count: 4, pattern: 'line' }, { type: 'spore', count: 3, pattern: 'vee' }] },
    { t: 9.0, groups: [{ type: 'spore', count: 7, pattern: 'vee' }] },
    { t: 13.0, groups: [{ type: 'crystal', count: 1, pattern: 'vee' }] },
    { t: 16.0, groups: [{ type: 'fragment', count: 6, pattern: 'burst-diag' }] },
    { t: 20.0, groups: [{ type: 'meteor', count: 2, pattern: 'line' }] },   // tanques tempranos → meteoritos (blob no es matable en la apertura)
    { t: 24.0, groups: [{ type: 'spore', count: 6, pattern: 'vee' }] },
    { t: 28.0, groups: [{ type: 'meteor', count: 3, pattern: 'line' }, { type: 'spore', count: 2, pattern: 'vee' }] },
    { t: 32.0, groups: [{ type: 'meteor', count: 2, pattern: 'line' }] },  // ídem: el blob de apertura sale
    { t: 36.0, groups: [{ type: 'spore', count: 8, pattern: 'vee' }] },
    { t: 40.0, groups: [{ type: 'crystal', count: 2, pattern: 'rain' }] },
    { t: 43.0, groups: [{ type: 'fragment', count: 6, pattern: 'burst-diag' }] },
    { t: 47.0, groups: [{ type: 'spore', count: 8, pattern: 'vee' }] },
    { t: 51.0, groups: [{ type: 'blob', count: 2, pattern: 'wall' }] },     // el blob vuelve ya fuera de la apertura:ola en su propio
    // Tramo final extendido (balance dev-5)
    { t: 56.0, groups: [{ type: 'meteor', count: 4, pattern: 'rain' }, { type: 'spore', count: 2, pattern: 'vee' }] },
    { t: 60.0, groups: [{ type: 'fragment', count: 7, pattern: 'burst-diag' }] },
    { t: 64.0, groups: [{ type: 'spore', count: 10, pattern: 'vee' }] },
    { t: 68.0, groups: [{ type: 'crystal', count: 3, pattern: 'rain' }] },
    { t: 72.0, groups: [{ type: 'blob', count: 2, pattern: 'wall' }] },
    // Tramo final largo (balance dev-5: objetivo §2.9 ~3 min/stage)
    // Rebalance v4 4a: +densidad por el Guardian rápido (0.23 s / 780 px/s)
    { t: 78.0, groups: [{ type: 'meteor', count: 5, pattern: 'rain' }, { type: 'spore', count: 3, pattern: 'vee' }] },
    { t: 83.0, groups: [{ type: 'fragment', count: 9, pattern: 'burst-diag' }] },
    { t: 88.0, groups: [{ type: 'spore', count: 16, pattern: 'vee' }] },
    { t: 93.0, groups: [{ type: 'crystal', count: 3, pattern: 'rain' }] },
    { t: 99.0, groups: [{ type: 'blob', count: 5, pattern: 'wall' }] },
    { t: 105.0, groups: [{ type: 'meteor', count: 6, pattern: 'rain' }, { type: 'spore', count: 4, pattern: 'vee' }] },
    { t: 111.0, groups: [{ type: 'spore', count: 18, pattern: 'vee' }] },
    { t: 117.0, groups: [{ type: 'crystal', count: 4, pattern: 'rain' }] },
    { t: 124.0, groups: [{ type: 'blob', count: 5, pattern: 'wall' }] },
    { t: 131.0, groups: [{ type: 'fragment', count: 11, pattern: 'burst-diag' }] },
    { t: 138.0, groups: [{ type: 'spore', count: 20, pattern: 'rain' }] },
    { t: 146.0, groups: [{ type: 'blob', count: 5, pattern: 'wall' }] },
  ],

  // ---- Stage 3 · Cementerio espacial: miniBlobs + fragmentos blindados ----
  3: [
    { t: 1.0, groups: [{ type: 'spore', count: 5, pattern: 'vee' }] },     // 1ª ola: spore en vee (primer XP garantizado)
    { t: 5.0, groups: [{ type: 'meteor', count: 2, pattern: 'line' }] },  // miniBlob → meteorito: no es matable en la apertura
    { t: 9.0, groups: [{ type: 'meteor', count: 3, pattern: 'line' }, { type: 'spore', count: 2, pattern: 'vee' }] },
    { t: 13.0, groups: [{ type: 'spore', count: 6, pattern: 'vee' }] },
    { t: 17.0, groups: [{ type: 'crystal', count: 1, pattern: 'vee' }] },
    { t: 21.0, groups: [{ type: 'fragment', count: 6, pattern: 'burst-diag' }] },
    { t: 25.0, groups: [{ type: 'meteor', count: 3, pattern: 'line' }] },  // miniBlob → meteorito (apertura)
    { t: 29.0, groups: [{ type: 'meteor', count: 1, pattern: 'line' }] },  // blob → meteorito (apertura)
    { t: 33.0, groups: [{ type: 'spore', count: 8, pattern: 'vee' }] },
    { t: 37.0, groups: [{ type: 'crystal', count: 2, pattern: 'vee' }] },
    { t: 41.0, groups: [{ type: 'fragment', count: 6, pattern: 'burst-diag' }, { type: 'miniBlob', count: 2, pattern: 'wall' }] },
    { t: 45.0, groups: [{ type: 'miniBlob', count: 3, pattern: 'vee' }] },
    { t: 49.0, groups: [{ type: 'spore', count: 8, pattern: 'vee' }] },
    { t: 53.0, groups: [{ type: 'blob', count: 2, pattern: 'wall' }] },
    { t: 57.0, groups: [{ type: 'crystal', count: 2, pattern: 'rain' }] },
    // Tramo final largo (balance dev-5: objetivo §2.9 ~3.5 min/stage)
    { t: 63.0, groups: [{ type: 'fragment', count: 7, pattern: 'burst-diag' }, { type: 'miniBlob', count: 2, pattern: 'wall' }] },
    { t: 69.0, groups: [{ type: 'miniBlob', count: 4, pattern: 'wall' }] },
    { t: 75.0, groups: [{ type: 'spore', count: 10, pattern: 'vee' }] },
    { t: 81.0, groups: [{ type: 'crystal', count: 3, pattern: 'rain' }] },
    { t: 87.0, groups: [{ type: 'blob', count: 2, pattern: 'wall' }] },
    { t: 94.0, groups: [{ type: 'miniBlob', count: 4, pattern: 'vee' }] },
    { t: 101.0, groups: [{ type: 'spore', count: 12, pattern: 'rain' }] },
    { t: 108.0, groups: [{ type: 'crystal', count: 3, pattern: 'rain' }] },
    { t: 115.0, groups: [{ type: 'blob', count: 3, pattern: 'wall' }] },
    { t: 122.0, groups: [{ type: 'miniBlob', count: 5, pattern: 'vee' }] },
    { t: 129.0, groups: [{ type: 'fragment', count: 8, pattern: 'burst-diag' }, { type: 'miniBlob', count: 2, pattern: 'wall' }] },
    { t: 137.0, groups: [{ type: 'spore', count: 14, pattern: 'vee' }] },
    { t: 145.0, groups: [{ type: 'crystal', count: 4, pattern: 'rain' }] },
    // v6: sin ola boss (los stages con jefe son 1/10/20/30/40/50; la ola
    // 'boss' de dev-5 quedó fuera de la migración — cerraba con un jefe
    // genérico fantasma mientras isBossStage(3) era false).
  ],

  // ---- Stage 4 · Ciudad nocturna: esporas veloces (vel×1.5 vía data) ----
  4: [
    { t: 1.0, groups: [{ type: 'spore', count: 6, pattern: 'vee' }] },
    { t: 6.0, groups: [{ type: 'fragment', count: 3, pattern: 'burst-diag' }, { type: 'spore', count: 2, pattern: 'vee' }] },
    { t: 11.0, groups: [{ type: 'meteor', count: 3, pattern: 'line' }, { type: 'spore', count: 2, pattern: 'vee' }] },
    { t: 16.0, groups: [{ type: 'spore', count: 8, pattern: 'vee' }] },
    { t: 21.0, groups: [{ type: 'meteor', count: 2, pattern: 'line' }] },  // miniBlob → meteorito: no es matable en la apertura
    { t: 26.0, groups: [{ type: 'crystal', count: 1, pattern: 'vee' }] },
    { t: 30.0, groups: [{ type: 'spore', count: 9, pattern: 'vee' }] },
    { t: 34.0, groups: [{ type: 'fragment', count: 4, pattern: 'burst-diag' }, { type: 'spore', count: 3, pattern: 'vee' }] },
    { t: 38.0, groups: [{ type: 'meteor', count: 2, pattern: 'line' }] },  // blob → meteorito (apertura)
    { t: 42.0, groups: [{ type: 'spore', count: 12, pattern: 'rain' }] },
    { t: 46.0, groups: [{ type: 'crystal', count: 2, pattern: 'rain' }] },
    { t: 50.0, groups: [{ type: 'miniBlob', count: 4, pattern: 'vee' }] },
    { t: 54.0, groups: [{ type: 'spore', count: 12, pattern: 'vee' }] },
    { t: 58.0, groups: [{ type: 'fragment', count: 5, pattern: 'burst-diag' }, { type: 'spore', count: 3, pattern: 'vee' }] },
    { t: 62.0, groups: [{ type: 'blob', count: 3, pattern: 'wall' }] },
    // Tramo final largo (balance dev-5: objetivo §2.9 ~4 min/stage)
    { t: 69.0, groups: [{ type: 'spore', count: 14, pattern: 'vee' }] },
    { t: 76.0, groups: [{ type: 'crystal', count: 2, pattern: 'rain' }] },
    { t: 83.0, groups: [{ type: 'miniBlob', count: 4, pattern: 'wall' }] },
    { t: 90.0, groups: [{ type: 'fragment', count: 5, pattern: 'burst-diag' }, { type: 'spore', count: 4, pattern: 'vee' }] },
    { t: 97.0, groups: [{ type: 'spore', count: 16, pattern: 'rain' }] },
    { t: 104.0, groups: [{ type: 'crystal', count: 3, pattern: 'rain' }] },
    { t: 111.0, groups: [{ type: 'blob', count: 3, pattern: 'wall' }] },
    { t: 118.0, groups: [{ type: 'miniBlob', count: 5, pattern: 'vee' }] },
    { t: 125.0, groups: [{ type: 'spore', count: 18, pattern: 'vee' }] },
    { t: 132.0, groups: [{ type: 'crystal', count: 3, pattern: 'rain' }] },
    { t: 139.0, groups: [{ type: 'fragment', count: 6, pattern: 'burst-diag' }, { type: 'spore', count: 4, pattern: 'vee' }] },
    { t: 147.0, groups: [{ type: 'blob', count: 4, pattern: 'wall' }] },
    { t: 156.0, groups: [{ type: 'spore', count: 20, pattern: 'rain' }] },
  ],

  // ---- Stage 5 · Núcleo volcánico: todos + densidad máxima ----
  // Apertura suavizada (rebalance v3-2b/7): con arranque progresivo
  // Guardian-only la apertura vieja mataba al jugador a los ~125 s
  // (meteoritos/blobs ×2.4 HP antes del primer unlock → hambruna de
  // kills → sin XP). Cambios SOLO en t0–74: apertura DENSA pero DÉBIL
  // y concentrada (esporas en vee caen dentro del cono ±60 px de
  // Guardian y mueren de una ráfaga → throughput de XP para llegar a
  // Lv2/Missile rápido; una apertura ESCASA también rompe el balance:
  // sin kills no hay XP), tanques y esporas veloces retrasados tras
  // los umbrales de unlock, cristales (XP+) adelantados. El tramo
  // final largo (t79→boss, densidad máxima del juego) queda INTACTO:
  // S5 sigue siendo el más difícil (§2.9 duración ~4.5 min).
  5: [
    { t: 1.0, groups: [{ type: 'spore', count: 6, pattern: 'vee' }] },
    { t: 7.0, groups: [{ type: 'spore', count: 6, pattern: 'vee' }] },
    { t: 13.0, groups: [{ type: 'spore', count: 8, pattern: 'vee' }] },
    { t: 19.0, groups: [{ type: 'crystal', count: 3, pattern: 'vee' }] },   // cuarteto → trío: el tope de matabilidad del Guardian Lv1
    { t: 25.0, groups: [{ type: 'fragment', count: 4, pattern: 'burst-diag' }, { type: 'spore', count: 1, pattern: 'vee' }] },
    { t: 31.0, groups: [{ type: 'spore', count: 8, pattern: 'vee' }] },
    { t: 37.0, groups: [{ type: 'meteor', count: 3, pattern: 'line' }, { type: 'spore', count: 1, pattern: 'vee' }] },
    { t: 43.0, groups: [{ type: 'crystal', count: 2, pattern: 'vee' }] },
    { t: 49.0, groups: [{ type: 'fragment', count: 5, pattern: 'burst-diag' }, { type: 'spore', count: 1, pattern: 'vee' }] },
    { t: 55.0, groups: [{ type: 'miniBlob', count: 1, pattern: 'vee' }, { type: 'spore', count: 1, pattern: 'vee' }] },
    { t: 61.0, groups: [{ type: 'fragment', count: 3, pattern: 'burst-diag' }, { type: 'spore', count: 7, pattern: 'rain' }] },
    { t: 66.0, groups: [{ type: 'blob', count: 1, pattern: 'line' }] },      // único tanque pre-final
    { t: 71.0, groups: [{ type: 'crystal', count: 1, pattern: 'rain' }] },
    { t: 75.0, groups: [{ type: 'spore', count: 12, pattern: 'vee' }] },
    // Tramo final largo (balance dev-5: objetivo §2.9 ~4.5 min/stage)
    // Rebalance v4 4a: +densidad por el Guardian rápido (0.23 s / 780 px/s)
    { t: 79.0, groups: [{ type: 'crystal', count: 3, pattern: 'rain' }] },
    { t: 86.0, groups: [{ type: 'miniBlob', count: 3, pattern: 'wall' }, { type: 'fragment', count: 1, pattern: 'burst-diag' }] },
    { t: 93.0, groups: [{ type: 'meteor', count: 8, pattern: 'rain' }, { type: 'spore', count: 4, pattern: 'vee' }] },
    { t: 100.0, groups: [{ type: 'fragment', count: 10, pattern: 'burst-diag' }] },
    { t: 107.0, groups: [{ type: 'spore', count: 14, pattern: 'rain' }, { type: 'fragment', count: 4, pattern: 'burst-diag' }] },
    { t: 114.0, groups: [{ type: 'blob', count: 3, pattern: 'wall' }, { type: 'fragment', count: 1, pattern: 'burst-diag' }] },
    { t: 121.0, groups: [{ type: 'crystal', count: 3, pattern: 'rain' }] },
    { t: 128.0, groups: [{ type: 'miniBlob', count: 5, pattern: 'vee' }, { type: 'fragment', count: 1, pattern: 'burst-diag' }] },
    { t: 135.0, groups: [{ type: 'meteor', count: 9, pattern: 'rain' }, { type: 'spore', count: 5, pattern: 'vee' }] },
    { t: 142.0, groups: [{ type: 'fragment', count: 12, pattern: 'burst-diag' }] },
    { t: 149.0, groups: [{ type: 'blob', count: 3, pattern: 'wall' }, { type: 'fragment', count: 1, pattern: 'burst-diag' }] },
    { t: 152.0, groups: [{ type: 'crystal', count: 2, pattern: 'vee' }] },   // centrado: XP farmable de refresco antes del jefe
    { t: 156.0, groups: [{ type: 'spore', count: 16, pattern: 'vee' }, { type: 'fragment', count: 4, pattern: 'burst-diag' }] },
    { t: 164.0, groups: [{ type: 'crystal', count: 5, pattern: 'vee' }] },   // centrado: XP farmable justo antes del jefe
    { t: 172.0, groups: [{ type: 'fragment', count: 10, pattern: 'burst-diag' }, { type: 'spore', count: 3, pattern: 'vee' }] },
  ],
};

/**
 * Jefe por stage (v6, JK 28-08): SOLO stages 1/10/20/30/40/50 —
 * ciclo de jefes: meteorito gigante (1), y luego en cada década
 * blobBoss → graveBlob → armoredBlob → hybridBoss → boss (se repite).
 */
export function bossForStage(id) {
  if (!isBossStage(id)) return null;
  if (id === 1) return 'boss';
  const cycle = ['boss', 'blobBoss', 'graveBlob', 'armoredBlob', 'hybridBoss'];
  // 10→blobBoss, 20→graveBlob, 30→armoredBlob, 40→hybridBoss, 50→hybridBoss
  // (el más fuerte, con su escala ×6.88 del stage — la dificultad crece).
  return cycle[Math.min(Math.floor(id / 10), cycle.length - 1)];
}

/**
 * NOMBRE PROPIO de cada jefe (dev-7 fase 46).
 *
 * Antes todos los jefes se llamaban "BOSS" (o el nombre genérico del
 * tipo: "BLOB VIRUS", "BLINDADO"…): el aviso de jefe y la barra de jefe
 * decían literalmente "BOSS" y el jugador no sabía contra qué se
 * enfrentaba. Ahora CADA stage de jefe tiene su propio nombre, que sigue
 * al TIPO real de ese jefe (`bossForStage`): el stage 1 es un meteorito
 * gigante (roca) y el 10 un blob virus (virus), etc. Ninguno se repite.
 */
export const BOSS_NAMES = {
  1: 'Meteorito Colosal',      // 'boss': meteorito gigante (roca)
  10: 'Blob Rey',               // 'blobBoss': blob virus (virus)
  20: 'Blob Necrótico',         // 'graveBlob': blob necro (virus)
  30: 'Coloso Blindado',        // 'armoredBlob': blindado (roca)
  40: 'Abominación Híbrida',    // 'hybridBoss': híbrido (cuerpo de meteoro)
  50: 'Híbrido Primordial',     // 'hybridBoss': el mismo, en su versión final
};

/**
 * Nombre de reserva para un stage de jefe que no esté en el mapa
 * (la campaña tiene 50 stages: 1/10/20/30/40/50 — todos con nombre).
 */
const BOSS_NAME_FALLBACK = 'Meteorito Errante';

/**
 * NOMBRES DEL MODO INFINITO (fase 67): ciclo de 6 por década sobre los
 * jefes que ya existen (`bossForStage` devuelve hybridBoss para 51+).
 * El fallback repetido hacía que TODOS los jefes del endgame se llamaran
 * "Meteorito Errante" y el jugador no distinguiera una etapa de otra.
 */
const ENDLESS_BOSS_NAMES = [
  'Meteorito Colosal',   // S60
  'Blob Rey',            // S70
  'Blob Necrótico',      // S80
  'Coloso Blindado',     // S90
  'Abominación Híbrida', // S100
  'Híbrido Primordial',  // S110
];

/** Numeración romana de la vuelta del ciclo (hasta X; si no, el número). */
function romanNumeral(n) {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v) || v < 1 || v > 10) return String(n);
  let rest = v;
  let out = '';
  for (const [val, sym] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
    while (rest >= val) { out += sym; rest -= val; }
  }
  return out;
}

/**
 * Nombre del jefe de un stage (dev-7 fase 28; fase 46: nombre PROPIO
 * por stage): lo usan el banner DOM del aviso de jefe ("¡JEFE EN CAMINO!
 * — Meteorito Colosal") y la barra de jefe (.boss-tag) para que el
 * jugador sepa contra qué se trata antes de verlo entrar.
 *
 * 51+ (fase 67): el ciclo de 6 nombres rota por década y la VUELTA se
 * numera (S60 "Meteorito Colosal II", S70 "Blob Rey II", S120
 * "Meteorito Colosal III"), nunca el fallback.
 * @param {number} id stage
 * @returns {string|null} null si el stage no tiene jefe
 */
export function bossNameForStage(id) {
  if (!isBossStage(id)) return null;
  if (id > 50) {
    const k = Math.floor((id - 60) / 10);
    const name = ENDLESS_BOSS_NAMES[((k % 6) + 6) % 6];
    return `${name} ${romanNumeral(2 + Math.floor(k / 6))}`;
  }
  return BOSS_NAMES[id] ?? BOSS_NAME_FALLBACK;
}

/** true si el stage termina con jefe (v6). */
export function isBossStage(id) {
  return id === 1 || id % 10 === 0;
}

// ------------------------------------------------------------
// v6 — GENERADOR PROCEDURAL de olas (stages 6..50, JK 28-08:
// "stages un poco más random, 50 nuevos sin muchos cambios").
// Estructura: apertura suave → cuerpo denso → tramo final; tipos
// pesados intercalados; SIEMPRE determinístico por (stage, seed),
// con seed nueva por run (el mismo stage varía entre partidas).
// ------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------
// Fase 27 — OLAS MIXTAS: una descarga con varios tipos y
// velocidades contrastadas en vez de una hilera del mismo tipo.
//
// FORMATO: una ola puede ser
//   { t, type, count, pattern }                 (viejo: un solo grupo)
//   { t, groups: [{type,count,pattern}, ...] }  (nuevo: descarga mixta)
//
// El normalizador `waveGroups()` traduce las dos formas, así que las
// tablas manuales y el generador procedural conviven sin romperse y el
// resto del código (spawner, tests, probe, simulador) lee siempre por
// acá.
// ------------------------------------------------------------

/**
 * Normaliza una ola a una lista de GRUPOS.
 * - si la ola trae `groups`, se devuelven tal cual;
 * - si no, la ola legacy {type,count,pattern} es un único grupo.
 * Devuelve SIEMPRE un array (posiblemente vacío).
 */
export function waveGroups(wave) {
  if (!wave) return [];
  if (Array.isArray(wave.groups)) {
    return wave.groups.filter((g) => g && g.type);
  }
  if (wave.type) {
    return [{ type: wave.type, count: wave.count ?? 1, pattern: wave.pattern ?? 'rain' }];
  }
  return [];
}

/** Tipos distintos que aparecen en una ola (para tests y diagnóstico). */
export function waveTypes(wave) {
  return [...new Set(waveGroups(wave).map((g) => g.type))];
}

/** Total de enemigos de una ola (suma de los grupos). */
export function waveCount(wave) {
  return waveGroups(wave).reduce((a, g) => a + (g.count ?? 1), 0);
}

/**
 * Bandas de velocidad (fase 27; fase 65: CLASIFICACIÓN, no sorteo). El
 * director ya no sortea descargas por banda — las compone por arquetipo
 * (WAVE_ARCHETYPES) — pero las bandas siguen siendo la definición
 * compartida de "qué es rápido y qué es lento" para medir el contraste
 * de velocidad intra-descarga (tests, sonda y simulador), y las usa el
 * patrón de la apertura.
 *
 * Las velocidades base están en ENEMY_TYPES (enemies.js):
 *   boss 22 · blob 35 · miniBlob 42 · crystal 45 · meteor 60 · spore 90 · fragment 110
 *
 * IMPORTANTE: las bandas son DISJUNTAS (ningún tipo en dos bandas). Con
 * bandas que compartían tipo (spore en "rapido" y "medio"), dos grupos
 * de la misma descarga podían salir del mismo tipo — que es justo la
 * "hilera del mismo tipo" que se quería eliminar.
 *
 * FASE 65: el director ya NO sortea tipos por banda (compone por arquetipo,
 * con ROLES de coste: barato/tanque/veloz), así que estas tablas y
 * `bandSpeed()` son la DEFINICIÓN de "banda de velocidad" que usan la sonda
 * (`scripts/probe-waves.mjs`) y el test de contraste intra-ola
 * (`test-stages.mjs`, fase 65) — no código muerto: si cambia la velocidad
 * de un tipo, esto es lo que hay que actualizar.
 */
export const VEL_BANDS = {
  rapido:  ['fragment'],        // 110 px/s
  medio:   ['spore'],           // 90 px/s
  lento:   ['meteor', 'crystal'], // 60 / 45 px/s
  tanque:  ['miniBlob', 'blob'], // 42 / 35 px/s
};

/**
 * Tope de densidad por ola (fase 27). Antes era 2.6 fijo, que saturaba
 * `density` desde el stage ~16 y hacía inútil la compensación: con el
 * tope en 2.6 el generador metía 0.60 enem/s en S6 contra los 1.19 de
 * la tabla manual de S5, y la curva se invertía.
 * Fase 65: sigue siendo el tope de la densidad crítica del presupuesto
 * (classicDensity), con el mismo valor calibrado entonces.
 */
const DENSITY_CAP = 4.6;

/**
 * Velocidad de una banda (px/s): la del tipo MÁS LENTO de la banda (el
 * que marca el ritmo del grupo).
 */
export function bandSpeed(band) {
  const types = VEL_BANDS[band];
  if (!types?.length) return 0;
  return Math.min(...types.map((t) => ENEMY_TYPES[t]?.vel ?? 0));
}


/**
 * Ventana de apertura (s) del generador procedural (balance v7): mientras
 * t < OPEN_T las olas son farmlandes con el Guardian Lv1 (arranque
 * SOLO-Guardian, §6 decisión 3): tipos ligeros + patrones favoritos del
 * cono (vee/line), sin types pesados ni rain/wall. Es el mismo tratamiento
 * que el fix manual de S5 (ver docs/BALANCE.md v3-2b/7) aplicado a 6..50.
 * Pasada la ventana, el generador clásico queda INTACTO byte a byte.
 */
export const OPEN_T = 40;

/** Tipos ligeros farmables de la apertura (nunca miniBlob/blob). */
const OPENING_POOL = ['spore', 'fragment', 'meteor', 'crystal'];

// ------------------------------------------------------------
// Fase 27 — ACOTE DE LA APERTURA POR MATABILIDAD.
//
// El doc (docs/BALANCE.md v7) promete "apertura 100 % farmable" en 6..50: con
// el Guardian Lv1 (8 dmg / 0.23 s = 34.8 DPS) todo lo que entra en la
// apertura tiene que PODER MORIR antes de llegar a la base.
//
// Measured con los valores reales (scaleFor + ENEMY_TYPES):
//   stage 20+ : miniBlob/blob dejan de ser matables
//   stage 40+ : el crystal deja de ser matable
// Es decir, la promesa NO se cumplía: en stage 50 el jugador conseguía
// 2.2 kills por run y NUNCA subía de nivel (probe-s6, 5 semillas).
//
// El corte se calcula, no se hardcodea: un tipo entra al pool de la
// apertura sólo si su tiempo-para-matar cabe en su ventana de tiro.
// ------------------------------------------------------------

/** Velocidad de la bala del Guardian (px/s) — js/towers.js TOWERS.guardian. */
const GUARDIAN_BULLET_SPEED = 920;
/**
 * DPS del Guardian para el criterio de MATABILIDAD de la apertura.
 *
 * Es el del Guardian **Lv1** (8 dmg / 0.23 s = 34.8 DPS), que es con el
 * que el jugador arranca: el Lv1 es lo que dispara durante los primeros
 * segundos de la apertura, y lo que tiene que poder matar lo que entra.
 * (Medido: con el criterio de Lv3 el tope de S30 era 7 esporas — pero el
 * Guardian Lv1 solo mata 4 en su ventana de tiro, así que 3 se escapaban
 * por ola y el XP se perdía. Con Lv1 el tope es el correcto.)
 */
const OPENING_DPS = 8 / 0.23;   // Guardian Lv1 ≈ 34.8 DPS

/** Distancia de caída (px): de SPAWN_Y hasta la base. */
const FALL_PX = 900;

/**
 * Nivel del jugador a partir de la XP acumulada (fase 28).
 * Réplica de `xpForLevel(n)` de js/score.js: 60 + 45×(n−1), pero el
 * UMBRAL ACUMULADO: para llegar al Lv2 hay que reunir xpForLevel(2) =
 * 105 XP, al Lv3 xpForLevel(2)+xpForLevel(3) = 255, etc.
 *
 * waves.js no importa score.js (evita una dependencia nueva); si la
 * fórmula de XP cambiara, este helper hay que actualizar con ella.
 *
 * OJO (fase 28): el primer umbral es 105, NO 60. Con 60 el jugador
 * subía de nivel medio stage antes de tiempo y la apertura metía grupos
 * más grandes de los que el Guardian podía matar en su ventana.
 */
function levelForXp(xp) {
  let lvl = 1;
  let need = 105;                     // xpForLevel(2) = 60 + 45×1
  while (xp >= need && lvl < 60) {
    xp -= need;
    lvl += 1;
    need = 60 + 45 * lvl;             // xpForLevel(lvl + 1)
  }
  return lvl;
}

/**
 * DPS del Guardian para el nivel de jugador dado (fase 28).
 *
 * El Guardian Lv1 hace 8 dmg / 0.23 s = 34.8 DPS. Cada nivel de torreta
 * suma +25 % de daño (js/towers.js Tower.damage): Lv3 = 8×1.5 = 12 dmg →
 * 52.2 DPS.
 *
 * `powerMul` es el MULTIPLICADOR DE META (js/meta.js metaDmgMul): el
 * daño que la torreta hace en la partida. Sin él, el modelo de la
 * apertura asumía SIEMPRE un Guardian Lv1 desnudo — pero un jugador que
 * llega al stage 45 tiene el Guardian en Nvl.41 de meta (×2.5 de daño).
 * Esa diferencia es la que hacía que, en los stages finales, el pool
 * "matable" se degradara a un solo tipo (spore) y la apertura no
 * llegara al piso de XP: el jugador se quedaba en Lv1 y el stage era
 * injugable. Con `powerMul` el modelo usa la potencia REAL.
 */
function guardianDpsForLevel(level, powerMul = 1) {
  return (8 * (1 + 0.25 * Math.max(0, level - 1))) / 0.23 * (powerMul || 1);
}

/**
 * ¿El Guardian (en el nivel `lvl` del jugador) alcanza a matar a este tipo
 * antes de que llegue a la base? (fase 27/28)
 * @param {object} data ENEMY_TYPES[type]
 * @param {number} hpMul escala de HP del stage
 * @param {number} velMul escala de velocidad del stage
 * @param {number} [lvl] nivel del jugador (1 = el del arranque)
 * @param {number} [powerMul] multiplicador de meta del jugador
 */
function isKillableByGuardianLv1(data, hpMul, velMul, lvl = 1, powerMul = 1) {
  if (!data) return false;
  const hp = data.hp * hpMul;
  const vel = data.vel * velMul;
  const ttk = hp / guardianDpsForLevel(lvl, powerMul); // s de daño necesario
  const window_ = FALL_PX / vel;           // s que el blanco tarda en caer
  return ttk <= window_;
}

/**
 * Cuántos enemigos de este tipo puede matar el Guardian (en el nivel `lvl`
 * del jugador) dentro de la ventana de tiro del enemigo (fase 27/28).
 *
 * Es el LÍMITE POR ENEMIGO de la apertura: un grupo más grande que esto
 * se escapa entero (el XP se pierde y la base se lleva todos los leaks).
 *
 * IMPORTANTE (fase 28): el DPS se aplica al TOTAL de la ventana, no a un
 * solo enemigo. El Guardian dispara balas rápidas (920 px/s) al más
 * avanzado, así que durante los 4.5 s que tarda un spore de S50 en caer
 * le mete unas 19 balas: puede matar 2-3 de esos, no 1. Calcularlo como
 * "un enemigo por ventana" dejaba la apertura de S50 con 1 espora por ola
 * (55 XP en 40 s: el jugador nunca llegaba al Lv2).
 */
function maxKillableInOpening(type, hpMul, velMul, lvl = 1, powerMul = 1) {
  const d = ENEMY_TYPES[type];
  if (!d) return 1;
  const hp = d.hp * hpMul;
  const vel = Math.max(1, d.vel * velMul);
  const window_ = FALL_PX / vel;
  return Math.max(1, Math.floor((window_ * guardianDpsForLevel(lvl, powerMul)) / hp));
}

/**
 * Pool de tipos de la apertura para un stage: los ligeros PERO además
 * matables por el Guardian (fase 27).
 *
 * dev-7 fase 28: el pool se recalcula POR OLA según el nivel que el
 * jugador ya alcanzó Y su multiplicador de meta (powerMul). Antes se
 * filtraba una sola vez con el DPS del Lv1 desnudo, así que en los stages
 * finales (donde hpMul es enorme) el pool se degradaba a un solo tipo
 * (spore) y la apertura entregaba 80-95 XP — por debajo del piso, así que
 * el jugador NI SIQUIERA llegaba al Lv2. Ahora: la primera ola se filtra
 * con Lv1 (el jugador empieza así) y cada ola siguiente usa el nivel y la
 * potencia que las XP anteriores le dieron.
 *
 * fase 69: `scale` es la escala EFECTIVA de la etapa (la del stage × el
 * Protocolo/Heat). La apertura tiene que modelar el HP/velocidad que el
 * jugador va a ver de verdad: con Vigor y la escala cruda del stage, el
 * pool se creía más barato de lo que es y el jugador se quedaba en Lv1.
 *
 * @param {number} id stage
 * @param {number} lvl nivel del jugador al llegar a esta ola de la apertura
 * @param {number} [powerMul] multiplicador de meta del jugador
 * @param {{hpMul: number, velMul: number}} [scale] escala efectiva (stage × Protocolo)
 */
function openingPoolForStage(id, lvl = 1, powerMul = 1, scale = scaleFor(id)) {
  const { hpMul, velMul } = scale;
  const pool = OPENING_POOL.filter((t) => {
    const data = ENEMY_TYPES[t];
    return data && isKillableByGuardianLv1(data, hpMul, velMul, lvl, powerMul);
  });
  return pool.length ? pool : ['spore'];
}

/**
 * ¿Este tipo puede aparecer en la apertura? (fase 27) Además de ser
 * matable por el Guardian Lv1, tiene que caber en SU VENTANA DE TIRO:
 * si el Guardian tiene que dedicarle todo el tiempo de caída a ese
 * enemigo, no mata nada más y el resto se escapa (el XP se pierde y el
 * jugador no sube de nivel). Un crystal de 441 HP en S50 ni siquiera es
 * matable (ttk 12.7 s > ventana 9 s) y a partir de S16 ya acapara la
 * ventana aunque se pueda matar.
 *
 * dev-7 fase 28: usa la potencia real del jugador (nivel + meta).
 * fase 69: `scale` es la escala EFECTIVA (stage × Protocolo), ver
 * openingPoolForStage.
 */
function canJoinOpening(type, id, lvl = 1, powerMul = 1, scale = scaleFor(id)) {
  const { hpMul, velMul } = scale;
  const d = ENEMY_TYPES[type];
  if (!d) return false;
  const hp = d.hp * hpMul;
  const vel = Math.max(1, d.vel * velMul);
  const ttk = hp / guardianDpsForLevel(lvl, powerMul);
  const window_ = FALL_PX / vel;
  // Margen de 2×: si el tiempo-para-matar es casi toda la ventana de tiro,
  // el Guardian tiene que dedicarle ese tiempo ENTERO a ese enemigo y no
  // mata nada más — el resto se escapa y el XP se pierde.
  // (El crystal "matable" de S30 —8.9 s contra 11.0 s— ocupaba al
  // Guardian 9 s de cada 11 y el jugador se quedaba en Lv1 para siempre.)
  return ttk * 2 <= window_;
}

/**
 * PRESUPUESTO DE LA APERTURA (fase 27).
 *
 * La apertura NO tiene que "ganar" el stage: tiene que (a) dejar subir
 * al jugador de nivel y (b) no filtrar tanto que la base muera antes de
 * que tenga torres.
 *
 * Lo que estaba MAL (medido): la apertura de S50 metía ~63 enemigos
 * × 59-88 HP = 7 335 HP, contra los 1 391 de daño que el Guardian Lv1
 * puede hacer en 40 s. La mitad se escapaba y el jugador se quedaba en
 * Lv1 para siempre (2.2 kills por run, nunca sube de nivel).
 *
 * El criterio correcto tiene TRES partes:
 *  1. los TIPOS que entran son los matables por el Guardian Lv1
 *     (openingPoolForStage) — así lo que se escapa no se lleva la base;
 *  2. el VOLUMEN se acota por el HP TOTAL que el Guardian puede matar
 *     en los 40 s (no por unidades: 13 meteoritos de 155 HP son 130 XP
 *     que "rentan" pero el Guardian no puede con esa hilera y se
 *     escapan TODOS);
 *  3. la apertura debe entregar XP suficiente para llegar al Lv2.
 */
export function openingHpBudget(id, lvl = 1, powerMul = 1) {
  // Margen sobre la capacidad del Guardian: no mata el 100 % (las
  // balas vuelan ~1 s, hay recargas, apunta al más avanzado y a veces
  // falla el abanico).
  //
  // Es un TOPE, no un objetivo: la apertura se cierra en cuanto entrega
  // el XP mínimo (openingXpFloor) o se agota este presupuesto. Antes el
  // piso de XP se llevaba por delante el presupuesto (la apertura de S30
  // entregaba 2 215 HP con un presupuesto de 1 809) y esa diferencia se
  // escapaba entera: el jugador no subía de nivel y el stage era
  // injugable. Medido con el simulador (16 semillas): 0.8 de margen
  // dejaba a S30 en 0 % de win; 1.3 con la apertura cerrada en el piso
  // de XP deja S30 en 19 % y S20 en 100 % con 62 % de HP final.
  //
  // dev-7 fase 28: el presupuesto es "cuánto daño puede hacer el
  // Guardian en la ventana de apertura", así que escala con SU DPS real
  // (nivel + multiplicador de meta), NO con el hpMul del stage: los
  // enemigos más duros no hacen que la torreta dispare más, sólo que
  // mate menos (de eso se encarga el tope por enemigo).
  //
  // Con powerMul=1 (jugador sin meta) el valor es EXACTAMENTE el de la
  // fase 27 (34.78 DPS × 40 s × 1.3 = 1 809 HP), así que el arranque de
  // la campaña no cambia respecto de lo medido entonces. Con la potencia
  // real (un jugador de Nvl.41 de meta lleva ×2.5) el presupuesto llega
  // a 4 500 HP y la apertura de S45 vuelve a entregar su XP completo.
  return guardianDpsForLevel(lvl, powerMul) * OPEN_T * 1.3;
}

/**
 * XP que la apertura debe entregar para que el jugador llegue al Lv3
 * (y no sólo al Lv2): xpForLevel(2)+xpForLevel(3) = 105 + 150 = 255.
 *
 * Se pide un poco más (315) porque el jugador tiene que llegar al Lv3-4
 * para que las torres que se desbloquean (missile/tesla) valgan la pena:
 * con sólo Lv2 el stage se vuelve un tiroteo de esporas que el Guardian
 * no alcanza. Medido: con 165 XP el jugador se quedaba en Lv2 y los
 * stages 30+ seguían dando timeout.
 *
 * La apertura se CIERRA en cuanto llega a este XP: una apertura más
 * corta es una apertura que el Guardian alcanza a matar entera, y cada
 * enemigo de más es XP que se escapa (el jugador no sube de nivel) y un
 * leak para la base. Medido: S30 pasó de 0 % a 19 % de win.
 *
 * dev-7 fase 28: el piso es alcanzable en TODOS los stages porque la
 * apertura se modela con la potencia real del jugador (powerMul). Antes
 * (modelo Lv1 desnudo) en S45/S50 el pool se degradaba a un solo tipo y
 * la apertura entregaba 80-100 XP: nunca se llegaba ni al Lv2.
 */
function openingXpFloor() {
  return 315;
}


/**
 * Patrón favorito de cada tipo (fase 27): el patrón que mejor le queda
 * al movimiento del tipo. `mixed-*` son los patrones nuevos para grupos
 * dentro de una descarga mixta.
 */
const FAV_PATTERN = {
  spore: 'vee',
  fragment: 'burst-diag',
  meteor: 'line',
  crystal: 'vee',
  miniBlob: 'wall',
  blob: 'wall',
};

// ============================================================
// FASE 65 — EL DIRECTOR DE OLAS: arquetipos, presupuesto de HP,
// curva de presión, biomas por década, crystal garantizado y
// escalonado del spawn.
//
// Antes el tramo clásico (t >= OPEN_T) sorteaba 2-3 BANDAS de
// velocidad y repartía un TOTAL de enemigos (con el coste global
// `MIX_TOTAL_SCALE = 0.58` para TODAS las descargas): todas eran el
// mismo molde, la densidad era plana (un único corte del 20 % en
// t >= 90), el cast no cambiaba de S6 a S50 y el crystal salía por
// lotería (19-32 % de las descargas).
//
// Ahora cada descarga pertenece a un ARQUETIPO que REPARTE un
// PRESUPUESTO DE HP:
//
//   presupuesto = densidad(etapa) × presión(t) × densityMul(arquetipo)
//
// y el arquetipo decide tipos, cantidades, formación y ritmo. El HP
// total por etapa queda dentro del ±10 % de la línea base de la fase
// 64 (test + scripts/probe-waves.mjs) y la variedad de composición
// deja de mover la dificultad: es gratis en balance, que es la razón
// del cambio (ver openspec/specs/gameplay/wave-director/spec.md).
//
// La APERTURA (t < OPEN_T) no entra acá: conserva su modelo propio de
// matabilidad, su piso de XP y sus garantías.
// ============================================================

/**
 * Roles tácticos de un grupo (fase 65): qué tipos del POOL pueden
 * ocupar cada rol. `cualquiera: null` = todo el pool del bioma (el
 * crystal queda fuera siempre: ya tiene su grupo garantizado).
 */
const ROLE_TYPES = {
  barato: ['spore', 'fragment'],            // 8/12 HP: enjambres y arroyos
  tanque: ['miniBlob', 'blob'],             // 160/220 HP: el ancla lenta
  cualquiera: null,                          // el molde lo pone el arquetipo
};

/**
 * ARQUETIPOS DE DESCARGA (fase 65). Cada uno es un MOLDE:
 *  - `desde`: etapa mínima del GENERADOR (las tablas manuales 1..5 usan
 *    el vocabulario completo: son datos escritos a mano, no se filtran);
 *  - `densityMul`: coste táctico del molde, reemplaza al MIX_TOTAL_SCALE
 *    global de la fase 27. Por qué cada uno:
 *      · enjambre ×1,00 — bichos chicos sin aguante: el mismo HP visto
 *        como muchos enemigos se muere con el área, así que no cuesta
 *        nada regalarlo (es el arquetipo "barato" del sistema);
 *      · convoy ×0,55 — un tanque al frente se come los tiros de la torre
 *        (que apunta al MÁS AVANZADO) mientras los ligeros de atrás se
 *        escapan: es el molde más caro de defender y el que motivó el
 *        0,58 global de la fase 27;
 *      · cuña ×0,70 — la punta rápida llega antes y hay que anticiparla,
 *        pero los flancos son lentos y lentos = tiempo de sobra;
 *      · cortina ×0,85 — una fila ancha y débil: entra junta y muere junta;
 *      · goteo ×1,15 — un arroyo de UN tipo es lo que más castiga al que
 *        no tiene DPS sostenido, pero también el que más XP entrega;
 *      · pinza ×0,50 — dos brazos laterales fuera del alcance de una torre
 *        sola: el molde más barato en HP (la mitad) y el más caro en
 *        atención (obliga a reposicionar el foco);
 *      · escolta ×0,70 — el crystal viene protegido por sus escoltas: su
 *        XP cuesta más de lo que el HP sugiere;
 *      · ola de choque ×0,60 — todo de golpe: mata al que esté recargando.
 *  - `flow`: reparte a sus enemigos ≥0,5 s (los arquetipos de arroyo);
 *  - `groups`: plantilla de grupos `{role, budget, pattern, lane?, cap?,
 *    minCount?, stagger?, delay?}`, donde `budget` es la fracción del
 *    presupuesto del molde.
 */
export const WAVE_ARCHETYPES = {
  enjambre: {
    name: 'ENJAMBRE', desde: 6, densityMul: 1.00, flow: true,
    groups: [
      { role: 'barato', budget: 1, pattern: 'vee', lane: 'centro',
        minCount: 12, cap: 40, stagger: [0.06, 0.12] },
    ],
  },
  convoy: {
    name: 'CONVOY', desde: 8, densityMul: 0.55, flow: false,
    groups: [
      { role: 'tanque', budget: 0.50, pattern: 'line', lane: 'centro', cap: 6 },
      { role: 'barato', budget: 0.25, pattern: 'vee', lane: 'izq', cap: 16, delay: [1.5, 2.5] },
      { role: 'barato', budget: 0.25, pattern: 'burst-diag', lane: 'der', cap: 16, delay: [1.5, 2.5] },
    ],
  },
  'cuña': {
    name: 'CUÑA', desde: 6, densityMul: 0.70, flow: true,
    groups: [
      { role: 'barato', budget: 0.30, pattern: 'vee', lane: 'centro',
        minCount: 3, cap: 10, stagger: [0.10, 0.16] },
      { role: 'cualquiera', budget: 0.35, pattern: 'line', lane: 'izq' },
      { role: 'cualquiera', budget: 0.35, pattern: 'line', lane: 'der' },
    ],
  },
  cortina: {
    name: 'CORTINA', desde: 6, densityMul: 0.85, flow: false,
    groups: [
      { role: 'cualquiera', budget: 1, pattern: 'line', lane: 'full', cap: 26 },
    ],
  },
  goteo: {
    name: 'GOTEO', desde: 10, densityMul: 1.15, flow: true,
    groups: [
      { role: 'cualquiera', budget: 1, pattern: 'vee', lane: 'angosta',
        minCount: 2, cap: 24, stagger: [0.50, 0.60] },
    ],
  },
  pinza: {
    name: 'PINZA', desde: 12, densityMul: 0.50, flow: false,
    groups: [
      { role: 'barato', budget: 0.5, pattern: 'line', lane: 'izq' },
      { role: 'barato', budget: 0.5, pattern: 'line', lane: 'der' },
    ],
  },
  escolta: {
    name: 'ESCOLTA', desde: 6, densityMul: 0.70, flow: false,
    groups: [
      { role: 'tanque', budget: 0.60, pattern: 'wall', lane: 'izq', cap: 5 },
      { role: 'barato', budget: 0.40, pattern: 'burst-diag', lane: 'der', cap: 16 },
    ],
  },
  'ola de choque': {
    name: 'OLA DE CHOQUE', desde: 15, densityMul: 0.60, flow: false,
    groups: [
      { role: 'barato', budget: 0.5, pattern: 'line', lane: 'izq', cap: 30 },
      { role: 'cualquiera', budget: 0.5, pattern: 'line', lane: 'der', cap: 30 },
    ],
  },
};

/**
 * Arquetipos LIGEROS: los que se eligen para la "respiración" posterior
 * a una `ola de choque` (design §Decisión 7: tras el pico entra una
 * descarga chica, no otro pico).
 */
const LIGHT_ARCHETYPES = ['cortina', 'cuña', 'escolta'];

/** Nombres de los arquetipos, en orden de catálogo (tests y HUD). */
export const ARCHETYPE_NAMES = Object.keys(WAVE_ARCHETYPES);

/** Etiqueta de arquetipo de una descarga (null si no es del tramo clásico). */
export function archetypeOf(wave) {
  const a = wave?.archetype;
  return a && WAVE_ARCHETYPES[a] ? a : null;
}

/**
 * Sortea el arquetipo de la próxima descarga.
 *
 * REGLAS (design §Decisión 2):
 *  - sólo los arquetipos ya disponibles en la etapa (`desde <= stage`);
 *  - nunca el MISMO que la descarga anterior (regla dura: es lo que el
 *    jugador nota);
 *  - nunca el TERCERO de la ventana de 5 hacia atrás (regla blanda:
 *    máximo 3 re-sorteos y después se acepta, para no sesgar el reparto
 *    hacia los moldes raros);
 *  - tras una `ola de choque` la siguiente es LIGERA (respiración).
 *
 * @param {string[]} hist arquetipos ya usados, en orden
 * @param {() => number} rnd fuente 0..1 inyectable (determinista por semilla)
 * @param {{stage?: number}} [opts]
 * @returns {string} nombre del arquetipo
 */
export function pickArchetype(hist = [], rnd = Math.random, opts = {}) {
  const stage = opts.stage ?? 50;
  const allowed = ARCHETYPE_NAMES.filter((n) => WAVE_ARCHETYPES[n].desde <= stage);
  // El generador real corre 6..50 (las etapas 1..5 son tablas manuales, que
  // usan el vocabulario completo): en esas etapas `desde` no aplica y el
  // sorteo usa todo el catálogo (si no, quedaría un solo arquetipo).
  const pool = allowed.length ? allowed : ARCHETYPE_NAMES;
  const last = hist[hist.length - 1] ?? null;
  // "El tercero de la ventana de 5": el elemento que queda 2 lugares
  // atrás (el 3º de las 5 descargas que terminan en la próxima). Con la
  // regla dura (no el anterior) + esta, es IMPOSIBLE tener 3 iguales en
  // una ventana de 5: con 5 posiciones y sin vecinos repetidos, la única
  // forma de meter 3 es en las posiciones 1ª, 3ª y 5ª — y la 5ª es
  // justamente la que esta regla prohíbe.
  const third = hist[hist.length - 2] ?? null;
  const soft = new Set([third]);
  // Los bichos chicos del arroyo no respiran solos: la respiración es un
  // molde ligero (cortina/cuña/escolta) después del pico.
  const viable = last === 'ola de choque'
    ? (pool.filter((n) => LIGHT_ARCHETYPES.includes(n)).length
      ? pool.filter((n) => LIGHT_ARCHETYPES.includes(n)) : pool)
    : pool;
  // La regla DURA (no repetir el anterior) es innegociable: la spec la
  // exige. La blanda (no el tercero de la ventana) se intenta 3 veces y,
  // si el azar insiste, se toma del conjunto que sí la cumple — nunca se
  // acepta un 3-en-5 (spec: "ni tres veces en una ventana de cinco").
  const hard = viable.filter((n) => n !== last);
  const candidates = hard.length ? hard : viable;
  const free = candidates.filter((n) => !soft.has(n));
  let pick = candidates[(rnd() * candidates.length) | 0];
  for (let i = 0; i < 3 && soft.has(pick) && free.length; i++) {
    pick = candidates[(rnd() * candidates.length) | 0];
  }
  if (soft.has(pick) && free.length) pick = free[(rnd() * free.length) | 0];
  return pick;
}

// ------------------------------------------------------------
// CURVA DE PRESIÓN (design §Decisión 7)
// ------------------------------------------------------------

/** Último nudo de la curva: más allá la marea final se mantiene. */
const CLASSIC_END = 152;

/**
 * Nudos de la curva de presión, sobre el reloj de la etapa:
 *
 *   apertura ×0,65 · base ×1,00 · PICO ×1,25-1,30 al ~35 % del tramo
 *   clásico (~t 58-82) · RESPIRO ×0,62 (~t 88-106) · PICO ×1,25-1,30 al
 *   ~70 % (~t 112-128) · MAREA ×1,35 antes del jefe (t 134+).
 *
 * Los picos y los valles son MESETAS (≥20 s) a propósito: una curva de
 * aguja se promedia sola en la ventana de 20 s con la que se mide el HP
 * generado por ventana — que es la guarda de "la etapa tiene picos y
 * valles" (spec gameplay/wave-director §Presupuesto de HP y curva de
 * presión: ≥2 ventanas de 20 s con ≥1,15× la media y ≥1 con ≤0,75×).
 *
 * Es una REDISTRIBUCIÓN, no un aumento: la media de la curva en la
 * ventana clásica se normaliza a 1,00 (ver PRESSURE_MEAN), así que el HP
 * total por etapa no se mueve — sólo se concentra en dos picos y una
 * marea final, con dos valles donde el jugador respira.
 */
const PRESSURE_KNOTS = [
  [OPEN_T, 0.65],
  [52, 1.00],
  [58, 1.30],
  [82, 1.30],
  [88, 0.62],
  [106, 0.62],
  [112, 1.30],
  [128, 1.30],
  [134, 1.35],
  [CLASSIC_END, 1.35],
];

/** Interpolación lineal entre nudos (cruda, sin normalizar). */
function pressureRaw(t) {
  const k = PRESSURE_KNOTS;
  if (!(t > k[0][0])) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, v0] = k[i - 1];
      const [t1, v1] = k[i];
      return v0 + ((t - t0) / (t1 - t0)) * (v1 - v0);
    }
  }
  return k[k.length - 1][1];
}

/**
 * Media EXACTA de la curva cruda en la ventana clásica (trapecio por
 * tramo). Es el normalizador: dividir por ella deja la media del tramo
 * clásico en 1,00 exactos, así que el presupuesto medio por descarga no
 * cambia respecto del modelo de cuentas de la fase 27/64.
 */
const PRESSURE_MEAN = (() => {
  let area = 0;
  for (let i = 1; i < PRESSURE_KNOTS.length; i++) {
    const [t0, v0] = PRESSURE_KNOTS[i - 1];
    const [t1, v1] = PRESSURE_KNOTS[i];
    area += ((v0 + v1) / 2) * (t1 - t0);
  }
  return area / (CLASSIC_END - OPEN_T);
})();

/**
 * Presión del instante `t` (media 1,00 en el tramo clásico).
 * La apertura no la usa (tiene su propio presupuesto de matabilidad),
 * pero la función la devuelve honestamente: 0,65 por debajo de OPEN_T.
 */
export function pressure(t) {
  return pressureRaw(Number.isFinite(t) ? t : OPEN_T) / PRESSURE_MEAN;
}

// ------------------------------------------------------------
// PRESUPUESTO DE HP POR DESCARGA (design §Decisión 1)
// ------------------------------------------------------------

/** Enemigos medios por descarga del modelo viejo (`2 + rnd()×4`). */
const BUDGET_SLOTS = 4;

/**
 * HP BASE medio por slot, el único dial del presupuesto. Calibrado con
 * scripts/probe-waves.mjs (20 semillas × 8 etapas) para que el HP por
 * etapa quede dentro del ±10 % de la línea base de la fase 64: 4 slots ×
 * densidad(=4,6 en el tope) × 28 ≈ 515 HP base por descarga, que es lo
 * que medía el modelo de cuentas en el S20 (≈10,7 enemigos × 48 HP).
 */
const BUDGET_HP_PER_SLOT = 33;

/** Densidad de la etapa del tramo clásico (fórmula de la fase 27). */
function classicDensity(stage) {
  const id = Math.max(1, Math.trunc(stage) || 1);
  return Math.min(DENSITY_CAP, (1 + 0.10 * (id - 1)) * (id <= 8 ? 2.4 : 1.9));
}

/**
 * CORRECCIÓN DE CALIBRACIÓN del presupuesto por etapa (fase 65).
 *
 * El modelo de cuentas de la fase 27 tenía accidentes que la densidad NO
 * reproduce — el escalón de `densityBase` 2,4 → 1,9 justo en el S9→S10,
 * la mezcla aleatoria de bandas de cada etapa y el corte del tramo final
 * (t ≥ 90, ×0,8) que el director reemplazó por la marea de la curva de
 * presión. Estos factores llevan el HP/etapa de cada etapa al centro de
 * la banda del ±10 % de la línea base de la fase 64.
 *
 * Medidos con `scripts/probe-waves.mjs --seeds=20` (20 semillas por
 * etapa, el mismo instrumento y las mismas semillas que la línea base) y
 * recalculados cada vez que se mueve un `densityMul`, un tope de grupo o
 * los pesos del bioma: son la única ligadura entre el director y la
 * campaña medida.
 */
const BUDGET_FIT = [[1, 1.22], [6, 1.22], [10, 0.97], [20, 1.24], [30, 1.22], [40, 1.04], [50, 1.21]];

/**
 * COLA DEL MODO INFINITO (fase 67): pendiente del presupuesto por etapa
 * sobre el S50. `classicDensity` está topada en 4,6 desde el S37, así que
 * esta cola es el ÚNICO dial de "más enemigos": subir el fit sube
 * enemigos y HP A LA VEZ (el presupuesto se reparte en cantidades con el
 * HP base del tipo, y el hpMul del stage escala después). Se calibra con
 * scripts/probe-waves.mjs y el balance-sim; nunca con las anclas ≤50.
 */
export const ENDLESS_FIT_SLOPE = 0.04;  // +4 % del presupuesto por etapa sobre el S50

/** Término cuadrático opcional de la cola (0 en v1; se enciende si el sim lo pide). */
export const ENDLESS_FIT_QUAD = 0;

/**
 * Factor de calibración de la etapa (interpolado entre anclas).
 *
 * 1..50: interpolación lineal entre las anclas de la campaña, intacta.
 * 51+:  cola del infinito desde el valor del S50 (1,21).
 */
export function budgetFit(stage) {
  const id = Math.max(1, Math.trunc(stage) || 1);
  if (id > 50) {
    const over = id - 50;
    return 1.21 + ENDLESS_FIT_SLOPE * over + ENDLESS_FIT_QUAD * over ** 2;
  }
  const k = BUDGET_FIT;
  if (id <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (id <= k[i][0]) {
      const [s0, v0] = k[i - 1];
      const [s1, v1] = k[i];
      return v0 + ((id - s0) / (s1 - s0)) * (v1 - v0);
    }
  }
  return k[k.length - 1][1];
}

/**
 * PRESUPUESTO DE HP (base, sin `hpMul` del stage) de la descarga que
 * entra en `t`: densidad de la etapa × corrección de calibración × curva
 * de presión. El arquetipo le aplica después su `densityMul`
 * (composeWave).
 *
 * Está en HP BASE a propósito: el hpMul del stage es uniforme, así que
 * las CANTIDADES de la descarga dependen de la etapa y el HP real crece
 * con la escala — el mismo modelo que las cuentas de la fase 27.
 */
export function waveBudget(stage, t) {
  return BUDGET_SLOTS * classicDensity(stage) * budgetFit(stage) * pressure(t) * BUDGET_HP_PER_SLOT;
}

// ------------------------------------------------------------
// BIOMAS POR DÉCADA (design §Decisión 5)
// ------------------------------------------------------------

/**
 * BIOMAS POR DÉCADA (design §Decisión 5). Los números son CUOTAS DE
 * ENEMIGOS (no de HP) declaradas para el pool; el sorteo va por
 * `peso × HP` (ver pickTypeForRole), así que la cuota declarada es la
 * cuota de CONTEOS del pool. La cuota declarada es un PISO del sesgo
 * real: los roles de arrollo (`barato` = espora/fragmento) sólo pueden
 * llevar tipos baratos, así que en la etapa generada la familia con
 * tipos baratos se lleva más conteos de los declarados (medido con
 * scripts/probe-waves --familias: ~+40 % relativo).
 *
 * Cómo queda cada década en la MEDICIÓN (20 semillas, probe-waves; ver
 * `docs/BALANCE.md` §Fase 65):
 *   1-9    espora 48-50 %  (mezcla, tutorial implícito, sin variantes)
 *   10-19  roca   55 %     (roca + virus; el diseño pide "roca/virus" ✓)
 *   20-29  espora 50 %     (espora + cristal ✓)
 *   30-39  roca   52 %     (roca + virus: la década MÁS PESADA por enemigo
 *                           — el virus es el 34 % declarado y se lleva el
 *                           60-70 % del presupuesto con sus blobs)
 *   40-50  espora 50-51 %  (todo, con densidad máxima)
 * (Los números NO se copian a mano en el código: si se recalibra un bioma,
 * hay que volver a medir con la sonda y actualizar este comentario.)
 *
 * OJO — el VIRUS no puede ser la familia dominante en CONTEOS: sus dos
 * tipos son los tanques (miniBlob 160 HP, blob 220 HP), así que un
 * 45-55 % de enemigos-blob obligaría a que el 90 % del presupuesto de HP
 * fuera a 2-3 enemigos por descarga (las cuentas se desplomarían y la
 * guarda del ±10 % de HP/etapa dejaría de ser alcanzable). Su identidad
 * se expresa en la MASA de HP y en los moldes que lo usan (convoy,
 * escolta, los flancos de la cuña): "la década de los blobs" se juega
 * como oleadas menos numerosas y mucho más duras. Ver el reporte de la
 * fase 65 en docs/BALANCE.md.
 *
 * Décadas CONSECUTIVAS nunca comparten familia dominante (espora → roca
 * → espora → roca → espora), y nunca >60 %: el arsenal del jugador se
 * decide por sorteo de cartas (docs/BALANCE.md fase 61/64), así que un bioma
 * demasiado sesgado convertiría la suerte en derrota.
 */
const BIOMES = [
  { hasta: 9, familias: { spore: 50, rock: 22, virus: 14, crystal: 14 } },
  { hasta: 19, familias: { rock: 35, virus: 24, spore: 20, crystal: 21 } },
  { hasta: 29, familias: { spore: 36, rock: 30, virus: 26, crystal: 8 } },
  { hasta: 39, familias: { rock: 44, virus: 34, spore: 10, crystal: 12 } },
  { hasta: 50, familias: { spore: 42, virus: 24, rock: 22, crystal: 12 } },
];

/** Reparto de cada familia entre sus tipos (peso relativo). */
const FAMILY_TYPES = {
  rock: [['meteor', 0.45], ['fragment', 0.55]],
  crystal: [['crystal', 1]],
  spore: [['spore', 1]],
  virus: [['miniBlob', 0.5], ['blob', 0.5]],
};

/**
 * Pool de tipos del bioma de la etapa: `[{ type, weight, family }]`.
 *
 * `weight` es la CUOTA DE ENEMIGOS del tipo dentro de la etapa (base
 * 100 = 100 %). El crystal está en el pool por su familia, pero
 * composeWave NUNCA lo sortea: el crystal ya tiene su grupo garantizado
 * en cada descarga (uno solo por descarga, y una descarga no repite
 * tipo).
 *
 * @param {number} stage
 * @returns {Array<{type: string, weight: number, family: string}>}
 */
export function poolForStage(stage) {
  const id = Math.max(1, Math.trunc(stage) || 1);
  const biome = BIOMES.find((b) => id <= b.hasta) ?? BIOMES[BIOMES.length - 1];
  const pool = [];
  for (const [family, famWeight] of Object.entries(biome.familias)) {
    for (const [type, typeWeight] of FAMILY_TYPES[family] ?? []) {
      pool.push({ type, weight: famWeight * typeWeight, family });
    }
  }
  return pool;
}

/** Familia dominante del bioma de una etapa ('rock' | 'virus' | ...). */
export function dominantFamilyForStage(stage) {
  const pool = poolForStage(stage);
  const byFam = new Map();
  for (const p of pool) byFam.set(p.family, (byFam.get(p.family) ?? 0) + p.weight);
  let best = null;
  for (const [fam, w] of byFam) if (!best || w > best[1]) best = [fam, w];
  return best?.[0] ?? null;
}

// ------------------------------------------------------------
// VARIANTES DE ÉLITE (design §Decisión 4 — la MECÁNICA vive en
// js/enemies.js; acá vive la ASIGNACIÓN: cuándo y cuántas)
// ------------------------------------------------------------

/** Década de entrada de cada variante (fase 68: 7 afijos). */
export const VARIANT_DECADES = {
  escudado: 10,
  rapido: 12,
  divisor: 18,
  sanador: 22,
  regenerador: 25,
  acorazado: 30,
  tenaz: 35,
};

/** Proporción máxima de enemigos con variante en UNA descarga. */
export const VARIANT_MAX_FRAC = 0.35;

/** Probabilidad BASE de que una descarga del tramo clásico traiga una élite. */
const VARIANT_CHANCE = 0.7;

/** Techo de la probabilidad de élite en el modo infinito (fase 67). */
const VARIANT_CHANCE_CEIL = 0.85;

/**
 * Probabilidad de élite de una etapa (fase 67).
 *
 * La campaña no cambia (0,70 en 1..50). En el infinito los élites son el
 * dial SECUNDARIO de dificultad: suben +1 punto por etapa hasta el techo
 * de 0,85 (S51 0,71 · S60 0,80 · S65+ 0,85), así que las etapas
 * profundas se llenan de variantes sin tocar el presupuesto.
 *
 * Se redondea a 2 decimales para que los valores de la tabla sean
 * exactos en coma flotante (0,7 + 0,01×10 da 0,7999…).
 *
 * @param {number} stage
 * @returns {number} probabilidad 0..1
 */
export function variantChanceFor(stage) {
  const id = Math.trunc(stage) || 1;
  if (id <= 50) return VARIANT_CHANCE;
  const p = VARIANT_CHANCE + 0.01 * (id - 50);
  return Math.min(VARIANT_CHANCE_CEIL, Math.round(p * 100) / 100);
}

/**
 * Variantes permitidas en una etapa: ninguna antes del S10, y cada una
 * desde su década de entrada (el bestiario del HUD explica las tres).
 * @param {number} stage
 * @returns {string[]} ids ('escudado' | 'rapido' | 'regenerador')
 */
export function variantsForStage(stage) {
  const id = Math.trunc(stage) || 1;
  return Object.entries(VARIANT_DECADES)
    .filter(([, desde]) => id >= desde)
    .map(([name]) => name);
}

/** Tope DURO de afijos por grupo (design §Decisión 3: máximo 2). */
const MAX_AFFIXES = 2;

/** Elige un id del pool con un número 0..1 (acota por si rnd() da 1). */
function pickVariant(pool, r) {
  const i = Math.min(pool.length - 1, Math.max(0, (r * pool.length) | 0));
  return pool[i];
}

/**
 * Asigna las variantes de élite de una descarga del tramo clásico.
 *
 * TOPES (spec gameplay/enemy-variants): ≤`maxAffixes` afijos por grupo
 * (1 por defecto — la campaña; 2 desde el Protocolo/Heat, fase 69), nunca
 * el mismo id dos veces, ≤35 % de los enemigos de la descarga, ninguna en
 * la apertura (acá no se llama: la apertura no pasa por el director) y
 * cada variante desde su década. La variante va al grupo MÁS CHICO que
 * quepa en el 35 %, y si ninguno cabe (descargas muy chicas) la descarga
 * va sin élite.
 *
 * Con `maxAffixes: 2` el grupo elige un SEGUNDO id distinto del mismo pool
 * y lo publica en `group.variants = [v1, v2]`; `group.variant` sigue
 * siendo el PRIMERO (compatibilidad). El segundo afijo cae sobre el mismo
 * grupo, así que no cambia el conteo de enemigos ni el 35 % de la descarga.
 * Si el pool tiene menos de 2 ids (S10) no hay segundo y `group.variants`
 * no se publica: `_spawnGroup` lo deriva del `variant` suelto.
 *
 * @param {Array<object>} groups grupos de la descarga (se mutan)
 * @param {number} stage
 * @param {() => number} rnd
 * @param {{maxAffixes?: number, chanceAdd?: number, fracAdd?: number}} [opts]
 *   tope de afijos (default 1), y los DIALES del Protocolo/Heat (fase 69):
 *   `chanceAdd` sube la probabilidad de élite y `fracAdd` el tope del 35 %.
 *   Sin Protocolo ambos son 0 y la campaña queda EXACTA.
 * @returns {string|null} el PRIMER afijo asignado
 */
export function assignVariant(groups, stage, rnd = Math.random, opts = {}) {
  const pedidos = Math.trunc(opts.maxAffixes ?? 1) || 1;
  const maxAffixes = Math.min(MAX_AFFIXES, Math.max(1, pedidos));
  const allowed = variantsForStage(stage);
  const chance = Math.max(0, Math.min(1, variantChanceFor(stage) + (opts.chanceAdd ?? 0)));
  if (!allowed.length || !groups.length || rnd() >= chance) return null;
  const total = groups.reduce((a, g) => a + (g.count ?? 0), 0);
  // El tope de fracción sube con Élites (Heat), con techo propio del 0,9:
  // por encima de eso la descarga sería casi toda élite y el afijo dejaría
  // de leerse como excepción.
  const frac = Math.min(0.9, VARIANT_MAX_FRAC + (opts.fracAdd ?? 0));
  const cap = Math.floor(total * frac);
  // Preferencia: un grupo normal antes que el crystal (la élite escolta
  // al premio, no lo reemplaza).
  let idx = -1;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if ((g.count ?? 0) > cap || g.type === 'crystal') continue;
    if (idx < 0 || g.count < groups[idx].count) idx = i;
  }
  // Reserva: SOLO si ningún grupo de combate cabe en el tope (descargas
  // muy chicas). Acá tampoco entra el crystal: una élite sobre el premio
  // de XP lo vuelve MÁS caro de matar — justo lo contrario de su rol — y
  // contradiría el comentario de arriba. Mejor una descarga sin élite que
  // una élite sobre el premio.
  if (idx < 0) {
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.type === 'crystal' || (g.count ?? 0) > cap) continue;
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  const variant = pickVariant(allowed, rnd());
  groups[idx].variant = variant;
  if (maxAffixes > 1 && allowed.length > 1) {
    const otros = allowed.filter((id) => id !== variant);
    groups[idx].variants = [variant, pickVariant(otros, rnd())];
  }
  return variant;
}

// ------------------------------------------------------------
// ESCALONADO: campos de grupo + agendado PURO (§Decisión 3)
// ------------------------------------------------------------

/** Franjas de spawn (fracción del ancho del canvas). */
const LANES = {
  full: [0, 1],            // todo el ancho (franja del grupo, como la fase 27)
  izq: [0, 0.42],          // tercio izquierdo
  centro: [0.29, 0.71],    // franja central
  der: [0.58, 1],          // tercio derecho
  angosta: [0.40, 0.60],   // franja angosta del goteo
};

/**
 * JITTER de velocidad por enemigo (fase 65): ±7 %. Dentro del mismo tipo
 * conviven velocidades distintas (el pedido: "enemigos... a diferentes
 * velocidades"), y la hilera deja de entrar en bloque. Fuera de la
 * APERTURA, donde el modelo de matabilidad usa la velocidad exacta.
 */
const VEL_JITTER = 0.07;

/** Elige por peso (los pesos ya vienen ponderados por HP). */
function weightedPick(items, weights, rnd) {
  const total = weights.reduce((a, w) => a + w, 0);
  if (!(total > 0)) return items[(rnd() * items.length) | 0] ?? null;
  let roll = rnd() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** Número dentro de un rango [a, b] del molde (o el valor si es fijo). */
const rangeOf = (spec, rnd) => (Array.isArray(spec) ? spec[0] + rnd() * (spec[1] - spec[0]) : spec);

/** Redondeo a 2 decimales: la tabla de olas se lee y se compara mejor. */
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Sortea el tipo de un grupo según su ROL.
 *
 * El pool declara CUOTAS DE ENEMIGOS, así que el sorteo va por
 * `peso × HP`: repartir el presupuesto por ese peso hace que la cuota de
 * enemigos de cada familia se cumpla (un tipo caro se lleva más HP por
 * enemigo, y con el peso crudo dominaría el HP y desaparecería del
 * conteo).
 *
 * `maxHp` es la parte del presupuesto que le toca al grupo: un tipo más
 * caro que su parte no puede entrar (no habría ni para UN enemigo sin
 * pasarse al doble). Si ninguno cabe, entra el más barato disponible —
 * el molde manda, el presupuesto también.
 */
function pickTypeForRole(role, pool, used, rnd, maxHp = Infinity, avoid = []) {
  const allowed = Object.prototype.hasOwnProperty.call(ROLE_TYPES, role)
    ? ROLE_TYPES[role] : null;
  const base = pool.filter((p) => p.type !== 'crystal' && !used.has(p.type)
    && (!allowed || allowed.includes(p.type)));
  if (!base.length) return null;
  const hpBase = (p) => ENEMY_TYPES[p.type]?.hp ?? 1;
  let cand = base.filter((p) => hpBase(p) <= maxHp);
  if (!cand.length) cand = [base.reduce((a, b) => (hpBase(a) <= hpBase(b) ? a : b))];
  const libres = cand.filter((p) => !avoid.includes(p.type));
  if (libres.length) cand = libres;   // la racha se rompe si hay con qué
  const weights = cand.map((p) => p.weight * hpBase(p));
  return weightedPick(cand.map((p) => p.type), weights, rnd);
}

/**
 * SUSTITUTO de un tipo para ROMPER LA RACHA del dominante (fase 65).
 *
 * El sustituto sale del bioma de la etapa y tiene que ser del MISMO RANGO
 * DE COSTE que el tipo al que reemplaza (±2,5× de HP base): un enjambre
 * de 20 esporas (8 HP) no puede convertirse en un tanque de 160 HP — la
 * descarga quedaría con 1 enemigo y su molde (arroyo, ritmo, contraste)
 * dejaría de ser cierto. Nunca devuelve el crystal (tiene su grupo).
 *
 * @returns {string|null} tipo sustituto, o null si no hay ninguno libre
 */
function nextTypeForRun(domType, pool, used) {
  const domHp = ENEMY_TYPES[domType]?.hp ?? 1;
  const libres = pool.filter((p) => p.type !== 'crystal' && !used.has(p.type));
  if (!libres.length) return null;
  const closest = (list) => list
    .slice()
    .sort((a, b) => Math.abs((ENEMY_TYPES[a.type]?.hp ?? 1) - domHp)
      - Math.abs((ENEMY_TYPES[b.type]?.hp ?? 1) - domHp)
      || (a.type < b.type ? -1 : 1))[0].type;
  // Primero el MISMO rango de coste; si no hay (p. ej. la descarga ya
  // lleva los dos baratos), el MÁS BARATO que quede: romper la racha es un
  // MUST de la spec y la cuenta se recalcula por HP, así que el
  // presupuesto de la descarga no se mueve (con un tipo más caro el
  // mínimo de 1 enemigo se pasaría del doble).
  const clase = libres.filter((p) => {
    const hp = ENEMY_TYPES[p.type]?.hp ?? 1;
    return hp >= domHp * 0.4 && hp <= domHp * 2.5;
  });
  if (clase.length) return closest(clase);
  return libres.slice().sort((a, b) => (ENEMY_TYPES[a.type]?.hp ?? 1) - (ENEMY_TYPES[b.type]?.hp ?? 1)
    || (a.type < b.type ? -1 : 1))[0].type;
}

/**
 * Reaplica los topes del MOLDE a los grupos de una descarga del tramo
 * clásico (fase 65). Después de romper una racha de tipo —o de recortar
 * por presupuesto— un grupo puede quedar fuera del rango de su molde (un
 * enjambre de 2, una cortina de 60): el molde manda, porque es lo que
 * garantiza el arroyo de ≥0,5 s y que ninguna descarga sea una placa.
 * Los grupos de crystal no se tocan (su molde es 1, siempre).
 */
function clampToMold(groups, archetype) {
  const arch = WAVE_ARCHETYPES[archetype];
  if (!arch) return;
  let ti = 0;
  for (const g of groups) {
    if (g.type === 'crystal') continue;
    // El molde del grupo es el ÍNDICE con el que se compuso (`moldIdx`,
    // que `composeWave` deja en el grupo). Sin él —tablas manuales 1..5—
    // se cae al orden posicional de siempre. Alinear por índice propio es
    // lo que evita que, cuando `composeWave` omite un grupo (su parte del
    // presupuesto no alcanza), los que quedan hereden el `cap`/`minCount`
    // del molde VECINO.
    const slot = Number.isInteger(g.moldIdx) ? g.moldIdx : ti;
    const tpl = arch.groups[Math.min(slot, arch.groups.length - 1)] ?? {};
    ti += 1;
    if (tpl.cap) g.count = Math.min(g.count, tpl.cap);
    // El piso del molde sólo se aplica a los tipos BARATOS (≤30 HP): con
    // un tipo caro el piso multiplicaría el HP del grupo (ver composeWave).
    if (tpl.minCount && (ENEMY_TYPES[g.type]?.hp ?? 999) <= 30) {
      g.count = Math.max(g.count, Math.min(tpl.minCount, tpl.cap ?? tpl.minCount));
    }
    g.count = Math.max(1, g.count);
  }
}

/**
 * COMPONE una descarga: reparte `budget` (HP base) según el molde del
 * arquetipo y devuelve los GRUPOS `{type, count, pattern, stagger?,
 * delay?, lane?}`. No toca el crystal (el llamador lo reserva aparte) y
 * nunca repite tipo dentro de la descarga.
 *
 * @param {string|object} archetype id del arquetipo o su definición
 * @param {number} budget presupuesto de HP base de la descarga
 * @param {Array<{type,weight,family}>} pool bioma de la etapa
 * @param {() => number} rnd
 * @returns {Array<object>} grupos (vacío si el molde no tiene tipos)
 */
export function composeWave(archetype, budget, pool, rnd = Math.random, opts = {}) {
  const arch = typeof archetype === 'string' ? WAVE_ARCHETYPES[archetype] : archetype;
  if (!arch || !Number.isFinite(budget) || budget <= 0 || !pool?.length) return [];
  const total = budget * (arch.densityMul ?? 1);
  const groups = [];
  const used = new Set();
  // El grupo con la parte más grande del presupuesto es el que va a
  // DOMINAR la descarga (el de más enemigos): si el director viene de una
  // racha de ese mismo tipo, se le pide otro (`opts.avoid`) — así la racha
  // se rompe en la COMPOSICIÓN (sin recortes ni trueques que muevan el HP).
  const domIdx = arch.groups.reduce((best, t, i) => (t.budget > arch.groups[best].budget ? i : best), 0);
  const avoid = Array.isArray(opts.avoid) ? opts.avoid : [];
  for (let gi = 0; gi < arch.groups.length; gi++) {
    const tpl = arch.groups[gi];
    const share = total * tpl.budget;
    const skip = gi === domIdx ? avoid : [];
    const type = pickTypeForRole(tpl.role, pool, used, rnd, share, skip)
      ?? pickTypeForRole(tpl.role, pool, used, rnd, share);
    if (!type) continue;
    used.add(type);
    const hp = ENEMY_TYPES[type]?.hp ?? 30;
    // Un grupo cuya parte no llega a TRES CUARTOS de enemigo no entra: en
    // los valles de la presión (presupuesto chico) es mejor una descarga
    // con menos grupos que meter un tanque de 160 HP donde había 97 — eso
    // multiplicaba por 1,6 el HP del instante (justo al revés del valle) y
    // el redondeo a 1 enemigo no lo arregla.
    if (share < hp * 0.75) {
      used.delete(type);
      continue;
    }
    let count = Math.max(1, Math.round(share / hp));
    if (tpl.cap) count = Math.min(count, tpl.cap);
    // El piso del molde (enjambre 12, goteo 2, punta de la cuña 3) sólo se
    // aplica si CABE en la parte del presupuesto del grupo: con un tipo
    // caro (un goteo de blobs) forzarlo multiplicaría por 4 el HP de la
    // descarga. El arroyo se pierde antes que el presupuesto.
    if (tpl.minCount) {
      const piso = Math.min(tpl.minCount, tpl.cap ?? tpl.minCount);
      if (piso * hp <= share * 1.5) count = Math.max(count, piso);
    }
    // `moldIdx` deja constancia de QUÉ molde del arquetipo produjo el
    // grupo: `clampToMold` (que reaplica topes al final) lo usa para no
    // confundir el molde de un grupo con el del vecino cuando alguno se
    // omitió por presupuesto.
    const g = { type, count, pattern: tpl.pattern ?? FAV_PATTERN[type] ?? 'line', moldIdx: gi };
    if (tpl.lane) g.lane = tpl.lane;
    if (tpl.stagger) g.stagger = round2(rangeOf(tpl.stagger, rnd));
    if (tpl.delay) g.delay = round2(rangeOf(tpl.delay, rnd));
    groups.push(g);
  }
  // AJUSTE FINAL: los grupos chicos redondean a UN enemigo, así que un
  // tanque (160/220 HP) puede pasarse de su parte cuando la descarga es
  // de pocos enemigos. Si el total se pasa del presupuesto (con un 15 %
  // de holgura), se recorta del grupo que más HP aporta — nunca por
  // debajo de 1 enemigo por grupo. Sin esto, una cuña de tanques podía
  // entregar el DOBLE del presupuesto de su instante.
  const hpOfGroup = (g) => (ENEMY_TYPES[g.type]?.hp ?? 0) * g.count;
  const limit = total * 1.15;
  let totalHp = groups.reduce((a, g) => a + hpOfGroup(g), 0);
  while (totalHp > limit) {
    const reducible = groups.filter((g) => g.count > 1);
    if (!reducible.length) break;   // piso: 1 enemigo por grupo
    const big = reducible.reduce((a, b) => (hpOfGroup(b) > hpOfGroup(a) ? b : a));
    big.count -= 1;
    totalHp -= ENEMY_TYPES[big.type]?.hp ?? 0;
  }
  return groups;
}

/**
 * AGENDA de una descarga: `[{at, group, index}]` ordenado por tiempo.
 *
 * Es la fuente de verdad del escalonado y es PURA y determinista (nada
 * de Math.random): dos corridas con la misma tabla dan la misma agenda.
 * `at` es el instante de la etapa en que el enemigo entra:
 *   t de la descarga + delay del grupo + index × stagger del grupo.
 *
 * @param {{t?: number, groups?: Array<object>}} wave
 * @returns {Array<{at: number, group: number, index: number}>}
 */
export function waveSchedule(wave) {
  const groups = waveGroups(wave);
  const t0 = Number.isFinite(wave?.t) ? wave.t : 0;
  const events = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const count = Math.max(1, g.count ?? 1);
    const delay = Number.isFinite(g.delay) ? Math.max(0, g.delay) : 0;
    const stagger = Number.isFinite(g.stagger) ? Math.max(0, g.stagger) : 0;
    for (let i = 0; i < count; i++) {
      events.push({ at: round2(t0 + delay + i * stagger), group: gi, index: i });
    }
  }
  events.sort((a, b) => (a.at - b.at) || (a.group - b.group) || (a.index - b.index));
  return events;
}

// ------------------------------------------------------------
// ARQUETIPOS DE LAS TABLAS MANUALES 1..5 (fase 65)
// ------------------------------------------------------------

/**
 * ARQUETIPO DEL TRAMO CLÁSICO de cada tabla manual: índice de la ola en
 * `STAGE_WAVES[id]` → arquetipo.
 *
 * Las tablas manuales conservan sus TIEMPOS, TIPOS, PATRONES y CONTEOS
 * (los fija test-stages: es la curva de dificultad validada en
 * docs/BALANCE.md, "Re-verificación dev-5b" y "Rebalance v3-2b/7"). Lo que
 * agrega esta tabla es la ETIQUETA del molde que cada descarga YA
 * cumple —para que el HUD anuncie lo que entra y la sonda pueda medir la
 * variedad— y el ESCALONADO de ese molde (`stagger`/`delay` del mismo
 * template que usa el generador), que es lo que convierte la placa en
 * arroyo.
 *
 * Las tablas usan el VOCABULARIO COMPLETO: `desde` es la puerta del
 * GENERADOR (stages 6..50), no de los datos escritos a mano. En S1 —sin
 * tanques en la tabla— no hay convoy ni escolta, así que su variedad
 * sale de enjambre / cuña / goteo / cortina.
 *
 * La apertura (t < OPEN_T) NO se etiqueta: no pasa por el director.
 */
const MANUAL_ARCHETYPES = {
  // S1: fragmentos y meteoritos alternados + los tríos de cristales.
  1: {
    14: 'enjambre', 15: 'cuña', 16: 'goteo', 17: 'cortina',
    18: 'enjambre', 19: 'cuña', 20: 'enjambre', 21: 'cuña', 22: 'goteo',
    23: 'cortina', 24: 'enjambre', 25: 'cuña', 26: 'goteo', 27: 'enjambre',
    28: 'cuña', 29: 'goteo', 30: 'cuña', 31: 'enjambre',
  },
  // S2: esporas (arroyo/marea), blobs (formación pesada) y mixtas.
  2: {
    10: 'goteo', 11: 'enjambre', 12: 'cortina', 13: 'cuña', 14: 'convoy',
    15: 'enjambre', 16: 'cortina', 17: 'goteo', 18: 'cuña', 19: 'convoy',
    20: 'enjambre', 21: 'ola de choque', 22: 'goteo', 23: 'cuña',
    24: 'convoy', 25: 'ola de choque', 26: 'goteo', 27: 'cuña',
    28: 'enjambre', 29: 'ola de choque', 30: 'cuña',
  },
  // S3: cementerio — el convoy (tanque + ligero) es el molde natural.
  3: {
    10: 'convoy', 11: 'cortina', 12: 'enjambre', 13: 'cuña', 14: 'goteo',
    15: 'convoy', 16: 'cortina', 17: 'enjambre', 18: 'goteo', 19: 'cuña',
    20: 'ola de choque', 21: 'goteo', 22: 'cortina', 23: 'cuña',
    24: 'cortina', 25: 'convoy', 26: 'ola de choque', 27: 'goteo',
  },
  // S4: ciudad nocturna — esporas veloces (marea y arroyo) y pinzas.
  4: {
    9: 'goteo', 10: 'cortina', 11: 'cuña', 12: 'ola de choque', 13: 'pinza',
    14: 'cortina', 15: 'ola de choque', 16: 'goteo', 17: 'cuña', 18: 'pinza',
    19: 'ola de choque', 20: 'goteo', 21: 'cortina', 22: 'cuña',
    23: 'ola de choque', 24: 'goteo', 25: 'pinza', 26: 'cortina',
    27: 'ola de choque',
  },
  // S5: densidad máxima — todos los moldes, con los cristales en goteo.
  5: {
    7: 'goteo', 8: 'pinza', 9: 'convoy', 10: 'enjambre', 11: 'cortina',
    12: 'goteo', 13: 'ola de choque', 14: 'goteo', 15: 'convoy', 16: 'cuña',
    17: 'enjambre', 18: 'ola de choque', 19: 'convoy', 20: 'goteo',
    21: 'convoy', 22: 'cuña', 23: 'enjambre', 24: 'convoy', 25: 'goteo',
    26: 'ola de choque', 27: 'goteo', 28: 'pinza',
  },
};

/** Valor representativo (media) de un rango de template, o null. */
const meanOfRange = (spec) => (Array.isArray(spec) ? (spec[0] + spec[1]) / 2 : (spec ?? null));

/**
 * Decora las tablas manuales con el arquetipo y su escalonado. Es PURA
 * (sin `Math.random`): los rangos del template entran por su media, así
 * que la tabla sigue siendo determinista byte a byte entre runs.
 * Los grupos se mapean por índice con el template del arquetipo (el
 * último del template cubre a los grupos de más).
 */
function tagManualWaves() {
  for (const [id, tags] of Object.entries(MANUAL_ARCHETYPES)) {
    const table = STAGE_WAVES[id];
    if (!table) continue;
    for (const [idx, name] of Object.entries(tags)) {
      const wave = table[Number(idx)];
      const arch = WAVE_ARCHETYPES[name];
      if (!wave || !arch || wave.t < OPEN_T) continue;
      wave.archetype = name;
      waveGroups(wave).forEach((g, i) => {
        const tpl = arch.groups[Math.min(i, arch.groups.length - 1)] ?? {};
        const stagger = meanOfRange(tpl.stagger);
        const delay = meanOfRange(tpl.delay);
        if (stagger) g.stagger = round2(stagger);
        if (delay) g.delay = round2(delay);
      });
    }
  }
}

tagManualWaves();

/**
 * Genera la tabla de olas de un stage 6..50. seed por RUN (varía en cada
 * partida). Si el stage es de jefe, la última ola es el WARNING→boss
 * (cada 10 stages).
 *
 * dev-7 fase 27: cada ola es una DESCARGA MIXTA de 2-3 GRUPOS con tipos
 * (y por lo tanto velocidades) contrastados, en vez de una hilera de un
 * solo tipo. Reglas:
 *   - nunca 3+ olas seguidas con el mismo tipo dominante;
 *   - la ola N no repite el patrón dominante de la N-1;
 *   - toda descarga del tramo clásico lleva ≥1 crystal (garantizado);
 *   - la apertura usa sólo tipos matables por el Guardian del jugador
 *     (openingPoolForStage) y NUNCA rain/wall.
 *
 * dev-7 fase 28: `opts.powerMul` es el MULTIPLICADOR DE META del jugador
 * (js/meta.js metaDmgMul del Guardian). El modelo de la apertura usaba
 * siempre un Guardian Lv1 desnudo, así que en los stages finales el pool
 * "matable" se degradaba a un solo tipo y la apertura no llegaba al piso
 * de XP. Con la potencia real, la apertura se modela como el jugador la
 * va a vivir. Por defecto 1 (sin meta) → el arranque de la campaña
 * conserva EXACTAMENTE el comportamiento medido en la fase 27.
 *
 * dev-7 fase 65: el TRAMO CLÁSICO (t >= OPEN_T) ya no reparte una CUENTA
 * de enemigos por bandas de velocidad — cada descarga la compone el
 * DIRECTOR (arquetipo + presupuesto de HP + biomas por década + variantes
 * + escalonado). La APERTURA no se toca: sigue byte a byte con su modelo
 * de matabilidad, su piso de XP y sus garantías.
 *
 * fase 69: `opts.runMods` son los diales del Protocolo (js/heat.js
 * heatMods, o null). Entran en la COMPOSICIÓN: Vigor/Prisa en la escala
 * efectiva (apertura incluida), Leva en el presupuesto del tramo clásico,
 * Élites/Doble élite en `assignVariant`. Sin runMods (o con el Protocolo
 * vacío) la etapa es EXACTAMENTE la de la fase 68.
 */
export function generateStageWaves(id, seed, opts = {}) {
  const powerMul = opts.powerMul || 1;
  const rnd = mulberry32((seed >>> 0) ^ (id * 7919));
  const biome = poolForStage(id);      // biomas por década (fase 65)
  const boss = isBossStage(id);
  const tEnd = (boss ? 132 : 118) + Math.floor(rnd() * 36); // ~2-2.8 min
  const waves = [];
  // dev-7 fase 27: presupuesto de la apertura. Se acota por el HP TOTAL
  // que el Guardian Lv1 puede matar en 40 s (ver openingHpBudget) y se
  // exige un mínimo de XP para que el jugador llegue al Lv2: la
  // apertura se CIERRA en cuanto se cumple uno de los dos (piso de XP o
  // presupuesto de HP), de modo que lo que entra es lo que el Guardian
  // alcanza a matar.
  // fase 69 (Protocolo/Heat): la escala EFECTIVA de la etapa es la del
  // stage × los diales de Vigor (`hpMul`) y Prisa (`velMul`). Se usa en
  // TODO el modelo de la etapa, apertura incluida: si la apertura se
  // modelara con la escala cruda, con Vigor elegiría tipos que el
  // Guardian no alcanza a matar y el jugador se quedaría en Lv1.
  const rm = opts.runMods ?? null;
  const baseScale = scaleFor(id);
  const hpMul = baseScale.hpMul * (rm?.hpMul ?? 1);
  const velMul = baseScale.velMul * (rm?.velMul ?? 1);
  const scale = { hpMul, velMul };
  // dev-7 fase 28: contabilidad de la apertura en dos contadores
  // ACUMULADOS, en vez de un "restante" que se iba descontando.
  //  - openHpSpent: HP ya comprometido a la apertura. El presupuesto
  //    restante se DERIVA (openingHpBudget - openHpSpent) porque el
     //    presupuesto crece con el nivel que el jugador alcanza.
  //  - openXpEarned: XP ya comprometida a la apertura (o sea, la que el
  //    jugador SE GANA si mata lo que entra). Antes el cierre de la
  //    apertura miraba un "openXpLeft" que se descontaba por adelantado al
  //    RESERVAR el crystal (40 XP + 25 de holgura): eso hacía que el piso
  //    real fuera 40 en vez de 105, y la apertura de S45 se cerraba con
  //    100 XP (el jugador nunca llegaba al Lv2).
  let openHpSpent = 0;
  const openXpTarget = openingXpFloor();
  // dev-7 fase 28: el nivel del jugador DENTRO de la apertura. El
  // Guardian empieza en Lv1, pero cada kill da XP: al cabo de unas
  // olas ya es Lv2-3 y su DPS es bastante mayor. El pool de tipos
  // matables y el tope por enemigo se recalculan con ese nivel, para que
  // la apertura sea consistente con lo que el jugador puede matar de
  // verdad en ese momento (y no se degrade a un solo tipo en los stages
  // finales, donde el hpMul es enorme).
  let openPlayerLevel = 1;
  let openXpEarned = 0;
  /** HP que le queda al presupuesto de la apertura (se deriva del nivel). */
  const openHpRemaining = () =>
    Math.max(0, openingHpBudget(id, openPlayerLevel, powerMul) - openHpSpent);
  // Crystal reservado para la 2ª ola de la apertura (fase 27): se
  // descuenta del presupuesto en la ola 0 y se agrega en la siguiente.
  let pendingCrystal = 0;
  let t = 0.8 + rnd() * 1.6;
  let idx = 0;
  let crystalPlaced = false; // garantía: ≥1 cristal (XP+) dentro de la apertura
  let lastDominant = null;   // para no repetir el tipo dominante 3+ veces
  let dominantRun = 0;
  let lastPattern = null;    // la ola N no repite el patrón de la N-1
  const archHist = [];       // historial de arquetipos del tramo clásico (fase 65)

  while (t < tEnd) {
    const isOpening = t < OPEN_T;
    // dev-7 fase 27: la ola de la APERTURA se reparte por CUENTAS (su
    // modelo es de matabilidad, no de presupuesto): 2-3 enemigos × la
    // densidad de la etapa, con la primera ola a la mitad (la apertura
    // necesita ≥2 olas). El tramo clásico ya no usa `total`: lo compone
    // el DIRECTOR con el presupuesto de HP (fase 65, más abajo).
    let total = Math.max(2, Math.round((2 + rnd() * 3) * classicDensity(id)));
    // dev-7 fase 27: la apertura se acota por el PRESUPUESTO de HP (el
    // Guardian Lv1 no puede matar 60 enemigos en 40 s — la mitad se
    // escapaba y el jugador nunca subía de nivel).
    // La PRIMERA ola, la SEGUNDA ola y el crystal garantizado NO se
    // saltan el cierre: si no, la apertura puede quedarse vacía (test de
    // regresión), con una sola ola o sin el cristal del "primer XP
    // garantizado" (garantía del doc).
    const isFirstWave = idx === 0;
    // El crystal sigue PENDIENTE sólo si todavía se puede garantizar
    // (que el Guardian Lv1 lo mate sin acaparar su ventana de tiro): si
    // ya no cabe, la apertura no se queda esperando un crystal que
    // nunca va a entrar.
    const needsCrystal = isOpening && !crystalPlaced && canJoinOpening('crystal', id, openPlayerLevel, powerMul, scale);
    // La 2ª ola de la apertura está GARANTIZADA (el doc exige ≥2 olas):
    // aunque el presupuesto esté agotado, entra aunque sea con un
    // spore (el más barato). Sin esto, en los stages altos la apertura
    // se quedaba con una sola ola y el jugador no llegaba al Lv2.
    const isSecondOpenWave = isOpening && waves.filter((w) => w.t < OPEN_T).length === 1;
    // La apertura se CIERRA en cuanto se cumple una de las dos reglas:
    //  - el PISO de XP (el jugador ya tiene la experiencia del arranque):
    //    la apertura más corta que da el XP es la mejor apertura, porque
    //    cada enemigo de más es un enemigo que el Guardian Lv1 no alcanza
    //    a matar (el XP se escapa y el jugador no sube de nivel) y un
    //    leak para la base;
    //  - el PRESUPUESTO de HP (lo que el Guardian Lv1 puede matar en los
    //    40 s de la ventana): si se pasa, la apertura se escapa entera.
    // Antes el piso de XP se llevaba por delante el presupuesto (S30
    // entregaba 2 215 HP con un presupuesto de 1 809) y esa diferencia se
    // escapaba siempre: medido, S30 pasó de 0 % a 19 % de win al cerrar
    // la apertura en el piso.
    //
    // La 1ª ola, la 2ª ola y el crystal garantizado NO se saltan el
    // cierre: el doc garantiza ≥2 olas y el crystal del "primer XP
    // garantizado".
    // dev-7 fase 28: el cierre mira el XP REALMENTE entregado
    // (openXpEarned), no un "restante" descontado por adelantado. El
    // criterio es "el jugador ya tiene la experiencia del arranque".
    const hpOk = openHpRemaining() > 0;
    const xpOk = openXpEarned < openXpTarget;
    if (isOpening && (!hpOk || !xpOk) && !isFirstWave && !needsCrystal && !isSecondOpenWave) {
      // Apertura cerrada (XP o presupuesto): no entran más enemigos.
      //
      // dev-7 fase 28: NO se salta el reloj a OPEN_T+0.5. Eso cortaba la
      // apertura de golpe (en S45 la cerraba en t=20 s con 100 XP, por
      // debajo del piso de 105: el jugador nunca llegaba al Lv2). Ahora el
      // reloj avanza normal y el bucle termina solo cuando t pasa de
      // OPEN_T — la apertura se cierra POR EL XP, no por un salto de reloj.
      t += 1.5;
      idx += 1;
      continue;
    }
    // La apertura necesita al menos 2 olas (garantía del doc): la
    // primera no puede vaciar el presupuesto entero.
    const openWaveIdx = waves.filter((w) => w.t < OPEN_T).length;
    if (isOpening && openWaveIdx === 0) {
      total = Math.min(total, Math.max(2, Math.ceil(total / 2)));
    }
    // Reparto de la descarga de la APERTURA entre 1-2 grupos (son
    // descargas más chicas para no comerse la ventana de tiro).
    const groupCount = 1 + ((rnd() < 0.45) ? 1 : 0);
    const groups = [];
    let usedType = null;
    // dev-7 fase 28: el pool de la apertura se recalcula con el nivel
    // que el jugador YA alcanzó (las XP de las olas anteriores de la
    // apertura). Sin esto, en los stages finales el pool se degradaba a
    // un solo tipo y la apertura entregaba menos XP que el piso.
    const openPool = isOpening
      ? openingPoolForStage(id, openPlayerLevel, powerMul, scale)
      : null;

    // dev-7 fase 27 — REGLA de XP: la apertura garantiza UNA vez el crystal
    // del "primer XP garantizado" (en 'vee', centrado en el cono del
    // Guardian). Va en un grupo APARTE, nunca en la ola 0 (que debe ser
    // spore/vee: el test de "primer XP garantizado" lo exige).
    // Se RESERVA su XP en el presupuesto desde el principio.
    if (isOpening && !crystalPlaced && !isFirstWave && canJoinOpening('crystal', id, openPlayerLevel, powerMul, scale)) {
      const cXp = ENEMY_TYPES.crystal?.score ?? 40;
      const cHp = (ENEMY_TYPES.crystal?.hp ?? 60) * hpMul;
      // Como máximo la mitad del presupuesto de HP: si el crystal se lo
      // come todo, la apertura se queda sin enemigos matables.
      const cBudget = openHpRemaining() * 0.5;
      const n = Math.max(1, Math.min(2, Math.floor(cBudget / Math.max(1, cHp))));
      // El crystal también respeta el límite por enemigo (si no, un
      // crystal de 441 HP en S50 es inmortal y el XP se pierde).
      const cap = maxKillableInOpening('crystal', hpMul, velMul, openPlayerLevel, powerMul);
      if (cap >= 1) {
        const cnt = Math.min(n, cap);
        groups.push({ type: 'crystal', count: cnt, pattern: 'vee' });
        crystalPlaced = true;
        openHpSpent += cHp * cnt;
        openXpEarned += cXp * cnt;
      }
    } else if (isOpening && !crystalPlaced && isFirstWave) {
      // En la ola 0 el crystal se RESERVA para la 2ª ola: se descuenta
      // del presupuesto ahora y se agrega después. Además se reserva
      // espacio para que la 2ª ola tenga enemigos propios (la apertura
      // necesita ≥2 olas: garantía del doc).
      // OJO: solo si el crystal es matable en este stage (en S40+ no lo
      // es — meterlo haría perder el XP y el jugador no sube de nivel).
      if (canJoinOpening('crystal', id, openPlayerLevel, powerMul, scale)) {
        const cHp = (ENEMY_TYPES.crystal?.hp ?? 60) * hpMul;
        // crystal + holgura para la 2ª ola. El XP NO se descuenta aquí:
        // se cuenta cuando el crystal entra de verdad (fase 28).
        openHpSpent += cHp + 40;
        pendingCrystal = 1;
      }
    }

    // ---- APERTURA: composición legacy (no se toca) -----------------
    let waveArchetype = null;   // etiqueta del arquetipo (sólo tramo clásico)
    /**
     * Grupo DOMINANTE de la descarga (el de más enemigos; empate: el
     * primero). En el TRAMO CLÁSICO el crystal queda fuera del cálculo:
     * es un premio de 1 enemigo, no un tipo que pueda dominar una ola —
     * si contara, una descarga de cristales haría que el crystal fuera el
     * dominante y las reglas de legibilidad (patrón y racha) le tocarían
     * el patrón, que SIEMPRE es 'vee' (centrado). La apertura conserva el
     * cálculo histórico (byte a byte).
     */
    const domOf = (gs) => {
      const cand = (!isOpening && gs.some((g) => g.type !== 'crystal'))
        ? gs.filter((g) => g.type !== 'crystal') : gs;
      return cand.reduce((a, b) => (b.count > a.count ? b : a), cand[0]);
    };
    if (isOpening) {
      for (let g = 0; g < groupCount; g++) {
        // La apertura no mete un segundo grupo si el presupuesto de HP se
        // agotó: el tope de la apertura es el presupuesto, con un margen
        // de como mucho UN grupo.
        if (g > 0 && openHpRemaining() <= 0) break;
        const remaining = groupCount - g;
        let groupTotal = g === groupCount - 1
          ? total - groups.reduce((a, x) => a + x.count, 0)
          : Math.max(1, Math.round(total / remaining * (0.7 + rnd() * 0.6)));
        if (groupTotal <= 0) break;

        // APERTURA: pool acotado por matabilidad + patrones del cono
        // (nunca rain/wall: las columnas laterales leakean fuera).
        // La OLA 0 es siempre spore (el "primer XP garantizado" del doc).
        let type;
        if (isFirstWave) {
          type = 'spore';
        } else if (!hpOk) {
          // Se agotó el presupuesto de HP pero falta XP: entra el tipo más
          // BARATO en HP (spore: 8 HP de base) para entregar experiencia
          // sin comerse el DPS del Guardian.
          type = 'spore';
        } else {
          type = openPool[(rnd() * openPool.length) | 0];
          while (type === usedType && openPool.length > 1) {
            type = openPool[(rnd() * openPool.length) | 0];
          }
        }
        const pattern = (type === 'spore' || type === 'crystal') ? 'vee'
          : type === 'fragment' ? 'burst-diag' : 'line';
        // dev-7 fase 27: LÍMITE POR ENEMIGO en la apertura. El presupuesto
        // de XP no alcanza: un solo grupo de 13 meteoritos (155 HP cada uno
        // en S30) son 130 XP que "rentan", pero el Guardian Lv1 no puede
        // matarlos (1.4 s de disparo por uno = 18 s la hilera) y se escapan
        // TODOS: el XP se pierde y la base se lleva 13 leaks. Por eso cada
        // grupo de la apertura se limita a lo que el Guardian puede matar
        // dentro de la ventana de tiro del enemigo.
        //
        // dev-7 fase 28: el presupuesto de HP se RECALCULA con el nivel
        // que el jugador ya alcanzó (cada nivel suma +25 % de daño, así
        // que su capacidad de matar en la ventana crece). Es un tope
        // ACUMULADO: lo ya gastado se descuenta del nuevo.
        groupTotal = Math.min(groupTotal,
          maxKillableInOpening(type, hpMul, velMul, openPlayerLevel, powerMul));
        groups.push({ type, count: groupTotal, pattern });
        if (type === 'crystal') crystalPlaced = true;
        // Se consume el presupuesto de la apertura (fase 27): HP (lo que el
        // Guardian puede matar) y XP (lo que el jugador necesita para subir).
        const d = ENEMY_TYPES[type];
        openHpSpent += (d?.hp ?? 1) * hpMul * groupTotal;
        // El jugador gana la XP de esta ola, así que su nivel sube y su
        // DPS crece. Se acumula para que las olas SIGUIENTES de la
        // apertura usen un pool y un tope coherentes con lo que el jugador
        // puede matar de verdad en ese momento.
        openXpEarned += (d?.score ?? 1) * groupTotal;
      }
    } else {
      // ---- TRAMO CLÁSICO (fase 65): ARQUETIPO + PRESUPUESTO ----------
      // El arquetipo REPARTE el presupuesto del instante en grupos, tipos
      // y cantidades (waveBudget × densityMul del molde). El crystal va
      // GARANTIZADO (uno por descarga) y se descuenta del presupuesto
      // antes de repartir: no es aditivo, así que la regla es neutral en
      // HP (design §Decisión 6).
      const archetype = pickArchetype(archHist, rnd, { stage: id });
      archHist.push(archetype);
      // fase 69: Leva escala el PRESUPUESTO de la descarga (+15 % por
      // rango). La apertura NO se toca (su modelo es de matabilidad).
      const budget = waveBudget(id, t) * (rm?.countMul ?? 1);
      const crystalHp = ENEMY_TYPES.crystal?.hp ?? 60;
      const crystal = { type: 'crystal', count: 1, pattern: 'vee', lane: 'centro' };
      const rest = Math.max(1, budget - crystalHp);
      // Si la descarga anterior y la de antes compartieron el tipo
      // dominante, al grupo que va a dominar esta se le pide OTRO tipo: la
      // racha se corta en la composición, sin mover el presupuesto.
      const avoid = dominantRun >= 2 && lastDominant ? [lastDominant] : [];
      const archGroups = composeWave(archetype, rest, biome, rnd, { avoid });
      // La ESCOLTA escolta al crystal: entra al frente y en el centro.
      if (archetype === 'escolta') groups.push(crystal, ...archGroups);
      else groups.push(...archGroups, crystal);
      // Marca de arquetipo de la descarga (archetypeOf / HUD / sonda).
      waveArchetype = archetype;
    }

    // REGLA: no repetir el patrón dominante de la ola anterior.
    // OJO: el crystal SIEMPRE va en 'vee' (centrado: en la apertura dentro
    // del cono del Guardian y en el tramo clásico como premio legible) —
    // es la garantía del doc y del director, no se toca.
    const dominant = domOf(groups);
    const isOpeningCrystal = dominant?.type === 'crystal';
    if (dominant && !isOpeningCrystal && dominant.pattern === lastPattern && groups.length > 1) {
      const alt = dominant.type === 'spore' ? 'vee'
        : dominant.type === 'fragment' ? 'burst-diag'
          : dominant.type === 'meteor' ? 'line' : 'mixed-arc';
      if (alt !== dominant.pattern) dominant.pattern = alt;
    }
    lastPattern = isOpeningCrystal ? 'vee' : (dominant?.pattern ?? null);

    // REGLA: nunca 3+ olas seguidas con el mismo tipo dominante. Para
    // romper la racha se cambia el tipo del grupo más grande por el de
    // otro grupo de la MISMA descarga (si no hay, por uno del pool).
    const domType = dominant?.type ?? null;
    // La regla de rachas se aplica DESPUÉS de agregar el crystal
    // pendiente (que puede ser el dominante real de la descarga), así
    // que va más abajo, después de todos los ajustes de grupos.

    // dev-7 fase 27: el crystal reservado en la ola 0 se agrega ahora
    // (2ª ola de la apertura) — es el "primer XP garantizado" del doc.
    if (isOpening && pendingCrystal > 0) {
      const cap = maxKillableInOpening('crystal', hpMul, velMul, openPlayerLevel, powerMul);
      if (cap >= 1) {
        const cnt = Math.min(pendingCrystal, cap);
        groups.push({ type: 'crystal', count: cnt, pattern: 'vee' });
        crystalPlaced = true;
        // dev-7 fase 28: el XP del crystal cuenta AHORA (antes estaba
        // descontado por adelantado al reservarlo, lo que hacía que el
        // piso real fuera 40 en vez de 105).
        openHpSpent += (ENEMY_TYPES.crystal?.hp ?? 60) * hpMul * cnt;
        openXpEarned += (ENEMY_TYPES.crystal?.score ?? 40) * cnt;
      }
      pendingCrystal = 0;
    }
    // La 2ª ola de la apertura tiene garantizados al menos 2 enemigos
    // propios (aunque el presupuesto esté casi agotado): el doc garantiza
    // que la apertura tenga ≥2 olas. Se usa el spore (el más barato) para
    // que el HP siga dentro del presupuesto.
    if (isSecondOpenWave && groups.length === 1) {
      const cap = maxKillableInOpening('spore', hpMul, velMul, openPlayerLevel, powerMul);
      const n = Math.min(2, cap);
      groups.push({ type: 'spore', count: n, pattern: 'vee' });
      openXpEarned += (ENEMY_TYPES.spore?.score ?? 5) * n;
      openHpSpent += (ENEMY_TYPES.spore?.hp ?? 8) * hpMul * n;
    }

    // La ola 0 de la apertura: spore en vee (primer XP garantizado).
    // El crystal garantizado va en un grupo aparte (nunca en la ola 0).
    if (idx === 0) {
      const sporeIdx = groups.findIndex((g) => g.type === 'spore');
      if (sporeIdx > 0) {
        // El spore no es el primero: se deja igual (el crystal conserva su
        // lugar) — el test mira el TIPO del primer grupo, así que el spore
        // tiene que ser el primero.
        const sp = groups.splice(sporeIdx, 1)[0];
        groups.unshift(sp);
      }
      groups[0] = { type: 'spore', count: groups[0].count, pattern: 'vee' };
    }
    // Garantía de cristal en la apertura (el doc la pide dentro de t<OPEN_T).
    // Sólo si el crystal NO acapara la ventana de tiro del Guardian Lv1
    // (canJoinOpening: ttk x 2 <= ventana): a partir de S16 el crystal
    // escalado se come el DPS del Guardian y su XP se pierde — el XP lo
    // dan entonces las esporas.
    if (isOpening && !crystalPlaced && canJoinOpening('crystal', id, openPlayerLevel, powerMul, scale)) {
      const cnt = Math.min(2, maxKillableInOpening('crystal', hpMul, velMul, openPlayerLevel, powerMul));
      groups.push({ type: 'crystal', count: cnt, pattern: 'vee' });
      crystalPlaced = true;
      openHpSpent += (ENEMY_TYPES.crystal?.hp ?? 60) * hpMul * cnt;
      openXpEarned += (ENEMY_TYPES.crystal?.score ?? 40) * cnt;
    }

    // dev-7 fase 27 — REGLA DE RACHAS (va al final, cuando la descarga ya
    // está completa): nunca 3+ olas seguidas con el mismo tipo dominante.
    // Para romperla se cambia el tipo del grupo MÁS GRANDE por el de otro
    // grupo de la misma descarga (si no hay, por uno del pool).
    //
    // fase 65 (BUG CORREGIDO): el chequeo vive en una closure y se aplica
    // DOS veces — después de la composición y OTRA VEZ después de
    // `clampToMold` — porque el molde puede volver a inflar el conteo de
    // un grupo barato y devolver el tipo prohibido al frente. Y, sobre
    // todo, los contadores de racha se actualizan con el dominante FINAL
    // de la descarga guardada: antes se guardaba el dominante PREVIO a la
    // sustitución, así que el contador quedaba desincronizado con lo que
    // el jugador ve (medido: S50 semilla 1234, 3 esporas dominantes
    // seguidas — el compositor creía que iban 2).
    const breakDominantRun = () => {
      const finalDominant = domOf(groups);
      const finalDomType = finalDominant?.type ?? null;
      const run = finalDomType && finalDomType === lastDominant ? dominantRun + 1 : 1;
      if (run < 3) return;
      // Se busca un tipo que NO sea el dominante actual. Si la descarga
      // tiene un solo grupo, se le cambia el tipo directamente (sigue
      // siendo una descarga válida, solo cambia el tipo).
      //
      // En la APERTURA el sustituto sale del pool de apertura (tipos
      // ligeros y matables por el Guardian Lv1 — el pool clásico incluye
      // miniBlob/blob, que romperían la garantía "apertura 100 % farmable")
      // y el grupo se recorta al TOPE DE MATABILIDAD del tipo nuevo: un
      // sporex4 -> meteorx1 en S30+ sin recorte rompería el tope POR
      // ENEMIGO (invariante fase 27). Como el recorte puede hacer que
      // otro grupo pase a ser el dominante, el ciclo se repite hasta que
      // el dominante de la descarga sea de otro tipo.
      for (let intento = 0; intento < groups.length; intento++) {
        const dom = domOf(groups);
        if (!dom || dom.type !== finalDomType) break;
        const inWave = new Set(groups.map((g) => g.type));
        const altType = isOpening
          ? (openPool.find((t) => t !== finalDomType && !inWave.has(t)) ?? null)
          : nextTypeForRun(dom.type, biome, inWave);
        if (!altType || altType === finalDomType) break;
        if (isOpening) {
          const cap = maxKillableInOpening(altType, hpMul, velMul, openPlayerLevel, powerMul);
          const n = Math.min(dom.count, cap);
          const dOld = ENEMY_TYPES[dom.type];
          const dNew = ENEMY_TYPES[altType];
          // dev-7 fase 28: el ajuste se hace sobre los CONTADORES
          // acumulados. El grupo viejo (`dom.count` de tipo dOld) se
          // reemplaza por `n` de tipo dNew: la diferencia es lo que hay
          // que sumar (o restar) a lo ya comprometido. Antes sólo se
          // ajustaba el "restante" y, como ahora el presupuesto se
          // deriva del gasto acumulado, el ajuste tenía que ir sobre el
          // gasto (si no, el crystal de una descarga podía "gratis").
          const oldCount = dom.count;
          openHpSpent += ((dNew?.hp ?? 0) * n - (dOld?.hp ?? 0) * oldCount) * hpMul;
          openXpEarned += ((dNew?.score ?? 0) * n - (dOld?.score ?? 0) * oldCount);
          dom.type = altType;
          dom.count = n;
        } else {
          // TRAMO CLÁSICO (fase 65): el sustituto sale del BIOMA (nunca el
          // crystal, que ya tiene su grupo), es del MISMO RANGO de coste
          // (nextTypeForRun) y la cuenta se recalcula por HP para no mover
          // el presupuesto de la descarga.
          const hpOld = ENEMY_TYPES[dom.type]?.hp ?? 1;
          const hpNew = ENEMY_TYPES[altType]?.hp ?? 1;
          dom.count = Math.max(1, Math.round((dom.count * hpOld) / hpNew));
          dom.type = altType;
        }
        dom.pattern = isOpening
          ? ((altType === 'spore' || altType === 'crystal') ? 'vee'
            : altType === 'fragment' ? 'burst-diag' : 'line')
          : (FAV_PATTERN[altType] ?? 'line');
      }
    };
    breakDominantRun();

    // TRAMO CLÁSICO (fase 65): el molde vuelve a mandar sobre los grupos
    // (la racha de tipo pudo dejar un grupo fuera de su rango) y después
    // se sortea la variante de élite de la descarga.
    if (!isOpening) {
      clampToMold(groups, waveArchetype);
      // Segunda pasada (ver arriba): el molde pudo re-inflar el conteo de
      // un grupo barato y devolver el tipo prohibido al frente.
      breakDominantRun();
    }

    // Los contadores de racha salen del dominante FINAL de la descarga
    // guardada (fase 65, bug corregido): es el único que el jugador ve.
    const domFinal = domOf(groups)?.type ?? null;
    dominantRun = domFinal && domFinal === lastDominant ? dominantRun + 1 : 1;
    lastDominant = domFinal;

    // dev-7 fase 28: el nivel del jugador se ACTUALIZA al FINAL de la
    // ola, no dentro de ella. El jugador gana la XP al MATAR, así que al
    // llegar a esta ola su nivel es el de las olas anteriores: si se
    // actualizaba dentro de la misma descarga, el primer grupo "prestaba"
    // su XP al segundo y el tope por enemigo saltaba de 3 a 4 con una
    // hílera que el Guardian todavía no podía matar.
    openPlayerLevel = levelForXp(openXpEarned);

    // TRAMO CLÁSICO (fase 65): variante de élite de la descarga. Va al
    // final (cuando la composición ya está cerrada y la racha resuelta) y
    // respeta los topes de la spec: ≤1 variante por grupo, ≤35 % de los
    // enemigos de la descarga y cada variante desde su década (S10/S12/S25).
    // En la APERTURA no se llama: no puede haber élites en t < OPEN_T.
    // fase 69: los diales del Protocolo (Élites sube probabilidad/fracción;
    // Doble élite pide 2 afijos). Sin Protocolo `rm` es null → los valores
    // neutros de la fase 68 (1 afijo, +0) y la campaña queda EXACTA.
    if (!isOpening) {
      assignVariant(groups, id, rnd, {
        maxAffixes: rm?.doubleAffix ? 2 : 1,
        chanceAdd: rm?.variantChanceAdd ?? 0,
        fracAdd: rm?.variantFracAdd ?? 0,
      });
    }

    waves.push({
      t: Math.round(t * 10) / 10,
      ...(waveArchetype ? { archetype: waveArchetype } : {}),
      groups,
    });
    // dev-7 fase 27: en la apertura las olas van más seguido (intervalo
    // corto). Con el intervalo clásico (3-7.2 s) la 2ª ola podía caer
    // fuera de la ventana de OPEN_T y dejar la apertura con UNA sola ola
    // (el doc garantiza ≥2).
    //
    // dev-7 fase 28: el intervalo se ACORTA cuando el tope por enemigo es
    // 1 (que es lo que pasa en los stages finales, con el hpMul enorme):
    // si no, la apertura no llega a entregar el XP mínimo (105) porque en
    // 40 s sólo entran 13 esporas de 5 XP. Con el intervalo corto entran
    // ~25 y el piso se alcanza.
    const tightOpening = isOpening
      && maxKillableInOpening('spore', hpMul, velMul, openPlayerLevel, powerMul) <= 2;
    t += isOpening
      ? (tightOpening ? 0.9 + rnd() * 1.1 : 2.2 + rnd() * 2.4)
      : 3 + rnd() * 4.2;
    idx += 1;
  }
  if (boss) {
    // La ola de jefe sigue siendo UN grupo (caso especial, sin mezcla).
    waves.push({ t: tEnd + 10, groups: [{ type: 'boss', count: 1, pattern: 'boss' }] });
  }
  return waves;
}

const SPAWN_Y = -50; // Y de spawn sobre el borde superior (§1.4)

/**
 * Ancho del CONO de tiro de la apertura (fase 27). Los enemigos de la
 * apertura caen dentro de este ancho alrededor del centro (x = BASE_X),
 * que es donde el Guardian (única torre al arrancar) puede acertar.
 * Antes la apertura usaba el `vee` centrado en 270 y funcionaba; al
 * fragmentar las descargas en franjas, los enemigos se alejaron del cono
 * y el Guardian dejó de acertar (medido: 3 000 disparos → 8 kills).
 */
const CONE_W = 240;

// ------------------------------------------------------------
// v3 3e/7 — entrada VARIADA del jefe (§spec 3e): X aleatoria por zonas
// (izquierda / centro / derecha) que NUNCA repite la zona del jefe anterior
// y barrido lateral con dirección alternada entre jefes. Estado module-level
// para que la garantía atraviese los stages (un WaveManager por stage).
// ------------------------------------------------------------
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
    this.queue = this.survival ? [] : [...(STAGE_WAVES[stage]
      ?? generateStageWaves(stage, seed, opts))];
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
    const due = this.pending.filter((ev) => ev.at <= this.t);
    if (!due.length) return;
    this.pending = this.pending.filter((ev) => ev.at > this.t);
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
