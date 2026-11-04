# Changelog

Todas las versiones notables de este proyecto se documentan acá. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado
[SemVer](https://semver.org/lang/es/).

## [1.14.0] — 2026-11-04

### Variedad de entrada del director de olas

- Nuevos módulos **`waves-formation.js`** (formaciones, franjas y posiciones
  puras) y **`waves-rng.js`** (mulberry32, `hashSeed` y ruido determinista).
- Cada grupo recibe una formación (espejo, sesgo, dispersión, jitter y
  micro-escalonado) derivada de `(etapa, semilla)`. La campaña conserva la
  familia del patrón y la franja del arquetipo.
- `campaignWavesForRun()` viste la tabla que juega la run; `campaignWaves()`
  queda como referencia canónica. Las tablas manuales 1..5 se clonan sin
  mutar `STAGE_WAVES`; el vestido no altera la franja de los grupos
  generados (el crystal conserva la suya).
- La entrada del jefe usa un estado de run compartido entre stages: no repite
  zona ni dirección de barrido entre jefes consecutivos y sigue siendo
  determinista por semilla.
- El spawn diferido reutiliza la formación del grupo y las posiciones son
  independientes del orden de liberación.
- `probe-waves --run` ahora diferencia la tabla de run también en 6..50.

### Tests / versión

- **1115 tests, 0 skip** (37 archivos).
- Versión **1.14.0** / Android `versionCode 31`.

## [1.13.2] — 2026-11-04

### HUD móvil y contraste

- **Score compacto**: deja de ocupar el ancho de la pantalla y pasa a ser un
  chip de 28 px, alineado a la derecha debajo del reloj. Se oculta el rótulo
  `SCORE` en móvil; quedan el número y el multiplicador.
- **Chips unificados**: Stage/Lv/reloj comparten altura (32 px) y una misma
  placa neutra; Enemigos/DPS/score comparten altura (28 px) y estilo. Se
  quitaron las franjas de color laterales y se redujeron los acentos a la
  barra de XP, el icono del reloj y el multiplicador.
- **DPS centrado** entre Enemigos (izquierda) y score (derecha).
- **MEJORAR / DESBLOQUEAR**: recuperan el relleno teal/dorado con texto
  oscuro; el pase de forja les había dejado fondo oscuro y texto oscuro.
  Los estados deshabilitados también ganan contraste.
- El HUD superior móvil baja de 146 a 131 px, dejando más campo visible.

### Tests / versión

- **1103 tests, 0 skip** (36 archivos).
- Versión **1.13.2** / Android `versionCode 30`.

## [1.13.1] — 2026-11-04

### Balance de cartas

- Se fusionan **Núcleos Perforantes** y **Balas Hipersónicas** en
  **Munición Hiperveloz Perforante** (poco común, peso 7).
- La carta suma **+1 enemigo atravesado** y **+25% de velocidad de vuelo**
  del proyectil del Guardian. **No toca la cadencia de disparo**: no hay
  `cadMul` ni cambio de `cooldown` por la carta.
- `rapid_bullets` sale del catálogo y de `CAPS`; el combo **Perforación
  Compartida** sigue dependiendo de `pierce_up`.
- El catálogo queda en **108 cartas normales (80 + 28 doctrinas)**.
- La velocidad de bala del Guardian queda con un solo stack (×1.25).

### Tests / versión

- **1103 tests, 0 skip** (36 archivos).
- Versión **1.13.1** / Android `versionCode 29`.

## [1.13.0] — 2026-11-03

### Legibilidad global

- Nueva escala tipográfica con **piso absoluto de 15 px**: micro-etiquetas
  15, secundario 16, cuerpo 18, títulos 21/26 y cifras 36. Se eliminaron
  **76 declaraciones crudas de 8–11 px** que saltaban la escala.
- Se prioriza la legibilidad sobre la densidad: cuando una pantalla no
  entra, **scrollea o reflowa**; no se achica la letra.
- **Menú y pausa**: temas en grilla (3+2 en móvil), ajustes y tiles más
  grandes; la pausa usa scroll y la matriz de daño pasa a **fichas
  verticales** a 360 px, sin scroll horizontal.
- **Selector**: modos a todo el ancho, títulos de modo en tipografía de
  cuerpo y lista con scroll propio; el panel entra en pantalla.
- **Protocolo, Récords y Créditos**: presets y metadatos grandes, filas
  apiladas y un solo scroll vertical; créditos con datos en columna.
- **Torretas/Bestiario/Progreso**: cards a una columna en móvil, banner
  con ayuda al costado, progreso en filas apiladas y nav de 48 px.
- **HUD**: botones de 48 px, score con etiqueta visible a 36 px, stats y
  timer a 15–18 px. Los controles redondos se conservan.
- **Cartas, perks, combo y avisos**: textos secundarios a 15–16 px; el
  combo muestra nombre y stats en dos líneas y entra completo.
- **STAGE CLEAR / GAME OVER**: resúmenes y acciones a 15–18 px, con
  scroll vertical cuando hace falta.
- **Objetivos táctiles**: botones y filas principales de 44–48 px.
- `ci-checks` ahora falla si aparece un `font-size` crudo menor a 15 px
  o si `--text-xs` baja del piso.

### Tests / versión

- **1102 tests, 0 skip** (36 archivos).
- Versión **1.13.0** / Android `versionCode 28`.

## [1.12.7] — 2026-11-03

### Legibilidad del modal de subida de nivel

- Las cartas de mejora crecen a todo el ancho útil en móvil (hasta 190 px
  por carta en escritorio) y las descripciones pasan a 14–15 px con más
  interlineado y contraste. Los títulos también suben de tamaño.
- El nombre de la carta, la rareza, la sinergia y el pie del modal ganan
  aire y jerarquía; la sinergia se separa con una regla fina.
- En móviles bajos (360×640) se compacta solo el espacio vertical: las
  tres cartas entran sin scroll interno y conservan la tipografía grande.
- En táctil el velo del modal es opaco, para que el texto no compita con
  el HUD del combate de fondo.

### Tests / versión

- **1102 tests, 0 skip** (36 archivos).
- Versión **1.12.7** / Android `versionCode 27`.

## [1.12.6] — 2026-11-03

### HUD: modernización de toda la interfaz restante

- **Sistema visual de forja** extendido a selector de stages, Protocolo,
  Récords, Créditos, Torretas/Bestiario/Progreso, cartas, perks, combo,
  STAGE CLEAR, GAME OVER, HUD de combate, avisos y pantalla de carga.
- Placas con esquina cortada, acentos por sección y botones/acciones
  coherentes con el menú y la pausa de 1.12.4. Se mantienen los botones
  redondos de pausa/velocidad/música/ultimate.
- **Selector**: cabecera con kicker, filas de stage tipo mission strip,
  candados SVG (se retiró el emoji `🔒`) y estados bloqueado/disponible
  más legibles.
- **Protocolo**: lectura de HEAT en dos columnas y texto corregido (∞ y
  supervivencia sí aplican el Protocolo; el diario fuerza Heat 39).
- **Torretas**: cards angulares, grilla de 2 columnas en móvil, candados
  SVG y dock inferior rediseñado.
- **Cartas/perks/combo**: fichas compactas con acento por rareza, sin
  glass ni glow excesivo; overlay opaco en táctil.
- **STAGE CLEAR / GAME OVER**: resúmenes en secciones y acciones con
  jerarquía nueva (CTA principal + secundarias).
- **HUD de combate**: paneles de stage/nivel/timer y score angulares;
  controles redondos conservados.

### Rotación de blobs

- **Blob mediano (`miniBlob`)**: entra en `SPIN_TYPES` y rota en runtime
  con 1 pose de atlas. Antes se horneaba en 8 fases y saltaba cada 0,67 s.
- **Blob tanque (`blob`)**: parches, círculos internos y ojos se dibujan
  vivos fuera del atlas (como las placas de la geoda); el pulso,
  protuberancias y tentáculos siguen en el sprite.

### Tests / versión

- **1102 tests, 0 skip** (36 archivos).
- Versión **1.12.6** / Android `versionCode 26`.

## [1.12.5] — 2026-11-03

### Performance

- **Fondo estático sin planeta**: cielo, horizonte, luna, nebulosa,
  decoración, halo de spawn y tinte se hornean una vez; se elimina
  `_planetCache`.
- **Atlas runtime de enemigos** (`enemy-sprites.js`): cuerpo en 8 fases,
  dibujado con `drawImage`; HP, estelas, variantes, veneno y flashes
  siguen vivos. Rotaciones continuas fuera del atlas para meteorito,
  fragmento, espora, boulder, crystal y geoda.
- Calidad **Auto** según dispositivo, blur DOM apagado en touch, render
  throttle fuera de `PLAYING`, pool de partículas, niebla estática, shake
  solo del mundo y barras del HUD con `transform: scaleX()`.
- HUD: libera el DOM al entrar a jugar y pinta el bestiario al abrirlo.
- **1099 tests** en su momento (sin bump de versión).

## [1.12.4] — 2026-11-02

### HUD: menú y pausa

- **Menú principal rediseñado** como una consola de forja: CTA `JUGAR` en
  placa ámbar con subtexto de campaña, acciones secundarias en grilla de
  tiles (STAGES, TORRETAS, PROTOCOLO, RÉCORDS, CRÉDITOS, NG+) y ajustes
  agrupados bajo `SISTEMA`.
- **Nueva Partida+ bloqueada** se muestra como hito con candado, no como un
  botón gris partido. Al completar la campaña pasa a tile dorado con el
  próximo ciclo y su bonus.
- **Pausa rediseñada**: panel compacto con `CONTINUAR` como CTA, salidas
  agrupadas bajo `SALIR DE LA RUN` (con la confirmación de siempre), matriz
  de daño más legible, selector de tema al pie y atajos como chips `kbd`.
- **Foco del título**: el encabezado sigue recibiendo foco programático para
  accesibilidad, pero ya no dibuja el recuadro de "título seleccionado".
- Microinteracciones con `prefers-reduced-motion` y sin sombras/sweep en
  calidad Baja. Sin cambios de lógica de juego ni de acciones.

### Tests / versión

- **1095 tests, 0 skip** (36 archivos).
- Versión **1.12.4** / Android `versionCode 24`.

## [1.12.3] — 2026-11-02

### Desafío diario: un intento por día

- El desafío diario se **consume al arrancar**, no al terminar: si el
  jugador abandona o pierde, no puede repetirlo hasta el día siguiente.
- La tarjeta del selector queda **deshabilitada** y muestra `JUGADO HOY ·
  volvé mañana`, conservando el resultado del intento.
- El intento se guarda en el progreso existente (`endless.daily.stage`), sin
  cambiar el esquema de saves. Al cambiar la fecha se habilita de nuevo.
- `startDaily()` también bloquea el segundo intento aunque se dispare la
  acción directamente.

### Tests / versión

- **1092 tests, 0 skip** (36 archivos).
- Versión **1.12.3** / Android `versionCode 23`.

## [1.12.2] — 2026-11-02

### Cartas retiradas

- **Núcleos Perforantes II** (`tech_pierce`): el Guardian conserva
  **Núcleos Perforantes** (`pierce_up`), que sigue dando +1 atravesamiento.
- **Sensores Ampliados** (`detect_up`): se retira la carta y el multiplicador
  `detectMul`, que solo usaba ella.
- **Carga Orbital** (`ult_charge`): se retira la recarga instantánea del
  ORBITAL STRIKE. El ultimate sigue cargando por kills.

### Compensación

- **Tesla**: la banda de cobertura sube de **330 a 462 px** (`reachY`,
  330 × 1,4) para conservar el alcance máximo que daba Sensores Ampliados.
  Sigue sin tope horizontal. No cambian daño, cadencia, saltos ni falloff.
- **Perforación Compartida** ahora requiere **Núcleos Perforantes** (la carta
  base) en vez de Núcleos Perforantes II, así el combo sigue disponible.

### Catálogo / tests / versión

- Catálogo normal: **109 cartas (81 + 28 doctrinas)**; 33 legendarias aparte.
- **1091 tests, 0 skip** (36 archivos).
- Versión **1.12.2** / Android `versionCode 22`.

## [1.12.1] — 2026-11-02

### Cazas y maestría

- **Las cartas de caza (`hunt_*`) ya no dan maestría**. Nunca daban nivel; el
  bug era que `cardMasteryTargets()` las trataba como una mejora de todas las
  unidades y permitía saltarse el camino normal a las legendarias. El
  multiplicador de familia se sigue aplicando a todo el arsenal.
- **5 doctrinas nuevas** de 2 rangos para las unidades que se quedaban sin
  tercer hito: Missile (Bloqueo de Impacto), Láser (Pulso Sostenido), Rueda
  de Fuego (Brasas), Mosquitos (Colmena) y Campo de Fuerza (Cúpula). El
  catálogo normal pasa a **112 cartas (84 + 28 doctrinas)**; las legendarias
  siguen siendo 33.
- La maestría máxima se mantiene en 15 con las cartas normales y **2
  legendarias**; no se tocaron los umbrales 5/10/15 ni la fórmula de maestría.

### Rueda de Fuego

- **Combustión Espontánea** reemplaza a **Órbita Solar**. Si no hay enemigos a
  menos de **150 px**, cada **0,9 s** tira **40 %** de apagarse **0,22 s** y
  reencenderse sobre el enemigo más avanzado a **230 px** o más, con **4 s**
  de recarga. Mientras está apagada no se mueve, no quema y se dibuja como
  una brasa humeante; al reencender entra directo al barrido.
- Si el objetivo muere durante el apagado, elige otro lejano o se reenciende
  en el lugar. Sin cambios de DPS, radio ni duración de la rueda.

### Tests / versión

- **1094 tests, 0 skip** (36 archivos).
- Versión **1.12.1** / Android `versionCode 21`.

## [1.12.0] — 2026-11-02

### Desafío diario

- **Heat 39 en vez de 49**: se sacan **Censura** y **Arsenal** del protocolo
  forzado. El daily mantiene las 9 condiciones restantes al máximo, pero
  vuelve a ofrecer **3 cartas** y **5 slots**, que es lo que más castigaba a
  las cuentas con pocas unidades. El Protocolo personal sigue llegando a 49.
- **Bono de recompensa ×1,5**: la victoria diaria multiplica fragmentos y oro
  por `heatRewardMul(39) × 1,5 = 6,18×` (antes 4,92× a Heat 49). Los hitos
  únicos de Heat no se multiplican. La tarjeta del selector y el resumen
  muestran `HEAT 39 · SIN CENSURA NI ARSENAL · BONO ×1,5`.

### Black Hole

- **Aparece en el racimo más denso**: `blackHolePoint()` evalúa a los enemigos
  vivos, elige el grupo con más unidades dentro del radio real (incluyendo
  `radiusMul`) y coloca el vórtice en su centroide, con clamp al campo. Sin
  enemigos cae al centro. El mini BH de Singularidad sigue naciendo en la
  explosión.
- **Estética**: halo con gradiente, horizonte pulsante, brazos espirales,
  arcos de lente, onda de aparición y chispas que caen al centro. En calidad
  Baja se reducen anillos, sombras y partículas. No cambian DPS, duración,
  radio ni pull.
- `spawnParticles` acepta `towardX/towardY` para partículas dirigidas.

### Tests / versión

- **1088 tests, 0 skip** (36 archivos).
- Versión **1.12.0** / Android `versionCode 20`.

## [1.11.0] — 2026-11-02

### Nuevo

- **Nivel 1–6 para las 11 unidades** (8 torres + 3 drones): las cartas
  dedicadas (exclusivas, técnicas, doctrinas, `bullets_5`, `swarm_grow`,
  `detect_up`, `pierce_up`, `rapid_bullets`) suben un nivel. La curva se
  suaviza a **+5 % daño / −2 % recarga** por nivel; los drones escalan +5 %
  de su efecto principal. El Guardian ya no recibe balas por nivel: las
  **balas 2.ª y 3.ª** siguen siendo de `bullets_5` vía `burstBonus`.
- **Maestría 0–15**: cualquier carta que mejore a la unidad (dedicada, tipo,
  global, cadencia, caza o combo) suma +1. Cada **5 puntos** abre una
  **elección legendaria**: 3 cartas propias a los 5, las 2 restantes a los
  10 y la última a los 15. La elección aparece después de la carta que
  disparó el hito, **no consume un nivel pendiente** y **Censura no la
  recorta**.
- **23 cartas Doctrina** (CAPS=2): dos rangos por unidad, con efectos de
  nivel/maestría para que todas las torres y drones puedan alcanzar Lv.6.
- **33 cartas legendarias** (3 por unidad), fuera del catálogo normal. Se
  eligen en el draft y quedan fuera del pool de esa unidad para el resto de
  la run.
- **HUD**: la fila del modal de cartas muestra nivel y maestría de torres y
  drones; el draft legendario tiene título propio, kicker de unidad/umbral y
  badge dorado. El pad de las torres dibuja 6 ticks.

### Balance

- Medición S50 (10 semillas, `--mode=inteligente`): Nvl.75 **70 % win / 37 %
  HP / 67 % bajas**; Nvl.87 **90 % / 54 % / 82 %**. La cota superior con
  `--legendaries` (todas las elecciones) es 80/40/72 y 100/56/88.
- `balance-sim --legendaries` simula el techo de la pista de maestría; no es
  una build enfocada.

### Tests / versión

- **1087 tests, 0 skip** (36 archivos).
- Versión **1.11.0** / Android `versionCode 19`.

## [1.10.0] — 2026-11-02

### Nuevo

- **Nueva Partida+**: se habilita al limpiar el S50. Conserva las unidades
  compradas y suma **+5 % de daño global por ciclo**, acumulativo hasta
  **+100 % (20 ciclos)**; resetea campaña, récords, rango, perks, niveles,
  fragmentos y oro, y arranca directo en el Stage 1. El menú muestra el ciclo
  actual y el próximo bonus.
- **Reset Global**: disponible siempre en el menú, con confirmación inline.
  Borra progreso, récords, meta, unidades compradas y el ciclo NG+; el oro
  vuelve al inicial y no toca tema, calidad ni audio.
- **Desafío diario universal**: elige una etapa del pool ya desbloqueado
  (campaña o ∞) por fecha local y la congela en `endless.daily.stage` al primer
  intento. Aplica **todas las condiciones del Protocolo al máximo (Heat 49)**,
  sin importar el Protocolo activo, y guarda un **récord personal**. Ya no exige
  la campaña completa: aparece desde el S1.
- **STAGE CLEAR rediseñado**: cabecera fija, cuerpo scrolleable por secciones
  (resultado, rendimiento, recompensas) y acciones fijas. En móvil respeta
  `safe-area`, no recorta botones y usa el scroll global del overlay.

### Persistencia / compatibilidad

- `meta.ngPlus` (0..20) y `progress.endless.daily.stage` se normalizan de forma
  tolerante: los saves viejos cargan con NG+ 0 y etapa 0, sin errores.
- El menú calcula “campaña completa” desde `bestScore[50]`; NG+ solo se ofrece
  después de limpiar el S50.
- `PERK_SCHEMA_VERSION` sigue en 3: NG+ resetea los perks explícitamente.

### Tests / versión

- **1066 tests, 0 skip** (35 archivos).
- Versión **1.10.0** / Android `versionCode 18`.

## [1.9.0] — 2026-11-02

### Balance

- **Fragmentos a la mitad**: 150 por victoria y 300 la primera limpieza de cada
  etapa (antes 300/600). Repetir una etapa ya limpiada sigue pagando 150: la
  economía pasa a ser de **farmeo**. La supervivencia y los hitos de Protocolo
  no cambian.
- **Daño meta a la mitad**: +9 % por nivel (antes +18 %). La trayectoria de una
  limpieza por etapa cae de Nvl.44 a Nvl.28 en el S50; el jugador debe repetir
  etapas para progresar.
- **Remate del Misil**: tres perks de **+3 %** (tiers 1, 3 y 5) que se suman al
  6 % intrínseco; tope **15 %**. Cabeza Nuclear multiplica el umbral por 2:
  **30 %** con el tope. Los tiers 7 B y 9 A se reconvirtieron en Ojiva pesada
  III (+20 % daño) y Recarga rápida III (−10 % enfriamiento).
- **Jefes inmunes al remate**: `executeImmune: true` en los 5 jefes (y flag
  disponible para futuros enemigos). Bajo el umbral, el atacante que tiene
  remate les hace **×1,30 de daño** en vez de ejecutarlos. Golpe de Gracia
  respeta el tope 15/30.
- **Migración**: `PERK_SCHEMA_VERSION` sube a 3. Los saves conservan niveles,
  fragmentos, oro y desbloqueos; se resetean las elecciones de perks.

### Medición (10 semillas, `--mode=inteligente`)

- S50 con la campaña de una pasada (`pool-focus`, Nvl.28): **0 % win / 0 % HP /
  0 % bajas**. Es el piso sin farmeo.
- S50 farmeado Nvl.75: **70 % / 42 % / 66 %**; Nvl.87: **90 % / 61 % / 82 %**.
  Llegar a Nvl.87 con las 5 unidades del foco requiere ~500 repeticiones extra
  de 150 fragmentos; Nvl.75, ~365.
- Campaña de una pasada: S1 100 %, S2 80 %, S3 20 %, S4 70 %, S5 90 %, S6 60 %,
  S10 10 %, S20 20 %, S30 10 %, S50 0 %. El diseño 1.9.0 asume farmeo; no se
  compensó el director.

### Tests / versión

- **1050 tests, 0 skip** (35 archivos).
- Versión **1.9.0** / Android `versionCode 17`.

## [1.8.0] — 2026-11-02

### Balance

- **HP enemigo ×1,25**: los 17 tipos de `ENEMY_TYPES` suben su HP base
  (Meteorito 30→38, Roca maciza 190→238, Blob tanque 220→275, Geoda 240→300,
  jefes 2600→3250 … 5600→7000). El presupuesto de las olas **no** se compensó.
  Como el director presupuesta en HP base, el mismo presupuesto compra ~20 %
  menos enemigos y el HP total de la descarga queda casi igual (ver
  `docs/BALANCE.md`).
- **Campo de Fuerza −15 % de burbuja**: radio base 120→**102**, tope duro
  190→**161,5**. Los `radiusAdd` de perks/cartas se conservan.
- **Cráter del Mortar −20 %**: el splash sigue en 150 px y el cráter
  persistente pasa a **120 px** (`craterMul: 0.8`); el daño del cráter no cambia.
- **Cartas de mejora one-shot**: las 45 cartas con `CAPS > 1` pasan a **1**.
  `bullets_5` queda fuera: sigue siendo el level-up del Guardian (Lv.1→Lv.5).
  `fillOffer` ya no reofrece cartas topadas, `applyCard` devuelve `null` en una
  carta topada y `Game.pickCard` no cuenta ni festeja ese no-op (reintenta una
  oferta y, si no hay elegibles, cierra la elección sin consumir el nivel).
  Los contadores de `combo_blood_pact` y `bh_horizon` quedan separados.

### Bestiario

- `desc` y `counter` para los 10 tipos que no tenían (meteorito, fragmento,
  cristal, espora, los 5 jefes y el blob mediano).
- Correcciones: `rockSwarm` (balístico/cadencia, no área), `boulder` (el área
  solo barre las crías), `sporePod` (el tope de 6 es de crías vivas) y
  `crystalSwarm` (el balístico pega ×0,5, no “rebota”).
- Los jefes muestran su nombre de campaña (`Meteorito Colosal`, `Blob Rey`,
  `Blob Necrótico`, `Coloso Blindado`, `Abominación Híbrida`) y el aviso de
  fase declara el multiplicador **neto** (familia × fase), no el ×1,5/×0,5
  aislado que mentía.

### Medición (10 semillas, `--mode=inteligente`)

- S50 `pool-focus`: **90 % win / 59 % HP / 81 % bajas** (1.7.1: 70/45/66).
- S50 `pool-spread`: **10 % / 7 % / 18 %** (1.7.1: 50/24/49).
- S50 Protocolo II: **40 % / 17 % / 42 %** (1.7.1: 80/24/71).
- Campaña `pool-focus`: S1–S10 90–100 %, S20 60 %, S30 50 %, S50 90 %.
  La campaña queda no monótona; el hallazgo y la explicación están en
  `docs/BALANCE.md`. No se compensó en esta ronda.

### Tests / versión

- Guardas de campaña: la apertura manual sube su `SLACK` de 3 a 4 y la
  proporción de convoys con tanque baja de 60 % a 50 %; ambas miden el efecto
  del HP ×1,25 y quedan documentadas para la próxima recalibración del
  director. El smoke de integración de S1 usa dos torres extra (antes una).
- **1041 tests, 0 skip** (35 archivos).
- Versión **1.8.0** / Android `versionCode 16`.

## [1.7.2] — 2026-10-30

### Corregido

- **Heat en el modo infinito post-campaña**: `startStage` ya no fuerza
  `heatProtocol = {}` para `isEndless`. El `runMods` del ∞ incluye el
  Protocolo activo, así que **Apagón** bloquea de verdad el Ultimate y el
  Black Hole (`noUlt`), y también aplican Vigor, Prisa, Leva, Censura,
  Arsenal, etc.
- **Daily con Protocolo**: el desafío diario ya no fuerza heat 0; usa el
  Protocolo activo. Su récord de score sigue siendo **global por fecha**, pero
  ahora guarda el **Heat con el que se logró** (`endless.daily.heat`). Un score
  peor no pisa ni el récord ni su Heat.
- **HUD**: la tarjeta del ∞ muestra `Heat N · récord H`; la del Daily muestra
  el Heat del récord; la tarjeta del Protocolo pasa a “TODOS LOS MODOS”.
- Migración: saves viejos sin `endless.daily.heat` arrancan en Heat 0.

### Tests / versión

- **1026 tests, 0 skip** (35 archivos).
- Versión **1.7.2** / Android `versionCode 15`.

## [1.7.1] — 2026-10-30

### Cambiado

- **Guardian**: la torre básica deja de ser la más fuerte. `damage 8 → 5` y
  `cooldown 0.23 → 0.25`; con el dial ×0,75 queda en **15,0 DPS** (antes 26,1).
- **Missile**: nuke lento. `damage 35 → 170` y `cooldown 1.2 → 3.2`; el splash
  del 50 % redondea a 64 → **20,0 DPS efectivos** (antes 10,9). Se sumaron los
  2 s de cooldown pedidos.
- **Tesla**: `damage 5 → 7` manteniendo `cooldown 0.7` → **10,0 DPS** (antes
  7,1). Sigue exenta del dial y conserva sus 5 saltos.
- El HUD de DPS del Missile ahora usa el splash real (`Math.round(damage × 0,5)`)
  y muestra 20,0 en vez de 39,8.
- Tests de apertura actualizados al meta real (+18 %/nivel, no +5 %) y al nivel
  que el jugador alcanza dentro de la apertura.

### Balance (10 semillas, `--meta=pool-focus`)

- S50 sin heat: **70 % win / 45 % HP / 66 % bajas** (antes 100 / 72 / 91).
- Protocolo II S50: **80 % win / 24 % HP / 71 % bajas**.
- No se compensó el HP de las oleadas: la caída de HP es el efecto buscado.

### Tests / versión

- **1022 tests, 0 skip** (35 archivos).
- Versión **1.7.1** / Android `versionCode 14`.

## [1.7.0] — 2026-10-30

### Agregado

- **Desbloqueo de unidades con oro** (`META_UNLOCK_COSTS`, `unlockTower`,
  `isUnitUnlocked`): una cuenta nueva arranca solo con **Guardian** y las otras
  10 unidades (7 torres y 3 drones) se compran con oro (150–500). Una unidad
  bloqueada no entra en la oferta de cartas, no se mejora y su `metaDmgMul` es
  1. Spec: `openspec/specs/meta-game/tower-unlocks/spec.md`.
- **Pool de fragmentos compartido** (`fragsPool`): cada victoria suma 300 y la
  primera limpieza de cada etapa 600, en lugar de 60 por torreta. Un save v1
  suma sus saldos por torreta al pool (no se pierde nada).
- `scripts/balance-sim.mjs`: `--meta=pool-focus|pool-spread` y
  `trajectoryMetaLevels(stage, focus)`; `setMetaLevel(s)` escribe `fragsPool` y
  `unlocked` (todas las unidades) en vez del mapa `frags` por torreta.

### Cambiado

- **DPS nominal −25 %** (`DPS_SCALE = 0,75` en `towers-data.js`; la **Tesla
  queda exenta**) en torres, drones y su daño en el tiempo. El HP de las olas
  **no** se compensa: es el dial con el que se mide cuánto poder hacía falta.
- `balance-sim`: `--meta=trajectory` pasa a ser alias de `pool-focus`. El pool
  se reparte en cuotas de 5 (600 / 5 = 120 por unidad y etapa, la misma curva
  histórica) y la cuota se aplica a las unidades que entran en la run. S50:
  **Nvl.44** con las 5 unidades que juega el jugador y **Nvl.26** con las 11
  (`pool-spread`).
- Medición (10 semillas, `--mode=inteligente`): S50 sin heat 100 % win / 72 %
  HP / 91 % bajas (antes 93 % / 99 %); Protocolo II 80 % / 41 % / 75 % (antes
  70 % / 48 % / 61 %). El piso (meta 1) ya no gana el S50. Detalle en
  `docs/BALANCE.md` §"Meta v2 — pool compartido".
- **La URL pública pasa al dominio propio**: el juego se publica en
  <https://opendefensefortress.javierlust.net.ar/> (dominio verificado en
  here.now, con su propio certificado). `<faint-desert-zjv5>.here.now` sigue
  sirviendo el mismo build como alias. Se actualizaron la documentación, el
  `homepage` de `package.json`, el workflow de deploy y la plantilla de issues.
