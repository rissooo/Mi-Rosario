# Design

## Context

The architecture baseline established shared types, validation rules, and fixtures (`lib/contracts/`).
This design defines the concrete architecture for `feature/reports-backend`: Supabase PostgreSQL schemas, Row-Level Security (RLS), private Storage policies, atomic PostgreSQL RPC functions, and Next.js Route Handlers. All database access uses the active citizen session; no `service_role` or bypass secret is used.

## Goals / Non-Goals

**Goals:**
- Provide atomic, idempotent publication of citizen reports with private original image storage.
- Guarantee that original photos never leak to the public; present only time-limited signed viewing URLs.
- Implement atomic citizen confirmations with row-level locking to prevent race conditions during state transitions.
- Expose public report listings via a secure PostgreSQL view that strips author identity and internal storage references.
- Enforce all security, permissions, and mutations at the database level (RLS + RPC).

**Non-Goals:**
- Institutional operations or municipal verification workflows (out of MVP scope).
- Modifying existing Google authentication or user session machinery in `utils/supabase/`.
- Frontend map or report submission forms (Fran's responsibility).
- Gemini Vision analysis (Valen's responsibility).

## Decisions

### 1. Storage & Database Workflow (Hilo 1)
- **Order of Execution**:
  1. Reserve an idempotency slot and generate/reserve `report_id`.
  2. Upload photo to Supabase Storage.
  3. Insert report into PostgreSQL with coordinates and human-readable address (`street text not null`, `street_number integer null`).
- **Deterministic Storage Paths**:
  - Pattern: `${user_id}/${report_id}/original.jpg`
  - Fixed file name (`original.jpg`) ensures retries map to the exact same path.
  - File content is validated by reading magic bytes/signatures (`image/jpeg`, `image/png`, `image/webp`), rejecting spoofed extensions.
- **Compensation & Failure Handling**:
  - If Storage fails: return HTTP 503 `STORAGE_UNAVAILABLE` immediately; no database record is created.
  - If PostgreSQL insertion suffers a *definitive* error: execute compensating delete (`storage.remove([path])`) and mark idempotency slot failed.
  - If a *network timeout* occurs during PostgreSQL insertion: do **not** delete the image. Leave the idempotency state uncertain (`in_progress` until expiration) to allow subsequent client retries to discover the committed report or recover safely.
  - A scheduled maintenance job cleans up orphaned storage files older than 24 hours that have no associated report in `public.reports`.
- **Photo Presentation**:
  - The `reports-originals` bucket is strictly private (`public: false`).
  - Public viewing uses time-limited signed URLs (`createSignedUrl` / `createSignedUrls` in batch for list endpoints).
  - Vercel request body limit (~4.5 MB): Documented as an open discussion point with Fran (see Open Questions / Agreements).

### 2. Durable Idempotency (Hilo 2)
- **Table `public.idempotency_keys`**:
  - Columns: `id` (UUID PK), `user_id` (UUID FK -> `auth.users`, `ON DELETE CASCADE`), `key` (UUID), `operation` (text), `payload_hash` (text), `status` ('in_progress' | 'completed' | 'failed'), `report_id` (UUID FK -> `reports(id)`), `locked_until` (timestamptz), `expires_at` (timestamptz), `created_at` (timestamptz).
  - Unique constraint: `UNIQUE(user_id, key)`.
  - Indexes: `(expires_at)` for cleanup, `(user_id, key)`.
- **Atomic Slot Reservation (`claim_idempotency_key` RPC)**:
  - Executes `INSERT INTO idempotency_keys ... ON CONFLICT (user_id, key) DO NOTHING`.
  - If inserted: slot secured with `status = 'in_progress'`, `locked_until = now() + interval '3 minutes'`, `expires_at = now() + interval '24 hours'`.
  - If not inserted (existing key):
    - Reads existing record.
    - If `payload_hash != incoming_hash`: return domain code `IDEMPOTENCY_CONFLICT` (HTTP 409).
    - If `status == 'completed'`: return domain code `COMPLETED` along with `report_id` (reconstructed into HTTP 200).
    - If `status == 'in_progress'` and `locked_until > now()`: return domain code `PUBLICATION_IN_PROGRESS` (HTTP 409 with `Retry-After: 5`).
    - If `status == 'in_progress'` and `locked_until <= now()` (stale lock from crash): perform conditional `UPDATE ... WHERE locked_until <= now()` to reclaim the slot.
    - If `status == 'failed'`: allow reclaiming the key.
- **Payload Hash Calculation**:
  - SHA-256 over canonical JSON string of report fields (recursive sorted keys including `location.address`, trimmed strings, normalized coordinate decimals) concatenated with the SHA-256 digest of the image file bytes. Excludes client-provided file names.
- **DTO Reconstruction**:
  - Store only `report_id` (not `response_body` JSON) to maintain referential integrity. On completed replays, query `reports` and generate fresh signed photo URLs.

### 3. Citizen Confirmations & Atomic Transition (Hilo 3)
- **Table `public.report_confirmations`**:
  - Columns: `id` (UUID PK), `report_id` (UUID FK -> `reports(id)`), `user_id` (UUID FK -> `auth.users`), `created_at` (timestamptz).
  - Constraint: `UNIQUE(report_id, user_id)`.
  - Indexes: `(report_id)`, `(user_id)`.
  - RLS: Direct `INSERT`, `UPDATE`, and `DELETE` are disallowed for clients. `SELECT` is permitted only for `user_id = (select auth.uid())`.
- **RPC Function `confirm_report(p_report_id UUID)`**:
  - Declared `SECURITY DEFINER` with `SET search_path = ''`.
  - `REVOKE EXECUTE ON FUNCTION confirm_report FROM public, anon; GRANT EXECUTE ON FUNCTION confirm_report TO authenticated;`
  - Reads `v_user_id := auth.uid()`. If null, raises `UNAUTHENTICATED`.
  - Executes `SELECT id, user_id, status FROM public.reports WHERE id = p_report_id FOR UPDATE;`
  - Validates:
    - If report does not exist: returns `REPORT_NOT_FOUND`.
    - If `v_user_id = report.user_id`: returns `AUTHOR_CANNOT_CONFIRM`.
    - If `report.status NOT IN ('pending', 'citizen-verification')`: returns `REPORT_RESOLVED`.
  - Executes `INSERT INTO public.report_confirmations (report_id, user_id) VALUES (p_report_id, v_user_id) ON CONFLICT (report_id, user_id) DO NOTHING;`
  - If conflict (already confirmed): returns `ALREADY_CONFIRMED` with existing timestamp (HTTP 200).
  - Counts valid distinct confirmations: `SELECT count(*) FROM public.report_confirmations WHERE report_id = p_report_id;`
  - Reads effective threshold from `public.get_confirmation_threshold()` (returns 3).
  - If `count >= threshold` and `report.status = 'pending'`:
    - Updates `public.reports SET status = 'citizen-verification', corroborated_at = now(), updated_at = now() WHERE id = p_report_id;`
    - Returns `CONFIRMED_AND_CORROBORATED` (HTTP 201).
  - Otherwise returns `CONFIRMED` (HTTP 201).
  - Route handler maps domain return codes to HTTP status and contract envelopes.

### 4. RLS & Visibility Model (Hilo 4)
- **Table `public.reports` Security**:
  - Closed to `anon` (no direct `SELECT`).
  - No client `INSERT`, `UPDATE`, or `DELETE` policies.
  - Columns include: `street varchar(80) not null check (char_length(trim(street)) between 2 and 80)`, `street_number integer null check (street_number between 1 and 99999)`.
  - Initial status strictly set to `pending` by server logic.
  - Moderator actions (e.g. resolution) require `(auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator'` (never `user_metadata`).
- **Secure View `public.public_reports`**:
  - Definition:
    ```sql
    CREATE VIEW public.public_reports WITH (security_invoker = false) AS
    SELECT id, title, description, category_id, severity, status,
           latitude, longitude, street, street_number,
           created_at, updated_at, corroborated_at, resolved_at,
           storage_path, mime_type, byte_size
    FROM public.reports
    WHERE status IN ('pending', 'citizen-verification', 'resolved');
    ```
  - Note: `storage_path` is consumed only by the Route Handler to generate signed URLs; it is not serialized in the final `Report` DTO.
  - `GRANT SELECT ON public.public_reports TO anon, authenticated;`
  - States `rejected` or `hidden` are strictly omitted from the view.
- **Storage Policies**:
  - `reports-originals` bucket policy for upload:
    ```sql
    CREATE POLICY "Allow authenticated user upload to own folder"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'reports-originals' AND
      (storage.foldername(name))[1] = (select auth.uid())::text
    );
    ```
  - Delete policy for compensation:
    ```sql
    CREATE POLICY "Allow user delete own pending upload"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'reports-originals' AND
      (storage.foldername(name))[1] = (select auth.uid())::text
    );
    ```
- **Indexing & Queries**:
  - Composite indexes: `(status, created_at DESC)`, `(category_id, created_at DESC)`.
  - Spatial indexing: PostGIS `geom geometry(Point, 4326)` with GIST index `USING GIST(geom)` (or composite B-Tree on `(latitude, longitude)` if PostGIS extension is unavailable in the environment).
  - Keyset cursor pagination encoding `{ version: 1, createdAt, id, filters }` as base64url JSON (matching `app/components/map/report-source.ts` client contract) with stable `ORDER BY created_at DESC, id DESC`.

## Risks / Trade-offs

- **[Risk] Multiple fake accounts confirming report** → *Mitigation*: Contract limitation noted: 3 distinct accounts reach the citizen threshold. In future milestones, account age, phone verification, or karma can be introduced.
- **[Risk] High volume list queries causing Supabase Storage API rate limits for signed URLs** → *Mitigation*: Use batch signing (`createSignedUrls`) in a single network call within Route Handlers, with caching headers (`Cache-Control: private, max-age=300`).
- **[Risk] Vercel serverless function body size limit (~4.5 MB)** → *Mitigation*: Compress images on the client before submission, or coordinate with Fran on presigned direct storage upload if necessary.

## Open Questions & Agreements with Teammates

### To agree with Fran (Frontend / Maps):
1. **Multipart Upload vs. Direct Storage Upload**:
   - Current plan uses `POST /api/reports` with multipart form data (photo + JSON).
   - If image size exceeds ~4.5 MB, Vercel edge/serverless will reject the payload with HTTP 413. Fran's client should ensure client-side resizing/compression to < 4 MB before upload. Alternatively, we can evaluate presigned direct-to-storage uploads in a future iteration.
2. **Batch Signed URL Latency on Map Exploration**:
   - For map queries returning up to 50 reports, the backend will batch-sign 50 URLs. We will benchmark response times and consider derivative caching.
3. **Address Contract & Keyset Cursor (PR #3 Alignment)**:
   - Accepted the `Location.address` shape (`{ street, number }`) and limits (street 2–80, number 1–99999 or null). Backend stores separate columns `street` and `street_number` in `public.reports`, allowing intersections/parks with `number = null`.
   - Backend `GET /api/reports` implements keyset cursor pagination matching `report-source.ts` `{ version: 1, createdAt, id, filters }` encoded as base64url.

### To agree with Valen (Gemini Vision):
1. **Image Storage Segregation**:
   - Valen's vision endpoint (`POST /api/vision/analyze`) operates purely in-memory and does not write to Storage. Confirm that no vision metadata needs to be passed into report storage.
