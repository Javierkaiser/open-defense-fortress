# Android — Open Defense Fortress

Base Android con **Capacitor 8.5.3**. La app empaqueta el mismo juego web; no
hay fork ni reescritura. Esta etapa genera un **APK debug** en GitHub Actions.
La firma AAB y Google Play quedan para la Etapa 3.

## Identidad

| Campo | Valor |
|---|---|
| `applicationId` | `ar.net.javierlust.opendefensefortress` |
| App name / launcher | Open Defense Fortress |
| `minSdk` | 24 (Android 7) |
| `compileSdk` / `targetSdk` | 36 (Android 16) |
| Orientación | Portrait (con opt-out temporal para tablets) |
| `versionCode` / `versionName` | 4 / 1.3.0 (`mobile/version.json`) |
| WebView mínimo | 111 (por `color-mix()` / `@container` / `dvh`) |

## Arquitectura

- `mobile/www/` se genera con `mobile/scripts/build-web.mjs` desde
  `index.html`, `css/`, `assets/`, `js/` y `privacy.html`.
- `npx cap sync android` copia `www/` a
  `android/app/src/main/assets/public/` (ignorado).
- **Sin plugins JS.** El juego sigue zero-dep. `MainActivity.java` resuelve:
  - botón atrás → `window.__gdfBack()` → `moveTaskToBack(true)` si no se maneja;
  - background/foreground → eventos `gdf:native-pause` / `gdf:native-resume`;
  - `FLAG_KEEP_SCREEN_ON` en foreground.
- `js/native.js` es puro: `backAction(state)`, `NATIVE_EVENTS`,
  `isNativePlatform()`. Tests en `tests/test-native.mjs`.
- `SystemBars`: `insetsHandling: "native"`, `hidden: true`. Si en un device el
  WebView queda con padding raro, se cambia a barras visibles.
- Iconos/splash: `mobile/assets/src/*.svg` → PNG con `sharp` →
  `@capacitor/assets generate --android`.

## Build manual en GitHub Actions

El workflow **Android CI (debug)** solo corre con `workflow_dispatch`:

1. GitHub → Actions → “Android CI (debug)” → **Run workflow**.
2. Esperar el build (~5–8 min la primera vez).
3. Descargar el artifact `open-defense-fortress-debug-<run>`.
4. Descomprimir y transferir `app-debug.apk` al teléfono.
5. Habilitar “Instalar apps desconocidas” para el archivo y abrirlo.

El APK debug está firmado con la **debug key** de Gradle: sirve para probar, no
para publicar ni para actualizar una versión de Play.

## Verificación manual en device

- [ ] Primer arranque en modo avión: menú y Stage 1.
- [ ] Botón atrás: `PLAYING → PAUSED`, `PAUSED → MENU`, `MENU → background`.
- [ ] Pasar a background: la partida queda en pausa y la música no sigue.
- [ ] Volver: audio reanudado, partida en pausa.
- [ ] Pantalla no se apaga jugando.
- [ ] Notch/gesture nav: HUD y overlays dentro de safe areas.
- [ ] Rotación: portrait; tablet según decisión.
- [ ] Progreso sobrevive a cerrar/abrir.
- [ ] Gama baja: calidad “Baja” sin tirones graves.

## Limitaciones conocidas

- Sin `keystore` no hay AAB firmado ni Play.
- Sin `adb`/Play internal, el runtime nativo se valida instalando el APK debug a
  mano. El CI solo prueba que compile.
- Android 16 ignora el lock de orientación en pantallas grandes; el manifest
  incluye el opt-out temporal (`PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY`).
- El launcher con el nombre completo puede truncarse según el fabricante; si
  pasa, se usa “Open Defense” en `strings.xml` y el store title sigue completo.
- `SystemBars.hidden` puede requerir ajuste de insets tras probar en device.

## Etapa 3 — firma y Play

Cuando estén el keystore y la cuenta:

1. Cargar en GitHub Secrets:
   - `ANDROID_KEYSTORE_BASE64` (base64 del `.jks`/`.keystore`)
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
2. Agregar el workflow `android-release.yml` (manual) que:
   - escribe `mobile/android/keystore.properties` desde los secrets;
   - corre `./gradlew bundleRelease`;
   - verifica con `jarsigner -verify`;
   - sube el AAB como artifact.
3. Crear la app en Play Console con el package
   `ar.net.javierlust.opendefensefortress`.
4. Subir el **primer AAB a mano** a Internal testing y aceptar **Play App
   Signing**.
5. Crear la service account de Google Cloud para la Play Developer API y
   guardar el JSON en `PLAY_SERVICE_ACCOUNT_JSON`; el workflow puede subir a
   internal/alpha/beta.
6. Completar ficha, Data safety (sin datos), content rating, privacy policy
   (`https://faint-desert-zjv5.here.now/privacy.html`).
7. Closed testing 12 testers / 14 días si la cuenta personal es nueva.
8. Producción con staged rollout y pre-launch report.

## Comandos locales

```bash
cd mobile
npm install
npm run build:web
npm run assets
npx cap sync android
```

Con SDK instalado: `cd android && ./gradlew assembleDebug`.
