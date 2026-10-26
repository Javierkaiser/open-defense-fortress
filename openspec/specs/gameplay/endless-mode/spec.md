# gameplay/endless-mode Specification

## Purpose
Define el **modo infinito** que se abre después de la campaña de 50 etapas: cómo se
desbloquea, cuál es la profundidad a jugar, cómo se define una etapa generada, cómo crece
la presión, cuánto paga una victoria, cómo se persiste y cómo funciona el desafío diario
determinista.

## Requirements

### Requirement: Desbloqueo por campaña completa

El modo infinito MUST abrirse únicamente cuando el Stage 50 está **limpiado** (existe el
récord de esa etapa), no cuando está meramente desbloqueado. Con la campaña incompleta el
modo MUST NOT ofrecer ninguna entrada.

#### Scenario: La campaña está a medias

- **WHEN** el progreso tiene el Stage 50 desbloqueado pero sin récord de victoria
- **THEN** el modo infinito no está disponible

#### Scenario: La campaña está completa

- **WHEN** el progreso tiene un récord de victoria en el Stage 50
- **THEN** el modo infinito está disponible y ofrece continuar en el Stage 51

### Requirement: Profundidad "mejor + 1"

La profundidad a continuar MUST ser la etapa más profunda **limpiada** + 1 (mínimo 51).
Perder una run MUST NOT reducir la profundidad alcanzada, y MUST poder reintentarse la
misma etapa. El récord de profundidad MUST persistir entre sesiones.

#### Scenario: Se limpia una etapa nueva

- **WHEN** el jugador limpia el Stage 57 y su récord previo era 56
- **THEN** la profundidad a continuar pasa a ser la 58

#### Scenario: Se pierde una etapa nueva

- **WHEN** el jugador pierde en el Stage 58
- **THEN** el récord sigue en 57 y puede reintentar la 58

#### Scenario: Se limpia una etapa ya limpiada

- **WHEN** el jugador vuelve a limpiar una etapa más baja que su récord
- **THEN** el récord de profundidad no baja

### Requirement: Etapa generada, no hardcodeada

Toda etapa con id mayor o igual a 51 MUST resolverse por una función de definición
(`stageDef`) que devuelva nombre (`∞ Stage N`), tema, **HP de base de la misma curva de la
campaña** (`baseHpForStage`) y la marca de jefe cada 10. El HP de base MUST NOT caer a un
valor por defecto. Las etapas 1-50 MUST conservar exactamente su definición actual.

#### Scenario: Se define una etapa del infinito

- **WHEN** se pide la definición del Stage 51
- **THEN** devuelve nombre `∞ Stage 51`, un tema válido y el HP de base de la curva de la
  campaña (26 000), no un fallback

#### Scenario: El ciclo de jefes sigue

- **WHEN** se pide la definición del Stage 60
- **THEN** la etapa está marcada como etapa de jefe

#### Scenario: La campaña no cambia

- **WHEN** se piden las definiciones de las etapas 1 a 50
- **THEN** son las mismas del array de campaña, con sus nombres y HP actuales

### Requirement: Más enemigos y presión creciente

El presupuesto de las descargas de una etapa mayor a 50 MUST crecer de forma **monótona con
la profundidad y sin tope** (hoy se aplana desde el Stage 50), de modo que una etapa más
profunda tenga más enemigos y más HP total que una menos profunda. Los jefes de las etapas
del infinito MUST tener nombre propio por vuelta y MUST NOT repetir el nombre de reserva.

#### Scenario: Una etapa profunda trae más enemigos

- **WHEN** se comparan las olas generadas del Stage 60 contra las del Stage 50
- **THEN** el Stage 60 tiene más enemigos y más HP total

#### Scenario: El crecimiento no se estanca

- **WHEN** se comparan etapas cada vez más profundas (60, 70, 80)
- **THEN** el presupuesto de descarga sigue creciendo en cada salto

#### Scenario: Los jefes del infinito tienen nombre

