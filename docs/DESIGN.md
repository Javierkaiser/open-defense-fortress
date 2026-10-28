# Diseño técnico — Open Defense Fortress

Documento de referencia de la arquitectura y del gameplay. Para balance y
mediciones, ver [BALANCE.md](BALANCE.md); para la suite, [TESTING.md](TESTING.md).

## 1. Principios

1. **100% estático y offline.** Sin servidor, sin llamadas de red, sin build
   step y sin dependencias npm en runtime.
2. **Una sola pantalla de juego.** Canvas 2D lógico 540×880; el jugador no
   mueve una nave ni apunta. Las torres disparan solas.
3. **Portrait primero.** El HUD y los overlays se adaptan a marcos angostos y a
   pantallas con notch; el juego está pensado para celular.
4. **Roguelike por run.** El arsenal, las cartas y las oleadas cambian entre
   partidas. La meta-progresión es permanente, pero acotada.
5. **Cero monetización.** Sin anuncios, compras, cuentas, stamina ni moneda
   premium.
6. **Todo lo que se pueda testear sin DOM, se testea sin DOM.** Los módulos
   puros se ejecutan en Node; el rendering y el HUD se validan con smoke manual.

## 2. Stack y restricciones

| Área | Decisión |
|---|---|
| Runtime | Navegador moderno; HTML + CSS + JavaScript ES modules |
| Mundo | Canvas 2D, 540×880 lógicos, DPR con tope 2 |
| HUD/overlays | DOM + CSS (sin framework) |
| Loop | `requestAnimationFrame` + delta con clamp |
| Estado | FSM de 12 estados + `EventBus` en `engine.js` |
| Persistencia | `localStorage` (`gdf_progress`, `gdf_meta`, `gdf_quality`, `gdf_theme`) |
| Audio | WebAudio sintetizado + 18 samples OGG locales |
| Dependencias | Cero en runtime; solo herramientas Node en `scripts/` |
| Idioma | Español (UI, docs y comentarios) |

## 3. Estructura

```text
index.html              canvas + HUD DOM + overlays
css/style.css           HUD, pantallas, temas, responsive
js/                     23 módulos ES
assets/                 fuentes, SFX y sprites usados
tests/                  node:test
scripts/                serve, balance-sim, probe-waves, probes
tools/tower-sheet.html  hoja de contactos del arte de torres
docs/                   diseño, balance, testing, créditos
openspec/specs/         specs de comportamiento
```

## 4. Módulos

| Módulo | Responsabilidad |
|---|---|
| `main.js` | `Game`: FSM, economía de la run, wiring de eventos, lifecycle de la partida. Único entry. |
| `engine.js` | Loop rAF+dt, canvas, `CONFIG`/`SCENE`, helpers (`clamp`, `lerp`, `dist`, `rand`), fondo, partículas, input, render y `EventBus`. |
| `waves.js` | Director de olas: presupuesto de HP, curva de presión, biomas, variantes, `waveSchedule`, `WaveManager` y cola `pending[]`. |
| `stages.js` | 50 etapas de campaña: nombre, tema, HP de base, desbloqueo, jefe. |
| `endless.js` | Modo infinito (51+): `stageDef`, profundidad, hitos, recompensas y desafío diario. |
| `survival.js` | Supervivencia: olas infinitas, presupuesto lineal, jefes cada 5, temas y recompensas. |
| `heat.js` | Protocolo: 11 condiciones, presets, `heatMods()`, recompensas e hitos. |
| `enemies.js` | Tipos de enemigo, 7 variantes de élite, comportamiento y render. |
| `towers.js` | 8 torres + 3 drones: targeting, disparo, stats y render. |
| `player.js` | `Fortress`: base, slots, drones, HP/escudo, Black Hole y render de la plataforma. |
| `cards.js` | 48 cartas, ofertas por nivel, aplicación de efectos y topes. |
| `perks.js` | Única implementación de perks en combate: remate, robo de vida (tope 10 %), explosión al matar y `perk:proc`. |
| `meta.js` | Meta-juego de 100 niveles: fragmentos, oro, perks por torre, rangos. |
| `progress.js` | Persistencia tolerante: desbloqueos, récords, modos, heat, daily. |
| `score.js` | Fórmulas puras: score, XP, precio de nivel, multiplicadores, resumen de combo. |
| `hud.js` | HUD, pantallas, modales, selector de stage, meta, bestiario, protocolo y récords. |
| `theme.js` | 5 temas de interfaz y tokens de color. |
| `quality.js` | Calidad Alta/Baja: `shadowBlur`, partículas, blur DOM. |
| `damagetypes.js` | 5 tipos de daño × 4 familias, matriz, badges y bestiario. |
| `effects.js` | Partículas, floats, explosiones, spritesheet del boss y fireworks. |
| `tower-art.js` | Datos del rig de cada torre + renderizador; fallback de `Path2D`. |
| `audio.js` | WebAudio: síntesis, samples, música techno, unlock/resume y throttles. |
| `native.js` | Contrato puro con el contenedor Android: `backAction`, `NATIVE_EVENTS`, `isNativePlatform`. No importa Capacitor. |

