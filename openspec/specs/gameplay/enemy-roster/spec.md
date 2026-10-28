# gameplay/enemy-roster Specification

## Purpose
El roster de enemigos debe tener una identidad por FAMILIA (roca, cristal,
espora y virus), no sólo por stats: cada familia tiene un enjambre barato y
un tanque con una mecánica intrínseca, legible en el canvas y documentada en
el bestiario. La campaña introduce esos tipos de forma gradual para que el
jugador aprenda el counter de cada familia sin perder la dificultad medida.

## Requirements

### Requirement: Enjambre y tanque por familia

Cada una de las cuatro familias MUST tener al menos un tipo de rol `swarm`
(barato, rápido, aparece en grupos) y al menos un tipo de rol `tank`
(lento, resistente, ancla la descarga). Los tipos nuevos MUST declarar
`family`, `role` y `debut` en `ENEMY_TYPES`.

| Familia | Enjambre | Tanque |
|---|---|---|
| Roca | `rockSwarm` | `boulder` |
| Virus | `virusSwarm` | `blob` (+ `miniBlob`) |
| Espora | `spore` | `sporePod` |
| Cristal | `crystalSwarm` | `geode` |

#### Scenario: Una familia sin enjambre no es válida

- **WHEN** se recorre el roster de una familia
- **THEN** hay al menos un tipo `swarm` y al menos un tipo `tank`

#### Scenario: El enjambre se lee como cúmulo

- **WHEN** un `rockSwarm`, `virusSwarm` o `crystalSwarm` entra en pantalla
- **THEN** se dibuja como varios cuerpos chicos alrededor de un centro, con
  una sola hitbox y una silueta distinta de la de su tanque

### Requirement: Debuts graduales

Cada tipo MUST declarar la etapa mínima en la que puede aparecer. El pool
de una etapa MUST NOT incluirlo antes de ese debut, y las tablas manuales
1..5 MUST respetar la misma puerta.

| Tipo | Debut |
|---|---:|
| `rockSwarm` | 1 |
| `boulder` | 2 |
| `spore`, `virusSwarm`, `miniBlob`, `blob` | 3 |
| `crystalSwarm` | 5 |
| `sporePod` | 20 |
| `geode` | 30 |

#### Scenario: Un tipo no aparece antes de tiempo

- **WHEN** se genera el pool o la tabla manual de una etapa anterior al debut
- **THEN** ese tipo no aparece en ninguna descarga

#### Scenario: La campaña enseña una familia por vez

- **WHEN** se juegan S1 y S2
- **THEN** sólo aparecen roca y el cristal de XP (sin espora ni virus)
- **WHEN** se juega S3
- **THEN** entra virus
- **WHEN** se juega S4
- **THEN** entra espora
- **WHEN** se juega S5
- **THEN** están las cuatro familias

### Requirement: Mecánicas intrínsecas de tanque

Los tanques MUST tener una mecánica declarativa, visible y con una
contrapartida documentada. Las mecánicas MUST NOT ser inmunidades: el daño
sigue pasando por la matriz de familias.

#### Scenario: Desmoronamiento (roca)

- **WHEN** un `boulder` muere por daño
- **THEN** suelta 3 `rockSwarm` y cada cría paga el 10 % de XP/score
- **WHEN** un `boulder` llega a la base
- **THEN** no suelta crías (la fuga no es una muerte)

#### Scenario: Cepa (virus)

- **WHEN** un `blob` está a 120 px o menos de un `virusSwarm`
- **THEN** el enjambre recibe +20 % de velocidad, sin apilarse y sin
  aplicarse al propio blob, a tanques ni a otras familias

#### Scenario: Esporulación (espora)

- **WHEN** un `sporePod` lleva 6 s vivo
- **THEN** libera 2 `spore`, con un tope de 6 crías vivas
- **WHEN** el pod muere por daño
- **THEN** libera 2 esporas más
- **WHEN** el pod es cría de un `divisor`
- **THEN** no esporula

#### Scenario: Placas (cristal)

- **WHEN** una `geode` recibe daño
- **THEN** las placas absorben antes que el cuerpo, cada una con un pool
  finito, y cada rotura la acelera un 10 %
- **WHEN** se agotan las 3 placas
- **THEN** el cuerpo queda expuesto y las placas no vuelven

### Requirement: Crías de mecánicas acotadas

Las crías de `deathSpawn`/`spawner` MUST dar el **10 %** del XP/score del
tipo base, MUST NOT activar a su vez un `spawner` ni un `deathSpawn`, y
MUST respetar el tope declarado por el pod. La variante `divisor` conserva
su 35 % y no se mezcla con estas mecánicas. El XP puede quedar en 0,5;
el score usa carry entero (0,5 + 0,5 = 1) para mantener el 10 % agregado
sin decimales en el HUD.

#### Scenario: Las crías no recursan

- **WHEN** una cría de mecánica muere
- **THEN** no genera nuevas crías

#### Scenario: El tope del pod se respeta

- **WHEN** un `sporePod` intenta esporular con 6 crías vivas
- **THEN** no libera más hasta que alguna muera

### Requirement: Legibilidad y bestiario

Cada tipo nuevo MUST tener una silueta propia y una ficha de bestiario con
nombre, familia, stats, descripción de su mecánica y contrapartida. Los
enjambres MUST usar un arte procedural barato (paths batcheados, sin
`shadowBlur` por cuerpo).

#### Scenario: El jugador distingue el tanque de su enjambre

- **WHEN** se comparan los iconos de bestiario de `boulder`/`rockSwarm`,
  `blob`/`virusSwarm`, `sporePod`/`spore` y `geode`/`crystalSwarm`
- **THEN** cada pareja tiene una silueta distinta y la ficha del tanque
  explica su mecánica

#### Scenario: El bestiario no inventa texto

- **WHEN** se abre el bestiario
- **THEN** cada tanque muestra su `desc` y su `counter` tomados de
  `ENEMY_TYPES`, sin `undefined` ni `NaN`
