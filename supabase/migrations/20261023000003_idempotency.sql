-- Reserva idempotencia, publica reportes atómicamente y limita Storage al flujo activo.

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key UUID NOT NULL,
  operation TEXT NOT NULL DEFAULT 'publish_report',
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  report_id UUID NOT NULL DEFAULT gen_random_uuid(),
  locked_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '3 minutes'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT check_idempotency_operation CHECK (operation = 'publish_report'),
  CONSTRAINT check_idempotency_status CHECK (status IN ('in_progress', 'completed', 'failed')),
  CONSTRAINT check_idempotency_payload_hash CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT unique_user_id_idempotency_key UNIQUE (user_id, key),
  CONSTRAINT unique_idempotency_report_id UNIQUE (report_id)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at
  ON public.idempotency_keys (expires_at);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.idempotency_keys FROM PUBLIC, anon, authenticated;

-- Límites editables por migración/SQL Editor, sin lectura o escritura desde clientes.
CREATE TABLE IF NOT EXISTS public.report_backend_limits (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  max_in_progress_claims INTEGER NOT NULL DEFAULT 3 CHECK (max_in_progress_claims > 0),
  max_published_per_24h INTEGER NOT NULL DEFAULT 10 CHECK (max_published_per_24h > 0)
);

INSERT INTO public.report_backend_limits (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.report_backend_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.report_backend_limits FROM PUBLIC, anon, authenticated;

-- Elimina firmas anteriores que permitían parametrizar el bloqueo o completar fuera de la RPC.
DROP FUNCTION IF EXISTS public.claim_idempotency_key(UUID, TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.claim_idempotency_key(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.complete_idempotency_key(UUID, UUID);
DROP FUNCTION IF EXISTS public.fail_idempotency_key(UUID);

CREATE OR REPLACE FUNCTION public.claim_idempotency_key(
  p_key UUID,
  p_payload_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_id UUID;
  v_report_id UUID;
  v_existing_hash TEXT;
  v_existing_status TEXT;
  v_locked_until TIMESTAMPTZ;
  v_retry_after INTEGER;
  v_max_in_progress_claims INTEGER;
  v_max_published_per_24h INTEGER;
  v_active_claim_count INTEGER;
  v_published_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: se requiere una sesión ciudadana' USING ERRCODE = '28000';
  END IF;

  IF p_key IS NULL OR p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_INPUT' USING ERRCODE = '22023';
  END IF;

  -- Serializa todos los claims/publicaciones de la cuenta antes de contar cuotas.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  SELECT max_in_progress_claims, max_published_per_24h
  INTO v_max_in_progress_claims, v_max_published_per_24h
  FROM public.report_backend_limits
  WHERE id = 1
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPORT_LIMIT_CONFIGURATION_MISSING' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.idempotency_keys (
    user_id, key, operation, payload_hash, status, report_id, locked_until, expires_at
  )
  VALUES (
    v_user_id,
    p_key,
    'publish_report',
    p_payload_hash,
    'in_progress',
    gen_random_uuid(),
    pg_catalog.clock_timestamp() + interval '3 minutes',
    now() + interval '24 hours'
  )
  ON CONFLICT (user_id, key) DO NOTHING
  RETURNING id, report_id INTO v_id, v_report_id;

  IF v_id IS NOT NULL THEN
    SELECT count(*)::integer
    INTO v_active_claim_count
    FROM public.idempotency_keys
    WHERE user_id = v_user_id
      AND status = 'in_progress'
      AND locked_until > pg_catalog.clock_timestamp();

    IF v_active_claim_count > v_max_in_progress_claims THEN
      SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (min(locked_until) - pg_catalog.clock_timestamp())))::integer)
      INTO v_retry_after
      FROM public.idempotency_keys
      WHERE user_id = v_user_id
        AND status = 'in_progress'
        AND locked_until > pg_catalog.clock_timestamp()
        AND id <> v_id;

      DELETE FROM public.idempotency_keys WHERE id = v_id;
      RETURN jsonb_build_object(
        'action', 'LIMIT_REACHED',
        'status', 'in_progress',
        'code', 'PUBLICATION_IN_PROGRESS',
        'quota', 'active_claims',
        'retryAfter', v_retry_after
      );
    END IF;

    SELECT count(*)::integer
    INTO v_published_count
    FROM public.reports
    WHERE user_id = v_user_id
      AND created_at >= pg_catalog.clock_timestamp() - interval '24 hours';

    IF v_published_count >= v_max_published_per_24h THEN
      SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (min(created_at) + interval '24 hours' - pg_catalog.clock_timestamp())))::integer)
      INTO v_retry_after
      FROM public.reports
      WHERE user_id = v_user_id
        AND created_at >= pg_catalog.clock_timestamp() - interval '24 hours';

      DELETE FROM public.idempotency_keys WHERE id = v_id;
      RETURN jsonb_build_object(
        'action', 'LIMIT_REACHED',
        'status', 'in_progress',
        'code', 'PUBLICATION_IN_PROGRESS',
        'quota', 'published_24h',
        'retryAfter', v_retry_after
      );
    END IF;

    RETURN jsonb_build_object(
      'action', 'CLAIMED',
      'status', 'in_progress',
      'reportId', v_report_id
    );
  END IF;

  SELECT id, report_id, payload_hash, status, locked_until
  INTO v_id, v_report_id, v_existing_hash, v_existing_status, v_locked_until
  FROM public.idempotency_keys
  WHERE user_id = v_user_id AND key = p_key
  FOR UPDATE;

  IF v_existing_hash <> p_payload_hash THEN
    RETURN jsonb_build_object(
      'action', 'CONFLICT',
      'status', v_existing_status,
      'code', 'IDEMPOTENCY_CONFLICT'
    );
  END IF;

  IF v_existing_status = 'completed' THEN
    RETURN jsonb_build_object(
      'action', 'COMPLETED',
      'status', 'completed',
      'reportId', v_report_id
    );
  END IF;

  IF v_existing_status = 'in_progress' AND v_locked_until > pg_catalog.clock_timestamp() THEN
    v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_locked_until - pg_catalog.clock_timestamp())))::integer);
    RETURN jsonb_build_object(
      'action', 'IN_PROGRESS',
      'status', 'in_progress',
      'code', 'PUBLICATION_IN_PROGRESS',
      'retryAfter', v_retry_after,
      'reportId', v_report_id
    );
  END IF;

  SELECT count(*)::integer
  INTO v_active_claim_count
  FROM public.idempotency_keys
  WHERE user_id = v_user_id
    AND status = 'in_progress'
    AND locked_until > pg_catalog.clock_timestamp()
    AND id <> v_id;

  IF v_active_claim_count >= v_max_in_progress_claims THEN
    SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (min(locked_until) - pg_catalog.clock_timestamp())))::integer)
    INTO v_retry_after
    FROM public.idempotency_keys
    WHERE user_id = v_user_id
      AND status = 'in_progress'
      AND locked_until > pg_catalog.clock_timestamp()
      AND id <> v_id;

    RETURN jsonb_build_object(
      'action', 'LIMIT_REACHED',
      'status', 'in_progress',
      'code', 'PUBLICATION_IN_PROGRESS',
      'quota', 'active_claims',
      'retryAfter', v_retry_after
    );
  END IF;

  SELECT count(*)::integer
  INTO v_published_count
  FROM public.reports
  WHERE user_id = v_user_id
    AND created_at >= pg_catalog.clock_timestamp() - interval '24 hours';

  IF v_published_count >= v_max_published_per_24h THEN
    SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (min(created_at) + interval '24 hours' - pg_catalog.clock_timestamp())))::integer)
    INTO v_retry_after
    FROM public.reports
    WHERE user_id = v_user_id
      AND created_at >= pg_catalog.clock_timestamp() - interval '24 hours';

    RETURN jsonb_build_object(
      'action', 'LIMIT_REACHED',
      'status', 'in_progress',
      'code', 'PUBLICATION_IN_PROGRESS',
      'quota', 'published_24h',
      'retryAfter', v_retry_after
    );
  END IF;

  UPDATE public.idempotency_keys
  SET status = 'in_progress',
      locked_until = pg_catalog.clock_timestamp() + interval '3 minutes',
      updated_at = now()
  WHERE id = v_id;

  RETURN jsonb_build_object(
    'action', 'CLAIMED',
    'status', 'in_progress',
    'reportId', v_report_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_report(
  p_key UUID,
  p_payload_hash TEXT,
  p_title TEXT,
  p_description TEXT,
  p_category_id TEXT,
  p_severity TEXT,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_street TEXT,
  p_street_number INTEGER,
  p_storage_path TEXT,
  p_photo_public_path TEXT,
  p_photo_public_mime_type TEXT,
  p_photo_public_byte_size INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_report_id UUID;
  v_key_status TEXT;
  v_key_hash TEXT;
  v_locked_until TIMESTAMPTZ;
  v_report_owner UUID;
  v_original_extensions TEXT;
  v_public_extension TEXT;
  v_max_published_per_24h INTEGER;
  v_published_count INTEGER;
  v_retry_after INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: se requiere una sesión ciudadana' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  SELECT report_id, status, payload_hash, locked_until
  INTO v_report_id, v_key_status, v_key_hash, v_locked_until
  FROM public.idempotency_keys
  WHERE user_id = v_user_id AND key = p_key
  FOR UPDATE;

  IF v_report_id IS NULL THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF p_payload_hash IS NULL OR v_key_hash <> p_payload_hash THEN
    RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCY_CONFLICT');
  END IF;

  SELECT user_id INTO v_report_owner
  FROM public.reports
  WHERE id = v_report_id;

  IF FOUND THEN
    IF v_report_owner <> v_user_id THEN
      RAISE EXCEPTION 'REPORT_ID_OWNERSHIP_CONFLICT' USING ERRCODE = '23505';
    END IF;

    UPDATE public.idempotency_keys
    SET status = 'completed', updated_at = now()
    WHERE user_id = v_user_id AND key = p_key;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'COMPLETED',
      'reportId', v_report_id
    );
  END IF;

  IF v_key_status <> 'in_progress' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_NOT_IN_PROGRESS' USING ERRCODE = '55000';
  END IF;

  IF v_locked_until <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'IDEMPOTENCY_LOCK_EXPIRED' USING ERRCODE = '55000';
  END IF;

  SELECT max_published_per_24h
  INTO v_max_published_per_24h
  FROM public.report_backend_limits
  WHERE id = 1
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPORT_LIMIT_CONFIGURATION_MISSING' USING ERRCODE = '55000';
  END IF;

  SELECT count(*)::integer,
         GREATEST(1, CEIL(EXTRACT(EPOCH FROM (min(created_at) + interval '24 hours' - pg_catalog.clock_timestamp())))::integer)
  INTO v_published_count, v_retry_after
  FROM public.reports
  WHERE user_id = v_user_id
    AND created_at >= pg_catalog.clock_timestamp() - interval '24 hours';

  IF v_published_count >= v_max_published_per_24h THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PUBLICATION_IN_PROGRESS',
      'quota', 'published_24h',
      'retryAfter', v_retry_after
    );
  END IF;

  v_original_extensions := CASE p_photo_public_mime_type
    WHEN 'image/jpeg' THEN '(jpg|jpeg)'
    WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp'
    ELSE NULL
  END;
  v_public_extension := CASE p_photo_public_mime_type
    WHEN 'image/jpeg' THEN 'jpg'
    WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp'
    ELSE NULL
  END;

  IF v_original_extensions IS NULL
     OR p_storage_path !~ (
       '^' || v_user_id::text || '/' || v_report_id::text || '/original[.]' || v_original_extensions || '$'
     )
     OR p_photo_public_path <> (v_report_id::text || '.' || v_public_extension) THEN
    RAISE EXCEPTION 'REPORT_PHOTO_PATH_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'reports-originals' AND name = p_storage_path
      AND metadata->>'mimetype' = p_photo_public_mime_type
      AND CASE
        WHEN metadata->>'size' ~ '^[0-9]+$'
          THEN (metadata->>'size')::numeric BETWEEN 1 AND 4194304
        ELSE false
      END
  ) OR NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'reports-public' AND name = p_photo_public_path
      AND metadata->>'mimetype' = p_photo_public_mime_type
      AND CASE
        WHEN metadata->>'size' ~ '^[0-9]+$'
          THEN (metadata->>'size')::numeric = p_photo_public_byte_size
            AND (metadata->>'size')::numeric BETWEEN 1 AND 4194304
        ELSE false
      END
  ) THEN
    RAISE EXCEPTION 'REPORT_PHOTO_OBJECT_MISSING_OR_METADATA_MISMATCH' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.reports (
    id,
    user_id,
    title,
    description,
    category_id,
    severity,
    status,
    latitude,
    longitude,
    street,
    street_number,
    storage_path,
    photo_public_path,
    photo_public_mime_type,
    photo_public_byte_size
  )
  VALUES (
    v_report_id,
    v_user_id,
    p_title,
    p_description,
    p_category_id,
    p_severity,
    'pending',
    p_latitude,
    p_longitude,
    p_street,
    p_street_number,
    p_storage_path,
    p_photo_public_path,
    p_photo_public_mime_type,
    p_photo_public_byte_size
  );

  UPDATE public.idempotency_keys
  SET status = 'completed', updated_at = now()
  WHERE user_id = v_user_id AND key = p_key;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'CREATED',
    'reportId', v_report_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_idempotency_key(
  p_key UUID,
  p_report_id UUID,
  p_payload_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_stored_report_id UUID;
  v_status TEXT;
  v_stored_hash TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: se requiere una sesión ciudadana' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  SELECT report_id, status, payload_hash
  INTO v_stored_report_id, v_status, v_stored_hash
  FROM public.idempotency_keys
  WHERE user_id = v_user_id AND key = p_key
  FOR UPDATE;

  IF p_key IS NULL
     OR p_report_id IS NULL
     OR p_payload_hash IS NULL
     OR v_stored_report_id IS NULL
     OR v_stored_report_id <> p_report_id
     OR v_stored_hash <> p_payload_hash THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CLAIM_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.reports WHERE id = p_report_id AND user_id = v_user_id) THEN
    RETURN jsonb_build_object('action', 'ALREADY_PUBLISHED', 'reportId', p_report_id);
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_NOT_IN_PROGRESS' USING ERRCODE = '55000';
  END IF;

  UPDATE public.idempotency_keys
  SET status = 'failed', locked_until = now(), updated_at = now()
  WHERE user_id = v_user_id AND key = p_key;

  RETURN jsonb_build_object('action', 'FAILED', 'reportId', p_report_id);
