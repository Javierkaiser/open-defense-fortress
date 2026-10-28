# gameplay/thunderstroke-area Specification

## Purpose

Define el rol del Thunderstroke como tirador pesado de alcance total: un
rayo principal al enemigo más lejano y un estallido de mini rayos de área
en el punto de impacto, distinto de la cadena de la Tesla.

## Requirements

### Requirement: Alcance total de pantalla

El Thunderstroke MUST adquirir enemigos en cualquier columna y altura
visible, sin el círculo de 260 px. MUST mantener la política `farthest`
(el más lejano / arriba) y el blanco sticky.

#### Scenario: Enemigo en la esquina opuesta

- **WHEN** el único enemigo vivo cae por la esquina opuesta, fuera del viejo círculo de 260 px
- **THEN** el Thunderstroke lo adquiere y le dispara

#### Scenario: Enemigo en la parte alta

- **WHEN** el enemigo más lejano está en la parte superior de la pantalla
- **THEN** el Thunderstroke lo elige como blanco principal

### Requirement: Un rayo principal

El Thunderstroke MUST disparar UN rayo principal al blanco seleccionado.
MUST NOT encadenar saltos de enemigo a enemigo; la cadena con falloff es la
identidad de la Tesla.

#### Scenario: Sin cadena

- **WHEN** hay enemigos alineados detrás del blanco principal
- **THEN** solo el blanco principal recibe el daño pleno del rayo; los demás solo pueden recibir el estallido de área si están dentro del radio

### Requirement: Estallido de mini rayos

Al impactar, el Thunderstroke MUST dañar con mini rayos a los enemigos
vivos dentro de `areaR` (130 px) del punto de impacto, con `areaFrac`
(50 %) del daño efectivo. MUST excluir al blanco principal del daño de
área y MUST limitar la cantidad a `areaTargets` (3) más los perks de
objetivo.

#### Scenario: Grupo alrededor del impacto

- **WHEN** el rayo principal impacta y hay vecinos dentro de 130 px
- **THEN** cada vecino recibe el 50 % del daño y se dibuja un mini rayo desde el impacto

#### Scenario: Enemigo fuera del radio

- **WHEN** un enemigo está a más de 130 px del impacto
- **THEN** no recibe daño de área

#### Scenario: El principal no se duplica

- **WHEN** el rayo principal impacta a un blanco
- **THEN** ese blanco recibe solo el daño pleno, no el 50 % adicional

### Requirement: Perks de objetivos

Los perks `extraCount` y `chainFork` MUST sumar objetivos de área (mini
rayos), no rayos principales, con un tope de 12 objetivos de área.

#### Scenario: Bifurcación

- **WHEN** el jugador elige un perk `chainFork`
- **THEN** el estallido alcanza a un vecino más, manteniendo un solo rayo principal
