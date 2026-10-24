# Proposal

## Why

La raíz `/` todavía muestra la plantilla de Next.js (logo de Next y botones de Vercel). Quien entra a la dirección pública de Mi Rosario no ve la app hasta que escribe `/mapa`.

## What Changes

- `/` redirige a `/mapa` con un redirect temporal (307), así se puede reemplazar más adelante por una portada.
- Se quita el contenido de la plantilla de `app/page.tsx`. `app/auth-buttons.tsx` y el callback no cambian; el login y el cierre de sesión siguen en el menú de la cuenta del mapa.

Fuera de alcance: diseñar una portada.

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
- `report-map`: la raíz del sitio lleva al mapa.

## Impact

- Código: `app/page.tsx`.
- Sin dependencias nuevas ni cambios en contratos, backend o autenticación.
