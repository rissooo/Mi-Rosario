# Spec Delta

## Purpose

Provides durable server persistence, private photograph storage, atomic idempotency, citizen corroborations, and secure database projections for incident reports.

## ADDED Requirements

### Requirement: Authenticated report publication and storage
The backend SHALL accept multipart publication containing reviewed report fields, a valid original image file, and an Idempotency-Key header from an authenticated citizen session. The report fields SHALL include geographic coordinates and human-readable address (street and optional number) conforming to shared contracts. It SHALL store the original file in a private storage bucket under the author's path before creating the report record in the database.

#### Scenario: Successful report creation
- **WHEN** an authenticated citizen submits a valid publication request with an original image and a new UUID Idempotency-Key
- **THEN** the system stores the original image in the private storage bucket
- **THEN** the system inserts the report record with street address, coordinates, and initial stage "pending"
- **THEN** the system returns HTTP 201 Created with the public Report DTO containing the complete location (coordinates and address) and a signed viewing photo URL

#### Scenario: Invalid or missing idempotency key
- **WHEN** a publication request is submitted without an Idempotency-Key header or with a malformed key
- **THEN** the system rejects the request with HTTP 400 Bad Request without writing to storage or the database

#### Scenario: Storage failure during publication
- **WHEN** an authenticated citizen publishes a report but the storage service fails to store the original image
- **THEN** the system aborts publication, inserts no database record, and returns HTTP 503 STORAGE_UNAVAILABLE

#### Scenario: Definitive database failure compensation
- **WHEN** an original image is successfully uploaded but the subsequent database insertion suffers a definitive failure
- **THEN** the system deletes the uploaded image from the private storage bucket as compensation
- **THEN** the system marks the idempotency record as failed or unlocks it to permit future retries

### Requirement: Durable publication idempotency
The backend SHALL track publication idempotency scoped by citizen account and operation. It SHALL distinguish in-progress operations from completed ones and detect payload changes for the same key.

#### Scenario: Completed publication replay
- **WHEN** an authenticated citizen retries a publication using an Idempotency-Key that already completed with the same payload
- **THEN** the system returns HTTP 200 OK with the existing Report DTO and a refreshed signed photo URL
- **THEN** no duplicate database row or storage object is created

#### Scenario: Concurrent in-progress publication retry
- **WHEN** a publication retry arrives while an existing request with the same key is actively locked and processing
- **THEN** the system returns HTTP 409 Conflict with code PUBLICATION_IN_PROGRESS and a Retry-After header

#### Scenario: Reused key with altered payload
- **WHEN** a publication request reuses an Idempotency-Key with a different payload hash than the original request
- **THEN** the system returns HTTP 409 Conflict with code IDEMPOTENCY_CONFLICT

### Requirement: Public report catalog and geospatial querying
The backend SHALL expose public endpoints to query published reports without disclosing author identity or internal storage paths. Public listings SHALL support category, status, and bounding-box filters with keyset pagination.

#### Scenario: Anonymous public list query
- **WHEN** an unauthenticated client requests reports within a geographic bounding box
- **THEN** the system queries the secure public view and returns HTTP 200 OK with sanitized Report DTOs
- **THEN** author user IDs, emails, and private storage paths are completely omitted
- **THEN** each report includes coordinates and human-readable address matching the Location contract
- **THEN** photo fields contain valid temporary signed viewing URLs

#### Scenario: Exclusion of hidden or unapproved stages
- **WHEN** a client queries public reports
- **THEN** the system only returns reports with stages "pending", "citizen-verification", or "resolved"
- **THEN** rejected or hidden reports are strictly excluded from the query results

### Requirement: Citizen confirmation and atomic transition
The backend SHALL allow authenticated citizens who are not the report's author to confirm a report. It SHALL enforce at most one confirmation per account per report and atomically advance the stage to citizen-verification upon reaching the effective confirmation threshold.

#### Scenario: First qualifying citizen confirmation
- **WHEN** an authenticated citizen who is not the author confirms a pending report for the first time
- **THEN** the system records the confirmation with the citizen's user ID from the active session
- **THEN** the system returns HTTP 201 Created with confirmed status true and updated verification count

#### Scenario: Author self-confirmation rejection
- **WHEN** the author of a report attempts to confirm their own report
- **THEN** the system rejects the confirmation with HTTP 403 Forbidden and code AUTHOR_CANNOT_CONFIRM
- **THEN** no confirmation record is inserted and the count is not incremented

#### Scenario: Duplicate confirmation replay
- **WHEN** a citizen confirms a report that they have already confirmed
- **THEN** the system returns HTTP 200 OK with confirmed status true without inserting a duplicate row

#### Scenario: Atomic transition at confirmation threshold
- **WHEN** a report receives its third distinct valid citizen confirmation meeting the effective threshold of 3
- **THEN** the system atomically updates the report stage from "pending" to "citizen-verification"
- **THEN** the system records the corroboration timestamp
- **THEN** subsequent concurrent confirmations do not repeat or re-trigger the state transition

#### Scenario: Rejection of confirmations on resolved reports
- **WHEN** an authenticated citizen attempts to add a new confirmation to a report in "resolved" stage
- **THEN** the system rejects the request with HTTP 409 Conflict and code REPORT_RESOLVED

### Requirement: Database security and projection enforcement
The database SHALL enforce row-level security and permission boundaries directly in PostgreSQL. Direct client mutations and unauthorized cross-account reads SHALL be prohibited.

#### Scenario: Anonymous query on internal tables
- **WHEN** an anonymous request attempts to read the internal reports table directly using the publishable key
- **THEN** the database row-level security policy rejects the read or returns an empty result set

#### Scenario: Private confirmation inspection
- **WHEN** an authenticated citizen queries confirmation records
- **THEN** row-level security allows the citizen to see only their own confirmations and rejects reading confirmations belonging to other citizens

#### Scenario: Unauthorized direct client mutations
- **WHEN** a client attempts direct INSERT, UPDATE, or DELETE on the reports or report_confirmations tables
- **THEN** the database rejects the operation because no client mutation policies are granted
