# gameplay/tower-identity Specification

## Purpose

Define una identidad mecánica ÚNICA por torre y dron. Antes de este cambio
las 11 unidades compartían el mismo vocabulario de perks (remate, robo de
vida y explosión al matar en todas), así que elegir una torre no cambiaba
la forma de jugar. La identidad vive en datos (`mech` en
`towers-data.js`), se ejecuta en hooks (`tower-mechanics.js`) y se protege
con un test guardián.

## Requirements

### Requirement: Una mecánica firma por unidad

Cada entrada de `TOWERS` y `DRONES` MUST declarar `mech: { id }`, y cada
`id` MUST ser único entre las 11 unidades. `MECHANICS[id].owner` MUST ser
la unidad que lo declara.

#### Scenario: Dos torres con la misma firma

- **WHEN** se agrega `mech: { id: 'execute' }` a otra torre
- **THEN** `tests/test-tower-identity.mjs` falla y nombra al intruso

#### Scenario: Unidad sin mecánica

- **WHEN** una torre o dron no declara `mech`
- **THEN** el test de identidad falla (ninguna unidad queda sin firma)

### Requirement: Matriz de identidad

| Unidad | Identidad | Mecánica firma | No debe tener |
|---|---|---|---|
| Guardian | Supresión balística | `suppression`: 3 impactos consecutivos al mismo blanco detonan foco | execute, lifesteal, explodeOnKill, stun, slow |
| Missile | Cazador de una amenaza | `execute`: remate intrínseco bajo 6 %, perks aditivos +3 % cada uno, tope 15 % (30 % con Cabeza Nuclear) | lifesteal, explodeOnKill, bounce |
| Beam | Foco térmico | `melt`: stacks que amplifican el daño sobre el blanco | execute, explodeOnKill, bounce |
| Thunderstroke | Tormenta de control | `judgment`: el stun marca y el eléctrico pega más | execute, lifesteal, explodeOnKill, bounce |
| Tesla | Conducción local | `ion`: la cadena marca el racimo y el eléctrico pega más | execute, lifesteal, explodeOnKill, stun |
| Mortar | Artillería de zona | `crater`: zona persistente que quema y frena | execute, lifesteal, explodeOnKill, stun |
| Gauss | Riel anti-blindaje | `rail`: marca que amplifica el balístico de OTRAS torres | execute, lifesteal, explodeOnKill, bounce, slow |
| Láser | Corte estático | `cut`: marca que amplifica todo el daño sobre el cortado | execute, lifesteal, explodeOnKill |
| Firewheel | Ignición | `burn`: DoT de fuego y única explosión al matar | execute, lifesteal, stun, slow |
| Mosquitos | Enjambre venenoso | `venom`: DoT que se propaga al morir el envenenado | execute, explodeOnKill, stun |
| Forcefield | Burbuja de control | `bubble`: slow intrínseco, sostén y marca de área | execute, explodeOnKill, lifesteal, daño de contacto |

> El id interno de Mosquitos sigue siendo `wasps` para no romper saves ni
> IDs de cartas; el nombre visible es "Dron Mosquitos".

### Requirement: Vocabulario acotado

Las claves genéricas de los perks MUST quedar restringidas a su dueño:

- `executeThreshold`: solo Missile. `executeThresholdMul` solo lo da Cabeza
  Nuclear al Missile.
- `lifesteal`: solo Beam y Mosquitos.
- `explodeOnKillChance` / `explodeOnKillDmg` / `explodeOnKillRadius`: solo
  Firewheel.
- `slowOnHit`: solo Beam (el slow del Forcefield es intrínseco, no un perk).
- `stunChance`: solo Thunderstroke.
- `bounceCount`: solo Guardian.
- `critChanceAdd` / `critDmgMul`: solo Guardian y Gauss.
- `chainFork`: solo Tesla.
- `extraCount`: solo Missile, Tesla, Mosquitos y Láser.
- `areaMul`: solo Mortar.
- `radiusAdd`: solo Firewheel y Forcefield.
- `spontaneousRelight`: solo Firewheel (legendaria Combustión Espontánea).

#### Scenario: Perk de remate en el Beam

- **WHEN** un tier del Beam declara `executeThreshold`
- **THEN** el test de identidad falla

#### Scenario: Perk de robo de vida en el Guardian

- **WHEN** un tier del Guardian declara `lifesteal`
- **THEN** el test de identidad falla

### Requirement: Remate aditivo, tope 15/30 e inmunidad de jefes

El Misil MUST partir de un umbral intrínseco de **6 %**. Cada perk de Remate
MUST sumar **+3 %** (no reemplazar el umbral anterior) y el umbral efectivo
MUST quedar topado en **15 %**. Cabeza Nuclear MUST multiplicar el umbral por
**2**, con tope **30 %**. Los enemigos con `executeImmune` (hoy los jefes) MUST
NOT ser rematados; si están bajo el umbral, el atacante que tiene remate les
MUST hacer **×1,30 de daño**. Golpe de Gracia MUST respetar el mismo tope.

