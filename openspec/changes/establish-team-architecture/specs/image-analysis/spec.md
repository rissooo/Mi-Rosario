# Spec Delta

## Purpose

Define an editable image-analysis contract package with clear non-persistence and publication boundaries for later vision implementation.

## ADDED Requirements

### Requirement: Analysis contract deliverables
The baseline SHALL provide DTOs, validators, fixtures and documented HTTP definitions for POST /api/vision/analyze. A separate vision feature change SHALL own runtime requirements and provider integration before any implementation claim.

#### Scenario: Contract package review
- **WHEN** Valen reviews the baseline deliverables
- **THEN** they define authenticated multipart image input, Spanish errors and validated suggestion output
- **THEN** passing those checks does not claim that Gemini or the endpoint is deployed

### Requirement: Expanded editable suggestion definitions
The package SHALL define nullable title, description, active-catalog categoryId and severity suggestions plus warnings. The initial category catalog SHALL contain pothole, missing-light, damaged-sidewalk and faulty-traffic-light, shared with manual selection and publication validators and extensible through future review.

#### Scenario: Four-category suggestion fixtures
- **WHEN** contract checks exercise a supported image example for each initial category
- **THEN** valid suggestions use the corresponding active ID from the four-entry catalog
- **THEN** Gemini output cannot activate or invent an additional category

#### Scenario: Insufficient category confidence
- **WHEN** a fixture cannot confidently determine an image category
- **THEN** categoryId is null with an explanatory warning and all four manual selections remain available
- **THEN** publication still requires a citizen-reviewed active category

#### Scenario: Lighting evidence boundary
- **WHEN** an image fixture concerns lighting
- **THEN** citizen-facing terminology remains falta de luz
- **THEN** suggestions and warnings do not infer insecurity from the photograph

#### Scenario: Traffic-light operating condition
- **WHEN** a still-image fixture shows a traffic light but does not establish whether it works correctly
- **THEN** analysis uses categoryId null rather than inventing a malfunction and asks for manual review and citizen-declared observations
- **THEN** the citizen can select faulty-traffic-light and describe observed behavior without presenting that declaration as visual proof or municipal verification

#### Scenario: Editable approved severity suggestion
- **WHEN** a Gemini suggestion fixture provides severity
- **THEN** the value is low, medium or high using the approved baja/media/alta criteria, or null when uncertain
- **THEN** the citizen can correct it and must select a valid level before publication; severity never grants municipal verification

#### Scenario: Uncertain output fixture
- **WHEN** an analysis fixture cannot support a field
- **THEN** that field is null and warnings explain the limitation
- **THEN** all non-null values conform to reviewed catalog and field constraints

#### Scenario: Scope-sensitive category fixture
- **WHEN** the validator receives an unsupported or inactive category identifier
- **THEN** it rejects the provider structure
- **THEN** adding new incident categories requires explicit scope/catalog review rather than arbitrary AI output

### Requirement: No publication or photo persistence from analysis
The documented analysis boundary SHALL prohibit report creation, confirmation writes and photo persistence. Only the backend publication contract SHALL own original-photo storage after explicit citizen publication.

#### Scenario: Analysis-only review
- **WHEN** a citizen only requests analysis in the future flow reference
- **THEN** the documented outcome is an editable draft with no report or Storage object
- **THEN** the original file remains available in the draft for a later separate publication request

### Requirement: Review and manual completion definitions
The package SHALL document editing title, description, category, severity and location before publication. Analysis SHALL NOT supply authoritative location, official verification, final stage or an instruction to publish.

#### Scenario: Failed analysis fixture
- **WHEN** a timeout or provider failure fixture is selected
- **THEN** the reference flow preserves original photo and draft, permits manual field completion and requires explicit publication
- **THEN** skipping analysis does not remove the publication photograph requirement

### Requirement: Image and provider error definitions
The package SHALL define one JPEG, PNG or WebP image up to 4 MiB, content validation, a 20-second provider deadline and private provider credentials. Raw images, secrets and provider diagnostics SHALL be excluded from error examples and fixtures.

#### Scenario: Analysis error contract check
- **WHEN** fixtures exercise invalid input, unsupported media, excessive size, invalid provider output, service unavailability and timeout
- **THEN** documented statuses/codes are 422 VALIDATION_ERROR, 415 UNSUPPORTED_MEDIA_TYPE, 413 PAYLOAD_TOO_LARGE, 502 ANALYSIS_FAILED, 503 ANALYSIS_UNAVAILABLE and 504 ANALYSIS_TIMEOUT
- **THEN** no fixture exposes real citizen photographs or credentials
