# Spec Delta

## Purpose

Define verifiable shared report-contract deliverables so future backend and map features can be specified independently without claiming they already exist.

## ADDED Requirements

### Requirement: Architecture contract scope
The baseline SHALL supply report DTOs, validators, fixtures and documentation. Runtime endpoint, database, Storage and interface behavior SHALL be specified and verified by separate future feature changes, not represented as delivered by this baseline.

#### Scenario: Architecture completion review
- **WHEN** the team assesses this change for completion or archive
- **THEN** it checks contract-package deliverables and collaboration tasks
- **THEN** no deployed report capability is claimed solely because those artifacts pass

### Requirement: Expanded report and map detail definitions
The contract package SHALL define photo, title, description, catalog category, citizen-reported severity, stage, location, timestamps and citizen confirmation facts for public map detail, without private account or Storage references.

#### Scenario: Detail fixture
- **WHEN** Fran validates a synthetic map-detail fixture
- **THEN** the shared DTO represents every detail field, including a photograph presentation URL and its expiration
- **THEN** the fixture excludes email, author identity and private object paths

### Requirement: Reviewed catalog and validation definitions
The package SHALL define exactly four initially active MVP categories: pothole, missing-light, damaged-sidewalk and faulty-traffic-light, preserving existing IDs. It SHALL support manual selection of all four, active-catalog validation and future reviewed extensions, alongside the approved severity constraints and proposed title limits.

#### Scenario: Approved manual category fixtures
- **WHEN** contract fixtures exercise manual report selection for each initial category
- **THEN** the catalog maps pothole to Baches, missing-light to Falta de luz, damaged-sidewalk to Veredas dañadas and faulty-traffic-light to Semáforos defectuosos
- **THEN** publication accepts each reviewed active ID without requiring a Gemini suggestion and rejects null, unknown or inactive categories

#### Scenario: Identifier compatibility
- **WHEN** the four-entry seed catalog is checked
- **THEN** pothole and missing-light retain their identifiers and the new identifiers use lowercase English kebab-case
- **THEN** no fifth category or implicit other option is active

#### Scenario: Category extension review
- **WHEN** a contributor proposes a category beyond the approved four
- **THEN** documentation requires scope approval and coordinated catalog, validator, AI and fixture review before activation

#### Scenario: Project context reconciliation
- **WHEN** the team checks readiness for implementation
- **THEN** documentation records that the separately authorized openspec/config.yaml update now matches all four approved categories
- **THEN** the four-category product decision remains approved and config.yaml is preserved by the baseline implementation

#### Scenario: Invalid contract input
- **WHEN** contract checks exercise unknown fields, inactive categories, bad coordinates or unreviewed publication
- **THEN** validators reject them using documented field errors

### Requirement: Backend-owned original photograph contract
The package SHALL define explicit multipart publication with reviewed fields, one original photo and a stable idempotency key. Documentation SHALL assign original persistence, report association, private access, safe presentation, recovery and cleanup to the backend.

#### Scenario: Publication reference fixture
- **WHEN** Agus reviews the publication contract and failure examples
- **THEN** they require a stored original associated with every published report and prohibit AI persistence
- **THEN** incomplete operations remain unpublished and retries cannot create another report or delete a committed photo

### Requirement: Publication retry definitions
The package SHALL document account-scoped idempotency with payload fingerprints, conflict detection and concurrency handling. It SHALL distinguish completed replays, in-progress operations, transient storage errors and new intentional publications.

#### Scenario: Repeated publication cases
- **WHEN** contract fixtures exercise the same key with the same payload, a changed payload and a concurrent request
- **THEN** they respectively describe 200 with the same report, 409 IDEMPOTENCY_CONFLICT and 409 PUBLICATION_IN_PROGRESS
- **THEN** first completion is 201 and temporary Storage unavailability is 503 STORAGE_UNAVAILABLE

### Requirement: Independent citizen corroboration definitions
The package SHALL define the approved initial threshold of 3 valid confirmations from distinct authenticated non-author users, backend-configurable without interface changes. Contracts SHALL define an automatic atomic pending-to-citizen-verification transition at the effective threshold, independent of institutional evidence.

