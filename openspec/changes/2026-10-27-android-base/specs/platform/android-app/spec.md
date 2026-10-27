# platform/android-app

## Purpose

La app Android empaqueta el juego web con Capacitor 8 y resuelve el ciclo de vida
nativo sin reescribir el juego. Es 100% offline y usa los mismos assets.

## Requirements

### Requirement: Boot offline

La app MUST arrancar sin red y cargar `index.html`, `css/`, `assets/` y `js/`
desde el paquete local.

#### Scenario: primer arranque en modo avión

- GIVEN un dispositivo sin red
- WHEN el usuario abre la app
- THEN el menú principal aparece
- AND no hay errores de carga de módulos ni assets

### Requirement: Botón atrás

El botón atrás MUST mapear al estado de la FSM y nunca cerrar la app en medio de
una partida.

#### Scenario: atrás en PLAYING

- GIVEN una partida en `PLAYING`
- WHEN el usuario presiona atrás
- THEN la partida pasa a `PAUSED`
- AND la app no se cierra

#### Scenario: atrás en MENU

- GIVEN el menú principal
- WHEN el usuario presiona atrás
- THEN la app pasa a background (`moveTaskToBack`)

### Requirement: Ciclo de vida

Al pasar a background, la app MUST pausar la partida y detener/duckear la música;
al volver, MUST reanudar el `AudioContext` sin reanudar la partida sola.

#### Scenario: llamada entrante

- GIVEN una partida en `PLAYING`
- WHEN la app va a background
- THEN la partida queda en `PAUSED`
- AND la música no sigue sonando en background

### Requirement: Pantalla encendida

Mientras la app está en foreground, la pantalla MUST permanecer encendida.

### Requirement: Safe areas y orientación

El HUD MUST quedar dentro de las safe areas; la orientación MUST ser portrait en
teléfonos.

### Requirement: Créditos

La app MUST exponer una pantalla de Créditos/Licencias con la atribución CC BY
3.0 del icono del Ultimate y las licencias de assets/fuentes.
