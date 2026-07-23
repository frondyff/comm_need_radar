# Production Web Implementation Guide

Status: implementation guide for the React, Supabase, Vercel, and LLM
production web path.

Use this guide with `docs/production-web-architecture.md`. The architecture
explains the target system shape; this file orders the work by GitHub issue so
the team can implement and review each dependency cleanly.

## Execution Order

| Order | Issue | Workstream | Dependency |
| --- | --- | --- | --- |
| 1 | `#5` | Canonical React frontend and exact dashboard UX | none |
| 2 | `#6` | Supabase schema, RLS, and cloud loading | `#5` decision can run in parallel, but must finish before production frontend release |
| 3 | `#7` | React-to-Supabase real service integration | `#5`, `#6` |
| 4 | `#14` | Vercel chatbot API boundary | `#6`, `#7` |
| 5 | `#8` | Real boundaries and spatial joins | `#6`, frontend map contract from `#5` |
| 6 | `#9` | V1/V2 scoring decision | `#6`, scoring review |
| 7 | `#10` | Approved production observed-needs data | blocked by approved data access |
| 8 | `#11` | Frontend tests, CI, and bundle controls | canonical frontend from `#5` |
| 9 | `#12` | User testing and assistant validation | usable frontend, chatbot boundary |
| 10 | `#13` | Deployment, final report, and handoff | critical issues above |

Supporting issues:

- `#1` branch protection should be enabled after `#11` creates required CI
  checks.
- `#4` monitoring and progress updates must be maintained after every
  implementation PR.
- `#2` and `#3` are reconciled during final deployment and handoff under `#13`.

## Issue `#5` — Canonical React Frontend

Purpose: establish one production React app. The `feature/dashboard` branch is
the frontend baseline for UI structure, screen flow, visual layout, and
interaction behavior. The geospatial branch is not the frontend baseline; reuse
only its data contracts, Supabase loader/API patterns, scoring helpers, and map
integration requirements inside the dashboard UI.

Implementation steps:

1. Start from the `feature/dashboard` frontend experience as the canonical UI
   baseline for:
   role selection, V1 location selection, V1 service list/detail, V1 map view,
   V1 flyer preview, and V2 planner dashboard.
2. Replace geospatial-branch frontend screens, layout, and component structure
   when they conflict with `feature/dashboard`.
3. Keep one React entrypoint, one package manifest, and one dependency strategy
   under `frontend/`.
4. Reimplement the needed Supabase loader, Vercel API route calls, scoring data
   contracts, and CSV demo fallback in the dashboard-baseline app.
5. Do not keep hardcoded dashboard constants such as `SERVICES` or
   `BOROUGH_SCORES` as production data sources.
6. Record the final frontend decision in `docs/decisions.md` and
   `docs/task-progress.md`.

Backend integration requirement:

- The UI must consume typed app data from the loader, not branch-local mock
  constants.
- Exact dashboard presentation can use derived view-model fields, but those
  fields must be traceable to Supabase or an explicit fallback.
- Geospatial frontend components are reference material only; they should not
  determine the production UI when they conflict with `feature/dashboard`.

Verification:

- `cd frontend && npm ci`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run build`
- Compare screenshots for the six dashboard screens listed above against
  `feature/dashboard`.

Done means:

- One canonical frontend is documented.
- Dashboard UX parity is accepted by product/UX.
- The app builds from one production frontend path that uses the dashboard UI
  baseline and real backend data.

## Issue `#6` — Supabase Schema, RLS, And Loading

Purpose: make Supabase reproducible, secure, and reliable enough for preview
and production deployments.

Implementation steps:

1. Document or add migrations for the current app-ready tables:
   `area_profile`, `gap_score`, `accessibility`, `services_master`,
   `observed_need_index`, and `vulnerability_index_v2`.
2. Add or document required primary keys, foreign-key relationships, indexes,
   and row-count checks.
3. Enable RLS on every browser-exposed table or view.
4. Add read-only anon policies for approved frontend tables/views only.
5. Keep database passwords, service-role keys, and direct database URLs out of
   React and committed files.
6. Define refresh semantics: replace, upsert, or versioned snapshot.
7. Add a cloud validation checklist for row counts, keys, joins, and expected
   data-basis values.

Implementation artifacts:

- `supabase/migrations/202607140001_issue_6_schema.sql`
- `supabase/migrations/202607140002_issue_6_rls.sql`
- `supabase/tests/issue_6_contract.sql`
- `scripts/data_pipeline/load_to_cloud.py`
- `frontend/scripts/validate-supabase.mjs`
- `docs/supabase-operations.md`

Backend integration requirement:

- Browser code may use only `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` (or the legacy anon key).
- Server-only Vercel routes may use `SUPABASE_URL` and
  `SUPABASE_PUBLISHABLE_KEY` (or the legacy anon key).
