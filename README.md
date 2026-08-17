# ScoutPipe — creator scouting pipeline

A working prototype of the scouting pass a creator-partnerships team otherwise runs
by hand across a spreadsheet, three analytics sites and an inbox: **discovery →
size filtering → Kick cross-reference → contact enrichment → agency blocklist →
dedupe → GMass-ready CSV**, as one pass with a non-technical operator in control.

## What it demonstrates

- **A 40-creator seeded roster** (Twitch + YouTube) with average concurrent
  viewers, hours streamed, followers and last-live date. The roster is a frozen
  snapshot dated `2026-08-17`, so "days since last live" is measured from that
  date and rankings never drift as the calendar moves.
- **Live size thresholds.** Min ACV, min hours streamed, min followers and max
  days since last live re-filter and re-rank the table as you type, with no page
  reload. The thresholds are written into the URL, so a filtered view is a
  shareable link.
- **A visible composite score** — audience 55 / airtime 25 / recency 20, each
  capped and normalised — so an operator can argue with a ranking instead of
  trusting it.
- **Kick cross-reference** from seed data, with the honest third value:
  `Active on Kick`, `No Kick presence`, or `Unverified`. Creators already live on
  Kick are excluded from export by default, and the default is a checkbox, not a
  rule.
- **AI contact enrichment.** A model reads each creator's messy about-page /
  link-in-bio scrape and returns the business address plus *which field it came
  from* — de-obfuscating `name (at) host (dot) tld`, and preferring a booking or
  management address over the fan-mail Gmail in the bio.
- **An operator-editable agency blocklist.** Add or remove competitor domains on
  `/blocklist`; the effect on the board is immediate and survives reloads. The
  page also shows what the list costs — how many prospects each domain screens
  out, and who.
- **Dedupe** against a seeded "previously scouted" list.
- **A per-row status trail.** Every creator shows all five stages with a note, so
  no row is ever dropped without a reason: `Qualified`, `Active on Kick`,
  `Enrich failed`, `Blocked (agency)`, `Duplicate`. The funnel counters and the
  badges are derived from the same computation, so they cannot disagree.
- **A real CSV download** in the fixed GMass column order
  (`Email, FirstName, ChannelName, Platform, ProfileURL, ACV, HoursStreamed,
  Followers, LastLive, KickStatus, Score`), built server-side in the request that
  serves it.

## Bring your own key (BYOK)

Everything except the enrichment step works with no key at all, always.

Open **Settings** and pick a provider (Anthropic / OpenAI / Google), paste a key
and choose a model. The key is saved as a single JSON blob in your browser's
`localStorage` under `byok`, and the enrichment request goes **straight from your
browser to the provider** — it never passes through this app's server, and the
key is never logged or stored anywhere else. This is the fast path.

With no key saved, enrichment posts to a shared endpoint the author pays for. It
is deliberately slow — it queues, and a batch can take minutes — which is why
bringing your own key is preferred. If that endpoint is not configured for a
given deployment, the fallback is simply off and enrichment uses the built-in
parser instead: a section-aware extractor that reads the same about-page text and
labels the row `fallback`, so you can always tell which addresses came from a
model.

The demo holds **no credential of any kind**. There is no provider API key in the
repository, in `.env`, or in the deployment environment.

## Run it locally

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Behavioural tests (Playwright, Chromium only):

```bash
pnpm exec playwright install --with-deps chromium
pnpm test
```

If port 3000 is already in use, pass a different one — the config reads `PORT`
and hands it to the dev server:

```bash
PORT=3101 pnpm test
```

The suite never calls a real provider: it seeds
`localStorage.byok = {"provider":"mock",…}` for the happy path and runs with the
shared endpoint unset, so no test ever queues a job on someone else's key.

## Where state lives

The demo is serverless, and two requests are two processes that share no memory,
so nothing a visitor changes is kept on the server:

| What | Where |
| --- | --- |
| Roster, seeded blocklist, scouted history | JSON in the repo, read-only |
| Threshold values | URL query params (shareable) |
| Blocklist additions and removals | a delta in an `httpOnly` cookie (`sp_blocklist`) |
| Enrichment results | client state for the current session; recomputed, never cached server-side |
| The CSV | built in the request that serves it, never written to disk |

## Not in this prototype

Live Twitch / YouTube / Kick API calls, third-party analytics scraping
(SullyGnome, StreamsCharts, TwitchTracker), Google Sheets writes, GMass sending,
scheduled runs, rate-limit/retry infrastructure, SMTP-level email verification,
auth or multi-user state, and a persistent shared database. Swapping the seeded
roster for live API pulls is the paid build; the pipeline logic and operator UX
are what this prototype makes reviewable.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Vercel AI SDK
(`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) · Playwright.
