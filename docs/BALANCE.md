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
| `pool-focus` (default de `trajectory`) | El pool acumulado (300 por etapa limpia) se reparte en cuotas iguales de 5: **cada torre y dron que entra en la run** recibe esa cuota. Es la trayectoria de una limpieza por etapa; el farmeo se mide aparte con `--metalv`. |
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
| Roca | `rockSwarm` (15 HP) | `boulder` (238 HP) | Desmoronamiento: 3 `rockSwarm` al morir |
| Virus | `virusSwarm` (13 HP) | `blob` (275 HP) / `miniBlob` (200 HP) | Cepa: +20 % velocidad a enjambres virus en 120 px |
| Espora | `spore` (10 HP) | `sporePod` (238 HP) | Esporulación: 2 esporas/6 s, tope 6; 2 al morir |
| Cristal | `crystalSwarm` (15 HP) | `geode` (300 HP) | Placas: 3 × 15 % del HP; cada rotura acelera +10 % |

- **Crías de mecánicas**: 10 % de XP/score. La variante `divisor` conserva su
  35 % y no se toca. El XP queda en 0,5 para una cría de 5 puntos; el score
  usa carry entero (0,5 + 0,5 = 1) para no mostrar decimales ni pagar 20 %.
- **Anti-recursión**: una cría de `divisor` o de una mecánica no activa
  `spawner`/`deathSpawn`.
- **HP efectivo**: `boulder` 238 + 45 = 283; `sporePod` 238 + hasta 60 + 20
  = 318 si se lo deja madurar; `geode` 300 (las placas son parte del HP).
  `effectiveHpOf()` y `tests/test-enemies.mjs` fijan el rango 275–318 para
  que un cambio de `maxAlive`/`count` no quede invisible.
- **HP (1.8.0)**: +25 % al HP base de los 17 tipos (tabla de arriba). El
  presupuesto de las olas **no** se compensó.
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
- **107 cartas normales** (84 + 23 doctrinas) y **33 legendarias** fuera del
  catálogo. Casi todas las mejoras se eligen una sola vez (`CAPS = 1`); las
  doctrinas son la excepción (2 rangos) y `bullets_5` sigue siendo el level-up
  del Guardian. Las mejoras ofrecidas se relacionan con las unidades, tags y
  técnicas presentes. Incluyen daño global (+10% una vez), daño por tipo
  (+20% una vez), mecánicas por torre y 11 combos con prerrequisitos (frío,
  lifesteal, marcas, stun, rebote y perforación).
- **Meta**: 100 niveles por unidad; **pool de fragmentos compartido** (150 por
  victoria, 300 la primera limpieza de cada etapa); `fragCost(nivel) =
  75 + 35·década` (22 860 para llevar una unidad a Nvl.100) y +9 % de daño por
  nivel. La trayectoria de **una limpieza por etapa** llega a **Nvl.28 en S50**
  si el pool se invierte en las 5 unidades que juega el jugador (**Nvl.16** si
  se reparte entre las 11). El S50 de 1.8.0 exigía Nvl.44: con +9 %/nivel el
  jugador debe **farmear repitiendo etapas** hasta Nvl.87 para recuperar el
  ×8,74. Ver §"Meta v2 — pool compartido".
- **Desbloqueos con oro**: una cuenta nueva arranca **solo con Guardian**; las
  otras 10 unidades se compran con oro (150–500) y recién entonces su carta
  `unlock_*` entra en la oferta. Ver
  `openspec/specs/meta-game/tower-unlocks/spec.md`.
- **DPS**: `DPS_SCALE = 0,75` en torres y drones (incluido el DoT del cráter y
  de los drones); la **Tesla queda exenta** (`DPS_SCALE_BY_UNIT = { tesla: 1 }`).
  Es un −25 % parejo del daño nominal y **el HP de las olas no se compensó**.
- **Ajuste 1.7.1**: la torre básica baja a **15,0 DPS** (Guardian `5 / 0.25`);
  el Missile sube a **20,0 DPS efectivo** (`170 / 3.2`, splash 64) y la Tesla a
  **10,0** (`7 / 0.7`). El resto queda como en 1.7.0.
- **Perks**: remate, robo de vida con tope del **10 %** del daño efectivo y
  explosión al matar. Los valores por perk son 1–6 %.

## Meta v2 — pool compartido

### Economía

