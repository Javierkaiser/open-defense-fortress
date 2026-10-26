# Seguridad

## Versiones soportadas

| Versión | Soporte |
|---|---|
| 1.x | Sí |

## Reportar una vulnerabilidad

Escribí a **contacto@javierlust.net.ar** con:

- descripción del problema,
- pasos para reproducirlo,
- versión o commit,
- impacto estimado.

No abras un issue público para vulnerabilidades sin corregir. Respondemos con
la mejor disposición posible; no hay programa de recompensas.

## Alcance

Open Defense Fortress es un juego estático:

- no tiene servidor ni backend;
- no recolecta datos personales;
- no usa cuentas, ads, analytics ni compras;
- guarda el progreso solo en `localStorage` del dispositivo.

Las vulnerabilidades relevantes serían, por ejemplo, XSS en el HUD, ejecución
de código desde datos guardados, o dependencias comprometidas en el toolchain
de desarrollo. La política de privacidad está en
[privacy.html](https://faint-desert-zjv5.here.now/privacy.html).
