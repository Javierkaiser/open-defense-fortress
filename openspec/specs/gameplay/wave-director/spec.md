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
- **THEN** incluye al menos un grupo de la banda de tanques (`miniBlob`/`blob`/`boulder`/`sporePod`/`geode`) y al menos un grupo de tipo ligero, y los ligeros entran después del tanque

#### Scenario: El arquetipo enjambre usa enjambres de familia

- **WHEN** una descarga es del arquetipo `enjambre`
- **THEN** sus grupos de combate usan tipos con rol `swarm` del bioma de la etapa (`rockSwarm`, `virusSwarm`, `spore` o `crystalSwarm`); el crystal de XP sigue siendo un grupo aparte

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

### Requirement: Ritmo sin espacios muertos

El `WaveManager` MUST adelantar la próxima descarga cuando la arena queda
**limpia de enemigos normales** (el jefe puede seguir vivo) durante
`CLEAR_GRACE` (0,5 s), siempre que hayan pasado al menos `WAVE_MIN_GAP`
(1,6 s) desde la última descarga. Cada adelanto MUST toparse en `MAX_PULL`
(3 s) para no convertir la etapa en un treadmill; los huecos
ESTRUCTURALES (el salto apertura→clásico y la espera del jefe) MUST
colapsarse enteros. Antes del jefe el piso MUST ser `BOSS_BREATH` (4 s) y
el aviso de `WARNING_SECONDS` se suma aparte.

El adelanto MUST NOT cambiar la composición de la ola (tipos, cuentas,
patrón, variantes ni HP) ni su clasificación apertura/clásico: una ola
generada para el tramo clásico MUST seguir entrando con geometría clásica
aunque su instante quede por debajo de `OPEN_T`. El resto de la cola MUST
correrse lo mismo que se adelantó, de modo que el espaciado relativo entre
descargas se conserve. Con la misma semilla y la misma secuencia de
muertes, la secuencia de spawns MUST ser determinista.

#### Scenario: El jugador limpia antes de tiempo

- **WHEN** la arena queda sin enemigos normales y la próxima descarga está agendada para más adelante
- **THEN** la descarga se adelanta hasta `MAX_PULL` segundos y entra en cuanto se cumplen `CLEAR_GRACE` y `WAVE_MIN_GAP`

#### Scenario: El jugador no da abasto

- **WHEN** quedan enemigos normales vivos
- **THEN** la próxima descarga respeta su `t` de agenda y no se adelanta

#### Scenario: El hueco de la apertura

- **WHEN** la apertura cierra por presupuesto o XP antes de `OPEN_T` y la próxima ola de la tabla está en `OPEN_T`
- **THEN** esa ola entra en cuanto la arena queda limpia, sin el hueco de decenas de segundos

#### Scenario: Una ola clásica adelantada no se vuelve apertura

- **WHEN** una ola clásica se adelanta por debajo de `OPEN_T`
- **THEN** sus enemigos siguen entrando con la geometría clásica (formación completa, fuera del cono del Guardian)

#### Scenario: El jefe espera su respiro

- **WHEN** la arena queda limpia y la próxima descarga es la ola de jefe
- **THEN** el aviso arranca recién a los `BOSS_BREATH` de la última descarga

### Requirement: Biomas por década

Cada etapa MUST tener un sesgo de familia por década (roca, cristal, espora, virus) con la familia dominante entre el 45 % y el 60 % de los enemigos. Décadas consecutivas MUST NOT compartir la misma familia dominante. Cada familia MUST ser dominante en al menos una década. El sesgo MUST ser visible en el selector de etapa.

| Década | Dominante | Lectura |
|---|---|---|
| S1–9 | roca | tutorial del Guardian balístico |
| S10–19 | virus | luz |
| S20–29 | espora | explosión |
| S30–39 | cristal | eléctrico |
| S40–50 | roca | cierre con las cuatro familias |

#### Scenario: Una década tiene identidad

- **WHEN** se mide la composición por familia de una etapa de la década 20-29
- **THEN** la familia dominante está entre el 45 % y el 60 % de los enemigos

#### Scenario: Las décadas se distinguen

- **WHEN** se comparan las familias dominantes de dos décadas consecutivas
- **THEN** no son la misma

#### Scenario: Todas las familias tienen su década

- **WHEN** se recorren las cinco décadas
- **THEN** roca, virus, espora y cristal son dominantes al menos una vez

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