- `deploy-herenow.sh`: los chequeos post-deploy usan `curl -L`, así el deploy no
  se marca en rojo si el dominio propio se configura como *primary* (el alias
  responde 308). Se sumó un chequeo blando del dominio propio, que avisa por
  stderr sin tumbar un publish que ya se completó.

### Tests / versión

- **1021 tests, 0 skip** (35 archivos), incluidos `test-tower-skins.mjs` y
  `test-dps-scale.mjs`.
- Versión **1.7.0** / Android `versionCode 13`.

## [1.6.0] — 2026-10-30

### Agregado

- **Sistema de skins de torres y drones** (`js/tower-skins.js`): 5 skins
  ligadas al tema de UI (`volcanico`, `cyberpunk`, `neon`, `aqua`, `cielo`).
  Cada skin cambia paleta, motivos de forma (antenas/circuitos, aros/tubos,
  aletas/burbujas, alas/nubes), pad y colores de FX de las 8 torres y los 3
  drones. No toca daño, cadencia, hitbox ni reglas.
- **Compilador de skins** en `tower-art.js` (`compileSkin`, `resolveRig`,
  `TOWER_ANCHORS`): `remove`/`patch`/`add` sobre el rig, cache por
  `kind|skinId`, rigs congelados y sin mutar `TOWER_RIGS`.
