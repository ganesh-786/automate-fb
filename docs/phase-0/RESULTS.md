# Phase 0 results

- **Date:** 2026-10-13
- **Machine:** AMD Ryzen 5 7535HS, 12 logical cores, 13.7 GB RAM, integrated Radeon graphics,
  Windows 11, Node 24.20.0
- **Evidence:** each spike's `report.json` and artifacts under `data/phase-0/<spike-id>/`.
  Timings below are from the final run and varied by a few percent between runs.

## Outcome

| Spike                   | Status  | Result                                                                               |
| ----------------------- | ------- | ------------------------------------------------------------------------------------ |
| `voice-kokoro`          | Passed  | 55.6 s of narration synthesised in 13.4 s on the CPU, 0.24x real time                |
| `render-remotion`       | Passed  | 30 s clip rendered in 32.2 s; 90 s clip in 95.9 s; output matches the master profile |
| `script-gemini`         | Not run | Needs `GEMINI_API_KEY`                                                               |
| `image-cloudflare`      | Not run | Needs `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`                             |
| `publish-facebook-reel` | Not run | Needs `META_PAGE_ID` and `META_PAGE_ACCESS_TOKEN`                                    |
| `publish-buffer-tiktok` | Not run | Needs `BUFFER_API_KEY` and `SPIKE_PUBLIC_VIDEO_URL`                                  |

The four networked spikes are implemented and their request and response handling is covered by
unit tests, but **none has been run against a live API yet**. Phase 0 is not complete until they
are, and the plan's largest risk (public posting to your own Facebook Page without App Review)
is still open. Account setup steps are in [README.md](README.md).

## Measurements

### Narration: Kokoro-82M on CPU

| Model variant           | Download | Synthesis time for 55.6 s of speech | Real-time factor |
| ----------------------- | -------- | ----------------------------------- | ---------------- |
| Full precision (`fp32`) | 326 MB   | 13.4 s                              | 0.24x            |
| 8-bit quantized (`q8`)  | 92 MB    | 65.1 s                              | 1.17x            |

A 90 s narration, the longest the pipeline allows, takes about 22 s with the full-precision
model.

### Render: Remotion, 1080x1920 at 30 fps

| Clip | Render time | Per video second | File size | Bitrate  |
| ---- | ----------- | ---------------- | --------- | -------- |
| 30 s | 32.2 s      | 1.07 s           | 29.9 MB   | 8.4 Mbps |
| 90 s | 95.9 s      | 1.07 s           | 87.2 MB   | 8.1 Mbps |

Both outputs: H.264 `yuv420p`, BT.709 limited range, AAC 48 kHz stereo, index at the front
(fast-start). The 30 s clip is the one left on disk; the 90 s run was a one-off measurement
(`--set seconds=90`). The first run also downloads a 120 MB headless browser (12 s) and bundles
the composition (19 s); later runs reuse both.

Frames were extracted and inspected by eye: scenes fill the frame, captions sit above the
bottom quarter, and the highlighted word matches the narration.

## Findings

1. **Use the full-precision Kokoro model.** It is the best-sounding variant and about five times
   faster than the quantized one on this CPU. The plan assumed quantized would be the fast
   choice; that was wrong.
2. **Retry the first model load.** The first load straight after the 326 MB download failed once
   with a file-access error and succeeded on the next attempt. The spike now retries once, and
   voice-studio should do the same or download the model in a setup step.
3. **Remotion must be told the colour space.** Without `colorSpace: 'bt709'` the video was tagged
   full-range (`yuvj420p`), which players and platform transcoders can show with the wrong
   contrast. The master profile now requires BT.709 and the spike checks it.
4. **Cap the bitrate.** Uncapped, the 30 s clip was 60 MB at 16.9 Mbps. With an 8 Mbps cap it is
   29.9 MB, and a 90 s video stays under 90 MB, well inside Instagram's 300 MB limit.
5. **Rendering is not a bottleneck.** About 1.1 s per second of video, so the FFmpeg-only
   fallback is not needed.
6. **TypeScript runs from source.** Node 24 executes the `.ts` files directly, including the
   shared contracts package, with no build step.

## Decisions taken

| Area            | Decision                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Voice           | Kokoro full precision is the primary English voice                                                                                       |
| Composition     | Remotion is confirmed; the FFmpeg-only template stays a documented fallback, not a build item                                            |
| Master profile  | Adds BT.709 limited range and an 8 Mbps video cap                                                                                        |
| TypeScript      | Pinned to 6.0.x: typescript-eslint does not yet support the 7.x native compiler                                                          |
| zod             | Pinned to 4.5.4 for the whole workspace, the exact version Remotion requires                                                             |
| Install scripts | npm blocks dependency install scripts by default; all four are explicitly denied in `package.json` because both spikes work without them |

## Limits of this evidence

- Scene images were synthetic plates with film grain, not generated images. Decoding cost is the
  same; compression will differ.
- Caption timings were approximated from sentence lengths. Production timings come from speech
  recognition.
- Timings are from one laptop on mains power with no other heavy work running.
- CI is configured but has not run yet: it runs for the first time when the repository is pushed
  to GitHub. Its steps pass locally, and the secret scan was run locally with gitleaks 8.30.1.

## Open items

- [ ] Run the four networked spikes and record them here.
- [ ] Confirm by hand that a published test Reel opens in a logged-out browser.
- [ ] Push to GitHub, confirm the first CI run is green, and enable the repository settings
      listed in SECURITY.md.
- [ ] Decide narration language, TikTok route and visual style (see PLAN.md, "Open decisions").