- **WHEN** se pide el nombre del jefe del Stage 60 y del Stage 70
- **THEN** son nombres propios y distintos entre sí (no el nombre de reserva repetido)

### Requirement: Recompensas de profundidad

Una victoria en el infinito MUST pagar al menos lo mismo que una victoria de campaña y MUST
escalar con la profundidad. Los hitos (cada 5 etapas del infinito) MUST pagar un extra y
MUST anunciarse. Una victoria del infinito MUST NOT registrarse como "primera limpieza"
(`firstClear`): ese registro es de la campaña y no puede crecer sin techo.

#### Scenario: La recompensa escala

- **WHEN** se comparan las recompensas de limpiar el Stage 55 y el Stage 75
- **THEN** la del 75 es mayor

#### Scenario: Un hito paga extra

- **WHEN** se limpia una etapa de hito (múltiplo de 5 del infinito)
- **THEN** la recompensa incluye el multiplicador de hito y el resumen lo anuncia

#### Scenario: El infinito no toca la primera limpieza

- **WHEN** se limpia cualquier etapa del infinito
- **THEN** la lista de primeras limpiezas de la campaña no cambia

### Requirement: Persistencia tolerante

El estado del infinito MUST persistirse junto al progreso y MUST normalizarse de forma
tolerante: un progreso viejo sin el campo, o con datos corruptos, MUST cargar sin lanzar
errores y MUST quedar en un estado válido.

#### Scenario: Progreso viejo

- **WHEN** se carga un progreso guardado antes del modo infinito
- **THEN** el récord de profundidad queda en 0 y el diario vacío, sin errores

#### Scenario: Datos corruptos

- **WHEN** el campo del infinito trae tipos inválidos o una fecha malformada
- **THEN** se descartan esos valores y el resto del progreso se conserva

### Requirement: Desafío diario determinista

El desafío diario MUST derivar la **etapa** y la **semilla de olas** de la fecha local del
jugador, de modo que dos jugadores el mismo día jueguen la misma etapa con la misma
composición de olas. El mejor score del día MUST persistirse y MUST reiniciarse al cambiar
la fecha. Reintentar un desafío MUST reusar la semilla del día (no se puede rerolear), y el
score MUST registrarse tanto si se gana como si se pierde.

#### Scenario: Dos jugadores el mismo día

- **WHEN** dos instancias resuelven el desafío con la misma fecha
- **THEN** obtienen la misma etapa y la misma semilla de olas

#### Scenario: Cambia el día

- **WHEN** se resuelve el desafío con la fecha del día siguiente
- **THEN** el récord del día anterior se descarta y el desafío puede tener otra etapa

#### Scenario: Reintentar no rerolea

- **WHEN** el jugador reintenta el desafío del día
- **THEN** la run usa la misma semilla de olas que el intento anterior

#### Scenario: Se pierde el desafío

- **WHEN** la run diaria termina en derrota
- **THEN** el score obtenido igual se registra como candidato al récord del día

### Requirement: El endgame se ve y se entiende

El selector de etapas MUST mostrar la tarjeta de continuación del infinito con la
profundidad a jugar y el récord de profundidad, y MUST mostrar el desafío del día con su
etapa y su récord. El resumen de fin de run del infinito MUST indicar la profundidad
jugada, el récord y si se batió; el resumen de un hito MUST anunciarlo.

#### Scenario: El selector ofrece continuar

- **WHEN** el modo está abierto y el récord es 62
- **THEN** el selector muestra una tarjeta para continuar en la etapa 63 con el récord 62

#### Scenario: El resumen informa

- **WHEN** el jugador limpia una etapa del infinito superando su récord
- **THEN** el resumen muestra la profundidad nueva y que es un récord

### Requirement: La campaña no cambia

Este cambio MUST NOT alterar la composición de olas, los nombres de jefe, las recompensas
ni la dificultad medida de las etapas 1-50.

#### Scenario: Las 50 etapas medidas

- **WHEN** se corre la campaña con el simulador de balance
- **THEN** los resultados de las etapas 1-50 son los mismos que antes del cambio
