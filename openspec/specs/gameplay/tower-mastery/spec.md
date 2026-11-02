# Tower Mastery

## Purpose

Progresión de las 11 unidades dentro de una run (8 torres + 3 drones): el
nivel (1–6) sube con cartas dedicadas, la maestría (0–15) cuenta las cartas
que la mejoran de forma directa o por sinergia (dedicadas, de tipo, global,
cadencia, combos y legendarias) y cada 5 puntos desbloquea una elección entre
las 3 cartas legendarias de esa unidad. Las cazas de familia NO cuentan para
ninguna de las dos pistas. Es una pista **solo de run**: no toca el
meta-juego, los perks permanentes ni NG+.

## Requirements

### Requirement: Nivel de unidad 1–6

Cada torre y cada dron MUST empezar en nivel 1. Las cartas dedicadas a una
unidad (exclusivas de daño, técnicas, doctrinas, `bullets_5`, `swarm_grow`,
`pierce_up`, `rapid_bullets`) MUST subir su nivel en 1, hasta un
tope de **6**. El nivel MUST dar **+5 % de daño y −2 % de recarga** por nivel
en torres; en drones MUST escalar su efecto principal +5 % por nivel. En el
tope, la carta sigue aplicando su efecto y su maestría, pero el nivel no sube.

#### Scenario: Carta dedicada en una torre

- **WHEN** el jugador elige una carta de daño exclusivo de una torre
- **THEN** la torre sube un nivel (hasta 6), además de recibir el efecto de la carta

#### Scenario: Carta dedicada en un dron

- **WHEN** el jugador elige una carta dedicada a un dron
- **THEN** el dron sube de nivel y su efecto principal escala

#### Scenario: Nivel máximo

- **WHEN** una unidad ya está en nivel 6 y recibe otra carta dedicada
- **THEN** el nivel no supera 6, pero la carta se aplica y la maestría sube

### Requirement: Maestría y umbrales

La maestría de cada unidad MUST empezar en 0 y MUST subir +1 por cada carta
que la mejore: dedicadas, de tipo, daño global, cadencia, combos que la
incluyan y legendarias. Las cartas de desbloqueo, defensa de base, Ultimate,
Black Hole y **caza de familia (`hunt_*`)** NO MUST dar maestría. Cada
**5 puntos** (5, 10 y 15) MUST encolar una elección legendaria para esa
unidad. La maestría MUST NOT persistir fuera de la run.

#### Scenario: Carta global

- **WHEN** el jugador elige una carta de daño global
- **THEN** todas las unidades presentes suman 1 de maestría, sin subir de nivel

#### Scenario: Carta de tipo

- **WHEN** el jugador elige una carta de daño de un tipo
- **THEN** las unidades presentes de ese tipo suman 1 de maestría

#### Scenario: Hito de maestría

- **WHEN** una unidad llega a 5, 10 o 15 de maestría
- **THEN** se encola una elección legendaria para esa unidad

#### Scenario: Caza de familia

- **WHEN** el jugador elige una carta `hunt_*`
- **THEN** su multiplicador contra la familia se aplica a todas las unidades,
  pero ninguna sube de nivel ni gana maestría

### Requirement: Doctrinas

El catálogo MUST incluir **28 cartas Doctrina** dedicadas a una unidad. Cada
una MUST poder elegirse **dos veces** (`CAPS = 2`): el rango 1 y el rango 2
aplican efectos distintos. Cada aplicación MUST subir el nivel (hasta 6) y la
maestría de la unidad. Las doctrinas MUST entrar al pool normal de cartas y
MUST NOT ofrecerse sin poseer la unidad. Las 5 doctrinas de compensación
(Missile, Láser, Rueda de Fuego, Mosquitos y Campo de Fuerza) MUST garantizar
que cada una de esas unidades pueda llegar a maestría 15 con sus cartas
normales y 2 legendarias, sin depender de las cazas.

#### Scenario: Doctrina repetida

- **WHEN** el jugador elige la misma doctrina por segunda vez
- **THEN** aplica el rango 2 y la carta deja de ser elegible

#### Scenario: Doctrina sin la unidad

- **WHEN** el jugador no tiene la unidad de una doctrina
- **THEN** esa doctrina no entra en la oferta

### Requirement: Elección legendaria

Cada unidad MUST tener exactamente **3 cartas legendarias** propias, fuera del
catálogo normal. Al llegar a 5 de maestría se MUST ofrecer una elección con
las 3; al llegar a 10, con las 2 restantes; al llegar a 15, con la última.
Elegir una MUST quitarla del pool de esa unidad para el resto de la run. La
elección MUST aparecer después de la carta que disparó el hito, MUST NOT
consumir un nivel pendiente y MUST encolarse si hay varias unidades. Censura
NO MUST recortar la elección: se muestran 3/2/1 cartas.

#### Scenario: Primer draft

- **WHEN** una unidad llega a 5 de maestría
- **THEN** el jugador elige 1 de sus 3 legendarias y las otras 2 quedan para el siguiente hito

#### Scenario: Segundo draft

- **WHEN** la misma unidad llega a 10 de maestría
- **THEN** el jugador elige 1 de las 2 legendarias restantes

#### Scenario: Censura

- **WHEN** el Protocolo tiene Censura activa y una unidad llega a 5 de maestría
- **THEN** la elección legendaria sigue mostrando 3 opciones

#### Scenario: Legendaria elegida

- **WHEN** el jugador elige una legendaria
- **THEN** la carta se aplica, sube el nivel si corresponde, suma 1 de maestría y no puede volver a elegirse

### Requirement: HUD de maestría

El modal de cartas MUST mostrar el nivel y la maestría de las torres Y drones
poseídos. La elección legendaria MUST tener título propio, unidad, umbral de
maestría y el aviso de que no consume un nivel pendiente. El HUD MUST mostrar
los 6 niveles posibles en los pips del pad.

#### Scenario: Fila de unidades

- **WHEN** el jugador abre una oferta de cartas
- **THEN** ve cada unidad con su nivel y su maestría actual

#### Scenario: Draft legendario

- **WHEN** se abre una elección legendaria
- **THEN** el modal dice LEGENDARIA, la unidad y MAESTRÍA 5/10/15
