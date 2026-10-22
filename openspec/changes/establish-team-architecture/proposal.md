# Proposal

## Why

Mi Rosario needs one reviewed architecture and contract baseline so Valen, Agus and Fran can develop independently without incompatible payloads or unsafe persistence. This change establishes that baseline; it does not claim that report, vision or map features already operate.

## What Changes

- Preserve Valen (AI), Agus (backend/Supabase) and Fran (frontend/maps), existing routes, authentication and additive assistant instructions.
- Define a contract package for editable AI suggestions, reviewed report publication with an original photograph, map detail and independent citizen corroborations.
- Assign original photo upload, report association, access control, compensation/cleanup and idempotent retries exclusively to the backend. Gemini only analyzes a transient image and never publishes or persists it.
- Extend report/suggestion contracts with title, category catalog, citizen-reported severity, four-stage presentation and photograph metadata. The approved initial MVP catalog contains exactly Baches (pothole), Falta de luz (missing-light), Veredas dañadas (damaged-sidewalk) and Semáforos defectuosos (faulty-traffic-light). Preserve existing IDs and keep the catalog extensible only through future reviewed additions.
- Define manual selection of all four categories and nullable Gemini suggestions restricted to the active catalog. Insufficient visual confidence yields null, never an invented category; traffic-light operation may require citizen-declared information, and lighting photographs must not imply insecurity.
- Specify current-account confirmation lookup, author exclusion, repeated confirmation behavior, resolved-report restrictions and repeat-publication semantics.
- Record the approved initial threshold of 3 valid confirmations from distinct authenticated non-author citizens, configurable by the backend without interface changes. Reaching the effective threshold automatically moves a pending report to citizen-verification, never municipal verification.
- Define the approved severity levels low, medium and high with citizen-editable Gemini suggestions: minor nuisance/deterioration, possible obstruction of circulation/public-space use, and significant risk to people or vehicles respectively. Severity never grants municipal verification.
- Separate architecture requirements from future feature requirements: these delta specs describe the contract package and collaboration rules. Runtime acceptance targets live in design.md and the feature handoffs in tasks.md until separate feature changes specify and implement them.

## Capabilities

### New Capabilities

Existing change paths are preserved; their requirements now concern verifiable contract-baseline deliverables, not unimplemented runtime behavior.

- `image-analysis`: Shared analysis contract definitions, validation examples and non-persistence/review boundaries.
- `citizen-reports`: Shared publication, photo, detail, lifecycle and corroboration contracts with fixtures and retry/error definitions.
- `team-collaboration`: Ownership, additive instructions, individual assistant access and separate feature-change governance.

### Modified Capabilities

None in the main specification inventory. This revises the existing change, without creating future feature specs or claiming delivered product capabilities.

## Impact

The user has explicitly authorized the architecture baseline implementation: shared DTOs, pure validators, synthetic fixtures, module-boundary documentation and additive assistant instructions. Routes, migrations, Storage and UI implementations remain separate future changes. Teammate reviews and onboarding evidence are tracked independently from technical delivery.

Planned APIs retain `POST /api/vision/analyze`, publication/list/detail/confirmations and add authenticated `GET /api/reports/{id}/confirmations/me`. Original photograph publication changes the previous JSON-only contract to multipart plus an idempotency key. The old `open | closed` contract is superseded in the design, not migrated in code.

### Scope and configuration conflicts

- The separately approved context update is complete: openspec/config.yaml now lists all four MVP categories. There is no outstanding category-context discrepancy. The architecture implementation preserves that file and its other scope exclusions.
- Storage is already part of the configured stack; publication photos do not introduce a new incident domain.
- Institutional roles are explicitly outside the configured MVP. Municipal verification and resolution are future reserved operations only; no municipal accounts, APIs or operational controls are introduced. The four stages can be explained visually, with institutional stages unavailable and no simulated official claims.
- Configuration says only a moderator closes an incident. The future institutional proposal narrows eligibility to an authorized institutional account with database-granted closure/moderator permission; it does not grant that power to arbitrary institutional or ordinary moderator accounts. Role mapping and any scope/config revision must be approved in a separate future change.
- The architecture baseline remains small; its mobile deliverable is a credential-free contract fixture review, not a working end-to-end product. Full mobile acceptance belongs to subsequent feature changes.
- No road repair, heatmap, statistics, notifications or categories beyond the approved four are introduced by these contracts. No runtime functionality is enabled here. Confirmation counts support incident display.
- The separately authorized YAML correction is complete: rules.proposal[0] is quoted and retains its original small-scope meaning. No configuration changes are part of this implementation.

The hosted database and Storage configuration remain unverified. Existing `app/`, `utils/supabase/`, callback, login/logout, `/todos`, generated Next.js instructions and Claude workflows are preserved.
