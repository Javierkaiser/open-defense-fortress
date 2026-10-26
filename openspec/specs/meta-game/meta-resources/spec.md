# Meta Resources

## Purpose

Economía del meta-juego simplificada a dos recursos con roles claros: fragmentos (progresión de nivel de torreta) y oro (moneda gastable de flexibilidad). Se eliminan las gemas y la energía del meta-juego, y el oro deja de ser decorativo para pasar a ser un saldo almacenado que se gana en partidas y se gasta en redistribuir perks.

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

El oro es un saldo que se almacena en el estado meta, se incrementa con resultados de partida y se decrementa al gastarlo (p. ej. en el reset de perks). El jugador siempre puede ver su saldo actual de oro en la vista de mejoras de torretas.

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

### Requirement: Fragmentos exclusivos para subir de nivel

Los fragmentos solo se consumen en la mejora de nivel de las torretas (MEJORAR). Ningún gasto de flexibilidad (reset de perks, etc.) consume fragmentos ni oro se puede convertir en fragmentos.

#### Scenario: Consumo de fragmentos solo en mejora de nivel

- **WHEN** el jugador usa MEJORAR en una torreta
- **THEN** se descuentan fragmentos de esa torreta y sube su nivel meta

#### Scenario: Reset de perks no toca fragmentos

- **WHEN** el jugador redistribuye perks de una torreta
- **THEN** los fragmentos de esa torreta no cambian (el costo es únicamente en oro)