#### Scenario: Approved initial threshold fixture
- **WHEN** a pending-report fixture reaches 3 valid confirmations from 3 distinct authenticated non-author users at the initial threshold of 3
- **THEN** it shows threshold 3, policyStatus approved, corroborated true and citizen-verification stage
- **THEN** below the threshold it remains pending, and neither municipal verification nor resolution results from the count

#### Scenario: Invalid and repeated corroborations
- **WHEN** contract examples include the author, anonymous requests, repeated requests or concurrent requests from the same account
- **THEN** only one accepted confirmation per distinct authenticated non-author account contributes to the count
- **THEN** backend acceptance references require atomic count and stage updates without repeated transitions

#### Scenario: Backend-configured threshold
- **WHEN** a contract fixture returns a positive backend threshold T different from 3
- **THEN** it uses T for the pending-to-citizen-verification boundary and supplies the effective threshold and authoritative state to the interface
- **THEN** no frontend release or hardcoded threshold is required

### Requirement: Approved severity contract
The package SHALL define Severity as low, medium or high, labeled baja, media or alta. It SHALL document the approved impact criteria, editable nullable Gemini suggestions and a required valid severity at publication. Severity SHALL NOT automatically grant municipal verification.

#### Scenario: Severity criteria fixtures
- **WHEN** the shared severity definitions are reviewed
- **THEN** baja means molestia o deterioro menor, media means puede dificultar la circulación o el uso del espacio público, and alta means riesgo importante para personas o vehículos
- **THEN** publication validators reject null, unassessed and values outside the three-level scale

#### Scenario: High severity is not municipal authority
- **WHEN** a contract fixture represents severity high
- **THEN** its institutional verification remains independent and no municipal stage is inferred from severity

### Requirement: Current-account confirmation query definition
The package SHALL define authenticated GET /api/reports/{id}/confirmations/me with status, confirmed, confirmedAt, canConfirm, reason and citizen-verification facts including the effective backend threshold. It SHALL keep this response private and separate from public report detail.

#### Scenario: Confirmation state fixtures
- **WHEN** fixture checks cover an unconfirmed account, confirmed account, author and resolved report
- **THEN** each has a documented eligibility result without revealing another account
- **THEN** anonymous and missing-report examples use 401 and 404 respectively

### Requirement: Confirmation mutation precedence definition
The package SHALL define author exclusion, database uniqueness and atomic new confirmations. Existing confirmations SHALL be documented as successful replays even after resolution; new confirmations on resolved reports SHALL be rejected.

#### Scenario: Confirmation edge cases
- **WHEN** the contract check validates mutation examples
- **THEN** author confirmation is 403 AUTHOR_CANNOT_CONFIRM, first qualifying insertion is 201 and a duplicate is 200
- **THEN** an existing confirmation on a resolved report remains 200 while a new one is 409 REPORT_RESOLVED

### Requirement: Four-stage presentation and institutional boundary
The package SHALL define pendiente, verificación ciudadana, verificación municipal and resuelto with independent citizen/institution facts. Municipal operations SHALL remain outside the MVP, and synthetic institutional records SHALL be labeled nonofficial simulation.

#### Scenario: Real MVP fixture
- **WHEN** the package validates a production-shaped MVP example
- **THEN** institutional verification is unavailable with no evidence or resolution timestamp
- **THEN** the four-step presentation does not mark unavailable municipal or resolved steps as completed

#### Scenario: Future authority documentation
- **WHEN** the team reviews the institutional roadmap
- **THEN** municipal verification is reserved for authorized institutional accounts and closure additionally requires database-granted moderator/closure authority
- **THEN** no role grants, municipal mutation endpoint or operative control is part of this MVP

### Requirement: Database and transport boundary documentation
The package SHALL document RLS, uniqueness, private projections, Storage policies, atomic publication finalization and the Spanish error envelope. Constraints SHALL be enforced beyond the interface in future feature acceptance tests.

#### Scenario: Backend handoff
- **WHEN** Agus consumes the architecture handoff
- **THEN** it identifies database and Storage checks for spoofing, self-confirmation, concurrent retries, private-object access and future resolution races
- **THEN** actual migrations and runtime tests remain tasks of the separate backend feature change
