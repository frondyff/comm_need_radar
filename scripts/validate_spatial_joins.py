"""Validate area polygons and every committed point-to-area join."""

from __future__ import annotations

import csv
import gzip
import json
from pathlib import Path
import sys
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from comm_need_radar.geospatial.boundaries import (  # noqa: E402
    SOURCE_DOWNLOADED_DATE,
    SOURCE_LICENSE,
    SOURCE_URL,
    AreaBoundary,
    area_boundaries_from_feature_collection,
    area_feature_collection,
    build_area_boundaries_from_files,
    match_point,
)


AREA_REGISTRY_PATH = PROJECT_ROOT / "data" / "raw" / "synthetic_area_profiles.csv"
SCORED_AREA_PATH = PROJECT_ROOT / "data" / "processed" / "area_profile.csv"
BOROUGH_PATH = PROJECT_ROOT / "data" / "raw" / "boundaries" / "montreal_boroughs.geojson"
CENTER_PATH = PROJECT_ROOT / "data" / "raw" / "database_centers.csv"
CENTER_LOOKUP_PATH = PROJECT_ROOT / "data" / "processed" / "center_area_lookup.csv"
CT_PATH = PROJECT_ROOT / "data" / "raw" / "boundaries" / "ct_centroids_montreal.csv"
GEOJSON_PATH = PROJECT_ROOT / "frontend" / "public" / "geo" / "areas.geojson"
SUMMARY_PATH = PROJECT_ROOT / "data" / "processed" / "spatial_join_summary.csv"
ISSUES_PATH = PROJECT_ROOT / "data" / "processed" / "spatial_join_issues.csv"
REPORT_PATH = (
    PROJECT_ROOT / "docs" / "reference" / "data" / "spatial-join-validation.md"
)
VALIDATION_DATE = "2026-07-14"
RAW_PAYLOAD_BUDGET_BYTES = 600_000
GZIP_PAYLOAD_BUDGET_BYTES = 200_000


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def evaluate_points(
    dataset: str,
    rows: list[dict[str, str]],
    boundaries: list[AreaBoundary],
    id_column: str,
    longitude_column: str,
    latitude_column: str,
    expected_by_id: dict[str, str] | None = None,
) -> tuple[dict[str, int | str], list[dict[str, str]]]:
    matched_once = 0
    unmatched = 0
    multiply_matched = 0
    lookup_mismatches = 0
    issues: list[dict[str, str]] = []

    for row in rows:
        record_id = row[id_column]
        longitude = float(row[longitude_column])
        latitude = float(row[latitude_column])
        matches = match_point(longitude, latitude, boundaries)
        match_ids = [match.area_id for match in matches]
        expected = expected_by_id.get(record_id, "") if expected_by_id is not None else ""

        if len(matches) == 1:
            matched_once += 1
        elif len(matches) == 0:
            unmatched += 1
            issues.append(
                {
                    "dataset": dataset,
                    "record_id": record_id,
                    "issue_type": "unmatched_outside_study_area",
                    "matched_area_ids": "",
                    "expected_area_id": expected,
                    "longitude": str(longitude),
                    "latitude": str(latitude),
                }
            )
        else:
            multiply_matched += 1
            issues.append(
                {
                    "dataset": dataset,
                    "record_id": record_id,
                    "issue_type": "multiply_matched",
                    "matched_area_ids": ";".join(match_ids),
                    "expected_area_id": expected,
                    "longitude": str(longitude),
                    "latitude": str(latitude),
                }
            )

        actual = match_ids[0] if len(match_ids) == 1 else ""
        if expected_by_id is not None and actual != expected:
            lookup_mismatches += 1
            issues.append(
                {
                    "dataset": dataset,
                    "record_id": record_id,
                    "issue_type": "lookup_mismatch",
                    "matched_area_ids": ";".join(match_ids),
                    "expected_area_id": expected,
                    "longitude": str(longitude),
                    "latitude": str(latitude),
                }
            )

    return (
        {
            "dataset": dataset,
            "total_records": len(rows),
            "matched_once": matched_once,
            "unmatched": unmatched,
            "multiply_matched": multiply_matched,
            "lookup_mismatches": lookup_mismatches,
        },
        issues,
    )


def evaluate_area_contract(
    area_rows: list[dict[str, str]],
    boundaries: list[AreaBoundary],
) -> tuple[dict[str, int | str], list[dict[str, str]]]:
    expected = {row["area_id"]: row["area_id"] for row in area_rows}
    return evaluate_points(
        "scored_area_centroids",
        area_rows,
        boundaries,
        "area_id",
        "longitude",
        "latitude",
        expected,
    )


