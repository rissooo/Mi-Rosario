# Design

## Context

The repository uses root `app/`, `utils/supabase/{client,server,middleware}.ts`, `proxy.ts`, Google login and `/auth/callback`. Previous inspection found Next.js 16.4.2, React 19.3, strict TypeScript, the root alias `@/*`, Cache Components, a demo `/todos` page and no report/vision/map modules or checked-in migrations. The installed Next.js guides and agent-file generator were inspected during initial proposal work. Hosted schema, RLS, Storage settings and deployment limits remain unverified. No secret contents are needed for this planning.

Existing Claude commands/skills and the generated block in AGENTS.md are preserved. CLAUDE.md and GEMINI.md were absent at initial inspection and must be rechecked before any future additive edits.

## Goals / Non-Goals

**Goals:** Produce reviewable shared DTOs, pure runtime validation, synthetic fixtures and ownership/instruction documentation. Capture future service contracts sufficiently to prevent divergent implementation. Keep citizen corroboration, institutional authority and publication bookkeeping independent.

**Non-Goals:** Implement endpoints, map UI, Gemini calls, database migrations, Storage buckets, municipal integration or operational institution roles. The user authorized the contract/instruction baseline apply only. No runtime application features, configuration changes, commit, push, merge or archive are authorized.

## Decisions

### 1. Separate baseline requirements from future functionality

The three existing delta specs describe observable outputs of the architecture baseline: a usable contract package, validation examples and collaboration rules. Their scenarios check that package/fixtures/documentation, not deployed endpoint behavior. Paths are retained to avoid creating or moving artifacts during this update.

Sections 3-8 below are **future feature contract references**, not runtime requirements delivered by this change. Each implementation owner must create a separate feature change with runtime requirements and acceptance tests before implementation. Future institutional work needs its own approved scope change. Archiving this baseline must not imply that HTTP routes, RLS, Storage or UI are implemented.

Baseline completion means shared types/validators/fixtures and additive guidance have been delivered and checked, after a separate apply request. Planning completion alone does not complete those tasks. No feature endpoint or migration is a prerequisite for archiving the baseline.

### 2. Preserve paths and ownership

Proposed future structure, not created by this update:

```text
app/
  api/
    vision/analyze/route.ts                      Valen
    reports/route.ts                             Agus: POST and GET
    reports/[id]/route.ts                        Agus: detail
    reports/[id]/confirmations/route.ts          Agus: POST
    reports/[id]/confirmations/me/route.ts       Agus: private GET
  components/
    reports/                                     Fran: form/review/map detail
    map/                                         Fran: browser map boundary
  page.tsx, layout.tsx, globals.css               Fran
  auth/, auth-buttons.tsx, todos/                 existing, preserved
lib/
  contracts/
    categories.ts, reports.ts, vision.ts          Agus coordinates, all review
    errors.ts, validation.ts                      Agus with Valen
    fixtures.ts                                  Fran, synthetic only
  reports/service.ts, repository.ts               Agus
  reports/photos.ts, publication.ts               Agus: Storage and retries
  vision/service.ts, provider.ts                  Valen: server-only
utils/supabase/                                  existing, Agus maintains
supabase/migrations/                             Agus, future feature only
types/database.ts                               Agus, future generated types
docs/contracts.md                               Fran, Valen coordinates handoffs
docs/development.md                             Agus with Valen
```

No move to src/, monorepo or separate backend. Browser code imports only public DTOs/pure validators and calls product APIs; existing browser authentication remains valid. It never imports repository/provider/server clients or holds service-role/provider credentials. Valen's analysis has no report/Storage writes. Agus owns all original-photo persistence. Fran retains the original File in draft state until explicit publication, even if an analysis copy is resized.

Next.js implementations must re-read relevant installed documentation. Preserve async session/cookie patterns and proxy behavior. Personal responses are never shared cached; map browser APIs stay behind an appropriate client boundary.

### 3. Categories, severity and expanded shared DTOs

