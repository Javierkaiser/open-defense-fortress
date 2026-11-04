# Testing — Open Defense Fortress

## Correr la suite

```bash
node --test "tests/test-*.mjs"
```

Estado actual: **1168 tests** (1168 pass, 0 skip, 0 fail) en **39 archivos**.

Requisitos: Node 22 o superior.

El piso tipográfico de **15 px** se valida además con los checks estáticos:

```bash
node .github/scripts/ci-checks.mjs
```

Para un archivo:

```bash
node --test tests/test-stages.mjs
```

## Qué cubre

| Área | Archivos |
|---|---|
| Motor, loop, FSM, helpers, caches | `test-engine.mjs` |
| Etapas, HP de base, olas, director, jefes, variantes | `test-stages.mjs` |
| Variedad de entrada por run, formaciones y spawn determinista | `test-wave-variety.mjs` |
| Torres, targeting, disparo, daño, drones | `test-towers.mjs` |
| Escala de DPS, Tesla exenta, DoT de drones | `test-dps-scale.mjs` |
| Enemigos, variantes de élite, muerte, escolta | `test-enemies.mjs` |
| Mecánicas firma de los jefes (lluvia, devorar, resurrección, placas, metamorfosis) | `test-enemies-boss.mjs` |
| Ultimate: racimo, alfombra, remate, límite a jefes y dibujo | `test-ultimate.mjs` |
| Fortaleza, slots, HP, escudo, Black Hole | `test-player.mjs` |
| Cartas y ofertas | `test-cards.mjs`, `test-card-rework.mjs` |
| Perks (remate, lifesteal, explosión) | `test-perks.mjs` |
| Tipos de daño y bestiario | `test-damagetypes.mjs` |
| Score, XP, nivel, multiplicadores | `test-score.mjs` |
| Meta-juego y persistencia | `test-meta.mjs`, `test-progress.mjs` |
| HUD (markup puro, sin DOM real) | `test-hud.mjs` |
| Nivel/maestría, doctrinas y legendarias | `test-unit-progression.mjs` |
| Créditos y licencias (datos + textos legales verbatim) | `test-licenses.mjs` |
| Temas, skins de torres y calidad | `test-theme.mjs`, `test-tower-skins.mjs`, `test-quality.mjs` |
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
- DOM real, layout, CSS, scroll y safe areas (el piso de 15 px sí se
  chequea en `ci-checks`; el resto es smoke manual).
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
3. **Legibilidad 1.13.0**: repetir el recorrido a 360×640, 390×844 y
   1280×900. Ningún texto visible debe quedar por debajo de **15 px**; las
   pantallas pueden scrollear, pero no debe haber scroll horizontal. Los
   botones principales deben medir al menos **44 px**. A 360×640 la matriz
   de daño de la pausa se muestra como fichas verticales.
   En el HUD móvil, Stage/Lv/reloj deben medir 32 px y Enemigos/DPS/score
   28 px; el DPS debe quedar centrado y el score a la derecha. Comprobar que
   **MEJORAR** y **DESBLOQUEAR** se lean en estados habilitado y deshabilitado.
4. Menú: comprobar CTA `JUGAR`, grilla de tiles, NG+ bloqueado con candado
   y que el título **no** tenga recuadro de foco. A 360×640 debe scrollear
   sin overflow horizontal.
5. Selector: revisar filas de stage, candados SVG, modos y récords.
6. Menú → JUGAR → Stage 1 → 60 s sin errores de consola.
7. Pausa: comprobar `CONTINUAR`, grupo `SALIR DE LA RUN`, matriz de daño,
   selector de tema y chips `kbd` en escritorio.
8. Probar velocidad ×2, Ultimate, Black Hole, cartas y combo: el overlay de
   cartas/perks debe ser opaco en táctil y las fichas deben leerse. La carta
   **Munición Hiperveloz Perforante** debe dar +1 perforación y +25% de
   velocidad de vuelo, sin cambiar la cadencia de disparo.
9. Probar tema, calidad Alta/Baja, “Reset Global” y “Nueva Partida+” (con la
   campaña completa). Verificar que el STAGE CLEAR scrollee y que sus botones
   queden visibles a 360×640 y 390×844.
10. Recorrer Protocolo, Récords, Créditos y Torretas/Bestiario/Progreso.
11. Subir una torre a maestría 5 y comprobar el draft legendario (3/2/1), el
    badge `R2/2` de las doctrinas y la fila de drones con maestría.
12. Elegir una carta de caza y confirmar que ninguna unidad sube nivel ni
    maestría (el multiplicador de familia sí debe aplicarse).
13. Con la Rueda de Fuego y **Combustión Espontánea**, dejar enemigos lejanos:
    debe apagarse como brasa humeante y reencenderse sobre el más avanzado.
14. Abrir el desafío diario: la tarjeta debe decir `HEAT 39 · SIN CENSURA NI
    ARSENAL · BONO ×1,5`; al jugar deben quedar 3 cartas por oferta y 5 slots.
15. Arrancar el diario, volver al menú y reabrir el selector: la tarjeta debe
    quedar apagada con `JUGADO HOY · volvé mañana` y no debe abrir otra run.
16. Probar el Black Hole con un racimo: debe aparecer sobre el grupo más
    denso, no en una X random; revisar el dibujo en calidad Alta/Baja.
17. Verificar que no haya requests de red en DevTools.

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
publica en here.now desde `main` — <https://opendefensefortress.javierlust.net.ar/>
(alias: <https://faint-desert-zjv5.here.now/>) —; el APK debug se compila con el
workflow manual “Android CI (debug)” (ver [ANDROID.md](ANDROID.md)).
