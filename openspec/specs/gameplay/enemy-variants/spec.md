# gameplay/enemy-variants Specification

## Purpose
Las variantes de élite son modificadores que se aplican a tipos de enemigo ya existentes para crear picos de amenaza legibles (escudado, veloz, regenerador) sin agregar inmunidades: toda variante se puede matar con cualquier tipo de daño, sólo cambia cuánto cuesta.

## Requirements

### Requirement: Catálogo de variantes

El sistema MUST declarar **siete** variantes con sus modificadores: `escudado` (escudo frontal
de pool plano), `veloz` (velocidad ×1,4 y HP ×0,7), `regenerador` (cura 2 %/s mientras vive),
`divisor` (se parte en dos al morir), `sanador` (aura que cura aliados), `acorazado`
(armadura plana por golpe) y `tenaz` (inmune a slow y stun). Una variante MUST NOT cambiar el
tipo, la familia ni el tipo de daño del enemigo base.

#### Scenario: El veloz es más rápido y más frágil

- **WHEN** se instancia un enemigo con variante `veloz`
- **THEN** su velocidad es ×1,4 y su HP máximo ×0,7 respecto del tipo base

#### Scenario: El regenerador cura mientras vive

- **WHEN** un enemigo con variante `regenerador` recibe daño y sobrevive
- **THEN** su HP sube con el tiempo hasta el máximo del tipo, sin pasar de ese máximo

#### Scenario: El catálogo declara las siete

- **WHEN** se inspecciona la tabla de variantes
- **THEN** contiene exactamente `escudado`, `veloz`, `regenerador`, `divisor`, `sanador`,
  `acorazado` y `tenaz`, cada una con nombre, descripción y contrapartida

### Requirement: El escudo absorbe antes que el HP

Un enemigo `escudado` MUST tener un pool de escudo finito que absorbe el daño antes que el HP. El escudo MUST romperse al agotarse, MUST NOT regenerarse, y su rotura MUST ser visible.

#### Scenario: El daño pega primero en el escudo

- **WHEN** un enemigo `escudado` recibe daño menor que su escudo restante
- **THEN** su HP no cambia y el escudo baja en esa cantidad

#### Scenario: El escudo se rompe y no vuelve

- **WHEN** el escudo llega a cero
- **THEN** el enemigo pasa a recibir daño en el HP y el escudo no vuelve a subir

### Requirement: Ninguna variante es inmune

Toda variante MUST recibir daño de todos los tipos de daño del juego (`ballistic`, `light`, `blast`, `electric`, `drone`) respetando la matriz de familias del enemigo base. Ninguna variante MUST NOT ser inmune ni requerir un tipo de daño específico para morir.

#### Scenario: Cualquier torre puede matar a cualquier variante

- **WHEN** cada tipo de daño del juego ataca a cada variante
- **THEN** todas infligen daño mayor que cero

#### Scenario: La matriz de familias sigue mandando

- **WHEN** un enemigo con variante recibe un tipo de daño al que su familia es débil o resistente
- **THEN** el multiplicador de la matriz se aplica igual que en el enemigo base

### Requirement: Topes de aparición de variantes

La asignación de variantes MUST respetar: **como máximo una variante por grupo en la
campaña** (dos solo cuando el modo habilita el doble afijo), como máximo el 35 % de los
enemigos de una descarga, ninguna variante en la apertura (t < `OPEN_T`), y cada variante
MUST NOT aparecer antes de su década de entrada: escudado S10, veloz S12, regenerador S25,
divisor S18, sanador S22, acorazado S30 y tenaz S35.

#### Scenario: La apertura es 100 % normal

- **WHEN** se inspeccionan las descargas con t < `OPEN_T`
- **THEN** ninguno de sus grupos tiene variante

#### Scenario: Una descarga no se llena de élites

- **WHEN** se cuenta la proporción de enemigos con variante en una descarga del tramo clásico
- **THEN** no supera el 35 % del total de la descarga

#### Scenario: Una variante no aparece antes de tiempo

- **WHEN** se generan las etapas anteriores a la década de entrada de una variante
- **THEN** esa variante no aparece en ninguna descarga

#### Scenario: La campaña usa un solo afijo

- **WHEN** se generan las olas de una etapa de campaña
- **THEN** ningún grupo lleva más de una variante

### Requirement: Variantes legibles

Cada variante MUST tener un rasgo visual propio en el canvas (aura, estela, pulso, placas o
cadenas) distinto del enemigo base, y MUST estar documentada en el bestiario del juego con su
efecto **y su contrapartida**.

#### Scenario: El jugador distingue una élite a simple vista

- **WHEN** un enemigo con variante entra en pantalla
- **THEN** se ve distinto de su versión normal

#### Scenario: El bestiario explica las variantes

- **WHEN** el jugador abre el bestiario
- **THEN** encuentra las siete variantes con la descripción de lo que hacen y de cómo se
  contrarrestan