- **Fragmentos = un pool compartido** (`fragsPool`), no un saldo por torreta.
  Cada victoria suma **150**; la **primera** limpieza de una etapa suma **300**
  (150 × `META_FIRST_CLEAR_MULT`). Los hitos de Protocolo, la supervivencia y el
  ∞ suman al mismo pool. No hay "MEJORAR todo": se sube una torreta por vez
  contra el mismo saldo. **Repetir una etapa ya limpiada paga 150**: es la
  fuente del farmeo de la economía 1.9.0.
- **Oro**: se gana por etapa (25) y por campaña completa (150); se gasta en
  desbloquear unidades (150–500) y en redistribuir perks (500).
- **Desbloqueos**: una cuenta nueva arranca **solo con Guardian**; las otras 10
  unidades se compran con oro. Una unidad bloqueada no entra en la oferta de
  cartas, no se mejora y su `metaDmgMul` es 1
  (`openspec/specs/meta-game/tower-unlocks/spec.md`).
- **Coste de nivel**: `fragCost(n) = 75 + 35·década` → **22 860** fragmentos
  para llevar una unidad de Nvl.1 a Nvl.100. **+9 %** de daño por nivel meta.
- **Migración**: un save v1 (fragmentos por torreta) suma todos sus saldos al
  pool y conserva niveles, oro y perks.

### Trayectoria del pool

Antes del stage N el jugador lleva (N-1) limpiezas, cada una con su primera vez:
**300 × (N-1)** fragmentos. Repartidos entre las **5 unidades que juega** (la
cuota por slot) da 60 por unidad y por etapa. Repartidos entre las 11, la misma
bolsa rinde mucho menos:

| Stage | Pool acumulado | `pool-focus` (5) | `pool-spread` (11) |
|---:|---:|---:|---:|
| 10 | 2 700 | 8 | 4 |
| 20 | 5 700 | 14 | 7 |
| 25 | 7 200 | 17 | 9 |
| 30 | 8 700 | 20 | 11 |
| 40 | 11 700 | 24 | 13 |
| 45 | 13 200 | 26 | 15 |
| 50 | 14 700 | 28 | 16 |

`pool-focus` (alias de `--meta=trajectory`) aplica la cuota por unidad
(pool / 5) a **cada torre y dron que entra en la run**: el jugador invierte el
pool en lo que juega. `--meta=pool-focus` en S50 da la misma corrida que
`--metalv=28` (lo fija `tests/test-balance-sim.mjs`).

`pool-spread` reparte el pool entre las 11 unidades desde el arranque: mide el
coste de no priorizar nada (S50 = Nvl.16).

### El bucle de farmeo (1.9.0)

La tabla anterior es la de **una limpieza por etapa**, no la del jugador que
farmea. Con 150 por victoria y +9 %/nivel, el S50 no se alcanza en una pasada:
el jugador tiene que repetir etapas ya limpiadas, que siguen pagando 150.

- Para recuperar el ×8,74 de 1.8.0 hace falta **Nvl.87** (17 930 fragmentos
  por torre; 89 650 para las 5 del foco). La campaña de primeras limpiezas
  aporta 14 700; faltan ~74 950 fragmentos = **~500 repeticiones** de 150.
- **Nvl.75** deja el S50 en **70 % win / 42 % HP / 66 % bajas** y cuesta
  13 880 por torre (69 400 para 5): **~365 repeticiones** extra.
- **Nvl.87** deja el S50 en **90 % win / 61 % HP / 82 % bajas**.

Ese es el coste explícito de la economía: el jugador ya no llega al S50 con la
campaña limpia; tiene que farmear. La simulación de `pool-focus` mide el piso
sin farmeo (S50 0 %) y `--metalv=75/87` mide el objetivo farmeado.

### Resultados medidos (10 semillas)

S50, `--mode=inteligente`:

