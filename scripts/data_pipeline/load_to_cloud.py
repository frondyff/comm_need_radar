"""Push the project data to a free shared cloud Postgres (e.g. Supabase / Neon).

Reads the local SQLite database (data/community_radar.sqlite) and copies every
table to a Postgres database so the whole team can query the same live data.

Security: the connection string is read from the DATABASE_URL environment variable
(keep it in a gitignored .env — never commit it). This script never prints it.

Prerequisites:
    pip install sqlalchemy psycopg2-binary python-dotenv
    python scripts/data_pipeline/build_database.py    # builds the local SQLite first

Set the connection string (Supabase: Project Settings -> Database -> Connection
string -> URI). Example .env line:
    DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres

Run:
    python scripts/data_pipeline/load_to_cloud.py
"""
from pathlib import Path
import os
import sqlite3
import sys

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from comm_need_radar.config.paths import DATA_DIR  # noqa: E402

SQLITE_PATH = DATA_DIR / "community_radar.sqlite"

# Primary keys to (re)apply on the cloud side after loading, for clean joins/UI.
PRIMARY_KEYS = {
    "census_tract": "ct_code",
    "ct_centroid": "ct_code",
    "database_center": "center_id",
    "database_visitor_tag": "visit_group_id",
    "service_table": "service_id",
}


def main() -> None:
    try:
        from sqlalchemy import create_engine, text
    except ImportError:
        sys.exit("Missing deps. Run: pip install sqlalchemy psycopg2-binary python-dotenv")

    try:
        from dotenv import load_dotenv
        load_dotenv(PROJECT_ROOT / ".env")
    except ImportError:
        pass

    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("Set DATABASE_URL (in .env or the environment). See this script's header.")
    # SQLAlchemy needs the postgresql:// scheme.
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    if not SQLITE_PATH.exists():
        sys.exit(f"Missing {SQLITE_PATH}. Run build_database.py first.")

    src = sqlite3.connect(SQLITE_PATH)
    tables = [r[0] for r in src.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]

    engine = create_engine(url)
    host = engine.url.host
    print(f"Loading {len(tables)} tables into Postgres @ {host} …")
    with engine.begin() as conn:
        for t in tables:
            df = pd.read_sql(f"SELECT * FROM {t}", src)
            df.to_sql(t, conn, if_exists="replace", index=False)
            print(f"  ✓ {t:34s} {len(df):>6d} rows")
        # apply primary keys where the column exists
        for t, pk in PRIMARY_KEYS.items():
            if t in tables:
                try:
                    conn.execute(text(f'ALTER TABLE {t} ADD PRIMARY KEY ("{pk}")'))
                except Exception as e:  # noqa: BLE001
                    print(f"  (PK on {t}.{pk} skipped: {str(e)[:60]})")
    src.close()
    print("\nDone. Teammates can now query the shared database:")
    print("  • Supabase dashboard -> Table editor / SQL editor (browser, no install)")
    print("  • Any Postgres client with the same DATABASE_URL")


if __name__ == "__main__":
    main()
