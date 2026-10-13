# 0004: Localhost-only services and approval-bound publishing

- **Status:** accepted, 2026-10-13

## Context

The system holds tokens that can post publicly to the creator's accounts. The two worst outcomes
are a leaked token and an unreviewed or duplicated public post. The system runs on a personal
laptop, not a hardened server.

## Decision

- Every service and n8n bind to localhost. Nothing accepts inbound connections from the
  internet, so there is no tunnel and no public webhook. Review happens in a local web console.
- Publishing tokens live only in the publisher service, encrypted at rest. n8n holds none.
- The publisher refuses any job unless the file's SHA-256 and the hash of the exact platform
  payload match a recorded Approval.
- Each (content, target) pair has one idempotency key. After a timeout or crash the publisher
  asks the platform what happened before it retries.
- The only public artefact is a short-lived, unguessable media link for the platforms that pull
  video by URL (Instagram, Buffer). It is deleted once the platform confirms.

## Consequences

- Approving from a phone is not possible without exposing an endpoint, so it is not offered.
  Telegram is used for outbound notifications only.
- Scheduled posts rely on platform-native scheduling where it exists (Facebook, YouTube), since
  the laptop may be asleep.
- Compromising n8n does not yield platform tokens.
