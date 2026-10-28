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
`requiresTagCount`, `requiresCards`, `requiresAnyCards` o `requiresBlackHole`.
`isRelevant()` y el relleno de la oferta MUST respetar esos prerrequisitos.

#### Scenario: Combo que exige una técnica

- **WHEN** el jugador no eligió Balas Gélidas
- **THEN** Cero Absoluto, Fractura Criogénica y Onda Glacial no se ofrecen

#### Scenario: Técnica elegida y pareja presente

- **WHEN** el jugador eligió Balas Gélidas y tiene una torre de luz
- **THEN** Cero Absoluto puede entrar en la oferta

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

### Requirement: Slow con duración

Balas Gélidas MUST aplicar un slow con duración (1,5 s) y no un efecto de un
solo frame. El slow MUST acumular la fracción más fuerte y el timer más largo,
y MUST respetar la inmunidad del afijo `tenaz`.

#### Scenario: Slow persistente

- **WHEN** una bala con Balas Gélidas impacta a una espora
- **THEN** la espora avanza más lento durante 1,5 s, no solo el frame del impacto

#### Scenario: Tenaz ignora el slow

- **WHEN** un enemigo `tenaz` recibe Balas Gélidas
- **THEN** su velocidad no cambia

### Requirement: Marcas de combo

Marca de Riel y Enlace de Enjambre MUST usar marcas temporales en el enemigo
(`rail`/`swarm`, 2 s). La marca MUST decrementarse en `Enemy.update` y MUST
NOT aplicar bonificaciones si expiró.

#### Scenario: Marca de Riel expira

- **WHEN** el Gauss marca a un enemigo y pasan más de 2 s
- **THEN** las balas del Guardian ya no reciben el +25%

### Requirement: Combos de frío, lifesteal y mecánica

El catálogo MUST incluir los 11 combos de la fase 74.2: Cero Absoluto,
Fractura Criogénica, Onda Glacial, Cosecha Explosiva, Pacto de Sangre,
Transfusión, Marca de Riel, Enlace de Enjambre, Juicio Final, Rebote Conductor
y Perforación Compartida. Cada uno MUST exigir su técnica/unidad/tag y MUST
tener un efecto medible en combate.

#### Scenario: Cosecha Explosiva

- **WHEN** el jugador tiene Balas Vampíricas y Missile o Mortar
- **THEN** Cosecha Explosiva puede ofrecerse y las explosiones curan 2% del daño

#### Scenario: Juicio Final

- **WHEN** el jugador tiene Cabeza Aturdidora y Thunderstroke
- **THEN** el Thunderstroke hace +30% a enemigos aturdidos y alarga su stun
