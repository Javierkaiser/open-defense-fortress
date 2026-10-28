# Changelog

Todas las versiones notables de este proyecto se documentan acá. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado
[SemVer](https://semver.org/lang/es/).

## [Unreleased]

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
