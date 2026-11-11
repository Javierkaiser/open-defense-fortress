---
name: Open Defense Fortress
description: Consola de forja de un asedio volcánico; instrumentos oscuros, luz funcional y tipografía técnica.
colors:
  hud-teal: "#35E0C8"
  hud-teal-deep: "#2AA898"
  hud-teal-soft: "#5FF0D8"
  crit-gold: "#FFD24A"
  rarity-rare: "#B48CFF"
  boss-red: "#FF5555"
  boss-red-deep: "#A3161F"
  space-deep: "#14161C"
  space-top: "#1C1F26"
  platform: "#2B2F36"
  platform-light: "#9FB4C8"
  card-bg: "#2A4D44"
  card-border: "#7FE0C8"
  card-text: "#E8FFF6"
  progress-neutral: "#DCE6EE"
  score-white: "#FFFFFF"
  hp-green: "#35E08A"
typography:
  display:
    fontFamily: "'Orbitron', sans-serif"
    fontSize: "clamp(20px, 5vmin, 28px)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "3px"
  cta:
    fontFamily: "'Orbitron', sans-serif"
    fontSize: "clamp(22px, 5.6vw, 30px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.1em"
  title:
    fontFamily: "'Orbitron', sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "1.5px"
  body:
    fontFamily: "'Rajdhani', sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0px"
  label:
    fontFamily: "'ChakraPetch', 'Exo2', monospace"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "1px"
  numeric:
    fontFamily: "'Exo2', 'ChakraPetch', monospace"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.5px"
rounded:
  xs: "4px"
  s: "8px"
  m: "12px"
  pill: "999px"
spacing:
  space-1: "2px"
  space-2: "4px"
  space-3: "8px"
  space-4: "14px"
components:
  button-console:
    backgroundColor: "{colors.hud-teal-deep}"
    textColor: "{colors.score-white}"
    typography: "{typography.body}"
    rounded: "{rounded.s}"
    padding: "10px 22px"
  button-console-hover:
    backgroundColor: "{colors.hud-teal}"
    textColor: "{colors.score-white}"
    rounded: "{rounded.s}"
  cta-forge:
    backgroundColor: "{colors.crit-gold}"
    textColor: "{colors.space-deep}"
    typography: "{typography.cta}"
    rounded: "{rounded.s}"
    padding: "12px 16px"
  tile-command:
    backgroundColor: "{colors.space-deep}"
    textColor: "{colors.score-white}"
    typography: "{typography.body}"
    rounded: "{rounded.s}"
    padding: "9px 10px"
  card-upgrade:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.card-text}"
    typography: "{typography.body}"
    rounded: "{rounded.m}"
    padding: "13px 14px"
  chip-data:
    backgroundColor: "{colors.space-deep}"
    textColor: "{colors.hud-teal}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  panel-screen:
    backgroundColor: "{colors.space-deep}"
    textColor: "{colors.score-white}"
    typography: "{typography.body}"
    rounded: "{rounded.m}"
    padding: "22px 20px"
---

# Design System: Open Defense Fortress

## Overview

**Creative North Star: "La Consola de Forja"**

La pantalla es la consola de una forja de asedio: el mundo arde afuera y la
interfaz se mantiene fría, metálica y precisa. El grafito profundo es el
chasis; el teal es la telemetría de lo que es tuyo (nivel, XP, controles); el
latón marca la recompensa; la amatista, lo raro; el rojo, la amenaza. Nada
brilla porque sí.

La épica no viene del ornamento sino del contraste: paneles planos con bordes
de 1 px, esquinas biseladas como metal mecanizado y luz que aparece sólo cuando
hay un estado que anunciar (hover, listo, jefe, legendaria). La pantalla se lee
de un vistazo en medio de una oleada: cifras grandes, etiquetas mono en
mayúsculas y jerarquía por tamaño y color, nunca por adornos.

La escena cambia de tema (cinco paletas de UI), pero las entidades del campo
—torres, enemigos, proyectiles— conservan sus colores semánticos: el tema tiñe
la consola, no la batalla.

**Key Characteristics:**
- Grafito y acero de fondo; teal, latón, amatista y rojo como luces con significado.
- Biseles y chaflanes en lo interactivo; radios suaves en lo contenido.
- Glow funcional en vez de sombras decorativas.
- Orbitron para el grito, Rajdhani para el dato, ChakraPetch/Exo2 para la instrumentación.
- Ningún texto visible por debajo de 15 px: si no entra, scrollea o reflowa.

## Colors

La paleta es una consola oscura con cuatro luces: teal (vos), latón
(recompensa), amatista (rareza) y rojo (amenaza), sobre neutros de grafito y
acero.

