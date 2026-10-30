# gameplay/arsenal-limit Specification

## Purpose
Una partida tiene un **arsenal acotado**: como máximo 5 torres y 1 dron simultáneos. El límite no es un número de diseño suelto — sale de cuántos lugares hay para construir y de cuántos drones caben, así que no se puede violar ni por sorteo ni por código. El objetivo es que ninguna run pueda tener todo el arsenal andando a la vez y que cada partida sea un subconjunto distinto del catálogo.

## Requirements

### Requirement: Límite de torres simultáneas

Una partida MUST NOT tener más de 5 torres colocadas a la vez. El límite se impone por la **cantidad de slots de construcción**: si no hay slot libre, una torre nueva no puede entrar aunque el jugador la elija.

#### Scenario: Se llena el quinto slot

- **GIVEN** una partida con 5 torres colocadas
- **WHEN** el jugador recibe una carta de desbloqueo de torre
- **THEN** esa carta no aparece en la oferta, porque no hay ningún slot libre donde colocar la torre

#### Scenario: El Guardian siempre entra

- **GIVEN** una partida recién arrancada
- **THEN** el Guardian ya está colocado en el slot central, sin haber pasado por ninguna carta, y ocupa uno de los 5 lugares

#### Scenario: Una torre no reemplaza a otra

- **GIVEN** una partida con los 5 slots ocupados
- **WHEN** el juego intenta colocar una torre por cualquier vía
- **THEN** la colocación falla y la torre no entra: las torres nunca se pisan entre sí

### Requirement: Límite de drones simultáneos

Una partida MUST NOT tener más de 1 dron activo a la vez. Los drones no ocupan slots de construcción (vuelan), así que su cupo es una constante propia y no el número de slots.

#### Scenario: Ya hay un dron

- **GIVEN** una partida con 1 dron activo
- **WHEN** el jugador recibe una carta de desbloqueo de dron
- **THEN** esa carta no aparece en la oferta

#### Scenario: Los tres drones siguen siendo alcanzables

- **GIVEN** tres partidas distintas
- **WHEN** en cada una el jugador desbloquea un dron distinto
- **THEN** las tres son válidas: el límite es 1 por partida, no la exclusión de un dron concreto

### Requirement: El arsenal se completa con lo que sale en las cartas

Las torres y los drones MUST entrar por las cartas de desbloqueo que aparezcan durante la partida. No hay selección previa de arsenal ni garantía de que una unidad concreta vaya a salir.

#### Scenario: Una partida con arsenal incompleto es válida

- **GIVEN** una partida que termina con 3 torres y sin dron
- **THEN** el juego la da por válida y no la penaliza: el arsenal incompleto es un resultado posible, no un error

#### Scenario: La oferta no se traba

- **GIVEN** un momento en el que todas las cartas de desbloqueo son inelegibles (arsenal lleno)
- **WHEN** el jugador sube de nivel
- **THEN** la oferta se arma igual con cartas de mejora: nunca queda vacía ni bloquea la partida

### Requirement: La plataforma tiene exactamente 5 lugares de construcción

La plataforma MUST ofrecer 5 slots de torre, todos en la misma fila, con el slot central reservado al Guardian en el arranque.

#### Scenario: Geometría de los slots

- **GIVEN** la plataforma de juego
- **THEN** hay 5 lugares de construcción, todos a la misma altura, y el del centro coincide con el eje de la base

#### Scenario: La fila trasera ya no existe

- **GIVEN** la plataforma de juego
- **THEN** no hay una segunda fila de montaje del arsenal: no quedan lugares de construcción muertos que nunca se podrán ocupar

### Requirement: El arsenal limitado solo ofrece unidades desbloqueadas

Una unidad MUST estar desbloqueada en el meta-juego para que su carta de
desbloqueo pueda aparecer en una partida. El Guardian es la única unidad
desbloqueada por defecto; las demás se compran con oro en la pantalla
TORRETAS. Los fragmentos son un pool compartido: una unidad no usada en la
partida no recibe un saldo propio.

#### Scenario: Unidad bloqueada no aparece en la oferta

- **GIVEN** una cuenta nueva con solo Guardian desbloqueado
- **WHEN** el jugador sube de nivel en una partida
- **THEN** las cartas `unlock_*` de las unidades bloqueadas no aparecen

#### Scenario: Unidad comprada sí puede entrar

- **GIVEN** una cuenta que compró Missile con oro
- **WHEN** el jugador sube de nivel y hay un slot libre
- **THEN** la carta de Missile puede aparecer en la oferta

#### Scenario: El pool no se reparte por unidad

- **GIVEN** una partida ganada en la que no se usó el Tesla
- **THEN** el pool compartido recibe los mismos 300/600 fragmentos; no hay
  un saldo separado para Tesla
