# Shared architecture and contract sheet

This package prepares independent work by Valen (AI), Agus (backend) and Fran (frontend). It supplies TypeScript DTOs, pure validators and synthetic examples. **No HTTP handler, database table, Storage operation, Gemini integration, map or screen is implemented.** A passing fixture test does not prove service behavior, idempotency, concurrency or authorization.

## Decision record

The user approved the architecture implementation, four categories, severity criteria, an original publication photo, initial citizen threshold 3 and the four-stage model. `openspec/config.yaml` now contains all four categories and a quoted proposal rule; previous references to a narrower context/YAML defect have been resolved without changing config in this implementation.

| Decision | State |
| --- | --- |
| Four initial active category IDs and manual selection | Approved |
| Severity low/medium/high with editable Gemini suggestions | Approved |
| Original photo stored only by backend on explicit publication | Approved; future implementation |
| Three distinct authenticated non-author confirmations | Approved; backend-configurable threshold |
| Automatic pending → citizen-verification at effective threshold | Approved; future atomic database implementation |
| Independent institutional evidence; no municipal operations in MVP | Approved scope boundary |
| Title length 5–120 Unicode code points | Provisional; used only for contract evaluation until product approval |
| Original-photo retention and account deletion | Pending production decision |
| Policy versioning/retroactive treatment when changing threshold | Pending operational decision; initial threshold 3 is approved |
| Institutional identity/role mapping and compatible future scope | Pending post-MVP decision |

No approval/review by Agus or Fran is inferred from user approval or generated files. Their contract review and individual onboarding checks are outstanding.

## Package entry points

| File | Exports / purpose |
| --- | --- |
| `lib/contracts/categories.ts` | Extensible `CategoryId`, explicit `InitialMvpCategoryId`, catalog and active-membership check |
| `lib/contracts/reports.ts` | Severity/criteria, stages/labels, publication, original-file input, safe photo presentation, report/query/list and private confirmation DTOs |
| `lib/contracts/vision.ts` | Nullable suggestion, analysis request/response, deadline constant |
| `lib/contracts/errors.ts` | Shared error codes/status mapping and exclusive `ApiResult<T>` envelope |
| `lib/contracts/validation.ts` | Pure runtime validation/parsing; no network, session, database or provider dependency |
| `lib/contracts/fixtures.ts` | Synthetic valid/error examples and isolated institutional simulations |

Import named exports from these files. Browser consumers must not import repositories, provider adapters or server Supabase clients. No SDK is required to use the contracts.

## Catalog and severity

| ID | Label | Manual / AI suggestion |
| --- | --- | --- |
| `pothole` | Baches | Both |
| `missing-light` | Falta de luz | Both |
| `damaged-sidewalk` | Veredas dañadas | Both |
| `faulty-traffic-light` | Semáforos defectuosos | Both, subject to evidence limits |

Exactly these four entries are active. IDs retain lowercase English kebab-case and the legacy IDs remain unchanged. A future reviewed catalog can add entries; a TypeScript string alone never authorizes a category. Validators reject unknown/inactive IDs. No generic “other” category exists.

Gemini can return `categoryId: null` when uncertain. All four manual selections remain available; publication requires an active category. A photograph does not necessarily prove a traffic light is malfunctioning: uncertain fixtures return null and invite citizen-declared observations in the editable description. Those observations are not photographic proof or municipal endorsement. Use “falta de luz”; do not infer insecurity from lighting images.

| Value | Label | Criterion |
| --- | --- | --- |
| `low` | Baja | Molestia o deterioro menor. |
| `medium` | Media | Puede dificultar la circulación o el uso del espacio público. |
| `high` | Alta | Riesgo importante para personas o vehículos. |

AI severity is nullable; the citizen corrects/selects it before publication. Published severity is required and has exactly those three values. Severity never implies verification or resolution.

## Input and output contracts

`ReportFields` requires title, description, categoryId, severity, location `{ latitude, longitude, address }` and `reviewed: true`.

