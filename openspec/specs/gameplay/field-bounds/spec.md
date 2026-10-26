# gameplay/field-bounds Specification

## Purpose
Garantiza que ningún enemigo salga del rectángulo del campo: el que cae en diagonal vuelve hacia adentro al tocar un lateral, y salir de la pantalla deja de ser una forma silenciosa de morir.

## Requirements

### Requirement: Contención en el campo

Todo enemigo vivo MUST permanecer dentro del rectángulo del campo (con un margen de su propio radio, para que no se recorte contra el borde). Al alcanzar un lateral MUST volver hacia adentro: la componente lateral de su movimiento se refleja, así conserva su caída diagonal y su rastro apunta hacia el interior del campo.

#### Scenario: Un enemigo diagonal no se escapa

- **WHEN** un enemigo que cae en diagonal nace apuntando hacia afuera y cae durante toda su vida
- **THEN** su X nunca cruza el límite del campo

#### Scenario: Al tocar el borde vuelve hacia adentro

- **WHEN** el enemigo alcanza un lateral
- **THEN** su movimiento lateral se invierte (sigue cayendo, ahora hacia el centro) y su rastro apunta hacia adentro

#### Scenario: El empuje tampoco lo saca

- **WHEN** un enemigo es empujado lateralmente (empuje del blob, succión del Black Hole u otro efecto)
- **THEN** sigue dentro del campo

### Requirement: Salir del campo no es una muerte

Un enemigo MUST NOT morir por salir del campo. Su destino se resuelve donde corresponde: muere por daño o llega a la base y cuenta como fuga. El matado de seguridad por coordenada fuera del campo MUST NOT alcanzarse nunca en condiciones normales.

#### Scenario: El enemigo que se iba no desaparece

- **WHEN** un enemigo que antes se escapaba por el costado llega al borde
- **THEN** sigue vivo (no se marca muerto) y continúa cayendo hacia la base

#### Scenario: La baja y la fuga se cuentan donde siempre

- **WHEN** el enemigo contenido muere por daño o impacta la base
- **THEN** cuenta como baja o como fuga por los caminos normales del juego

### Requirement: La contención no cambia el resto del movimiento

La caída vertical, las derivas senoidales, los zigzags y el barrido del jefe MUST seguir comportándose como hoy: la contención es un límite exterior, no una fuerza nueva.

#### Scenario: Derivas y zigzags intactos

- **WHEN** se compara el recorrido de un meteoro (deriva) y de una espora (zigzag) contra el comportamiento anterior
- **THEN** sus posiciones se mantienen dentro de los mismos límites y con la misma oscilación

#### Scenario: La caída no se frena

- **WHEN** un enemigo rebota en un lateral
- **THEN** su velocidad vertical no cambia (el rebote es solo lateral)