### Requirement: Recompensa de élite

Toda variante MUST multiplicar el score y el XP que entrega el enemigo por un factor mayor
que 1 (`scoreMul` ≥ 1,2). El XP MUST salir del mismo camino que el score (`scoreReward`) para
que no haya dos fuentes de verdad.

#### Scenario: Una élite paga más que el enemigo normal

- **WHEN** se compara el score de matar un enemigo normal contra el mismo tipo con variante
- **THEN** la variante entrega más score y más XP

#### Scenario: El doble afijo paga más que el simple

- **WHEN** se compara una élite de un afijo contra una de dos afijos
- **THEN** la de dos afijos entrega más score (los multiplicadores se combinan, con tope)

### Requirement: Divisor

Un enemigo `divisor` MUST partirse en **dos crías** al morir. Las crías MUST tener el mismo
tipo y familia, un 35 % del HP máximo del padre, **ninguna variante** y un score reducido;
MUST NOT volver a dividirse.

#### Scenario: El divisor se parte al morir

- **WHEN** un enemigo con variante `divisor` muere
- **THEN** aparecen dos crías vivas del mismo tipo con el 35 % del HP del padre

#### Scenario: Las crías no recursan

- **WHEN** una cría del divisor muere
- **THEN** no genera nuevas crías

#### Scenario: La cría no hereda el afijo

- **WHEN** se inspecciona una cría del divisor
- **THEN** no tiene variante

#### Scenario: Las crías no consumen el presupuesto de fugas

- **WHEN** una cría del divisor llega a la base
- **THEN** daña la base pero NO cuenta contra la regla del 25 % de fugas (no es parte
  del presupuesto de la ola, igual que la escolta de un jefe): matar un divisor cerca de
  la base no puede disparar la derrota por fugas

### Requirement: Sanador

Un enemigo `sanador` MUST curar a los enemigos aliados dentro de un radio declarado, a una
fracción de su HP máximo por segundo, sin curarse a sí mismo ni superar el HP máximo del
aliado. La cura MUST ser visible (pulso o vínculo).

#### Scenario: Cura a un aliado herido

- **WHEN** un aliado dentro del radio está por debajo de su HP máximo
- **THEN** su HP sube con el tiempo hasta el máximo

#### Scenario: No se cura a sí mismo

- **WHEN** el sanador está herido y no hay otros aliados en el radio
- **THEN** su HP no sube por su propia aura

#### Scenario: No apila sin control

- **WHEN** dos sanadores cubren al mismo aliado
- **THEN** la cura total por segundo sigue acotada por la fracción declarada por sanador y
  nunca supera el HP máximo

### Requirement: Acorazado

Un enemigo `acorazado` MUST reducir cada golpe recibido en una cantidad **plana** que escala
con la etapa y tiene un tope declarado. Un golpe MUST NOT quedar en 0: el daño mínimo por
impacto es 1. La reducción MUST aplicarse después de la matriz de tipos y del escudo.

#### Scenario: Los golpes chicos pierden más proporción

- **WHEN** un golpe chico y uno grande impactan al mismo acorazado
- **THEN** el chico pierde una proporción mayor de su daño y el grande conserva más

#### Scenario: Nunca llega a cero

- **WHEN** un golpe de daño menor que la armadura impacta a un acorazado
- **THEN** el enemigo recibe exactamente 1 de daño

### Requirement: Tenaz

Un enemigo `tenaz` MUST ignorar los efectos de slow y de stun, y MUST seguir recibiendo daño
de todos los tipos con normalidad.

#### Scenario: El slow no lo frena

- **WHEN** un efecto de slow alcanza a un `tenaz`
- **THEN** su velocidad no cambia

#### Scenario: El stun no lo paraliza

- **WHEN** un efecto de stun alcanza a un `tenaz`
- **THEN** sigue avanzando

#### Scenario: Sigue siendo matable

- **WHEN** cualquier tipo de daño impacta a un `tenaz`
- **THEN** recibe daño mayor que cero

### Requirement: Doble afijo

Cuando el modo lo habilita (Protocolo/Heat o profundidad), un grupo MUST poder llevar **hasta
dos variantes distintas**. Las mecánicas y los multiplicadores de las dos MUST combinarse, sin
duplicar el mismo id y sin recursionar en las crías. En la campaña y por defecto el tope MUST
ser una.

#### Scenario: Dos afijos conviven

- **WHEN** un enemigo lleva `acorazado` y `sanador`
- **THEN** tiene armadura y además cura a sus aliados

#### Scenario: No se repite el mismo afijo

- **WHEN** la asignación intenta poner dos veces el mismo id
- **THEN** el enemigo queda con uno solo

#### Scenario: La campaña no usa doble afijo

- **WHEN** se juega una etapa de la campaña sin Protocolo
- **THEN** ningún enemigo lleva dos afijos
