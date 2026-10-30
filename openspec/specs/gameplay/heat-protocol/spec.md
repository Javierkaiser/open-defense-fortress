# gameplay/heat-protocol Specification

## Purpose
El Protocolo de asedio (Heat) es la pista de dificultad opcional de la campaña: el jugador
elige un conjunto de handicaps con rangos (más enemigos, más HP, fugas más caras, menos cartas,
sin Ultimate, etc.), el heat total mide cuánto se castigó y cada etapa guarda su propio récord
de heat. Se aplica a campaña, ∞, daily y supervivencia; el daily guarda el Heat
con el que se logró su récord global.

## Requirements

### Requirement: Catálogo de condiciones del Protocolo

El Protocolo MUST declarar **once condiciones** con rangos y coste de heat: `asedio` (daño de
fuga), `leva` (cantidad de enemigos), `vigor` (HP enemigo), `prisa` (velocidad), `elites`
(frecuencia y fracción de élites), `jefes` (HP y escolta), `censura` (cartas en la oferta),
`apagon` (sin Ultimate ni Black Hole), `arsenal` (slots de torre), `dobles` (doble afijo) y
`fragilidad` (HP de base). Cada rango MUST tener un coste declarado y un efecto legible.

#### Scenario: El jugador ve el coste de cada condición

- **WHEN** se abre la pantalla del Protocolo
- **THEN** cada condición muestra su nombre, qué hace, sus rangos y el heat que cuesta cada
  rango

#### Scenario: El heat total es la suma de los rangos

- **WHEN** se activa `asedio` 2 y `prisa` 1
- **THEN** el heat total es la suma de sus costes (2 + 2 = 4) y se muestra en la pantalla

### Requirement: Presets y personalización

El Protocolo MUST ofrecer **cinco presets** curados (I, II, III, IV, V) y MUST permitir
editar los rangos uno a uno. El heat máximo personalizable MUST ser 49.

#### Scenario: Elegir un preset carga sus rangos

- **WHEN** el jugador elige el preset II
- **THEN** las condiciones quedan en los rangos de ese preset y el heat total coincide con
  su valor declarado

#### Scenario: Personalizar a partir de un preset

- **WHEN** el jugador sube un rango después de elegir un preset
- **THEN** el heat total se recalcula y el protocolo pasa a "personalizado"

### Requirement: Alcance por modo

El Protocolo MUST aplicarse a **campaña, modo infinito, desafío diario y supervivencia**.
El récord de profundidad del ∞ es **por nivel de Heat** (`heat.endless`). El récord del
diario es **global por fecha**, pero MUST guardar el Heat con el que se logró
(`endless.daily.heat`).

#### Scenario: Una etapa de campaña con Protocolo

- **WHEN** el jugador arranca una etapa de campaña con heat 8
- **THEN** la etapa usa los modificadores del Protocolo y el resumen muestra el heat

#### Scenario: El diario aplica el Protocolo

- **WHEN** el jugador arranca el desafío diario con un Protocolo activo
- **THEN** la run diaria usa los modificadores del Protocolo y, si supera el récord
  global del día, guarda también el Heat con el que se logró

#### Scenario: El infinito aplica el Protocolo

- **WHEN** el jugador continúa el modo infinito con un Protocolo activo
- **THEN** la profundidad usa los modificadores del Protocolo y se guarda el récord
  de profundidad a ese nivel de Heat

### Requirement: Efectos de dificultad

Cada condición de dificultad MUST mapear a un dial concreto: `asedio` multiplica el daño de
fuga, `leva` el presupuesto de enemigos, `vigor` el HP, `prisa` la velocidad, `elites` la
probabilidad y la fracción de élites, `jefes` el HP del jefe y su escolta, y `fragilidad` el
HP de base. El modelo de la **apertura** MUST enterarse del HP y la velocidad del Protocolo,
para que el piso de XP y la garantía de crystal sigan siendo válidos.

#### Scenario: Vigor encarece a los enemigos

- **WHEN** `vigor` está en rango 2
- **THEN** todos los enemigos de la run tienen +24 % de HP, y la apertura elige tipos
  matables con ese HP

#### Scenario: Fragilidad acorta la base

- **WHEN** `fragilidad` está en rango 1
- **THEN** la base arranca con un 15 % menos de HP

### Requirement: Efectos de restricción

