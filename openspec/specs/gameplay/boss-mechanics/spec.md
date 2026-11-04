# gameplay/boss-mechanics Specification

## Purpose
Los cinco jefes de la campaña deben tener una MECÁNICA FIRMA declarativa
(lluvia de escombros, devorar escolta, resurrección, placas y metamorfosis),
distinta entre sí, legible en el canvas y en el HUD, y con un contrajuego
real: la mecánica es una regla de combate, nunca una inmunidad. La fase 78
suma además un +25 % global al HP de todos los jefes, compuesto con el +15 %
por etapa y con el Protocolo, sin reemplazar ninguna de las dos curvas. La
campaña, el Infinito y la Supervivencia comparten el mismo kit y la misma
fórmula por tipo de jefe.

## Requirements

### Requirement: HP de jefe con multiplicador propio

Todo jefe MUST entrar a la arena con
`HP = round(hpBase × 1,25 × (1 + 0,15 × (etapa − 1)) × bossHpMul)`, donde
`hpBase` es el `hp` del tipo en `ENEMY_TYPES`, `etapa` es la etapa de la
run y `bossHpMul` es el multiplicador de Jefes del Protocolo (1 sin Heat).
El +25 % MUST aplicarse como multiplicador global (`BOSS_HP_MUL`) sobre la
curva propia del jefe, una sola vez y antes de construir al `Enemy`, para
que las placas se calculen sobre el HP definitivo. El +25 % MUST componerse
con el +15 % por etapa y con el Heat: MUST NOT reemplazar a ninguno de los
dos ni aplicarse dos veces. La misma fórmula MUST regir en campaña, Infinito
y Supervivencia.

#### Scenario: El jefe de S1 entra con 4.063

- **WHEN** entra el jefe de S1 (Meteorito Colosal, `hpBase` 3.250)
- **THEN** su HP es `round(3.250 × 1,25)` = **4.063** (antes 3.250)

#### Scenario: El jefe de S50 entra con 73.063

- **WHEN** entra el jefe de S50 (Híbrido Primordial, `hpBase` 7.000) en la
  etapa 50
- **THEN** su HP es `round(7.000 × 1,25 × 8,35)` = **73.063** (antes 58.450)

#### Scenario: El Heat se compone, no reemplaza

- **WHEN** la run tiene Protocolo de Jefes y `bossHpMul` es distinto de 1
- **THEN** el HP es el de la misma etapa sin Heat multiplicado por
  `bossHpMul`, con el +25 % y el +15 % por etapa intactos

### Requirement: Mecánica firma declarativa

Cada tipo de jefe MUST declarar su kit en `ENEMY_TYPES.<tipo>.bossMech` con
una de las cinco claves canónicas: `rain` (lluvia), `devour` (devorar),
`revive` (revivir), `plateExpose` (placas) o `morph` (metamorfosis). Los
cinco jefes MUST tener mecánicas distintas entre sí y la mecánica MUST NOT
ser una inmunidad: el daño sigue entrando por la matriz de familias y sólo
se modifica durante una ventana de exposición declarada. La lluvia y el
devorar MUST ejecutarse sólo en ASEDIO (el jefe ya está en su Y de combate),
nunca durante la bajada.

#### Scenario: Lluvia de escombros (Meteorito)

- **WHEN** el jefe del Stage 1 lleva 6 s de asedio
- **THEN** inyecta 3 `fragment` en columnas al azar; después repite cada 8 s
  y nunca pasa de 6 escombros vivos

#### Scenario: Devorar escolta (Blob Rey)

- **WHEN** el Blob Rey lleva 4 s de asedio (y cada 6 s después)
- **THEN** devora hasta 3 escoltas vivas en 180 px, se cura 1,5 % de su HP
  máximo por escolta (tope de 6 comidas en la pelea) y queda **EXPUESTO**
  2,5 s a la luz ×1,5
- **WHEN** no tiene escolta en radio
- **THEN** pare una espora (tope 4) y no se cura

#### Scenario: Resurrección (Blob Necrótico)

- **WHEN** el Blob Necrótico llega a 0 HP con al menos 2 escoltas vivas
- **THEN** resucita UNA vez con el 30 % de su HP máximo y se come la escolta
- **WHEN** llega a 0 HP sin 2 escoltas vivas
- **THEN** muere como cualquier otro jefe

#### Scenario: Placas con exposición (Coloso Blindado)

- **WHEN** el Coloso Blindado entra
- **THEN** tiene 3 placas de 10 % de su HP total cada una (30 % del HP en
  placas, el resto es cuerpo), que absorben antes que el cuerpo y no vuelven
- **WHEN** una placa se rompe
- **THEN** el jefe acelera ×1,06 y queda expuesto 3 s al eléctrico ×1,5

#### Scenario: Metamorfosis (Híbrido)

- **WHEN** el Híbrido cruza el 66 %, el 33 % y el 15 % de su HP
- **THEN** su familia activa pasa de roca a cristal, de cristal a virus y de
  virus a roca, se teletransporta (blink) y el aviso anuncia la familia nueva

### Requirement: Familia activa