Use catalog-backed stable CategoryId values and one reviewed catalog across frontend, backend and AI validation. The approved initial active MVP catalog contains exactly these four entries:

| ID | Spanish label | Active / scope |
| --- | --- | --- |
| pothole | Baches | true / mvp |
| missing-light | Falta de luz | true / mvp |
| damaged-sidewalk | Veredas dañadas | true / mvp |
| faulty-traffic-light | Semáforos defectuosos | true / mvp |

The original pothole and missing-light IDs are unchanged. New IDs follow the existing lowercase English kebab-case convention (letters separated by single hyphens, no spaces/underscores); damaged-sidewalk and faulty-traffic-light conform. This extensible catalog is not a permanent closed four-value taxonomy: future additions require scope/catalog review. No fifth category or generic other value is active in the MVP. Runtime validators check exact active-catalog membership, not merely identifier syntax. A category endpoint is not needed in the baseline; modules share the reviewed package.

All four entries are manually selectable without successful AI analysis. Gemini can suggest any active entry but must return categoryId null when the image does not support a sufficiently confident suggestion; no numeric confidence threshold is implied. Unknown/inactive provider values are invalid output, not new catalog entries. Publication requires a citizen-selected active category even if the suggestion is null.

Use falta de luz for lighting and never infer insecurity from a photograph. A still photograph may show a traffic light without proving its operating condition: when uncertain, analysis returns categoryId null and a warning inviting manual selection and citizen-declared observations. The existing editable description captures those observations; no invented malfunction, compulsory new field or new endpoint is introduced. Distinguish citizen-declared behavior from visually observable facts; citizen text is not municipal evidence.

Configuration reconciliation is complete: the separately authorized openspec/config.yaml update lists all four approved categories and preserves all other scope restrictions. No configuration edit is needed for this baseline.

Severity uses the approved scale `low | medium | high` and describes the citizen-reviewed incident impact, not official urgency or municipal verification:

| Value | Label | Approved criterion |
| --- | --- | --- |
| low | Baja | Molestia o deterioro menor. |
| medium | Media | Puede dificultar la circulación o el uso del espacio público. |
| high | Alta | Riesgo importante para personas o vehículos. |

Gemini can suggest one of these levels and the citizen can correct it before publication. AI can return null when uncertain; the citizen must select a valid level before publishing. There is no unassessed published severity. Severity, including high, never automatically changes citizen or municipal verification or resolves a report.

Proposed contract text only; all fields required unless marked ?:

```ts
type UUID = string;           // runtime UUID validation
type IsoDateTime = string;    // UTC ISO-8601
type CategoryId = string;     // runtime catalog membership
type InitialMvpCategoryId =
  | 'pothole'
  | 'missing-light'
  | 'damaged-sidewalk'
  | 'faulty-traffic-light';   // approved initial seed, not a closed future domain
type CategoryDefinition = {
  id: CategoryId;
  label: string;
  active: boolean;
  scope: 'mvp' | 'future';
};
type Severity = 'low' | 'medium' | 'high';
type Location = { latitude: number; longitude: number };
type ReportStage =
  | 'pending'
  | 'citizen-verification'
  | 'municipal-verification'
  | 'resolved';

type ReportFields = {
  title: string;
  description: string;
  categoryId: CategoryId;
  severity: Severity;
  location: Location;
  reviewed: true;
};
type PublishReportRequest = {
  report: ReportFields;       // serialized JSON multipart field
  image: File;               // exactly one original photo, required
};
// HTTP header: Idempotency-Key, required UUID, scoped to account + operation
type Photo = {
  id: UUID;
  url: string;               // temporary authorized presentation URL
  expiresAt: IsoDateTime;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
};
type CitizenVerification = {
  confirmationCount: number;
  threshold: number;          // effective backend threshold, initial value 3
  policyStatus: 'approved';
  corroborated: boolean;
};
type InstitutionalVerification = {
  availability: 'unavailable' | 'enabled';
  verifiedAt: IsoDateTime | null;
};
type Report = {
  id: UUID;
  title: string;
  description: string;
  categoryId: CategoryId;
  severity: Severity;
  photo: Photo;
  status: ReportStage;
  location: Location;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  citizenVerification: CitizenVerification;
  institutionalVerification: InstitutionalVerification;
  resolvedAt: IsoDateTime | null;
};
type ReportListQuery = {
  categoryId?: CategoryId;
  status?: ReportStage;
  bbox?: string;             // west,south,east,north
  limit?: number;
  cursor?: string;
};
type ReportList = { items: Report[]; nextCursor: string | null };
type MyConfirmation = {
  reportId: UUID;
  status: ReportStage;        // authoritative backend stage after confirmation
  confirmed: boolean;
  confirmedAt: IsoDateTime | null;
  canConfirm: boolean;
  reason: 'author' | 'resolved' | 'already-confirmed' | null;
  citizenVerification: CitizenVerification;
};
type ConfirmReportRequest = Record<string, never>;
type ConfirmationResult = MyConfirmation & { confirmed: true };
type AnalyzeImageRequest = { image: File };
type ImageSuggestion = {
  title: string | null;
  description: string | null;
  categoryId: CategoryId | null;
  severity: Severity | null;
  warnings: string[];
};
type AnalyzeImageResponse = { suggestion: ImageSuggestion };
type ApiError = {
  code: ErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
};
type ApiResult<T> = { data: T } | { error: ApiError };
```