#### Scenario: Tres Remate + Cabeza Nuclear

- **WHEN** el jugador elige Remate I, II y III y Cabeza Nuclear
- **THEN** el umbral efectivo del Misil es 30 %

#### Scenario: Jefe bajo el umbral

- **WHEN** un jefe inmune está al 10 % de vida con un umbral efectivo de 15 %
- **THEN** el golpe del Misil no lo remata y hace +30 % de daño

#### Scenario: Enemigo común bajo el umbral

- **WHEN** un enemigo sin `executeImmune` está bajo el umbral efectivo
- **THEN** el golpe lo remata

#### Scenario: Golpe de Gracia sin carta

- **WHEN** el Misil golpea a un enemigo con Juicio y no tiene Cabeza Nuclear
- **THEN** el umbral efectivo es 15 %, no 30 %

### Requirement: Marcas y hooks

Las mecánicas MUST ejecutarse en hooks compartidos y no en un `if` por
torre dentro de `Enemy.takeDamage`:

- impacto de proyectil: `projectileStrike` → `onMechanicHit`.
- golpes instantáneos: `Tower.fire` (bolt/chain/beam) → `onMechanicHit` /
  `onMechanicTick`.
- tick del Láser: `LaserStaticFx.update` → `onMechanicHit`.
- drones: `Drone.update` → `onMechanicHit` / `onMechanicTick`.
- muerte: `Enemy.die` → `onMechanicKill` (propagación del veneno).
- daño: `applyPerkDamage` → `mechanicDamageMul` (melt/cut/judgment/ion/rail).

#### Scenario: Marca de riel

- **WHEN** una bala del Gauss impacta
- **THEN** el enemigo queda con `rail` 2 s y las balas del Guardian le
  hacen +10 %; el propio Gauss NO se buffea con su marca

#### Scenario: Veneno que salpica

- **WHEN** un enemigo envenenado por los Mosquitos muere
- **THEN** hasta 2 vecinos en 110 px reciben el 50 % del DPS de veneno

### Requirement: Combustión Espontánea de la Rueda de Fuego

La legendaria **Combustión Espontánea** MUST reemplazar a **Órbita Solar** en
la Rueda de Fuego. Con `spontaneousRelight`, si no hay enemigos a menos de
**150 px**, la rueda MUST tirar **40 %** cada **0,9 s** de apagarse durante
**0,22 s** y reencenderse sobre el enemigo más avanzado que esté a **230 px**
o más. La recarga tras cada apagado MUST ser de **4 s**. Mientras está
apagada MUST NOT moverse, quemar ni hacer contacto, y MUST dibujarse como una
brasa humeante. Si el objetivo muere durante el apagado, MUST elegir otro
enemigo lejano o reencenderse en el lugar. Al reencenderse MUST entrar directo
al barrido y emitir partículas y `drone:fire`.

#### Scenario: Enemigo lejano

- **WHEN** la Rueda con Combustión Espontánea no tiene enemigos a menos de 150 px
  y la tirada de 40 % sale bien
- **THEN** se apaga 0,22 s y reaparece sobre el enemigo más avanzado a 230 px o más

#### Scenario: Enemigo cerca

- **WHEN** hay un enemigo a menos de 150 px
- **THEN** la Rueda no se apaga y sigue quemando normalmente

#### Scenario: Objetivo muerto durante el apagado

- **WHEN** el enemigo elegido muere mientras la Rueda está apagada
- **THEN** elige otro enemigo lejano; si no hay, se reenciende en el lugar

### Requirement: El cráter del Mortar es visible

El impacto del Mortar MUST crear un `CraterFx` con un radio igual al **80 %
del radio efectivo de la explosión** (el splash sigue usando el 100 %), un
anillo ámbar visible y una duración igual a la configurada.
MUST seguir haciendo daño y aplicando slow a todo enemigo que entre en el
radio mientras viva.

#### Scenario: Impacto sin enemigos alrededor

- **WHEN** el obús detona y no hay enemigos dentro del radio
- **THEN** el cráter igual queda dibujado en el suelo durante su duración

#### Scenario: Enemigo que entra después

- **WHEN** un enemigo entra en el radio del cráter después de la explosión
- **THEN** recibe el DoT y el slow del cráter

### Requirement: Combos legibles

Cada combo MUST tener dos piezas reales y cambiar comportamiento (target,
marca, cantidad o estado), no sólo sumar un porcentaje. Cada unidad MUST
participar en 1-2 combos como máximo.

#### Scenario: Combo de una sola torre

- **WHEN** una carta de combo sólo requiere una unidad o una técnica
- **THEN** no entra al catálogo de combos

### Requirement: Persistencia de perks

Cambiar el contenido de un tier A/B MUST NOT reinterpretar saves viejos en
silencio. La migración o el reset MUST ser explícitos (`perkSchemaVersion`).