**Dirección (change `add-report-address`, pendiente de revisión de Agus y Valen).** `address` es `{ street, number }`. `street` es la calle: se le quitan los espacios sobrantes y debe tener de 2 a 80 caracteres. `number` es la altura: un entero de 1 a 99999, o `null` cuando el lugar no tiene altura (un parque o una plaza). Las coordenadas ubican el marcador en el mapa; la dirección es lo que leen los vecinos. El contrato no verifica que las dos describan el mismo lugar. `Report` devuelve la ubicación con la misma forma. `PublishReportRequest` adds one original `File`; serialize report fields as the multipart `report` JSON field, with the file in `image` and a required UUID `Idempotency-Key` header. The key is scoped to account + operation in the future backend.

`Report` adds server-owned ID, status, photo, UTC creation/update timestamps, citizen verification facts, institutional availability/evidence and nullable resolution time. It has no email, private author identity, original object path or publication bookkeeping. `Photo` contains ID, authorized HTTPS viewing URL, URL expiration, MIME and byte size. The URL represents a safe viewing derivative; the unchanged original remains private. Synthetic URLs use `example.invalid` and are intentionally not fetchable photographs.

`CitizenVerification` returns `confirmationCount`, effective positive-integer `threshold`, `policyStatus: 'approved'` and `corroborated`. Frontend renders server-owned facts; it must not compute authoritative transitions from the exported initial threshold constant.

`MyConfirmation` contains reportId, authoritative status, confirmed/confirmedAt, canConfirm/reason and citizenVerification. This response is private and no-store. Reason precedence for display is resolved, author, already-confirmed, then null. The mutation response additionally guarantees confirmed true.

## Planned HTTP boundary — not implemented

| Owner | Method / path | Input | Success |
| --- | --- | --- | --- |
| Valen | POST `/api/vision/analyze` | Authenticated multipart image | 200 `{ data: { suggestion } }` |
| Agus | POST `/api/reports` | Authenticated multipart + idempotency header | 201 first completion, 200 completed replay, `{ data: Report }` |
| Agus | GET `/api/reports` | Public categoryId/status/bbox/limit/cursor | 200 `{ data: { items, nextCursor } }` |
| Agus | GET `/api/reports/{id}` | Public UUID | 200 `{ data: Report }` |
| Agus | GET `/api/reports/{id}/confirmations/me` | Authenticated UUID | 200 `{ data: MyConfirmation }` |
| Agus | POST `/api/reports/{id}/confirmations` | Authenticated UUID and `{}` | 201 first insert, 200 existing, `{ data: ConfirmationResult }` |

Errors use `{ error: { code, message, fieldErrors? } }`; messages are Spanish. `ERROR_STATUS` defines the error-to-status mapping. Framework-generated 405 responses are transport exceptions. The future HTTP boundary must verify identity and same-origin mutation protection rather than accept caller identity fields.

File/field errors must be classified at the future transport boundary:

| HTTP | Code | Meaning |
| --- | --- | --- |
| 413 | PAYLOAD_TOO_LARGE | Original file exceeds 4 MiB or total request exceeds the applicable body limit |
| 415 | UNSUPPORTED_MEDIA_TYPE | Request/file format is unsupported or the image content does not match the supported declared format |
| 422 | VALIDATION_ERROR | Supported, size-acceptable input has invalid fields, missing photo, invalid category/coordinates, or a supported image that cannot be decoded |

Malformed JSON remains 400 INVALID_JSON. `validatePublishReportRequest` is a generic pure field/metadata validator: its failures currently use VALIDATION_ERROR, including size/MIME metadata failures. Do not blindly map every failure from that function to 422 in a handler. The future HTTP adapter must enforce request/file size and supported media first and return the corresponding 413/415; then use field validation for 422. Actual streaming limits, signatures and decoding remain backend/vision feature work. These notes and fixtures do not implement a transport adapter.

## Validation implemented here

