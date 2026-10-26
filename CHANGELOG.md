# Changelog

Todas las versiones notables de este proyecto se documentan acá. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado
[SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Añadido

- CI en GitHub Actions con matriz Linux/macOS/Windows × Node 22/24 y un job de
  checks estáticos (sintaxis, zero-dependency, referencias rotas).
- Dependabot semanal para las GitHub Actions.
- Issue forms (`bug_report`, `feature_request`), plantilla de pull request y
  `config.yml` con links de seguridad y conducta.
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) y `THIRD_PARTY_NOTICES.md`.
- `.editorconfig` y `.gitattributes` (LF en el repo, binarios sin conversión).

### Cambiado

- `README.md`: la sección de cómo correr/jugar quedó arriba, junto al TL;DR, y el
  badge de estado ahora es el de CI.
- `SECURITY.md`: el reporte privado por GitHub Advisories es el canal preferido.
- El comando de la suite pasa a `node --test "tests/**/*.mjs"`.

### Corregido

- `node --test tests/` no funcionaba en Linux ni macOS con Node 22+: el runner
  trata el argumento posicional como glob y un directorio no matchea nada
  (`Error: Cannot find module '.../tests'`). Funcionaba solo en Windows, donde el
  path se resolvía como directorio. Con el glob explícito corre igual en Linux,
  macOS y Windows. Detectado por la matriz de CI antes de abrir el repo.
- `package.json`: se agregó el script `npm run check` para los checks estáticos.

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
