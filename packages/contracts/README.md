# @automate/contracts

Versioned data contracts exchanged between services. This package is the only code the services
share: a service depends on these schemas and on nothing inside another service.

| Contract       | Written by     | Read by                            | Status  |
| -------------- | -------------- | ---------------------------------- | ------- |
| `Brief`        | intake form    | script-studio                      | v0.1.0  |
| `Script`       | script-studio  | image-studio, voice-studio, Gate A | v0.1.0  |
| `ImageSet`     | image-studio   | video-studio                       | Phase 2 |
| `VoiceTrack`   | voice-studio   | video-studio                       | Phase 2 |
| `MediaPackage` | video-studio   | review-console                     | Phase 3 |
| `Approval`     | review-console | publisher                          | Phase 4 |
| `PublishJob`   | publisher      | n8n, review-console                | Phase 4 |

## Rules

- Every document carries `schemaVersion`. A service rejects a major version it does not know.
- Additive changes bump the minor version; breaking changes bump the major version.
- Schemas are [zod](https://zod.dev) objects. Validate at every service boundary, both on the way
  in and on the way out.
- Fields a language model fills are always required; "none" is an empty string or empty array.