| Escenario | meta | win | HP fin | % bajas | leaks | daño de fugas |
|---|---:|---:|---:|---:|---:|---:|
| Antes (1.6.0, 20 semillas) | 44 | 100 % | 93 % | 99 % | — | — |
| `--meta=pool-focus` (1.7.1) | 44 | 70 % | 45 % | 66 % | 87,0 | 13 941 |
| `--meta=pool-focus` (1.8.0) | 44 | **90 %** | **59 %** | **81 %** | 67,1 | 10 457 |
| `--meta=pool-focus` (1.9.0, sin farmeo) | 28 | **0 %** | **0 %** | **0 %** | 116,1 | 25 500 |
| `--metalv=75` (farmeado) | 75 | 70 % | 42 % | 66 % | 85,5 | 14 899 |
| `--metalv=87` (farmeado) | 87 | 90 % | 61 % | 82 % | 61,9 | 9 941 |
| `--meta=pool-spread` (1.7.1) | 26 | 50 % | 24 % | 49 % | 116,1 | 19 365 |
| `--meta=pool-spread` (1.8.0) | 26 | **10 %** | **7 %** | **18 %** | 135,1 | 23 690 |
| `--meta=pool-spread` (1.9.0, sin farmeo) | 16 | **0 %** | **0 %** | **0 %** | 130,5 | 25 500 |
| `--stage=50` (piso, meta 1) | 1 | 0 % | 0 % | 0 % | 130,6 | 25 500 |

S50 + Protocolo II (`--protocol=II --meta=pool-focus`):

| Escenario | meta | win | HP fin | % bajas | leaks | daño de fugas |
|---|---:|---:|---:|---:|---:|---:|
| Antes (1.6.0) | 44 | 70 % | 48 % | 61 % | — | — |
| `--protocol=II --meta=pool-focus` (1.7.1) | 44 | 80 % | 24 % | 71 % | 85,5 | 19 645 |
| `--protocol=II --meta=pool-focus` (1.8.0) | 44 | **40 %** | **17 %** | **42 %** | 88,8 | 21 166 |
| `--protocol=II --meta=pool-focus` (1.9.0, sin farmeo) | 28 | **0 %** | **0 %** | **0 %** | 104,2 | 25 500 |
| `--protocol=II` (piso, meta 1) | 1 | 0 % | 0 % | 0 % | 93,8 | 25 500 |

Campaña con `--meta=pool-focus` (`--mode=inteligente`, 1.9.0 sin farmeo):

| Stage | meta | win | HP fin | % bajas | leaks | daño de fugas |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 100 % | 95 % | 101 % | 4,7 | 104 |
| 2 | 1 | 80 % | 71 % | 83 % | 23,5 | 734 |
| 3 | 2 | 20 % | 5 % | 33 % | 39,9 | 2 746 |
| 4 | 3 | 70 % | 53 % | 71 % | 30,2 | 1 589 |
| 5 | 4 | 90 % | 59 % | 82 % | 32,3 | 1 575 |
| 6 | 5 | 60 % | 25 % | 54 % | 70,7 | 3 291 |
| 10 | 8 | 10 % | 4 % | 10 % | 99,3 | 6 019 |
| 20 | 14 | 20 % | 6 % | 20 % | 142,4 | 10 480 |
| 30 | 20 | 10 % | 7 % | 11 % | 111,7 | 14 734 |
| 50 | 28 | 0 % | 0 % | 0 % | 116,1 | 25 500 |

Campaña con `--meta=pool-focus` (`--mode=inteligente`, 1.8.0):

| Stage | meta | win | HP fin | % bajas | leaks | daño de fugas |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 100 % | 95 % | 101 % | 4,7 | 104 |
| 2 | 2 | 90 % | 83 % | 92 % | 12,1 | 418 |
| 3 | 4 | 100 % | 88 % | 91 % | 12,4 | 361 |
| 4 | 5 | 100 % | 77 % | 94 % | 12,1 | 794 |
| 5 | 7 | 100 % | 98 % | 99 % | 1,7 | 76 |
| 6 | 9 | 100 % | 67 % | 92 % | 32,8 | 1 472 |
| 10 | 14 | 100 % | 71 % | 96 % | 29,5 | 1 827 |
| 20 | 23 | 60 % | 28 % | 56 % | 95,2 | 8 036 |
| 30 | 32 | 50 % | 28 % | 48 % | 84,9 | 11 463 |
| 50 | 44 | 90 % | 59 % | 81 % | 67,1 | 10 457 |

Campaña con `--meta=pool-spread` (`--mode=inteligente`, 1.7.1):

| Stage | meta | win | HP fin | % bajas | leaks | daño de fugas |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 100 % | 100 % | 102 % | 0,8 | 9 |
| 2 | 1 | 100 % | 89 % | 95 % | 12,5 | 276 |
| 3 | 2 | 100 % | 83 % | 94 % | 8,4 | 495 |
| 4 | 3 | 100 % | 86 % | 93 % | 13,1 | 471 |
| 5 | 3 | 100 % | 91 % | 95 % | 10,0 | 335 |
| 6 | 4 | 80 % | 61 % | 78 % | 48,5 | 1 726 |
| 10 | 7 | 70 % | 40 % | 63 % | 77,3 | 3 799 |
| 20 | 13 | 30 % | 12 % | 32 % | 147,7 | 9 786 |
| 30 | 18 | 20 % | 13 % | 27 % | 117,9 | 13 891 |
| 50 | 26 | 50 % | 24 % | 49 % | 116,1 | 19 365 |

