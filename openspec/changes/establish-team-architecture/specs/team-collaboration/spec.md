# Spec Delta

## Purpose

Provide verifiable team conventions and instruction handoffs while separating architecture deliverables from future operational product features.

## ADDED Requirements

### Requirement: Owned modules and common contracts
The team SHALL assign AI to Valen, backend and photo persistence to Agus, and frontend/maps to Fran. Shared DTOs, pure validators and synthetic fixtures SHALL define boundaries usable without external credentials.

#### Scenario: Independent frontend work
- **WHEN** Fran starts before providers are available
- **THEN** reviewed fixtures represent expanded map detail, editable AI suggestions and private current-account confirmation results
- **THEN** no real credentials or municipal endorsement are required

#### Scenario: Persistence responsibility
- **WHEN** the backend feature is scoped
- **THEN** Agus owns original-photo storage, association, permissions, idempotency, recovery and cleanup
- **THEN** Valen's module has no report or Storage mutation responsibility

### Requirement: Reviewable contract evolution
Provider and consumer owners SHALL review shared field, category, severity, policy, error and retry changes together. Pending proposals SHALL be visibly distinguished from approved configuration.

#### Scenario: Approved threshold and severity record
- **WHEN** the baseline records the approved product decisions
- **THEN** it identifies initial threshold 3, authenticated distinct non-author confirmations and the automatic citizen-verification transition as approved, with threshold configuration owned by the backend
- **THEN** severity low/medium/high and their impact criteria are approved, and institutional proposals retain their existing scope gates

#### Scenario: Approved four-category scope record
- **WHEN** the team reviews category contract changes
- **THEN** it records pothole, missing-light, damaged-sidewalk and faulty-traffic-light as the exclusively approved initial MVP catalog, with unchanged legacy IDs and shared backend/frontend/AI validation
- **THEN** the separately authorized context reconciliation is recorded as complete: openspec/config.yaml lists all four categories and is preserved during baseline implementation
- **THEN** only additions beyond the approved four require new category approval

### Requirement: Separate functional feature changes
The team SHALL keep this change's tracked tasks and normative specs limited to contract-package and collaboration deliverables. Runtime feature requirements and tests SHALL belong to separate backend, vision and interface changes before implementation.

#### Scenario: Archive baseline
- **WHEN** architecture tasks are completed and reviewed
- **THEN** archive checks verify contract types, validators, fixtures and documentation
- **THEN** neither archive nor passing contract fixtures represents endpoint, RLS, Storage or UI functionality as implemented

### Requirement: Traceable branches and reviews
The team SHALL use chore/team-architecture for the baseline, feature/gemini-vision for Valen, feature/reports-backend for Agus and feature/interface-map for Fran. PRs SHALL identify their OpenSpec change, scope, dependencies and validation.

#### Scenario: Boundary change
- **WHEN** a PR changes a shared API or category catalog
- **THEN** the affected provider and consumer owners review its contract delta, fixtures and compatibility plan before integration
- **THEN** a single editing owner is agreed for shared files in that PR

### Requirement: Additive assistant instructions
Shared team guidance SHALL be added outside the generated Next.js block in AGENTS.md. CLAUDE.md and GEMINI.md SHALL reference that source. Existing files, nested instructions, Claude commands and skills SHALL be preserved.

#### Scenario: Existing entry file
- **WHEN** an assistant entry file already exists at implementation time
- **THEN** its owner reads it before appending a nonconflicting delimited reference section
- **THEN** conflicts are reported rather than resolved by replacement

#### Scenario: Assistant context check
- **WHEN** each assistant starts a read-only onboarding check
- **THEN** it can identify shared instructions, installed Next.js documentation, project scope and its selected change without relying on automatic imports

### Requirement: Individual assistant and resource access
Agus SHALL use his own assistant authentication or independently provisioned credentials. Runtime provider secrets SHALL remain separate from assistant login, server-side and absent from repository artifacts.

#### Scenario: Backend onboarding
- **WHEN** Agus runs fixture-based contract checks
- **THEN** he needs neither Valen's account nor another contributor's environment files or Gemini provider key
- **THEN** any hosted access is granted to his individual account and any required secret uses an approved secret channel

### Requirement: Honest future institutional presentation
Institutional operations SHALL remain outside the configured MVP. Documentation and synthetic examples SHALL distinguish future municipal authority from independent citizen corroborations and SHALL NOT imply simulated official endorsement.

#### Scenario: Municipal fixture review
- **WHEN** a demonstration represents municipal-verification or resolved
- **THEN** it is isolated from production data and visibly labeled Simulación - sin aval municipal
- **THEN** the handoff includes no MVP municipal account grants, operational action controls or mutation endpoints
