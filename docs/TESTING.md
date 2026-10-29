# Testing — Open Defense Fortress

## Correr la suite

```bash
node --test "tests/test-*.mjs"
```

Estado actual: **970 tests** (970 pass, 0 skip, 0 fail) en **33 archivos**.

Requisitos: Node 22 o superior.

Para un archivo:

```bash
node --test tests/test-stages.mjs
```

## Qué cubre

| Área | Archivos |
|---|---|
| Motor, loop, FSM, helpers, caches | `test-engine.mjs` |
| Etapas, HP de base, olas, director, jefes, variantes | `test-stages.mjs` |
| Torres, targeting, disparo, daño, drones | `test-towers.mjs` |
| Enemigos, variantes de élite, muerte, escolta | `test-enemies.mjs` |
| Fortaleza, slots, HP, escudo, Black Hole | `test-player.mjs` |
| Cartas y ofertas | `test-cards.mjs`, `test-card-rework.mjs` |
| Perks (remate, lifesteal, explosión) | `test-perks.mjs` |
| Tipos de daño y bestiario | `test-damagetypes.mjs` |
| Score, XP, nivel, multiplicadores | `test-score.mjs` |
| Meta-juego y persistencia | `test-meta.mjs`, `test-progress.mjs` |
| HUD (markup puro, sin DOM real) | `test-hud.mjs` |
| Créditos y licencias (datos + textos legales verbatim) | `test-licenses.mjs` |
| Temas y calidad | `test-theme.mjs`, `test-quality.mjs` |
| Audio (rutas, gains, throttles) | `test-audio.mjs` |
| Heat / Protocolo | `test-heat.mjs`, `test-heat-waves.mjs` |
| Infinito | `test-endless.mjs` |
| Supervivencia | `test-survival.mjs` |
| Balance sim | `test-balance-sim.mjs` |
| Puente nativo Android (`backAction`, eventos) | `test-native.mjs` |
| Arranque / guarda de boot (index.html) | `test-boot-guard.mjs` |
| Integración del motor real | `test-integration.mjs` |
| Decisiones puras de `Game` (XP, back, música) | `test-main.mjs` |
| Economía de kill compartida | `test-economy.mjs` |
| Identidad de torres, técnicas y combos | `test-tower-identity.mjs` |
| Efectos (multikill, orbe, fireworks) | `test-effects.mjs` |
| Storage tolerante a fallos/corrupto | `test-storage.mjs` |
| Versión runtime/package/Android | `test-version.mjs` |

## Qué **no** cubre

- Rendering real de canvas (píxeles, glow, sprites).
- DOM real, layout, CSS, scroll, safe areas.
- Audio real (WebAudio / reproducción de OGG).
- WebView, Android, Capacitor, lifecycle nativo.
- El cableado `perk:proc` → sonido de `main.js` (solo se testea la señal).
- El bootstrap DOM de `main.js` y la mayoría de la FSM de `game.js` (cobertura
  parcial: las decisiones puras están en `test-main.mjs`).
- `comboSummary()` y algunos helpers de presentación.

Para eso hay **smoke manual** y una checklist Android (APK debug).

## Convenciones para tests

- `node:test` + `node:assert/strict`.
- Sin `jsdom`, sin canvas, sin audio. Si un módulo necesita DOM al importarse,
  el test falla: usá guards en el módulo.
- Storage inyectable (`safeLocalStorage()`), no `localStorage` global.
- Los tests de HUD comparan markup/contratos, no rendering.
- Los tests de balance SÍ dan pass/fail: verifican guardas (p. ej. HP por
  etapa dentro del ±10 %).
- Determinismo: sembrar `Math.random` con `tests/helpers/rng.mjs` cuando el
  test dependa del azar.
- Los helpers viven en `tests/helpers/` y NO se ejecutan como tests: el glob
  es `tests/test-*.mjs`.

## Smoke manual (web)

1. `node scripts/serve.mjs 8080`.
2. Abrir en Chrome a 390×844 (mobile emulation).
3. Menú → JUGAR → Stage 1 → 60 s sin errores de consola.
4. Probar pausa, velocidad ×2, Ultimate, Black Hole, cartas y combo.
5. Probar tema, calidad Alta/Baja y “Borrar progreso”.
6. Probar `SELECCIONAR STAGE`, `TORRETAS`, `PROTOCOLO` y `RÉCORDS`.
7. Verificar que no haya requests de red en DevTools.

## Smoke Android (APK debug)

- [ ] Instalar desde Play internal / APK debug.
- [ ] Primer arranque en modo avión.
- [ ] Pausa al pasar a background y audio detenido.
- [ ] Volver: audio reanudado, partida en pausa.
- [ ] Botón atrás: pausa → menú → background.
- [ ] Notch, gesture nav y 3 botones: HUD dentro del área segura.
- [ ] Rotación: portrait; tablet según decisión.
- [ ] Pantalla no se apaga jugando.
- [ ] Progreso sobrevive a un update.
- [ ] Gama baja: calidad Baja, sin tirones graves.
- [ ] 120 Hz: velocidad estable.
- [ ] Pre-launch report sin crashes.

## CI

La suite corre en GitHub Actions antes del build de Android. El build web se
publica en here.now desde `main`; el APK debug se compila con el workflow
manual “Android CI (debug)” (ver [ANDROID.md](ANDROID.md)).