Las fases de un jefe MUST poder declarar `family`; cuando lo hacen, la
familia ACTIVA (`Enemy.activeFamily`) MUST reemplazar a la del tipo en toda
la lectura de combate: la matriz tipo × familia, las cartas de caza
(`familyHuntMul`) y el aviso del HUD (`boss:phase2`) MUST usar la familia
activa, no la base. El bestiario MUST mostrar la familia de cada fase. Sin
`family` declarada, la familia activa es la del tipo.

#### Scenario: El Híbrido cambia de matriz a mitad de pelea

- **WHEN** el Híbrido entra en la fase de cristal
- **THEN** el eléctrico le pega ×1,5 (fila cristal) y las cartas
  `hunt_crystal` se aplican
- **WHEN** el Híbrido entra en la fase de virus
- **THEN** el eléctrico vuelve a pegarle ×0,5 (fila virus)

#### Scenario: El aviso declara la familia vigente

- **WHEN** se dispara una fase con `family` nueva
- **THEN** el aviso del HUD dice "AHORA ES CRISTAL" (o la familia que toque)
  y el multiplicador NETO se calcula contra esa familia

#### Scenario: El bestiario muestra la familia de la fase

- **WHEN** se abre la ficha del Híbrido en el bestiario
- **THEN** cada fase lista su familia ("AHORA ES CRISTAL / VIRUS / ROCA")

### Requirement: Contabilidad y contrajuego

Devorar MUST consumir la escolta SIN pagar XP/score/ultimate, SIN emitir
`enemy:killed` y SIN contar baja ni fuga: el jugador que no limpia la
escolta pierde el botín. La resurrección MUST NOT emitir `enemy:killed`,
MUST NOT disparar el clear de la etapa ni contar la baja, y `checkBossDead`
MUST seguir viendo vivo al jefe resucitado. Toda ventana de exposición MUST
ser contrarrestable y legible: se anuncia en el HUD y se dibuja en el canvas
(aro de exposición) mientras dura.

#### Scenario: Devorar no paga botín

- **WHEN** el Blob Rey devora una escolta
- **THEN** la escolta desaparece sin `enemy:killed`, sin XP/score/ultimate
  y sin sumar una fuga

#### Scenario: Resucitar no cierra la etapa

- **WHEN** el Blob Necrótico resucita
- **THEN** no se emite `enemy:killed`, la etapa no se cierra, la baja no se
  cuenta y el jefe sigue en la barra

#### Scenario: La exposición se lee y se puede negar

- **WHEN** el jefe queda expuesto por devorar o por una placa rota
- **THEN** el HUD muestra el aviso con el tipo y el multiplicador, y el
  canvas dibuja un aro dorado durante la ventana
- **WHEN** se limpia la escolta antes del golpe final
- **THEN** el Blob Rey no encuentra qué devorar: sin bocado no hay cura

### Requirement: Lectura en el HUD

Cada activación relevante de una mecánica MUST anunciarse con el evento
`boss:mechanic` (payload `{kind, title, name, rule, boss}`) sin spamear:
lluvia y devorar UNA vez por pelea, placas en CADA rotura (3 por pelea) y
resurrección UNA vez. La barra del jefe MUST mostrar el estado vigente con
`bossMechLabel`: `PLACAS n/3`, `VA A RESUCITAR` o `EXPUESTO` (prioridad
placas → resurrección → exposición), y MUST quedar sin texto si no hay
estado. El canvas MUST dibujar el estado (placas orbitando, aro de
exposición, doble aro de resurrección, boca del devorar y onda de
metamorfosis) sin tapar el cuerpo.

#### Scenario: Lluvia y devorar se anuncian una vez

- **WHEN** el jefe activa la lluvia o el devorar por primera vez
- **THEN** se emite un `boss:mechanic` con título, nombre y regla; las
  activaciones siguientes no repiten el aviso

#### Scenario: Las placas avisan en cada rotura

- **WHEN** se rompe una placa del Coloso
- **THEN** se emite `boss:mechanic` (kind `plate`) con "QUEDAN 2 PLACAS" y
  la exposición abierta

#### Scenario: La barra muestra el estado

- **WHEN** el Coloso conserva 2 de 3 placas
- **THEN** la barra dice "PLACAS 2/3"
- **WHEN** el Necrótico tiene escolta suficiente para revivir
- **THEN** la barra dice "VA A RESUCITAR"
- **WHEN** hay una exposición viva
- **THEN** la barra dice "EXPUESTO"

### Requirement: Modos

Campaña, Infinito y Supervivencia MUST usar el mismo kit (`bossMech`) y la
misma fórmula de HP por tipo de jefe. Un jefe elegido por el modo (los tipos
que rota el Infinito y el tipo fijo de Supervivencia) MUST conservar su
mecánica firma y su contrajuego; el modo MUST NOT introducir variantes de
kit, inmunidades extra ni saltarse el +25 %.

#### Scenario: El Infinito conserva el kit

- **WHEN** entra un jefe en una etapa de Infinito (51+)
- **THEN** usa el `bossMech` de su tipo y el HP sale de la misma fórmula con
  su etapa

#### Scenario: La Supervivencia conserva el kit

- **WHEN** entra un jefe en Supervivencia
- **THEN** usa el `bossMech` de su tipo y la misma fórmula de HP, sin kit
  reducido ni inmunidades extra
