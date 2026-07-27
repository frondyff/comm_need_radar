# Production Grill Operations

The production grill protects the canonical Vercel project
`frondy-s-projects/comm-need-radar` and URL:

- Canonical: <https://comm-need-radar.vercel.app>
- Legacy redirect: <https://comm-mvp.vercel.app>

The separate `comm-mvp` Vercel project is not a release target.

## What Runs

`Production Grill` runs a lightweight HTTP/API smoke every 30 minutes. The
07:17 UTC run also executes:

- Chromium, Firefox, and WebKit on desktop and mobile profiles;
- functional Community, Planner, chatbot, fallback, flyer, and PDF checks;
- WCAG checks and Chromium visual regression;
- live Supabase row, join, and anonymous-access validation;
- public insert, privileged verification, and guaranteed cleanup for
  `page_events` and `flyer_downloads`;
- passive/targeted security checks and dependency audits;
- desktop/mobile Lighthouse budgets;
- bounded k6 traffic against the public production URL.

The browser fixture intercepts only Supabase `POST` requests to `page_events`
and `flyer_downloads`. Reads remain live, and the tests verify that the
application attempted the write without polluting production analytics.

## Required GitHub Configuration

Create these Actions secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_AUTOMATION_BYPASS_SECRET`
- `SUPABASE_SECRET_KEY`

The bypass secret comes from the Vercel project's Deployment Protection
settings. It is sent as an HTTP header and must never be placed in URLs or
test artifacts.

`SUPABASE_SECRET_KEY` is server-only and bypasses Row Level Security. The
nightly analytics contract uses it only to verify and immediately delete
uniquely marked rows inserted through the public frontend key. Never expose it
through a `VITE_*` variable, browser context, log, or artifact.

Create the repository variable `PROD_GRILL_MODE` with initial value `report`.
Keep report mode for at least seven days and twenty smoke runs. Change it to
`enforce` only after all critical functional/API findings are resolved.

## Release Behavior

After `Production Web` succeeds on `integration/production-web`, the release
workflow:

1. Re-runs the repository release gates.
2. Exports the exact commit with `git archive`, avoiding Vercel's team-member
   restriction on external Git authors.
3. Synchronizes the GitHub `SUPABASE_SECRET_KEY` secret into the canonical
   Vercel production environment without logging its value.
4. Creates a production-environment deployment with `--skip-domain`.
5. Runs critical smoke and Chromium desktop/mobile journeys against the
   protected candidate.
6. Confirms production still points at the previously captured deployment.
7. Promotes the candidate and repeats critical checks on the canonical URL.
8. In enforce mode, rolls back to the immediately previous production
   deployment if canonical checks fail.

The release workflow is serialized. Do not manually promote another deployment
while it is running; the workflow aborts if the canonical deployment changes
during candidate testing.

## Local and Manual Commands

Run against canonical production:

```bash
cd frontend
npm ci
npx playwright install chromium
npm run test:prod:smoke
npm run test:prod:e2e
```

Run against a candidate:

```bash
BASE_URL=https://candidate.vercel.app \
VERCEL_AUTOMATION_BYPASS_SECRET=... \
npm run test:prod:e2e
```

Run security, visual, Lighthouse, or load checks:

```bash
npm run test:prod:security
npm run test:prod:visual
npm run test:prod:lighthouse
LOAD_PROFILE=smoke npm run test:prod:load
```

The k6 command requires a local k6 installation. GitHub Actions installs it
with the official Grafana setup action.

## Failure Handling

- Candidate critical failures block promotion only in `enforce` mode.
- Canonical critical failures trigger rollback only in `enforce` mode.
- Accessibility, visual, security-header, Lighthouse, and nightly load
  findings never trigger an automatic rollback.
- Two consecutive scheduled failures open or update one
  `production-health` issue; two consecutive successes close it.
- Any release workflow failure opens or updates the issue immediately.
- Playwright traces, screenshots, videos, JUnit output, Lighthouse reports,
  smoke JSON, and k6 summaries are retained for 14 days.
