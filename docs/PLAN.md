# Delivery plan

Prompt in, reviewed short video out, published to Facebook, Instagram, YouTube and TikTok.

- **Status:** Phase 0 (risk spikes) in progress. Results: [phase-0/RESULTS.md](phase-0/RESULTS.md).
- **Architecture:** [architecture/overview.md](architecture/overview.md).
- **Facts checked on:** 2026-10-13. Platform rules and free tiers change; re-check the linked
  source before relying on a number.

## 1. Operating model

One creator, one laptop, one or two videos a day. Every service listens on localhost and all
platform traffic is outbound. Three rules are non-negotiable:

1. Nothing is published without a recorded human approval of that exact file and payload.
2. No duplicate posts.
3. Official APIs only. No browser automation, no password collection.

## 2. Platform constraints

| Platform                 | Route                    | Verified rules                                                                                                                                                                   |
| ------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Facebook Page            | Native Graph API (Reels) | Permissions `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`. 9:16, 3-90 s, 30 API Reels per Page per 24 h. Local-file upload. `is_ai_generated` flag.           |
| Instagram (professional) | Native, same Meta app    | Container then publish; containers expire after 24 h. 50-100 API posts per 24 h (the doc states both), 300 MB. Video must be at a public URL at publish time. `is_ai_generated`. |
| YouTube                  | Native Data API          | 100 uploads per day in a dedicated quota bucket. `containsSyntheticMedia` flag. OAuth app must be "In production" or the refresh token expires after 7 days.                     |
| TikTok                   | Buffer API (free plan)   | TikTok's own API keeps unaudited apps private-only and its audit excludes personal tools. Buffer: 25 posts per 24 h, 5 hashtags, 2,200 characters, `isAiGenerated` field.        |

Meta specifics that shape the build:

- Posts made by an app in Development mode are visible only to people with a role on the app,
  so production publishing needs the app in Live mode.
- Standard Access is granted automatically and covers people with a role on the app, which
  should cover publishing to your own Page without App Review. One secondary source disputes
  this for Live mode, so it is the first thing Phase 0 tests.
- A Meta test app always runs in Development mode, which makes it the staging environment.

## 3. Stack

| Function                              | Choice                                                     | Verified free limit                                | Fallback                                     |
| ------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| Orchestration                         | n8n Community Edition 2.x, pinned, single instance         | Free self-hosted                                   | Scheduled scripts                            |
| Services                              | TypeScript on Node 24, schema validation at every boundary | n/a                                                | n/a                                          |
| State                                 | SQLite per service plus the job folder                     | n/a                                                | PostgreSQL at scale-out                      |
| Script                                | Gemini Flash, three variants plus a critic pass            | Free; limits shown per project in AI Studio        | Groq `gpt-oss-120b`; Ollama Qwen3 8B offline |
| Images                                | FLUX.2 klein 4B on Cloudflare Workers AI                   | 10,000 neurons per day                             | FLUX.1 schnell; Pexels stock                 |
| Voice                                 | Kokoro-82M via kokoro-js on CPU (English)                  | Local, unlimited                                   | Gemini TTS free tier; Azure Speech           |
| Caption timing                        | Groq Whisper large-v3-turbo, aligned to the script text    | 2,000 requests per day                             | whisper.cpp                                  |
| Composition                           | Remotion plus FFmpeg                                       | Remotion is free for individuals and teams up to 3 | FFmpeg-only template                         |
| AI motion (optional)                  | Hugging Face ZeroGPU for one or two clips                  | 5 GPU-minutes per day                              | Veo 3.1 Lite at $0.05 per second             |
| Public media link (Instagram, Buffer) | Cloudflare R2, deleted after publish                       | 10 GB, free egress                                 | n/a                                          |
| Review                                | Local web console                                          | n/a                                                | n/a                                          |
| Alerts                                | Telegram bot, outbound only                                | Free                                               | Email                                        |

**Master render profile**, valid on all four platforms: 1080x1920, 30 fps, H.264 (`yuv420p`,
BT.709) with AAC 48 kHz stereo audio, MP4 with the index at the front (fast-start), video capped
at 8 Mbps, at most 90 s. Phase 0 measured a 90 s render at 87 MB.

Free means no subscription. True generative video has no sustained free API and cannot run on
this laptop, so the free product is still images with camera motion, narration and captions.

