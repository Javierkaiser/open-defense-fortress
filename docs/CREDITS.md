# Créditos y licencias — Open Defense Fortress

## Código

El código de este proyecto está bajo **MIT** (ver [LICENSE](../LICENSE)).
Copyright (c) 2026 Javier Lust.

## Arte y audio

La mayor parte del arte y del audio es **procedural**: se dibuja con Canvas 2D
y se sintetiza con WebAudio. Sobre esa base hay una capa acotada de assets
libres.

### CC BY 3.0 — atribución obligatoria

| Asset | Autor | Fuente | Licencia | Cambios |
|---|---|---|---|---|
| Icono del Ultimate (`assets/sprites/ui_tinted/icon_ultimate_gold.png`) | **Lorc** | [game-icons.net — power-lightning](https://game-icons.net/1x1/lorc/power-lightning.html) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Recoloreado a dorado desde `icon_ultimate_zap.png` |

La atribución debe mostrarse en la app (pantalla de créditos) y en la ficha de
la tienda. No se usa ningún otro asset CC BY.

### CC0 1.0 — dominio público (crédito opcional)

| Asset(s) | Autor | Fuente | Uso |
|---|---|---|---|
| `ui_tinted/tower_beam.png`, `tower_guardian.png`, `tower_missile.png`, `tower_tesla.png`, `tower_thunder.png` | Kenney | [Sci-Fi RTS](https://kenney.nl/assets/sci-fi-rts) (`scifiStructure_01..16`) | Chasis decorativo de las torres; recoloreado |
| `ui_tinted/icon_pause_teal.png` | Kenney | [Game Icons](https://kenney.nl/assets/game-icons) (`pause.png`) | Icono de pausa; recoloreado |
| `ui_tinted/icon_boss_warning_red.png` | Kenney | [Simple Space](https://kenney.nl/assets/simple-space) (`icon_exclamationLarge.png`) | Aviso de jefe; recoloreado |
| `ui_tinted/sparkle_gold.png` | Kenney | [Particle Pack](https://kenney.nl/assets/particle-pack) (`star_01.png`) | Destellos; recoloreado |
| `sprites/explosions/explosion_sheet_50frames.png` | BenHickling | [OpenGameArt — Explosion 7](https://opengameart.org/content/explosion-7) (`explosion1.png`) | Explosión de jefe (50 frames) |
| `sprites/particles/particle_star_01.png` | Kenney | [Particle Pack](https://kenney.nl/assets/particle-pack) (`star_01.png`) | Destellos de multi-kill |
| 18 SFX de `assets/sfx/` | Kenney | [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds), [Digital Audio](https://kenney.nl/assets/digital-audio), [Impact Sounds](https://kenney.nl/assets/impact-sounds), [Interface Sounds](https://kenney.nl/assets/interface-sounds), [UI Pack](https://kenney.nl/assets/ui-pack) | Disparos, impactos, UI, jefes y ultimate |

Kenney no exige atribución por CC0; se acredita igual por buena práctica.

### Fuentes — OFL 1.1

| Fuente | Archivo | Autores | Licencia |
|---|---|---|---|
| Orbitron | `assets/fonts/Orbitron.ttf` | The Orbitron Project Authors | [OFL 1.1](https://openfontlicense.org/) |
| Rajdhani | `assets/fonts/Rajdhani-Bold.ttf` | Indian Type Foundry | [OFL 1.1](https://openfontlicense.org/) |
| Chakra Petch | `assets/fonts/ChakraPetch-Regular.ttf` | Chakra Petch Authors | [OFL 1.1](https://openfontlicense.org/) |
| Exo 2 | `assets/fonts/Exo2.ttf` | Exo 2 Authors | [OFL 1.1](https://openfontlicense.org/) |

El texto completo de la OFL está en
[`docs/licenses/OFL-1.1.txt`](licenses/OFL-1.1.txt). Las fuentes no se venden
por separado; se distribuyen embebidas con el juego.

## Assets retirados

La versión pública del repo incluye **solo los 33 assets que el juego usa**.
Los sprites, sonidos y fuentes descargados que no se conectaron no forman parte
del repositorio ni del APK. El inventario completo de los usados está en
[ASSETS.md](ASSETS.md).

## Atribución en la app

La app Android debe incluir una pantalla **Créditos / Licencias** con:

- Lorc / game-icons.net, CC BY 3.0 (icono Ultimate, recoloreado).
- Kenney / OpenGameArt, CC0.
- Fuentes OFL 1.1 y link al texto de la licencia.

Esa pantalla se agrega en la etapa de packaging Android. Mientras tanto, estos
documentos son la fuente de verdad.
