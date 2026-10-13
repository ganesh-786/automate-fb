# Phase 0 spikes

Executable evidence for the plan's riskiest assumptions. How to run them and set up accounts:
[docs/phase-0/README.md](../../docs/phase-0/README.md). Outcomes:
[docs/phase-0/RESULTS.md](../../docs/phase-0/RESULTS.md).

```
src/
├── cli.ts          entry point: `npm run spike -- ...`
├── registry.ts     the spikes, in run order, and the named groups
├── harness/        runner, report schema, secret redaction, test helpers
├── lib/            small media and HTTP utilities the spikes share
├── remotion/       the video composition (browser code, bundled by Remotion)
└── spikes/         one file per spike, with its tests alongside
```

A spike is an object with an id, the risk it retires, an exit criterion, the environment
variables it needs, and a `run` function. The runner skips it when a variable is missing, turns a
thrown error into a failed report, and strips secrets from everything it writes.

These spikes are kept after Phase 0. They are the quickest way to re-check a provider when a
free tier or an API changes. Code that proves out here moves into the matching service.
