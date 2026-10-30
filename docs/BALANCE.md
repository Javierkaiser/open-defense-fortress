# Balance — Open Defense Fortress

Este documento resume las decisiones de balance vigentes y cómo medirlas. Los
números salen de un **simulador headless** y de la **sonda del director de
olas**; ninguno da pass/fail. Son un **piso, no un techo**: sirven para comparar
tendencias, no para prometer win rates exactos.

## Herramientas

```bash
# Campaña, 5 semillas por etapa
node scripts/balance-sim.mjs --mode=inteligente --meta=trajectory --seeds=5

# Meta del pool compartido: entre las 5 unidades que juega el jugador…
node scripts/balance-sim.mjs --mode=inteligente --meta=pool-focus --seeds=10
# …o entre las 11 unidades del catálogo (sin priorizar ninguna)
node scripts/balance-sim.mjs --mode=inteligente --meta=pool-spread --seeds=10

# Un stage puntual
node scripts/balance-sim.mjs --stage=50 --seeds=10

# Modos de elección de cartas
node scripts/balance-sim.mjs --mode=greedy|tardy|mixto|inteligente

# Techo de poder, meta, perks, kill rate, variantes, heat, supervivencia
node scripts/balance-sim.mjs --cards=ceiling --metalv=44 --perks=optimal
node scripts/balance-sim.mjs --killrate=75 --seeds=5
node scripts/balance-sim.mjs --variants=acorazado --seeds=5
node scripts/balance-sim.mjs --protocol=II --seeds=5
node scripts/balance-sim.mjs --survival --seeds=5

# Composición del director (sin motor, segundos)
node scripts/probe-waves.mjs --seeds=20
node scripts/probe-waves.mjs --stages=1,5,6,10,20,30,40,50
node scripts/probe-waves.mjs --full
```

### Modos del simulador

| Modo | Qué jugador modela |
|---|---|
| `greedy` | Se queda con la primera oferta del catálogo. **Punto ciego histórico**: no juega el arsenal de la fila trasera. |
| `tardy` | Elige cartas con una política conservadora. |
| `mixto` | Desbloqueo al azar: sí juega mortero, gauss y láser. |
| `inteligente` | Maximiza DPS con las cartas. Es el perfil de referencia actual. |

`--cards=ceiling` mide el techo de poder; `--cards=normal` el caso normal.
`--killrate=X` asume que el jugador mata como máximo el X % de la ola.

El meta tiene tres políticas (`--meta`):

| `--meta` | Qué modela |
|---|---|
| `pool-focus` (default de `trajectory`) | El pool acumulado (600 por etapa limpia) se reparte en cuotas iguales de 5: **cada torre y dron que entra en la run** recibe esa cuota. Es la trayectoria real de un jugador que invierte en lo que juega. |
| `pool-spread` | El mismo pool repartido entre las **11 unidades** del catálogo desde el arranque (mide "no priorizar nada"). |
| `--metalv=N` | Nivel fijo en todas las unidades (escenarios de piso/techo, comparable con las tablas viejas). |

> **Cuidado**: el simulador no es el juego. Sirve para comparar antes/después
> con las mismas semillas. Las diferencias de ±10 puntos en un mismo stage son
> ruido si la muestra es chica.

## Curva de la campaña

- **HP de base**: `baseHpForStage(s)` = `2000 + 480·(s-1)`, redondeado a 100.
  S1 arranca en 2000; S50 en 25 500.
- **HP enemigo**: escala con `scaleFor(stage)`; la pendiente es 0,14 por etapa.
- **Velocidad enemiga**: +0,02 por etapa.
- **Jefes**: S1, 10, 20, 30, 40 y 50. El HP del jefe escala con la etapa.
- **XP**: `xpForKill()` escala con el `hpMul` de la etapa. El **score** se
  mantiene plano por etapa (la leaderboard es por etapa).
- **Precio de nivel**: `(60 + 45·(n-1)) × levelScaleForStage(s)`, con
  `LEVEL_PRICE_PER_STAGE = 0,07` (`×1` en S1, `×4,43` en S50).
