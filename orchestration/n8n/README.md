# n8n orchestration

n8n conducts the services: it triggers work, waits for human decisions, retries and notifies.
It passes job IDs only. It never carries media and never holds a publishing token.

- **Status:** not started. Workflows are built in Phase 4, once the services they call exist.
- **Edition:** Community Edition 2.x, self-hosted, one pinned version, single instance.

## Workflows

| Workflow              | Trigger         | Steps                                                                             |
| --------------------- | --------------- | --------------------------------------------------------------------------------- |
| 1. Intake and script  | Form            | Validate, call script-studio, open Gate A, wait for the decision                  |
| 2. Production         | Gate A approval | image-studio and voice-studio in parallel, video-studio, QC, open Gate B, notify  |
| 3. Publish dispatcher | Gate C approval | Split per target, create a publish job for each                                   |
| 4. Reconciliation     | Every 5 minutes | Find jobs in processing or unknown state, reconcile, notify the result            |
| 5. Operations         | Daily           | Token health, quota counters, service health, cleanup, backup, weekly `n8n audit` |
| Error handler         | Any failure     | Alert with job ID and error                                                       |

Exported workflow JSON will live in `workflows/`.

## Instance settings

- Bound to localhost. The editor is never exposed to the internet.
- The Execute Command node stays disabled, which is the 2.0 default.
- Community nodes are off.
- Binary data mode is irrelevant by design: no workflow handles a file.
- On Windows, set `N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=false`.
- Back up the n8n data folder and its encryption key with the nightly backup.

## Limits to know

- n8n's license covers internal and personal use, not resale as a product.
- n8n documents npm installs as deprecated from version 3.0, so Docker becomes its home when
  this moves to a server.
- Telegram's in-chat approval needs a public HTTPS endpoint, so approvals happen in
  review-console and Telegram is used for outbound alerts only.
