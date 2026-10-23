-- Migration: 20261023000003_idempotency.sql
-- Description: Creates public.idempotency_keys table, claim_idempotency_key RPC and lifecycle functions.

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key UUID NOT NULL,
  operation TEXT NOT NULL DEFAULT 'publish_report',
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  report_id UUID NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  locked_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '3 minutes'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT check_idempotency_status CHECK (status IN ('in_progress', 'completed', 'failed')),
  CONSTRAINT unique_user_id_idempotency_key UNIQUE (user_id, key)
);

-- Indexes for performance and maintenance
CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON public.idempotency_keys (expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_lookup ON public.idempotency_keys (user_id, key);

-- Enable RLS
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.idempotency_keys FROM anon;

DROP POLICY IF EXISTS "Allow users to read own idempotency keys" ON public.idempotency_keys;

CREATE POLICY "Allow users to read own idempotency keys"
ON public.idempotency_keys FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Atomic RPC function to claim or inspect an idempotency slot
CREATE OR REPLACE FUNCTION public.claim_idempotency_key(
  p_key UUID,
  p_payload_hash TEXT,
  p_operation TEXT DEFAULT 'publish_report',
  p_lock_seconds INTEGER DEFAULT 180
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_id UUID;
  v_existing_hash TEXT;
  v_existing_status TEXT;
  v_existing_report_id UUID;
  v_locked_until TIMESTAMPTZ;
  v_retry_after INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Citizen session required' USING ERRCODE = '28000';
  END IF;

  -- 1. Try atomic insert of a new slot
  INSERT INTO public.idempotency_keys (
    user_id,
    key,
    operation,
    payload_hash,
    status,
    locked_until,
    expires_at
  )
  VALUES (
    v_user_id,
    p_key,
    p_operation,
    p_payload_hash,
    'in_progress',
    now() + (p_lock_seconds || ' seconds')::interval,
    now() + interval '24 hours'
  )
  ON CONFLICT (user_id, key) DO NOTHING
  RETURNING id INTO v_id;

  -- If inserted successfully, the slot is claimed
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action', 'CLAIMED',
      'status', 'in_progress',
      'reportId', NULL
    );
  END IF;

  -- 2. Inspect existing slot with row lock
  SELECT id, payload_hash, status, report_id, locked_until
  INTO v_id, v_existing_hash, v_existing_status, v_existing_report_id, v_locked_until
  FROM public.idempotency_keys
  WHERE user_id = v_user_id AND key = p_key
  FOR UPDATE;

  -- Hash conflict: reused key with altered payload
  IF v_existing_hash != p_payload_hash THEN
    RETURN jsonb_build_object(
      'action', 'CONFLICT',
      'status', v_existing_status,
      'code', 'IDEMPOTENCY_CONFLICT',
      'message', 'Idempotency key was previously used with a different payload'
    );
  END IF;

  -- Already completed replay
  IF v_existing_status = 'completed' THEN
    RETURN jsonb_build_object(
      'action', 'COMPLETED',
      'status', 'completed',
      'reportId', v_existing_report_id
    );
  END IF;

  -- Active in-progress operation
  IF v_existing_status = 'in_progress' AND v_locked_until > now() THEN
    v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_locked_until - now())))::integer);
    RETURN jsonb_build_object(
      'action', 'IN_PROGRESS',
      'status', 'in_progress',
      'code', 'PUBLICATION_IN_PROGRESS',
      'retryAfter', v_retry_after
    );
  END IF;

  -- Reclaim slot if previous attempt failed or expired lock
  UPDATE public.idempotency_keys
  SET status = 'in_progress',
      payload_hash = p_payload_hash,
      locked_until = now() + (p_lock_seconds || ' seconds')::interval,
      updated_at = now()
  WHERE id = v_id;

  RETURN jsonb_build_object(
    'action', 'CLAIMED',
    'status', 'in_progress',
    'reportId', NULL
  );
END;
$$;

-- Complete idempotency key function
CREATE OR REPLACE FUNCTION public.complete_idempotency_key(
  p_key UUID,
  p_report_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Citizen session required' USING ERRCODE = '28000';
  END IF;

  UPDATE public.idempotency_keys
  SET status = 'completed',
      report_id = p_report_id,
      updated_at = now()
  WHERE user_id = v_user_id AND key = p_key;
END;
$$;

-- Fail idempotency key function
CREATE OR REPLACE FUNCTION public.fail_idempotency_key(
  p_key UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Citizen session required' USING ERRCODE = '28000';
  END IF;

  UPDATE public.idempotency_keys
  SET status = 'failed',
      updated_at = now()
  WHERE user_id = v_user_id AND key = p_key;
END;
$$;

-- Restrict execution
REVOKE EXECUTE ON FUNCTION public.claim_idempotency_key(UUID, TEXT, TEXT, INTEGER) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_idempotency_key(UUID, TEXT, TEXT, INTEGER) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_idempotency_key(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_idempotency_key(UUID, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fail_idempotency_key(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fail_idempotency_key(UUID) TO authenticated;
