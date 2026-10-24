# Tasks

## 1. Preparación de la rama

- [x] 1.1 Traer `main` a `feature/interface-map` (con autorización de Fran) y resolver conflictos si aparecen. Verificar que `npm.cmd run lint`, `node app/components/reports/check-report-form.mjs` y `npm.cmd run build` pasan antes de empezar, y que `ReportPanel.tsx` con `VisionAssist.tsx` de Valen sigue funcionando en `/mapa`.

## 2. Modo de ejemplo en la fuente del mapa

- [x] 2.1 Agregar a `app/components/map/report-source.ts`:
  - `isSampleAuthor(id)`, que marca como del autor los reportes que entran por `addPublishedSampleReport`;
  - `findSampleReport(id)`;
  - `updateSampleReport(id, changes)`, con un mapa de reemplazos en memoria que `listReports` aplica sin modificar `SAMPLE_REPORTS`.

  Verificar con tests en `map-data.test.ts` que un reporte actualizado aparece con el nuevo `status` y `citizenVerification` en `listReports`, que `SAMPLE_REPORTS` no cambia y que solo los publicados figuran como del autor. Correr `node app/components/map/check-map-data.mjs`.

## 3. Fuente de confirmaciones

- [x] 3.1 Crear `app/components/reports/confirmation-source.ts` con `getMyConfirmation(reportId, options)` y `confirmReport(reportId, options)`:
  - devuelven `{ status, body }` con la forma de los endpoints;
  - validan cada respuesta exitosa con `validateMyConfirmation` o `validateConfirmationResult`;
  - aplican las reglas en orden: simulación, 404, autor, ya confirmado (200), nueva (201, con transición según el umbral del reporte);
  - los mensajes salen de `CONFIRMATION_CASES`;
  - simulan `UNAUTHENTICATED`, `REPORT_NOT_FOUND` e `INTERNAL_ERROR` solo en el POST;
  - tienen una demora configurable.

  Verificar con tests en `app/components/reports/confirmations.test.ts`:
  - 201 de 1 a 2 de 3, con la etapa en `pending`;
  - 201 de 2 a 3 de 3, que pasa a `citizen-verification`;
  - un umbral de 5 respetado;
  - 200 en la repetición, sin sumar;
  - GET con `reason: "author"` y POST 403 para un reporte publicado;
  - 404 para un id inexistente;
  - cada error simulado;
  - que toda respuesta exitosa pasa el validador del contrato.
- [x] 3.2 Sumar `confirmations.test.ts` al runner `app/components/reports/check-report-form.mjs`. Verificar que `node app/components/reports/check-report-form.mjs` corre los tests del formulario y los de confirmaciones, y que todos pasan.

## 4. Interfaz en el detalle

- [x] 4.1 Crear `app/components/reports/ConfirmationAction.tsx` con estos estados:
  - sin sesión: `LoginPrompt` con "Entrá con Google para confirmar" y `next=/mapa?reporte=<id>`;
  - cargando;
  - botón "Yo también lo vi";
  - enviando, con el botón deshabilitado y un `ref` contra el doble toque;
  - "Ya confirmaste este reporte";
  - "No podés confirmar tu propio reporte";
  - errores: el 401 muestra el login, el 403 y el 404 muestran el mensaje sin botón, y los 5xx, las respuestas inválidas o la red caída muestran el mensaje con "Reintentar".

  Verificar en el navegador cada estado, usando `?simular=` para los errores.
- [x] 4.2 Montar `ConfirmationAction` en `ReportDetail` debajo de la lista de datos, pasándole `signedIn` y `onConfirmed`. Verificar que el detalle se sigue viendo igual cuando no hay confirmación posible y que en el celular la sección no tapa el resto del detalle (se puede desplazar).
- [x] 4.3 En `ReportsMap`:
  - guardar `signedIn` (empieza en `null` y se resuelve con `hasSession()` al montarse);
  - aplicar `onConfirmed` reemplazando `status` y `citizenVerification` en `reports` y en `selected` con los valores de la respuesta.

  Verificar en el navegador que confirmar "Falta de luz en Plaza 25 de Mayo" (2 de 3) muestra 3 de 3 y "Verificación ciudadana" como etapa actual sin recargar, y que al cerrar y volver a abrir el detalle se ve "Ya confirmaste este reporte".
- [ ] 4.4 Leer `?reporte=<id>` en `ReportsMap` una sola vez, sacarlo de la dirección con `replaceState` y abrir ese reporte en la primera carga del área visible. Si no existe, ignorarlo. Verificar el login real desde el aviso del detalle, que la vuelta abre el mismo reporte con su elegibilidad, y que `?reporte=` con un id inexistente muestra el mapa sin detalle ni error.
- [x] 4.5 Documentar en `app/components/reports/README.md`:
  - la fuente de confirmaciones;
  - los valores de `?simular=` para confirmaciones, avisando que `UNAUTHENTICATED` afecta también a la publicación;
  - qué reemplazar para conectar los endpoints del PR #6.

  Verificar que el README nombra los archivos y funciones que existen.

## 5. Verificación integral

- [x] 5.1 Correr `npm.cmd run lint`, `npm.cmd exec -- tsc --noEmit --incremental false`, `npm.cmd run check:contracts`, `node app/components/map/check-map-data.mjs`, `node app/components/reports/check-report-form.mjs`, `npm.cmd run build`, `openspec.cmd validate add-report-confirmations --strict` y `git diff --check`. Verificar que todo pasa.
- [ ] 5.2 Probar en un celular real sobre la preview de Vercel:
  - sin sesión, el aviso de login y la vuelta al reporte;
  - confirmar un reporte a 2 de 3 y ver el cambio a "Verificación ciudadana";
  - el caso del autor con un reporte recién publicado.

  Verificar con la prueba de Fran, que queda registrada para el PR.
- [x] 5.3 Listar los archivos modificados y marcar los compartidos. Verificar con `git status` que no hay cambios en `lib/contracts/`, `package.json`, `app/layout.tsx`, `app/page.tsx`, `app/auth/`, `app/auth-buttons.tsx` ni `utils/supabase/`, ni en los archivos de Valen (`VisionAssist.tsx`, `vision-suggestion.ts`, `lib/vision/`).

## Workflow follow-up

- Commit, push y PR hacia `main` desde `feature/interface-map`, solo con autorización de Fran. El PR avisa a Agus que la interfaz consume `GET` y `POST /api/reports/{id}/confirmations` con la forma del contrato.
- Archivar el change después del merge.
- Change posterior: conectar `confirmation-source.ts` a los endpoints reales cuando se mergee el PR #6.