- Strict object shapes, required fields and nested unknown-field rejection; trimmed text by Unicode code points. Provisional title 5–120, description 10–1000.
- Active categories, three severities, four-stage type, finite coordinate ranges (not a Rosario municipality polygon), UUID and valid UTC calendar dates.
- Dirección obligatoria en la ubicación: calle de 2 a 80 caracteres sin espacios sobrantes, altura entera de 1 a 99999 o `null`, sin campos adicionales.
- Required original `File`, allowed MIME and 1 byte–4 MiB metadata. **These checks do not decode the image or verify its signature.** Real content/decoded-image limits and total multipart size belong to the future transport. Constants document 4 MiB + 64 KiB total multipart and 16 KiB JSON limits.
- Nullable AI fields, at most five warnings of 1–200 code points, no authoritative location/status/identity fields in suggestions. Validators check structure, not the truth of text, confidence, language or visual evidence.
- Public DTO shapes, HTTPS photo URL syntax, threshold/count/corroboration consistency, and default rejection of institutional data in MVP report examples. Validating a URL never authorizes its access.
- Private confirmation shapes/eligibility consistency, exclusive success/error envelopes, and example error codes/messages.
- List query allowed keys, repeats, numeric limits (1–100/default 50), bounding-box ranges/order, opaque cursor version/UUID/time and normalized filter binding. `parseReportListQuery` consumes URLSearchParams; `validateReportListQuery` consumes typed numeric limits. Both the request and cursor's bbox are validated and normalized to comma-separated JavaScript number strings. Decimal spellings, whitespace, exponent notation and negative zero that represent the same numbers share a cursor (for example, 0,0,1,1 and 0.0,-0,1e0,1). No rounding/tolerance is used: different numeric bounds, category/status changes, absent versus present bbox, invalid ranges and unknown/repeated fields remain rejected. Use the returned normalized bbox when constructing a cursor in the future backend. Cursor decoding is neither authorization nor pagination execution.

`validateApiResult(value, validator)` validates a response envelope; `validateReport`, `validateAnalyzeImageResponse`, `validateMyConfirmation` and `validateReportList` validate their payloads. Validation returns `{ valid: true, value }` or `{ valid: false, error }`. Request normalization returns trimmed fields without modifying input. Pure validators must not be mistaken for session checks, RLS or business mutations.

## Confirmation and retry contract cases

Citizen confirmations are unique per authenticated non-author account/report. At effective threshold T (initially 3), the future backend atomically checks/records the insertion and advances pending to citizen-verification. Municipal evidence stays unavailable in the MVP. Duplicate insertions must not increase counts or repeat transitions. Examples include a server-returned threshold of 5 to avoid frontend coupling to 3.

| Publication case | Planned result |
| --- | --- |
| First completed operation | 201, new report |
| Same key/account and identical validated fields/photo fingerprint | 200, same report ID; viewing URL may refresh |
| Key reused with different payload | 409 IDEMPOTENCY_CONFLICT |
| Same operation still active | 409 PUBLICATION_IN_PROGRESS; Retry-After |
| Temporary photo storage failure | 503 STORAGE_UNAVAILABLE; retain file/draft/key |

The future backend stores operation fingerprints/leases, publishes only after the original reference and safe viewing resource are ready, and reconciles partial DB/Storage failures. Cleanup must never delete a committed original. This package does not implement those operations.

Confirmation mutation precedence: authenticate, find published report, reject author (403), replay existing confirmation (200 even after resolution), reject a new confirmation on resolved (409), otherwise insert uniquely (201; concurrent duplicates 200). Anonymous is 401, missing/unpublished report 404. Future database transactions must serialize insertion against resolution. No real resolution endpoint is part of this MVP.

The complete four-stage vocabulary remains unchanged. `MVP_REPORT_STAGES` / `MvpReportStage` contain only pending and citizen-verification. `FUTURE_INSTITUTIONAL_STAGES` / `FutureInstitutionalStage` contain municipal-verification and resolved, reserved for future authorized institutional functionality. Real MVP reports keep institutional availability unavailable and evidence/resolution times null.

