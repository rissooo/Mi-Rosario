# Vision boundary — Valen

Reserved for the separate `feature/gemini-vision` change. No provider or endpoint is implemented here.

Consume `../contracts/vision.ts`, the shared active category catalog, error definitions and validators. Future server-only `service.ts` and `provider.ts` own validated Gemini suggestions. The future transport is `POST /api/vision/analyze`.

Analysis never publishes, writes confirmations, uploads to Storage or persists original photos. Return null when category/severity cannot be inferred; preserve manual entry. A still image does not prove a traffic light's behavior. Use “falta de luz” and never infer insecurity. No provider secret belongs in browser imports, fixtures or instructions.

See `../../docs/contracts.md` for limits, provisional decisions and feature acceptance responsibilities.
