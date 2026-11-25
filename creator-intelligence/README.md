# Creator intelligence

> **White-label copy.** Every creator, brand, handle, account ID, database ID and figure in this repo is a placeholder. The demo creator, "Maya Rivers", is fictional. No real creator data or secrets are included. The integrations are real, so the build makes sense.

**Problem:** a creator posting across Instagram, TikTok and LinkedIn was deciding what to make from gut feel and vanity numbers. A reel with 400k views looked like a win even if it was average for that account, and nobody could say *why* the best posts worked.

**What I built:** a content-intelligence product that measures every post against the creator's own baseline, breaks videos down into the craft decisions behind them, and turns both into a short list of what to post next.

## How it works

1. **Real metrics, no estimates.** Apify scrapers pull a year of posts per platform. Every post is scored against that creator's own rolling baseline on the same platform (engagement rate, percentile, over / typical / under), never against another platform's audience. Platforms with no follower count are compared on raw interactions and labelled that way.
2. **Video teardowns.** An external vision and transcription actor reads each video (hook, transcript, cuts per minute, shot list, on-screen text). Claude scores five craft areas out of 10. The performance score is not modelled: it comes straight from the post's real percentile.
3. **Hook taxonomy.** Hooks are sorted into 12 types by fixed rules (no model call, so the result is reproducible). The library then shows which hook types over-index on the creator's best posts, with guards for small samples.
4. **"Give me ideas".** Five ranked ideas, each tied to one real figure and one thing the teardowns learned, favouring repeatable series over one-offs.

## Honesty rules built into the code

- The model never invents a metric. Every claim must cite a real figure or a verbatim line, and quotes are checked against the scraped text or dropped.
- Missing data stays missing: no transcript means no spoken-line analysis, and the caveats say so.
- Small samples are flagged as "too few to judge" rather than ranked.

These rules are the point of the product. An AI that sounds confident about numbers it made up is worse than no AI.

## Features

A tool for turning a creator's real performance and curated inspiration into better content ideas, grounded in their own numbers. Each person signs in with Google, completes a questionnaire so the intelligence layer knows exactly who it is writing for, and then builds their own bank of inspiration, audience comments, creators and briefs.

## What it does

**Ideas.** Save a link, screenshots or a plain note. Paste the comments left under the inspiration, and the comments your own audience left on your posts (or link synced Instagram posts). Run the analysis and get sentiment for both audiences, recurring themes, what people want, objections, who the audience wants to become, a read on the creator, and four content angles tied to your pillars.

**Briefs.** Refine any idea or angle into a structured brief for long form video, Reel / TikTok, carousel or LinkedIn. Briefs are built with cult marketing principles (identity, enemy, movement, tribe language, gradual commitment) and direct response technique (one big idea, specificity, mechanism, objection handled, a single CTA). They are structure to write from, not finished copy.

**Creators.** Give a handle, paste what you know about them, and get a breakdown: what they make, popular topics, best performing pieces from the evidence, and how it relates to your content (overlap, borrow, avoid, the gap only you can fill). Creators are identified from screenshots and comments as you go, and can be saved in one click.

**Topics.** Group creators and ideas into topic clusters by hand or with one button.

**Our posts.** Connect Instagram to sync your posts and comments. Read the audience pulse across recent posts and save the content it suggests straight into the bank.

**Plan this week.** Pick four to six pieces from the bank, balanced across pillars, with the next step for each.

**Capture.** Share links from your phone with an iOS Shortcut into your bank using a private token.

## Stack

Next.js 15 (App Router), Prisma 6 with the pg driver, Postgres, Anthropic API. One Railway service plus the Postgres plugin.

## Deploy on Railway

1. **Create the project.** In Railway, New Project → Deploy from GitHub repo → pick this repo. Add a **Postgres** plugin to the same project. Railway injects `DATABASE_URL` into the service automatically.

