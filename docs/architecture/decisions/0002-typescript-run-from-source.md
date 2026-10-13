# 0002: TypeScript run from source on Node 24

- **Status:** accepted, 2026-10-13

## Context

The laptop this runs on has Node 24 and no Python. Every chosen component is a Node library:
n8n, Remotion and kokoro-js. The hosted models are reached over HTTP, so the usual argument for
Python (local model tooling) does not apply. Node 24 runs TypeScript files directly by stripping
types.

## Decision

All services are TypeScript and run from source with `node file.ts`. There is no build step and
no `dist` folder. `tsc --noEmit` is the type checker. The compiler option `erasableSyntaxOnly`
rejects the few TypeScript features Node cannot strip (enums, namespaces, parameter properties).
Imports use explicit `.ts` extensions, and type-only imports use `import type`.

TypeScript is pinned to 6.x because typescript-eslint does not yet support the 7.x native
compiler.

## Consequences

- What is tested is exactly what runs; there is no stale build output.
- Node 24 or newer is required everywhere, including future Docker images.
- Workspace packages export their `.ts` source. Node strips types there because npm links
  workspaces by symlink and Node resolves the real path, which is outside `node_modules`.
- Browser code (the Remotion composition) is `.tsx` and is compiled by Remotion's bundler, not
  by Node.
