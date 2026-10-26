# gameplay/tower-coverage Specification

## Purpose
Define DÓNDE puede pegar una torre que no cubre todo el campo: la banda horizontal de la Tesla (ancho completo con alcance vertical corto) y el alcance al borde del haz estático del Láser, más la regla de encadenado local del rayo en cadena.

## Requirements

### Requirement: Banda de cobertura de la Tesla

El alcance de la Tesla MUST ser una **banda horizontal**: MUST NOT tener límite de X (cualquier columna del campo, incluida la esquina opuesta) y MUST limitarse verticalmente a un tramo corto sobre la fila de torres (del orden del 38 % inferior del campo en el layout de referencia). El borde superior de la banda MUST atarse al layout para que el tiempo bajo fuego sea el mismo en cualquier alto de canvas.

#### Scenario: Un enjambre en la esquina opuesta recibe la descarga

- **WHEN** un enemigo cae en el extremo opuesto del campo, dentro de la altura de la banda
- **THEN** la Tesla lo adquiere y le pega (el alcance no depende de X)

#### Scenario: Un enemigo por encima de la banda no recibe nada

- **WHEN** el único enemigo vivo está por encima del borde superior de la banda
- **THEN** la Tesla no lo adquiere y no descarga

#### Scenario: El tiempo bajo fuego es el mismo en el marco alto

- **WHEN** se compara el tiempo que un enemigo permanece dentro de la banda en el layout de referencia (880) y en el alto (1195)
- **THEN** el tiempo es equivalente (el borde se escala con `LAYOUT.fallScale`)

### Requirement: Cadena por cercanía local

Los saltos de la cadena de la Tesla MUST elegirse por cercanía al nodo ANTERIOR de la cadena (radio local del orden de 170 px), no por distancia a la torre, para que la descarga siga al enjambre donde esté.

#### Scenario: La cadena sigue al enjambre lejos de la torre

- **WHEN** el blanco inicial es el enjambre que cae por la esquina opuesta a la torre
- **THEN** los saltos siguientes caen dentro del mismo enjambre (cercanía local) y no se descartan por estar lejos de la torre

#### Scenario: Sin vecinos no hay saltos

- **WHEN** el blanco inicial está aislado (ningún enemigo dentro del radio local)
- **THEN** la descarga pega solo a ese blanco

### Requirement: Alcance al borde del haz estático

El rayo estático del Láser MUST extenderse desde la boca de la torre hasta el **borde del campo** en la dirección de su ángulo (el tope o un lateral, lo que ocurra primero). MUST NOT cortarse antes de salir del campo y MUST NOT salirse del canvas.

#### Scenario: Cualquier ángulo sale por el borde

- **WHEN** el rayo dispara a 0°, 30°, 45° y −40°
- **THEN** su extremo cae sobre el borde del campo (y = 0 o un lateral), nunca a media altura

#### Scenario: El rayo no se sale del canvas

- **WHEN** se mide el segmento del rayo en cualquier ángulo del juego
- **THEN** sus dos extremos están dentro del canvas (el de salida sobre el borde)

#### Scenario: El rayo penetrante gana alcance

- **WHEN** un enemigo cruza la línea del rayo más allá de la longitud vieja (700 px)
- **THEN** recibe daño (el hitbox del rayo llega hasta el borde)
