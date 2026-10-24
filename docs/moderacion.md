# Moderación de reportes

La app todavía no tiene una pantalla de moderación. Para sacar un reporte inapropiado (fotos de personas o patentes, insultos, contenido que no es un problema urbano) se borra desde esta compu con la clave secreta.

## Borrar un reporte

1. Conseguí el id del reporte: abrí su detalle en el mapa y copialo de la dirección (`/mapa?reporte=<id>`), o buscalo en Supabase → Table Editor → `reports`.
2. Revisá qué se va a borrar (no borra nada):
   ```
   node scripts/moderation/delete-report.mjs <id>
   ```
   Muestra el proyecto, el título, la dirección, la fecha y las confirmaciones. **Confirmá que el proyecto sea el correcto** (`.env.local` apunta a producción).
3. Borralo:
   ```
   node scripts/moderation/delete-report.mjs <id> --confirmar
   ```
   Borra la copia pública, la foto original y la fila (las confirmaciones se borran en cascada).

Requiere Node 22 o más y `SUPABASE_SECRET_KEY` en `.env.local`. Nunca compartas esa clave.

## Sin la compu

Desde el panel de Supabase de producción:

1. Storage → `reports-public` → borrá `<id>.jpg` (o `.png`/`.webp`).
2. Storage → `reports-originals` → carpeta de la cuenta autora → `<id>` → borrá `original.*`.
3. SQL Editor: `delete from public.reports where id = '<id>';`

## Pendiente

- Un estado "oculto" y una pantalla de moderación (D7 del backend, fuera del MVP).
- Limpieza periódica de fotos huérfanas de publicaciones que fallaron (D6).