### Límites de dependencias

- `engine.js` no importa módulos de juego.
- `towers.js`, `enemies.js`, `waves.js`, `player.js` y `effects.js` reciben
  `game`/`engine` por parámetro; no importan `hud.js`, `cards.js` ni `main.js`.
- La comunicación hacia afuera es por `engine.emit(...)`.
- `perks.js` es la única implementación de la lógica de perks.
- `tower-art.js` no sabe de daño, slots ni juego: solo dibuja.

## 5. FSM

Estados canónicos en `engine.js`:

```text
BOOT → MENU → SELECT_STAGE → PLAYING ⇄ PAUSED
                                 ├→ CARD_CHOICE → PLAYING
                                 ├→ STAGE_CLEAR
                                 └→ GAME_OVER
MENU ⇄ TORRETAS
MENU ⇄ PROTOCOLO
MENU ⇄ RECORDS
MENU ⇄ CREDITS
```

- `CARD_CHOICE` bloquea el update del mundo, no el render.
- Las transiciones pasan solo por `engine.setState()` y emiten `state:changed`.
- Al ocultarse la pestaña/app, `visibilitychange` pausa si está en `PLAYING`.
- El botón atrás de Android se mapea en `js/native.js`: `PLAYING → PAUSED`,
  `PAUSED → MENU`, pantallas de navegación → `MENU`; en `MENU` la app pasa a
  background.

## 6. Loop y render

- `requestAnimationFrame` con `dt` clampeado; el juego no depende del framerate.
- Capas por frame:
  1. Cielo cacheado y estrellas.
  2. Decoración del tema y planeta cacheado.
  3. Halo de spawn, plataforma y niebla.
  4. Tinte del tema (`soft-light`).
  5. Capa de aplicación (`onRenderExtra`: cúpula, arco HP, torres).
  6. Entidades (enemigos, torres, proyectiles).
  7. Efectos transitorios y juice.
- Caches offscreen para cielo, planeta, niebla y deck; se invalidan por resize,
  tema o calidad.
- DPR con tope 2; el canvas lógico nunca cambia.
- Partículas con tope 400 (Alta) / 150 (Baja).
- Calidad Baja anula `shadowBlur` en la instancia del contexto y apaga el
  `backdrop-filter` de los overlays.

## 7. Entidades y combate

### Torres (8) y drones (3)

| Torre | Rol |
|---|---|
| Guardian | Abanico de balas; tracking global |
| Missile | Misiles homing con explosión |
| Beam | Láser continuo que atraviesa; alcance lateral |
| Thunderstroke | Rayo instantáneo al enemigo con más HP; stun breve |
| Tesla | Cadena eléctrica entre enemigos; anti-enjambre de banda |
| Mortar | Obús de área |
| Gauss | Perdigón perforante rápido |
| Láser | Haz continuo de daño alto |