- **Cartas por etapa**: ~20 repartidas; tope duro `MAX_CARDS_PER_STAGE = 20` y
  `MAX_LEVEL_PER_STAGE = 21`. El XP sobrante se convierte en score.
- **Fugas**: la etapa permite un presupuesto de fugas del **25 %** de la ola.
  Al agotarse, la base cae. Matar enemigos antes de que lleguen lo abarata.

### Campaña: referencia de S50 (10 semillas)

| Protocolo | Heat | Win | HP final | % bajas |
|---|---|---:|---:|---:|
| Sin heat | 0 | 100 % | 90 % | 92 % |
| I | 5 | 90 % | 66 % | 80 % |
| II | 10 | 70 % | 48 % | 61 % |
| III | 16 | 40 % | 16 % | 39 % |
| IV | 24 | 20 % | 5 % | 27 % |
| V | 35 | 30 % | 8 % | 27 % |

La varianza es alta: con 5 semillas, IV/V pueden verse 10–15 puntos arriba o
abajo. La banda objetivo es heat 5 ≈ 80–90 %, heat 10 ≈ 55–70 %, heat 20 ≈
20–35 %.

## Director de olas

`waves.js` reparte un **presupuesto de HP**, no una lista fija:

```text
waveBudget = densidad × budgetFit × presión × 33 HP × densityMul
```

- **Presión**: apertura ×0,65 → picos ×1,30 → respiro ×0,62 → marea final
  ×1,35, normalizada a media 1,00.
- **Biomas por década**: S1–9 roca; S10–19 virus; S20–29 espora; S30–39
  cristal; S40–50 roca con las cuatro familias. Décadas consecutivas no
  comparten dominante y cada familia tiene su década. Las tablas manuales
  1..5 usan su composición real (S1–2 roca + cristal, S3 virus, S4 espora,
  S5 las cuatro).
- **Crystal**: exactamente 1 por descarga, descontado del presupuesto. Antes
  era una lotería del 28–31 %; el crystal es la fuente de XP más importante.
- **Escalonado**: `stagger`/`delay`/`lane` por grupo, `waveSchedule()` pura y
  jitter de velocidad ±7 % (fuera de la apertura).
- **Cola**: `WaveManager` usa `pending[]`; el aviso de jefe la vacía y la etapa
  no cierra con pendientes.
- **Variantes**: 3–4 % de los enemigos; ~70 % de las descargas llevan una. En
  >50 la probabilidad sube de 0,70 a 0,85.
- **Guarda**: el HP por etapa se mantiene dentro del **±10 %** de la línea base,
  medido con 20 semillas. La cubre `tests/test-stages.mjs`.

## Enjambres y tanques por familia

El roster nuevo busca que cada familia tenga una **identidad de combate**,
no sólo un multiplicador de daño:

| Familia | Enjambre | Tanque | Mecánica del tanque |
|---|---|---|---|
| Roca | `rockSwarm` (12 HP) | `boulder` (190 HP) | Desmoronamiento: 3 `rockSwarm` al morir |
| Virus | `virusSwarm` (10 HP) | `blob` (220 HP) / `miniBlob` (160 HP) | Cepa: +20 % velocidad a enjambres virus en 120 px |
| Espora | `spore` (8 HP) | `sporePod` (190 HP) | Esporulación: 2 esporas/6 s, tope 6; 2 al morir |
| Cristal | `crystalSwarm` (12 HP) | `geode` (240 HP) | Placas: 3 × 15 % del HP; cada rotura acelera +10 % |

- **Crías de mecánicas**: 10 % de XP/score. La variante `divisor` conserva su
  35 % y no se toca. El XP queda en 0,5 para una cría de 5 puntos; el score
  usa carry entero (0,5 + 0,5 = 1) para no mostrar decimales ni pagar 20 %.
- **Anti-recursión**: una cría de `divisor` o de una mecánica no activa
  `spawner`/`deathSpawn`.
