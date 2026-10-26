# gameplay/base-integrity Specification

## Purpose
Define cómo una fuga daña la base y cómo el robo de vida la cura. La base es la
única condición de derrota en todos los modos: no hay contador ni presupuesto de
fugas; cada enemigo que llega paga su HP máximo, y el robo de vida (tope 10 %)
puede comprar aguante sin volverse inmortal.

## Requirements

### Requirement: Daño de fuga por HP máximo

Cada enemigo que llega a la base MUST infligir un daño igual a su **HP máximo**
(`hpMax × LEAK_HP_FRAC`), no a su HP restante. La regla MUST aplicarse a la
campaña, al ∞, al diario y a la Supervivencia.

#### Scenario: Enemigo maltrecho

- **WHEN** un enemigo de 500 HP máximos llega a la base con 37 HP
- **THEN** la base recibe 500 de daño, no 37

#### Scenario: Cría del divisor

- **WHEN** una cría del divisor (35 % del HP de la madre) llega a la base
- **THEN** paga su propio `hpMax` (el 35 %), sin heredar el de la madre

### Requirement: La base es la única condición de derrota

El juego MUST NOT tener contador, presupuesto ni regla binaria de fugas. La run
MUST terminar únicamente cuando el HP de la base llega a 0.

#### Scenario: Fugas por encima del 25 %

- **WHEN** el jugador deja pasar más del 25 % de los enemigos y la base todavía
  tiene HP
- **THEN** la run continúa (no hay derrota por contador)

#### Scenario: Base a 0

- **WHEN** el daño acumulado de las fugas deja la base en 0
- **THEN** la run termina y el resumen muestra la integridad al 0 %

### Requirement: Fugas como estadística

El HUD MUST NOT mostrar un píldor de fugas con presupuesto ni un límite. El
resumen de victoria/derrota MAY mostrar el número de fugas como dato, sin
denominador ni color de peligro.

#### Scenario: Resumen

- **WHEN** termina una etapa con 12 fugas
- **THEN** el resumen dice `FUGAS: 12` (sin `/ presupuesto`)

### Requirement: Robo de vida topeado

El robo de vida MUST curar la base sobre el daño efectivamente hecho y MUST
estar topeado al **10 %** por golpe/unidad. Los porcentajes de los perks MUST
quedar en la escala 1-6 % y la carta en 1 %.

#### Scenario: Tope

- **WHEN** un golpe hace 100 de daño con un `lifesteal` bruto del 50 %
- **THEN** la base cura 10 (el tope), no 50

#### Scenario: Sin resurrección

- **WHEN** la base ya está en 0
- **THEN** el robo de vida no la cura

### Requirement: Feedback de curación

La curación por robo de vida MUST emitir `base:healed` para que el HUD muestre
un aviso de cura sin inundar la pantalla (acumulado con throttle).

#### Scenario: Aviso de cura

- **WHEN** un golpe cura la base
- **THEN** se emite `base:healed` con el monto y el HP resultante
