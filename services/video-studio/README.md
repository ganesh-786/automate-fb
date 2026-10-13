# video-studio

Assembles images, narration and captions into the finished video and checks it against every
platform's rules.

- **Status:** not started. Built in Phase 3.
- **Consumes:** `ImageSet`, `VoiceTrack`
- **Produces:** `MediaPackage`: the MP4, a cover image and a QC report.
- **Human gate:** B, creative approval.

## How it works

1. Lays scenes on a timeline with camera motion and crossfades.
2. Adds word-highlight captions inside the area platform controls do not cover.
3. Renders with Remotion to the master profile.
4. Runs automatic QC: resolution, frame rate, codecs, colour space, duration, bitrate, file
   size, loudness, fast-start layout and caption overflow.

## Master profile

1080x1920, 30 fps, H.264 (`yuv420p`, BT.709) with AAC 48 kHz stereo, MP4 with the index at the
front, video capped at 8 Mbps, at most 90 seconds. One file satisfies all four platforms.

## Providers

| Role        | Primary              | Fallback             |
| ----------- | -------------------- | -------------------- |
| Composition | Remotion plus FFmpeg | FFmpeg-only template |
| AI motion   | None by default      | Optional paid clips  |

Remotion is free for individuals and for companies of up to three people.

## Useful alone for

Rendering a captioned video from your own photos and a voice recording.

## Proven in Phase 0

`render-remotion` renders a 30 second clip on this laptop and verifies the master profile.
It also found that Remotion must be told the colour space explicitly. Measured results are in
[docs/phase-0/RESULTS.md](../../docs/phase-0/RESULTS.md).
