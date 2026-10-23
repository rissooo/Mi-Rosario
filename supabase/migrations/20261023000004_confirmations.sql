-- Registra confirmaciones únicas y transiciona bajo lock del reporte.

CREATE TABLE IF NOT EXISTS public.report_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_report_user_confirmation UNIQUE (report_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_confirmations_report_id
  ON public.report_confirmations (report_id);
CREATE INDEX IF NOT EXISTS idx_confirmations_user_id
  ON public.report_confirmations (user_id);

ALTER TABLE public.report_confirmations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow users to read own confirmations" ON public.report_confirmations;
DROP POLICY IF EXISTS "Allow users to insert own confirmations" ON public.report_confirmations;
DROP POLICY IF EXISTS "Allow users to update own confirmations" ON public.report_confirmations;
DROP POLICY IF EXISTS "Allow users to delete own confirmations" ON public.report_confirmations;

CREATE POLICY "Allow users to read own confirmations"
ON public.report_confirmations FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

REVOKE ALL PRIVILEGES ON TABLE public.report_confirmations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.report_confirmations TO authenticated;

DROP FUNCTION IF EXISTS public.get_confirmation_threshold();

CREATE OR REPLACE FUNCTION public.confirm_report(
  p_report_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_author_id UUID;
  v_status TEXT;
  v_threshold INTEGER;
  v_count INTEGER;
  v_confirmation_id UUID;
  v_confirmed_at TIMESTAMPTZ;
  v_existing_confirmed_at TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: se requiere una sesión ciudadana' USING ERRCODE = '28000';
  END IF;

  SELECT user_id, status, confirmation_threshold
  INTO v_author_id, v_status, v_threshold
  FROM public.reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'REPORT_NOT_FOUND',
      'message', 'No se encontró el reporte'
    );
  END IF;

  IF v_user_id = v_author_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'AUTHOR_CANNOT_CONFIRM',
      'message', 'El autor no puede confirmar su propio reporte'
    );
  END IF;

  -- Un replay propio conserva precedencia sobre el rechazo de una etapa cerrada.
  SELECT id, created_at
  INTO v_confirmation_id, v_existing_confirmed_at
  FROM public.report_confirmations
  WHERE report_id = p_report_id AND user_id = v_user_id;

  IF FOUND THEN
    SELECT count(*)::integer INTO v_count
    FROM public.report_confirmations
    WHERE report_id = p_report_id;

    UPDATE public.reports
    SET confirmation_count = v_count
    WHERE id = p_report_id;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'ALREADY_CONFIRMED',
      'confirmed', true,
      'confirmedAt', pg_catalog.to_char(v_existing_confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'confirmationCount', v_count,
      'threshold', v_threshold,
      'status', v_status
    );
  END IF;

  IF v_status NOT IN ('pending', 'citizen-verification') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'REPORT_RESOLVED',
      'message', 'El reporte no admite nuevas confirmaciones'
    );
  END IF;

  INSERT INTO public.report_confirmations (report_id, user_id)
  VALUES (p_report_id, v_user_id)
  ON CONFLICT (report_id, user_id) DO NOTHING
  RETURNING id, created_at INTO v_confirmation_id, v_confirmed_at;

  IF v_confirmation_id IS NULL THEN
    SELECT created_at INTO v_existing_confirmed_at
    FROM public.report_confirmations
    WHERE report_id = p_report_id AND user_id = v_user_id;

    SELECT count(*)::integer INTO v_count
    FROM public.report_confirmations
    WHERE report_id = p_report_id;

    UPDATE public.reports
    SET confirmation_count = v_count
    WHERE id = p_report_id;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'ALREADY_CONFIRMED',
      'confirmed', true,
      'confirmedAt', pg_catalog.to_char(v_existing_confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'confirmationCount', v_count,
      'threshold', v_threshold,
      'status', v_status
    );
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.report_confirmations
  WHERE report_id = p_report_id;

  IF v_count >= v_threshold AND v_status = 'pending' THEN
    v_status := 'citizen-verification';
    UPDATE public.reports
    SET confirmation_count = v_count,
        status = v_status,
        corroborated_at = now(),
        updated_at = now()
    WHERE id = p_report_id;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'CONFIRMED_AND_CORROBORATED',
      'confirmed', true,
      'confirmedAt', pg_catalog.to_char(v_confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'confirmationCount', v_count,
      'threshold', v_threshold,
      'status', v_status
    );
  END IF;

  UPDATE public.reports
  SET confirmation_count = v_count,
      updated_at = now()
  WHERE id = p_report_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'CONFIRMED',
    'confirmed', true,
    'confirmedAt', pg_catalog.to_char(v_confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'confirmationCount', v_count,
    'threshold', v_threshold,
    'status', v_status
  );
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.confirm_report(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_report(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_confirmation(
  p_report_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_author_id UUID;
  v_status TEXT;
  v_confirmation_count INTEGER;
  v_confirmation_threshold INTEGER;
  v_confirmed_at TIMESTAMPTZ;
  v_confirmed BOOLEAN;
  v_reason TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: se requiere una sesión ciudadana' USING ERRCODE = '28000';
  END IF;

  SELECT
    r.user_id,
    r.status,
    r.confirmation_count,
    r.confirmation_threshold,
    c.created_at
  INTO
    v_author_id,
    v_status,
    v_confirmation_count,
    v_confirmation_threshold,
    v_confirmed_at
  FROM public.reports AS r
  LEFT JOIN public.report_confirmations AS c
    ON c.report_id = r.id AND c.user_id = v_user_id
  WHERE r.id = p_report_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'REPORT_NOT_FOUND');
  END IF;

  v_confirmed := v_confirmed_at IS NOT NULL;
  v_reason := CASE
    WHEN v_status = 'resolved' THEN 'resolved'
    WHEN v_user_id = v_author_id THEN 'author'
    WHEN v_confirmed THEN 'already-confirmed'
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'confirmed', v_confirmed,
    'confirmedAt', pg_catalog.to_char(v_confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'canConfirm', v_reason IS NULL,
    'reason', v_reason,
    'confirmationCount', v_confirmation_count,
    'threshold', v_confirmation_threshold
  );
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.get_my_confirmation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_confirmation(UUID) TO authenticated;
