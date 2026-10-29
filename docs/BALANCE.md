# Balance — Open Defense Fortress

Este documento resume las decisiones de balance vigentes y cómo medirlas. Los
números salen de un **simulador headless** y de la **sonda del director de
olas**; ninguno da pass/fail. Son un **piso, no un techo**: sirven para comparar
tendencias, no para prometer win rates exactos.

## Herramientas

```bash
# Campaña, 5 semillas por etapa
node scripts/balance-sim.mjs --mode=inteligente --meta=trajectory --seeds=5

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
`--meta=trajectory` deriva el nivel meta real de la campaña; `--metalv=N` lo
fuerza. `--killrate=X` asume que el jugador mata como máximo el X % de la ola.

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
  Láser. **3 drones**: Rueda de Fuego, Avispas y Campo de Fuerza.
- **Guardian (fase 73)**: balas paralelas separadas 10 px (antes 13) y
  colisión barrida (CCD): una bala a 920 px/s ya no se salta a una espora
  entre frames a 30 fps o 2×. El multi-blanco de Lv.4 se mantiene.
- **Thunderstroke (fase 73)**: alcance global; un rayo principal de 65 al más
  lejano + estallido de mini rayos (50 % a hasta 3 vecinos en 130 px). Los
  perks `extraCount`/`chainFork` suman mini rayos, no rayos principales. DPS
  nominal ≈40,6 a un blanco y ≈102 contra un principal + 3 vecinos. Se
  diferencia de la Tesla, que encadena saltos con falloff.
- **86 cartas** con topes por carta y por run; las mejoras ofrecidas se
  relacionan con las unidades, tags y técnicas presentes. Incluyen daño global
  (+10% ×2), daño por tipo (+20% ×2), mecánicas por torre y 11 combos con
  prerrequisitos (frío, lifesteal, marcas, stun, rebote y perforación).
- **Meta**: 100 niveles; fragmentos por victoria (60, ×2 la primera vez),
  `fragCost(nivel) = 75 + 35·década`; el daño meta por nivel es +18 % (no +5 %).
  La trayectoria real llega a meta ~44 en S50.
- **Perks**: remate, robo de vida con tope del **10 %** del daño efectivo y
  explosión al matar. Los valores por perk son 1–6 %.

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
- **Hitos únicos** 5/10/20/35: 60/120/240/420 fragmentos **por torreta**.
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

## Estado actual (v1.5.1)

- Campaña: 50 etapas, win 100 % con la trayectoria real de meta y cartas.
- S50 sin heat: 100 % / 91 % de HP / 99 % de bajas (20 semillas).
- Heat: la escalera 5→35 cae de 90 % a 30 % en S50.
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
- El balance sigue siendo un trabajo abierto: el simulador es una herramienta
  de comparación, no un oráculo.
