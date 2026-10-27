# mobile — wrapper Android (Capacitor 8)

Este directorio empaqueta el juego web en una app Android. **No es una app
separada**: `www/` se genera desde la raíz y `android/` es el proyecto nativo.

## Requisitos

- Node 22+.
- Para compilar localmente: JDK 21 + Android SDK 36 (o usar el CI).
- El scaffold se puede generar sin Android Studio; Gradle solo corre en CI o en
  una máquina con SDK.

## Comandos

```bash
cd mobile
npm install
npm run build:web        # raíz -> www/
npx cap sync android     # www/ -> android/app/src/main/assets/public
npm run assets           # iconos/splash desde assets/src
```

Build local (si tenés SDK):

```bash
cd mobile/android
./gradlew assembleDebug
```

En Windows: `.\gradlew.bat assembleDebug`.

## CI

El workflow **Android CI (debug)** es manual:

GitHub → Actions → “Android CI (debug)” → **Run workflow**.

Genera `app-debug.apk` como artifact. No firma AAB ni sube a Play: eso es la
Etapa 3. Ver [`docs/ANDROID.md`](../docs/ANDROID.md).

## Firma (Etapa 3)

`android/app/build.gradle` lee `keystore.properties` si existe; sin ese archivo
el build release queda sin firmar. El debug usa la debug key de Gradle.

Nunca commitear `keystore.properties`, `*.jks` ni `*.keystore`.

## Estructura

```text
mobile/
├─ package.json
├─ package-lock.json
├─ capacitor.config.json
├─ version.json
├─ scripts/build-web.mjs
├─ scripts/make-assets.mjs
├─ assets/
│  ├─ src/*.svg          # fuentes editables
│  └─ *.png              # generados para @capacitor/assets
└─ android/              # proyecto nativo versionado
```

`www/` y `android/app/src/main/assets/public/` son generados y están ignorados.
