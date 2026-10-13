# Contributing

How to work in this repository. Read [docs/architecture/overview.md](docs/architecture/overview.md)
first: it explains the service boundaries these rules protect.

## Setup

Requires Node 24 and npm 11 or newer. The versions are enforced at install time.

```sh
npm install
npm run check
```

TypeScript sources run directly on Node. There is no build step and no `dist` folder.

## Workflow

Nothing is ever committed to `main` directly. Every change arrives through a pull request.

1. Branch from `main`: `feat/<topic>`, `fix/<topic>`, `docs/<topic>` or `chore/<topic>`.
2. Make the change with its tests and documentation.
3. Run `npm run check`. CI runs exactly the same steps on Linux and Windows.
4. Open a pull request.

### Pull request descriptions

A description has three sections and nothing else:

- **Context:** the situation and the problem.
- **What it solves:** the outcome, and what is out of scope.
- **How it solves it:** the approach in plain words, one text diagram, and a last line starting
  `Checked by:` that lists the commands you ran and their results. Add `Not checked:` for
  anything you could not verify.

Write it the way you would explain it to a colleague: plain sentences, real names and numbers,
no checklist and no list of files. Issues use the same three sections and end with `Done when:`.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(publisher): add the Instagram adapter
fix(voice-studio): retry the first model load
docs(plan): record Phase 0 results
```

Types in use: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`. The scope is the service,
package or area touched.

## Code standards

### TypeScript

- **Erasable syntax only.** No enums, namespaces or constructor parameter properties. Node strips
  types but does not transform code, and the compiler enforces this.
- **Explicit `.ts` extensions** in relative imports.
- **`import type`** for type-only imports, as a separate statement.
- **No `any`.** Parse unknown data with a zod schema at the boundary instead of casting.
- **Comments explain why**, not what. State constraints, sources and non-obvious decisions.

### Architecture

- A service depends on `@automate/contracts` and on no other service.
- Every document that crosses a service boundary is validated with its contract, on the way in
  and on the way out.
- A provider (a model, a platform) is called only from its adapter. Nothing outside the adapter
  names the provider.
- Media never passes through n8n. Workflows carry job IDs.
- Changing a contract is a version bump. A breaking change bumps the major version.

### Tests

- Tests live next to the code as `*.test.ts`.
- No test touches the network. Inject `fetch` and script the responses.
- Test the behaviour a caller relies on, including the failure paths: a rejected upload, a
  malformed response, a missing credential.
- Fake secrets in fixtures must be obviously fake, for example `fake-gemini-key`. The secret
  scanner in CI fails on anything that looks real.

## Security rules

These are not negotiable. See [SECURITY.md](SECURITY.md).

- Never commit a secret. `.env` is git-ignored; `.env.example` holds names only.
- Never log a token, a signed URL or a private media URL.
- Use official platform APIs only. No browser automation and no password collection.
- Do not weaken the publishing rules (approval check, idempotency, reconcile before retry)
  without a decision record that explains why.
- Do not add a dependency install script to the allow list without reviewing what it runs.

## Documentation

| Change                                    | Update                                           |
| ----------------------------------------- | ------------------------------------------------ |
| Behaviour of a service                    | That service's `README.md`                       |
| Scope, phases or a verified platform rule | [docs/PLAN.md](docs/PLAN.md)                     |
| A structural or cross-cutting choice      | A new record in `docs/architecture/decisions/`   |
| Anything user-visible                     | [CHANGELOG.md](CHANGELOG.md), under "Unreleased" |

A decision record is short: the context, the decision and its consequences. Number it after the
last one and never rewrite an accepted record; supersede it with a new one.

Platform rules and free tiers change often. When you state one, link the primary source and the
date you checked it.

## Adding things

### A provider adapter

1. Define what the application needs as an interface in the service's `ports/`.
2. Implement it in `adapters/<provider>/`, with the provider's request and response shapes
   parsed by zod.
3. Select it in configuration. No other code changes.
4. Test it with scripted responses, including an error response and a malformed one.

### A spike

A spike proves or disproves one risky assumption. Add a file under `spikes/phase-0/src/spikes/`,
register it in `registry.ts`, and state the risk and an exit criterion that can fail. Record the
outcome in the phase's `RESULTS.md`.