Los primeros `OPEN_T` segundos de una etapa MUST conservar sus garantías: al menos 2 descargas, la primera con un enjambre en `vee` (el de la familia dominante de la etapa; si su tope de matabilidad Lv1 es menor que 2, el enjambre más barato que sí pueda entrar en grupo), al menos un cristal matable, sólo tipos matables por el jugador real, sólo patrones del cono y tope por enemigo. La apertura MUST NOT usar arquetipos de flujo ni variantes de élite. Las tablas manuales 1..5 conservan su primera ola de enjambre como introducción explícita (S4 abre con espora).

#### Scenario: La apertura sigue siendo farmable

- **WHEN** se generan las olas de una etapa con la potencia real del jugador
- **THEN** todo lo que entra en t < `OPEN_T` es matable dentro de su ventana de tiro y la apertura entrega el piso de XP

#### Scenario: La primera ola es el enjambre de la etapa

- **WHEN** se genera la primera descarga de S1–S9
- **THEN** es `rockSwarm` en `vee`
- **WHEN** se genera la primera descarga de S10–S19
- **THEN** es `virusSwarm` en `vee`
- **WHEN** se genera la primera descarga de S20–S29
- **THEN** es `spore` en `vee`
- **WHEN** se genera la primera descarga de S30–S39
- **THEN** es `crystalSwarm` en `vee`

#### Scenario: Sin variantes en la apertura

- **WHEN** se inspeccionan los enemigos de la apertura
- **THEN** ninguno tiene variante de élite

### Requirement: Variedad de entrada por run

La FORMA de entrar de cada descarga MUST variar por run sin mover la composición ni el HP de la etapa. Cada grupo del tramo clásico MUST declarar una formación derivada de (etapa, semilla). La formación MUST elegirse del catálogo de su FAMILIA (`KIND_OPTIONS`: una `vee` puede entrar como vee, arco, ola o diamante; una `line` como línea, columnas, ola o arco) y MUST conservar la franja del arquetipo. La apertura MUST limitarse a `vee`/`line`/`burst-diag`. El catálogo completo de formas MUST existir y MUST poder pedirse con `explore: true` para diseño/pruebas. Las tablas manuales 1..5 MUST conservar tipos, cuentas, patrón y franja, pero PUEDEN clonarse y vestirse por run: su `t` MAY variar ±0,6 s (sin cruzar `OPEN_T`, sin invertir el orden y sin tocar la ola de jefe), su primera ola MUST seguir siendo un enjambre en vee y su crystal MUST seguir en vee. Las franjas laterales de los arquetipos simétricos (`izq`/`der`) MUST poder espejarse por run.

#### Scenario: Dos runs de la misma etapa se ven distintas

- **WHEN** se generan las olas de la misma etapa con dos semillas distintas
- **THEN** cambian el espejo, la dispersión, el jitter, el micro-ritmo, la forma de la familia o las franjas laterales
- **AND** los tipos, las cuentas por ola, las franjas efectivas y el HP total no cambian

#### Scenario: La tabla manual no se muta

- **WHEN** se juega una run de S1–S5
- **THEN** `STAGE_WAVES` conserva exactamente sus tiempos, tipos, cuentas, patrones y franjas
- **AND** la copia de la run es la que lleva los parámetros de formación, el escalonado y el jitter de tiempos nuevos

#### Scenario: El jitter de las tablas manuales no cruza la apertura

- **WHEN** una ola manual de `t < OPEN_T` recibe su jitter de ±0,6 s
- **THEN** sigue dentro de la apertura y detrás de la ola anterior

#### Scenario: La apertura no cambia su modelo

- **WHEN** se inspecciona un enemigo de la apertura
- **THEN** su formación no agrega profundidad vertical (Y = SPAWN_Y)
- **AND** su X cae dentro del cono del Guardian

### Requirement: Determinismo y jitter acotado

La generación de olas MUST ser determinista para el mismo par (etapa, semilla). El jitter de velocidad por enemigo MUST ser de ±10 % como máximo y MUST NOT aplicarse en la apertura. La posición, la formación y la entrada del jefe MUST derivarse de la misma semilla de la run y MUST NOT depender de estado de módulo entre runs; el jitter de velocidad conserva el RNG de combate (críticos, derivas, stuns) para que las comparaciones de balance sigan siendo válidas.

#### Scenario: Misma semilla, misma tabla

- **WHEN** se genera dos veces la misma etapa con la misma semilla
- **THEN** las dos tablas de olas son idénticas

#### Scenario: Misma semilla, mismo spawn

- **WHEN** se corren dos managers de la misma etapa con la misma semilla
- **THEN** los enemigos aparecen con el mismo tipo, X e Y en el mismo instante

#### Scenario: El jitter no rompe la apertura

- **WHEN** se inspeccionan los enemigos de la apertura
- **THEN** su velocidad es la del tipo (sin jitter)
