# gameplay/survival-mode Specification

## Purpose
La Supervivencia es el modo arcade del endgame: una sola run de olas infinitas en una arena,
con atrición de base (cada fuga resta HP; no hay cupo del 25 %), un jefe cada 5 oleadas y un
récord de oleada. Se abre con la campaña completa y compite con el ∞ (profundidad) midiendo
aguante; la sala de récords reúne los cinco modos.

## Requirements

### Requirement: Una run de olas infinitas

La Supervivencia MUST ser una sola run continua: las olas no terminan y la run MUST terminar
cuando la **base llega a 0**. La regla del 25 % de fugas MUST NOT aplicarse en este modo: cada
fuga resta a la base el HP restante del enemigo (atrición).

#### Scenario: La run no termina por oleadas

- **WHEN** el jugador completa la última oleada de un bloque
- **THEN** el director genera el bloque siguiente y la run sigue

#### Scenario: La base es la única condición de derrota

- **WHEN** el jugador deja pasar enemigos pero la base sigue con HP
- **THEN** la run continúa (no hay cupo de fugas que la termine)

#### Scenario: La base cae

- **WHEN** la base llega a 0 de HP
- **THEN** la run termina y el resumen muestra la oleada alcanzada

### Requirement: Entrada con la campaña completa

La Supervivencia MUST abrirse sólo con la campaña completa (récord del Stage 50 limpiado),
igual que el ∞ y el Protocolo: el selector MUST NOT ofrecer la tarjeta y el juego MUST NOT
iniciar la run mientras el candado esté cerrado.

#### Scenario: Cuenta nueva

- **WHEN** el jugador todavía no limpió la campaña
- **THEN** el selector no muestra la tarjeta de Supervivencia y `startSurvival` no arranca

#### Scenario: Campaña completa

- **WHEN** el jugador ya tiene el récord del Stage 50
- **THEN** la tarjeta aparece con su mejor oleada y la run se puede iniciar

### Requirement: Director de supervivencia

El director MUST escalar la dificultad con la oleada (stage virtual `1 + oleada × 3`),
MUST usar un presupuesto de HP **lineal** por oleada (`budgetBase + oleada × budgetPerWave`),
MUST reutilizar la composición del director de olas (arquetipos, familias, élites y doble
afijo), MUST incluir un **jefe cada 5 oleadas** y MUST rotar el tema cada 5 oleadas.

#### Scenario: Los checks de jefe

- **WHEN** se alcanza una oleada múltiplo de 5
- **THEN** entra un jefe con su aviso y su barra

#### Scenario: La dificultad crece

- **WHEN** se comparan dos bloques de oleadas consecutivos
- **THEN** el segundo tiene más HP total por oleada que el primero

#### Scenario: El tema rota

- **WHEN** se cruza un múltiplo de 5
- **THEN** cambia el tema visual de la arena

### Requirement: Extensión perezosa

La cola de olas MUST generarse por bloques cuando se necesita, no entera al iniciar la run, y
el `WaveManager` MUST exponer ese hook sin cambiar el comportamiento de la campaña ni del ∞.

#### Scenario: La cola no se genera entera

- **WHEN** arranca una run de Supervivencia
- **THEN** la cola inicial es acotada y se amplía al vaciarse

#### Scenario: La campaña no cambia

- **WHEN** se juega una etapa de campaña
- **THEN** la cola y el cierre de la etapa son exactamente los de antes

### Requirement: Poder dentro de la run

La run MUST mantener las cartas por nivel y MUST usar un tope de **30 cartas** (la campaña usa
20) para que el crecimiento no se estanque; el XP MUST usar una curva **fija** (la del stage
base de la run), no la del stage virtual de la oleada, para que el nivel no se dispare.

#### Scenario: El jugador sigue creciendo

- **WHEN** el jugador supera las 20 cartas de la campaña
- **THEN** la run todavía le ofrece cartas hasta 30

### Requirement: Récords de supervivencia

El juego MUST persistir la **mejor oleada**, el **mejor score** y la cantidad de runs, de forma
tolerante a datos viejos o corruptos. Si el Protocolo está activo, MUST persistir también la
mejor oleada **por nivel de heat**.

#### Scenario: Se supera el récord

- **WHEN** el jugador llega a la oleada 27 y su récord era 24
- **THEN** el récord pasa a 27 y el resumen lo marca como nuevo récord

#### Scenario: Progreso viejo

- **WHEN** se carga un `gdf_progress` sin el campo de supervivencia
- **THEN** el récord arranca en 0 y el resto del progreso se conserva

### Requirement: Recompensas por récord

La Supervivencia MUST pagar fragmentos y oro **solo por las oleadas nuevas** sobre el mejor
previo (no por repetir una oleada baja), y MUST multiplicar por el heat activo.

#### Scenario: Una run récord paga

- **WHEN** el jugador llega a la oleada 30 por primera vez
- **THEN** cobra la recompensa de las 30 oleadas nuevas

#### Scenario: Repetir no farmea

- **WHEN** el jugador vuelve a llegar a la oleada 20 con récord 30
- **THEN** no cobra recompensa de oleadas

### Requirement: Entrada y lectura del modo

El selector MUST ofrecer la Supervivencia con su récord, la batalla MUST mostrar la **oleada
actual** y el próximo check, y el resumen MUST mostrar oleada, récord y score.

#### Scenario: El selector ofrece el modo

- **WHEN** el jugador abre el selector con la Supervivencia disponible
- **THEN** ve la tarjeta con su mejor oleada

#### Scenario: El HUD sigue la oleada

- **WHEN** la run avanza de oleada
- **THEN** el HUD muestra el número nuevo y cuánto falta para el jefe

### Requirement: Sala de récords

El juego MUST ofrecer una pantalla que reúna los récords de **campaña, infinito, Protocolo,
Supervivencia y diario**, con el próximo hito de cada modo.

#### Scenario: Los cinco modos en un lugar

- **WHEN** el jugador abre RÉCORDS
- **THEN** ve el mejor resultado de cada modo y el próximo hito

### Requirement: Heat en la Supervivencia

La Supervivencia MUST usar el Protocolo activo (los mismos `runMods` de la campaña); heat 0
MUST ser la run base. Si la medición muestra que la curva no es viable, la v1 MUST restringir
el modo a heat 0 y documentarlo.

#### Scenario: Una run con Protocolo

- **WHEN** el jugador arranca la Supervivencia con heat 8
- **THEN** la run usa los diales del Protocolo y el resumen muestra el heat

#### Scenario: Una run base

- **WHEN** el jugador arranca la Supervivencia a heat 0
- **THEN** la run no tiene ningún modificador del Protocolo
