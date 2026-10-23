# Tasks

## 1. Storage and Database Schema (Hilo 1)

- [x] 1.1 Create migration for `reports-originals` private Storage bucket with 4 MiB size limit, allowed MIME types (`image/jpeg`, `image/png`, `image/webp`), and authenticated user path policies (`${user_id}/${report_id}/original.jpg`); verify bucket creation and policies via migration script.
- [x] 1.2 Implement Storage service module in `lib/reports/photos.ts` with content sniffing (magic bytes validation), upload under author folder, compensation removal on definitive database errors, and batch signed URL generation (`createSignedUrls`); verify with unit tests using synthetic image buffers.
- [x] 1.3 Add database migration creating `public.reports` table with strict types, spatial coordinates, address columns (`street text not null`, `street_number integer null`), timestamps, and server-enforced initial status `pending`; verify table structure, foreign keys, and indexes.

## 2. Durable Idempotency (Hilo 2)

- [x] 2.1 Create migration for `public.idempotency_keys` table with `user_id`, `key`, `operation`, `payload_hash`, `status`, `report_id`, `locked_until`, `expires_at`, and `UNIQUE(user_id, key)`; verify schema, constraints, and index on `expires_at`.
- [x] 2.2 Implement `claim_idempotency_key` PostgreSQL RPC function with atomic `INSERT ... ON CONFLICT DO NOTHING`, conditional lock updates on expired entries, and domain conflict detection; verify with test cases for new, completed replay, active in-progress, and payload conflict.
- [x] 2.3 Implement idempotency helper in `lib/reports/idempotency.ts` computing canonical JSON hash and file content SHA-256; verify canonicalization matches recursive sorted keys (including `location.address`), trimmed text, and decimal coordinates.

## 3. Citizen Confirmations & Atomic Transition (Hilo 3)

- [x] 3.1 Create migration for `public.report_confirmations` table with `UNIQUE(report_id, user_id)` constraint, indexed foreign keys, and no client mutation policies; verify schema and unique constraint.
- [x] 3.2 Create PostgreSQL function `public.get_confirmation_threshold()` returning positive integer (3) and migration for `confirm_report(p_report_id UUID)` RPC declared `SECURITY DEFINER` with `SET search_path = ''`, `SELECT ... FOR UPDATE`, author exclusion, duplicate handling, and atomic transition to `citizen-verification` recording `corroborated_at`; verify function grants (`REVOKE public/anon`, `GRANT authenticated`).
- [x] 3.3 Implement confirmation service in `lib/reports/confirmations.ts` wrapping RPC calls and mapping internal domain codes to contract responses; verify mapping against `lib/contracts/reports.ts`.

## 4. RLS, Projections, and Route Handlers (Hilo 4)

- [x] 4.1 Create migration for secure view `public.public_reports` filtering stages (`pending`, `citizen-verification`, `resolved`), projecting `street` and `street_number`, and omitting `user_id` and raw storage paths; verify `GRANT SELECT` to `anon` and `authenticated`.
- [x] 4.2 Enforce RLS policies on `reports`, `report_confirmations`, and `idempotency_keys` using `(select auth.uid())` and disallowing client mutations; verify policies in local Postgres/Supabase test environment.
- [x] 4.3 Implement Route Handlers `POST /api/reports` and `GET /api/reports` in `app/api/reports/route.ts` with multipart parsing, idempotency enforcement, bounding-box querying, base64url cursor pagination compatible with map viewer, address reconstruction, and batch signed photo URLs; verify handler responses conform to contract DTOs.
- [x] 4.4 Implement Route Handlers `GET /api/reports/[id]` in `app/api/reports/[id]/route.ts`, and `GET` & `POST` in `app/api/reports/[id]/confirmations/route.ts` and `app/api/reports/[id]/confirmations/me/route.ts`; verify status codes and error envelopes.

## 5. Security & Concurrency Verification (Pruebas Obligatorias)

- [ ] 5.1 Test 1: Query `/rest/v1/reports?select=user_id` with publishable key and no session; verify the request fails with permission denied or returns an empty list.
- [ ] 5.2 Test 2: Query confirmations with two distinct authenticated users; verify one user cannot read confirmations created by the other.
- [ ] 5.3 Test 3: Attempt direct client `INSERT` into `public.reports` and `public.report_confirmations` with user session; verify RLS rejects the direct mutations.
- [ ] 5.4 Test 4: Concurrently submit two identical confirmations for the same user on the same report; verify exactly one row is inserted and both requests receive valid responses.
- [ ] 5.5 Test 5: Concurrently submit confirmations from three distinct users on a pending report; verify the transition to `citizen-verification` occurs exactly once and exactly three confirmation rows exist.
- [ ] 5.6 Test 6: Call `confirm_report` RPC with unauthenticated / null session; verify the function raises unauthenticated error.
- [ ] 5.7 Test 7: Concurrently submit two requests with the same `Idempotency-Key`; verify one processes and the other receives `409 PUBLICATION_IN_PROGRESS` with `Retry-After` header.
- [ ] 5.8 Test 8: Run Supabase Security Advisor checks on tables, views, and functions; verify zero critical security warnings.

## Workflow follow-up

- Review proposal, specs, design, and tasks with teammate leads (Fran and Valen).
- Review open decisions with Fran and Valen before merging to main.
- Keep baseline contract checks passing (`npm run check:contracts`).
