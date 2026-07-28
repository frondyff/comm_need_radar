# Supabase Operations

This runbook implements issue `#6` for the 19-table core application contract
plus two cloud-native analytics tables. The schema is owned by
versioned migrations; CSV/SQLite refresh jobs own core application rows only.

## Security Boundary

The browser may read only these aggregated, app-ready tables:

- `area_profile`
- `gap_score`
- `accessibility`
- `service_table` (legacy compatibility)
- `services_master` (canonical dashboard service directory)
- `observed_need_index`
- `observed_need_category_summary` (k-anonymized observed demand by area/category)
- `vulnerability_index_v2`

The migrations enable RLS, revoke browser-role privileges by
default, and grant `SELECT` only on those eight tables. Raw/source tables and both
database views remain inaccessible to `anon` and `authenticated` roles.

The browser has insert-only access to `page_events` and `flyer_downloads`. It
has no access to `database_visitor_tag`.

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

Core application refresh uses **transactional replace** semantics:

- Migrations remain authoritative for tables, keys, indexes, views, grants, and
  RLS; the loader never drops database objects.
- The loader truncates and reloads the 19 core tables inside one transaction.
- Insert-only analytics are excluded. Web visitor-tag and observed/V2
  materializations are preserved and restored inside the core refresh
  transaction so synthetic fixtures cannot overwrite real web output.
- Source and target row counts must match for every table.
- All eight app-ready tables must be nonempty.
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
| `services_master` | 3,664 |
| `observed_need_index` | 12 |
| `observed_need_category_summary` | Variable; every published web group is k ≥ 5 |
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
isolation, application-table write denial, and private visitor-tag denial:

```bash
cd frontend
npm run validate:supabase-contract
```

Both commands must pass after each cloud refresh. Save their non-secret output in
the implementation PR or issue comment.

## Approved Scoring-Contract Release

`scoring-contract-02` has a narrower atomic publisher so the approved scoring
surfaces can be released without replacing unrelated service, analytics, V1,
or experimental V2 data.

1. Apply `supabase/migrations/202607280001_scoring_contract_consistency.sql`
   in the SQL editor. It adds lineage columns, reconciliation constraints, and
   the private `publish_scoring_contract_02` function. Browser roles cannot
   execute that function.
2. Run the local no-write validation:

   ```bash
   python3 scripts/publish_scoring_contract.py
   ```

3. Merge the approved PR into `dev`. For the release commit that changes this
   migration/manifest/publisher, the `Release Production` workflow uses GitHub
   production secrets, captures the previous three public tables as a rollback
   artifact, publishes the complete 12/108/12 snapshot in one transaction, and
   runs the public contract validator before staging Vercel.
4. Run the owner SQL contract when a direct database connection is available:

   ```bash
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
     -f supabase/tests/issue_6_contract.sql
   ```

5. Merge and deploy only after publication and public validation pass. The
   frontend runtime rejects a mixed or partial scoring snapshot.

Do not call the private RPC with hand-edited JSON. The committed CSVs and
publisher validation are the release source of truth.

## Key Relationships

| Child | Key | Parent |
| --- | --- | --- |
| `ct_centroid` | `ct_code` | `census_tract.ct_code` |
| `database_visitor_tag` | `center_id` | `database_center.center_id` |
| `service_table` | `service_id` | `database_center.center_id` |
| `gap_score` | `area_id` | `area_profile.area_id` |
| `accessibility` | `area_id` | `area_profile.area_id` |
| `observed_need_index` | `area_id` | `area_profile.area_id` |
| `observed_need_category_summary` | `area_id` | `area_profile.area_id` |
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

## Web-Observed Demand Refresh

Apply `202607270001_web_observed_demand.sql` before running the observed-demand
pipeline. Then use the configured server-only project URL and secret key:

```bash
VITE_SUPABASE_URL=https://PROJECT.supabase.co \
SUPABASE_SECRET_KEY=... \
python3 scripts/build_web_observed_demand.py --from-supabase --publish
```

The pipeline atomically replaces web-derived visitor-tag aggregates,
`observed_need_index`, `observed_need_category_summary`, and
`vulnerability_index_v2`. It never modifies `gap_score`. The weekly GitHub
schedule remains disabled until `WEB_OBSERVED_DEMAND_ENABLED` is exactly
`true`. Manual dispatch is a dry run unless `publish=true` is selected.
Scheduled publication additionally requires
`WEB_OBSERVED_DEMAND_PUBLISH_ENABLED=true`.
