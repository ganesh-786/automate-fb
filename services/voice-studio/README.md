# voice-studio

Turns a script's narration into speech with word-level timings.

- **Status:** not started. Built in Phase 2.
- **Consumes:** `Script`
- **Produces:** `VoiceTrack`: a WAV narration and the start and end time of every word.

## How it works

1. Synthesises the narration sentence by sentence and joins the clips.
2. Runs speech recognition over the finished audio to get word timings.
3. Aligns those timings to the script text, so captions show the words that were written even
   when recognition mishears a name or a number.
4. Records the voice, model and output hash in the job ledger.

## Providers

| Role         | Primary                              | Fallback                      |
| ------------ | ------------------------------------ | ----------------------------- |
| Speech       | Kokoro-82M on the local CPU, English | Gemini TTS, then Azure Speech |
| Word timings | Groq Whisper large-v3-turbo          | whisper.cpp                   |

Kokoro's JavaScript build has English voices only. Other languages use Gemini TTS.

## Useful alone for

Voice-overs.

## Proven in Phase 0

`voice-kokoro` synthesises about a minute of narration on this laptop and measures its speed.
Measured results are in [docs/phase-0/RESULTS.md](../../docs/phase-0/RESULTS.md).