- `SUPABASE_DB_URL` or a Postgres URL belongs only in local/server-side
  migration or loading tools, never in frontend code.

Verification:

- Fresh Supabase project can be recreated from committed docs or migrations.
- RLS policies allow frontend reads and block unauthorized writes.
- Loader validation fails loudly on missing tables, empty required tables, or
  broken join keys.

Done means:

- Supabase is a reproducible source of truth for the web app.
- Secrets setup is documented without exposing credentials.

## Issue `#7` — React To Real Service Layer

Purpose: replace hardcoded dashboard services and browser-hosted synthetic data
with real Supabase-backed service data.

Implementation steps:

1. Create a dashboard-facing service adapter or Supabase view for UI card data.
2. Map `services_master` into dashboard fields:
   `name` to display name, `primary_category` to display type,
   `address`, `phone`, `latitude`, `longitude`, and `website` directly.
3. Use `service_categories`, `services`, `hours`, and `sources` only for their
   documented display and provenance purposes. Show language as unavailable
   until a reviewed language field is added to the master contract.
4. Compute `dist` from the selected area or distribution location.
5. Use `database_center.hours` only when a documented join exists; otherwise
   show `Hours not listed`.
6. Derive `tags` only from verified fields, such as multilingual availability,
   known source, Indigenous-specific flags, or missing-hours warnings.
7. Default `gender` to `All` unless real eligibility data is added.
8. Keep static CSV mode as a clearly labeled demo fallback.

Backend integration requirement:

- The service map and service list must query the deduplicated 3,664-row master
  service layer or a bounded paginated equivalent.
- The UI must not download unbounded raw/source tables by default.
- Dashboard display categories may be simplified, but source categories must
  remain available for filtering and evidence.

Verification:

- Service list and map render from Supabase data.
- Empty, loading, retry, error, and demo-fallback states are visible.
- Browser bundle contains no database password or service-role key.

Done means:

- V1 service discovery and PDF handout use real service rows.
- Real-data mode and demo mode cannot be confused in the UI.

## Issue `#14` — Vercel Chatbot API

Purpose: provide an LLM-backed assistant without exposing secrets or allowing
the model to invent unsupported data.

Implementation steps:

1. Keep `/api/chat` as the only browser-callable chatbot endpoint.
2. Read app-ready Supabase tables server-side.
3. Select areas, rank service candidates, calculate distances, and build
   evidence in deterministic code before calling the LLM.
4. Ask the LLM for structured JSON only.
5. Validate returned JSON, service IDs, evidence fields, and language.
6. Return deterministic fallback on missing config, timeout, malformed JSON,
   unknown service IDs, unsupported facts, or provider errors.
7. Keep `/api/events` anonymous and free of PII, case notes, client IDs, or raw
   visitor records.

Backend integration requirement:

- Required server-only Vercel variables:
  `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `LLM_API_KEY`, `LLM_BASE_URL`, and
  `LLM_MODEL`.
- Chatbot v1 reads app-ready tables only. Raw `database_visitor_tag` and
  person-level data are out of scope.

Verification:

- `/api/chat` works in Vercel preview.
- Missing `LLM_API_KEY` returns deterministic fallback.
- Invalid model output returns deterministic fallback.
- Browser bundle contains no LLM key, service-role key, or database URL.

Done means:

- Assistant answers cite only verified area/service context.
- User testing under `#12` can validate assistant behavior.

## Issue `#8` — Real Boundaries And Spatial Joins

Purpose: replace synthetic area envelopes with approved real geography.

Implementation steps:

1. Select and document the boundary source, license, download date, and
   transformation.
2. Preserve stable `area_id` values used by `area_profile`, `gap_score`, and
   frontend maps.
3. Validate joins among census tracts, centers, scored areas, and polygons.
4. Report unmatched and multiply matched records explicitly.
5. Decide whether GeoJSON is acceptable for production payload size or whether
   PMTiles/vector tiles are needed.
6. Confirm Planner polygon selection and Frontline search still work.

Backend integration requirement:

- Spatial joins must be reproducible from documented inputs.
- Frontend maps must not depend on synthetic polygon IDs after this issue is
  complete.

Verification:

- Join validation report exists.
- Map payload size is measured.
- Click selection works for real polygons.

Done means:

- Production maps display approved real boundaries with stable joins.

## Issue `#9` — V1/V2 Scoring Decision

Purpose: decide whether V2 scoring should feed application views and gap
scoring.

Implementation steps:

1. Review V1/V2 weights, thresholds, and fallback behavior.
2. Confirm the `k >= 5` privacy floor remains enforced.
3. Quantify center-coverage and observed-data bias.
4. Record Chloe's decision: approve, defer, or reject V2 application use.
5. If approved, expose V2 consistently in Supabase views, React labels,
   architecture docs, and tests.