Lectura:

- **El pool no cambia el nivel por unidad**: `pool-focus` da Nvl.28 en el S50
  con la economía de 1.9.0 (era Nvl.44 en 1.8.0). Lo que cambia es el alcance:
  el jugador ya no puede subir las 11 a la vez.
- **La caída de HP fin (93 → 45 %) es el ajuste de DPS de 1.7.1**, no el pool:
  Guardian 15 y el resto del arsenal ya venían del dial −25 %. El antes sale de
  la tabla de 1.6.0; el después está medido con este árbol.
- **El win% no es monótono con el poder**: el director genera la ola con la
  potencia del jugador (`powerMul`), así que un meta más bajo pelea una ola más
  chica. Comparar niveles distintos exige mirar HP fin y bajas, no sólo el win.
  Por eso la economía 1.9.0 se mide con `--metalv=75/87` (objetivo farmeado),
  no sólo con el nivel que da la campaña de una pasada.
- **1.9.0 — la economía es de farmeo**: con 150 por victoria y +9 %/nivel, la
  campaña de una sola pasada deja S50 en 0 %. El jugador tiene que repetir
  etapas: Nvl.75 (365 repeticiones extra) da 70 %; Nvl.87 (~500) da 90 %. El
  S50 de 1.8.0 dependía de Nvl.44 ×18 %; el nuevo techo se alcanza farmeando.
  No se compensó el director.
- **1.8.0 — el HP base no sube el HP de la ola**: el presupuesto del director
  está en HP base (`BUDGET_HP_PER_SLOT`), así que ×1,25 por enemigo con el mismo
  presupuesto compra ~20 % menos enemigos y deja el HP total de la descarga casi
  igual. El efecto medido no es “más difícil”: con `pool-focus` el S50 sube a
  90 % de win porque las cartas one-shot premian la **variedad** (más
  multiplicadores distintos) en lugar del stack; con `pool-spread` (meta 26) y
  Protocolo II el mismo cambio deja 10 % y 40 %, porque el jugador de bajo meta
  dependía de los stacks. La campaña queda no monótona: S30 (cristal, resiste
  balístico) 50 %, S50 (roca, sufre balístico) 90 %. Es el hallazgo para la
  próxima ronda; no se compensó en 1.8.0.
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
- El ∞ **aplica el Protocolo activo** (v1.7.2). La profundidad se guarda por
  nivel de Heat (`heat.endless`); el récord global de profundidad se conserva.
  El Daily es la excepción 1.12.0: fuerza Heat 39 (sin Censura ni Arsenal),
  aplica un bono de recompensa ×1,5 y guarda su récord personal por fecha
  (`endless.daily`, `heat = 39`).

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
- Se aplica a **campaña, ∞ y supervivencia**. El **desafío diario** es la
  excepción: fuerza las **9 condiciones restantes** al máximo (**Heat 39**;
  sin Censura ni Arsenal), suma un **bono ×1,5** a la recompensa
  (`heatRewardMul(39) = 4,12 → 6,18` total) y guarda ese Heat como récord
  personal.

## Prestigio y desafío diario (1.10.0)

- **Nueva Partida+**: se habilita al limpiar el S50. Conserva las unidades
  compradas y suma **+5 % de daño global por ciclo**, acumulativo hasta
  **+100 % (NG+ 20)**. El bonus entra en `metaDmgMul`, así que multiplica la
  curva de nivel y los hitos (en Nvl.100, NG+ 20 lleva ×9,91 a ×19,82 antes de
  hitos). Resetea campaña, récords, rango/victorias, perks, niveles,
  fragmentos y oro; el jugador vuelve a empezar en S1 con esas unidades.
- **Reset Global**: borra todo, incluido el ciclo NG+ y las unidades
  compradas. El oro vuelve al inicial (100). No toca tema, calidad ni audio.
