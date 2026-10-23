-- Proyecta solo campos públicos de las etapas ciudadanas del MVP.

REVOKE ALL PRIVILEGES ON TABLE public.reports FROM PUBLIC, anon, authenticated;

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
  r.created_at,
  r.updated_at,
  r.corroborated_at,
  r.photo_public_path,
  r.photo_public_mime_type,
  r.photo_public_byte_size,
  r.confirmation_count,
  r.confirmation_threshold
FROM public.reports AS r
WHERE r.status IN ('pending', 'citizen-verification');

REVOKE ALL PRIVILEGES ON TABLE public.public_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_reports TO anon, authenticated;