### Primary
- **Verde de Fragua** (#35E0C8): el acento de la UI. Marca nivel, XP, bordes
  interactivos, hover, chips y el progreso propio. Es el único color que
  cambia con los cinco temas de interfaz; en la base volcánica es este teal.
- **Verde de Fragua Profundo** (#2AA898): el mismo acento en su paso oscuro;
  rellena degradados de barra y estados presionados.
- **Verde de Fragua Claro** (#5FF0D8): el paso alto del acento; nombres de
  unidad y cifras que necesitan un punto más de luz.

### Secondary
- **Latón de Recompensa** (#FFD24A): oro de recompensa y crítico. Brillan en
  él las legendarias, las estrellas de maestría, el CTA principal y los
  títulos de victoria.

### Tertiary
- **Amatista de Reliquia** (#B48CFF): violeta de rareza y de lo exótico
  (cartas raras, Black Hole, Thunderstroke). Es semántico: no cambia con el
  tema.

### Neutral
- **Grafito de Yunque** (#14161C): fondo profundo del espacio y de los paneles.
- **Pizarra de Cubierta** (#1C1F26): el paso inmediatamente superior; separa
  la cáscara del marco.
- **Acero de Plataforma** (#9FB4C8): texto secundario, bordes apagados y
  etiquetas de baja jerarquía.
- **Verde de Placa** (#2A4D44): fondo de las cartas de mejora en móvil.
- **Blanco de Score** (#FFFFFF): cifras y títulos que deben leerse primero.
- **Blanco de Progreso** (#DCE6EE): el progreso del mundo (olas del stage).
  Es neutro a propósito: no compite con el teal del jugador.

### Named Rules
**La Regla del Unicolor.** El teal es "vos" (nivel, XP, controles); el blanco
neutro es "el mundo" (progreso de la etapa). Nunca cruces los dos: si el
progreso del stage se pinta de teal, el jugador deja de saber qué barra es suya.

**La Regla del Rojo.** El rojo es amenaza (jefe, daño, peligro). No se usa como
decoración ni como acento de marca.

## Typography

**Display Font:** Orbitron (con `sans-serif`)
**Body Font:** Rajdhani (con `sans-serif`)
**Label/Mono Font:** ChakraPetch y Exo2 (con `ui-monospace, Consolas, monospace`)

**Character:** una placa de instrumentos: Orbitron grita, Rajdhani informa y
ChakraPetch mide. Las tres son técnicas, condensadas y de mayúsculas firmes; no
hay serif, script ni pesos livianos.

### Hierarchy
- **Display** (700, clamp(20px, 5vmin, 28px), 1.1, tracking 3px): títulos de
  pantalla y cabeceras de modal.
- **CTA** (700, clamp(22px, 5.6vw, 30px), 1, tracking 0.1em): la acción
  principal del menú y de la pausa.
- **Title** (700, 21px, 1.2, tracking 1.5px): nombre de stage, nombre de carta
  y rótulos de sección.
- **Body** (700, 18px, 1.35): botones, descripciones, filas y datos de apoyo.
- **Label** (400, 15px, 1.35, tracking 1–2px, MAYÚSCULAS): etiquetas de dato,
  chips, pistas y micro-rótulos en mono.
- **Numeric** (400, Exo2, 18–36px): score, reloj, cifras del HUD y la cifra
  grande del banner de nivel.

### Named Rules
**La Regla del Piso.** Ningún texto visible baja de 15 px. Si una pantalla no
entra, scrollea o reflowa; no se achica la letra.

**La Regla del Grito.** Orbitron se reserva para títulos y CTA. Un párrafo en
Orbitron deja de ser instrumento y se vuelve ruido.

## Layout

El mundo vive en un canvas lógico de **540×880** (54:88), escalado por CSS con
DPR tope 2: una sola pantalla, sin scroll de cámara. El marco suma 8 px de
margen y 1 px de borde; los overlays usan el ancho del marco y el alto real de
la pantalla, con `100dvh` y `env(safe-area-inset-*)` para notch y barras.

La ritmo de espacio es corto y mecánico: 2 / 4 / 8 / 14 px (`--space-1..4`),
pantallas con 16–24 px de padding, paneles con 22/20, cartas con 13/14 y gaps
de 8–14. En escritorio la fila de cartas se vuelve horizontal a partir de
**431 px**; en móvil se apila. Los chips del HUD miden **48 px** en PC y
**32 px** en móvil; con `pointer: coarse` los controles principales suben a
**52 px**.

**La Regla del Marco.** Nada vive fuera del marco: los overlays cubren el marco,
no el monitor. La cámara y el HUD comparten la misma caja.

## Elevation & Depth

El sistema es **flat con glow funcional**. No hay sombras decorativas: las
superficies son planas, con borde de 1 px y un bisel interior que sugiere metal
mecanizado. La profundidad aparece como luz cuando hay un estado que anunciar
(hover, listo, jefe, legendaria) o como hueco cuando algo se presiona.

### Shadow Vocabulary
- **Glow teal** (`0 0 8px rgb(var(--hud-teal-rgb) / .30)`): estado interactivo,
  barras y focos.
- **Glow latón** (`0 0 8px rgb(var(--crit-gold-rgb) / .35)`): recompensa,
  crítico y legendarias.
- **Ambiente de panel** (`0 0 22px rgb(var(--hud-teal-rgb) / .14), inset 0 0 18px rgba(15, 42, 40, .30)`):
  paneles de overlay y modales.
- **Bisel de tecla** (`inset 0 1px 0 rgb(var(--hud-teal-rgb) / .45), inset 0 -10px 14px rgba(0, 0, 0, .38)`):
  botones de consola; filo claro arriba, profundidad abajo.

**La Regla del Glow con Causa.** Sin estado o energía, sin glow. Un brillo
decorativo compite con la telemetría y vuelve ilegible el HUD.

## Shapes

La forma distingue dos materiales. Lo **interactivo** es metal biselado:
chaflanes de 8 px (botones), 16 px (CTA) y 9 px (tiles) recortados con
`clip-path`, con borde de 1 px. Lo **contenido** es placa suave: radios de 12 px
para paneles y cartas, 8 px para chips y 4 px para micro-detalles; las píldoras
usan 999 px. Los acentos laterales de 2–3 px (tiles y cartas) ordenan la
lectura sin dibujar cajas extra.

**La Regla del Chaflán.** Metal interactivo = chaflán; contenido = radio. Nunca
mezcles los dos en el mismo elemento: un botón redondeado se lee como tarjeta y
una tarjeta biselada se lee como botón.

## Components

### Buttons
- **Shape:** tecla de consola con chaflán de 8 px (`clip-path`), borde de 1 px
  `rgb(var(--hud-teal-rgb) / .40)`.
- **Primary:** degradado de gloss (canto, brillo, cara, brillo, canto) sobre
  `--btn-face`; texto blanco Rajdhani 700 21 px con tracking 1 px; padding
  10×22 px.
- **Hover / Focus:** glow teal a `.65`, sin mover el layout.
- **Active:** `translateY(1–2px)`; la tecla se hunde, no se agranda.
- **Secondary / Ghost:** plano `rgba(12,16,18,.5)` con borde acero `.4`; sin
  gloss, a propósito.

### Chips
- **Style:** píldora de 999 px, borde teal `.35–.45`, fondo `--hud-panel`,
  tipografía mono de 15 px y texto teal.
- **State:** el chip de unidad de una carta usa el mismo molde; las variantes
  `NUEVA TORRE` y `NUEVO DRON` cambian el borde y el texto a latón.

### Cards / Containers
- **Corner Style:** móvil 12 px; escritorio chaflán de 10 px.
- **Background:** degradado de `--card-bg` a `#16332C` (móvil); grafito
  `rgba(16,28,31,.96)` a `rgba(8,12,16,.98)` (escritorio).
- **Border:** 1.5 px en móvil; 1 px + 3 px de acento izquierdo por rareza en
  escritorio (acero → teal → amatista → latón).
- **Internal Padding:** 13×14 px; el nombre lleva 34 px de aire a la derecha
  para el badge.

### Navigation
- **Tiles de comando:** dos columnas, 64 px de alto, degradado grafito, borde
  izquierdo teal de 2 px, chaflán de 9 px y un icono cuadrado de 30 px.
- **Hover:** sube 1 px y sube el borde a teal `.55`; no cambia el tamaño del
  texto.
- **CTA de forja:** 76 px de alto, degradado latón, chaflán de 16 px, hairline
  interior y un barrido de brillo al hover; icono circular de 46 px.

### HUD read-outs (signature)
- **Stage / Lv / reloj:** tres chips de 48 px en PC y 32 px en móvil, con
  etiqueta mono en mayúsculas y cifra en Exo2.
- **Score:** 21 px en PC, 18 px en móvil; el multiplicador y la etiqueta bajan
  a 15 px.
- **Barras:** XP en teal; progreso del stage en blanco neutro; vida en verde;
  jefe en rojo profundo. `transform: scaleX()` en vez de `width` para no
  re-layoutear.

### Panels / Modals
- **Velo:** `rgba(6,8,12,.84)` con blur de 4 px; en calidad Baja y
  `pointer: coarse` el blur se apaga y el velo ya es opaco.
- **Panel:** 12 px de radio, borde teal `.28`, fondo grafito degradado y glow
  ambiente; padding 22/20.
- **Cartas de mejora:** el modal entra con flip escalonado (120 ms por carta);
  la rareza va al pie; la unidad se declara en un chip arriba del nombre.

## Do's and Don'ts

### Do:
- **Do** usar teal para "vos" (nivel, XP, controles) y blanco neutro para el
  progreso del mundo.
- **Do** reservar el latón para recompensa, crítico, legendarias y el CTA.
- **Do** mantener todo texto visible en 15 px o más y reflowar antes que
  achicar.
- **Do** biselar lo interactivo y redondear lo contenido.
- **Do** usar glow sólo cuando hay un estado o energía que anunciar.
- **Do** escribir datos en mono mayúscula con tracking de 1–2 px.

### Don't:
- **Don't** usar drop shadows decorativas: la profundidad es luz, no sombra.
- **Don't** teñir torres, enemigos ni proyectiles con el tema de UI: sus
  colores son semánticos.
- **Don't** usar rojo fuera de amenaza, daño o peligro.
- **Don't** introducir serif, script ni pesos livianos.
- **Don't** agregar un sexto acento a la UI: la paleta es teal, latón,
  amatista y rojo sobre neutros.
- **Don't** mezclar chaflán y radio en el mismo elemento.
