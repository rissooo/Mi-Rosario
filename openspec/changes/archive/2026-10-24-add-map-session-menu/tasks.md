# Tasks

## 1. Sesión y login reutilizables

- [x] 1.1 Extraer `signInWithGoogle(next)` de `LoginPrompt.tsx` y usarla en el aviso. Verificar que "Entrá con Google para reportar" y "Entrá con Google para confirmar" siguen llevando al login con el mismo `next`.
- [x] 1.2 Cambiar `hasSession()` por `readSession()` en `ReportsMap`, que devuelve `{ signedIn, email }`, y guardar el email. Verificar con `tsc` y lint que "Reportar" y "Yo también lo vi" siguen usando `signedIn`.

## 2. Menú en el mapa

- [x] 2.1 Crear `app/components/map/SessionMenu.tsx`:
  - botón de tres rayas con `aria-label`, `aria-expanded` y `aria-haspopup`;
  - menú con "Sesión iniciada como <email>" y "Cerrar sesión", o "Entrar con Google";
  - se cierra al tocar afuera, con Escape o al elegir una opción;
  - corta la propagación de clics hacia el mapa;
  - muestra un error si falla el cierre de sesión.

  Verificar en el navegador que tocar el botón o el menú no mueve el mapa ni abre un detalle.
- [x] 2.2 Montar el menú arriba a la izquierda, bajar los controles de zoom y ocultarlo durante un reporte en curso. Verificar en el celular simulado (360 px) que el menú y los botones de zoom se ven y se pueden tocar, que la indicación de elegir el punto no los tapa y que el menú no aparece mientras se reporta.
- [x] 2.3 Cerrar sesión desde el menú: `signOut`, `signedIn = false` y sin recargar. Verificar en el navegador que, con un detalle abierto, aparece "Entrá con Google para confirmar", y que "Reportar" muestra el aviso de login.

## 3. Verificación integral

- [x] 3.1 Correr `npm.cmd run lint`, `npm.cmd exec -- tsc --noEmit --incremental false`, `node app/components/reports/check-report-form.mjs`, `node app/components/map/check-map-data.mjs`, `npm.cmd run build`, `openspec.cmd validate add-map-session-menu --strict` y `git diff --check`. Verificar que todo pasa y que `git status` no muestra cambios en `app/auth-buttons.tsx`, `app/auth/`, `utils/supabase/` ni `lib/contracts/`.
- [x] 3.2 Probar en un celular real sobre la preview: cerrar sesión desde el menú, entrar con Google desde el menú y volver a `/mapa` con el email visible. Verificar con la prueba de Fran.
