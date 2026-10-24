# Design

## Context

- `ReportsMap` ya guarda `signedIn: boolean | null`, resuelto con `hasSession()` (`getClaims()` del cliente del navegador). Se lo pasa a "Yo también lo vi" y lo usa para "Reportar".
- Los controles de zoom de Leaflet están en `.leaflet-top.leaflet-left`. En el modo de elegir el punto, la indicación de arriba usa `px-14` para no taparlos.
- El login lo hace `LoginPrompt`, con `signInWithOAuth` y `next` hacia `/auth/callback`. `app/auth-buttons.tsx` es la autenticación existente y no se toca.

## Goals / Non-Goals

**Goals:** cerrar e iniciar sesión sin salir del mapa, y que todo el mapa refleje el cambio de sesión al instante.

**Non-Goals:**
- Un perfil o una lista de "mis reportes".
- Tocar la home.
- Escuchar cambios de sesión hechos en otra pestaña (`onAuthStateChange`).

## Decisions

### 1. Botón superpuesto y zoom corrido con la API de Leaflet

`SessionMenu` es un elemento de React posicionado arriba a la izquierda del contenedor del mapa, con el mismo tamaño y estilo que los botones de zoom. Para dejarle lugar, un componente `ZoomBelowMenu` le pone `margin-top` (52 px) al contenedor de `map.zoomControl`. Primero se probó una variante arbitraria de Tailwind sobre `.leaflet-top.leaflet-left`, pero no se generaba, y tocar `app/globals.css` requiere autorización. Un ícono de tres rayas tiene `aria-label="Menú de la cuenta"`, `aria-expanded` y `aria-haspopup`.

El menú y el botón cortan la propagación de clics hacia el mapa, para que tocarlos no cuente como tocar el mapa (el mismo bug que apareció con los botones de elegir el punto).

*Alternativa descartada:* un control nativo de Leaflet (`L.Control`). Habría que renderizar React en un portal, y es más código para el mismo resultado.

### 2. La sesión con el email vive en `ReportsMap`

`hasSession()` pasa a ser `readSession()`, que devuelve `{ signedIn, email }` desde los claims. `ReportsMap` guarda los dos datos y se los pasa al menú. Al cerrar sesión:
1. `createClient().auth.signOut()`;
2. `signedIn = false` y `email = null`.

Con eso, el detalle y "Reportar" se actualizan sin recargar. No se usa `router.refresh()`: `/mapa` es estática y no lee la sesión en el servidor.

### 3. Una sola función de login

Se extrae de `LoginPrompt` una función `signInWithGoogle(next)` y la usan el aviso y el menú. El menú usa `next=/mapa`.

### 4. Se oculta durante un reporte en curso

Así, cerrar sesión no deja un borrador a medias sin sesión. Además, la barra de elegir el punto ya ocupa la parte de arriba.

## Risks / Trade-offs

- [El `email` sale de los claims del navegador y puede faltar] → Si no hay email, el menú muestra "Sesión iniciada" sin el email.
- [Si `signOut` falla por la red] → El menú muestra "No pudimos cerrar la sesión. Probá de nuevo." y la sesión sigue igual.
