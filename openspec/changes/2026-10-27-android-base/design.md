# Design — Base Android

## Decisiones

1. **Capacitor 8.5.3** con `webDir: www`.
2. **Sin plugins JS.** El juego sigue zero-dep y no necesita bundler/import map.
   `MainActivity.java` resuelve back, pausa/reanudación y keep-awake.
3. **Assets empaquetados.** `mobile/scripts/build-web.mjs` copia `index.html`,
   `css/`, `assets/`, `js/` y `privacy.html` a `www/`; `cap sync` los copia al
   proyecto Android.
4. **Proyecto Android versionado.** `npx cap add android` se corre una vez; el
   build de CI solo hace `cap sync` + Gradle.
5. **CI manual.** `workflow_dispatch`; no builds automáticos en push/PR. El
   artifact `app-debug.apk` se descarga desde Actions.
6. **Sin firma.** El debug build usa la debug key. `keystore.properties` y el
   AAB quedan para la Etapa 3.

## Contrato nativo

- `window.__gdfBack()` devuelve `true` si el juego manejó el back; si no,
  `MainActivity` manda la app a background (`moveTaskToBack(true)`).
- Eventos DOM: `gdf:native-pause` y `gdf:native-resume`.
- `js/native.js` expone `backAction(state)`, `NATIVE_EVENTS` e
  `isNativePlatform()`; es puro y testeable en Node.
- `SystemBars`: `insetsHandling: "native"`, `hidden: true`; si en device el
  WebView queda con padding raro, se cambia a barras visibles.

## Riesgos

- El runtime nativo no se puede validar sin instalar el APK; el CI solo prueba
  compilación.
- El nombre completo del launcher puede truncarse; fallback “Open Defense”.
- Android 16 ignora el lock de orientación en pantallas grandes; se agrega la
  property temporal y se documenta.