- **Tema de UI en el engine** (`uiTheme`, `skinId`, `setUiTheme`,
  `theme:changed`): independiente del tema de escenario; `skinId: 'auto'`
  sigue al tema y un id explícito queda listo para skins futuras.
- Colores de skin en proyectiles, misil, obús, cráter, Beam, Láser, Bolt y
  cadena; paleta y motivo de silueta en drones; iconos del meta con skin.
- Persistencia `gdf_tower_skin` (`loadSkin`/`saveSkin`), tolerante a storage
  bloqueado o corrupto. Sin selector visible todavía.
- `tools/tower-sheet.html`: selector de tema/skin, drones, comparativa de los
  5 temas, calidad baja y query params (`?theme=neon&skin=auto&q=low`).

### Cambiado

- El tema `volcanico` es la skin base (`base: true`): el render histórico
  queda exacto; las demás skins son 100 % vectoriales (0 assets nuevos).
- En calidad Baja se omiten textura y motivos decorativos; la silueta y el
  pad se conservan.
- `theme.js` ahora avisa al engine el tema de UI y la skin al aplicarse.

### Tests / versión

- **988 tests, 0 skip** (34 archivos), incluido `test-tower-skins.mjs`.
- Versión **1.6.0** / Android `versionCode 12`.
- Spec: `openspec/specs/gameplay/tower-skins/spec.md`.