- **Desafío diario**: elige una etapa del pool ya desbloqueado (campaña 1..N +
  profundidades abiertas del ∞) con la fecha local y la congela en el primer
  intento. Aplica **Heat 39** (las 9 condiciones restantes al máximo, sin
  Censura ni Arsenal), sin importar el Protocolo activo. El bono diario
  **×1,5** se suma a fragmentos y oro; los hitos únicos de Heat no se
  multiplican. El récord es **personal**: la etapa puede diferir entre
  jugadores con progreso distinto, así que no se compara entre cuentas.
- El diario ya no exige el ∞ abierto: una cuenta nueva con solo el S1 puede
  jugarlo. Heat 39 y el bono ×1,5 lo dejan como un objetivo de largo plazo,
  pero con una recompensa acorde: una primera limpieza diaria paga ~1.854
  fragmentos (antes ~1.476) y ~154 de oro (antes ~123).

## Maestría y legendarias (1.11.0)

- **Nivel 1–6 para las 11 unidades**: cada carta dedicada sube un nivel. La
  curva se suaviza a **+5 % daño / −2 % recarga por nivel** (antes +25 %/−8 %)
  porque ahora la reciben todas las unidades y se apila con las cartas
  exclusivas/técnicas. Los drones escalan +5 % de su efecto principal.
- **El nivel ya no regala balas al Guardian**: la base es 1 bala y las
  **balas 2.ª y 3.ª** siguen siendo la identidad de `bullets_5`, que ahora
  entrega `burstBonus` por aplicación. Sin este recorte, cualquier carta del
  Guardian lo llevaba a 3 balas y el S50 subía ~20 puntos de win rate.
- **Maestría 0–15**: suma con cartas dedicadas, de tipo, globales, de cadencia,
  caza y combos. Cada 5 abre una elección legendaria (3/2/1 cartas). Las
  legendarias son solo de run y no tocan el meta, NG+ ni los récords.
- **Doctrinas**: 23 cartas repetibles 2 veces. Son la vía para que todas las
  unidades alcancen Lv.6 sin depender de cartas exclusivas.

### Medición (10 semillas, `--mode=inteligente`)

| Escenario | Nvl.75 | Nvl.87 |
|---|---|---|
| 1.10.0 (baseline) | 70 % win / 42 % HP / 66 % bajas | 90 % / 61 % / 82 % |
| 1.11.0 normal | **70 % / 37 % / 67 %** | **90 % / 54 % / 82 %** |
| 1.11.0 con `--legendaries` (techo, todas las elecciones) | **80 % / 40 % / 72 %** | **100 % / 56 % / 88 %** |

Lectura: el win rate se mantiene; el HP baja unos puntos porque las doctrinas
diluyen la oferta con cartas de progresión. `--legendaries` es una **cota
superior** (toma todas las elecciones de todas las unidades, no una build
enfocada): +10 puntos de win en Nvl.75 y +10 en Nvl.87, dentro de la guarda de
±10-15 puntos. Si una build enfocada supera esa cota, se ajustan las
legendarias, no la curva base.

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

## Estado actual (v1.11.0)

- **Campaña de una pasada**: S1 100 %, S2 80 %, S3 20 %, S4 70 %, S5 90 %,
  S6 60 %, S10 10 %, S20 20 %, S30 10 %, S50 0 % con `pool-focus` (10
  semillas). Es el **piso sin farmeo**: el jugador ya no llega al S50 con una
  limpieza por etapa.
- **S50 farmeado (1.11.0)**: `--metalv=75` da **70 % win / 37 % HP / 67 %
  bajas**; `--metalv=87` da **90 % / 54 % / 82 %**. La cota superior con
  `--legendaries` es 80/40/72 y 100/56/88. Para Nvl.87 hacen falta ~500
  repeticiones extra de 150 fragmentos; para Nvl.75, ~365.
- S50 sin farmeo: **0 % win / 0 % HP / 0 % bajas** (Nvl.28). 1.8.0: 90/59/81
  con Nvl.44 y +18 %/nivel.
- Heat: Protocolo II sin farmeo queda en **0 % / 0 % / 0 %** en S50; con el
  mismo objetivo farmeado escala desde ahí.
- `pool-spread` sin farmeo (Nvl.16) queda en **0 % win / 0 % HP / 0 % bajas**.
- ∞: la pared empieza alrededor de 60–70; el win cae con la profundidad.
- Heat en ∞/Daily (1.12.0): el ∞ sigue usando el Protocolo activo y guarda su
  récord por Heat (`heat.endless`). El Daily fuerza Heat 39 (sin Censura ni
  Arsenal), aplica bono ×1,5 y guarda su récord personal por fecha
  (`endless.daily`, `heat = 39`).
