# gameplay/tower-skins Specification

## Purpose

Las torres y drones cambian de **presentación** según el tema de interfaz
elegido por el jugador: paleta, motivos de forma, pad y colores de FX. La
skin es datos puros y nunca toca daño, cadencia, hitbox ni reglas. El tema
`volcanico` es la base y conserva el render histórico exacto. Un `skinId`
explícito queda reservado para skins independientes del tema en el futuro.

## Requirements

### Requirement: La skin es sólo presentación

Una skin MUST limitarse a paleta, piezas decorativas, pad, colores de FX e
iconos. MUST NOT modificar daño, cadencia, alcance, hitbox, targeting,
mecánicas, cartas ni balance.

#### Scenario: Skin aplicada en combate

- **WHEN** una torre dispara con cualquier skin
- **THEN** su daño, cadencia y proyectiles conservan las mismas reglas; sólo
  cambian los colores y las piezas visuales

### Requirement: Un tema de UI, una skin

`TOWER_SKINS` MUST cubrir los cinco temas (`volcanico`, `cyberpunk`, `neon`,
`aqua`, `cielo`) y las once unidades (8 torres + 3 drones). El tema de UI
MUST ser independiente del tema de escenario (`engine.THEMES`): el fondo
sigue a la etapa; la skin sigue al tema elegido.

#### Scenario: Cambiar de tema en caliente

- **WHEN** el jugador cambia el tema de UI
- **THEN** `engine.setUiTheme()` actualiza `uiTheme` y emite `theme:changed`;
  las torres resuelven la skin nueva en el siguiente frame sin reiniciar la
  partida

#### Scenario: El tema del stage no pisa la skin

- **WHEN** una etapa cambia `engine.setTheme('nightcity')`
- **THEN** `engine.uiTheme` y la skin equipada no cambian

### Requirement: El tema base no altera el render

`skinForUnit('volcanico', 'auto', type)` MUST devolver una skin con
`base: true`, `palette: null` y sin motivos. El render, los proyectiles, los
FX, los drones y los iconos MUST ser equivalentes a los históricos.

#### Scenario: Regresión del arte base

- **WHEN** se renderiza cualquier unidad con el tema volcánico
- **THEN** no se agregan piezas, no se reemplazan colores y los tests de
  `tower-art`, `towers` y `meta` siguen pasando

### Requirement: Modelo de datos de skin

Cada skin no-base MUST declarar:

- `palette`: `body`, `bodyTop`, `dark`, `metal`, `accent`, `hot`, `core`.
- `accents`: acento por unidad; conserva la familia de color de cada torre.
- `motifs`: 3–6 piezas decorativas con `anchor` (`top`, `sideL`, `sideR`,
  `base`), shape única (`d`, `circle`, `ellipse`, `rect`, `line`), rol
  válido y opcional `pulse`.
- `perUnit`: `remove`, `patch` y `add` por unidad. `patch` sólo puede
  cambiar rol, alpha, pulso, grosor o animación; nunca geometría, pivote ni
  `rotTrack`.
- `pad`: colores del pad (plate, rim, glow, ticks) sin cambiar su geometría.
- `fx`: colores de proyectil, beam, laser, bolt, chain, mortar, crater,
  trail y explosión.
- `iconPad` y `flags.texture` para encuadre y texturas opcionales.

#### Scenario: Pieza inválida

- **WHEN** una skin agrega una pieza con rol desconocido o más de una shape
- **THEN** `compileSkin()` la descarta y el resto de la skin se aplica

### Requirement: Compilación sin mutación

`compileSkin(kind, skin)` MUST devolver un rig nuevo congelado y MUST NOT
mutar `TOWER_RIGS`. `resolveRig()` MUST cachear por `kind|skinId`. Los
motivos MUST insertarse después del ancla del rig para no tapar el arma,
la lente ni la boca; la boca (`rigHotPoint`) no se mueve.

#### Scenario: Dos skins del mismo tipo

- **WHEN** se resuelven dos skins distintas para el mismo rig
- **THEN** cada una devuelve su propio rig y `TOWER_RIGS` permanece intacto

### Requirement: Resolución y fallback

`skinId: 'auto'` MUST seguir al tema. Un `skinId` del catálogo MUST usarse
como skin explícita. Un id desconocido MUST caer a `auto`; un tema
desconocido MUST caer a `volcanico`. `loadSkin`/`saveSkin` MUST tolerar
storage bloqueado o corrupto y usar la clave `gdf_tower_skin`.

#### Scenario: Save viejo o corrupto

- **WHEN** `gdf_tower_skin` contiene un id inexistente
- **THEN** `loadSkin()` devuelve `auto` y la partida arranca con la skin del
  tema

### Requirement: Cobertura visual

Las cinco skins MUST distinguirse por algo más que color: antenas y
circuitos (cyberpunk), aros y tubos (neón), aletas y burbujas (aqua), alas y
nubes (cielo). Los drones MUST recibir paleta y un motivo de silueta. Los
iconos del meta MUST usar la misma skin y encuadrar con `rigBox(kind, skin)`.

#### Scenario: Icono del meta con skin

- **WHEN** el HUD pinta un icono de torreta con tema cyberpunk
- **THEN** el icono usa la paleta y los motivos cyberpunk, sin romper en
  Node ni sin canvas

### Requirement: Rendimiento y calidad baja

La skin MUST resolverse con cache (nunca leer storage por frame). En
calidad Baja MUST omitirse la textura, las piezas marcadas `lowQSkip` y los
motivos de drones, conservando la silueta y el pad.

#### Scenario: Calidad baja

- **WHEN** `engine._qualityId === 'baja'`
- **THEN** `renderTowerRig` no pinta motivos ni textura y el juego sigue
  renderizando la torre base con la paleta de la skin

### Requirement: Sin dependencias ni assets en V1

La V1 MUST ser vectorial: cero assets nuevos, cero requests y cero
licencias. `tower-art.js` MUST seguir siendo hoja sin imports;
`tower-skins.js` MUST ser datos puros con storage inyectable. Las texturas
por skin quedan para una versión posterior.

#### Scenario: Import en Node

- **WHEN** se importan `tower-skins.js`, `tower-art.js` o `towers.js` desde
  Node sin DOM ni canvas
- **THEN** no se crean imágenes, no se accede a `document` y los tests
  corren sin guardas especiales
