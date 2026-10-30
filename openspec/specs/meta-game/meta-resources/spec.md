# Meta Resources

## Purpose

Economía del meta-juego simplificada a dos recursos con roles claros: fragmentos (un **pool compartido** para subir de nivel torretas) y oro (moneda gastable para desbloquear unidades y redistribuir perks). Se eliminan las gemas y la energía del meta-juego, y el oro deja de ser decorativo para pasar a ser un saldo almacenado que se gana en partidas y se gasta en decisiones permanentes.

## Requirements

### Requirement: Solo fragmentos y oro como recursos del meta-juego

El meta-juego expone exactamente dos recursos: fragmentos y oro. Las gemas y la energía no aparecen como recursos en el estado meta ni en la vista de mejoras de torretas.

#### Scenario: Ausencia de gemas y energía en la vista de mejoras

- **WHEN** se renderiza la vista de mejoras de torretas
- **THEN** no se muestran recursos llamados gemas ni energía; solo se muestran fragmentos y oro

#### Scenario: Ausencia de gemas y energía en el estado

- **WHEN** se guarda o carga el estado meta
- **THEN** no se persisten ni se interpretan campos de gemas o energía como recursos del meta-juego

### Requirement: Oro almacenado y gastable

El oro es un saldo que se almacena en el estado meta, se incrementa con resultados de partida y se decrementa al gastarlo: desbloquear una unidad o redistribuir los perks de una torreta. El jugador siempre puede ver su saldo actual de oro en la vista de mejoras de torretas.

#### Scenario: Visualización del saldo de oro

- **WHEN** se renderiza la vista de mejoras de torretas
- **THEN** se muestra el saldo de oro acumulado y disponible para gastar

#### Scenario: Gasto de oro con descuento

- **WHEN** el jugador ejecuta una operación con costo en oro y el saldo alcanza
- **THEN** el saldo de oro se descuenta del estado y la operación queda registrada

#### Scenario: Oro insuficiente

- **WHEN** el jugador intenta una operación con costo en oro sin saldo suficiente
- **THEN** la operación se rechaza y el saldo permanece sin cambios

### Requirement: Ganancias de oro claras por resultado de partida

El jugador gana oro de forma predecible al completar stages y al ganar la partida. La fuente de ganancia es consistente y visible (p. ej. en la pantalla de stage clear / game over), de modo que se entienda cuándo y cuánto oro se recibe.

#### Scenario: Ganancia de oro en stage clear

- **WHEN** el jugador completa un stage con éxito
- **THEN** recibe una cantidad fija definida de oro, informada en la pantalla de resultado

#### Scenario: Ganancia de oro en victoria de partida

- **WHEN** el jugador gana la partida
- **THEN** recibe una cantidad fija definida de oro adicional a la del stage clear, informada en la pantalla de resultado

### Requirement: Pool de fragmentos compartido

Los fragmentos MUST ser un único saldo global (`fragsPool`), no un saldo por
torreta. MEJORAR una torreta descuenta su coste de ese pool y reduce lo que
queda disponible para las demás. No existe un botón que suba todas las
torretas automáticamente.

#### Scenario: Elegir una torreta deja menos para otra

- **GIVEN** un pool de 300 fragmentos y dos torretas en Nvl.1
- **WHEN** el jugador sube la primera torreta (coste 75)
- **THEN** el pool queda en 225 y la segunda torreta ya no puede pagar dos niveles

#### Scenario: Consumo de fragmentos solo en mejora de nivel

- **WHEN** el jugador usa MEJORAR en una torreta desbloqueada
- **THEN** se descuenta el coste del pool compartido y sube su nivel meta

#### Scenario: Reset de perks no toca fragmentos

- **WHEN** el jugador redistribuye perks de una torreta
- **THEN** el pool de fragmentos no cambia (el costo es únicamente en oro)

### Requirement: Ganancia de fragmentos al pool

Cada victoria MUST sumar una cantidad fija de fragmentos al pool compartido:
300 en una limpieza normal y 600 la primera vez que se completa una etapa.
Los hitos de Protocolo, la supervivencia y el infinito suman al mismo pool.

#### Scenario: Victoria normal

- **WHEN** el jugador completa una etapa ya limpiada
- **THEN** el pool recibe 300 fragmentos una sola vez, no 300 por torreta

#### Scenario: Primera limpieza

- **WHEN** el jugador completa una etapa por primera vez
- **THEN** el pool recibe 600 fragmentos

### Requirement: Migración de fragmentos por torreta

Un save anterior al pool compartido MUST conservar su poder de compra: la suma
de todos los saldos por torreta pasa a ser el pool global. Los niveles, el oro
y los perks se conservan.

#### Scenario: Save viejo con fragmentos repartidos

- **GIVEN** un save con 100 fragmentos en Guardian y 50 en Tesla
- **WHEN** se carga con el sistema nuevo
- **THEN** el pool global arranca en 150 y no se pierde ningún fragmento