## [1.5.4] — 2026-10-30

### Cambiado

- **Limpieza de cartas**: eliminadas `xp_boost` (Acelerador de Energía) y
  `score_gain` (Prima de Combate). El XP deja de tener una carta propia y el
  score queda sólo como display/récord.
- Eliminados `xpMul` y `scoreMul` del `Fortress`, `Game._onKill`,
  `EnergyOrb`, el resumen de combos y el HUD.
- **Escudo de Racha → Escudo de Base** (`base_shield`): misma mecánica de
  bloquear un golpe completo a la base, sin relación con la racha. Internos
  renombrados a `baseShields` / `baseShieldApps`.
- Catálogo **86 → 84 cartas** (74 → 72 repetibles).
- **974 tests, 0 skip**; sin cambios de stats.
- Versión 1.5.4 / Android `versionCode 11`.

## [1.5.3] — 2026-10-30

### Cambiado

- **Dron Avispas → Dron Mosquitos** en todos los textos visibles: pantalla
  de torretas, cartas, perks, combos, docs y specs.
- El id interno sigue siendo `wasps` (clave persistida del meta y de cartas)
  para no romper saves.
- Flavor de perks alineado con la identidad de sangre: `Néctar` →
  `Hematofagia` y `Aguijón potente` → `Picadura potente`.
