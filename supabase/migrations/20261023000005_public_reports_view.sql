-- Proyecta solo campos públicos de las etapas ciudadanas del MVP.

REVOKE ALL PRIVILEGES ON TABLE public.reports FROM PUBLIC, anon, authenticated;

-- Las fechas salen como texto UTC con milisegundos y "Z", el formato que exige el
-- contrato. PostgREST serializaría un timestamptz con microsegundos y "+00:00".
-- El cursor ordena y compara sobre estas mismas columnas: al tener ancho fijo, el
-- orden del texto coincide con el cronológico y todas las páginas usan la misma
-- precisión.
CREATE OR REPLACE VIEW public.public_reports
WITH (security_invoker = false) AS
SELECT
  r.id,
  r.title,
  r.description,
  r.category_id,
  r.severity,
  r.status,
  r.latitude,
  r.longitude,
  r.street,
  r.street_number,
  pg_catalog.to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
  pg_catalog.to_char(r.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
  pg_catalog.to_char(r.corroborated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS corroborated_at,
  r.photo_public_path,
  r.photo_public_mime_type,
  r.photo_public_byte_size,
  r.confirmation_count,
  r.confirmation_threshold
FROM public.reports AS r
WHERE r.status IN ('pending', 'citizen-verification');

REVOKE ALL PRIVILEGES ON TABLE public.public_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_reports TO anon, authenticated;