def polygon_overlap_issues(boundaries: list[AreaBoundary]) -> list[dict[str, str]]:
    issues = []
    for index, left in enumerate(boundaries):
        for right in boundaries[index + 1 :]:
            overlap_area = left.geometry.intersection(right.geometry).area
            if overlap_area > 1e-12:
                issues.append(
                    {
                        "dataset": "area_polygons",
                        "record_id": f"{left.area_id}:{right.area_id}",
                        "issue_type": "polygon_overlap",
                        "matched_area_ids": f"{left.area_id};{right.area_id}",
                        "expected_area_id": "",
                        "longitude": "",
                        "latitude": "",
                    }
                )
    return issues


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def write_report(
    summaries: list[dict[str, int | str]],
    overlap_count: int,
    raw_size: int,
    gzip_size: int,
) -> None:
    rows = "\n".join(
        "| {dataset} | {total_records} | {matched_once} | {unmatched} | "
        "{multiply_matched} | {lookup_mismatches} |".format(**summary)
        for summary in summaries
    )
    report = f"""# Spatial Join Validation

Validation snapshot: {VALIDATION_DATE}

## Boundary Source

- Source: Ville de Montreal, Limites administratives de l'agglomeration
- Source URL: {SOURCE_URL}
- License: {SOURCE_LICENSE}
- Downloaded: {SOURCE_DOWNLOADED_DATE}
- Input: `data/raw/boundaries/montreal_boroughs.geojson`, 11 selected official
  administrative polygons in WGS84

## Transformation

Ten project areas map one-to-one to an official administrative polygon. The two
stable IDs inside Villeray-Saint-Michel-Parc-Extension (`A001` Parc Extension and
`A002` Saint-Michel) partition that official polygon using nearest project
centroid in a local equirectangular projection. The outer boundary remains
official; the internal divider is derived and labeled
`centroid_partition_within_official_boundary` in GeoJSON.

This transformation preserves all 12 existing `area_id` values without polygon
overlap. It also matches the previously documented nearest-centroid rule used by
`center_area_lookup.csv`.

## Join Results

| Dataset | Total | Matched once | Unmatched | Multiple matches | Lookup mismatches |
| --- | ---: | ---: | ---: | ---: | ---: |
{rows}

Polygon pairs with positive-area overlap: **{overlap_count}**.

Every unmatched record is listed in
`data/processed/spatial_join_issues.csv`. Unmatched center and census-tract
centroids fall outside the 11-polygon study area and remain intentionally
unassigned. Multiple matches and center lookup mismatches are release blockers.

## Frontend Payload Decision

- `frontend/public/geo/areas.geojson`: {raw_size:,} bytes raw
- Deterministic gzip size: {gzip_size:,} bytes
- Budget: {RAW_PAYLOAD_BUDGET_BYTES:,} bytes raw / {GZIP_PAYLOAD_BUDGET_BYTES:,}
  bytes gzip

GeoJSON remains appropriate for 12 low-complexity interactive features at this
size. PMTiles or vector tiles are deferred until the product adopts tract-level
or citywide high-resolution geography.

## Limitations

- `A001` and `A002` are operational project areas, not official administrative
  units; their shared divider is derived from the two committed centroids.
- The dataset covers the 11 selected administrative polygons, not the complete
  Montreal CMA, so out-of-study centers and census tracts are expected.
- Point-on-boundary matches are checked explicitly; any point covered by more
  than one polygon fails validation.
"""
    REPORT_PATH.write_text(report, encoding="utf-8")


def main() -> None:
    area_registry = read_csv(AREA_REGISTRY_PATH)
    scored_area_rows = read_csv(SCORED_AREA_PATH)
    generated_boundaries = build_area_boundaries_from_files(
        AREA_REGISTRY_PATH,
        BOROUGH_PATH,
    )
    committed_collection = json.loads(GEOJSON_PATH.read_text(encoding="utf-8"))
    reproducible = committed_collection == area_feature_collection(generated_boundaries)
    boundaries = area_boundaries_from_feature_collection(
        committed_collection,
        area_registry,
    )
    area_summary, area_issues = evaluate_area_contract(
        scored_area_rows,
        boundaries,
    )

    center_lookup = {
        row["center_id"]: row["area_id"] for row in read_csv(CENTER_LOOKUP_PATH)
    }
    center_summary, center_issues = evaluate_points(
        "service_centers",
        read_csv(CENTER_PATH),
        boundaries,
        "center_id",
        "longitude",
        "latitude",
        center_lookup,
    )
    ct_summary, ct_issues = evaluate_points(
        "census_tract_centroids",
        read_csv(CT_PATH),
        boundaries,
        "ct_code",
        "centroid_lon",
        "centroid_lat",
    )
    overlap_issues = polygon_overlap_issues(boundaries)

    summaries = [area_summary, center_summary, ct_summary]
    issues = area_issues + center_issues + ct_issues + overlap_issues
    write_csv(
        SUMMARY_PATH,
        summaries,
        [
            "dataset",
            "total_records",
            "matched_once",
            "unmatched",
            "multiply_matched",
            "lookup_mismatches",
        ],
    )
    write_csv(
        ISSUES_PATH,
        issues,
        [
            "dataset",
            "record_id",
            "issue_type",
            "matched_area_ids",
            "expected_area_id",
            "longitude",
            "latitude",
        ],
    )

    payload = GEOJSON_PATH.read_bytes()
    raw_size = len(payload)
    gzip_size = len(gzip.compress(payload, mtime=0))
    write_report(summaries, len(overlap_issues), raw_size, gzip_size)

    blocking = (
        int(area_summary["unmatched"])
        + int(area_summary["multiply_matched"])
        + int(area_summary["lookup_mismatches"])
        + int(center_summary["multiply_matched"])
        + int(center_summary["lookup_mismatches"])
        + int(ct_summary["multiply_matched"])
        + len(overlap_issues)
    )
    if not reproducible:
        blocking += 1
        print("FAIL committed GeoJSON does not match the reproducible build", file=sys.stderr)
    if raw_size > RAW_PAYLOAD_BUDGET_BYTES or gzip_size > GZIP_PAYLOAD_BUDGET_BYTES:
        blocking += 1
        print("FAIL GeoJSON payload exceeds the documented budget", file=sys.stderr)
    if blocking:
        raise SystemExit(f"Spatial validation failed with {blocking} blocking issue(s)")

    for summary in summaries:
        print(
            "PASS {dataset}: total={total_records} matched={matched_once} "
            "unmatched={unmatched} multiple={multiply_matched} mismatches={lookup_mismatches}".format(
                **summary
            )
        )
    print(f"PASS polygon overlaps: {len(overlap_issues)}")
    print("PASS committed GeoJSON matches the reproducible build")
    print(f"PASS GeoJSON payload: {raw_size:,} raw; {gzip_size:,} gzip")


if __name__ == "__main__":
    main()
