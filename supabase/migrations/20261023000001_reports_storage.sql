-- Migration: 20261023000001_reports_storage.sql
-- Description: Configures private storage bucket 'reports-originals' with 4 MiB limit and MIME type restrictions,
-- and RLS policies for authenticated author uploads and compensation deletion.

-- 1. Create or configure private storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reports-originals',
  'reports-originals',
  false,
  4194304, -- 4 MiB (4 * 1024 * 1024 bytes)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 4194304,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 2. Storage object policies for reports-originals bucket
-- Drop existing policies if they exist to allow idempotent reruns
DROP POLICY IF EXISTS "Allow authenticated user upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow user delete own pending upload" ON storage.objects;

-- Policy: Authenticated users can upload only into their own folder (${user_id}/...)
CREATE POLICY "Allow authenticated user upload to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'reports-originals' AND
  (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Policy: Authenticated users can delete only their own uploaded files for compensation
CREATE POLICY "Allow user delete own pending upload"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'reports-originals' AND
  (storage.foldername(name))[1] = (select auth.uid())::text
);
