# Seguridad

## Versiones soportadas

| Versión | Soporte |
|---|---|
| 1.x | Sí |

## Reportar una vulnerabilidad

**Preferido:** usá el reporte privado de GitHub en
<https://github.com/Javierkaiser/open-defense-fortress/security/advisories/new>
(Draft a new security advisory). Queda registrado, es privado y permite coordinar
la corrección y la divulgación.

**Alternativa:** escribí a **contacto@javierlust.net.ar** con:

- descripción del problema,
- pasos para reproducirlo,
- versión o commit,
- impacto estimado.

No abras un issue público para vulnerabilidades sin corregir. Respondemos con
la mejor disposición posible; no hay programa de recompensas. Se aceptan reportes
en español o en inglés.

## Alcance

Open Defense Fortress es un juego estático:

- no tiene servidor ni backend;
- no recolecta datos personales;
- no usa cuentas, ads, analytics ni compras;
- guarda el progreso solo en `localStorage` del dispositivo.

Las vulnerabilidades relevantes serían, por ejemplo, XSS en el HUD, ejecución
de código desde datos guardados, o dependencias comprometidas en el toolchain
de desarrollo. La política de privacidad está en
[privacy.html](https://opendefensefortress.javierlust.net.ar/privacy.html).
