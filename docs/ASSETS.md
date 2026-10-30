# Assets usados — inventario y licencias

El repo público incluye **33 archivos** bajo `assets/` (≈1,2 MB). Todo lo demás
se retiró. Cada archivo tiene su licencia y su origen.

Las skins de torres/drones de la 1.6.0 son **100 % vectoriales**: no agregan
archivos ni requests. Las texturas por skin quedan para una versión posterior.

## Fuentes (4)

| Archivo | Uso | Licencia | Origen |
|---|---|---|---|
| `fonts/Orbitron.ttf` | Títulos/HUD | OFL 1.1 | [Google Fonts — Orbitron](https://fonts.google.com/specimen/Orbitron) |
| `fonts/Rajdhani-Bold.ttf` | Texto/UI | OFL 1.1 | [Google Fonts — Rajdhani](https://fonts.google.com/specimen/Rajdhani) |
| `fonts/ChakraPetch-Regular.ttf` | Alternativa techno | OFL 1.1 | [Google Fonts — Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch) |
| `fonts/Exo2.ttf` | Números tabulares | OFL 1.1 | [Google Fonts — Exo 2](https://fonts.google.com/specimen/Exo+2) |

Texto de la licencia: [`docs/licenses/OFL-1.1.txt`](licenses/OFL-1.1.txt).

## SFX (18)

Todos CC0 1.0, de los packs de sonido de Kenney.

| Archivo | Pack / fuente | Uso |
|---|---|---|
| `sfx/shot_bullet.ogg` | Sci-Fi Sounds (`laserSmall_000`) | Guardian |
| `sfx/shot_pew.ogg` | Sci-Fi Sounds (`laserRetro_000`) | Missile y drones |
| `sfx/laser_beam.ogg` | Sci-Fi Sounds (`laserLarge_002`) | Beam |
| `sfx/laser_digital.ogg` | Digital Audio (`laser1`) | Gauss |
| `sfx/explosion.ogg` | Sci-Fi Sounds (`explosionCrunch_002`) | Game over / perk boom |
| `sfx/explosion_alt.ogg` | Sci-Fi Sounds (`explosionCrunch_003`) | Jefe / ultimate |
| `sfx/explosion_small.ogg` | Sci-Fi Sounds (`explosionCrunch_000`) | Kill |
| `sfx/impact_hit.ogg` | Sci-Fi Sounds (`impactMetal_001`) | Remate |
| `sfx/impact_light.ogg` | Impact Sounds (`impactGeneric_light_001`) | Golpe a la base |
| `sfx/blob_slime.ogg` | Sci-Fi Sounds (`slime_000`) | Mortero |
| `sfx/shield_field.ogg` | Sci-Fi Sounds (`forceField_000`) | Escudo / Beam |
| `sfx/level_up.ogg` | Digital Audio (`powerUp6`) | Level up |
| `sfx/stage_clear.ogg` | Digital Audio (`phaseJump2`) | Stage clear |
| `sfx/card_select.ogg` | Interface Sounds (`confirmation_001`) | Carta |
| `sfx/boss_warning.ogg` | Interface Sounds (`error_001`) | Aviso de jefe |
| `sfx/ultimate.ogg` | Digital Audio (`phaserUp6`) | Ultimate |
| `sfx/click_ui.ogg` | Interface Sounds (`click_001`) | Thunderstroke |
| `sfx/click_ui_alt.ogg` | UI Pack (`Sounds/click-a.ogg`) | Tesla |

## Sprites (11)

| Archivo | Uso | Licencia | Origen | Cambio |
|---|---|---|---|---|
| `sprites/explosions/explosion_sheet_50frames.png` | Explosión de jefe (50 frames de 100×100) | CC0 1.0 | [OpenGameArt — Explosion 7](https://opengameart.org/content/explosion-7) (BenHickling) | — |
| `sprites/particles/particle_star_01.png` | Destellos de multi-kill | CC0 1.0 | [Kenney Particle Pack](https://kenney.nl/assets/particle-pack) (`star_01`) | — |
| `sprites/ui_tinted/icon_pause_teal.png` | Pausa | CC0 1.0 | [Kenney Game Icons](https://kenney.nl/assets/game-icons) (`pause`) | Recoloreado |
| `sprites/ui_tinted/icon_ultimate_gold.png` | Ultimate | **CC BY 3.0** | [Lorc / game-icons.net](https://game-icons.net/1x1/lorc/power-lightning.html) | Recoloreado |
| `sprites/ui_tinted/icon_boss_warning_red.png` | Aviso de jefe | CC0 1.0 | [Kenney Simple Space](https://kenney.nl/assets/simple-space) (`icon_exclamationLarge`) | Recoloreado |
| `sprites/ui_tinted/sparkle_gold.png` | Destellos de STAGE CLEAR | CC0 1.0 | Kenney Particle Pack (`star_01`) | Recoloreado |
| `sprites/ui_tinted/tower_guardian.png` | Chasis Guardian | CC0 1.0 | [Kenney Sci-Fi RTS](https://kenney.nl/assets/sci-fi-rts) (`scifiStructure_01..16`) | Recoloreado |
| `sprites/ui_tinted/tower_missile.png` | Chasis Missile | CC0 1.0 | Kenney Sci-Fi RTS | Recoloreado |
| `sprites/ui_tinted/tower_beam.png` | Chasis Beam | CC0 1.0 | Kenney Sci-Fi RTS | Recoloreado |
| `sprites/ui_tinted/tower_thunder.png` | Chasis Thunderstroke | CC0 1.0 | Kenney Sci-Fi RTS | Recoloreado |
| `sprites/ui_tinted/tower_tesla.png` | Chasis Tesla | CC0 1.0 | Kenney Sci-Fi RTS | Recoloreado |

## Atribución obligatoria

El único asset con atribución obligatoria es el icono del Ultimate:

> **Lorc**, [game-icons.net](https://game-icons.net/1x1/lorc/power-lightning.html),
> [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Recoloreado.

Se muestra en la pantalla **CRÉDITOS Y LICENCIAS** del juego (estado `CREDITS`
de la FSM, menú principal → CRÉDITOS), armada por `buildCreditsHtml()` en
`js/hud.js` a partir de `js/licenses.js`; la ficha de la tienda reutiliza el
mismo bloque.
