# Shared cloud database (free) — team access

Gives the whole team **one live database** they can all query — in a browser (no
install) or from code. Uses **Supabase** (free Postgres tier). A Turso (hosted
SQLite) alternative is at the bottom.

The data is loaded from the local SQLite build, so it stays reproducible from the
committed CSVs.

---

## One-time setup (owner — ~5 minutes)

1. **Create a free Supabase project** at https://supabase.com → New project.
   Pick a name (e.g. `community-radar`), a strong DB password (save it), a region
   near Montréal (e.g. `us-east-1`). Free tier is enough.

2. **Get the connection string:** Project → **Settings → Database → Connection
   string → URI**. It looks like:
   ```
   postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
   ```

3. **Put it in a gitignored `.env`** at the repo root (never commit this):
   ```
   DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
   ```

4. **Install the cloud deps and load the data:**
   ```bash
   pip install sqlalchemy psycopg2-binary python-dotenv
   python scripts/data_pipeline/build_database.py     # local SQLite (source)
   python scripts/data_pipeline/load_to_cloud.py       # push every table to Supabase
   ```
   You'll see each table load (census_tract, database_center, database_visitor_tag, …).

---

## How teammates access it

**Option 1 — Browser (best for non-technical teammates):**
Invite them to the Supabase project (Supabase → Organization → **Team → Invite**).
They log in and use **Table editor** (browse/filter) and **SQL editor** (run
queries) — nothing to install.

**Option 2 — From code / any Postgres client:**
Share the connection string (ideally a **read-only** one, below). Then:
```python
import os, sqlalchemy, pandas as pd
engine = sqlalchemy.create_engine(os.environ["DATABASE_URL"])
pd.read_sql("SELECT * FROM database_center WHERE indigenous_led_or_specific = true", engine)
```
Works from a free GUI too (TablePlus, DBeaver, pgAdmin).

**Recommended: a read-only role for sharing.** So teammates can't alter the data,
run this once in the Supabase SQL editor, then share *that* login instead of the
owner password:
```sql
CREATE ROLE radar_read LOGIN PASSWORD 'choose-a-password';
GRANT USAGE ON SCHEMA public TO radar_read;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO radar_read;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO radar_read;
```

---

## Security notes

- `.env` is gitignored — **never commit** `DATABASE_URL` or the DB password.
- Share a **read-only** connection for teammates who only need to query.
- Refresh the cloud data anytime by re-running `load_to_cloud.py` (it replaces
  each table); the committed CSVs remain the source of truth.

---

## Alternative — Turso (hosted SQLite, one command)

If you'd rather keep it SQLite-native (smallest change), Turso uploads the exact
`.db` we already built:
```bash
# https://turso.tech — free tier
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create community-radar --from-file data/community_radar.sqlite
turso db show community-radar        # prints the URL
turso db tokens create community-radar   # auth token for teammates
```
Teammates connect with the URL + token via any libSQL client. (No built-in web
table editor — that's why Supabase is the friendlier default for a mixed team.)
