-- Configura los buckets de originales privados y copias públicas saneadas.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'reports-originals',
    'reports-originals',
    false,
    4194304,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'reports-public',
    'reports-public',
    true,
    4194304,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
