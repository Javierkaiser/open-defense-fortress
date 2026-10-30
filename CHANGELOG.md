# Changelog

Todas las versiones notables de este proyecto se documentan acá. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado
[SemVer](https://semver.org/lang/es/).

## [Unreleased]

## [1.6.0] — 2026-10-30

### Agregado

- **Sistema de skins de torres y drones** (`js/tower-skins.js`): 5 skins
  ligadas al tema de UI (`volcanico`, `cyberpunk`, `neon`, `aqua`, `cielo`).
  Cada skin cambia paleta, motivos de forma (antenas/circuitos, aros/tubos,
  aletas/burbujas, alas/nubes), pad y colores de FX de las 8 torres y los 3
  drones. No toca daño, cadencia, hitbox ni reglas.
- **Compilador de skins** en `tower-art.js` (`compileSkin`, `resolveRig`,
  `TOWER_ANCHORS`): `remove`/`patch`/`add` sobre el rig, cache por
  `kind|skinId`, rigs congelados y sin mutar `TOWER_RIGS`.
- **Tema de UI en el engine** (`uiTheme`, `skinId`, `setUiTheme`,
  `theme:changed`): independiente del tema de escenario; `skinId: 'auto'`
  sigue al tema y un id explícito queda listo para skins futuras.
- Colores de skin en proyectiles, misil, obús, cráter, Beam, Láser, Bolt y
  cadena; paleta y motivo de silueta en drones; iconos del meta con skin.
- Persistencia `gdf_tower_skin` (`loadSkin`/`saveSkin`), tolerante a storage
  bloqueado o corrupto. Sin selector visible todavía.
- `tools/tower-sheet.html`: selector de tema/skin, drones, comparativa de los
  5 temas, calidad baja y query params (`?theme=neon&skin=auto&q=low`).

### Cambiado

- El tema `volcanico` es la skin base (`base: true`): el render histórico
  queda exacto; las demás skins son 100 % vectoriales (0 assets nuevos).
- En calidad Baja se omiten textura y motivos decorativos; la silueta y el
  pad se conservan.
- `theme.js` ahora avisa al engine el tema de UI y la skin al aplicarse.

### Tests / versión

- **988 tests, 0 skip** (34 archivos), incluido `test-tower-skins.mjs`.
- Versión **1.6.0** / Android `versionCode 12`.
- Spec: `openspec/specs/gameplay/tower-skins/spec.md`.

## [1.5.4] — 2026-10-30

### Cambiado

- **Limpieza de cartas**: eliminadas `xp_boost` (Acelerador de Energía) y
  `score_gain` (Prima de Combate). El XP deja de tener una carta propia y el
  score queda sólo como display/récord.
- Eliminados `xpMul` y `scoreMul` del `Fortress`, `Game._onKill`,
  `EnergyOrb`, el resumen de combos y el HUD.
- **Escudo de Racha → Escudo de Base** (`base_shield`): misma mecánica de
  bloquear un golpe completo a la base, sin relación con la racha. Internos
  renombrados a `baseShields` / `baseShieldApps`.
- Catálogo **86 → 84 cartas** (74 → 72 repetibles).
- **974 tests, 0 skip**; sin cambios de stats.
- Versión 1.5.4 / Android `versionCode 11`.

## [1.5.3] — 2026-10-30

### Cambiado

- **Dron Avispas → Dron Mosquitos** en todos los textos visibles: pantalla
  de torretas, cartas, perks, combos, docs y specs.
- El id interno sigue siendo `wasps` (clave persistida del meta y de cartas)
  para no romper saves.
- Flavor de perks alineado con la identidad de sangre: `Néctar` →
  `Hematofagia` y `Aguijón potente` → `Picadura potente`.
- La carta de desbloqueo ahora describe la mecánica actual: 3 mosquitos que
  pican e inyectan veneno; la hematofagia drena vida al escudo.
- **974 tests, 0 skip**. Sin cambios de stats ni de balance.
- Versión 1.5.3 / Android `versionCode 10`.

## [1.5.2] — 2026-10-29

### Corregido

- **Cráter del Mortar**: `MortarShell` perdía `craterDps/time/radius/slow`
  porque `pickOnHit()` filtra los mods de impacto. Ahora el cráter viaja en
  un objeto `crater` propio y `_explode()` sí instancia `CraterFx`.
- Indicador visual nuevo: terreno chamuscado, anillo ámbar pulsante en el
  radio real, anillo interior punteado y brasas animadas.
- Tests del camino real `Tower.fire → MortarShell → CraterFx`, de daño/slow
  dentro del radio y del dibujo. **973 tests, 0 skip**.
- S50: 100 % win / 92 % HP / 99 % bajas (20 semillas).
- Versión 1.5.2 / Android `versionCode 9`.

## [1.5.1] — 2026-10-29

### Cambiado

- **Campo de Fuerza (nerf)**: burbuja base 140→120 y tope duro 190. Los perks
  de radio bajan de +14/+25 a +6/+10 y la técnica de +20 a +10; el máximo real
  pasa de 311 px (115 % del canvas) a 190 (70 %).
- `forcefieldBubbleR()` centraliza el radio efectivo: `update()` y `draw()`
  usan el mismo valor con el cap aplicado.
- **Rueda de Fuego**: sin enemigos patrulla el campo con waypoints cercanos en
  vez de volver a la base y orbitar; elimina el viaje de ida y vuelta entre
  oleadas.
- **970 tests, 0 skip**; S50 100 % win / 91 % HP / 99 % bajas (20 semillas).
- Versión 1.5.1 / Android `versionCode 8`.

## [1.5.0] — 2026-10-29

### Añadido

- **Identidad mecánica única por torre/dron**: `mech` en `towers-data.js` y
  registro/hooks en `tower-mechanics.js` (supresión, ejecución, fusión, juicio,
  ion, cráter, riel, corte, ignición, veneno y burbuja).
- Marcas nuevas (`judgment`, `ion`, `rail`, `cut`, `melt`, `bubble`, `charged`,
  `siege`) y DoT de quemadura separado del veneno.
- `CraterFx`: el Mortar deja una zona persistente que quema y frena.
- 11 combos de identidad: sobrecarga, bucle de prisma, sincronía de asedio,
  ignición compartida, concha de veneno, cadena de burbuja, tormenta de riel,
  fusión del riel, asedio lento, golpe de gracia y arco del Guardian.
- `PERK_SCHEMA_VERSION`: los saves viejos conservan nivel/oro y resetean las
  elecciones A/B que cambiaron de significado.
- `tests/test-tower-identity.mjs` y spec
  `openspec/specs/gameplay/tower-identity/spec.md` (**968 tests, 0 skip**).

### Cambiado

- Perks acotados: remate sólo Misil; robo de vida sólo Beam/Avispas;
  explosión al matar sólo Rueda de Fuego; stun sólo Thunderstroke; rebote sólo
  Guardian; crítico sólo Guardian/Gauss; slow sólo Beam.
- Técnicas: `Haz Gélido` y `Drenaje del Haz` pasan al Beam; `Cabeza
  Aturdidora` se reconvierte en `Guiado Táctico` (homing) del Misil.
- Catálogo 81→86 cartas (74 repetibles) y CAPS actualizados.
- `S50`: 100 % win / 92 % HP / 99 % bajas (20 semillas), sin cambios de
  balance global.
- Versión 1.5.0 / Android `versionCode 7`.

## [1.4.1] — 2026-10-29

### Añadido

- `js/economy.js`: economía de una baja compartida por `Game`, `balance-sim` y
  `probe-s6`, con carry de crías y `maxLevel` correctos.
- `tests/test-economy.mjs` y **952 tests, 0 skip**.
- Job `verify` en el deploy: publica solo si pasan suite y `ci-checks`.

### Cambiado

- `towers.js` 2.942→1.307: `towers-core`, `towers-targeting`,
  `towers-projectiles`, `towers-fx` y `towers-drones`.
- `enemies.js` 2.766→2.362: `enemies-status`, `enemies-combat` y
  `enemies-bestiary`.
- `waves.js` 2.671→2.197: `WaveManager` y entrada de jefes en
  `waves-manager.js`.
- Los tests de perks escanean todos los módulos de combate, no solo
  `towers.js`/`enemies.js`.
- Versión 1.4.1 / Android `versionCode 6`.

## [1.4.0] — 2026-10-29

### Añadido

- **947 tests, 0 skip** (antes 918 con 5 skip): `test-effects`, `test-storage`,
  `test-version`, `test-main` y helpers compartidos en `tests/helpers/`.
- Módulos puros nuevos: `geometry.js`, `combat-crit.js`, `base-heal.js`,
  `storage.js`, `card-constants.js`, `combo-mods.js` y `version.js`.
- Datos separados de la lógica: `cards-data.js`, `enemies-data.js`,
  `waves-data.js` y `towers-data.js`.

### Corregido

- El mortero y el misil ya no se consumen como balas directas: detonan con
  splash y conservan crítico/perks.
- El veneno letal corta `Enemy.update` (no mueve, no cuenta fuga, no dispara
  fases) y `poisonDps` se resetea al expirar.
- Slow por fuente: un slow fuerte y corto ya no contamina al débil y largo.
- `healBase()` único: robo de vida, Campo de Fuerza, Black Hole y Transfusión
  no reviven una base en 0.
- El XP de Supervivencia usa el stage de la oleada, no el stage 1 fijo.
- Forcefield: dwell finito y waypoint solo sin blanco.
- Black Hole arrastra el ancla de drift/zigzag (`entryX`).
- Back nativo limpia el campo antes de volver al menú.
- La calidad gráfica se aplica a todos los contexts/caches en caliente.
- Confirmaciones inline se desarman al cambiar de pantalla.
- Apagón filtra las cartas de ultimate/Black Hole; combos/BH respetan `CAPS`.
- HUD: foco/ARIA, barras `progressbar`, escape de datos, fallback del ∞ en 51.
- `ci-checks` normaliza separadores de Windows y excluye `.codegraph`.

### Cambiado

- `cards.js` 2.226→1.868, `enemies.js` 3.022→2.767, `waves.js`
  2.869→2.666 y `towers.js` 3.200→2.944 líneas (datos extraídos).
- `hud.js` 4.314→10 líneas (fachada): markup puro en `hud-builders.js`
  (2.144) y clase en `hud-core.js` (2.386).
- `main.js` 1.857→176 líneas (bootstrap): la clase `Game` vive en
  `game.js` (1.785) y se testea sin DOM.
- Menos trabajo por frame: snapshot del HUD solo si está visible, poda de
  enemigos in-place, Fortress no simula con `dt=0`, DPS cacheado 0,25 s,
  `_flushPending` por prefijo y `bh-count` cacheado.
- La niebla completa (bandas ambientales + capas densas) se cachea cada
  3 frames; las capas densas siguen el alto lógico en móvil.
- Audio: reanuda el contexto suspendido, tolera `resume()` sin Promise y
  re-sincroniza el scheduler tras una suspensión.
- Se eliminaron `lerp`, `spreadDegNow`, `orbitalStrikes`, `_speedDirty`,
  `this.progress`, `isCache`, `STAGES.unlockAfter/waveSet` y campos muertos
  del HUD.
- Versión 1.4.0 / Android `versionCode 5`.

## [1.3.0] — 2026-10-28

### Añadido

- **11 combos nuevos** (81 cartas en total):
  - Frío: Cero Absoluto, Fractura Criogénica, Onda Glacial.
  - Lifesteal: Cosecha Explosiva, Pacto de Sangre, Transfusión.
  - Tipo/mecánica: Marca de Riel, Enlace de Enjambre, Juicio Final,
    Rebote Conductor y Perforación Compartida.
- Slow con **duración real** (`slowTimer`/`slowFrac` + `applySlow`): Balas
  Gélidas deja de ser una carta casi inerte.
- Marcas temporales de enemigo (`rail`/`swarm`) para los combos de Gauss y
  drones.
- Prerrequisito `requiresCards`/`requiresAnyCards`: los combos pueden exigir
  una técnica ya elegida.
- Black Hole con drenaje (Pacto de Sangre) y regeneración por veneno
  (Transfusión).

### Cambiado

- `tech_slow` aplica un slow real de 1,5 s; antes solo duraba un frame y el
  guard de los proyectiles fallaba.
- El panel de combos muestra los tags activos y los nuevos flags.

### Corregido

- El slow de proyectiles, Firewheel y Beam ahora usa el mismo helper que el
  Campo de Fuerza.
- 918 tests (913 pass, 5 skip, 0 fail).

## [1.2.0] — 2026-10-28

### Añadido

- **Rework de cartas (fase 74)**: 22 cartas nuevas (70 en total).
  - 5 cartas de daño por tipo: balístico, luz, explosión, eléctrico y dron.
  - 12 cartas de técnica para el resto del arsenal (Missile, Tesla,
    Thunderstroke, Mortar, Gauss, Láser, Beam, Rueda de Fuego, Avispas y
    Campo de Fuerza).
  - 3 combos nuevos: Reactor de Cadena, Prisma Compuesto y Singularidad;
    Balas Detonantes se reworkea.
  - 2 cartas de Black Hole: Horizonte de Sucesos y Colapso.
- Sistema de **tags y prerrequisitos** (`requiresTags`, `requiresUnits`,
  `requiresBlackHole`): las cartas de combo no se ofrecen si falta su pareja.
- **Black Hole por instancia**: duración, radio, colapso y mini agujeros
  negros de Singularidad.
- El panel de combos muestra los tags activos.

### Cambiado

- `dmg_all` pasa de +30% a **+10% por stack** (×2): es global, no
  específica.
- `tech_explode` pasa a **explosión al impactar** (40% en radio 70) y exige
  una torre explosiva (Missile o Mortar).
- Los buffs globales (`dmg_all`, `cadence_up`, `hunt_*` y daño por tipo)
  ahora se guardan en la fortaleza y alcanzan a las unidades desbloqueadas
  después.
- El enlace de carga del Thunderstroke solo se dibuja en los últimos 0,5 s
  antes del disparo, no durante todo el cooldown.

### Corregido

- Las torres desbloqueadas después de una carta global ya no quedaban sin
  el buff.
- 906 tests (901 pass, 5 skip, 0 fail).

## [1.1.0] — 2026-10-28

### Añadido

- Pantalla **CRÉDITOS Y LICENCIAS** dentro del juego (menú principal → CRÉDITOS,
  estado `CREDITS` de la FSM): cumple la atribución **CC BY 3.0** del icono del
  Ultimate (Lorc / game-icons.net, recoloreado) en la obra distribuida, y lista
  el resto de las licencias (CC0 de Kenney y BenHickling, OFL 1.1 de las cuatro
  tipografías y MIT del código). Los textos legales completos viajan embebidos
  en el módulo nuevo `js/licenses.js` (offline, sin `fetch`); el texto de
  OFL 1.1 pasa a distribuirse con el juego.
- CI en GitHub Actions con matriz Linux/macOS/Windows × Node 22/24 y un job de
  checks estáticos (sintaxis, zero-dependency, referencias rotas).
- Dependabot semanal para las GitHub Actions.
- Issue forms (`bug_report`, `feature_request`), plantilla de pull request y
  `config.yml` con links de seguridad y conducta.
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) y `THIRD_PARTY_NOTICES.md`.
- `.editorconfig` y `.gitattributes` (LF en el repo, binarios sin conversión).
- **Thunderstroke (fase 73)**: alcance global, un rayo principal de 65 y
  estallido de mini rayos de área (50 % a hasta 3 vecinos en 130 px; los perks
  `extraCount`/`chainFork` suman mini rayos). El build-up dibuja un enlace
  suave al blanco con anillo de lock; al disparar, el rayo se intensifica y el
  anillo de impacto marca el punto.