- **HP efectivo**: `boulder` 190 + 36 = 226; `sporePod` 190 + hasta 48 + 16
  = 254 si se lo deja madurar; `geode` 240 (las placas son parte del HP).
  `effectiveHpOf()` y `tests/test-enemies.mjs` fijan el rango 220–254 para
  que un cambio de `maxAlive`/`count` no quede invisible.
- **Campaña**: S1–2 roca + cristal; S3 virus; S4 espora; S5 las cuatro.
  `sporePod` debuta en S20 y `geode` en S30.
- **Medición** (`probe-waves --seeds=20`): S1 90 % roca; S6 45 %; S10 46 %
  virus; S20 45 % espora; S30 45 % cristal; S40 47 % y S50 46 % roca.
  HP/etapa 22/28/52/67/76/94k contra la línea base 22/28/54/69/77/95k
  (todo dentro de ±4 %). `balance-sim` no muestra una caída de win rate
  atribuible a los spawns; las crías se cuentan aparte
  (`spawnKills`/`spawnLeaks`/`splitLeaks`).

## Torres, cartas y meta

- **5 slots**, **5 torres + 1 dron por run**. Las torres y drones entran por
  cartas; no hay colocación libre.
- **8 torres**: Guardian, Missile, Beam, Thunderstroke, Tesla, Mortar, Gauss y
  Láser. **3 drones**: Rueda de Fuego, Mosquitos y Campo de Fuerza.
- **Guardian (fase 73)**: balas paralelas separadas 10 px (antes 13) y
  colisión barrida (CCD): una bala a 920 px/s ya no se salta a una espora
  entre frames a 30 fps o 2×. El multi-blanco de Lv.4 se mantiene.
- **Thunderstroke (fase 73)**: alcance global; un rayo principal de 65 al más
  lejano + estallido de mini rayos (50 % a hasta 3 vecinos en 130 px). Los
  perks `extraCount`/`chainFork` suman mini rayos, no rayos principales. DPS
  nominal ≈40,6 a un blanco y ≈102 contra un principal + 3 vecinos. Se
  diferencia de la Tesla, que encadena saltos con falloff.
- **84 cartas** con topes por carta y por run; las mejoras ofrecidas se
  relacionan con las unidades, tags y técnicas presentes. Incluyen daño global
  (+10% ×2), daño por tipo (+20% ×2), mecánicas por torre y 11 combos con
  prerrequisitos (frío, lifesteal, marcas, stun, rebote y perforación).
- **Meta**: 100 niveles por unidad; **pool de fragmentos compartido** (300 por
  victoria, 600 la primera limpieza de cada etapa); `fragCost(nivel) =
  75 + 35·década` (22 860 para llevar una unidad a Nvl.100) y +18 % de daño por
  nivel. La trayectoria real llega a **Nvl.44 en S50** si el pool se invierte en
  las 5 unidades que juega el jugador (**Nvl.26** si se reparte entre las 11).
  Ver §"Meta v2 — pool compartido".
- **Desbloqueos con oro**: una cuenta nueva arranca **solo con Guardian**; las
  otras 10 unidades se compran con oro (150–500) y recién entonces su carta
  `unlock_*` entra en la oferta. Ver
  `openspec/specs/meta-game/tower-unlocks/spec.md`.
- **DPS**: `DPS_SCALE = 0,75` en torres y drones (incluido el DoT del cráter y
  de los drones); la **Tesla queda exenta** (`DPS_SCALE_BY_UNIT = { tesla: 1 }`).
  Es un −25 % parejo del daño nominal y **el HP de las olas no se compensó**.
- **Perks**: remate, robo de vida con tope del **10 %** del daño efectivo y
  explosión al matar. Los valores por perk son 1–6 %.

## Meta v2 — pool compartido

### Economía

- **Fragmentos = un pool compartido** (`fragsPool`), no un saldo por torreta.
  Cada victoria suma **300**; la **primera** limpieza de una etapa suma **600**
  (300 × `META_FIRST_CLEAR_MULT`). Los hitos de Protocolo, la supervivencia y el
  ∞ suman al mismo pool. No hay "MEJORAR todo": se sube una torreta por vez
  contra el mismo saldo.
