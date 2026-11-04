# gameplay/ultimate Specification

## Purpose

El ultimate es el **Bombardeo Orbital**: se carga sólo por bajas y debe ser
un golpe de área legible, contundente y confiable. El disparo elige el
racimo más denso del campo, reparte una alfombra de impactos sobre enemigos
reales y cierra con un remate. No es un borra-jefes: el daño a jefes tiene
un límite explícito. La campaña, el Infinito y la Supervivencia comparten la
misma regla.

## Requirements

### Requirement: Carga y disparo

El ultimate MUST cargarse sólo con bajas (40 kills; un jefe suma 15 cargas)
y MUST NOT depender de un cooldown pasivo. `canFireUltimate()` MUST exigir
carga completa y que no haya un bombardeo activo; un segundo disparo MUST
NOT reiniciar la lluvia ni perder impactos pendientes. Al disparar se MUST
consumir toda la carga y emitir `ultimate:fired`.

#### Scenario: No se solapan dos bombardeos

- **WHEN** el jugador dispara el ultimate y quedan impactos pendientes
- **THEN** `canFireUltimate()` devuelve `false` hasta que termina la ventana
  del bombardeo

### Requirement: Targeting por racimo

El disparo MUST centrarse en el **racimo con más enemigos** dentro de un
radio de 230 px, con el mismo criterio que el Black Hole, y MUST cubrir todo
el campo jugable (incluidos los enemigos que están por tocar la base). Cada
impacto MUST re-evaluar el racimo y MUST pegarse al enemigo vivo más cercano
a su punto del patrón; si no hay enemigos cerca, el impacto cae en el punto
teórico de la alfombra. El bombardeo MUST NOT usar una banda fija de `y`.

#### Scenario: Un enemigo cerca de la base recibe el bombardeo

- **WHEN** el único racimo está en `y ≈ 700`
- **THEN** el ultimate lo alcanza; no se limita a la banda histórica de
  `y = 340`

#### Scenario: El racimo manda sobre el centro del campo

- **WHEN** hay un racimo denso fuera del centro y un enemigo solitario lejos
- **THEN** el centro del bombardeo cae en el racimo denso

### Requirement: Ritmo y remate

El bombardeo MUST tener 11 impactos normales repartidos en tres oleadas que
aceleran y MUST cerrar con un remate en el centro del racimo. El remate MUST
tener más daño y más radio que un impacto normal. La ventana total MUST ser
de 2,7 s y el remate MUST ocurrir a los 2,4 s. El multiplicador de la carta
`Impacto Orbital+` (`orbitalDmgMul`) MUST aplicarse a todos los impactos.

#### Scenario: El remate pega más fuerte

- **WHEN** se compara un impacto normal con el remate
- **THEN** el remate tiene `daño ×2,5` y `radio ×1,5`

### Requirement: Límite a jefes

El daño del ultimate a un jefe MUST multiplicarse por 0,5. El límite MUST
aplicarse a todos los impactos, incluido el remate, y MUST NOT ser una
inmunidad: la matriz de familias, la armadura, el escudo y las placas siguen
aplicándose. La regla MUST ser explícita y documentada, no un tope oculto por
golpe.

#### Scenario: El jefe recibe la mitad

- **WHEN** un impacto de 100 de daño alcanza a un enemigo normal y a un jefe
- **THEN** el normal recibe 100 y el jefe recibe 50 antes de la matriz

### Requirement: Lectura y juice

El canvas MUST mostrar un designador sobre el racimo, un aviso por impacto
(retícula + columna), el haz y los anillos del impacto y una marca de ceniza
que se apaga. El remate MUST sumar flash, sacudida e hit-stop. El HUD MUST
anunciar el lanzamiento con el banner `BOMBARDEO ORBITAL` / `OBJETIVO FIJADO`
en la variante dorada. El audio MUST usar `ultimate` al lanzar, `kill` por
impacto y `explosion` en el remate. En calidad Baja MUST reducirse la
cantidad de partículas y anillos, y MUST NOT usarse `shadowBlur` por impacto.

#### Scenario: El lanzamiento se lee en el HUD

- **WHEN** se dispara el ultimate
- **THEN** se muestra el banner dorado con el icono del ultimate y el aviso
  desaparece solo

#### Scenario: El impacto deja huella

- **WHEN** termina un impacto
- **THEN** queda una marca de ceniza breve y el canvas vuelve a la normalidad
