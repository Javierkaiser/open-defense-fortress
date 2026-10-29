// =============================================================================
// waves-data.js — tablas manuales de olas de la campaña (stages 1..5)
// -----------------------------------------------------------------------------
// Extraído de waves.js (fase 75). Es data pura: waves.js la importa y le
// aplica el retune/tag de carga. El resto de las olas (6..50 y ∞) se
// generan proceduralmente en waves.js.
// =============================================================================

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
}