- **Oro**: se gana por etapa (25) y por campaña completa (150); se gasta en
  desbloquear unidades (150–500) y en redistribuir perks (500).
- **Desbloqueos**: una cuenta nueva arranca **solo con Guardian**; las otras 10
  unidades se compran con oro. Una unidad bloqueada no entra en la oferta de
  cartas, no se mejora y su `metaDmgMul` es 1
  (`openspec/specs/meta-game/tower-unlocks/spec.md`).
- **Coste de nivel**: `fragCost(n) = 75 + 35·década` → **22 860** fragmentos
  para llevar una unidad de Nvl.1 a Nvl.100. **+18 %** de daño por nivel meta.
- **Migración**: un save v1 (fragmentos por torreta) suma todos sus saldos al
  pool y conserva niveles, oro y perks.

### Trayectoria del pool

Antes del stage N el jugador lleva (N-1) limpiezas, cada una con su primera vez:
**600 × (N-1)** fragmentos. Repartidos entre las **5 unidades que juega** (la
cuota por slot) da 120 por unidad y por etapa, que es exactamente la trayectoria
vieja de 120 por torreta. Repartidos entre las 11, la misma bolsa rinde mucho
menos:

| Stage | Pool acumulado | `pool-focus` (5) | `pool-spread` (11) |
|---:|---:|---:|---:|
| 10 | 5 400 | 14 | 7 |
| 20 | 11 400 | 23 | 13 |
| 25 | 14 400 | 28 | 16 |
| 30 | 17 400 | 32 | 18 |
| 40 | 23 400 | 38 | 22 |
| 45 | 26 400 | 41 | 24 |
| 50 | 29 400 | 44 | 26 |

`pool-focus` (alias de `--meta=trajectory`) aplica la cuota por unidad
(pool / 5) a **cada torre y dron que entra en la run**: el jugador invierte el
pool en lo que juega. La política vieja subía las 11 unidades al mismo nivel;
la nueva sube las que pelean, con el MISMO nivel por unidad — por eso
`--meta=pool-focus` en S50 da exactamente la misma corrida que `--metalv=44`
(lo fija `tests/test-balance-sim.mjs`).

`pool-spread` reparte el pool entre las 11 unidades desde el arranque: mide el
coste de no priorizar nada (S50 = Nvl.26).

### Resultados medidos (10 semillas)

S50, `--mode=inteligente`:

| Escenario | meta | win | HP fin | % bajas | leaks | daño de fugas |
|---|---:|---:|---:|---:|---:|---:|
| Antes (1.6.0, 20 semillas) | 44 | 100 % | 93 % | 99 % | — | — |
| `--meta=pool-focus` | 44 | 100 % | 72 % | 91 % | 55,7 | 7 051 |
| `--meta=pool-spread` | 26 | 50 % | 20 % | 43 % | 123,3 | 20 350 |
| `--stage=50` (piso, meta 1) | 1 | 0 % | 0 % | 0 % | 145,3 | 25 500 |

S50 + Protocolo II (`greedy`, el comando tal cual):

| Escenario | meta | win | HP fin | % bajas | leaks | daño de fugas |
|---|---:|---:|---:|---:|---:|---:|
| Antes (1.6.0) | 44 | 70 % | 48 % | 61 % | — | — |
| `--protocol=II --meta=pool-focus` | 44 | 80 % | 41 % | 75 % | 77,2 | 15 124 |
| `--protocol=II` (piso, meta 1) | 1 | 0 % | 0 % | 0 % | 112,7 | 25 500 |

Campaña con `--meta=pool-focus` (`--mode=inteligente`):

| Stage | meta | win | HP fin | % bajas | leaks | daño de fugas |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 100 % | 100 % | 102 % | 0,0 | 0 |
| 2 | 2 | 100 % | 100 % | 100 % | 0,1 | 2 |
| 3 | 4 | 100 % | 91 % | 99 % | 1,4 | 257 |
| 4 | 5 | 100 % | 97 % | 99 % | 2,6 | 92 |
| 5 | 7 | 100 % | 100 % | 100 % | 0,0 | 0 |
| 6 | 9 | 100 % | 93 % | 98 % | 8,0 | 304 |
| 10 | 14 | 100 % | 92 % | 101 % | 9,1 | 516 |
| 20 | 23 | 100 % | 88 % | 98 % | 23,6 | 1 385 |
| 30 | 32 | 100 % | 79 % | 95 % | 34,0 | 3 302 |
| 50 | 44 | 100 % | 72 % | 91 % | 55,7 | 7 051 |