ErrorCode values: INVALID_JSON, VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN, REPORT_NOT_FOUND, REPORT_RESOLVED, AUTHOR_CANNOT_CONFIRM, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, ANALYSIS_FAILED, ANALYSIS_UNAVAILABLE, ANALYSIS_TIMEOUT, PUBLICATION_IN_PROGRESS, IDEMPOTENCY_CONFLICT, STORAGE_UNAVAILABLE, INTERNAL_ERROR.

Title proposal: trimmed 5-120 Unicode code points. Description: trimmed 10-1000. Coordinates: finite numbers, latitude [-90,90], longitude [-180,180]; numeric strings rejected in JSON fields. UUID and UTC dates validated at runtime. Counters are nonnegative integers. Unknown JSON/multipart fields, repeated fields and user-supplied identity/status/counts/Storage paths are rejected. A non-null AI field obeys its corresponding validator. Warnings: at most 5 Spanish strings of 200 code points. No authoritative location, stage, institutional claim or publication instruction comes from AI.

No municipal polygon check is claimed. Report bodies omit private author IDs, emails, internal publication state, prompts and provider diagnostics. Stable storage bucket/object references remain server-side; signed URLs are presentation values, never stored as the permanent DB reference. The future feature must verify URL authorization and caching against actual Storage policies.

### 4. Future HTTP contracts and precise repeat behavior

These are targets for separate feature specs. Same-origin mutation protection and verified session authentication are required; identity is never read from a body field.

| Method / route | Input | Access / owner | Success |
| --- | --- | --- | --- |
| POST /api/vision/analyze | multipart image | Session / Valen | 200 ApiResult<AnalyzeImageResponse> |
| POST /api/reports | multipart report JSON + original image; Idempotency-Key UUID header | Session / Agus | 201 first completion; 200 completed replay, ApiResult<Report> |
| GET /api/reports | ReportListQuery | Public / Agus | 200 ApiResult<ReportList> |
| GET /api/reports/{id} | UUID | Public / Agus | 200 ApiResult<Report> |
| GET /api/reports/{id}/confirmations/me | UUID, no body | Session / Agus | 200 ApiResult<MyConfirmation> |
| POST /api/reports/{id}/confirmations | UUID and empty JSON object | Session / Agus | 201 first insert; 200 existing, ApiResult<ConfirmationResult> |

No institutional, closure, delete-confirmation or report-edit endpoint is introduced in the MVP contract.

