# Tasks — Base Android

## 1. Scaffold

- [x] 1.1 `mobile/package.json` con `@capacitor/cli/core/android` 8.5.3 y `@capacitor/assets` 3.0.5
- [x] 1.2 `mobile/capacitor.config.json` (appId, appName, webDir, minWebViewVersion 111, SystemBars)
- [x] 1.3 `mobile/version.json` (versionCode 1, versionName 1.0.0)
- [x] 1.4 `mobile/scripts/build-web.mjs` (copia limpia, falla si falta index.html)
- [x] 1.5 `npm install` + `npx cap add android` + `mobile/android` versionado

## 2. Nativo

- [x] 2.1 `variables.gradle`: minSdk 24, compile/target 36
- [x] 2.2 `app/build.gradle`: appId, versión por env, signing release guardado
- [x] 2.3 `AndroidManifest.xml`: portrait, allowBackup, sin cleartext, property tablets
- [x] 2.4 `MainActivity.java`: back, pausa/reanudación, keep-awake
- [x] 2.5 Iconos adaptativos y splash con `@capacitor/assets`

## 3. Web

- [x] 3.1 `js/native.js` puro (`backAction`, `NATIVE_EVENTS`, `isNativePlatform`)
- [x] 3.2 `main.js`: `window.__gdfBack`, pausa/audio, resume
- [x] 3.3 `tests/test-native.mjs`
- [x] 3.4 Pantalla Créditos/Licencias en el menú + tests
- [x] 3.5 Safe areas y pulido táctil
- [x] 3.6 Aviso de boot adaptado a app

## 4. CI

- [x] 4.1 `.github/workflows/android-ci.yml` manual (`workflow_dispatch`)
- [x] 4.2 Tests + `build-web` + `cap sync` + `assembleDebug` + artifact
- [ ] 4.3 Correr el workflow y verificar `app-debug.apk`

## 5. Documentación

- [x] 5.1 `docs/ANDROID.md`
- [x] 5.2 `README.md`, `AGENTS.md`, `docs/DESIGN.md`, `docs/TESTING.md`, `CHANGELOG.md`
- [x] 5.3 `.gitignore` con assets generados y `.idea/`

## 6. Verificación

- [x] 6.1 `node --test "tests/**/*.mjs"` verde
- [x] 6.2 `node --check` de los módulos tocados
- [x] 6.3 Smoke web en 390×844
- [ ] 6.4 Build manual de Android en Actions
- [ ] 6.5 Commit y push
