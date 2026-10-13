# review-console

The local web page where a human approves scripts, videos and the exact posts to be published.
It is the only place publishing authority is granted.

- **Status:** not started. Built in Phase 4.
- **Consumes:** `Script` (Gate A), `MediaPackage` (Gates B and C)
- **Produces:** `Approval`: the decision, who made it and when, the SHA-256 of the approved file
  and the hash of each platform's exact payload.

## Gates

| Gate        | The reviewer sees                                                                             | Actions                                                     |
| ----------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A. Script   | Script and storyboard, critic scores, factual claims to check, policy flags                   | Approve, edit, pick another variant, regenerate             |
| B. Creative | Final video, cover, captions, QC report, asset and license list, AI-disclosure recommendation | Approve, reject, redo one scene, change voice, edit caption |
| C. Publish  | The exact payload for each platform                                                           | Publish, schedule, change targets, cancel                   |

## Rules

- It binds to localhost only. There is no approval from a phone, because that would need an
  endpoint reachable from the internet.
- The Approval log is append-only.
- Per-platform forms enforce each platform's limits before the reviewer can confirm.
- AI-generated disclosure is on by default for every platform.

## Useful alone for

Gating any video from any tool before it is published.
