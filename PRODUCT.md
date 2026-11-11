# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Jugadores de tower defense y roguelike en **móvil y desktop por igual**: sesiones
cortas en el celular (portrait, touch, offline) y sesiones más largas en el
navegador de escritorio con teclado y mouse. Ninguna de las dos es secundaria:
cualquier decisión de producto tiene que sostener ambas.

La interfaz, la documentación y los comentarios están en español; las
contribuciones se aceptan en español o inglés.

## Product Purpose

Tower defense roguelike de torres fijas: defendés una base volcánica de oleadas
de cuatro familias (roca, virus, espora, cristal). Las torres disparan solas y
el jugador gestiona la economía de la run, la velocidad del tiempo, el
Ultimate/Black Hole y las cartas que aparecen al subir de nivel. Cada partida
cambia el arsenal, las cartas y las oleadas.

Existe para ofrecer profundidad de juego de PC en el navegador, sin instalación,
sin cuentas y sin conexión. El éxito es una run que se entiende, se disfruta y
se puede repetir en mobile y desktop, sostenida por un proyecto mantenible sin
build step ni dependencias.

## Positioning

**Profundidad sin servicio.** Un vecino puede copiar las torres o las cartas,
pero no puede copiar honestamente la combinación: 50 etapas de campaña, modo
infinito, supervivencia, desafío diario y Protocolo/Heat con 11 condiciones, 141
cartas y 11 unidades, todo 100 % offline en el navegador, sin cuentas, sin
anuncios, sin compras, sin telemetría y sin dependencias de runtime.

## Operating Context

- Se juega en el navegador (demo web canónica) o desde el APK de Android; no hay
  servidor, login ni llamadas de red en runtime.
- El progreso vive en `localStorage` del dispositivo; no hay cloud saves.
- La sesión típica de mobile es corta y en portrait; la de desktop usa teclado
  (`P`/`Esc`, `1`/`2`/`3`, `Espacio`, `B`, `U`, `M`) y mouse.
- El sitio se sirve estático y se publica con cada push a `main`; el wrapper
  Android empaqueta el mismo código web.
- El desarrollo se valida con `node:test` (sin DOM/canvas), `ci-checks` y sondas
  headless (`balance-sim`, `probe-waves`, `probe-pacing`).

## Capabilities and Constraints

- Campaña de 50 etapas con jefes, biomas y dificultad creciente; modo infinito
  (51+), supervivencia, desafío diario y Protocolo/Heat.
- 8 torres + 3 drones, nivel 1–6 y maestría 0–15; 108 cartas normales (80 + 28
  doctrinas) + 33 legendarias; 7 afijos de élite; 5 temas visuales.
- Progresión meta con pool compartido de fragmentos y desbloqueo de unidades con
  oro; Nueva Partida+ y Reset Global.
- **Restricciones duras**: sin dependencias npm en runtime, sin build step, sin
  servidor y sin red; Canvas 2D para el mundo y DOM/CSS para el HUD; módulos ES;
  un solo código para web y Android.
- **Sin monetización**: no hay anuncios, compras, cuentas, stamina ni moneda
  premium; tampoco telemetría.
- **Plataforma**: web responsive (mobile web incluido) + APK Android vía
  Capacitor. Desktop nativo/Steam **no** está en el alcance.
- **Idioma**: español en UI, docs y comentarios.
- **Assets**: solo libres (CC0, CC BY 3.0, OFL 1.1), documentados en
  `docs/ASSETS.md` y `docs/CREDITS.md`.
- **Decisión abierta**: no hay un estándar formal de accesibilidad (p. ej. WCAG
  AA) declarado. Sí hay un piso tipográfico de 15 px y objetivos táctiles de
  44–48 px.

## Brand Commitments

- Nombre: **Open Defense Fortress**; código bajo licencia MIT.
- Voz directa y técnica, en español, sin hype ni relleno corporativo.
- Compromiso público: cero monetización, cero cuentas, cero telemetría y offline
  real. Cualquier feature que los contradiga queda fuera.
- El progreso y los récords son del jugador y viven en su dispositivo.

## Evidence on Hand

- Juego jugable: `index.html` + `js/` + `css/style.css`, sin build step.
- Demo web canónica y alias en here.now; `privacy.html` con la política de
  privacidad.
- 1201 tests en 41 archivos, `ci-checks` y matriz de CI Linux/macOS/Windows ×
  Node 22/24.
- Documentación real: `docs/DESIGN.md`, `docs/BALANCE.md`, `docs/TESTING.md`,
  `docs/CREDITS.md`, `docs/ASSETS.md`, `docs/ANDROID.md` y `openspec/specs/`.
- Capturas en `docs/screenshots/` y hoja de contactos en
  `tools/tower-sheet.html`.
- No hay testimonios, prensa, benchmarks de terceros ni métricas de audiencia:
  no inventarlos.

## Product Principles

1. **Profundidad sin servicio**: si una feature exige cuentas, red o
   monetización, no entra.
2. **Una run se entiende sola**: lo crítico (torre, nivel, carta, requisito,
   próxima ola) se lee en pantalla, sin manual.
3. **Mobile y desktop son primera clase**: ninguna decisión de UI puede
   resolverse sacrificando una de las dos.
4. **El juego es el contenido**: la interfaz se retira; el canvas y las
   decisiones de build son el espectáculo.
5. **Mantenible sin build**: cero dependencias de runtime y tests que corren en
   Node sin DOM.

## Accessibility & Inclusion

- Piso tipográfico de 15 px para cualquier texto visible, vigilado por
  `ci-checks`.
- Objetivos táctiles principales de 44–48 px; `@media (pointer: coarse)` agranda
  los botones del HUD.
- `prefers-reduced-motion` respetado en las animaciones de menú y overlays.
- Calidad gráfica Alta/Baja y modo Auto para equipos modestos.
- No hay un estándar formal (WCAG) declarado: decisión abierta.