Drones: Rueda de Fuego (contacto), Avispas (enjambre) y Campo de Fuerza
(escudo/curación). La plataforma tiene **5 slots**; por run entran **5 torres +
1 dron**. Las torres entran por cartas.

### Enemigos

Tipos base: meteorito, fragmento, cristal, espora y blob (mediano/tanque).
Jefes por etapa: meteorito gigante, blob virus, blob necrótico, blindado,
híbrido y primordial.

**7 variantes de élite** (afijos): escudado, veloz, divisor, sanador,
regenerador, acorazado y tenaz. Toda élite paga `scoreMul` (score y XP). Las
crías del divisor dañan la base pero no consumen la regla de fugas.

### Tipos de daño

5 tipos: balístico, luz, explosión, eléctrico y dron.
4 familias: roca, cristal, espora y virus.
La matriz `TYPE_MATRIX` define fortalezas y debilidades; ninguna variante es
inmune: todo se puede matar, solo cambia el costo.

### Perks

- Remate: ejecuta enemigos por debajo de un umbral.
- Robo de vida: cura sobre daño efectivo, con tope del 10 %.
- Explosión al matar.
- La señal `perk:proc` la consume `main.js` para sonido y feedback.

## 8. Director de olas

`waves.js` genera la composición por etapa, no una lista fija:

- **Presupuesto de HP**: `waveBudget()` = densidad × `budgetFit` × presión ×
  33 HP × `densityMul`, repartido por `composeWave()`.
- **Curva de presión**: apertura ×0,65 → picos ×1,30 → respiro ×0,62 → marea
  final ×1,35, normalizada a media 1,00.
- **Biomas por década**: roca, virus, espora y mezclas; décadas consecutivas no
  comparten dominante.
- **Crystal garantizado**: 1 por descarga, descontado del presupuesto.
- **Escalonado**: `stagger`/`delay`/`lane` por grupo + `waveSchedule()` pura.
- **Scheduler**: `WaveManager` usa una cola `pending[]`; el aviso de jefe la
  vacía y la etapa no cierra con pendientes.
- **Variantes**: 3–4 % de los enemigos, ~70 % de las descargas; en >50 la
  probabilidad sube de 0,70 a 0,85.
- La guarda de balance es **±10 % de HP por etapa** con 20 semillas; la mide
  `scripts/probe-waves.mjs` y la cubre `tests/test-stages.mjs`.

## 9. Modos

| Modo | Reglas |
|---|---|
| Campaña | 50 etapas; se desbloquean al limpiar la anterior; jefe en 1, 10, 20, 30, 40 y 50. |
| Infinito (∞) | 51+; HP de base de la misma curva; jefe cada 10; profundidad “mejor + 1”; hitos y recompensas. |
| Supervivencia | Olas infinitas; sin contador de fugas; cada fuga resta el HP máximo del enemigo; base 25 500 HP; jefe cada 5; tema cada 5; presupuesto lineal `60 + 30·oleada`. |
| Desafío diario | Etapa 51–60 elegida por la fecha local; semilla FNV. |
| Protocolo / Heat | 11 condiciones sobre la campaña; presets I–V (5/10/16/24/35); máximo 49; recompensa ×1 + 0,08·heat; hitos 60/120/240/420 fragmentos por torreta. |

## 10. Progresión y economía

- **Score**: por kill, con multiplicador de racha (×1,5 / ×2 / ×3) y bonus de
  élite. La base que recibe daño resetea la racha.
- **XP**: escala con el `hpMul` de la etapa; al subir de nivel se ofrece 1 de 3
  cartas. La campaña reparte ~20 cartas por etapa; el tope es 21 en campaña y
  31 en supervivencia.
- **Cartas**: 48; pueden desbloquear torres/drones, mejorar una unidad o dar
  bonuses globales. Tienen topes por carta y por run.
