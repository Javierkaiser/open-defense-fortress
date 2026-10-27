# Contribuir a Open Defense Fortress

Gracias por el interés. El proyecto es un juego estático, offline y
**zero-dependency** en runtime: se mantiene a propósito sin paquetes npm, sin
build step y sin servidor.

Se aceptan contribuciones, issues y reportes **en español o en inglés**. La
documentación está en español; si escribís en inglés te respondemos igual.

## Código de conducta

Este proyecto adopta el [código de conducta](CODE_OF_CONDUCT.md) (Contributor
Covenant 2.1). Participando —issues, PRs, discusiones— aceptás respetarlo. Para
reportar una conducta inaceptable, escribí a **contacto@javierlust.net.ar**.

## Requisitos

- Node.js 22 o superior.
- Un navegador moderno (Chrome/Edge/Firefox/Safari).
- Git.

## Levantar el juego

```bash
git clone https://github.com/Javierkaiser/open-defense-fortress.git
cd open-defense-fortress
node scripts/serve.mjs 8080
# abrir http://localhost:8080
```

Los módulos ES no cargan desde `file://`; hace falta el servidor estático.

## Tests y checks

```bash
node --test "tests/**/*.mjs"                    # 846 tests
node .github/scripts/ci-checks.mjs    # sintaxis, zero-dep, referencias
```

La CI (`.github/workflows/ci.yml`) corre la suite en **Linux, macOS y Windows**
con **Node 22 y 24**. Antes de abrir un PR, corré la suite localmente: la matriz
tarda unos minutos y un fallo de plataforma se detecta mejor temprano.

La suite corre en Node puro: **no hay DOM, canvas, audio ni jsdom**. Si tu cambio
toca un módulo que se evalúa al importarse, respetá los guards
(`typeof document === 'undefined'`, storage inyectable, etc.). Ver
[docs/TESTING.md](docs/TESTING.md).

## Android

El wrapper Android vive en `mobile/` (Capacitor 8). El CI **Android CI (debug)**
es manual y compila un APK debug; no firma AAB ni sube a Play. Si tocás el
lifecycle nativo, leé [docs/ANDROID.md](docs/ANDROID.md) y corré
`node --test tests/test-native.mjs`.

## Estilo

- JavaScript con módulos ES (`import`/`export`), 2 espacios, sin punto y coma
  obligatorio (seguí el estilo del archivo que tocás).
- Comentarios y documentación en **español**.
- No agregues dependencias npm al runtime. Las herramientas de desarrollo van
  en `scripts/` y también deben ser zero-dep.
- Respetá los límites de módulos: `engine.js` no importa módulos de juego;
  `towers.js`, `enemies.js`, `waves.js`, `player.js` y `effects.js` reciben
  `game`/`engine` por parámetro y comunican hacia afuera solo por `engine.emit`.
- `perks.js` es la única implementación de la lógica de perks en combate.
- El arte de las torres vive en `tower-art.js`; no mezcles daño con dibujo.

## Assets

- Solo assets con licencia libre (CC0, CC BY 3.0, OFL 1.1).
- Si agregás uno, actualizá [docs/ASSETS.md](docs/ASSETS.md) y
  [docs/CREDITS.md](docs/CREDITS.md), e incluí la atribución en la pantalla de
  créditos del juego.
- El código es MIT; los assets conservan su licencia.

## Pull requests

1. Un cambio por PR, con un título claro (`feat:`, `fix:`, `docs:`, `test:`,
   `perf:`).
2. Tests nuevos o actualizados si tocás lógica.
3. Captura antes/después si tocás UI (`docs/screenshots/` o el PR).
4. `node --check` de los archivos tocados y `node --test "tests/**/*.mjs"` en verde.
5. Si el cambio modifica comportamiento, actualizá la spec de
   `openspec/specs/` correspondiente y la documentación.

## Licencia de las contribuciones

Al enviar un PR aceptás que tu contribución se publique bajo la licencia MIT
del proyecto. No envíes código con licencias incompatibles.
