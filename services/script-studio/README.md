# script-studio

Turns a creator's brief into a script and storyboard ready for human review.

- **Status:** not started. Built in Phase 1.
- **Consumes:** `Brief`
- **Produces:** `Script`: hook, scenes (narration, image prompt, on-screen text, camera move,
  duration), call to action, factual claims to check, and caption drafts per platform.
- **Human gate:** A, script and storyboard.

## How it works

1. Writes three script variants from the brief.
2. A critic pass scores each on hook, clarity, pacing, niche fit and factual risk.
3. A policy check flags impersonation, likenesses of private people, and medical, legal,
   financial or political claims.
4. The best variant, its scores and its claims list go to Gate A.

## Providers

| Role   | Primary                 | Fallback                                  |
| ------ | ----------------------- | ----------------------------------------- |
| Writer | Gemini Flash, free tier | Groq `gpt-oss-120b`, then Ollama Qwen3 8B |
| Critic | Same model, second call | Same                                      |

## Useful alone for

Writing scripts for videos you film yourself.

## Proven in Phase 0

`script-gemini` requests a script through Gemini's structured output and validates it against
the `ScriptDraft` contract.
