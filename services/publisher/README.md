# publisher

Publishes an approved video to each platform through its official API, exactly once.

- **Status:** not started. Core and Facebook in Phase 4; Instagram, YouTube and TikTok in
  Phase 5.
- **Consumes:** `Approval`
- **Produces:** `PublishJob` per target: state, platform post ID and link.

## API

```
GET  /v1/providers/{provider}/capabilities
POST /v1/publish-jobs
GET  /v1/publish-jobs/{id}
POST /v1/publish-jobs/{id}/cancel
POST /v1/publish-jobs/{id}/reconcile
```

Each platform is an adapter that implements `validate`, `prepare`, `upload`, `publish`,
`pollStatus` and `reconcile`.

## Targets

| Target             | Route                                   | Staging                    | AI flag                  |
| ------------------ | --------------------------------------- | -------------------------- | ------------------------ |
| Facebook Page Reel | Native Graph API, local-file upload     | Meta test app, draft state | `is_ai_generated`        |
| Instagram Reel     | Native, same Meta app                   | Private test account       | `is_ai_generated`        |
| YouTube Short      | Native Data API, uploaded private first | Private upload             | `containsSyntheticMedia` |
| TikTok             | Buffer API, manual handoff as fallback  | Buffer draft               | `isAiGenerated`          |

## Rules

- **Approval check:** a job is refused unless its file hash and payload hash match an Approval.
- **Idempotency:** one key per content item and target.
- **Reconcile first:** after a timeout or crash, ask the platform what happened before retrying.
- **Startup:** every unfinished job is reconciled before new ones are accepted.
- **Independence:** a failure on one target never blocks the others.
- **Rate limits:** each platform's daily cap is enforced here, not left to the platform.
- **Tokens:** stored only in this service, encrypted at rest, never logged, checked daily.
- **Pause switch:** one setting stops all publishing.

## Useful alone for

Uploading any MP4, from any tool, to any of the four platforms.

## Proven in Phase 0

`publish-facebook-reel` runs the three-step Reels upload and `publish-buffer-tiktok` creates a
TikTok draft through Buffer. Both need accounts; see
[docs/phase-0/README.md](../../docs/phase-0/README.md).
