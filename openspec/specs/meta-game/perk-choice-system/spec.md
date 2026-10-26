# Perk Choice System

## Purpose

Sistema de perks por torreta con elección binaria por década de nivel meta: el jugador elige 1 de 2 opciones por tier, acumula sus efectos, y puede redistribuirlas con un reset costoso en oro. Cada torre tiene una identidad de perks propia, con perks sistemáticos (de comportamiento) desde el tier 1.

## Requirements

### Requirement: Elección binaria de perk por década

Cada década de nivel meta (Nvl.10, 20, 30, …, 100) de una torreta desbloquea un tier de nivel de perks con exactamente 2 opciones distintas (A y B). El jugador elige exactamente 1 de las 2; la opción no elegida de ese tier queda excluida permanentemente (hasta un reset). El primer tier (Nvl.10) incluye opciones sistemáticas (cambios de comportamiento de la torre, p. ej. rebote o perforación), no solo aumentos de estadísticas.

#### Scenario: Desbloqueo de un tier con dos opciones

- **WHEN** una torreta alcanza un nivel meta múltiplo de 10 (Nvl.10, 20, …, 100)
- **THEN** la vista de mejoras de esa torreta muestra las 2 opciones de perk del tier correspondiente, cada una con su descripción

#### Scenario: Elección de una de las dos opciones

- **WHEN** el jugador selecciona la opción A o la B de un tier desbloqueado
- **THEN** esa opción queda registrada como la elección del tier, sus efectos se suman a los mods activos de la torreta, y la otra opción del tier queda indisponible

#### Scenario: Perks sistemáticos disponibles desde el primer tier

- **WHEN** una torreta alcanza Nvl.10
- **THEN** las 2 opciones del primer tier pueden alterar el comportamiento de la torre (rebote, perforación, fork de cadena, slow, stun, crit, homing, etc.), no solo valores numéricos de daño/cadencia

### Requirement: Selección en la pantalla de mejoras de torretas

La elección de perk se realiza exclusivamente en la vista de mejoras de torretas del meta-juego (no durante una partida ni en otro overlay). La vista indica claramente qué tiers están sin elegir ("pendientes") y cuál es el próximo tier a desbloquear.

#### Scenario: Tier pendiente visible en la card

- **WHEN** una torreta tiene un tier desbloqueado sin elegir
- **THEN** su card en la vista de mejoras muestra un indicador "perk disponible" y permite abrir la elección

#### Scenario: Sin elección durante la partida

- **WHEN** el jugador está en una partida activa
- **THEN** no se presenta ninguna UI de elección de perks; los tiers pendientes esperan a que se vuelva a la vista de mejoras

### Requirement: Persistencia y acumulación de perks elegidos

El estado meta persiste, por torreta, un valor por tier: sin elegir, opción A u opción B. Los perks de todos los tiers elegidos se acumulan y aplican juntos a la torreta en partida. Los tiers sin elegir no aportan ningún mod. Datos guardados sin el campo de elecciones se normalizan a un estado por defecto válido (sin corrupción ni crash).

#### Scenario: Efectos acumulativos de tiers elegidos

- **WHEN** una torreta tiene elegidos los perks de tiers 1 y 2 (de Nvl.20 en adelante)
- **THEN** los mods de ambos tiers elegidos se componen juntos (multiplicativos para claves `*Mul`, aditivos para el resto) y se aplican a la torreta en cada partida

#### Scenario: Tier sin elegir no aporta efectos

- **WHEN** una torreta tiene un tier desbloqueado pero sin elección registrada
- **THEN** ese tier no contribuye ningún mod a la torreta, y los tiers siguientes no quedan bloqueados

#### Scenario: Datos viejos o corruptos sin campo de elecciones

- **WHEN** el estado meta cargado no contiene el campo de elecciones de perks (o contiene valores inválidos)
- **THEN** se normaliza a un estado por defecto (sin elegir en todos los tiers) sin errores, y el juego continúa normal

### Requirement: Identidad de perks por torreta

Cada uno de los 11 tipos de torreta/dron del meta-juego (guardian, missile, beam, thunderstroke, tesla, mortar, gauss, laser, firewheel, wasps, forcefield) tiene su propia tabla de 10 tiers × 2 opciones, diseñada alrededor de la identidad de la torre (p. ej. volumen vs. precisión, saltos vs. potencia, radio vs. slow). No hay un pool global compartido de perks.

#### Scenario: Tabla propia para cada tipo

- **WHEN** se consultan las opciones de perk de un tipo de torreta
- **THEN** las opciones provienen de la tabla específica de ese tipo y son en general distintas de las de cualquier otro tipo

#### Scenario: Las 11 torretas cubiertas, incluidos los drones

- **WHEN** se evalúa el sistema de perks
- **THEN** los 8 tipos de torre y los 3 drones (firewheel, wasps y forcefield) tienen tabla de perks de 10 tiers × 2 opciones cada uno

### Requirement: Reset de perks con costo en oro

El jugador puede redistribuir las elecciones de una torreta completa (volver todos sus tiers a "sin elegir" para re-elegir) pagando un costo en oro definido por el sistema. El reset requiere confirmación, no se puede ejecutar con oro insuficiente, y no afecta el nivel meta ni los fragmentos de la torreta.

#### Scenario: Reset exitoso

- **WHEN** el jugador confirma la redistribución de una torreta y tiene el oro suficiente
- **THEN** el oro se descuenta, todos los tiers de esa torreta pasan a "sin elegir" y el jugador puede volver a elegir en cada tier desbloqueado

#### Scenario: Reset sin oro suficiente

- **WHEN** el jugador intenta redistribuir una torreta sin tener el oro necesario
- **THEN** la operación se rechaza sin descontar nada y la UI lo indica

#### Scenario: Reset no daña progreso de nivel

- **WHEN** se ejecuta un reset de perks de una torreta
- **THEN** el nivel meta, los fragmentos y las victorias de esa torreta se mantienen intactos

### Requirement: Insuficiencia de detalle de las opciones

Las 2 opciones de un mismo tier deben representar decisiones significativas (distintos mods o valores que cambien la forma de jugar la torre), nunca 2 copias idénticas del mismo perk.

#### Scenario: Opciones no idénticas por tier

- **WHEN** se inspecciona un tier cualquiera de cualquier torreta
- **THEN** las 2 opciones tienen descripciones y/o mods distintos entre sí
