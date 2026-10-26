# AGENTS.md — Open Defense Fortress

Guía para agentes y contribuyentes que trabajen en este repo. El proyecto es un
tower-defense roguelike **100% estático, offline y zero-dependency** en runtime.
Documentación y comentarios en **español**.

## Comandos

```bash
node --test "tests/**/*.mjs"                         # suite completa (837 tests)
node --test "tests/**/*.mjs"test-stages.mjs          # un archivo
node --check js/main.js                    # sintaxis de un módulo
node scripts/serve.mjs 8080                # servidor estático local
node scripts/balance-sim.mjs --mode=inteligente --seeds=5
node scripts/probe-waves.mjs --seeds=20
```

En Windows/PS 5.1 el glob `js/*.js` no se expande solo; usá
`Get-ChildItem js\*.js | ForEach-Object { node --check $_.FullName }`.

## Estructura

- `js/main.js` — `Game`: FSM, economía, wiring por `EventBus`; único entry
  (`index.html`).
- `js/engine.js` — loop rAF+dt, canvas, `CONFIG`/`SCENE`, helpers, fondo,
  partículas, input, render.
- `js/waves.js` — director de olas: presupuesto de HP, presión, biomas,
  variantes, `waveSchedule`, `WaveManager`.
- `js/stages.js` — 50 etapas de campaña, HP de base, temas, jefes.
- `js/endless.js` — ∞ (51+), profundidad, hitos, desafío diario.
- `js/survival.js` — supervivencia: olas infinitas, atrición, jefes.
- `js/heat.js` — Protocolo: condiciones, presets, mods, recompensas.
- `js/enemies.js` — tipos + 7 variantes de élite.
- `js/towers.js` — 8 torres + 3 drones.
- `js/player.js` — `Fortress`: base, slots, drones, HP, Black Hole.
- `js/cards.js` — 48 cartas y ofertas.
- `js/perks.js` — única implementación de perks en combate.
- `js/meta.js`, `js/progress.js`, `js/score.js` — meta, persistencia y fórmulas.
- `js/hud.js` — HUD y overlays DOM.
- `js/theme.js`, `js/quality.js`, `js/damagetypes.js`, `js/effects.js`,
  `js/tower-art.js`, `js/audio.js` — temas, calidad, tipos de daño, efectos,
  arte de torres y audio.
- `tests/` — `node:test`; un archivo por módulo + integración.
- `scripts/` — herramientas de desarrollo (servidor, balance, probe).
- `docs/` — diseño, balance, testing, créditos, assets y screenshots.
- `openspec/specs/` — specs de comportamiento.

## Reglas duras

- **Sin dependencias npm en runtime.** No hay build step. `package.json` solo
  tiene scripts de desarrollo.
- Los módulos se evalúan en Node: nada de `new Image()`, `Audio`,
  `AudioContext`, `document` crudos al importar. Usá guards.
- `Path2D` no existe en Node: `tower-art.js` usa un trazador fallback y los
  paths se limitan a M/L/H/V/C/Q/Z.
- `perks.js` es la única implementación de la lógica de perks.
- `engine.js` no importa módulos de juego; las entidades reciben `game`/`engine`
  por parámetro y emiten por `engine.emit`.
- El arte de torres vive en `tower-art.js`; no mezclar con daño.
- Los assets deben ser libres (CC0 / CC BY 3.0 / OFL 1.1) y estar documentados
  en `docs/ASSETS.md` y `docs/CREDITS.md`.

## Skills y comandos de agentes

El repo conserva las skills/comandos de OpenSpec para varios agentes:

- `.agents/skills/`
- `.hermes/skills/`
- `.kilocode/skills/` y `.kilocode/workflows/`
- `.opencode/skills/` y `.opencode/commands/`

Son opcionales: no forman parte del juego ni del runtime. Si usás OpenCode,
Kilo, Hermes u otro agente, podés aprovecharlas; si no, ignoralas.

## Flujo de cambios

1. Si el cambio es de comportamiento, actualizá `openspec/specs/`.
2. Tests verdes + `node --check` de los archivos tocados.
3. Captura antes/después si tocás UI.
4. Actualizá `docs/DESIGN.md`, `docs/BALANCE.md` o `docs/TESTING.md` si
   corresponde.
5. Commits en español, conventional-ish (`feat:`, `fix:`, `docs:`, `test:`).

## Android / Play

La app Android (Capacitor 8 + GitHub Actions) está planificada. El objetivo:
AAB firmado, offline, back button nativo, pausa al pasar a background y
keep-awake. No agregar dependencias de Android al runtime web.