`validateReport`, `validateMyConfirmation` and `validateConfirmationResult` reject institutional states by default. Only isolated, clearly labeled future-simulation checks pass `{ allowInstitutionalSimulation: true }`; a request must never control that option. It is validation of example data, not a role grant or municipal feature switch. The existing documented replay-after-resolution behavior is retained in labeled future contract cases and checked explicitly under that simulation option. Query status vocabulary still describes all four stages; querying a future stage neither enables a mutation nor invents institutional records.

## Fixture review sheet

Open this document on a mobile viewport with Fran; no application screen is required for baseline review. Cross-check the exported fixture objects with the DTOs:

Each exported example is independent of other examples, including nested locations, photos, verification facts and response bodies. Use `cloneFixture(example)` for a private editable draft in each consumer/test rather than editing the exported singleton itself. Copies use structuredClone, preserving mutable draft behavior without sharing references; this does not alter the DTOs. Tests check object-graph isolation and direct edits of nested data as well as independent consumer copies.

| Example | What to inspect |
| --- | --- |
| `REPORT_FIELDS_FIXTURES` / `REPORT_FIXTURES` | One per category, editable fields, required photo presentation and all marker-detail fields |
| `SUGGESTION_FIXTURES` | Four valid suggestions; uncertain category and traffic-light operation return null with a warning |
| `ANALYSIS_ERROR_CASES` | Spanish error envelopes: ANALYSIS_FAILED/502, ANALYSIS_UNAVAILABLE/503 and ANALYSIS_TIMEOUT/504; no provider call or actual timeout is executed |
| `VERIFICATION_FIXTURES` | Below/at 3, alternate threshold 5, high severity without institutional evidence |
| `MY_CONFIRMATION_FIXTURES` | Eligible, author excluded, already confirmed, at threshold |
| `PUBLICATION_CASES` / `CONFIRMATION_CASES` | Documented status/envelope shapes, duplicates and failures; not executed services |
| `INSTITUTIONAL_SIMULATIONS` | Isolated and labeled “Simulación - sin aval municipal”; not production seed or official data |

**Mobile review and teammate acceptance are pending.** The tests validate data structure and consistency only. No actual marker is selected, image rendered, municipal action performed or citizen identity counted by a backend.

## Branches, PRs and next changes

| Owner / branch | Next feature and dependencies |
| --- | --- |
| Valen / `feature/gemini-vision` | Author functional vision specs; validated server-only Gemini adapter and analyze transport; depends on shared catalog/errors/auth; no report/Storage writes |
| Agus / `feature/reports-backend` | Author functional backend specs; inspect real schema; additive migrations/RLS, original Storage/derivative, publication/recovery, list/detail and corroborations; depends on shared contracts/fixtures |
| Fran / `feature/interface-map` | Author functional UI specs; manual categories, reviewed suggestions, photo/retry flow and map/detail; starts with fixtures, integrates after providers pass runtime acceptance |
| All / future institutional proposal | Scope/authority approval first; no MVP municipal accounts, action controls or mutation routes |

Work on the reviewed baseline branch `chore/team-architecture`; proposed integration target is `main`. Owners update their own feature branches from the merged baseline. Use focused English Conventional Commits, OpenSpec-linked PRs explaining scope, dependencies, changed contracts and check results. UI feature PRs include mobile evidence. No commits, PR creation, pushes, merges or archive were authorized by this baseline implementation request.

Provider and consumer owners review boundary changes together. Assign one editor per PR for shared contracts, package files, proxy or instructions. Preserve other owners' changes; do not force-push their branches. Existing branch protection is not asserted. Archives happen only after each change's own requirements/tasks and review are satisfied. Baseline archive never claims endpoints/RLS/Storage/map functionality is delivered.

Agus must later test real authorization, self-confirmation rejection, unique/concurrent requests, publication recovery and private object access. Valen tests actual image decoding/provider errors and zero persistence. Fran tests actual mobile review, photo access/refresh, retry behavior and confirmation eligibility. None of that evidence can be supplied by this package's synthetic examples.
