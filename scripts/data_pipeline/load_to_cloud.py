"""Atomically refresh the migrated Supabase schema from the local SQLite build.

The committed Supabase migrations own schema, keys, indexes, views, grants, and
RLS. This loader owns rows only: it truncates and reloads all current contract
tables in one transaction, then verifies source/target row counts. Any failure
rolls the transaction back and exits nonzero.
"""

from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import sys
from typing import Any

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SQLITE_PATH = PROJECT_ROOT / "data" / "community_radar.sqlite"

# Parents precede children so immediate foreign keys remain valid during load.
TABLES = (
    "census_tract",
    "ct_centroid",
    "database_center",
    "database_visitor_tag",
    "area_profile",
    "service_table",
    "cisv_reference",
    "stm_stop",
    "gap_score",
    "accessibility",
    "area_vulnerability_index_real",
    "monitoring_summary",
    "role_activity_log",
    "flyer_examples",
    "services_master",
    "center_area_lookup",
    "observed_need_index",
    "observed_need_category_summary",
    "vulnerability_index_v2",
)

APP_READY_TABLES = (
    "area_profile",
    "gap_score",
    "accessibility",
    "service_table",
    "observed_need_index",
    "vulnerability_index_v2",
)

REQUIRED_VIEWS = ("v_visit_needs_by_center", "v_ct_vulnerability")

BOOLEAN_COLUMNS = {
    "database_center": ("indigenous_led_or_specific",),
    "database_visitor_tag": (
        "language_need_flag",
        "settlement_need_flag",
        "indigenous_specific_need_flag",
    ),
    "services_master": ("mappable",),
    "observed_need_index": ("insufficient_visit_data",),
    "vulnerability_index_v2": ("insufficient_visit_data",),
}

CISV_COLUMN_NAMES = {
    "\ufeffDissemination Area (DA)": "dissemination_area",
    "ï»¿Dissemination Area (DA)": "dissemination_area",
    "Dissemination Area (DA)": "dissemination_area",
    "Province or territory": "province_or_territory",
    "Dimension 1 Scores": "dimension_1_score",
    "Dimension 2 Scores": "dimension_2_score",
    "Dimension 3 Scores": "dimension_3_score",
    "Dimension 4 Scores": "dimension_4_score",
    "CISV Scores": "cisv_score",
    "CISV Quintiles": "cisv_quintile",
    "CISV Most Vulnerable Dimension": "cisv_most_vulnerable_dimension",
}


def _as_boolean(value: Any) -> bool | None:
    if pd.isna(value):
        return None
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "t", "yes"}:
            return True
        if normalized in {"0", "false", "f", "no"}:
            return False
        raise ValueError(f"Cannot convert {value!r} to boolean")
    return bool(value)


def prepare_frame(table: str, frame: pd.DataFrame) -> pd.DataFrame:
    prepared = frame.rename(columns=CISV_COLUMN_NAMES if table == "cisv_reference" else {})
    for column in BOOLEAN_COLUMNS.get(table, ()):
        if column in prepared.columns:
            prepared[column] = prepared[column].map(_as_boolean)
    return prepared


def _quoted_names(names: tuple[str, ...]) -> str:
    return ", ".join(f'public."{name}"' for name in names)


def main() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv(PROJECT_ROOT / ".env")
    except ImportError:
        pass

    try:
        from sqlalchemy import create_engine, text
    except ImportError:
        sys.exit(
            "Missing cloud dependencies. Run: "
            "python -m pip install -e '.[cloud]'"
        )

    database_url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
    if not database_url:
        sys.exit("Set SUPABASE_DB_URL in the environment or gitignored root .env file.")
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    if not SQLITE_PATH.exists():
        sys.exit(f"Missing {SQLITE_PATH}. Build the local SQLite database first.")

    source = sqlite3.connect(SQLITE_PATH)
    engine = create_engine(database_url, pool_pre_ping=True)

    try:
        source_tables = {
            row[0]
            for row in source.execute(
                "select name from sqlite_master where type = 'table'"
            ).fetchall()
        }
        missing_source = sorted(set(TABLES) - source_tables)
        if missing_source:
            raise RuntimeError(
                f"SQLite source is missing required tables: {', '.join(missing_source)}"
            )

        with engine.begin() as connection:
            target_tables = {
                row[0]
                for row in connection.execute(
                    text(
                        "select tablename from pg_tables "
                        "where schemaname = 'public'"
                    )
                )
            }
            missing_target = sorted(set(TABLES) - target_tables)
            if missing_target:
                raise RuntimeError(
                    "Supabase is missing migrated tables: "
                    f"{', '.join(missing_target)}. Apply supabase/migrations first."
                )

            target_views = {
                row[0]
                for row in connection.execute(
                    text(
                        "select viewname from pg_views "
                        "where schemaname = 'public'"
                    )
                )
            }
            missing_views = sorted(set(REQUIRED_VIEWS) - target_views)
            if missing_views:
                raise RuntimeError(
                    f"Supabase is missing required views: {', '.join(missing_views)}"
                )

            connection.execute(text(f"truncate table {_quoted_names(TABLES)} cascade"))

            print(f"Refreshing {len(TABLES)} migrated tables atomically...")
            for table in TABLES:
                frame = prepare_frame(
                    table,
                    pd.read_sql_query(f'select * from "{table}"', source),
                )
                target_columns = {
                    row[0]
                    for row in connection.execute(
                        text(
                            "select column_name from information_schema.columns "
                            "where table_schema = 'public' and table_name = :table"
                        ),
                        {"table": table},
                    )
                }
                unknown_columns = sorted(set(frame.columns) - target_columns)
                if unknown_columns:
                    raise RuntimeError(
                        f"{table} has source columns absent from the migration: "
                        f"{', '.join(unknown_columns)}"
                    )

                frame.to_sql(
                    table,
                    connection,
                    schema="public",
                    if_exists="append",
                    index=False,
                    chunksize=1000,
                    method="multi",
                )
                target_count = connection.execute(
                    text(f'select count(*) from public."{table}"')
                ).scalar_one()
                if target_count != len(frame):
                    raise RuntimeError(
                        f"{table} row-count mismatch: source={len(frame)}, "
                        f"target={target_count}"
                    )
                if table in APP_READY_TABLES and target_count == 0:
                    raise RuntimeError(f"Required app-ready table {table} is empty")
                print(f"  PASS {table:34s} {target_count:>6d} rows")

            connection.execute(text("set constraints all immediate"))

        print("Supabase refresh committed. Schema, views, grants, and RLS were preserved.")
    except Exception as error:
        print(f"Supabase refresh failed and was rolled back: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    finally:
        source.close()
        engine.dispose()


if __name__ == "__main__":
    main()
