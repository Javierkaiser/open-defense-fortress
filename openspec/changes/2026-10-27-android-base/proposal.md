# Proposal — Base Android (Capacitor 8)

## Why

Open Defense Fortress es un juego web estático y offline. Para llevarlo a Android
sin reescribirlo, hace falta un contenedor nativo que empaquete los assets y
resuelva el ciclo de vida de una app: botón atrás, pausa al pasar a background,
audio, pantalla encendida y safe areas.

La Etapa 1 dejó el repo público y limpio. La Etapa 2 agrega la base Android y un
build de **APK debug** en GitHub Actions, sin tocar la firma ni Google Play.

## What Changes

- Nuevo `mobile/` con Capacitor 8, `webDir: www` y un build script zero-dep.
- Nuevo proyecto `mobile/android/` (generado una vez y versionado), con
  `targetSdk 36`, `minSdk 24`, portrait y `SystemBars` con insets nativos.
- Nuevo `js/native.js` puro: mapping del botón atrás y nombres de eventos.
- `main.js` cablea `window.__gdfBack`, pausa y reanudación de audio.
- `MainActivity.java` implementa back, pausa/reanudación y keep-awake.
- Pantalla de **Créditos/Licencias** en el menú (MIT, CC BY 3.0, CC0, OFL).
- Safe areas y pulido táctil en CSS.
- Workflow manual `android-ci.yml`: tests + `assembleDebug` + artifact.
- Documentación `docs/ANDROID.md` con los pasos de la Etapa 3 (firma y Play).

## Capabilities

- `platform/android-app`: la app Android arranca offline, respeta el ciclo de
  vida, el botón atrás, la orientación y las safe areas.

## Non-goals

- Firma AAB, Play Console, service account y closed testing (Etapa 3).
- Plugins JS de Capacitor; el lifecycle se resuelve nativo.
- Multi-idioma del juego (Etapa 4).
