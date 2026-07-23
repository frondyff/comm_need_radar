# Supabase Operations

This runbook implements issue `#6` for the current 19-table cloud contract. The
schema is owned by versioned migrations; CSV/SQLite refresh jobs own rows only.

## Security Boundary

The browser may read only these aggregated, app-ready tables:

- `area_profile`
- `gap_score`
- `accessibility`
- `service_table`
- `observed_need_index`
- `vulnerability_index_v2`

The migrations enable RLS on all 19 tables, revoke browser-role privileges by
default, and grant `SELECT` only on those six tables. Raw/source tables and both
database views remain inaccessible to `anon` and `authenticated` roles.

Use only the project URL and publishable key in the browser. Database passwords,
direct Postgres URLs, secret keys, and service-role keys are owner/server-only.

## Fresh Project

1. Create the Supabase project.
2. Apply migration files in filename order from `supabase/migrations/` using the
   Supabase CLI or SQL editor.
3. Build `data/community_radar.sqlite` with the current data pipeline.
4. Put the direct Postgres connection in a gitignored root `.env`:

   ```bash
   SUPABASE_DB_URL=postgresql://...
   ```

5. Install the cloud loader dependencies and run the atomic refresh:

   ```bash
   python -m pip install -e '.[cloud]'
   python scripts/data_pipeline/load_to_cloud.py
   ```

6. Configure `frontend/.env` with `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Refresh Semantics

Cloud refresh uses **transactional replace** semantics:

- Migrations remain authoritative for tables, keys, indexes, views, grants, and
  RLS; the loader never drops database objects.
- The loader truncates and reloads all 19 tables inside one transaction.
- Source and target row counts must match for every table.
- All six app-ready tables must be nonempty.
- Foreign keys are checked before commit.
- Any missing object, column mismatch, load error, or validation failure rolls
  the complete refresh back and exits nonzero.

Do not use pandas `if_exists="replace"` against Supabase. It drops migrated
constraints and RLS policies.

## Current Release Counts

| Table | Expected rows |
| --- | ---: |
| `area_profile` | 12 |
| `gap_score` | 12 |
| `accessibility` | 108 |
| `service_table` | 4,255 |
| `observed_need_index` | 12 |
| `vulnerability_index_v2` | 12 |

Change these expectations only as part of a reviewed data refresh.

## Validation

Owner-level validation checks schema objects, keys, RLS, policies, grants,
security-invoker views, joins, counts, scoring basis, and V2 weights:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/issue_6_contract.sql
```

Public-key validation checks the same interface the React application uses,
including required columns, pagination, key uniqueness, area joins, raw-table
isolation, and anonymous write denial:

```bash
cd frontend
npm run validate:supabase
```

Both commands must pass after each cloud refresh. Save their non-secret output in
the implementation PR or issue comment.

## Key Relationships

| Child | Key | Parent |
| --- | --- | --- |
| `ct_centroid` | `ct_code` | `census_tract.ct_code` |
| `database_visitor_tag` | `center_id` | `database_center.center_id` |
| `service_table` | `service_id` | `database_center.center_id` |
| `gap_score` | `area_id` | `area_profile.area_id` |
| `accessibility` | `area_id` | `area_profile.area_id` |
| `observed_need_index` | `area_id` | `area_profile.area_id` |
| `vulnerability_index_v2` | `area_id` | `area_profile.area_id` |
| `center_area_lookup` | `center_id`, `area_id` | centers and areas |
| `services_master` | `area_id` | `area_profile.area_id` |

`services_master.legacy_center_id` is lineage text, not a foreign key: merged
service rows can contain multiple semicolon-delimited legacy center IDs.

## Failure Recovery

The loader transaction preserves the previous cloud snapshot when a refresh
fails. Correct the source data or migration, rerun locally, and retry the full
refresh. Do not manually patch individual production rows without recording and
reproducing the same correction in the source pipeline.