- La carta de desbloqueo ahora describe la mecánica actual: 3 mosquitos que
  pican e inyectan veneno; la hematofagia drena vida al escudo.
- **974 tests, 0 skip**. Sin cambios de stats ni de balance.
- Versión 1.5.3 / Android `versionCode 10`.

## [1.5.2] — 2026-10-29

### Corregido

- **Cráter del Mortar**: `MortarShell` perdía `craterDps/time/radius/slow`
  porque `pickOnHit()` filtra los mods de impacto. Ahora el cráter viaja en
  un objeto `crater` propio y `_explode()` sí instancia `CraterFx`.
- Indicador visual nuevo: terreno chamuscado, anillo ámbar pulsante en el
  radio real, anillo interior punteado y brasas animadas.
- Tests del camino real `Tower.fire → MortarShell → CraterFx`, de daño/slow
  dentro del radio y del dibujo. **973 tests, 0 skip**.
- S50: 100 % win / 92 % HP / 99 % bajas (20 semillas).
- Versión 1.5.2 / Android `versionCode 9`.

## [1.5.1] — 2026-10-29

### Cambiado

- **Campo de Fuerza (nerf)**: burbuja base 140→120 y tope duro 190. Los perks
  de radio bajan de +14/+25 a +6/+10 y la técnica de +20 a +10; el máximo real
  pasa de 311 px (115 % del canvas) a 190 (70 %).
