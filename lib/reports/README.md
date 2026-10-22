# Reports boundary — Agus

Reserved for the separate `feature/reports-backend` change. This folder contains no persistence implementation.

Future `service.ts`, `repository.ts`, `photos.ts` and `publication.ts` own report orchestration, database mapping, private original Storage, safe viewing derivatives, idempotency, retries and cleanup. Reuse existing session-scoped clients in `utils/supabase/`; do not alter Google authentication as part of this baseline.

The backend owns active-category validation, the initial threshold of 3 valid distinct non-author confirmations, atomic stage updates, eligibility, private current-account confirmation lookup and authorization. RLS/column permissions and Storage policies must be tested directly in the later feature; pure validators are not security enforcement.

Storage and database writes require recovery because they do not share a transaction. No original upload occurs until explicit publication. Municipal roles/actions are outside the MVP. See `../../docs/contracts.md` before authoring runtime specs or migrations.