Campaña con `--meta=pool-spread` (`--mode=inteligente`):

| Stage | meta | win | HP fin | % bajas | leaks | daño de fugas |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 100 % | 100 % | 102 % | 0,0 | 0 |
| 2 | 1 | 100 % | 98 % | 99 % | 2,8 | 43 |
| 3 | 2 | 100 % | 85 % | 98 % | 2,8 | 432 |
| 4 | 3 | 100 % | 90 % | 97 % | 6,0 | 356 |
| 5 | 3 | 100 % | 99 % | 100 % | 1,0 | 41 |
| 6 | 4 | 90 % | 62 % | 84 % | 41,5 | 1 672 |
| 10 | 7 | 90 % | 66 % | 88 % | 37,1 | 2 113 |
| 20 | 13 | 70 % | 49 % | 72 % | 75,9 | 5 643 |
| 30 | 18 | 30 % | 25 % | 36 % | 99,5 | 11 942 |
| 50 | 26 | 50 % | 20 % | 43 % | 123,3 | 20 350 |

Lectura:

- **El pool no cambia el nivel por unidad**: `pool-focus` reproduce los 44 de la
  trayectoria histórica. Lo que cambia es el alcance: el jugador ya no puede
  subir las 11 a la vez.
- **La caída de HP fin (93 → 72 %) es el dial de DPS (−25 %)**, no el pool: con
  `--metalv=44` (las 11 al 44, la política vieja) el S50 queda en 100 % / 72 % /
  91 %, idéntico a `pool-focus`. El antes sale de la tabla de 1.6.0; el después
  está medido con este árbol, donde además del dial estaban entrando los cambios
  de cartas del mismo rework.
- **El win% no es monótono con el poder**: el director genera la ola con la
  potencia del jugador (`powerMul`), así que un meta más bajo pelea una ola más
  chica. `pool-spread` gana 30 % en S30 (Nvl.18) y 50 % en S50 (Nvl.26), y
  `pool-focus` gana 100 % en las dos. Comparar niveles distintos exige mirar HP
  fin y bajas, no sólo el win.
- **El % de bajas puede pasar de 100**: el denominador es la cola del director;
  los escoltas del jefe no están en esa cola pero sí cuentan como bajas de ola.

## Modo infinito (∞)

- Etapas 51+ generadas con la **misma curva** de HP de base (`baseHpForStage`).
- Jefe cada 10 etapas; nombre y tipo por vuelta.
- `ENDLESS_FIT_SLOPE = 0,04` (+4 % del presupuesto por descarga por etapa sobre
  el S50); sin término cuadrático.
- **El conteo de enemigos no escala 1:1 con el presupuesto**: +25 % de
  presupuesto ≈ +13 % de enemigos y +47 % de HP en S60. La guarda del test es
  +8 % y la tendencia S60 > S50, S70 > S60 se cumple.
- El ∞ **no juega con Heat** en v1: la profundidad 51 ya arranca en el techo de
  poder y un modificador encima la vuelve injugable. Queda para una versión
  posterior.

## Supervivencia

- Base de **25 500 HP**; sin contador de fugas.
- Cada fuga resta el **HP máximo** del enemigo (atrición).
- Olas cada ~8 s; presupuesto **lineal**: `60 + 30·oleada` de HP base.
- Jefe cada **5** oleadas; el tema rota cada 5.
- Tope de nivel 31 (30 cartas); XP con la curva del stage base (1).
- Recompensa solo por **oleadas nuevas** sobre el récord, × heat.
- La curva es **provisional**: el simulador tiene artefactos (la base no sufre
  y la oleada avanza). Vale la tendencia, no el número absoluto.

