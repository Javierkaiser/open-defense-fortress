# Avisos de terceros — Open Defense Fortress

El **código** de este proyecto es [MIT](LICENSE) y `LICENSE` contiene únicamente el
texto canónico de la licencia MIT (sin notas adicionales), para que GitHub lo
detecte como SPDX `MIT`.

Los **assets** (sprites, sonidos, fuentes) tienen licencias propias y se
distribuyen con el proyecto respetando esas licencias. El inventario completo,
autor por autor y asset por asset, está en:

- [`docs/CREDITS.md`](docs/CREDITS.md) — créditos y atribuciones completas.
- [`docs/ASSETS.md`](docs/ASSETS.md) — inventario y origen de cada asset.
- [`docs/licenses/CC-BY-3.0.txt`](docs/licenses/CC-BY-3.0.txt) — texto de CC BY 3.0.
- [`docs/licenses/OFL-1.1.txt`](docs/licenses/OFL-1.1.txt) — texto de la SIL OFL 1.1.

## Resumen de licencias de terceros

| Componente | Licencia | Requiere atribución |
|---|---|---|
| Icono del Ultimate (`assets/sprites/ui_tinted/icon_ultimate_gold.png`), de **Lorc** (game-icons.net) | CC BY 3.0 | **Sí** |
| Sprites y SFX de **Kenney** (kenney.nl) | CC0 1.0 | No (se acredita igual) |
| Explosión de jefe, de **BenHickling** (OpenGameArt) | CC0 1.0 | No (se acredita igual) |
| Fuentes **Orbitron, Rajdhani, Chakra Petch, Exo 2** | SIL OFL 1.1 | Se conserva el aviso de copyright de cada fuente |

## Cumplimiento de la atribución

La atribución de **Lorc / game-icons.net (CC BY 3.0)** —autor, título, fuente,
licencia y cambio realizado (recoloreado)— aparece en `docs/CREDITS.md` **y
dentro del juego**, en la pantalla **CRÉDITOS Y LICENCIAS** (menú principal →
botón CRÉDITOS), que es la obra distribuida, tal como exige CC BY 3.0 §4.

El texto completo de las licencias (MIT, CC BY 3.0 y OFL 1.1) viaja embebido en
`js/licenses.js`: no depende de la red ni de que el jugador abra un link. En
particular, el texto de **OFL 1.1** se distribuye con las fuentes, como exige
esa licencia (`docs/` no forma parte del build publicado).

La ficha de la tienda (cuando exista) reutiliza el mismo bloque de atribución.

## Marcas y nombres

"Open Defense Fortress" es el nombre del proyecto. Las marcas de terceros
mencionadas en la documentación (Kenney, game-icons.net, OpenGameArt, Google
Play, etc.) pertenecen a sus respectivos titulares y se usan solo para
identificar el origen de los assets.
