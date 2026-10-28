# gameplay/card-synergies Specification

## Purpose

Define el sistema de tags y prerrequisitos de las cartas de mejora: daño
global vs daño por tipo, combos de dos piezas y cartas de Black Hole. Evita
ofrecer cartas muertas cuyo efecto depende de una unidad o estado ausente.

## Requirements

### Requirement: Daño global vs daño por tipo

Las cartas de daño global MUST dar +10% por stack (tope 2) y afectar a
todas las torres y drones, incluidas las unidades desbloqueadas después.
Las cartas de daño por tipo MUST dar +20% por stack (tope 2), afectar solo
a las unidades de ese tipo y exigir que el jugador posea al menos una.

#### Scenario: Torre desbloqueada después del buff global

- **WHEN** el jugador elige Munición Reforzada y después desbloquea una torre
- **THEN** la torre nueva hereda el multiplicador global ya elegido

#### Scenario: Carta de tipo sin unidad del tipo

- **WHEN** el jugador no tiene ninguna unidad eléctrica
- **THEN** la carta de daño eléctrico no entra en la oferta

### Requirement: Tags y prerrequisitos

Cada unidad MUST declarar sus tags de tipo y mecánica. Las cartas MUST poder
declarar `requiresTags`, `requiresAllTags`, `requiresUnits`,
`requiresTagCount` o `requiresBlackHole`. `isRelevant()` y el relleno de la
oferta MUST respetar esos prerrequisitos.

#### Scenario: Balas Detonantes sin torre explosiva

- **WHEN** el jugador tiene solo el Guardian
- **THEN** Balas Detonantes no se ofrece

#### Scenario: Balas Detonantes con Missile o Mortar

- **WHEN** el jugador tiene Missile o Mortar
- **THEN** Balas Detonantes puede entrar en la oferta

### Requirement: Explosión al impactar

Balas Detonantes MUST hacer que las balas del Guardian detonen al impactar,
una vez por proyectil, con un porcentaje del daño en un radio. MUST excluir
al blanco directo del daño de área.

#### Scenario: Impacto con vecinos

- **WHEN** una bala detona sobre un enemigo y hay otro dentro del radio
- **THEN** el vecino recibe el daño de área y el blanco directo no lo recibe dos veces

### Requirement: Combos de dos piezas

Las cartas de combo MUST exigir todas sus unidades o tags y MUST aplicar su
efecto a cada pieza. No MUST ofrecerse si falta una pieza.

#### Scenario: Reactor de Cadena

- **WHEN** el jugador tiene Thunderstroke y Tesla
- **THEN** Reactor de Cadena puede ofrecerse y suma +1 salto a la Tesla y +1 mini rayo al Thunderstroke

#### Scenario: Prisma Compuesto sin Láser

- **WHEN** el jugador tiene Beam pero no Láser
- **THEN** Prisma Compuesto no se ofrece

### Requirement: Cartas de Black Hole

Las cartas de Black Hole MUST exigir `blackHoleUnlocked`. Los mods MUST ser
por instancia (duración, radio, colapso, singularidad) y MUST NOT mutar la
constante compartida `BLACK_HOLE`. Los mini agujeros negros de Singularidad
MUST NOT bloquear el disparo del Black Hole principal.

#### Scenario: Horizonte de Sucesos

- **WHEN** el jugador desbloqueó Black Hole y elige Horizonte de Sucesos
- **THEN** el siguiente vórtice dura +1,5 s y tiene +20% de radio

#### Scenario: Singularidad sin explosivos

- **WHEN** el jugador tiene Black Hole pero ninguna torre con tag `blast`
- **THEN** Singularidad no se ofrece
