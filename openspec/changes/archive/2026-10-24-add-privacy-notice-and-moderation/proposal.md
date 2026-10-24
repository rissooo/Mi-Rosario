# Proposal

## Why

La app ya está abierta con datos reales y la IA usa OpenAI. Quien publica tiene que saber qué queda público y adónde va su foto, y el equipo necesita una forma segura de sacar un reporte inapropiado.

## What Changes

- Aviso corto en el formulario, antes de "Publicar": qué queda visible (foto, texto y punto), que la foto pública va sin datos del celular, que la original queda privada y que la ayuda de la IA envía la foto a OpenAI.
- `scripts/moderation/delete-report.mjs`: borra un reporte (fila, confirmaciones, copia pública y original) con la clave secreta, con vista previa obligatoria y `--confirmar`.
- `docs/moderacion.md`: cómo moderar desde la compu o desde el panel de Supabase.

Fuera de alcance: estado "oculto" y pantalla de moderación.

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
- `report-form`: aviso de privacidad antes de publicar.

## Impact

- Código: `app/components/reports/ReportPanel.tsx` y un script nuevo. Sin cambios en contratos, backend, migraciones ni dependencias.
