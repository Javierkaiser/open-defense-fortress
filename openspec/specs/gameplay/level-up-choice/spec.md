# gameplay/level-up-choice Specification

## Purpose

El modal de elección de cartas (`#card-choice`) se abre cada vez que el jugador
sube de nivel y le ofrece 1 de 3 mejoras con el juego en pausa. Es la única
superficie del HUD que decide la build de la run: una elección accidental no se
puede deshacer y una descripción sin unidad deja al jugador adivinando qué
mejora compró. Este documento fija un único gesto válido de selección (puntero
real), el silencio del teclado mientras el modal está abierto, el foco inicial y
los rótulos mínimos de cada carta (unidad y requisitos).

## Requirements

### Requirement: Selección por puntero o teclado deliberado

Una carta MUST elegirse con un gesto de puntero real (un `pointerdown` sobre
la carta seguido de un `click` sobre la misma carta dentro de 1 s) **o** con
un `Enter` sobre la carta que tiene el foco. El foco inicial MUST estar en el
diálogo, no en una carta, así que ninguna tarjeta se activa sola al abrirse.

Un `click` sin `pointerdown` sobre una carta que **no** tiene el foco MUST NOT
elegir. Un `pointerdown` sobre una carta seguido de un `click` sobre otra MUST
NOT elegir ninguna de las dos. Espacio MUST NOT elegir una carta.

#### Scenario: Un click de puntero elige la carta

- **WHEN** el jugador apoya el puntero sobre una carta y suelta sobre la misma carta
- **THEN** esa carta se aplica y el modal se cierra

#### Scenario: Un click sin pointerdown y sin foco no elige

- **WHEN** llega un `click` sobre una carta sin un `pointerdown` previo y esa carta no tiene el foco
- **THEN** la carta no se aplica, el modal sigue abierto y la oferta no cambia

#### Scenario: Enter sobre la carta enfocada elige

- **WHEN** el jugador llega con Tab a una carta y pulsa Enter
- **THEN** esa carta se aplica y el modal se cierra

#### Scenario: Espacio nunca elige

- **WHEN** una carta tiene el foco y el jugador pulsa Espacio
- **THEN** esa carta no se elige y el modal sigue abierto

#### Scenario: El puntero se va de la carta

- **WHEN** el jugador hace `pointerdown` sobre una carta y suelta sobre otra carta
- **THEN** ninguna de las dos se aplica

#### Scenario: El gesto se interrumpe

- **WHEN** el navegador cancela el puntero (`pointercancel`), el puntero sale del modal o se pierde el foco durante el gesto
- **THEN** el gesto armado se limpia y el siguiente click no elige por arrastre

#### Scenario: Dos toques rápidos no compran dos cartas

- **WHEN** el jugador toca dos veces la misma carta dentro de la ventana
  anti-doble-toque (`canPickCard`)
- **THEN** la segunda elección se descarta y sólo cuenta la primera

### Requirement: Teclado en el modal

Con `#card-choice` abierto, Espacio MUST NOT disparar el ultimate ni elegir la
carta enfocada. Enter MUST elegir la carta que tiene el foco (camino de
teclado/tecnología asistiva). Tab y Shift+Tab MUST ciclar el foco dentro del
modal, Escape MUST cerrar sólo el modal de PERK (el de cartas no se puede
cerrar sin elegir) y el botón "Lista de Combos" MUST seguir activándose con
Enter y con click.

#### Scenario: Espacio no dispara el ultimate

- **WHEN** el modal está abierto y el jugador mantiene o pulsa Espacio
- **THEN** el ultimate no se dispara y ninguna carta se elige

#### Scenario: Espacio no activa la carta enfocada

- **WHEN** una carta tiene el foco y el jugador pulsa Espacio
- **THEN** esa carta no se elige y el modal sigue abierto

#### Scenario: Enter sobre una carta enfocada elige

- **WHEN** una carta tiene el foco y el jugador pulsa Enter
- **THEN** esa carta se elige

#### Scenario: Lista de Combos conserva el teclado

- **WHEN** el foco está en el botón "Lista de Combos" y el jugador pulsa Enter
- **THEN** el panel de combos se abre igual que con un click de puntero

### Requirement: Foco y accesibilidad

Al abrirse, el modal MUST poner el foco en el contenedor `#card-choice`
(`tabindex="-1"`), no en la primera carta. El trap de foco MUST seguir ciclando
con Tab y Shift+Tab entre los controles del modal y MUST devolver el foco al
elemento anterior al cerrarse. Ningún pick MUST aceptarse en los primeros
`CARD_OPEN_GUARD_MS` (180 ms) desde que el modal se muestra.

