# 0003: Contracts are the only shared code

- **Status:** accepted, 2026-10-13

## Context

Each service must work alone and plug into any upload system. Shared libraries are convenient
but couple services: a change for one can break another, and a service cannot be lifted out of
the repository without them.

## Decision

Services share one package, `@automate/contracts`: versioned zod schemas for the documents that
cross service boundaries. Nothing else is shared. A service never imports another service and
there is no shared database. Small utilities (logging setup, HTTP helpers) are duplicated per
service until a third copy proves they are stable.

Every document carries `schemaVersion`. A service rejects a major version it does not know.
Fields that a language model fills are always required, with an empty string or array for
"none", because structured-output modes handle optional fields unreliably.

## Consequences

- A service is its own folder plus the contracts package, and can move to its own repository.
- Some duplication is accepted in exchange for independence.
- A breaking contract change is visible: it is a major version bump that every reader must adopt.
