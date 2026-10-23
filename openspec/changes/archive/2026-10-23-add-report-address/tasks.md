# Tasks

## 1. Contrato compartido (archivos protegidos, aprobados por Fran)

- [x] 1.1 Agregar `Address = { street: string; number: number | null }` y `address` a `Location` en `lib/contracts/reports.ts`, junto con las constantes de límites. Verificar con `tsc` que todos los usos de `Location` compilan o fallan donde corresponde.
- [x] 1.2 Validar `address` en `location()` de `lib/contracts/validation.ts` (claves estrictas, calle de 2 a 80 caracteres sin espacios sobrantes, altura entera de 1 a 99999 o `null`) y devolver la ubicación normalizada en `reportFields`. Verificar con los tests de 1.4.
- [x] 1.3 Agregar una dirección a `REPORT_FIELDS_FIXTURES` en `lib/contracts/fixtures.ts`. Verificar que los fixtures existentes siguen validando.
- [x] 1.4 Sumar casos en `tests/contracts.test.ts`: dirección válida, sin altura, espacios sobrantes normalizados, dirección faltante en publicación y en reporte, calle y altura inválidas y campos desconocidos. Ajustar los tests de coordenadas para que incluyan una dirección válida. Verificar con `npm.cmd run check:contracts`.
- [x] 1.5 Documentar `address` y sus límites en `docs/contracts.md`. Verificar que el texto coincide con los límites del código.

## 2. Mapa (módulo de Fran)

- [x] 2.1 Agregar direcciones reales de Rosario a los 12 reportes de `app/components/map/sample-reports.ts` (al menos uno sin altura). Verificar con `node app/components/map/check-map-data.mjs`.
- [x] 2.2 Mostrar "Calle altura" o "Calle (sin altura)" en lugar de las coordenadas en `app/components/reports/ReportDetail.tsx`, y actualizar la spec de `add-reports-read-map`. Verificar en el navegador con un reporte con altura y otro sin altura.

## 3. Verificación

- [x] 3.1 Correr `npm.cmd run lint`, `npm.cmd exec -- tsc --noEmit --incremental false`, `npm.cmd run check:contracts`, `node app/components/map/check-map-data.mjs`, `npm.cmd run build` y `openspec.cmd validate add-report-address --strict`. Verificar que todo pasa y listar los archivos compartidos modificados.

## Workflow follow-up

- Agus y Valen revisan el cambio de contrato antes del merge. Flequi reconcilia `establish-team-architecture` (diseño y spec de `citizen-reports`).
- Commit y PR hacia `feature/interface-map` solo con autorización de Fran.