### Enemigos por familia

- Enjambres nuevos: `rockSwarm`, `virusSwarm` y `crystalSwarm`, con arte
  procedural de cúmulo y silueta propia.
- Tanques nuevos: `boulder`, `sporePod` y `geode`; `blob` queda como tanque
  virus con la mecánica Cepa.
- Mecánicas intrínsecas: Desmoronamiento, Cepa, Esporulación y Placas.
- Campaña gradual: S1–2 roca + cristal, S3 virus, S4 espora, S5 las cuatro
  familias; `sporePod` debuta en S20 y `geode` en S30.
- Crías de mecánicas: 10 % de XP/score y sin recursión. El score usa carry
  entero para no mostrar decimales ni pagar de más.
- Bestiario: descripción y contra de cada tanque.
- 890 tests (885 pass, 5 skip).

### Android base

- Capacitor 8.5.3 + proyecto `mobile/android/` (`targetSdk 36`, `minSdk 24`).
- Build manual de APK debug en GitHub Actions.
- Hooks nativos: back button, pausa/audio al background, keep-awake.
- `js/native.js` puro + tests; sin plugins JS.
- Safe areas y pulido táctil.
- 890 tests (885 pass, 5 skip).

### Cambiado

- `docs/CREDITS.md` y `THIRD_PARTY_NOTICES.md`: la atribución CC BY 3.0 deja de
  ser una tarea pendiente de la etapa Android — ya se muestra en el juego.
