# 0005: Hosted free tiers behind provider adapters

- **Status:** accepted, 2026-10-13

## Context

The stack must cost nothing to run. The laptop has integrated graphics and 13.7 GB of RAM, so
local image and video models are not practical: Wan2.1's smallest model needs 8.19 GB of GPU
memory and about four minutes per five-second clip on an RTX 4090. Free tiers, on the other
hand, change without notice: during 2026 Gemini's free tier lost image generation and
Pollinations ended its free tier.

## Decision

Each generation step calls a hosted free tier through an adapter, with a named fallback:

| Step           | Primary                       | Fallback                          |
| -------------- | ----------------------------- | --------------------------------- |
| Script         | Gemini Flash                  | Groq, then Ollama Qwen3 offline   |
| Images         | FLUX.2 klein 4B on Workers AI | FLUX.1 schnell, then Pexels stock |
| Voice          | Kokoro on the local CPU       | Gemini TTS, then Azure Speech     |
| Caption timing | Groq Whisper                  | whisper.cpp                       |

The provider is chosen in configuration. No service code names a provider outside its adapter.
Free-tier prompts may be used by the provider to improve its products, so prompts never contain
secrets or personal data.

## Consequences

- Losing a free tier is a configuration change, not a rewrite.
- A local GPU stack (ComfyUI with FLUX or Wan) becomes one more adapter if a 12 GB or larger
  NVIDIA card is added.
- The free product is still images with camera motion, narration and captions. Generative video
  clips are an optional paid upgrade.