END;
$$;

-- Helpers de políticas: validan que cada objeto corresponda a un claim propio activo.
CREATE OR REPLACE FUNCTION public.can_upload_report_object(
  p_bucket_id TEXT,
  p_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_report_id TEXT;
  v_extension TEXT;
  v_parts TEXT[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_bucket_id = 'reports-originals' THEN
    v_parts := storage.foldername(p_name);
    IF array_length(v_parts, 1) <> 2
       OR v_parts[1] <> v_user_id::text
       OR split_part(p_name, '/', 3) NOT IN (
         'original.jpg', 'original.jpeg', 'original.png', 'original.webp'
       ) THEN
      RETURN false;
    END IF;
    v_report_id := v_parts[2];
  ELSIF p_bucket_id = 'reports-public' THEN
    IF position('/' IN p_name) > 0 OR array_length(string_to_array(p_name, '.'), 1) <> 2 THEN
      RETURN false;
    END IF;
    v_report_id := split_part(p_name, '.', 1);
    v_extension := lower(split_part(p_name, '.', 2));
    IF v_extension NOT IN ('jpg', 'jpeg', 'png', 'webp') THEN
      RETURN false;
    END IF;
  ELSE
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.idempotency_keys k
    WHERE k.user_id = v_user_id
      AND k.report_id::text = v_report_id
      AND k.status = 'in_progress'
      AND k.locked_until > pg_catalog.clock_timestamp()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_delete_unpublished_report_object(
  p_bucket_id TEXT,
  p_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_report_id TEXT;
  v_parts TEXT[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_bucket_id = 'reports-originals' THEN
    v_parts := storage.foldername(p_name);
    IF array_length(v_parts, 1) <> 2
       OR v_parts[1] <> v_user_id::text
       OR split_part(p_name, '/', 3) NOT IN (
         'original.jpg', 'original.jpeg', 'original.png', 'original.webp'
       ) THEN
      RETURN false;
    END IF;
    v_report_id := v_parts[2];
  ELSIF p_bucket_id = 'reports-public' THEN
    IF position('/' IN p_name) > 0 OR array_length(string_to_array(p_name, '.'), 1) <> 2 THEN
      RETURN false;
    END IF;
    v_report_id := split_part(p_name, '.', 1);
    IF lower(split_part(p_name, '.', 2)) NOT IN ('jpg', 'jpeg', 'png', 'webp') THEN
      RETURN false;
    END IF;
  ELSE
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.idempotency_keys k
    WHERE k.user_id = v_user_id
      AND k.report_id::text = v_report_id
      AND k.status = 'in_progress'
      AND k.locked_until > pg_catalog.clock_timestamp()
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.reports r
    WHERE r.id::text = v_report_id AND r.user_id = v_user_id
  );
END;
$$;

DROP POLICY IF EXISTS "Allow authenticated user upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow user delete own pending upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload for active report claim" ON storage.objects;
DROP POLICY IF EXISTS "Allow read for active report claim upsert" ON storage.objects;
DROP POLICY IF EXISTS "Allow update for active report claim upsert" ON storage.objects;
DROP POLICY IF EXISTS "Allow delete of unpublished report photos" ON storage.objects;

CREATE POLICY "Allow authenticated upload for active report claim"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('reports-originals', 'reports-public')
  AND (SELECT public.can_upload_report_object(bucket_id, name))
);

-- Storage necesita SELECT y UPDATE, además de INSERT, para reemplazar con upsert.
-- Las políticas se limitan al mismo usuario y a su claim in_progress.
CREATE POLICY "Allow read for active report claim upsert"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('reports-originals', 'reports-public')
  AND (SELECT public.can_upload_report_object(bucket_id, name))
);

CREATE POLICY "Allow update for active report claim upsert"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('reports-originals', 'reports-public')
  AND (SELECT public.can_upload_report_object(bucket_id, name))
)
WITH CHECK (
  bucket_id IN ('reports-originals', 'reports-public')
  AND (SELECT public.can_upload_report_object(bucket_id, name))
);

CREATE POLICY "Allow delete of unpublished report photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('reports-originals', 'reports-public')
  AND (SELECT public.can_delete_unpublished_report_object(bucket_id, name))
);

REVOKE ALL PRIVILEGES ON FUNCTION public.claim_idempotency_key(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_idempotency_key(UUID, TEXT) TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.publish_report(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, INTEGER, TEXT, TEXT, TEXT, INTEGER
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_report(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, INTEGER, TEXT, TEXT, TEXT, INTEGER
) TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.fail_idempotency_key(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fail_idempotency_key(UUID, UUID, TEXT) TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.can_upload_report_object(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_report_object(TEXT, TEXT) TO authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.can_delete_unpublished_report_object(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_unpublished_report_object(TEXT, TEXT) TO authenticated;