## 4. Human gates

| Gate        | The reviewer sees                                                                             | Actions                                                     |
| ----------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A. Script   | Script and storyboard, critic scores, factual claims to check, policy flags                   | Approve, edit, pick another variant, regenerate             |
| B. Creative | Final video, cover, captions, QC report, asset and license list, AI-disclosure recommendation | Approve, reject, redo one scene, change voice, edit caption |
| C. Publish  | The exact payload for each platform                                                           | Publish, schedule, change targets, cancel                   |

Details asked at Gate C:

- **Facebook:** description and hashtags, optional title, now / schedule / draft, AI-generated.
- **Instagram:** caption, share to feed, cover frame, collaborators, AI-generated.
- **YouTube:** title, description, tags, category, visibility, schedule, made for kids, altered
  or synthetic content, playlist.
- **TikTok:** caption (at most 5 hashtags), AI-generated, now or schedule.

Content rules enforced at Gate A: no impersonation or unauthorised voice cloning, no likeness of
private people or minors, no unreviewed medical, legal, financial or political claims, licensed
assets only.

## 5. Publisher

API: `GET /v1/providers/{p}/capabilities`, `POST /v1/publish-jobs`, `GET /v1/publish-jobs/{id}`,
plus `cancel` and `reconcile` on a job. Each platform adapter implements `validate`, `prepare`,
`upload`, `publish`, `pollStatus` and `reconcile`.

| Target             | Staging (non-public)          | Enforced limits                           | AI flag                  |
| ------------------ | ----------------------------- | ----------------------------------------- | ------------------------ |
| Facebook Page Reel | Meta test app and draft state | 30 per 24 h, 3-90 s                       | `is_ai_generated`        |
| Instagram Reel     | Private test account          | 50-100 per 24 h, 300 MB                   | `is_ai_generated`        |
| YouTube Short      | Private upload                | 100 uploads per day                       | `containsSyntheticMedia` |
| TikTok via Buffer  | Buffer draft                  | 25 per 24 h, 5 hashtags, 2,200 characters | `isAiGenerated`          |

Rules:

- **Approval check:** a job is refused unless its file hash and payload hash match an Approval.
- **Idempotency:** one key per content item and target.
- **Reconcile first:** after a timeout or crash, ask the platform what happened before any retry.
- **Startup:** every unfinished job is reconciled before new ones are accepted.
- **Independence:** a failure on one target never blocks the others.
- **Pause switch:** one setting stops all publishing.

## 6. n8n workflows

| Workflow              | Trigger         | Steps                                                                             |
| --------------------- | --------------- | --------------------------------------------------------------------------------- |
| 1. Intake and script  | Form            | Validate, call script-studio, open Gate A, wait for the decision                  |
| 2. Production         | Gate A approval | image-studio and voice-studio in parallel, video-studio, QC, open Gate B, notify  |
| 3. Publish dispatcher | Gate C approval | Split per target, create a publish job for each                                   |
| 4. Reconciliation     | Every 5 minutes | Find jobs in processing or unknown state, reconcile, notify the result            |
| 5. Operations         | Daily           | Token health, quota counters, service health, cleanup, backup, weekly `n8n audit` |
| Error handler         | Any failure     | Alert with job ID and error                                                       |

n8n stores no publishing tokens and carries no media: it passes job IDs between services.

## 7. Security controls

| Area        | Control                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------ |
| Network     | All services and n8n on localhost only; no tunnel; the n8n editor is never exposed         |
| Local APIs  | Shared-secret header on every call; browser-origin requests rejected                       |
| Tokens      | Publishing tokens live only in publisher, encrypted at rest and never logged               |
| Scopes      | The three Page permissions, Instagram publish, `youtube.upload`, one Buffer key            |
| Accounts    | Two-factor login on Facebook, Google, Buffer and Cloudflare                                |
| Media links | Unguessable short-lived R2 links, deleted after publish, lifecycle rule as backstop        |
| n8n         | Pinned version, Execute Command disabled, community nodes off                              |
| Code        | Lockfile, npm install scripts blocked unless allow-listed, secret scan before every commit |
| Recovery    | Nightly backup of approvals, publish log, n8n data and encryption key                      |

## 8. Environments

