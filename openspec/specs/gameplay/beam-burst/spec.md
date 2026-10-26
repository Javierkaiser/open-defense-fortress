# gameplay/beam-burst Specification

## Purpose
Define el ciclo de daño del Beam: entra con poco daño, se cocina mientras mantiene el foco sobre el mismo blanco, dispara en ventanas de duración fija y descansa un cooldown que solo se dispara al cerrarse la ventana (nunca al cambiar de blanco).

## Requirements

### Requirement: Daño de entrada bajo y ramp por tiempo de foco

El Beam MUST entrar con un daño por segundo BAJO (del orden de un tercio del DPS sostenido de una torre de daño básica) y MUST sumar daño de forma continua mientras mantiene el MISMO blanco, con un tope de multiplicador declarado. El multiplicador MUST volver al inicio cuando el blanco cambia o se pierde.

#### Scenario: El daño crece con el tiempo de foco

- **WHEN** el haz mantiene el mismo blanco durante varios segundos
- **THEN** su DPS crece de forma continua desde el valor de entrada hasta el tope declarado

#### Scenario: Cambiar de blanco reinicia el ramp

- **WHEN** el blanco muere y el haz adquiere otro dentro de la misma ventana
- **THEN** el multiplicador vuelve al valor de entrada (el daño acumulado no se hereda)

### Requirement: Ventana de ataque y cooldown

El Beam MUST disparar en **ventanas de duración fija** y, al cerrarse una ventana, MUST entrar en un **cooldown** con el haz apagado y sin adquirir blancos nuevos. El cooldown MUST dispararse **solo** al terminar la ventana: un cambio de blanco dentro de la ventana MUST NOT interrumpirla ni provocar cooldown.

#### Scenario: El blanco muere dentro de la ventana

- **WHEN** el blanco muere antes de que termine la ventana y hay otro enemigo en la ventana de adquisición
- **THEN** el haz re-adquiere y sigue disparando hasta que la ventana se cierre

#### Scenario: La ventana se cierra

- **WHEN** se agota la duración de la ventana
- **THEN** el haz se apaga, no adquiere blancos nuevos y espera el cooldown antes de volver a disparar

#### Scenario: Cambiar de blanco no dispara cooldown

- **WHEN** el blanco cambia dentro de la ventana de ataque
- **THEN** el haz no entra en cooldown: sigue disparando con el ramp reiniciado

### Requirement: Un solo blanco por disparo

El haz MUST dañar **solo al blanco elegido**. El ancho del haz (`columnHalfWidth`) MUST funcionar como ventana de adquisición y como grosor visual, y MUST NOT repartir daño a otros enemigos que lo crucen.

#### Scenario: Dos enemigos dentro del ancho

- **WHEN** hay dos enemigos dentro de la ventana de adquisición y el haz tiene uno como blanco
- **THEN** solo el blanco pierde vida

#### Scenario: El ancho no cambia el daño

- **WHEN** se ensancha el haz (nivel, perks o `Sensores Ampliados`)
- **THEN** el daño que recibe el blanco es el mismo: el ancho solo cambia a quién puede apuntar

### Requirement: El ciclo del haz se ve

El estado del ciclo MUST ser legible en pantalla: el haz MUST mostrar su ramp (grosor o brillo crecientes con el tiempo de foco) y el emisor MUST verse apagado durante el cooldown.

#### Scenario: El ramp se nota

- **WHEN** el haz lleva varios segundos sobre el mismo blanco
- **THEN** se ve más grueso o más brillante que al empezar

#### Scenario: El cooldown se nota

- **WHEN** el haz está en cooldown
- **THEN** no hay rayo dibujado y el emisor se ve apagado
