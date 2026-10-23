-- Migration: 20261023000002_reports_table.sql
-- Description: Creates the public.reports table, constraints, indexes, and RLS policies.

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
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  corroborated_at TIMESTAMPTZ NULL,
  resolved_at TIMESTAMPTZ NULL,

  -- Strict constraints aligned with contracts
  CONSTRAINT check_reports_title CHECK (char_length(trim(title)) BETWEEN 5 AND 120),
  CONSTRAINT check_reports_description CHECK (char_length(trim(description)) BETWEEN 10 AND 1000),
  CONSTRAINT check_reports_category CHECK (category_id IN ('pothole', 'missing-light', 'damaged-sidewalk', 'faulty-traffic-light')),
  CONSTRAINT check_reports_severity CHECK (severity IN ('low', 'medium', 'high')),
  CONSTRAINT check_reports_status CHECK (status IN ('pending', 'citizen-verification', 'municipal-verification', 'resolved')),
  CONSTRAINT check_reports_latitude CHECK (latitude >= -90.0 AND latitude <= 90.0),
  CONSTRAINT check_reports_longitude CHECK (longitude >= -180.0 AND longitude <= 180.0),
  CONSTRAINT check_reports_street CHECK (char_length(trim(street)) BETWEEN 2 AND 80),
  CONSTRAINT check_reports_street_number CHECK (street_number IS NULL OR (street_number >= 1 AND street_number <= 99999)),
  CONSTRAINT check_reports_mime_type CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT check_reports_byte_size CHECK (byte_size > 0 AND byte_size <= 4194304)
);

-- Performance and spatial query indexes
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON public.reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_category_created ON public.reports (category_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_lat_lng ON public.reports (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_reports_cursor ON public.reports (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.reports (user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Disallow all direct client mutations; writes occur strictly via secure server routes / RPC
-- Revoke direct table SELECT from anon (public reads must use public_reports view)
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.reports FROM anon;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow authenticated users to read own reports" ON public.reports;

-- Authenticated users may read their own submitted reports
CREATE POLICY "Allow authenticated users to read own reports"
ON public.reports FOR SELECT TO authenticated
USING (auth.uid() = user_id);