- `forcefieldBubbleR()` centraliza el radio efectivo: `update()` y `draw()`
  usan el mismo valor con el cap aplicado.
- **Rueda de Fuego**: sin enemigos patrulla el campo con waypoints cercanos en
  vez de volver a la base y orbitar; elimina el viaje de ida y vuelta entre
  oleadas.
- **970 tests, 0 skip**; S50 100 % win / 91 % HP / 99 % bajas (20 semillas).
- Versión 1.5.1 / Android `versionCode 8`.

## [1.5.0] — 2026-10-29

### Añadido

- **Identidad mecánica única por torre/dron**: `mech` en `towers-data.js` y
  registro/hooks en `tower-mechanics.js` (supresión, ejecución, fusión, juicio,
  ion, cráter, riel, corte, ignición, veneno y burbuja).
- Marcas nuevas (`judgment`, `ion`, `rail`, `cut`, `melt`, `bubble`, `charged`,
  `siege`) y DoT de quemadura separado del veneno.
- `CraterFx`: el Mortar deja una zona persistente que quema y frena.
- 11 combos de identidad: sobrecarga, bucle de prisma, sincronía de asedio,
  ignición compartida, concha de veneno, cadena de burbuja, tormenta de riel,
  fusión del riel, asedio lento, golpe de gracia y arco del Guardian.
- `PERK_SCHEMA_VERSION`: los saves viejos conservan nivel/oro y resetean las
  elecciones A/B que cambiaron de significado.
- `tests/test-tower-identity.mjs` y spec
  `openspec/specs/gameplay/tower-identity/spec.md` (**968 tests, 0 skip**).

### Cambiado

- Perks acotados: remate sólo Misil; robo de vida sólo Beam/Avispas;
  explosión al matar sólo Rueda de Fuego; stun sólo Thunderstroke; rebote sólo
  Guardian; crítico sólo Guardian/Gauss; slow sólo Beam.
- Técnicas: `Haz Gélido` y `Drenaje del Haz` pasan al Beam; `Cabeza
  Aturdidora` se reconvierte en `Guiado Táctico` (homing) del Misil.
- Catálogo 81→86 cartas (74 repetibles) y CAPS actualizados.
- `S50`: 100 % win / 92 % HP / 99 % bajas (20 semillas), sin cambios de
  balance global.
