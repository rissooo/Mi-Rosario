-- Crea reportes limitados a las etapas ciudadanas del MVP.

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  street VARCHAR(80) NOT NULL,
  street_number INTEGER NULL,
  storage_path TEXT NOT NULL,
  photo_public_path TEXT NOT NULL,
  photo_public_mime_type TEXT NOT NULL,
  photo_public_byte_size INTEGER NOT NULL,
  confirmation_count INTEGER NOT NULL DEFAULT 0,
  confirmation_threshold INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  corroborated_at TIMESTAMPTZ NULL,
  resolved_at TIMESTAMPTZ NULL,

  CONSTRAINT check_reports_title
    CHECK (char_length(trim(title)) BETWEEN 5 AND 120),
  CONSTRAINT check_reports_description
    CHECK (char_length(trim(description)) BETWEEN 10 AND 1000),
  CONSTRAINT check_reports_category
    CHECK (category_id IN ('pothole', 'missing-light', 'damaged-sidewalk', 'faulty-traffic-light')),
  CONSTRAINT check_reports_severity
    CHECK (severity IN ('low', 'medium', 'high')),
  CONSTRAINT check_reports_status
    CHECK (status IN ('pending', 'citizen-verification')),
  CONSTRAINT check_reports_latitude
    CHECK (latitude BETWEEN -90.0 AND 90.0),
  CONSTRAINT check_reports_longitude
    CHECK (longitude BETWEEN -180.0 AND 180.0),
  CONSTRAINT check_reports_street
    CHECK (
      char_length(street) BETWEEN 2 AND 80
      AND street !~ '^[[:space:]]|[[:space:]]$'
      AND char_length(btrim(street)) BETWEEN 2 AND 80
    ),
  CONSTRAINT check_reports_street_number
    CHECK (street_number IS NULL OR street_number BETWEEN 1 AND 99999),
  CONSTRAINT check_reports_photo_public_mime_type
    CHECK (photo_public_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT check_reports_photo_public_byte_size
    CHECK (photo_public_byte_size BETWEEN 1 AND 4194304),
  CONSTRAINT check_reports_confirmation_count
    CHECK (confirmation_count >= 0),
  CONSTRAINT check_reports_confirmation_threshold
    CHECK (confirmation_threshold > 0)
);

CREATE INDEX IF NOT EXISTS idx_reports_status_created
  ON public.reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_category_created
  ON public.reports (category_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_lat_lng
  ON public.reports (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_reports_cursor
  ON public.reports (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_reports_user_id
  ON public.reports (user_id);
CREATE INDEX IF NOT EXISTS idx_reports_user_created
  ON public.reports (user_id, created_at DESC);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read own reports" ON public.reports;
DROP POLICY IF EXISTS "Allow authenticated users to insert own reports" ON public.reports;
DROP POLICY IF EXISTS "Allow authenticated users to update own reports" ON public.reports;
DROP POLICY IF EXISTS "Allow authenticated users to delete own reports" ON public.reports;

REVOKE ALL PRIVILEGES ON TABLE public.reports FROM PUBLIC, anon, authenticated;
