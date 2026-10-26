# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Until 1.0.0 any release may change behaviour.

## [Unreleased]

### Added

- Repository foundation: npm workspaces, TypeScript run from source on Node 24, type-aware
  linting, formatting, unit tests, and CI on Linux and Windows with a secret scan.
- `@automate/contracts` 0.1.0 with the `Brief` and `Script` contracts.
- Phase 0 spike harness with six spikes: local narration, local render, script generation,
  image generation, Facebook Reel upload and a TikTok draft through Buffer.
- Delivery plan, architecture overview and five decision records.
- Security policy, contribution guide, issue and pull request templates, Dependabot
  configuration and code owners.

### Changed

- The minimum versions are now Node 24.22.1 and npm 11.19.1, up from Node 24.0.0 and npm 11.

### Verified

- Kokoro narration on the laptop CPU: 55.6 s of speech in 13.4 s with the full-precision model.
- Remotion render on the laptop CPU: a 90 s 1080x1920 video in 95.9 s at 87 MB.

### Not yet verified

- The four spikes that call external services have not been run against live APIs.
