# Tasks

## 1. Callback de login (archivo protegido: aprobado por Fran)

- [x] 1.1 Presentar a Fran el pedido de modificación de `app/auth/callback/route.ts` (qué cambia, por qué, impacto en el login de todos y pruebas) y esperar su aprobación explícita. Verificar que la aprobación quede registrada en la conversación o en el PR.
- [x] 1.2 Leer `next` en el callback y redirigir solo a rutas internas (que empiecen con `/` y no con `//` ni `/\`); en cualquier otro caso, a `/`. Verificar en el navegador que el login sin `next` sigue yendo a `/`, que con `next=/mapa?reportar=1` vuelve al mapa con el reporte iniciado y que con `next=//ejemplo.com` va a `/`.

## 2. Piezas compartidas del módulo

- [x] 2.1 Mover `isInsideRosario(lat, lng)` a `app/components/map/rosario-boundary.ts` y usarlo en `map-data.test.ts`. Verificar con `node app/components/map/check-map-data.mjs`.
- [x] 2.2 Extraer `RosarioMask` (máscara y contorno) de `ReportsMap.tsx` a su propio componente sin cambiar el comportamiento. Verificar en el navegador que `/mapa` se ve igual.
- [x] 2.3 Agregar en `report-source.ts` la lista en memoria de reportes publicados en el modo de ejemplo e incluirla en `listReports`. Verificar con un test que un reporte agregado aparece en el área que lo contiene.

## 3. Lógica del formulario

- [x] 3.1 Crear `app/components/reports/photo.ts` con `fitWithin` (pura) y `preparePhoto(file)` (`createImageBitmap` + `canvas`, JPEG 0,85 con reintentos a 0,75 y 0,65, máximo 2560 px y 4 MiB). Verificar `fitWithin` con tests (más grande, más chica, vertical, cuadrada).
- [x] 3.2 Crear `app/components/reports/report-publisher.ts` con `publishReport` falso: validación del contrato (422), idempotencia en memoria (201, repetición 200, conflicto 409), demora simulada, errores simulados con `?simular=` y alta en la lista del mapa. Verificar con tests de cada caso y que el `Report` creado pasa `validateReport`.
- [x] 3.3 Crear la generación de la clave (UUID v4 con `randomUUID` o `getRandomValues`) y la tabla que asocia los `fieldErrors` a los campos. Verificar con tests el formato de la clave en los dos caminos y la asociación de rutas como `report.location.address.street`.
- [x] 3.4 Crear `report-form.test.ts` y `check-report-form.mjs` con los tests de 3.1 a 3.3. Verificar que `node app/components/reports/check-report-form.mjs` pasa.
- [x] 3.5 Crear `app/components/reports/report-draft.ts` con el reducer del borrador (con `point`) y `hasDraftData`, y sumar sus tests. Verificar que el borrador vacío no tiene datos, que con foto o título sí, y que "reset" deja la clave vacía.

## 4. Interfaz en el mapa

- [x] 4.1 Quitar la página `/reportar`: borrar `app/reportar/`, `ReportGate.tsx` y `LocationPicker.tsx`. Verificar que `/reportar` da 404 y que `npm.cmd run build` pasa.
- [x] 4.2 Agregar el modo de reporte a `ReportsMap` (`viewing | picking | filling`) con el botón "Reportar", la verificación de sesión en el navegador, `LoginPrompt` con `next=/mapa?reportar=1` y el inicio automático con `?reportar=1`. Verificar sin sesión que aparece el aviso de login y el mapa no entra en modo de reporte, y que en modo de reporte tocar un marcador no abre su detalle.
- [x] 4.3 Crear el paso de elegir el punto: pin fijo en el centro, "Usar mi ubicación", "Confirmar ubicación" (deshabilitado fuera de Rosario, con aviso) y "Cancelar", sin que los botones muevan el mapa. Verificar en el navegador mover el mapa, el GPS con y sin permiso, y un punto fuera de Rosario.
- [x] 4.4 Crear `ReportPanel` con el formulario controlado (foto, categoría, gravedad, título, descripción, calle, altura, "Sin altura"), "Ubicación elegida · Cambiar", el aviso de modo de ejemplo, "Cancelar" con confirmación si hay datos, y el punto visible fuera del panel. Verificar que "Cambiar" conserva lo cargado y que la confirmación aparece solo con datos.
- [x] 4.5 Conectar la publicación: validación con errores junto a cada campo, botón deshabilitado mientras publica, errores con "Reintentar" (misma clave), "¡Reporte publicado!" con el marcador nuevo en el mapa, "Ver el reporte" y "Reportar otro" (clave nueva). Verificar con `?simular=` cada error, el doble toque y que el marcador aparece sin recargar.
- [x] 4.6 Cambiar el botón de `app/mapa/page.tsx` por el de `ReportsMap` (quitar el link a `/reportar`). Verificar que "Reportar" no navega y que la dirección sigue siendo `/mapa`.

## 5. Verificación integral

- [x] 5.1 Correr `npm.cmd run lint`, `npm.cmd exec -- tsc --noEmit --incremental false`, `npm.cmd run check:contracts`, `node app/components/map/check-map-data.mjs`, `node app/components/reports/check-report-form.mjs`, `npm.cmd run build`, `openspec.cmd validate add-report-form --strict` y `git diff --check`. Verificar que todo pasa.
- [x] 5.2 Probar el flujo completo en un celular real: login, "Reportar", elegir el punto moviendo el mapa, foto con la cámara, categoría, gravedad, dirección, publicar y ver el marcador nuevo. Verificar dejando capturas para el PR.
- [x] 5.3 Listar los archivos modificados y marcar los compartidos (`app/auth/callback/route.ts`). Verificar con `git status` que no hay cambios en `lib/contracts/`, `package.json`, `app/layout.tsx`, `app/page.tsx`, `app/auth-buttons.tsx`, `proxy.ts` ni en `utils/supabase/`.

## Workflow follow-up

- Commit, push y PR hacia `main` desde `feature/interface-map`, solo con autorización de Fran. El PR pide a Agus y Valen que revisen el cambio del callback y que acuerden la foto achicada en el navegador.
- Changes posteriores: sugerencias de Gemini (cuando se mergee el PR #5) y publicación real con `POST /api/reports` (cuando se mergee el PR #6).
- Archivar el change cuando las tareas y la revisión estén completas.