Transport: malformed report JSON -> 400 INVALID_JSON; invalid fields/UUID/query/key -> 422 VALIDATION_ERROR; wrong media -> 415 UNSUPPORTED_MEDIA_TYPE; missing session -> 401 UNAUTHENTICATED; denied origin/permission -> 403 FORBIDDEN; missing or unpublished report -> 404 REPORT_NOT_FOUND. Unexpected failure -> 500 INTERNAL_ERROR. Application-handled responses use the envelope; framework-generated 405 is a transport exception. Messages/field errors are Spanish and never expose SQL/secrets.

JSON metadata and confirmation bodies: 16 KiB maximum. Photos: JPEG/PNG/WebP, declared MIME plus signature/decoding checks, 4 MiB maximum original bytes. Multipart request ceiling proposal: 4 MiB + 64 KiB including metadata/overhead. Exceeding size -> 413 PAYLOAD_TOO_LARGE. Verify deployment memory/decoded-image limits in the vision/backend feature changes before production. Do not silently compress or replace the persisted original to fit a provider limit.

Analysis: 20-second provider deadline -> 504 ANALYSIS_TIMEOUT; provider unavailable/config missing -> 503 ANALYSIS_UNAVAILABLE; invalid provider structure -> 502 ANALYSIS_FAILED. Invalid image shape -> 422; unsupported content -> 415. Analysis errors preserve the draft and original and permit manual completion; photo is still required at publication.

Publication idempotency:
- Same account + key + canonical validated report fields + image SHA-256 fingerprint represents one operation. Store the first accepted fingerprint; key reuse with different payload -> 409 IDEMPOTENCY_CONFLICT, without another upload/report.
- First completion -> 201. Replaying a completed operation -> 200 with the same report ID and newly authorized photo URL. Do not require expired signed URLs to match byte-for-byte.
- Same payload while a worker is active -> 409 PUBLICATION_IN_PROGRESS with Retry-After; retry using the same key and payload.
- Transient Storage failure -> 503 STORAGE_UNAVAILABLE; other unexpected retryable publication failure -> 500 INTERNAL_ERROR. The client retains original/key/draft and retries the same operation, not a new key.
- After initial acceptance, rejected payload changes cannot replace a partial operation. A new intentional report uses a new key. Different keys may create similar reports; no semantic deduplication is claimed.
- Keep completed key mappings for the lifetime of the report. Retain failed-operation reservations until completed or explicitly abandoned and cleaned; deleting them must not silently make a previously completed key reusable.

Current-account confirmation lookup is separate from public detail. It returns false/null when no row exists, true/timestamp when one exists, plus count/policy and eligibility. It is private, no-store and never reveals another account. Anonymous -> 401; missing report -> 404. Resolved takes precedence over author/already-confirmed for the display reason; otherwise author precedes already-confirmed.

Confirmation mutation precedence: authenticate/authorize, find published report, reject author with 403 AUTHOR_CANNOT_CONFIRM, return an existing confirmation with 200 even if now resolved, then reject a new confirmation on resolved with 409 REPORT_RESOLVED. Otherwise insert atomically with uniqueness; first -> 201, concurrent duplicates -> 200. Existing confirmation on a resolved report is returned with canConfirm false/reason resolved; the count never increments again. A nonexistent report always yields 404 after authentication. Transaction ordering must serialize new insertion against future resolution. No production resolution operation exists in the MVP.

List filters: catalog categoryId, four-stage status, valid bbox (west < east, south < north), integer limit 1-100/default 50, opaque cursor. Reject unknown/repeated parameters, invalid/inactive category filters outside approved scope, malformed or mismatched cursor with 422. Stable order createdAt DESC/id DESC, cursor version + last tuple bound to normalized filters, limit+1 to detect next page. Omitted status includes all available real stages; no fabricated municipal/resolved records. Empty list is items []/nextCursor null; no snapshot guarantee.

### 5. Original photo persistence and proposed database model

