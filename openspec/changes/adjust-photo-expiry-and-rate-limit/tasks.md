# Tasks

## 1. Contrato: `Photo.expiresAt` puede ser null

- [x] 1.1 En `lib/contracts/reports.ts`, cambiar `Photo.expiresAt` a `IsoDateTime | null` con un comentario que diga que `null` es una URL que no vence; en `validation.ts`, validar la fecha solo si no es `null` y mantener la clave obligatoria. Verificar con `npx tsc --noEmit --incremental false`.
- [x] 1.2 En `lib/contracts/fixtures.ts`, poner `expiresAt: null` en `REPORT_FIXTURES`. En `tests/contracts.test.ts`, agregar un test: `null` y una fecha UTC válida pasan `validatePhoto` y `validateReport`; la clave ausente, `""`, `"2026-02-30T00:00:00.000Z"`, un número y `undefined` fallan con error en `photo.expiresAt`. Verificar con `npm run check:contracts`.
- [x] 1.3 Actualizar la sección de `Photo` en `docs/contracts.md` (`expiresAt` nullable, URL pública de `reports-public` sin vencimiento, fecha reservada para URLs firmadas, nota sobre borrar el objeto para retirar una foto pública). Verificar releyendo la sección y con `git diff --check`.

## 2. Contrato: código `RATE_LIMITED`

- [x] 2.1 En `lib/contracts/errors.ts`, agregar `RATE_LIMITED: 429`. En `fixtures.ts`, agregar a `PUBLICATION_CASES` el caso "cuota de la cuenta alcanzada" (429, mensaje en español). Verificar que el test de casos de publicación siga validando sobre y status con `npm run check:contracts`.
- [x] 2.2 En `tests/contracts.test.ts`, verificar que `ERROR_STATUS.RATE_LIMITED === 429`, que `validateApiError` acepta `RATE_LIMITED` y que el caso de cuota es distinto del de PUBLICATION_IN_PROGRESS (otro código, otro status, otro mensaje). Verificar con `npm run check:contracts`.
- [x] 2.3 En `docs/contracts.md`, actualizar la tabla de casos de publicación: 409 PUBLICATION_IN_PROGRESS solo para la misma clave en curso y una fila nueva 429 RATE_LIMITED con `Retry-After` en segundos para las cuotas por cuenta (3 en curso, 10 cada 24 h, configurables en el backend). Mencionar que visión sigue con 503 ANALYSIS_UNAVAILABLE. Verificar releyendo y con `git diff --check`.

## 3. Frontend

- [x] 3.1 En `app/components/reports/ReportDetail.tsx`, considerar vencida la foto solo si `expiresAt !== null` y la fecha ya pasó, y actualizar el comentario sobre las URLs. Verificar con `npx tsc --noEmit --incremental false` y `npm run lint`.
- [x] 3.2 En `app/components/reports/report-publisher.ts`, usar `expiresAt: null` en la foto simulada y agregar `RATE_LIMITED` a `SIMULATED_FAILURES`, con el mensaje de `PUBLICATION_CASES`. En `report-form.test.ts`, sumar `["RATE_LIMITED", 429]` al test de errores simulados y comprobar que el mensaje difiere del de PUBLICATION_IN_PROGRESS. Verificar con `node app/components/reports/check-report-form.mjs`.
- [ ] 3.3 Prueba en celular (360 px) en `/mapa`: abrir el detalle de un reporte de ejemplo y ver la foto o "Foto no disponible" sin errores en la consola; publicar con `?reportar=1&simular=RATE_LIMITED` y ver el mensaje del límite con el borrador y la foto conservados.

## 4. Verificación integral

- [x] 4.1 Correr `npm run check:contracts`, `npm run lint`, `npx tsc --noEmit --incremental false`, `openspec validate adjust-photo-expiry-and-rate-limit --strict` y `git diff --check`; las cinco tienen que pasar sin errores.
- [ ] 4.2 Pasarle al backend (PR #6) la lista de ajustes de design.md (decisión 4) y registrar la revisión de quienes proveen y consumen el contrato. Este change no modifica `feature/reports-backend`.

## Workflow follow-up

- Commit, push y PR solo con autorización de Fran, como rissooo.
- Reconciliar aparte el texto de `establish-team-architecture` (spec `citizen-reports` y design) con `expiresAt` nullable.
- Archivar después de la revisión y de que el backend adopte el contrato.