- **Development:** recorded fixtures, no network publishing.
- **Staging:** Meta test app, Facebook drafts, private YouTube uploads, Buffer drafts, a private
  Instagram test account.
- **Production:** the Live Meta app and the real accounts.

## 9. Phases and exit tests

| Phase                  | Deliverable                                                                         | Exit test                                                               |
| ---------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0. Spikes and accounts | Six risk spikes, repository foundation                                              | Each spike passes or its fallback is chosen; a public Reel is confirmed |
| 1. Foundation          | Contracts, secret scan in CI, script-studio, Gate A                                 | A prompt yields three scored variants                                   |
| 2. Assets              | image-studio, voice-studio, provenance ledger                                       | A script yields images and timed narration with ledger entries          |
| 3. Render              | video-studio and automatic QC                                                       | Output passes QC for all four platforms                                 |
| 4. First publish       | review-console (Gates B and C), publisher core, Facebook adapter, workflows 1-4     | A real Reel published from a typed prompt with a full audit trail       |
| 5. More platforms      | Instagram, YouTube and TikTok adapters                                              | The same video live on all four                                         |
| 6. Release gate        | Hardening, runbooks, the tests in section 10                                        | Every item passes                                                       |
| 7. Optional            | AI motion clips, search adapter, offline model, analytics, Docker and a server move | Per item                                                                |

## 10. Release gate

- **Volume:** 30 full runs across three unrelated niches pass QC and publish to staging.
- **Failure drills:** provider outage, expired media link, revoked token, interrupted upload, and
  a timeout followed by reconciliation.
- **Duplicates:** the same job submitted twice produces one post.
- **Authorization:** an unapproved file or altered payload is refused every time.
- **Secrets:** the scan of repository and logs is clean; `n8n audit` findings are resolved or
  accepted.
- **Rights:** every asset in the 30 runs has a rights and provenance record.
- **Recovery:** a backup restores onto a clean folder.

Runbooks delivered with Phase 6: expired token, exhausted quota, publish stuck in processing,
platform rejection, restore from backup, emergency pause.

## 11. Risks

| Risk                                                      | Response                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Meta does not publish to your own Page without App Review | First Phase 0 test; fallback is Buffer for Facebook and Instagram, or App Review   |
| Buffer changes its free plan or API                       | Manual handoff pack remains; the adapter is isolated                               |
| A free tier shrinks                                       | Named fallback per stage, selected in config                                       |
| Laptop asleep or lost                                     | Native scheduling on Facebook and YouTube, startup reconciliation, nightly backups |
| Content judged unoriginal                                 | Three gates, a creator voice profile, a posting cap                                |

## 12. Open decisions

1. **Narration language.** Assumed English (Kokoro, local). Hindi or Nepali moves the voice to
   Gemini TTS.
2. **TikTok route.** Assumed Buffer's free API. The alternative is a manual handoff to the phone.
3. **Visual style.** Assumed animated stills. AI motion clips cost about $0.40 each.

If this becomes a product for other users, n8n's license does not cover it. That is the point to
replace or license the orchestrator and add PostgreSQL, Redis, object storage and tenant
isolation.

## 13. Primary sources

- Meta: [Reels publishing](https://developers.facebook.com/docs/video-api/guides/reels-publishing),
  [video_reels reference](https://developers.facebook.com/docs/graph-api/reference/page/video_reels/),
  [app modes](https://developers.facebook.com/docs/development/build-and-test/app-modes),
  [access levels](https://developers.facebook.com/docs/graph-api/overview/access-levels),
  [test apps](https://developers.facebook.com/docs/development/build-and-test/test-apps),
  [Instagram publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing)
- YouTube: [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert),
  [revision history](https://developers.google.com/youtube/v3/revision_history)
- TikTok: [content sharing guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines)
- Buffer: [API overview](https://support.buffer.com/article/859-does-buffer-have-an-api),
  [API reference](https://developers.buffer.com/reference.html)
- Models: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing),
  [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/),
  [Groq limits](https://console.groq.com/docs/rate-limits),
  [ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu)
- n8n: [Community Edition features](https://docs.n8n.io/deploy/host-n8n/community-edition-features/),
  [2.0 breaking changes](https://docs.n8n.io/2-0-breaking-changes/)
