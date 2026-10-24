# Tasks

## 1. Fuentes reales

- [x] 1.1 Agregar `usingSampleData()` y conectar `report-source.ts` a `GET /api/reports` con `no-store`, validando la lista y lanzando `ReportSourceError` con el error del servidor. Verificar con tests de la fuente real con `fetch` simulado.
- [x] 1.2 Conectar `report-publisher.ts` a `POST /api/reports` multipart con `Idempotency-Key`, validando el reporte y respetando los errores del contrato (incluido 429 `RATE_LIMITED`). Verificar con tests de la fuente real con `fetch` simulado.
- [x] 1.3 Conectar `confirmation-source.ts` a `GET .../confirmations/me` y `POST .../confirmations` con `no-store`. Verificar con tests de la fuente real con `fetch` simulado.

## 2. Modo de ejemplo

- [x] 2.1 Dejar el modo de ejemplo detrás de `NEXT_PUBLIC_REPORTS_SAMPLE_MODE=1`: aviso, `?simular=` y fuentes en memoria solo en ese modo. Verificar que los tests existentes del modo de ejemplo siguen pasando.
- [x] 2.2 Actualizar `app/components/reports/README.md` con cómo se usa cada modo.

## 3. Verificación integral

- [x] 3.1 Correr `npm run lint`, `npx tsc --noEmit --incremental false`, `npm run check:contracts`, `node app/components/map/check-map-data.mjs`, `node app/components/reports/check-report-form.mjs`, `node scripts/check-reports.mjs`, `npm run build`, `openspec validate connect-reports-backend --strict` y `git diff --check`.
- [ ] 3.2 Probar en el navegador con `next dev` contra el backend: el mapa carga reportes reales, publicar con foto muestra el reporte con su foto, y el detalle muestra la confirmación según el servidor. Parcial (24/10/2026): con `next dev` (Node 23) contra producción, `GET /api/reports` respondió 200 con la lista vacía y `/mapa` cargó sin el aviso de ejemplo; publicar y confirmar requieren una sesión de Google y quedan para la prueba de Fran.
- [ ] 3.3 Probar en un celular real sobre la preview: publicar con foto, verlo en el mapa con su foto y confirmar desde otra cuenta. Verificar con la prueba de Fran.
