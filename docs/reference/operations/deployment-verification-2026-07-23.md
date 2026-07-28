# Production Deployment Verification — 2026-07-23

> Current update, 2026-07-28: the canonical production alias is
> https://comm-need-radar.vercel.app. Guarded release run
> [30377427156](https://github.com/frondyff/comm_need_radar/actions/runs/30377427156)
> promoted `dev` commit `0ffbdfc` after its required gates passed. The details
> below preserve the original 2026-07-23 deployment record.

## Deployment

- Vercel project: `frondy-s-projects/comm-mvp`
- Production alias: https://comm-mvp.vercel.app
- Deployment ID: `dpl_7PPEZZM6UuqaJ1Q9XYdxXDjj6sF7`
- Immutable deployment URL:
  https://comm-2ovl2ubth-frondy-s-projects.vercel.app
- Vercel status: `READY`
- Region: `iad1`

## Release Gates

- `npm ci`: passed with a regenerated lockfile.
- `npm run build`: passed.
- `npm run typecheck:api`: passed.
- Boundary, dashboard-adapter, and chatbot client validators: passed.
- Production dependency audit: zero vulnerabilities.
- Python unit tests: 41 passed.
- Spatial validation: passed with 12/12 scored areas, zero multiple matches,
  and zero polygon overlaps.
- Live Supabase dashboard contract: 12 areas, 12 scores, 108 accessibility
  rows, 3,664 canonical services, and 12 covered boundary features.
- Live Supabase security contract: anonymous writes denied and raw/source
  objects inaccessible.

## Production Smoke Tests

- `GET /`: HTTP 200.
- `GET /api/chat`: HTTP 405, confirming the POST-only boundary.
- `POST /api/chat`: HTTP 200 with verified `A001` area context, bounded service
  IDs, calculated distances, and deterministic fallback metadata.
- Vercel functions deployed: `api/chat` and `api/events`.

## Environment And Limitations

- Browser configuration uses the public Supabase URL and publishable key.
- Server chatbot retrieval uses server-named Supabase variables.
- `LLM_API_KEY` is not configured. The assistant intentionally uses the
  deterministic grounded fallback and states this in its response metadata.
- Formal user testing under issue #12 is not yet complete.
- The Planner product label is separate from experimental
  `vulnerability_index_v2`.
- The 2026-07-28 web-observed dry run had 0 of 12 reviewable areas. It did not
  publish, production `gap_score` stayed unchanged, and structural-only
  fallback remained active.