Backend integration requirement:

- The app must not mix V1 and V2 scores without visible labels and documented
  data basis.
- Any approved V2 integration must be reflected in `vulnerability_index_v2`
  and any dashboard-facing view.

Verification:

- Scoring guide, interfaces, tests, and frontend labels match the decision.
- Structural-only fallback remains tested.

Done means:

- Product has a recorded decision for V2 use.
- The UI and Supabase tables expose the selected scoring basis consistently.

## Issue `#10` — Production Observed-Needs Data

Purpose: replace synthetic observed-needs inputs with approved production data.

Status: blocked until an approved privacy-protected partner or 211-style export
exists.

Implementation steps after unblock:

1. Document data-sharing authority, permitted purpose, retention, and access
   controls.
2. Ingest only aggregated or de-identified records.
3. Enforce `k >= 5` before repository or cloud storage.
4. Map the input to center, area, need category, count, and period contracts.
5. Validate suppression, missingness, duplicates, and center coverage.
6. Rebuild V1/V2 outputs and review them before frontend release.
7. Label production and synthetic datasets clearly so builds cannot confuse
   them.

Backend integration requirement:

- Raw visitor records, case notes, immigration/legal status, names, phone
  numbers, and other PII are not allowed in repo, browser, or chatbot v1.

Verification:

- Privacy floor report shows zero rows below `k >= 5`.
- Production outputs rebuild successfully.
- UI labels reflect production versus demo data truthfully.

Done means:

- Approved production observed-needs data replaces synthetic observed inputs.

## Issue `#11` — Tests, CI, And Bundle Controls

Purpose: make the web app reviewable, testable, and ready for branch
protection.

Implementation steps:

1. Add unit tests for data parsing, search resolution, scoring labels, service
   adapter behavior, and error states.
2. Add Playwright coverage for role switching, V1 location selection, service
   search/filtering, card selection, map selection, PDF generation, V2 polygon
   selection, and chatbot fallback.
3. Add GitHub Actions for `npm ci`, typecheck, tests, audit, and production
   build.
4. Resolve the map/PDF bundle warning by code splitting or explicitly record a
   bundle budget.
5. Use the resulting CI checks to unblock branch protection under `#1`.

Verification:

- CI passes on PR.
- `npm audit --omit=dev` has no unresolved high or critical production
  vulnerabilities.
- Bundle warning is resolved or documented with a budget.

Done means:

- Required checks are available for protected branches.

## Issue `#12` — User Testing And Assistant Validation

Purpose: validate the production workflow with representative non-technical
users and verify assistant answers against source data.

Implementation steps:

1. Create a test script covering Planner and Frontline critical tasks.
2. Test with 2-3 representative users.
3. Record findings as usability defects, data misunderstandings, or feature
   requests.
4. Validate assistant answers against current priority, gap, borough, funding,
   and service data.
5. Create follow-up issues for prioritized findings.

Verification:

- User-testing summary exists.
- Assistant responses do not overstate synthetic, incomplete, or uncertain
  data as production evidence.

Done means:

- Product has evidence for final demo confidence and known limitations.

## Issue `#13` — Deployment And Final Handoff

Purpose: deploy the agreed demo path and complete final project reporting.

Implementation steps:

1. Deploy `frontend/` through Vercel.
2. Configure Vercel variables:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY`, `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`.
3. Smoke-test the public demo from a clean browser session.
4. Update README with local and deployed run paths.
5. Update the final report and presentation with architecture, screenshots,
   ownership, known limitations, and real-versus-synthetic data status.
6. Reconcile issues `#2`, `#3`, and `#4` against repository reality.
7. Record owner approvals and final handoff notes.

Verification:

- Public demo URL is recorded.
- No committed secrets exist.
- Final docs and screenshots match the deployed product.

Done means:

- The production web path is deployable, documented, and handed off.

## Environment Contract

Browser-exposed variables:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

Server-only Vercel variables:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
LLM_API_KEY=your-llm-provider-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
```

Do not commit `SUPABASE_DB_URL`, database passwords, service-role keys, or LLM
API keys. Use `SUPABASE_DB_URL` only for local/server-side migration or loading
tools when needed.

## PR Checklist

Before closing any production-web issue:

- Run `npm ci`, `npm run typecheck`, `npm run build`, and
  `npm audit --omit=dev` from `frontend/` when frontend dependencies or code
  changed.
- Run relevant Python/data checks when processed data, scoring, or loader logic
  changed.
- Run Supabase validation queries when schemas, RLS, or app-ready tables
  changed.
- Smoke-test Vercel preview when API routes, env vars, deployment config, or
  frontend runtime behavior changed.
- Update `docs/task-progress.md` with owner, activity, output, blocker, and
  next step.
- Update `docs/interfaces.md` when shared schemas or public contracts change.