2. **Set variables** on the service (Settings → Variables):

   | Variable | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | from console.anthropic.com |
   | `ANTHROPIC_MODEL` | optional, defaults to `claude-sonnet-4-5` |
   | `SESSION_SECRET` | any long random string |
   | `APP_URL` | the public URL Railway gives you, e.g. `https://your-app.up.railway.app` (no trailing slash) |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | see Google sign-in below |
   | `ALLOWED_EMAILS` | optional comma list, e.g. `owner@example.com,teammate@example.com`. Leave empty to allow any Google account. |
   | `OWNER_EMAIL` | optional, defaults to `owner@example.com`. This email claims the pre-filled Maya Rivers profile on first sign-in. |
   | `APP_PASSWORD` | optional. If set, a shared-password login also appears (useful before Google is configured). |
   | `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | see Instagram below |

3. **Deploy.** The start command runs `prisma migrate deploy` then starts Next. First deploy creates the tables.

4. **Sign in.** Maya's Google account lands on a profile that is already filled in with the demo profile. Anyone else gets a blank profile and the questionnaire.

5. **Seed the starting links** (optional). In Railway's service shell: `SEED_EMAIL=owner@example.com npm run seed:links`. Or paste them into the bank with the Paste links button.

## Google sign-in

1. Go to console.cloud.google.com → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
2. Authorised redirect URI: `https://YOUR-APP-URL/api/auth/google/callback`.
3. Copy the client ID and secret into Railway as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. If the OAuth consent screen is in Testing mode, add each person's Gmail as a test user, or publish it.

Each Google account gets its own profile and its own bank. Nothing is shared between profiles.

## Instagram

Uses the Instagram API with Instagram Login (no Facebook Page needed). The account must be a Business or Creator account.

1. developers.facebook.com → Create app → Business type → add the **Instagram** product.
2. Under Instagram → API setup with Instagram login: add `https://YOUR-APP-URL/api/instagram/callback` as a redirect URI, and add the Instagram account as a tester (accept the invite in Instagram → Settings → Website permissions → Tester invites).
3. Copy the Instagram app ID and secret into Railway.
4. Settings → Connect Instagram, then Our posts → Sync.

Scopes used: `instagram_business_basic`, `instagram_business_manage_comments`. Tokens are long-lived (60 days) and refreshed automatically when a sync runs within ten days of expiry. For accounts other than app testers, Meta requires App Review for these permissions.

LinkedIn and TikTok do not open their comment APIs to normal apps, so those comments are pasted into the idea or added as screenshots and read in.

## Capture from a phone (iOS Shortcut)

Settings shows a capture URL with your token. Build a Shortcut: Receive URLs from Share Sheet → Get Contents of URL with method POST, JSON body `{ "url": [Shortcut Input], "note": "" }`, URL `https://YOUR-APP-URL/api/capture?token=YOUR_TOKEN`. Share any Instagram, TikTok or LinkedIn post to it and it lands in the bank.

## Local development

```bash
cp .env.example .env   # fill in DATABASE_URL, ANTHROPIC_API_KEY, APP_PASSWORD
npm install
npx prisma migrate deploy
npm run dev
```

With `APP_PASSWORD` set and no Google credentials, the login page shows a password field and signs you in as a local user attached to Maya's seeded profile.

## Where things live

- `prisma/schema.prisma` data model; `prisma/migrations` SQL
- `src/lib/intelligence.ts` every Anthropic call: profile brief, idea analysis, format briefs, screenshot transcription, creator breakdown, topic grouping, audience pulse, weekly plan
- `src/lib/brand.ts` the cult marketing and direct response method, format guides, and the questionnaire
- `src/lib/seed.ts` Maya's pre-filled profile
- `src/lib/instagram.ts` OAuth and sync
- `src/app/api/*` route handlers; `src/components/*` the UI

## Design rules baked in

No em dashes anywhere in generated output (stripped as a last resort even if the model slips). Pastel, social-first "bubble" look: a soft watercolour wash, floating cards with large rounded corners and soft shadows, rounded thumbnails, pastel pills, gradient buttons, Baloo 2 headings with Nunito body. Full light and dark.