Agus owns publication orchestration, storage permissions, permanent association, compensation, cleanup and retries. Photo remains only in browser/server request memory until the citizen chooses Publicar; Gemini has no upload path. Published reports require exactly one stored original, even when analysis was skipped or failed.

Future model (no SQL/migrations created here):

| Entity | Proposed columns and relations |
| --- | --- |
| report_categories | id PK text, label, active, scope; initial active mvp seed exactly pothole, missing-light, damaged-sidewalk, faulty-traffic-light with their approved Spanish labels |
| reports | id UUID PK, author_id FK auth.users, title, description, category_id FK report_categories, severity, latitude, longitude, status, internal publication_state, created_at, updated_at, resolved_at nullable |
| report_photos | id UUID PK, report_id unique FK reports, private original bucket/object_path unique, original MIME/byte_size/sha256, viewing bucket/object_path unique and viewing MIME/byte_size, created_at; one original and its safe viewing derivative per published report |
| report_confirmations | report_id FK reports, user_id FK auth.users, created_at; composite PK/unique(report_id,user_id) |
| report_publications | id UUID PK, author_id FK auth.users, idempotency_key, fingerprint, report_id unique FK reports, state, worker lease, error/cleanup metadata; unique(author_id,idempotency_key) |
| citizen_verification_policy | version, effective positive-integer threshold initially 3, approved policy metadata; writable only by authorized backend administration |

Photo ownership follows the report author. Object paths use server-generated opaque IDs, never email or arbitrary client paths. Moderator/institution memberships and verification evidence tables are **not MVP entities**; their schema belongs to a future approved institutional change.

Publication bookkeeping is separate from visible lifecycle. Create an unpublished reservation with a stable report/photo ID and operation lease; upload original to a deterministic private Storage key after validation; then commit photo reference plus publication completion/published state in one DB transaction. Public reads expose only published rows with a ready photo. If upload fails, keep reservation retryable; if DB finalization fails after upload, reconcile using operation fingerprint and object identity. Leases/row locks prevent concurrent workers from uploading/deleting each other's objects.

Storage and database do not share one atomic transaction. A recovery/cleanup worker retries/reconciles stale operations and deletes abandoned unreferenced objects; it must recheck state under the same concurrency control and never delete a committed photo. Cleanup timing/retry budget is deployment configuration to document in the backend change. Report deletion/account deletion policies are not assumed; do not cascade away evidence without a reviewed retention decision.

Original is stored unchanged in a private bucket. Public detail receives a short-lived authorized image URL (proposed 5 minutes, refreshed via report detail); original EXIF may include private metadata, so public delivery must use a metadata-stripped viewing derivative. Store the derivative separately under backend ownership, preserving the private original. The photo DTO represents the authorized viewing resource. Publication remains hidden until both original reference and safe viewing resource are ready. If metadata-safe delivery is not available, fail publication rather than expose the private original. This adds a backend processing/cleanup requirement, not AI persistence.

RLS plus column privileges or narrow audited RPCs prevent spoofed authors, confirmations by authors, forged stages, counts and private reference reads, including direct Supabase REST/Storage access. Browser clients cannot independently upload/delete originals or manipulate publication state. Request-serving code uses session-scoped authentication; any required privileged worker capability is server-only, narrowly scoped and explicitly audited. Public report projections exclude private identity/object paths. Never rely solely on UI restrictions or assume a definer view preserves RLS.

### 6. Four visible stages without fabricated official verification

| API stage | Spanish label | Meaning / availability |
| --- | --- | --- |
| pending | Pendiente | Published; valid citizen confirmation count below the effective threshold |
| citizen-verification | Verificación ciudadana | Citizen corroboration criterion satisfied, not institutional endorsement |
| municipal-verification | Verificación municipal | Reserved for real authorized institutional evidence; unavailable in MVP |
| resolved | Resuelto | Reserved for authorized institutional closure; unavailable in MVP |

Display the four-step track in the map detail, with future steps clearly unavailable. A step shown in the track is not a completed verification. Do not move a production report to municipal-verification or resolved because of a counter, AI result, moderator demo or fixture.

