# 0001: Standalone services, with n8n as a replaceable conductor

- **Status:** accepted, 2026-10-13

## Context

The pipeline could be built entirely as n8n workflows, entirely as custom code, or as a mix.
n8n cannot render, synthesise speech or encode video itself, and version 2.0 disables the
Execute Command node by default. Published n8n video templates fill that gap with paid rendering,
voice and posting APIs. A workflow is also not a system another uploader can reuse.

## Decision

Six standalone services do the work. n8n Community Edition conducts them: triggers, waits for
approvals, retries and notifications. n8n passes job IDs only. It never carries media and never
holds a publishing token.

## Consequences

- Any service can be used without the others, and n8n can be swapped for another orchestrator.
- Media never passes through n8n, which matters because external binary storage is a paid n8n
  feature and queue mode cannot use the filesystem for binaries.
- n8n's license covers internal and personal use. Selling this as a product to other users would
  need a different orchestrator or a commercial license.
