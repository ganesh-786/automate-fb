# image-studio

Generates one vertical still image per scene of an approved script.

- **Status:** not started. Built in Phase 2.
- **Consumes:** `Script`
- **Produces:** `ImageSet`: one 9:16 image per scene, plus a provenance record for each.

## How it works

1. Prefixes every scene prompt with the job's style description, so scenes look related.
2. Generates each image at a native 9:16 size with a fixed seed per job.
3. Checks each result decodes and has the size asked for.
4. Records model, version, license, prompt, seed and output hash in the job ledger.
5. Regenerates a single scene on request from Gate B.

## Providers

| Role   | Primary                                  | Fallback                          |
| ------ | ---------------------------------------- | --------------------------------- |
| Images | FLUX.2 klein 4B on Cloudflare Workers AI | FLUX.1 schnell, then Pexels stock |

The free allocation is 10,000 neurons a day. By the published rate an 864x1536 image costs about
132 neurons, which is roughly nine videos of eight scenes each.

## Useful alone for

Thumbnails and cover images.

## Proven in Phase 0

`image-cloudflare` requests one image and verifies its format and exact dimensions.