Citizen facts are independent of institutional evidence. The approved initial threshold is 3 valid confirmations from 3 distinct authenticated accounts, excluding the report author. One account contributes at most one confirmation per report; repeated, unauthenticated and author submissions never increase the count. The backend owns the effective positive-integer threshold and returns it with confirmationCount, corroborated and status in the relevant DTOs; the frontend must not hardcode 3 or compute an authoritative transition.

When a valid insertion reaches the effective threshold T (initially 3), the backend automatically moves pending to citizen-verification and sets corroborated true. Count validation, uniqueness and the pending-stage update must be atomic and race-safe. Below T, status remains pending and corroborated is false. Confirmation retries do not repeat transitions. Neither the count nor severity can set municipal evidence or resolution, and further confirmations cannot regress or replace later stages.

Authorized backend configuration can change T without an interface release; clients render the returned threshold and server-owned state. Invalid/null thresholds are rejected, not exposed as a pending-approval mode. Tests must exercise a non-default T to prove the interface contract does not depend on 3. Policy versioning and retrospective treatment of existing reports when T changes remain a separate operational decision before such a change is deployed; this does not defer approval or initial activation of T=3 in the future feature implementation.

InstitutionalVerification is unavailable/verifiedAt null and resolvedAt null in real MVP responses. Citizen counts do not populate either. Future authorized institutional accounts require database-granted verification authority, and closure additionally requires moderator/closure authority. This preserves the existing moderator-only restriction as a necessary condition while proposing an additional institutional condition; the identity/role mapping is unresolved and cannot be enabled without scope/config review.

This future institutional module conflicts with the current exclusion of institutional roles if activated now. Keep it solely in the roadmap, without registration, role grants, action buttons or mutation routes. Mock municipal/resolved examples are isolated fixtures labeled Simulación - sin aval municipal, never production seed records, official badges or official activity claims.

### 7. Map detail and editable AI boundary

Selecting a marker shows photo, title, description, category label, citizen-reported severity, visible stage track/current status, latitude/longitude, creation date and citizen confirmation count. Fetch report detail as needed for refreshed image URLs and fetch /confirmations/me only after authentication. Expired/unavailable image handling shows an honest loading/error state and refreshes detail, not a fabricated photo. List pagination covers a viewport without silently dropping remaining pages.

AI suggests nullable title/description/categoryId/severity plus warnings from the reviewed catalog/scale. It never returns an authoritative location, official verification or final publication status. Fran lets the citizen edit all report fields and adjust location; reviewed true is acknowledgment, not proof of human attention. Publication is a separate explicit action that sends original plus reviewed fields and a stable idempotency key. No automatic publication when analysis completes.

### 8. Team branches, instructions and individual access

| Owner | Branch | Boundary |
| --- | --- | --- |
| Valen / Codex | feature/gemini-vision | Analysis transport, validated suggestions, provider |
| Agus / Gemini or Antigravity | feature/reports-backend | DB, RLS, publication/photos/recovery, corroborations, contract coordination |
| Fran / Claude Code | feature/interface-map | Draft, review, photo display, detail, map, private confirmation UI |
| Valen coordinates, all review | chore/team-architecture | Baseline contracts, fixtures and instruction documentation |

Proposed integration target remains main. Merge the reviewed baseline before integrating features; existing feature branches update from it under their owner's control. Use focused English Conventional Commits and PRs linking OpenSpec, affected contracts, dependencies and checks/mobile evidence. Provider and consumer owners review boundary changes. Assign one editor per PR for shared contracts/package files/proxy/instructions; do not overwrite another owner's conflict resolution or force-push their branch. Branch protection is a proposed convention, not claimed configured.

Add a delimited team section outside the generated Next.js block in AGENTS.md, preserving that block and nested instructions. CLAUDE.md/GEMINI.md reference the shared source and selected change: create only if absent after reinspection, otherwise append nonconflicting guidance and report conflicts. Preserve .claude/.agents skills and commands; do not regenerate configuration. Verify each assistant actually reads shared guidance instead of assuming identical import behavior.