- `README.md`: la sección de cómo correr/jugar quedó arriba, junto al TL;DR, y el
  badge de estado ahora es el de CI.
- `SECURITY.md`: el reporte privado por GitHub Advisories es el canal preferido.
- El comando de la suite pasa a `node --test "tests/**/*.mjs"`.
- `Sensores Ampliados` ya no se ofrece solo con Thunderstroke: la torre pasó a
  alcance global y la carta queda para Beam y Tesla.
- `MAX_TOWER_REACH` queda como referencia histórica del layout (ya no es el
  alcance máximo de una torre).

### Corregido

- `node --test tests/` no funcionaba en Linux ni macOS con Node 22+: el runner
  trata el argumento posicional como glob y un directorio no matchea nada
  (`Error: Cannot find module '.../tests'`). Funcionaba solo en Windows, donde el
  path se resolvía como directorio. Con el glob explícito corre igual en Linux,
  macOS y Windows. Detectado por la matriz de CI antes de abrir el repo.
- `package.json`: se agregó el script `npm run check` para los checks estáticos.
- **Guardian**: colisión barrida (CCD) para que las balas rápidas no se salten
  esporas entre frames a 30 fps o 2×; separación de la ráfaga paralela 13 → 10 px.
- **Thunderstroke**: el blanco se refresca durante el build-up; si muere, la
  carga no se queda apuntando a un cadáver.

## [1.0.0] — 2026-10-26

Primera versión pública.

### Juego

- Campaña de 50 etapas con jefes, biomas y dificultad creciente.
- Modo infinito (51+) con profundidad, hitos y récord.
- Supervivencia: olas infinitas, atrición de base y jefe cada 5 oleadas.
- Desafío diario con semilla por fecha.
- Protocolo / Heat: 11 condiciones, presets I–V y recompensas extra.
- 8 torres + 3 drones, 48 cartas, 7 afijos de élite y 5 temas visuales.
- Ultimate, Black Hole, combos, perks y meta-progresión de 100 niveles.
- Calidad gráfica Alta/Baja y HUD responsive.

### Técnico

- Canvas 2D 540×880 + DOM/CSS + módulos ES, sin build step.
- 22 módulos, FSM de 11 estados, director de olas con presupuesto de HP.
- 837 tests en Node (`node --test tests/`).
- 100% offline: fuentes, sprites y SFX locales.
- Licencia MIT para el código; assets CC0 / CC BY 3.0 / OFL 1.1.

### Pendiente

- App Android (Capacitor 8) y publicación en Google Play.
- Traducción del juego a otros idiomas.
