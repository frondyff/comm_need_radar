"""Load the project data into a single SQLite database (free, file-based, no server).

Builds data/community_radar.sqlite with tables, primary keys, and foreign keys
matching docs/mvp-system-erd.md. Regenerable from the CSVs at any time.

Tables:
  Real (ERD real-index extension):
    census_tract, ct_centroid, database_center, database_visitor_tag, service_table
  Reference / optional:
    cisv_reference, stm_stop
  Synthetic MVP (current dashboard contract):
    area_profile, gap_score, accessibility, area_vulnerability_index_real,
    monitoring_summary, role_activity_log
  Views:
    v_visit_needs_by_center, v_ct_vulnerability

Usage:
    python scripts/data_pipeline/build_database.py
"""
from pathlib import Path
import sqlite3
import sys

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from comm_need_radar.config.paths import RAW_DIR, PROCESSED_DIR, DATA_DIR  # noqa: E402

DB_PATH = DATA_DIR / "community_radar.sqlite"

# Core ERD entities: explicit schema (PK/FK), loaded in dependency order.
SCHEMA = {
    "census_tract": """
        CREATE TABLE census_tract (
            ct_code TEXT PRIMARY KEY, dguid TEXT, geo_name TEXT,
            population_2021 INTEGER,
            low_income_pct REAL, seniors_65plus_pct REAL, recent_immigrant_pct REAL,
            no_official_language_pct REAL, shelter_cost_burden_pct REAL,
            indigenous_identity_pct REAL, indigenous_identity_count INTEGER,
            total_indigenous_identity_universe INTEGER
        )""",
    "ct_centroid": """
        CREATE TABLE ct_centroid (
            ct_code TEXT PRIMARY KEY, dguid TEXT,
            centroid_lon REAL, centroid_lat REAL,
            FOREIGN KEY (ct_code) REFERENCES census_tract(ct_code)
        )""",
    "database_center": """
        CREATE TABLE database_center (
            center_id TEXT PRIMARY KEY, center_name TEXT,
            latitude REAL, longitude REAL, address TEXT,
            service_categories TEXT, hours TEXT, languages TEXT,
            indigenous_led_or_specific INTEGER
        )""",
    "database_visitor_tag": """
        CREATE TABLE database_visitor_tag (
            visit_group_id TEXT PRIMARY KEY, center_id TEXT,
            period_start TEXT, period_end TEXT, key_need TEXT,
            k_anon_count INTEGER, severity TEXT, population_group TEXT,
            language_need_flag INTEGER, settlement_need_flag INTEGER,
            indigenous_specific_need_flag INTEGER,
            FOREIGN KEY (center_id) REFERENCES database_center(center_id)
        )""",
    "service_table": """
        CREATE TABLE service_table (
            service_id TEXT PRIMARY KEY, service_name TEXT, service_category TEXT,
            address TEXT, latitude REAL, longitude REAL, phone TEXT, website TEXT,
            language TEXT, source_name TEXT, source_url TEXT, last_checked_date TEXT,
            FOREIGN KEY (service_id) REFERENCES database_center(center_id)
        )""",
}

# table -> (csv path, numeric columns to coerce blanks->NULL)
CORE = {
    "census_tract": (RAW_DIR / "statcan_2021_montreal_ct_variables.csv",
                     ["population_2021", "low_income_pct", "seniors_65plus_pct",
                      "recent_immigrant_pct", "no_official_language_pct",
                      "shelter_cost_burden_pct", "indigenous_identity_pct",
                      "indigenous_identity_count", "total_indigenous_identity_universe"]),
    "ct_centroid": (RAW_DIR / "boundaries" / "ct_centroids_montreal.csv", []),
    "database_center": (RAW_DIR / "database_centers.csv", []),
    "database_visitor_tag": (RAW_DIR / "database_visitor_tags.csv", []),
    "service_table": (PROCESSED_DIR / "service_table_real.csv", []),
}

# Auxiliary tables loaded as-is (schema inferred), if present.
AUX = {
    "cisv_reference": PROCESSED_DIR / "cisv_reference_montreal.csv",
    "stm_stop": PROCESSED_DIR / "stm_stops.csv",
    "area_profile": PROCESSED_DIR / "area_profile.csv",
    "gap_score": PROCESSED_DIR / "gap_score_table.csv",
    "accessibility": PROCESSED_DIR / "accessibility_table.csv",
    "area_vulnerability_index_real": PROCESSED_DIR / "area_vulnerability_index_real.csv",
    "monitoring_summary": PROCESSED_DIR / "monitoring_summary.csv",
    "role_activity_log": PROCESSED_DIR / "role_activity_log.csv",
    "flyer_examples": PROCESSED_DIR / "flyer_examples.csv",
    # Canonical single services table: 211 directory + open-data social/food/library
    # services, de-duplicated, classified, area-assigned. Frondy's scoring can
    # migrate onto this (each row carries area_id + legacy_center_id).
    "services_master": PROCESSED_DIR / "services_master.csv",
    # v2 observed-needs subsystem (Frondy's scoring), regenerated on the real data
    "center_area_lookup": PROCESSED_DIR / "center_area_lookup.csv",
    "observed_need_index": PROCESSED_DIR / "observed_need_index.csv",
    "observed_need_category_summary": PROCESSED_DIR / "observed_need_category_summary.csv",
    "vulnerability_index_v2": PROCESSED_DIR / "vulnerability_index_v2.csv",
}

VIEWS = {
    "v_visit_needs_by_center": """
        CREATE VIEW v_visit_needs_by_center AS
        SELECT c.center_id, c.center_name, c.service_categories,
               c.indigenous_led_or_specific, v.key_need, v.population_group,
               v.k_anon_count, v.severity
        FROM database_visitor_tag v
        JOIN database_center c ON c.center_id = v.center_id""",
    "v_ct_vulnerability": """
        CREATE VIEW v_ct_vulnerability AS
        SELECT t.ct_code, t.geo_name, t.population_2021, t.low_income_pct,
               t.recent_immigrant_pct, t.indigenous_identity_pct,
               g.centroid_lat, g.centroid_lon
        FROM census_tract t
        LEFT JOIN ct_centroid g ON g.ct_code = t.ct_code""",
}


def main() -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")

    # Core entities: explicit schema + typed load, parents before children.
    for name, ddl in SCHEMA.items():
        csv_path, numeric = CORE[name]
        conn.execute(ddl)
        df = pd.read_csv(csv_path)
        for col in numeric:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df.to_sql(name, conn, if_exists="append", index=False)

    # Auxiliary tables.
    for name, csv_path in AUX.items():
        if csv_path.exists():
            pd.read_csv(csv_path).to_sql(name, conn, if_exists="replace", index=False)

    # Indexes on foreign keys / hot columns.
    for idx in [
        "CREATE INDEX ix_visit_center ON database_visitor_tag(center_id)",
        "CREATE INDEX ix_center_cat ON database_center(service_categories)",
        "CREATE INDEX ix_centroid_ct ON ct_centroid(ct_code)",
    ]:
        conn.execute(idx)

    for ddl in VIEWS.values():
        conn.execute(ddl)

    conn.commit()

    # Report + a foreign-key integrity check.
    print(f"Built {DB_PATH}")
    tables = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    for t in tables:
        n = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  {t:34s} {n:>6d} rows")
    violations = conn.execute("PRAGMA foreign_key_check").fetchall()
    print(f"  foreign-key violations: {len(violations)}")
    conn.close()


if __name__ == "__main__":
    main()
