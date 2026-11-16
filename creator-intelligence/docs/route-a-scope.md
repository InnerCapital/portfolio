# Route A — Video Teardown via Apify (scope)

**Decision context:** Maya needs to see the breakdowns, so Railway stays the home and the
video dissection runs as an Apify actor (no local worker in v1). Our existing engine keeps
owning the *numbers*; the actor only fills the new *qualitative/structural* fields. The moat
(hook taxonomy + "which hooks over-index on our outliers") is built in our own code.

Date scoped: 2026-11-08.

---

## 1. Actor choice

**Chosen: `tubetext/video-breakdown-ai`** — best fit AND best-maintained of the four checked.

| Actor | Fit | Key / cost | Maturity |
|---|---|---|---|
| **tubetext/video-breakdown-ai** ✅ | hook + transcript + cut pacing + shot list + on-screen text + stats, one call, **no LLM key needed** | pay-per-event, **~$0.03/video** (≤3 min), max ~$0.33 | **178 users, 114 monthly, 100% success, newest dated changes (Oct 2026)** |
| frameprobe/reel-teardown (FALLBACK) | scene cuts + on-screen text + **keyframe JPEGs** + 0–10 score; **no transcript**; needs our Anthropic key | $0.04/video + $0.01/run | 40 users, 99.1% success, claims active |
| linen_snack/tiktok-video-hook-analyse | hook score + hookTranscript + stats; **no cuts, no frames**; needs our key | Apify usage only | 3 users — too immature |
| khan.ashifur/hooklayer | hosted wrapper, opaque | $0.20/event | **0% run success, 1 user — avoid** |

Keep the actor id in an env var (`TEARDOWN_ACTOR`, default `tubetext/video-breakdown-ai`) so we
can swap to **frameprobe** as a fallback with no code change.

### tubetext output fields we use
`hook{text,type,why_it_works}`, `hookDeliveredAs`, `transcript`, `timestampedTranscript`,
`structure[{beat,start,end,description}]`, `shots[{start,end,shot,scene,action,expression,on_screen_text,spoken}]`,
`pacing{cutCount,avgShotSeconds,cutsPerMinute}`, `cta`, `editingNotes`, `onScreenText` (per shot),
`hasSpeech/hasVoiceover/hasMusic`, sound title/author, `keyMoments[]`, `isOutlier`.
Input: `urls[]` (direct video links) **or** `datasetId` (from a profile scrape — which we already
produce via `clockworks~tiktok-scraper`). TikTok *profile* links aren't accepted directly → pass a
dataset id.

---

## 2. The six panels — where each comes from

| Panel | Source | Score basis |
|---|---|---|
| 1. **Hook** | tubetext `hook.*`, `hookDeliveredAs` | Claude /10 + our hook taxonomy |
| 2. **Script** | tubetext `transcript`, `structure[]`, `cta` | Claude /10 |
| 3. **Sound & tonality** | tubetext `hasSpeech/Voiceover/Music` + sound meta; **WPM derived by us** from `timestampedTranscript` (words ÷ duration) | partial — vocal pitch/energy is OUT of v1 (needs librosa → Route B later) |
| 4. **Visual cadence** | tubetext `pacing.*` + `shots[]` | deterministic (cuts/sec) + Recharts chart from shot timings |
| 5. **Packaging** | tubetext `onScreenText` + **our** caption/hashtags/coverUrl | Claude /10 |
| 6. **Performance** | **OUR** `metrics.ts` (views/likes/etc + per-platform baseline + verdict) — NOT the actor's numbers | our existing engine |

**Single source of truth for numbers = our scrape.** The actor never overrides performance data,
so if tubetext changes shape, only the qualitative breakdown degrades — never the core metrics.
Honest gap to state up front: **true vocal tonality (pitch/energy) is not in Route A.** We get
music/speech presence + WPM; full audio analysis is a Route-B upgrade.

---

## 3. Code map

- **prisma/schema.prisma** — new model `PieceBreakdown` (1:1 with `ContentPiece`):
  `pieceId @unique`, `source`, `hookText/hookType/hookWhy`, `structure Json`, `shots Json`,
  `cutCount`, `avgShotSeconds`, `cutsPerMinute`, `onScreenText Json`, `transcript`, `wpm`,
  `scores Json` (the six /10 + notes), `analysedAt`, `raw Json`. One migration.
- **src/lib/apify.ts** — `teardownVideos(datasetIdOrUrls)` via existing `runActor`. Reuse the
  **defensive parsing + dedupe + 0-result `console.warn`** pattern we just wrote for LinkedIn
  (directly mitigates the community-actor fragility risk). Normalize actor JSON → our shape.
- **src/lib/breakdown.ts** (new) — one Claude structured-output call: in = actor teardown + our
  real numbers; out = six /10 scores, each with "what worked / what to improve", every claim citing
  a figure (the `intelligence.ts` numbers-only, verbatim-or-drop discipline). Deterministic bits
  (cadence, WPM) computed here, not by the model.
- **Background job** — mirror `pieceReads.ts`: `breakdownPiece(id)` on-demand + a bounded queue for
  "break down top N". Fire-and-forget, cached (never re-analyse unless missing), **per-run cap** for
  cost control. Never auto-run on every scrape.
- **UI** — per-video breakdown page (six panels + Recharts cadence chart + transcript + embed +
  link back); a "Break down top N" button on the creator/Measure page; extend the existing
  "Our posts"/bank filters into a Library sortable by score / views / hook type.

---

## 4. Cost & setup

- **Must upgrade Apify** (free $5/mo is already exhausted — also blocks the LinkedIn verify).
- Per breakdown ≈ **$0.03 Apify + one cheap Claude call**. Top-10 × a few creators = cents.
  Bulk (Discovery outliers) needs the daily cap, like the Outlier Radar spec.
- Track Apify spend in settings (the spec already wanted this).

---

## 5. Build stages (each testable on a real TikTok before the next)

1. **Spine:** `PieceBreakdown` model + migration + `teardownVideos()` in apify.ts (defensive) +
   store raw teardown for one real video. *Test: one TikTok → row saved.*
2. **Scoring:** `breakdown.ts` Claude call → six /10 + notes, numbers from our engine. *Test: scores
   are sane and cite real figures.*
3. **One video page:** six panels + cadence chart + transcript + embed + link back.
4. **Batch + Library:** "Break down top N" queue (cap) + sortable/filterable Library.
5. **Moat:** hook taxonomy (shixinzhang + 12-type) classification + embedding comparison —
   "which hook types over-index on our outliers". Mostly Claude + existing scoring code.

---

## 6. Risks (eyes open)

- **Community-actor fragility** — exactly what just broke LinkedIn. Mitigated by: env-swappable
  actor id, defensive parsing + 0-result logging, and numbers sourced from our own scrape.
- **No vocal tonality** in v1 (pitch/energy) — Route B (local worker + librosa) if it matters.
- **No keyframe images from tubetext** — we already have `coverUrl`; if we later want first-3s
  frames for our own Claude vision pass, frameprobe returns JPEGs.