- Versión 1.5.0 / Android `versionCode 7`.

## [1.4.1] — 2026-10-29

### Añadido

- `js/economy.js`: economía de una baja compartida por `Game`, `balance-sim` y
  `probe-s6`, con carry de crías y `maxLevel` correctos.
- `tests/test-economy.mjs` y **952 tests, 0 skip**.
- Job `verify` en el deploy: publica solo si pasan suite y `ci-checks`.

### Cambiado

- `towers.js` 2.942→1.307: `towers-core`, `towers-targeting`,
  `towers-projectiles`, `towers-fx` y `towers-drones`.
- `enemies.js` 2.766→2.362: `enemies-status`, `enemies-combat` y
  `enemies-bestiary`.
- `waves.js` 2.671→2.197: `WaveManager` y entrada de jefes en
  `waves-manager.js`.
- Los tests de perks escanean todos los módulos de combate, no solo
  `towers.js`/`enemies.js`.
- Versión 1.4.1 / Android `versionCode 6`.

## [1.4.0] — 2026-10-29

### Añadido

- **947 tests, 0 skip** (antes 918 con 5 skip): `test-effects`, `test-storage`,
  `test-version`, `test-main` y helpers compartidos en `tests/helpers/`.
- Módulos puros nuevos: `geometry.js`, `combat-crit.js`, `base-heal.js`,
  `storage.js`, `card-constants.js`, `combo-mods.js` y `version.js`.
- Datos separados de la lógica: `cards-data.js`, `enemies-data.js`,
  `waves-data.js` y `towers-data.js`.

### Corregido

- El mortero y el misil ya no se consumen como balas directas: detonan con
  splash y conservan crítico/perks.
- El veneno letal corta `Enemy.update` (no mueve, no cuenta fuga, no dispara
  fases) y `poisonDps` se resetea al expirar.
- Slow por fuente: un slow fuerte y corto ya no contamina al débil y largo.
- `healBase()` único: robo de vida, Campo de Fuerza, Black Hole y Transfusión
  no reviven una base en 0.
- El XP de Supervivencia usa el stage de la oleada, no el stage 1 fijo.
- Forcefield: dwell finito y waypoint solo sin blanco.
- Black Hole arrastra el ancla de drift/zigzag (`entryX`).
- Back nativo limpia el campo antes de volver al menú.
- La calidad gráfica se aplica a todos los contexts/caches en caliente.
- Confirmaciones inline se desarman al cambiar de pantalla.
- Apagón filtra las cartas de ultimate/Black Hole; combos/BH respetan `CAPS`.
- HUD: foco/ARIA, barras `progressbar`, escape de datos, fallback del ∞ en 51.
- `ci-checks` normaliza separadores de Windows y excluye `.codegraph`.

### Cambiado

- `cards.js` 2.226→1.868, `enemies.js` 3.022→2.767, `waves.js`
  2.869→2.666 y `towers.js` 3.200→2.944 líneas (datos extraídos).
- `hud.js` 4.314→10 líneas (fachada): markup puro en `hud-builders.js`
  (2.144) y clase en `hud-core.js` (2.386).
- `main.js` 1.857→176 líneas (bootstrap): la clase `Game` vive en
  `game.js` (1.785) y se testea sin DOM.
- Menos trabajo por frame: snapshot del HUD solo si está visible, poda de
  enemigos in-place, Fortress no simula con `dt=0`, DPS cacheado 0,25 s,
  `_flushPending` por prefijo y `bh-count` cacheado.
- La niebla completa (bandas ambientales + capas densas) se cachea cada
  3 frames; las capas densas siguen el alto lógico en móvil.
- Audio: reanuda el contexto suspendido, tolera `resume()` sin Promise y
  re-sincroniza el scheduler tras una suspensión.
- Se eliminaron `lerp`, `spreadDegNow`, `orbitalStrikes`, `_speedDirty`,
  `this.progress`, `isCache`, `STAGES.unlockAfter/waveSet` y campos muertos
  del HUD.
- Versión 1.4.0 / Android `versionCode 5`.

## [1.3.0] — 2026-10-28

### Añadido

- **11 combos nuevos** (81 cartas en total):
  - Frío: Cero Absoluto, Fractura Criogénica, Onda Glacial.
  - Lifesteal: Cosecha Explosiva, Pacto de Sangre, Transfusión.
  - Tipo/mecánica: Marca de Riel, Enlace de Enjambre, Juicio Final,
    Rebote Conductor y Perforación Compartida.
- Slow con **duración real** (`slowTimer`/`slowFrac` + `applySlow`): Balas
  Gélidas deja de ser una carta casi inerte.
- Marcas temporales de enemigo (`rail`/`swarm`) para los combos de Gauss y
  drones.
- Prerrequisito `requiresCards`/`requiresAnyCards`: los combos pueden exigir
  una técnica ya elegida.
- Black Hole con drenaje (Pacto de Sangre) y regeneración por veneno
  (Transfusión).

### Cambiado

- `tech_slow` aplica un slow real de 1,5 s; antes solo duraba un frame y el
  guard de los proyectiles fallaba.
- El panel de combos muestra los tags activos y los nuevos flags.

### Corregido

- El slow de proyectiles, Firewheel y Beam ahora usa el mismo helper que el
  Campo de Fuerza.
- 918 tests (913 pass, 5 skip, 0 fail).

## [1.2.0] — 2026-10-28

### Añadido

- **Rework de cartas (fase 74)**: 22 cartas nuevas (70 en total).
  - 5 cartas de daño por tipo: balístico, luz, explosión, eléctrico y dron.
  - 12 cartas de técnica para el resto del arsenal (Missile, Tesla,
    Thunderstroke, Mortar, Gauss, Láser, Beam, Rueda de Fuego, Avispas y
    Campo de Fuerza).
  - 3 combos nuevos: Reactor de Cadena, Prisma Compuesto y Singularidad;
    Balas Detonantes se reworkea.
  - 2 cartas de Black Hole: Horizonte de Sucesos y Colapso.
- Sistema de **tags y prerrequisitos** (`requiresTags`, `requiresUnits`,
  `requiresBlackHole`): las cartas de combo no se ofrecen si falta su pareja.
- **Black Hole por instancia**: duración, radio, colapso y mini agujeros
  negros de Singularidad.