Agus uses his own assistant login; assistant authentication is separate from runtime GEMINI_API_KEY. Backend contract fixtures need neither Valen's login nor his provider key. Invite individual accounts to hosted test resources when needed; use an approved secret channel for independently provisioned environment secrets. No passwords, service-role keys, tokens, .env.local, assistant caches or private histories in Git/instructions/PRs. Existing NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY remain public configuration, never a substitute for RLS. Document placeholders in docs/development.md rather than bypass the existing .env* ignore rule.

PowerShell uses openspec.cmd (locate via npm.cmd config get prefix if needed). Lifecycle is propose/review, a separate explicitly requested apply, checks, then sync/archive when the baseline's own deliverables are complete. Future functionality is specified in separate changes before implementation, not silently added to architecture tasks.

## Risks / Trade-offs

- Storage/DB partial failures -> unpublished reservations, durable idempotency, lease-based recovery and tested cleanup.
- Original metadata privacy -> private unchanged original, metadata-stripped presentation derivative, no public original URL.
- Category/context mismatch was resolved by the authorized four-category config update -> preserve those IDs and reject any fifth active category until reviewed. Severity criteria remain approved.
- Still images cannot always establish lighting or traffic-light behavior -> nullable suggestions, honest warnings and citizen-declared observations in the editable description; never infer insecurity or official verification.
- Concurrent confirmations or hardcoded thresholds -> atomic unique insertion/count/stage transition, backend-only configuration and non-default-threshold fixtures.
- Institutional roadmap conflicts with current MVP scope -> no operative municipal actions or simulated official claims.
- Baseline could be mistaken for implemented product -> requirements target contract artifacts; separate feature specs/tests own runtime delivery.
- Hosted schema/policies and deployment not inspected -> future owners verify actual environments before additive migrations/provider calls.
- Coordinate ranges do not prove Rosario municipal membership -> document limitation and review geofencing separately.
- The proposal-rule YAML quoting defect was corrected by separate authorization -> preserve its original meaning and leave configuration unchanged in this implementation.

## Migration Plan

1. Finish review and validate these existing artifacts; no application deployment occurs.
2. Configuration reconciliation and explicit baseline apply authorization are complete. Deliver only architecture contracts, pure validators, fixtures, additive instructions and development/contract documentation.
3. Verify baseline scenarios with local credential-free fixtures, static checks and owner review. Archive only baseline requirements after its tasks are complete, not future HTTP behavior.
4. Create separate backend, vision and interface changes. Each authors runtime specs from the reference contracts, adds appropriate implementation tests, and obtains new apply authorization.
5. Backend tests Storage consistency/idempotency and direct DB/Storage policies; vision tests no publication/persistence; frontend tests mobile review, real photo detail and user confirmation state.
6. Institutional integration is a separate post-MVP proposal requiring explicit role/scope approval and no mock authority. Rollback/data retention belongs to the feature migration plan; never reset a shared database.

## Pending approvals and future design gates

These are explicit blocked production decisions, not defaults approved by this baseline:
- Operational policy versioning and retroactive reevaluation before changing the approved initial backend threshold of 3; the initial rule and automatic citizen transition are approved.
- Config context now matches the approved four-category MVP. Only categories beyond those four require a new review.
- Title length defaults before product production use; severity low/medium/high and their criteria are approved and no longer a review gate.
- Future institutional identity/role mapping and compatible scope/config revision; no such operations in MVP.
- Original-photo retention/account-deletion policy before a production data-retention workflow. Backend deployment cleanup intervals/provider model choices are verified in their feature changes.

The architecture package records the approved threshold/severity rules while leaving the listed unrelated gates explicit. Archival of this baseline does not implement the approved runtime behavior or approve any remaining gate; separate feature changes own implementation and acceptance.
