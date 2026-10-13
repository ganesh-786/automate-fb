# Phase 0: risk spikes

Each spike proves or disproves one assumption the plan depends on, before anything is built on
it. A spike writes a report and its artifacts to `data/phase-0/<spike-id>/`. Outcomes are
recorded in [RESULTS.md](RESULTS.md).

## Spikes

| Spike                   | Risk it retires                                                   | Needs                                           |
| ----------------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| `voice-kokoro`          | Kokoro may not run, or be too slow, on a laptop without a GPU     | Nothing                                         |
| `render-remotion`       | Rendering 1080x1920 on this CPU may be too slow or off-spec       | Nothing                                         |
| `script-gemini`         | The free tier may not return a schema-valid script                | `GEMINI_API_KEY`                                |
| `image-cloudflare`      | The free tier may not serve native 9:16 images                    | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` |
| `publish-facebook-reel` | A self-owned Meta app may not publish publicly without App Review | `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN`        |
| `publish-buffer-tiktok` | Buffer's free plan may not allow TikTok video posts via API       | `BUFFER_API_KEY`, `SPIKE_PUBLIC_VIDEO_URL`      |

## Running

```sh
npm run spike -- --list                    # status of every spike
npm run spike -- local                     # the two that need no accounts
npm run spike                              # everything; spikes without credentials are skipped
npm run spike -- script-gemini             # one spike
npm run spike -- render-remotion --set seconds=60
```

A spike ends as **passed**, **failed** or **skipped**. Skipped means its credentials are not in
`.env`; earlier evidence on disk is left untouched. The command exits non-zero if any spike
failed.

## Safety

- `publish-facebook-reel` saves a **draft** by default. It publishes publicly only with
  `--publish`.
- `publish-buffer-tiktok` only ever creates a draft.
- Secret values are stripped from logs and reports before they are written.
- Delete the test draft or Reel after each run.

## Setting up accounts

Copy `.env.example` to `.env` and fill in one block at a time. All four accounts are free.

### 1. Gemini (`script-gemini`)

1. Open [Google AI Studio](https://aistudio.google.com/apikey) and create an API key.
2. Set `GEMINI_API_KEY`.

Free-tier prompts may be used by Google to improve its products. Do not put private data in
prompts.

### 2. Cloudflare Workers AI (`image-cloudflare`)

1. Create a Cloudflare account. The account ID is on the Workers & Pages overview page.
2. Under My Profile, API Tokens, create a token from the "Workers AI" template.
3. Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

### 3. Meta (`publish-facebook-reel`)

This spike answers the plan's biggest open question, so run it in two steps.

1. At [developers.facebook.com](https://developers.facebook.com/apps) create an app with the
   use case for managing a Page. You must be an admin of both the app and the Page.
2. Open the Graph API Explorer, pick the app, and request `pages_show_list`,
   `pages_read_engagement` and `pages_manage_posts`. Choose your Page in the token menu to get a
   Page access token. It lasts about an hour, which is enough for the spike.
3. Set `META_PAGE_ID` and `META_PAGE_ACCESS_TOKEN`. Setting `META_APP_SECRET` as well signs every
   call.
4. **Draft test:** `npm run spike -- publish-facebook-reel`. This proves the upload path.
5. **Public test:** switch the app to Live mode, get a fresh token, then run
   `npm run spike -- publish-facebook-reel --publish`. Open the printed link in a private browser
   window. If it plays without logging in, the app can publish publicly without App Review.

If the public test fails, record the error in RESULTS.md. The fallback is Buffer for Facebook
and Instagram, or Meta App Review.

### 4. Buffer (`publish-buffer-tiktok`)

1. Create a free Buffer account and connect your TikTok channel.
2. Under Settings, API, create an API key and set `BUFFER_API_KEY`.
3. Buffer downloads video from a public URL. Upload `data/phase-0/render-remotion/short.mp4`
   to a Cloudflare R2 bucket with public access enabled, and set `SPIKE_PUBLIC_VIDEO_URL` to its
   https link.
4. Run `npm run spike -- publish-buffer-tiktok`, then check the draft in Buffer and delete it.