## Heat / Protocolo

- **11 condiciones** con rangos y coste acumulativo; máximo **49**.
- **Presets**: I=5, II=10, III=16, IV=24, V=35.
- **Recompensa**: `heatRewardMul = 1 + 0,08·heat` (heat 10 ≈ ×1,8).
- **Hitos únicos** 5/10/20/35: 60/120/240/420 fragmentos **al pool**.
- v1 se aplica **solo a la campaña**. El ∞ y el daily juegan a heat 0.

## Metodología y guardas

1. Medir antes de tocar: correr el sim y la sonda con las mismas semillas.
2. Cambiar **un dial** por vez: `LEVEL_PRICE_PER_STAGE`, `budgetFit`,
   `densityMul`, `variantChanceFor`, `ENDLESS_FIT_SLOPE`, etc.
3. No compensar dos veces: si el presupuesto de HP no se movió, el win rate
   tampoco debería moverse.
4. Guardar el resultado de la sonda: la composición se mide en segundos.
5. Las diferencias de ±10 puntos con 5 semillas son ruido. Para decisiones
   finas, usar 10–20 semillas.
6. La suite tiene guardas de regresión de HP por etapa, apertura, jefes,
   variantes y supervivencia.

## Estado actual (v1.7.0)

- Campaña: 50 etapas, win 100 % con la trayectoria real de meta y cartas.
- S50 sin heat: 100 % / 72 % de HP / 91 % de bajas (10 semillas, `pool-focus`;
  antes de 1.7.0: 93 % / 99 %).
- Heat: la escalera 5→35 se re-mide con el pool nuevo; Protocolo II queda en
  80 % de win en S50 (10 semillas).
- ∞: la pared empieza alrededor de 60–70; el win cae con la profundidad.
- Supervivencia: ~84 oleadas planas en el simulador; el número absoluto no es
  confiable, la tendencia sí.
- Identidad (1.5.0): el rework de perks/mecánicas no movió las métricas
  globales (S50 92 % HP / 99 % bajas). Las marcas (`melt`, `judgment`, `ion`,
  `cut`, `rail`) son deliberadamente chicas (+8 a +15 %) y los combos cambian
  cantidad/target, no sólo daño.
- Drones (1.5.1): el Campo de Fuerza baja su base 140→120 y tiene tope duro
  190 (antes llegaba a 311); la Rueda de Fuego patrulla el campo en vez de
  volver a la base. El S50 queda en 91 % HP / 99 % bajas: el nerf de cobertura
  y el buff de uptime se compensan.
- Cráter del Mortar (1.5.2): el fix de parámetros recupera el DoT/slow de zona
  que antes no se instanciaba. El S50 sube a 92 % HP / 99 % bajas, dentro del
  margen; no hizo falta tocar `craterDps`.
- Renombre (1.5.3): Avispas → Mosquitos es sólo texto/flavor; no cambia
  stats, cartas ni balance.
- Limpieza de cartas (1.5.4): se quitaron `xp_boost` y `score_gain`; el
  Escudo de Base conserva la defensa. El S50 queda en 93 % HP / 99 % bajas:
  el pool más corto compensa la pérdida de la carta de XP.
- Skins de torres (1.6.0): cambio 100 % visual (paleta, motivos, pad y FX).
  No toca daño, cadencia, hitbox ni balance; la simulación no se re-mide.
- Meta v2 (1.7.0): pool compartido de 300/600, desbloqueos con
  oro y `DPS_SCALE = 0,75` (Tesla exenta). Medido con `--meta=pool-focus`
  (Nvl.44 en S50, 10 semillas): S50 sin heat **100 % win / 72 % HP / 91 %
  bajas** (antes 93 % / 99 %) y Protocolo II **80 % / 41 % / 75 %** (antes
  70 % / 48 % / 61 %). El piso (meta 1) ya no gana el S50: 0 % / 0 % / 0 %.
  Detalle y aritmética en §"Meta v2 — pool compartido".
- El balance sigue siendo un trabajo abierto: el simulador es una herramienta
  de comparación, no un oráculo.
