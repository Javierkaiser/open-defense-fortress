# Changelog

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