Cada condición de restricción MUST mapear a un dial concreto: `censura` reduce la cantidad
de cartas ofrecidas, `apagon` bloquea Ultimate y Black Hole, `arsenal` quita un slot de torre
y `dobles` habilita el doble afijo.

#### Scenario: Censura reduce la oferta

- **WHEN** `censura` está en rango 1
- **THEN** las ofertas de cartas muestran una carta menos

#### Scenario: Arsenal quita un slot

- **WHEN** `arsenal` está activo
- **THEN** la base ofrece un slot de torre menos durante esa run

#### Scenario: Apagón bloquea los especiales

- **WHEN** `apagon` está activo
- **THEN** el Ultimate y el Black Hole no se pueden disparar

### Requirement: Récords de heat

El juego MUST persistir el **mejor heat** limpiado, el **mejor heat por etapa** de
campaña, la **profundidad del ∞ por heat** y el **Heat del récord diario**.
La carga de datos viejos o corruptos MUST NOT romper el progreso.

#### Scenario: Se limpia una etapa con heat nuevo

- **WHEN** el jugador limpia el S40 a heat 8 por primera vez
- **THEN** el récord de heat del S40 pasa a 8 y el mejor heat global sube si corresponde

#### Scenario: El infinito guarda profundidad por heat

- **WHEN** el jugador limpia la etapa 60 a Heat 8
- **THEN** `heat.endless[8]` sube a 60 si corresponde y el récord global de
  profundidad se conserva

#### Scenario: El récord diario guarda su Heat

- **WHEN** el jugador logra un nuevo récord diario a Heat 8
- **THEN** el score y `endless.daily.heat = 8` se guardan; un run posterior con
  peor score no cambia ninguno de los dos

#### Scenario: Progreso viejo

- **WHEN** se carga un `gdf_progress` sin el campo de heat
- **THEN** los récords de heat arrancan en cero y el resto del progreso se conserva

### Requirement: Recompensas del Protocolo

Una victoria con heat MUST multiplicar fragmentos y oro por `1 + 0,08 × heat`. Los **hitos**
de heat (5, 10, 20 y 35) MUST pagar un bonus único de fragmentos la primera vez que se
limpia una etapa con al menos ese heat, y MUST NOT volver a pagarse.

#### Scenario: La recompensa escala

- **WHEN** se limpia una etapa a heat 10
- **THEN** los fragmentos y el oro se multiplican por 1,8

#### Scenario: El hito se cobra una vez

- **WHEN** el jugador limpia a heat 10, cobra el hito y vuelve a limpiar a heat 10
- **THEN** el segundo clear no vuelve a pagar el bonus de hito

### Requirement: El Protocolo se ve y se entiende

El selector MUST mostrar una tarjeta **PROTOCOLO** con el heat activo y el récord, la batalla
MUST mostrar un badge con el heat de la run, y el resumen MUST mostrar el heat jugado, el
récord y si es un récord nuevo.

#### Scenario: El selector muestra el protocolo activo

- **WHEN** el Protocolo está en heat 8
- **THEN** el selector muestra "PROTOCOLO — Heat 8" y el récord correspondiente

#### Scenario: El resumen informa el heat

- **WHEN** el jugador limpia una etapa a heat 8 superando su récord
- **THEN** el resumen muestra "Heat 8 · ¡NUEVO RÉCORD!"

### Requirement: Heat cero es la experiencia base

Con heat 0 el juego MUST comportarse exactamente como antes del Protocolo: sin
multiplicadores, sin condiciones activas y con las mismas recompensas base.

#### Scenario: Sin Protocolo no cambia nada

- **WHEN** se juega cualquier etapa o profundidad con heat 0
- **THEN** la composición, la dificultad y las recompensas son las de la fase 68

### Requirement: Doble élite

La condición `dobles` MUST habilitar que las élites de la run lleven **dos afijos** (el
modelo de `variants[]` de la fase 68), sin cambiar la cantidad de enemigos ni el tope del
35 % de la descarga.

#### Scenario: Con dobles las élites llevan dos afijos

- **WHEN** `dobles` está activo y una descarga lleva élite
- **THEN** esa élite tiene dos afijos distintos y se ve con los dos rasgos

#### Scenario: Sin dobles, un solo afijo

- **WHEN** `dobles` no está activo
- **THEN** ninguna élite lleva más de un afijo
