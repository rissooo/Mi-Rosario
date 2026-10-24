-- Ejecuta public_reports con los permisos de quien consulta (security_invoker).
-- El Security Advisor marca como ERROR las vistas SECURITY DEFINER porque saltean RLS.
-- En lugar de eso, los clientes reciben SELECT solo sobre las columnas públicas de
-- reports y una policy que limita las filas a las etapas del MVP. user_id, storage_path
-- y resolved_at siguen sin permiso: pedirlas, o pedir "*", devuelve un error de permisos.

GRANT SELECT (
  id,
  title,
  description,
  category_id,
  severity,
  status,
  latitude,
  longitude,
  street,
  street_number,
  created_at,
  updated_at,
  corroborated_at,
  photo_public_path,
  photo_public_mime_type,
  photo_public_byte_size,
  confirmation_count,
  confirmation_threshold
) ON TABLE public.reports TO anon, authenticated;

DROP POLICY IF EXISTS "Lectura pública de reportes del MVP" ON public.reports;
CREATE POLICY "Lectura pública de reportes del MVP"
ON public.reports FOR SELECT TO anon, authenticated
USING (status IN ('pending', 'citizen-verification'));

ALTER VIEW public.public_reports SET (security_invoker = true);
