# Full video transcription — spec (decision pending)

## Why
The bank should know what a video actually *says*, not just its caption and
comments. Captions are marketing, comments are reaction; the spoken script is
the content. That matters most for a video-first feed (Reels, TikTok): it lets
the analysis, briefs and theme reads reason about the real message.

## What already ships (the cheap tier, built)
- **Thumbnails** on every scraped post (Measure), so it is visual.
- **Captions** captured and stored (already were).
- **TikTok auto-captions**: where a TikTok has subtitles, we fetch and store
  them as `ContentPiece.transcript`. No transcription service, no extra cost.

## The gap this spec covers
- **Instagram Reels**: no transcript is available from any scraper. Instagram
  does not expose one.
- **TikToks without auto-captions**: same.
To get these we must pull the audio and run speech-to-text ourselves.

## Pipeline (if approved)
1. On refresh, for a video piece with no transcript, get a media URL. The IG
   scraper returns `videoUrl`; the TikTok scraper can return a downloadable
   video. (These are time-limited CDN links, used immediately, never stored.)
2. Send the audio to a speech-to-text API.
3. Store the returned text in `ContentPiece.transcript` (column already exists).
4. Feed caption + transcript into the analysis and brief prompts so the model
   reasons from the actual script.

Guards, in the project's style: only transcribe a piece once (cached on the
row), only on explicit refresh (never on page load), cap per run, and fall
back to "" silently so a failure never blocks a scrape or a metric.

## Options and rough cost
Costed per minute of audio; a feed of 30 short videos averaging ~0.5 min each
is ~15 minutes per full refresh.

| Service | Price (approx) | Notes |
|---|---|---|
| OpenAI Whisper API | ~$0.006 / min | Simple, good quality. ~$0.09 per 30-video refresh. New dependency + key. |
| Deepgram | ~$0.004 / min | Cheapest, fast, diarization. New key. |
| AssemblyAI | ~$0.006 / min | Extras (chapters, topics) we do not need yet. |
| Apify transcription actor | varies | Keeps it inside the Apify account/billing you already have; no new vendor. |

Confirm exact pricing at build time; the numbers above are directional, not a
quote.

## Recommendation
If approved, use **the Apify transcription path or Whisper** — both keep the
footprint small. Gate it behind a per-creator toggle ("transcribe videos on
refresh") so credits are only spent when you ask, and only on your own account
first (not every competitor). Storage is negligible (text).

## Decision needed
1. Go / no-go on full transcription.
2. If go: which service, and is the per-refresh cost acceptable at your volume.
3. Scope: your own account only, or competitors too.