- **Prestigio (1.10.0)**: NG+ da +5 % de daño global por ciclo (tope +100 % en
  20). No se re-midieron las tablas de campaña: el bonus es posterior al S50 y
  el balance base de 1.9.0 no cambia.
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
- Drones (1.8.0): el Campo de Fuerza baja otro 15 % de radio → base **102** y
  tope **161,5** (el máximo real pasa de 184 a 161,5 px). Los `radiusAdd` de
  perks/cartas no cambian.
- Cráter del Mortar (1.5.2): el fix de parámetros recupera el DoT/slow de zona
  que antes no se instanciaba. El S50 sube a 92 % HP / 99 % bajas, dentro del
  margen; no hizo falta tocar `craterDps`.
- Cráter del Mortar (1.8.0): el splash sigue en 150 px y el cráter persistente
  baja al **80 % (120 px)**. El daño del cráter no cambia, solo su cobertura.
- Renombre (1.5.3): Avispas → Mosquitos es sólo texto/flavor; no cambia
  stats, cartas ni balance.
- Limpieza de cartas (1.5.4): se quitaron `xp_boost` y `score_gain`; el
  Escudo de Base conserva la defensa. El S50 queda en 93 % HP / 99 % bajas:
  el pool más corto compensa la pérdida de la carta de XP.
- Skins de torres (1.6.0): cambio 100 % visual (paleta, motivos, pad y FX).
  No toca daño, cadencia, hitbox ni balance; la simulación no se re-mide.
- Meta v2 (1.7.0): pool compartido de 300/600, desbloqueos con oro y
  `DPS_SCALE = 0,75` (Tesla exenta). Detalle y aritmética en §"Meta v2 —
  pool compartido".
- **Ronda 1.9.0**: fragmentos 150/300, daño meta +9 %/nivel, remate aditivo con
  tope 15 % (30 % con Cabeza Nuclear), jefes inmunes al remate y +30 % de daño
  bajo el umbral para el atacante con execute. La economía pasa a ser de
  **farmeo**: el S50 no se alcanza en una pasada. Detalle en §"El bucle de
  farmeo".
- **Ronda 1.12.0**: desafío diario a **Heat 39** (sin Censura ni Arsenal) con
  **bono de recompensa ×1,5** (total ×6,18) y Black Hole que aparece en el
  centroide del racimo más denso. La estética del BH suma halo, anillo
  pulsante, brazos espirales y chispas; sin cambios de DPS/duración/radio.
- **Ronda 1.11.0**: nivel 1–6 para las 11 unidades (+5 % daño/−2 % recarga),
  maestría 0–15, 23 doctrinas y 33 legendarias (3 por unidad). El Guardian
  conserva sus 3 balas vía `bullets_5` (`burstBonus`), no vía nivel. El S50
  farmeado queda en 70/37/67 (Nvl.75) y 90/54/82 (Nvl.87); la cota superior
  con todas las legendarias es 80/40/72 y 100/56/88.
- **Ronda 1.10.0**: Nueva Partida+ (+5 % global/ciclo, tope +100 %), Reset
  Global, modal de victoria scrolleable y daily sobre cualquier etapa
  desbloqueada con Heat 49 forzado. Sin cambios a la curva de la campaña.
- Ajuste de arsenal (1.7.1): Guardian **15,0 DPS** (5/0.25), Missile **20,0
  efectivo** (170/3.2, splash 64) y Tesla **10,0** (7/0.7). Medido con
  `--meta=pool-focus` (Nvl.44 en S50, 10 semillas): S50 sin heat **70 % win /
  45 % HP / 66 % bajas**; Protocolo II **80 % / 24 % / 71 %**.
- Ronda 1.8.0: HP base ×1,25 (17 tipos), burbuja del Campo de Fuerza −15 %,
  cráter del Mortar −20 % y cartas de mejora **one-shot** (CAPS=1; `bullets_5`
  queda como level-up). El piso (meta 1) sigue en 0 % / 0 % / 0 %.
  **Hallazgo**: el presupuesto de olas está en HP base, así que subir el HP por
  enemigo sin tocar el presupuesto reduce la cantidad y deja el HP total casi
  igual. El neto medido es más fácil con `pool-focus` y mucho más difícil con
  `pool-spread`/Protocolo II. No se compensó en esta ronda.
- El balance sigue siendo un trabajo abierto: el simulador es una herramienta
  de comparación, no un oráculo.
