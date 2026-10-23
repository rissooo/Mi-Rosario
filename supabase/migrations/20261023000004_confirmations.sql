-- Migration: 20261023000004_confirmations.sql
-- Description: Creates public.report_confirmations table, get_confirmation_threshold and confirm_report RPC functions.

CREATE TABLE IF NOT EXISTS public.report_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_report_user_confirmation UNIQUE (report_id, user_id)
);

-- Indexes for fast confirmation lookup and counting
CREATE INDEX IF NOT EXISTS idx_confirmations_report_id ON public.report_confirmations (report_id);
CREATE INDEX IF NOT EXISTS idx_confirmations_user_id ON public.report_confirmations (user_id);

-- Enable RLS
ALTER TABLE public.report_confirmations ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.report_confirmations FROM anon;

DROP POLICY IF EXISTS "Allow users to read own confirmations" ON public.report_confirmations;

-- Authenticated users can only read their own confirmation records
CREATE POLICY "Allow users to read own confirmations"
ON public.report_confirmations FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Configurable threshold function (returns 3 for MVP)
CREATE OR REPLACE FUNCTION public.get_confirmation_threshold()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 3;
$$;

-- Atomic report confirmation RPC function with row locking and stage transition
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
  v_report_id UUID;
  v_author_id UUID;
  v_status TEXT;
  v_conf_id UUID;
  v_conf_created_at TIMESTAMPTZ;
  v_count INTEGER;
  v_threshold INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Citizen session required' USING ERRCODE = '28000';
  END IF;

  -- 1. Lock report row for atomic verification state transition
  SELECT id, user_id, status
  INTO v_report_id, v_author_id, v_status
  FROM public.reports
  WHERE id = p_report_id
  FOR UPDATE;

  -- Report existence check
  IF v_report_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'REPORT_NOT_FOUND',
      'message', 'Report not found'
    );
  END IF;

  -- Author exclusion: citizens cannot confirm their own reports
  IF v_user_id = v_author_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'AUTHOR_CANNOT_CONFIRM',
      'message', 'Authors cannot confirm their own reports'
    );
  END IF;

  -- Stage validation: resolved reports cannot receive new confirmations
  IF v_status NOT IN ('pending', 'citizen-verification') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'REPORT_RESOLVED',
      'message', 'Report is already resolved or inactive'
    );
  END IF;

  v_threshold := public.get_confirmation_threshold();

  -- 2. Try idempotent insertion
  INSERT INTO public.report_confirmations (report_id, user_id)
  VALUES (p_report_id, v_user_id)
  ON CONFLICT (report_id, user_id) DO NOTHING
  RETURNING id, created_at INTO v_conf_id, v_conf_created_at;

  -- Already confirmed by this user
  IF v_conf_id IS NULL THEN
    SELECT created_at INTO v_conf_created_at
    FROM public.report_confirmations
    WHERE report_id = p_report_id AND user_id = v_user_id;

    SELECT count(*)::integer INTO v_count
    FROM public.report_confirmations
    WHERE report_id = p_report_id;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'ALREADY_CONFIRMED',
      'confirmed', true,
      'confirmedAt', v_conf_created_at,
      'confirmationCount', v_count,
      'threshold', v_threshold,
      'status', v_status
    );
  END IF;

  -- 3. Newly confirmed: recount distinct confirmations
  SELECT count(*)::integer INTO v_count
  FROM public.report_confirmations
  WHERE report_id = p_report_id;

  -- Atomic transition to citizen-verification if threshold reached
  IF v_count >= v_threshold AND v_status = 'pending' THEN
    UPDATE public.reports
    SET status = 'citizen-verification',
        corroborated_at = now(),
        updated_at = now()
    WHERE id = p_report_id;

    v_status := 'citizen-verification';

    RETURN jsonb_build_object(
      'success', true,
      'code', 'CONFIRMED_AND_CORROBORATED',
      'confirmed', true,
      'confirmedAt', v_conf_created_at,
      'confirmationCount', v_count,
      'threshold', v_threshold,
      'status', v_status
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'CONFIRMED',
    'confirmed', true,
    'confirmedAt', v_conf_created_at,
    'confirmationCount', v_count,
    'threshold', v_threshold,
    'status', v_status
  );
END;
$$;

-- Restrict permissions
REVOKE EXECUTE ON FUNCTION public.get_confirmation_threshold() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_confirmation_threshold() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.confirm_report(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_report(UUID) TO authenticated;
