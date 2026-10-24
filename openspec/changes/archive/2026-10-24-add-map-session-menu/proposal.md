# Proposal

## Why

En `/mapa` no hay forma de ver si hay sesión, ni de iniciarla o cerrarla. Para cerrar sesión hay que ir a la home (`/`), que todavía es la plantilla de Next.js. Fran lo necesitó al probar en el celular el flujo "Entrá con Google para confirmar", que solo aparece sin sesión.

## What Changes

- Botón de menú en la esquina superior izquierda del mapa, arriba de los botones de agrandar y achicar, que bajan para dejarle lugar.
- Al tocarlo se despliega un menú:
  - con sesión: "Sesión iniciada como <email>" y **"Cerrar sesión"**;
  - sin sesión: **"Entrar con Google"**, que vuelve a `/mapa`.
- El menú se cierra al tocar afuera, con Escape o al elegir una opción.
- Al cerrar sesión, el mapa pasa a "sin sesión" sin recargar. Por ejemplo, el detalle abierto muestra "Entrá con Google para confirmar".
- Mientras hay un reporte en curso (elegir el punto o completar el formulario), el menú no se muestra, igual que el botón "Reportar".

Fuera de alcance: cambiar la home, los botones de `app/auth-buttons.tsx` o el callback.

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
- `report-map`: suma el requisito del menú de sesión en el mapa.

## Impact

- **Código de Fran:**
  - nuevo `app/components/map/SessionMenu.tsx`;
  - `app/components/map/ReportsMap.tsx`: la sesión con el email, el menú y el corrimiento de los controles de zoom;
  - `app/components/reports/LoginPrompt.tsx`: se extrae una función de login para reutilizarla en el menú.
- **Archivos protegidos:** ninguno. Se usa el cliente de `utils/supabase/client` (`getClaims`, `signInWithOAuth` y `signOut`) sin modificarlo. `app/auth-buttons.tsx` y el callback no cambian.
- **Dependencias:** ninguna nueva.
