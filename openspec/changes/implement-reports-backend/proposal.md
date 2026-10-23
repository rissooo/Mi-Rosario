# Proposal

## Why

The architecture baseline established shared TypeScript contracts, validators, and fixtures (`lib/contracts/`), but no server persistence, database schema, storage policies, or API endpoints exist yet. Without a secure, idempotent backend in Supabase, citizen reports and confirmations cannot be recorded, photos cannot be stored safely, and the map interface cannot query real incident data.

This change delivers the complete backend service for report publication, private original photo storage, durable idempotency, atomic citizen confirmations, and secure RLS projections on Supabase PostgreSQL and Next.js Route Handlers.

## What Changes

- **Database Schema & Migrations**:
  - Create table `public.reports` with strict column definitions, spatial coordinates (with PostGIS/GIST indexing or lat/lng composite index), street address (`street` 2–80 chars, `street_number` 1–99999 or null), server-enforced initial status `pending`, and timestamps. Direct client `INSERT`, `UPDATE`, and `DELETE` are disabled.
  - Create secure SQL view `public.public_reports` containing only public fields (including coordinates, street, and street number, excluding `user_id` and internal storage paths) filtered to visible stages (`pending`, `citizen-verification`, `resolved`). Direct `SELECT` on `public.reports` is revoked for `anon`; `GRANT SELECT` on `public_reports` is given to `anon` and `authenticated`.
  - Create table `public.report_confirmations` with `UNIQUE(report_id, user_id)` constraint, indexed foreign keys, and no client mutation policies (`SELECT` restricted to `user_id = (select auth.uid())`).
  - Create table `public.idempotency_keys` with `(user_id, key)` unique constraint, `locked_until` (2–5 minutes for `in_progress`), `expires_at` (24h retention), `payload_hash`, and foreign key reference to `reports(id)` with `ON DELETE CASCADE`.
- **Atomic Database Functions (RPC)**:
  - `claim_idempotency_key(p_key, p_payload_hash, p_lock_duration)`: Atomically reserves or inspects an idempotency slot using `INSERT ... ON CONFLICT DO NOTHING` and conditional update on expired locks.
  - `confirm_report(p_report_id)`: `SECURITY DEFINER` function with `SET search_path = ''`. Extracts user from `auth.uid()`, locks the report row with `SELECT ... FOR UPDATE`, validates author exclusion and active stages, executes idempotent insert, counts distinct confirmations, and atomically transitions status to `citizen-verification` when reaching the configurable threshold (default 3), recording `corroborated_at`.
- **Private Storage & Photo Presentation**:
  - Storage bucket `reports-originals` configured as private (`public: false`) with strict size (4 MiB) and MIME restrictions (`image/jpeg`, `image/png`, `image/webp`).
  - Path convention scoped by author: `${user_id}/${report_id}/original.jpg`.
  - Content sniffing / magic byte validation for uploaded images.
  - Compensation logic: deletes uploaded storage object only on definitive database insertion failures; leaves ambiguous timeouts for retry resolution.
  - Batch signed URL generation (`createSignedUrls`) for list and detail presentation; original photos are never directly exposed.
- **Next.js Route Handlers (`app/api/reports/`)**:
  - `POST /api/reports`: Authenticated multipart publication enforcing `Idempotency-Key` header, payload hashing (including `location.address`), storage upload, and atomic database persistence with street address.
  - `GET /api/reports`: Public querying against `public_reports` with category, status, bounding-box, base64url cursor pagination compatible with map viewer, batch signed photo URLs, and reconstructed `location` with `address`.
  - `GET /api/reports/[id]`: Public detail view with signed photo URL and `location` with `address`.
  - `GET /api/reports/[id]/confirmations/me`: Authenticated endpoint returning `MyConfirmation` DTO for current user.
  - `POST /api/reports/[id]/confirmations`: Authenticated endpoint invoking `confirm_report` RPC and returning `ConfirmationResult` DTO.

## Capabilities

### New Capabilities
- `reports-backend`: Covers persistence, private storage, idempotency, citizen confirmations, RLS policies, and HTTP endpoints for incident reports in Mi Rosario.

### Modified Capabilities

## Impact

- **Affected Code**: `lib/reports/`, `app/api/reports/`, Supabase migrations (`supabase/migrations/`).
- **APIs**: Exposes `/api/reports`, `/api/reports/[id]`, `/api/reports/[id]/confirmations`, and `/api/reports/[id]/confirmations/me` conforming strictly to `lib/contracts/`.
- **Dependencies**: Uses `@supabase/ssr` with user session context; no service-role secrets or bypasses used.
- **Shared Files**: None modified without authorization. `lib/contracts/` and `utils/supabase/` are strictly consumed.
