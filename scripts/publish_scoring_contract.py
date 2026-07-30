"""Validate and atomically publish the approved scoring-contract-03 snapshot.

The Supabase migration owns the private transaction function. This client reads
the committed candidate CSVs, validates them again, captures a rollback
snapshot of the three live tables, and calls that function with a service-role
key. Without ``--publish`` it performs local validation only.
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import sys
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
ROLLBACK_DIR = ROOT / "data" / "derived" / "scoring_release"

AREA_PATH = PROCESSED / "area_profile.csv"
ACCESSIBILITY_PATH = PROCESSED / "accessibility_table.csv"
GAP_PATH = PROCESSED / "gap_score_table.csv"

INTEGER_FIELDS = {
    "population",
    "structural_vulnerability_rank",
    "vulnerability_rank",
    "source_year",
    "service_count_within_threshold",
    "service_snapshot_total_rows",
    "service_snapshot_mappable_rows",
    "gap_rank",
    "priority_cutoff_rank",
    "comparison_set_size",
}
FLOAT_FIELDS = {
    "latitude",
    "longitude",
    "income_indicator",
    "age_indicator",
    "language_indicator",
    "immigration_indicator",
    "housing_indicator",
    "structural_vulnerability_score",
    "vulnerability_score",
    "nearest_service_distance_km",
    "distance_component",
    "availability_component",
    "accessibility_score",
    "service_accessibility_score",
    "overall_accessibility_score",
    "gap_score",
}


def read_rows(path: Path) -> list[dict[str, object]]:
    with path.open(newline="", encoding="utf-8") as handle:
        rows: list[dict[str, object]] = []
        for raw in csv.DictReader(handle):
            row: dict[str, object] = {}
            for field, value in raw.items():
                if field in INTEGER_FIELDS:
                    row[field] = None if value == "" else int(value)
                elif field in FLOAT_FIELDS:
                    row[field] = None if value == "" else float(value)
                else:
                    row[field] = value
            rows.append(row)
        return rows


def close_enough(left: object, right: object, tolerance: float = 0.011) -> bool:
    try:
        return math.isclose(
            float(left),
            float(right),
            rel_tol=0.0,
            abs_tol=tolerance,
        )
    except (TypeError, ValueError):
        return False


def validate(
    areas: list[dict[str, object]],
    accessibility: list[dict[str, object]],
    gaps: list[dict[str, object]],
) -> str:
    if len(areas) != 12 or len({row["area_id"] for row in areas}) != 12:
        raise ValueError("area_profile must contain 12 unique area IDs")
    profiles = {str(row["area_id"]): row for row in areas}
    for row in areas:
        if (
            row["structural_formula_id"] != "STRUCT-01"
            or row["population_basis"] != "synthetic_demo_not_for_scoring"
            or not close_enough(
                row["structural_vulnerability_score"],
                row["vulnerability_score"],
                0.01,
            )
            or row["structural_vulnerability_rank"] != row["vulnerability_rank"]
        ):
            raise ValueError(f"{row['area_id']} violates STRUCT-01")

    if len(accessibility) != 108:
        raise ValueError("accessibility must contain 108 rows")
    categories_by_area: dict[str, set[str]] = {}
    snapshots: set[str] = set()
    for row in accessibility:
        area_id = str(row["area_id"])
        categories_by_area.setdefault(area_id, set()).add(
            str(row["service_category"])
        )
        snapshots.add(str(row["service_snapshot_id"]))
        expected = (
            0.5 * float(row["distance_component"])
            + 0.5 * float(row["availability_component"])
        )
        if (
            area_id not in profiles
            or row["accessibility_formula_id"] != "ACCESS-REAL-02"
            or row["formula_set_version"] != "scoring-contract-03"
            or row["taxonomy_version"] != "planning-needs-9-v1"
            or row["service_snapshot_total_rows"] != 3664
            or row["service_snapshot_mappable_rows"] != 3200
            or not close_enough(row["accessibility_score"], expected)
        ):
            raise ValueError(
                f"{area_id}/{row['service_category']} violates ACCESS-REAL-02"
            )
    if (
        set(categories_by_area) != set(profiles)
        or any(len(categories) != 9 for categories in categories_by_area.values())
        or len(snapshots) != 1
        or "" in snapshots
    ):
        raise ValueError("accessibility matrix or service snapshot is incomplete")
    snapshot_id = next(iter(snapshots))

    if len(gaps) != 12 or len({row["area_id"] for row in gaps}) != 12:
        raise ValueError("gap_score must contain 12 unique area IDs")
    ranks = {int(row["gap_rank"]) for row in gaps}
    if ranks != set(range(1, 13)):
        raise ValueError("gap_score must contain each rank from 1 through 12")
    for row in gaps:
        area_id = str(row["area_id"])
        profile = profiles.get(area_id)
        rank = int(row["gap_rank"])
        is_candidate = rank <= 5
        expected = (
            float(row["structural_vulnerability_score"])
            * (100.0 - float(row["service_accessibility_score"]))
            / 100.0
        )
        if (
            profile is None
            or row["structural_formula_id"] != "STRUCT-01"
            or row["accessibility_formula_id"] != "ACCESS-REAL-02"
            or row["gap_formula_id"] != "GAP-CANON-02"
            or row["formula_set_version"] != "scoring-contract-03"
            or row["classification_formula_id"] != "CLASS-TOP5-02"
            or row["classification_status"] != "poc_relative_candidate"
            or row["priority_cutoff_rank"] != 5
            or row["comparison_set_size"] != 12
            or (
                is_candidate
                and row["priority_band"] != "high_candidate"
            )
            or (
                is_candidate
                and str(row["priority_flag"]).strip()
                != "High-priority candidate (POC)"
            )
            or (
                not is_candidate
                and str(row["priority_band"]).strip()
            )
            or (
                not is_candidate
                and str(row["priority_flag"]).strip()
            )
            or row["service_snapshot_id"] != snapshot_id
            or not close_enough(
                row["structural_vulnerability_score"],
                profile["structural_vulnerability_score"],
                0.01,
            )
            or not close_enough(
                row["structural_vulnerability_score"],
                row["vulnerability_score"],
                0.01,
            )
            or not close_enough(
                row["service_accessibility_score"],
                row["overall_accessibility_score"],
                0.01,
            )
            or not close_enough(row["gap_score"], expected)
        ):
            raise ValueError(f"{area_id} violates GAP-CANON-02")
    return snapshot_id


def request_json(
    url: str,
    secret_key: str,
    *,
    method: str = "GET",
    payload: object | None = None,
) -> object:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=body,
        method=method,
        headers={
            "apikey": secret_key,
            "authorization": f"Bearer {secret_key}",
            "content-type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=60) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Supabase request failed with HTTP {error.code}: {detail}"
        ) from error


def capture_rollback_snapshot(base_url: str, secret_key: str) -> Path:
    tables = {
        "area_profile": "area_id",
        "accessibility": "area_id,service_category",
        "gap_score": "gap_rank",
    }
    snapshot: dict[str, object] = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "source": base_url,
        "tables": {},
    }
    for table, order in tables.items():
        query = urlencode({"select": "*", "order": order})
        snapshot["tables"][table] = request_json(
            f"{base_url}/rest/v1/{table}?{query}",
            secret_key,
        )
    ROLLBACK_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = ROLLBACK_DIR / f"pre-scoring-contract-03-{timestamp}.json"
    path.write_text(
        json.dumps(snapshot, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Capture the live rollback snapshot and call the private Supabase RPC.",
    )
    args = parser.parse_args()

    areas = read_rows(AREA_PATH)
    accessibility = read_rows(ACCESSIBILITY_PATH)
    gaps = read_rows(GAP_PATH)
    snapshot_id = validate(areas, accessibility, gaps)
    print(
        "PASS local scoring-contract-03 payload: "
        f"areas={len(areas)}, accessibility={len(accessibility)}, "
        f"gaps={len(gaps)}, snapshot={snapshot_id}"
    )
    if not args.publish:
        print("Dry run only; no Supabase request was made.")
        return 0

    base_url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("VITE_SUPABASE_URL")
        or ""
    ).rstrip("/")
    secret_key = os.environ.get("SUPABASE_SECRET_KEY", "")
    if not base_url or not secret_key:
        print(
            "SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SECRET_KEY are required",
            file=sys.stderr,
        )
        return 2

    rollback_path = capture_rollback_snapshot(base_url, secret_key)
    print(f"Captured rollback snapshot: {rollback_path}")
    result = request_json(
        f"{base_url}/rest/v1/rpc/publish_scoring_contract_03",
        secret_key,
        method="POST",
        payload={
            "p_area_profiles": areas,
            "p_accessibility": accessibility,
            "p_gap_scores": gaps,
        },
    )
    print(f"PASS Supabase atomic publication: {json.dumps(result, sort_keys=True)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
