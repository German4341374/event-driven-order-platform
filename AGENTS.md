# Repository Guidance

- Keep source code, documentation, configuration, and commits in English.
- Preserve transactional boundaries between aggregate changes and outbox inserts.
- Do not claim exactly-once delivery; consumers must remain idempotent.
- Run `npm run check` before submitting changes.
- Never add production credentials or real customer data.
