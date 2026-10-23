-- Migration: 20261023000005_public_reports_view.sql
-- Description: Creates the secure public.public_reports view omitting private author identities
-- and granting SELECT to anon and authenticated.

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
  r.resolved_at,
  r.storage_path,
  r.mime_type,
  r.byte_size,
  COALESCE(c.confirmation_count, 0)::integer AS confirmation_count,
  public.get_confirmation_threshold()::integer AS threshold
FROM public.reports r
LEFT JOIN (
  SELECT report_id, count(*)::integer AS confirmation_count
  FROM public.report_confirmations
  GROUP BY report_id
) c ON c.report_id = r.id
WHERE r.status IN ('pending', 'citizen-verification', 'resolved');

-- Grant read access to both anonymous visitors and authenticated citizens
GRANT SELECT ON public.public_reports TO anon, authenticated;
