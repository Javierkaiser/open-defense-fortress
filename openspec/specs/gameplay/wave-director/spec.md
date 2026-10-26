# gameplay/wave-director Specification

## Purpose
El director de oleadas decide QUÉ enemigos caen, CUÁNTOS, en qué formación y con qué ritmo a lo largo de una etapa, de modo que cada partida tenga variedad con intención (arquetipos, picos y biomas) sin cambiar la dificultad medida de la campaña.

## Requirements

### Requirement: Composición por arquetipos de descarga

Cada descarga del tramo clásico (t ≥ `OPEN_T`) MUST pertenecer a un arquetipo declarado (`enjambre`, `convoy`, `cuña`, `cortina`, `goteo`, `pinza`, `escolta`, `ola de choque`). Una etapa MUST usar al menos 4 arquetipos distintos y MUST NOT repetir el mismo arquetipo en dos descargas consecutivas ni tres veces en una ventana de cinco.

#### Scenario: Una etapa cualquiera usa varios arquetipos

- **WHEN** se generan las olas de cualquier etapa entre 6 y 50
- **THEN** el tramo clásico usa al menos 4 arquetipos distintos

#### Scenario: Ningún arquetipo se repite seguido

- **WHEN** se recorren las descargas consecutivas de una etapa
- **THEN** no hay dos descargas seguidas del mismo arquetipo, ni tres del mismo arquetipo en una ventana de cinco

#### Scenario: El convoy junta tanque y enjambre

- **WHEN** una descarga es del arquetipo `convoy`
- **THEN** incluye al menos un grupo de la banda de tanques (`miniBlob`/`blob`) y al menos un grupo de tipo ligero, y los ligeros entran después del tanque

### Requirement: Presupuesto de HP y curva de presión

La composición de una descarga MUST caber en el presupuesto de HP de su instante (presupuesto = densidad de la etapa × curva de presión × coste táctico del arquetipo). El HP total generado por etapa MUST quedar dentro de ±10 % de la línea base medida en la fase 64.

#### Scenario: El total por etapa no se mueve

- **WHEN** se compara el HP total generado en una etapa contra la línea base de la fase 64
- **THEN** la diferencia es de ±10 % como máximo

#### Scenario: La etapa tiene picos y valles

- **WHEN** se mide el HP generado por ventana de 20 s a lo largo de una etapa
- **THEN** hay al menos 2 ventanas con ≥1,15× la media y al menos una ventana con ≤0,75× la media

#### Scenario: La marea final precede al jefe

- **WHEN** una etapa tiene jefe
- **THEN** el tramo anterior al aviso de jefe tiene presión mayor que la media de la etapa

### Requirement: Escalonado del spawn

Los grupos de una descarga MUST poder declarar retardos (`delay`, `stagger`, `lane`). Los arquetipos de flujo (`goteo`, `enjambre`) MUST repartir sus enemigos en al menos 0,5 s. El manager MUST NOT spawnear enemigos después de que arranque el aviso de jefe, y MUST NOT declarar la etapa terminada mientras queden spawns pendientes.

#### Scenario: El goteo es un arroyo, no una placa

- **WHEN** una descarga es del arquetipo `goteo`
- **THEN** sus enemigos entran repartidos en el tiempo (≥0,5 s entre el primero y el último)

#### Scenario: El aviso de jefe cancela lo pendiente

- **WHEN** llega el turno de la ola de jefe y había spawns diferidos pendientes del tramo clásico
- **THEN** esos spawns se descartan y no aparece ningún enemigo normal durante el aviso

#### Scenario: La etapa no cierra con spawns pendientes

- **WHEN** se vacía la cola de olas pero quedan spawns diferidos sin entrar
- **THEN** la etapa no se declara terminada hasta que entren y la arena quede limpia

### Requirement: Biomas por década

Cada etapa MUST tener un sesgo de familia por década (roca, cristal, espora, virus) con la familia dominante entre el 45 % y el 60 % de los enemigos. Décadas consecutivas MUST NOT compartir la misma familia dominante. El sesgo MUST ser visible en el selector de etapa.

#### Scenario: Una década tiene identidad

- **WHEN** se mide la composición por familia de una etapa de la década 20-29
- **THEN** la familia dominante está entre el 45 % y el 60 % de los enemigos

#### Scenario: Las décadas se distinguen

- **WHEN** se comparan las familias dominantes de dos décadas consecutivas
- **THEN** no son la misma

#### Scenario: El jugador puede anticiparlo

- **WHEN** el jugador mira una etapa en el selector de etapas
- **THEN** ve el sesgo de familia de esa etapa antes de empezarla

### Requirement: Crystal garantizado por descarga

En el tramo clásico, cada descarga MUST incluir al menos un cristal. El cristal MUST salir del presupuesto de HP de la descarga (no se suma por encima), de modo que la regla no suba el HP total de la etapa.

#### Scenario: Siempre hay un cristal

- **WHEN** se recorren las descargas del tramo clásico de una etapa cualquiera
- **THEN** el 100 % de ellas incluye al menos un cristal

#### Scenario: El cristal no regala dificultad

- **WHEN** se compara el HP total por etapa con y sin la garantía del cristal
- **THEN** la diferencia queda dentro del margen de ±10 % del presupuesto

### Requirement: Apertura intacta

Los primeros `OPEN_T` segundos de una etapa MUST conservar sus garantías: al menos 2 descargas, la primera con espora en `vee`, al menos un cristal matable, sólo tipos matables por el jugador real, sólo patrones del cono y tope por enemigo. La apertura MUST NOT usar arquetipos de flujo ni variantes de élite.

#### Scenario: La apertura sigue siendo farmable

- **WHEN** se generan las olas de una etapa con la potencia real del jugador
- **THEN** todo lo que entra en t < `OPEN_T` es matable dentro de su ventana de tiro y la apertura entrega el piso de XP

#### Scenario: Sin variantes en la apertura

- **WHEN** se inspeccionan los enemigos de la apertura
- **THEN** ninguno tiene variante de élite

### Requirement: Determinismo y jitter acotado

La generación de olas MUST ser determinista para el mismo par (etapa, semilla). El jitter de velocidad por enemigo MUST ser de ±10 % como máximo y MUST NOT aplicarse en la apertura.

#### Scenario: Misma semilla, misma tabla

- **WHEN** se genera dos veces la misma etapa con la misma semilla
- **THEN** las dos tablas de olas son idénticas

#### Scenario: El jitter no rompe la apertura

- **WHEN** se inspeccionan los enemigos de la apertura
- **THEN** su velocidad es la del tipo (sin jitter)