- El panel de combos muestra los tags activos.

### Cambiado

- `dmg_all` pasa de +30% a **+10% por stack** (×2): es global, no
  específica.
- `tech_explode` pasa a **explosión al impactar** (40% en radio 70) y exige
  una torre explosiva (Missile o Mortar).
- Los buffs globales (`dmg_all`, `cadence_up`, `hunt_*` y daño por tipo)
  ahora se guardan en la fortaleza y alcanzan a las unidades desbloqueadas
  después.
- El enlace de carga del Thunderstroke solo se dibuja en los últimos 0,5 s
  antes del disparo, no durante todo el cooldown.

### Corregido

- Las torres desbloqueadas después de una carta global ya no quedaban sin
  el buff.
- 906 tests (901 pass, 5 skip, 0 fail).

## [1.1.0] — 2026-10-28

### Añadido

- Pantalla **CRÉDITOS Y LICENCIAS** dentro del juego (menú principal → CRÉDITOS,
  estado `CREDITS` de la FSM): cumple la atribución **CC BY 3.0** del icono del
  Ultimate (Lorc / game-icons.net, recoloreado) en la obra distribuida, y lista
  el resto de las licencias (CC0 de Kenney y BenHickling, OFL 1.1 de las cuatro
  tipografías y MIT del código). Los textos legales completos viajan embebidos
  en el módulo nuevo `js/licenses.js` (offline, sin `fetch`); el texto de
  OFL 1.1 pasa a distribuirse con el juego.
- CI en GitHub Actions con matriz Linux/macOS/Windows × Node 22/24 y un job de
  checks estáticos (sintaxis, zero-dependency, referencias rotas).
- Dependabot semanal para las GitHub Actions.
- Issue forms (`bug_report`, `feature_request`), plantilla de pull request y
  `config.yml` con links de seguridad y conducta.
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) y `THIRD_PARTY_NOTICES.md`.
- `.editorconfig` y `.gitattributes` (LF en el repo, binarios sin conversión).
- **Thunderstroke (fase 73)**: alcance global, un rayo principal de 65 y
  estallido de mini rayos de área (50 % a hasta 3 vecinos en 130 px; los perks
  `extraCount`/`chainFork` suman mini rayos). El build-up dibuja un enlace
  suave al blanco con anillo de lock; al disparar, el rayo se intensifica y el
  anillo de impacto marca el punto.

### Enemigos por familia

- Enjambres nuevos: `rockSwarm`, `virusSwarm` y `crystalSwarm`, con arte
  procedural de cúmulo y silueta propia.
- Tanques nuevos: `boulder`, `sporePod` y `geode`; `blob` queda como tanque
  virus con la mecánica Cepa.
- Mecánicas intrínsecas: Desmoronamiento, Cepa, Esporulación y Placas.
- Campaña gradual: S1–2 roca + cristal, S3 virus, S4 espora, S5 las cuatro
  familias; `sporePod` debuta en S20 y `geode` en S30.
- Crías de mecánicas: 10 % de XP/score y sin recursión. El score usa carry
  entero para no mostrar decimales ni pagar de más.
- Bestiario: descripción y contra de cada tanque.
- 890 tests (885 pass, 5 skip).

### Android base

- Capacitor 8.5.3 + proyecto `mobile/android/` (`targetSdk 36`, `minSdk 24`).
- Build manual de APK debug en GitHub Actions.
- Hooks nativos: back button, pausa/audio al background, keep-awake.
- `js/native.js` puro + tests; sin plugins JS.
- Safe areas y pulido táctil.
- 890 tests (885 pass, 5 skip).

### Cambiado

- `docs/CREDITS.md` y `THIRD_PARTY_NOTICES.md`: la atribución CC BY 3.0 deja de
  ser una tarea pendiente de la etapa Android — ya se muestra en el juego.
- `README.md`: la sección de cómo correr/jugar quedó arriba, junto al TL;DR, y el
  badge de estado ahora es el de CI.
- `SECURITY.md`: el reporte privado por GitHub Advisories es el canal preferido.
- El comando de la suite pasa a `node --test "tests/**/*.mjs"`.
- `Sensores Ampliados` ya no se ofrece solo con Thunderstroke: la torre pasó a
  alcance global y la carta queda para Beam y Tesla.
- `MAX_TOWER_REACH` queda como referencia histórica del layout (ya no es el
  alcance máximo de una torre).

### Corregido

- `node --test tests/` no funcionaba en Linux ni macOS con Node 22+: el runner
  trata el argumento posicional como glob y un directorio no matchea nada
  (`Error: Cannot find module '.../tests'`). Funcionaba solo en Windows, donde el
  path se resolvía como directorio. Con el glob explícito corre igual en Linux,
  macOS y Windows. Detectado por la matriz de CI antes de abrir el repo.
- `package.json`: se agregó el script `npm run check` para los checks estáticos.
- **Guardian**: colisión barrida (CCD) para que las balas rápidas no se salten
  esporas entre frames a 30 fps o 2×; separación de la ráfaga paralela 13 → 10 px.
- **Thunderstroke**: el blanco se refresca durante el build-up; si muere, la
  carga no se queda apuntando a un cadáver.

## [1.0.0] — 2026-10-26

Primera versión pública.

### Juego

- Campaña de 50 etapas con jefes, biomas y dificultad creciente.
- Modo infinito (51+) con profundidad, hitos y récord.
- Supervivencia: olas infinitas, atrición de base y jefe cada 5 oleadas.
- Desafío diario con semilla por fecha.
- Protocolo / Heat: 11 condiciones, presets I–V y recompensas extra.
- 8 torres + 3 drones, 48 cartas, 7 afijos de élite y 5 temas visuales.
- Ultimate, Black Hole, combos, perks y meta-progresión de 100 niveles.
- Calidad gráfica Alta/Baja y HUD responsive.

### Técnico

- Canvas 2D 540×880 + DOM/CSS + módulos ES, sin build step.
- 22 módulos, FSM de 11 estados, director de olas con presupuesto de HP.
- 837 tests en Node (`node --test tests/`).
- 100% offline: fuentes, sprites y SFX locales.
- Licencia MIT para el código; assets CC0 / CC BY 3.0 / OFL 1.1.

### Pendiente

- App Android (Capacitor 8) y publicación en Google Play.
- Traducción del juego a otros idiomas.