#### Scenario: El foco inicial es el diálogo

- **WHEN** el modal se abre con una oferta de 3 cartas
- **THEN** `document.activeElement` es el contenedor `#card-choice` y ninguna carta tiene el foco

#### Scenario: El guard de apertura frena el primer instante

- **WHEN** llega un gesto de puntero válido dentro de los primeros 180 ms de vida del modal
- **THEN** la carta no se elige y el modal sigue abierto

#### Scenario: El trap devuelve el foco

- **WHEN** el modal se cierra por elección o por Escape
- **THEN** el foco vuelve al elemento que lo tenía antes de abrirse

### Requirement: Opciones alcanzables en pantallas bajas

Si las tres cartas no entran en el alto disponible, la columna de cartas MUST
scrollear y MUST mostrar una pista visible ("deslizá ↓") y un degradado
inferior; ambos MUST apagarse al llegar al final. Ninguna opción MUST quedar
inalcanzable. Si todo entra, MUST NOT mostrarse la pista ni el degradado.

#### Scenario: Pantalla baja

- **WHEN** el modal se abre en 360×640 y la columna no entra entera
- **THEN** la columna scrollea, muestra "deslizá ↓" y la tercera carta se alcanza al deslizar

#### Scenario: Todo entra

- **WHEN** las cartas entran en el alto del modal
- **THEN** no aparece el degradado ni la pista de scroll

### Requirement: Identificación de la unidad

Cada carta MUST mostrar un chip de unidad con uno de estos formatos exactos:
`TORRE · <NOMBRE>`, `DRON · <NOMBRE>`, `NUEVA TORRE · <NOMBRE>`,
`NUEVO DRON · <NOMBRE>`, `COMBO · <UNIDAD + UNIDAD>`, `TIPO · <TIPO DE DAÑO>` o
`GLOBAL · TODAS`. El `<NOMBRE>` MUST ser el nombre del catálogo de torres o
drones del juego (no el id interno) en mayúsculas. Una carta que afecta a todas
las unidades MUST rotularse `GLOBAL · TODAS`.

#### Scenario: Una mejora de torre nombra su torre

- **WHEN** la oferta incluye una carta dedicada de la torre Láser
- **THEN** su chip dice `TORRE · LÁSER`

#### Scenario: Una mejora de dron nombra su dron

- **WHEN** la oferta incluye una carta dedicada de un dron
- **THEN** su chip empieza con `DRON · ` y nombra ese dron, no una torre

#### Scenario: Un desbloqueo avisa que la unidad es nueva

- **WHEN** la oferta incluye la carta que desbloquea una torre
- **THEN** su chip dice `NUEVA TORRE · <NOMBRE>` con el nombre de esa torre

#### Scenario: Una combo nombra las dos piezas

- **WHEN** la oferta incluye una carta de combo entre dos unidades
- **THEN** su chip dice `COMBO · <UNIDAD + UNIDAD>` con los nombres de las dos piezas

#### Scenario: Una carta global no nombra unidad

- **WHEN** la oferta incluye una carta que afecta a todas las torres y drones
- **THEN** su chip dice `GLOBAL · TODAS`

### Requirement: Descripciones legibles

Toda carta MUST declarar en su descripción qué cambia, con número y unidad de
medida (porcentaje, segundos, píxeles, cantidad), y MUST NOT usar jerga interna
(`ramp`, `homing`, `ttk`, `proc`, `stack`). Cuando la carta declare
`requiresUnits`, `requiresTags` o `requiresBlackHole` y la descripción no
mencione el requisito, la carta MUST mostrar una línea `Requiere: …` con la
condición en castellano y el nombre de la unidad o tag implicados.

#### Scenario: La descripción dice el número y la unidad

- **WHEN** la oferta muestra una carta de recarga
- **THEN** su descripción indica cuánto baja la recarga en porcentaje o en segundos

#### Scenario: Una carta con requisito muestra la línea Requiere

- **WHEN** la oferta incluye una carta con `requiresUnits` o `requiresBlackHole` y su descripción no menciona el requisito
- **THEN** la carta muestra una línea `Requiere: …` con la unidad o el estado exigido

#### Scenario: El requisito ya descrito no se repite

- **WHEN** la descripción de la carta ya nombra el requisito
- **THEN** no se agrega la línea `Requiere: …` duplicada
