# Architecture overview

Six standalone services turn a prompt into a reviewed, published short video. n8n conducts them
and can be replaced without touching a service. What gets built when is in [PLAN.md](../PLAN.md).

## Flow

```
Intake form
  |
[1 script-studio]   three variants + critic      > Gate A: script and storyboard
  |-- [2 image-studio]   one 9:16 image per scene
  |-- [3 voice-studio]   narration + word timings
  |
[4 video-studio]    render + automatic QC        > Gate B: creative approval
  |
[5 review-console]  platform details             > Gate C: publish approval
  |
[6 publisher]       Facebook | Instagram | YouTube | TikTok   (each independent)
  |
Reconciliation, audit trail, daily operations

n8n: triggers, waits, retries, notifications. No publishing tokens, no media.
```

## Services

| #   | Service        | Consumes                 | Produces                                       | Useful alone for                     |
| --- | -------------- | ------------------------ | ---------------------------------------------- | ------------------------------------ |
| 1   | script-studio  | `Brief`                  | `Script`                                       | Scripts for videos you film yourself |
| 2   | image-studio   | `Script`                 | `ImageSet`                                     | Thumbnails                           |
| 3   | voice-studio   | `Script`                 | `VoiceTrack`                                   | Voice-overs                          |
| 4   | video-studio   | `ImageSet`, `VoiceTrack` | `MediaPackage` (MP4, cover, QC report)         | Rendering your own photos            |
| 5   | review-console | `MediaPackage`           | `Approval` (decision, file hash, payload hash) | Gating any video                     |
| 6   | publisher      | `Approval`               | `PublishJob` (post ID, link, status)           | Uploading any MP4                    |

## What keeps a service standalone

- **It owns everything it needs:** its folder, configuration, secrets, command-line tool,
  localhost HTTP API, tests and Dockerfile.
- **It shares only contracts:** the versioned schemas in `packages/contracts`. No service imports
  another service, and there is no shared database.
- **It writes only its own file.** Each service adds one document to the job folder, so two
  services never write the same file.
- **Its providers are swappable.** Every model or platform sits behind an adapter chosen in
  configuration.
- **It is open at both ends.** An MP4 from any tool can enter at review-console, and a
  `MediaPackage` can be handed to any other uploader.

## Job folder

```
data/jobs/<job-id>/
  brief.json            intake
  script.json           script-studio
  images.json           image-studio      (+ images/)
  voice.json            voice-studio      (+ narration.wav)
  media.json            video-studio      (+ final.mp4, cover.jpg)
  approval.json         review-console
  publish/<target>.json publisher
  ledger.jsonl          one provenance record per generated asset
```

A job moves through: scripted, script approved, assets ready, rendered, QC passed, creative
approved, publish approved. Each publish target then moves through queued, uploading, processing
and ends as published, failed or needs-manual.

## Repository layout

```
.
├── docs/                  plan, architecture, decision records, phase reports
├── packages/
│   └── contracts/         versioned schemas: the only code services share
├── services/              the six services, one folder each
├── orchestration/
│   └── n8n/               exported workflows and instance settings
├── spikes/
│   └── phase-0/           executable evidence for the plan's riskiest assumptions
├── data/                  runtime only, git-ignored: jobs, caches, reports
└── .github/workflows/     continuous integration
```

## Inside a service

Every service follows the same ports-and-adapters layout, so swapping a provider touches one
folder:

```
services/<name>/
├── src/
│   ├── domain/        pure rules and types, no I/O
│   ├── application/   use cases: orchestrate the domain through ports
│   ├── ports/         interfaces the application needs (model, storage, clock)
│   ├── adapters/      one implementation per provider (gemini, groq, cloudflare, ...)
│   ├── http/          routes and request validation
│   ├── cli/           command-line entry point
│   ├── config/        environment schema
│   └── main.ts
├── Dockerfile
├── package.json
└── README.md
```

## Toolchain

| Concern      | Choice                                                                    |
| ------------ | ------------------------------------------------------------------------- |
| Runtime      | Node 24. TypeScript sources run directly; there is no build step          |
| Packages     | npm workspaces, one lockfile, install scripts blocked unless allow-listed |
| Types        | TypeScript 6, strict, checked with `tsc --noEmit`                         |
| Validation   | zod at every service boundary                                             |
| Tests        | Vitest, colocated as `*.test.ts`                                          |
| Lint, format | ESLint with type-aware rules, Prettier                                    |
| CI           | GitHub Actions: lint, format, types, tests                                |

## Decisions

| #                                                           | Decision                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| [0001](decisions/0001-hybrid-orchestration.md)              | Standalone services, with n8n as a replaceable conductor |
| [0002](decisions/0002-typescript-run-from-source.md)        | TypeScript run from source on Node 24                    |
| [0003](decisions/0003-contracts-only-shared-code.md)        | Contracts are the only shared code                       |
| [0004](decisions/0004-localhost-and-approval-binding.md)    | Localhost-only services and approval-bound publishing    |
| [0005](decisions/0005-hosted-free-tiers-behind-adapters.md) | Hosted free tiers behind provider adapters               |
