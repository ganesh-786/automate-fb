# Services

Six standalone services. Each can be run and used without the others; they agree only on the
schemas in [`packages/contracts`](../packages/contracts/README.md).

| Service                                    | Consumes                 | Produces       | Built in | Status      |
| ------------------------------------------ | ------------------------ | -------------- | -------- | ----------- |
| [script-studio](script-studio/README.md)   | `Brief`                  | `Script`       | Phase 1  | Not started |
| [image-studio](image-studio/README.md)     | `Script`                 | `ImageSet`     | Phase 2  | Not started |
| [voice-studio](voice-studio/README.md)     | `Script`                 | `VoiceTrack`   | Phase 2  | Not started |
| [video-studio](video-studio/README.md)     | `ImageSet`, `VoiceTrack` | `MediaPackage` | Phase 3  | Not started |
| [review-console](review-console/README.md) | `MediaPackage`           | `Approval`     | Phase 4  | Not started |
| [publisher](publisher/README.md)           | `Approval`               | `PublishJob`   | Phase 4  | Not started |

These folders hold only a README until their phase begins. The Phase 0 spikes in
[`spikes/phase-0`](../spikes/phase-0/README.md) already prove the core of several of them.

## Rules every service follows

- It depends on `@automate/contracts` and on no other service.
- It exposes the same operations two ways: a command-line tool and an HTTP API bound to
  localhost.
- Long work is a job: `POST` returns an ID at once, and the caller polls for the result.
- It validates every document on the way in and on the way out.
- Each provider it calls sits behind an adapter that configuration selects.
- It reads secrets from its own environment and never logs them.

## Layout

```
services/<name>/
├── src/
│   ├── domain/        pure rules and types, no I/O
│   ├── application/   use cases: orchestrate the domain through ports
│   ├── ports/         interfaces the application needs (model, storage, clock)
│   ├── adapters/      one implementation per provider
│   ├── http/          routes and request validation
│   ├── cli/           command-line entry point
│   ├── config/        environment schema
│   └── main.ts
├── Dockerfile
├── package.json
└── README.md
```