- **Meta**: 100 niveles; fragmentos por victoria (60, ×2 la primera vez), oro,
  perks por torre y rangos. Las mejoras meta se aplican en batalla
  (`metaDmgMul`, `critBonusPct`).
- **Récords**: por etapa, por modo, por heat y por oleada; se guardan en
  `progress.js` de forma tolerante a datos viejos/corruptos.

## 11. HUD y responsive

- HUD superior: pausa, velocidad, combo, música, stage + progreso, nivel + XP,
  timer, Ultimate y Black Hole.
- HUD inferior: score + multiplicador.
- Overlays: menú, selector, pausa, fin de stage, game over, cartas, perks,
  combo, torretas, protocolo y récords.
- El escenario de overlays es un nodo fijo fuera del marco: usa el alto real de
  la pantalla y permite scrollear las cartas.
- `@container marco` adapta el HUD a marcos angostos; `@media (pointer: coarse)`
  agranda los botones a 52 px.
- `viewport-fit=cover` + `env(safe-area-inset-*)` para notch y barras.
- `100dvh` con fallback a `100vh`.

## 12. Arte

- Base procedural: fondo volcánico, planeta, enemigos, torres, proyectiles,
  efectos y HUD.
- Capa acotada de sprites libres: chasis de torres, iconos del HUD, explosión
  del boss y destellos.
- `tower-art.js` define el rig de cada torre (formas, roles de color, anclas) y
  lo dibuja; no mezcla daño con arte.
- 5 temas de interfaz (volcánico, cyberpunk, neón, aqua, cielo) y 5 temas de
  escenario por década.
- El arte de torres se revisa con `tools/tower-sheet.html`.

## 13. Audio

- WebAudio sintetizado para música y fallback de SFX.
- 18 samples OGG locales para disparos, impactos, UI, jefes y ultimate.
- `AudioContext` se crea en el primer gesto; `resume()` al volver del
  background.
- Throttles y pools por SFX para no saturar; `setPaused`/`stopMusic` en pausa.
- La música techno se sintetiza por capas y sube intensidad con la acción.

## 14. Performance

- DPR máximo 2; caches de fondo/planeta/niebla/deck.
- `shadowBlur` es el costo principal en Canvas 2D: calidad Baja lo anula.
- Tope de partículas y recorte de partículas vivas al bajar de calidad.
- El blur DOM de los overlays se apaga en Baja.
- El juego corre a 60 fps en gama media; en gama baja se recomienda Baja.

## 15. Testing

- `node:test`, sin DOM/canvas/audio/jsdom.
- Un archivo por módulo + `test-integration.mjs` (smoke del motor real).
- 857 tests (852 pass, 5 skip) en 25 archivos.
- Lo que no cubre la suite: rendering real, DOM, audio, WebView/Android.
  Ver [TESTING.md](TESTING.md).

## 16. Empaquetado Android

- Capacitor **8.5.3**, assets empaquetados, `targetSdk 36`, `minSdk 24`.
- `applicationId`: `ar.net.javierlust.opendefensefortress`.
- `mobile/` contiene `capacitor.config.json`, `build-web.mjs`, iconos y el
  proyecto `android/` versionado.
- **Sin plugins JS**: `MainActivity.java` resuelve back, pausa/audio y
  keep-awake; `js/native.js` expone el mapping puro y los eventos DOM.
- `SystemBars` con insets nativos; portrait con opt-out temporal para tablets.
- El CI manual `android-ci.yml` compila un APK debug. El AAB firmado y Play
  App Signing son la Etapa 3.
- La app usa el mismo código web; no hay fork del juego.

## 17. Decisiones y no-goals

- No hay login, ads, compras, stamina, energía ni moneda premium.
- No hay servidor ni cloud saves en v1.
- No hay editor de niveles ni mods.
- No hay dependencias npm en runtime.
- No se reescribe el juego para Android: se empaqueta el mismo código.
