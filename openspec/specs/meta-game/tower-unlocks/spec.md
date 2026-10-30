# meta-game/tower-unlocks Specification

## Purpose

Las unidades del meta-juego ya no están todas disponibles desde el inicio.
Una cuenta nueva arranca solo con **Guardian**; las otras 10 unidades (7 torres
y 3 drones) se desbloquean permanentemente con **oro**. El desbloqueo habilita
la unidad en la pantalla TORRETAS y su carta `unlock_*` en las partidas. Sin
desbloqueo, la unidad no se puede mejorar, elegir perk ni usar.

## Requirements

### Requirement: Estado de desbloqueo por unidad

El estado meta MUST guardar un mapa `unlocked` por unidad. En una cuenta nueva,
solo `guardian` MUST ser `true`; las demás MUST ser `false`. El desbloqueo es
permanente y sobrevive a las partidas.

#### Scenario: Cuenta nueva

- **WHEN** se crea o resetea el meta-juego
- **THEN** solo Guardian está desbloqueado y las otras 10 unidades están bloqueadas

#### Scenario: Desbloqueo persistente

- **WHEN** el jugador compra una unidad y recarga el juego
- **THEN** la unidad sigue desbloqueada

### Requirement: Desbloqueo con oro

Cada unidad bloqueada MUST tener un precio en oro. `unlockTower` MUST validar
que la unidad exista, que no esté ya desbloqueada y que el saldo alcance; en
éxito descuenta el oro, marca `unlocked[key] = true` y persiste. En fallo no
cambia nada.

Precios canónicos:

| Unidad | Precio |
|---|---:|
| Guardian | 0 (inicial) |
| Missile | 150 |
| Thunderstroke | 200 |
| Tesla | 400 |
| Beam | 400 |
| Dron Mosquitos | 400 |
| Mortar | 450 |
| Dron Rueda de Fuego | 450 |
| Gauss | 450 |
| Dron Campo de Fuerza | 450 |
| Láser | 500 |

#### Scenario: Compra exitosa

- **GIVEN** 200 de oro y Missile bloqueado
- **WHEN** el jugador compra Missile (150)
- **THEN** el oro queda en 50, Missile queda desbloqueado y el cambio se persiste

#### Scenario: Oro insuficiente

- **GIVEN** 100 de oro y Tesla bloqueado (400)
- **WHEN** el jugador intenta comprar Tesla
- **THEN** la compra se rechaza con `insufficient` y el oro no cambia

#### Scenario: Unidad ya desbloqueada

- **WHEN** el jugador intenta comprar una unidad que ya tiene
- **THEN** la operación se rechaza con `owned` y no se cobra

### Requirement: Unidad bloqueada en la pantalla TORRETAS

Una unidad bloqueada MUST mostrarse como una card bloqueada: icono en gris,
sin nivel, barra de fragmentos, perks, botón MEJORAR ni REDISTRIBUIR. MUST
mostrar su precio y un botón `DESBLOQUEAR (X●)` con confirmación en dos pasos.

#### Scenario: Card bloqueada

- **WHEN** se renderiza TORRETAS con una cuenta nueva
- **THEN** hay 1 card desbloqueada (Guardian) y 10 cards bloqueadas con su precio

#### Scenario: Compra desde la card

- **WHEN** el jugador confirma el desbloqueo con oro suficiente
- **THEN** la card se re-renderiza como desbloqueada y aparece su botón MEJORAR

### Requirement: Las cartas de desbloqueo respetan el meta

Las cartas `unlock_*` de torres y drones MUST ser elegibles solo si la unidad
está desbloqueada. `applyCard` MUST rechazar la carta si la unidad está
bloqueada. La garantía de “un desbloqueo en la primera oferta” MUST aplicarse
solo si existe al menos una carta de desbloqueo elegible.

#### Scenario: Carta de unidad bloqueada

- **GIVEN** una cuenta con solo Guardian
- **WHEN** se arma una oferta de cartas
- **THEN** ninguna carta `unlock_*` de una unidad bloqueada entra en la oferta

#### Scenario: Carta de unidad comprada

- **GIVEN** una cuenta que compró Beam
- **WHEN** se arma una oferta con un slot libre
- **THEN** la carta de Beam puede entrar y `applyCard` la coloca

### Requirement: Unidad bloqueada no participa del meta

Una unidad bloqueada MUST tener `metaDmgMul = 1`, MUST NOT poder subir de
nivel, elegir perks ni resetear perks. El poder mostrado en TORRETAS MUST
promediar solo las unidades desbloqueadas.

#### Scenario: Intentar mejorar una bloqueada

- **WHEN** se llama `upgradeTower` sobre una unidad bloqueada
- **THEN** se rechaza con `locked` y el pool de fragmentos no cambia

#### Scenario: Poder mostrado

- **GIVEN** solo Guardian desbloqueado en Nvl.10
- **THEN** el poder del meta refleja el multiplicador de Guardian, no un
  promedio diluido con 10 unidades bloqueadas

### Requirement: Migración de saves anteriores

Un save anterior al sistema de desbloqueos MUST conservar el acceso a todas las
unidades: se considera que las 10 ya estaban desbloqueadas. Los niveles, el oro,
los perks y los fragmentos (sumados al pool) se conservan.

#### Scenario: Save viejo con niveles

- **GIVEN** un save viejo con Guardian Nvl.40 y Tesla Nvl.20
- **WHEN** se carga con el sistema nuevo
- **THEN** ambas siguen desbloqueadas y conservan sus niveles

### Requirement: Reset de progreso

“Borrar progreso” MUST volver al estado inicial: solo Guardian desbloqueado,
pool en 0, oro inicial y niveles en 1.

#### Scenario: Borrar progreso

- **WHEN** el jugador confirma el borrado
- **THEN** las 10 unidades vuelven a estar bloqueadas y el oro vuelve al inicial
