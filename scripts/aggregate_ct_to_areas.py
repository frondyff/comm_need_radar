"""Aggregate the StatCan census-tract Vulnerability Index up to the 12 MVP areas.

The 12 MVP areas (data/raw/synthetic_area_profiles.csv) are neighbourhoods inside
real Montreal boroughs. Real, official boundaries only exist at the borough level
(data/raw/boundaries/montreal_boroughs.geojson, from Montreal's open data portal),
so this script aggregates census tracts (CTs) up to the **borough** level and then
maps each of the 12 areas onto its borough's aggregated value.

Caveat: Parc Extension (A001) and Saint-Michel (A002) are both inside the same
borough (Villeray-Saint-Michel-Parc-Extension), so they receive the *same*
borough-level aggregated value below — there is no official sub-borough boundary
to split them further with real data.

Process (run with `python scripts/aggregate_ct_to_areas.py -v` to print each stage):

  Step 1 - Spatial join: for each of the 1,004 Montreal CTs, take its centroid
           (data/raw/boundaries/ct_centroids_montreal.csv, derived from StatCan's
           2021 CT cartographic boundary file) and test which borough polygon
           contains it (shapely point-in-polygon).
  Step 2 - Attach the CT's 5 census variables + population from
           data/raw/statcan_2021_montreal_ct_variables.csv to its assigned borough.
  Step 3 - Population-weighted average each variable within each borough
           (weighted by CT population, so a 200-person tract doesn't count as
           much as a 6,000-person tract).
  Step 4 - Re-run the CISV min-max scaling + equal weights *across the 11
           boroughs* (scaling must happen at the final aggregation level, not be
           inherited from the CT level) to get each borough's Vulnerability Index.
  Step 5 - Map the 12 MVP area_ids onto their borough's aggregated row.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import argparse
import csv
import json
import sys

from shapely.geometry import Point, shape

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from comm_need_radar.config.paths import RAW_DIR, PROCESSED_DIR
from comm_need_radar.scoring.metrics import min_max_scale

BOUNDARIES_DIR = RAW_DIR / "boundaries"
CT_VARIABLES_PATH = RAW_DIR / "statcan_2021_montreal_ct_variables.csv"
CT_CENTROIDS_PATH = BOUNDARIES_DIR / "ct_centroids_montreal.csv"
BOROUGHS_GEOJSON_PATH = BOUNDARIES_DIR / "montreal_boroughs.geojson"
AREAS_PATH = RAW_DIR / "synthetic_area_profiles.csv"
OUTPUT_PATH = PROCESSED_DIR / "area_vulnerability_index_real.csv"

CENSUS_VARIABLES = [
    "low_income_pct",
    "seniors_65plus_pct",
    "recent_immigrant_pct",
    "no_official_language_pct",
    "shelter_cost_burden_pct",
]

OPTIONAL_FOCUS_VARIABLES = [
    "indigenous_identity_pct",
]

IMMIGRANT_CONCERN_VARIABLES = [
    "recent_immigrant_pct_scaled",
    "no_official_language_pct_scaled",
]

DRIVER_LABELS = {
    "low_income_pct": "income pressure",
    "seniors_65plus_pct": "age-related support need",
    "recent_immigrant_pct": "newcomer support need",
    "no_official_language_pct": "language access need",
    "shelter_cost_burden_pct": "housing pressure",
    "indigenous_identity_pct": "Indigenous-specific service concern",
}

# Maps each official borough name (as it appears in montreal_boroughs.geojson)
# to the project's borough_name spelling (data/raw/synthetic_area_profiles.csv).
BOROUGH_NAME_MAP = {
    "Villeray-Saint-Michel-Parc-Extension": "Villeray-Saint-Michel-Parc-Extension",
    "Côte-des-Neiges-Notre-Dame-de-Grâce": "Cote-des-Neiges-Notre-Dame-de-Grace",
    "Montréal-Nord": "Montreal-Nord",
    "Mercier-Hochelaga-Maisonneuve": "Mercier-Hochelaga-Maisonneuve",
    "Verdun": "Verdun",
    "Ahuntsic-Cartierville": "Ahuntsic-Cartierville",
    "Lachine": "Lachine",
    "Westmount": "Westmount",
    "Le Plateau-Mont-Royal": "Le Plateau-Mont-Royal",
    "Le Sud-Ouest": "Le Sud-Ouest",
    "Rivière-des-Prairies-Pointe-aux-Trembles": "Riviere-des-Prairies-Pointe-aux-Trembles",
}


def log(verbose: bool, message: str) -> None:
    if verbose:
        print(message)


def load_borough_polygons() -> list[tuple[str, object]]:
    geojson = json.loads(BOROUGHS_GEOJSON_PATH.read_text(encoding="utf-8"))
    polygons = []
    for feature in geojson["features"]:
        official_name = feature["properties"]["NOM"]
        project_name = BOROUGH_NAME_MAP.get(official_name)
        if project_name is None:
            continue
        polygons.append((project_name, shape(feature["geometry"])))
    return polygons


def load_ct_centroids() -> dict[str, tuple[float, float]]:
    with CT_CENTROIDS_PATH.open(newline="", encoding="utf-8") as f:
        return {
            normalize_ct_code(row["ct_code"]): (float(row["centroid_lon"]), float(row["centroid_lat"]))
            for row in csv.DictReader(f)
        }


def normalize_ct_code(value: str) -> str:
    return value.removesuffix(".00")


def load_ct_variables() -> list[dict[str, str]]:
    with CT_VARIABLES_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        row["ct_code"] = normalize_ct_code(row["ct_code"])
    return [row for row in rows if all(row[col] not in (None, "") for col in CENSUS_VARIABLES)]


def step1_assign_cts_to_boroughs(
    ct_variables: list[dict[str, str]],
    centroids: dict[str, tuple[float, float]],
    borough_polygons: list[tuple[str, object]],
    verbose: bool,
) -> dict[str, list[dict[str, str]]]:
    by_borough: dict[str, list[dict[str, str]]] = defaultdict(list)
    unassigned = 0
    for row in ct_variables:
        lon_lat = centroids.get(row["ct_code"])
        if lon_lat is None:
            unassigned += 1
            continue
        point = Point(*lon_lat)
        borough_name = next(
            (name for name, polygon in borough_polygons if polygon.contains(point)), None
        )
        if borough_name is None:
            unassigned += 1
            continue
        by_borough[borough_name].append(row)
    log(
        verbose,
        f"Step 1 - spatial join: {len(ct_variables) - unassigned} of {len(ct_variables)} "
        f"CTs fell inside one of the 11 target boroughs ({unassigned} fell outside, "
        f"e.g. in CMA suburbs not covered by the 12 MVP areas).",
    )
    for name, rows in sorted(by_borough.items()):
        log(verbose, f"    {name}: {len(rows)} census tracts")
    return by_borough


def step3_weighted_average(rows: list[dict[str, str]], verbose: bool, borough_name: str) -> dict[str, float]:
    total_pop = sum(float(row["population_2021"]) for row in rows)
    weighted = {}
    variables = CENSUS_VARIABLES + [
        col for col in OPTIONAL_FOCUS_VARIABLES if all(row.get(col) not in (None, "") for row in rows)
    ]
    for col in variables:
        weighted[col] = round(
            sum(float(row[col]) * float(row["population_2021"]) for row in rows) / total_pop, 2
        )
    weighted["population_2021"] = round(total_pop, 0)
    log(
        verbose,
        f"Step 3 - population-weighted average for {borough_name} "
        f"(total population {int(total_pop):,} across {len(rows)} CTs): {weighted}",
    )
    return weighted


def step4_scale_and_score(borough_rows: dict[str, dict[str, float]], verbose: bool) -> None:
    variables = CENSUS_VARIABLES + [
        col for col in OPTIONAL_FOCUS_VARIABLES if all(col in row for row in borough_rows.values())
    ]
    for col in variables:
        values = [row[col] for row in borough_rows.values()]
        lo, hi = min(values), max(values)
        for row in borough_rows.values():
            row[f"{col}_scaled"] = round(min_max_scale(row[col], lo, hi), 2)
        log(verbose, f"Step 4 - {col}: min={lo}, max={hi} across the 11 boroughs (min-max scaled to 0-100)")

    for row in borough_rows.values():
        scaled = [row[f"{col}_scaled"] for col in CENSUS_VARIABLES]
        row["vulnerability_index"] = round(sum(scaled) / len(scaled), 2)
        ordered = sorted(CENSUS_VARIABLES, key=lambda c: row[f"{c}_scaled"], reverse=True)
        row["top_drivers"] = "; ".join(DRIVER_LABELS[c] for c in ordered[:3])
        immigrant_score = round(
            sum(float(row[col]) for col in IMMIGRANT_CONCERN_VARIABLES) / len(IMMIGRANT_CONCERN_VARIABLES),
            2,
        )
        row["immigrant_census_concern_score"] = immigrant_score
        indigenous_scaled_col = "indigenous_identity_pct_scaled"
        if indigenous_scaled_col in row:
            indigenous_score = float(row[indigenous_scaled_col])
            row["indigenous_census_concern_score"] = round(indigenous_score, 2)
            row["mvp_focus_census_index"] = round((immigrant_score + indigenous_score) / 2, 2)
            row["mvp_focus_data_basis"] = "immigrant_and_indigenous_census"
            row["mvp_focus_top_concern"] = (
                "Indigenous-specific service concern"
                if indigenous_score >= immigrant_score
                else "newcomer/language access concern"
            )
        else:
            row["indigenous_census_concern_score"] = ""
            row["mvp_focus_census_index"] = immigrant_score
            row["mvp_focus_data_basis"] = "immigrant_census_only_indigenous_missing"
            row["mvp_focus_top_concern"] = "newcomer/language access concern; Indigenous census variable missing"


def step5_map_to_areas(borough_rows: dict[str, dict[str, float]], verbose: bool) -> list[dict[str, object]]:
    with AREAS_PATH.open(newline="", encoding="utf-8") as f:
        areas = list(csv.DictReader(f))

    output = []
    for area in areas:
        borough_name = area["borough_name"]
        borough_row = borough_rows.get(borough_name)
        if borough_row is None:
            log(verbose, f"Step 5 - WARNING: no aggregated data for borough '{borough_name}' (area {area['area_id']})")
            continue
        output.append(
            {
                "area_id": area["area_id"],
                "area_name": area["area_name"],
                "borough_name": borough_name,
                **borough_row,
            }
        )
    output.sort(key=lambda row: row["vulnerability_index"], reverse=True)
    for rank, row in enumerate(output, start=1):
        row["vulnerability_rank"] = rank
    log(verbose, f"Step 5 - mapped {len(output)} of {len(areas)} MVP areas onto their borough's aggregated row.")
    return output


def write_output(rows: list[dict[str, object]]) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys())
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-v", "--verbose", action="store_true", help="print each aggregation step")
    args = parser.parse_args()

    ct_variables = load_ct_variables()
    centroids = load_ct_centroids()
    borough_polygons = load_borough_polygons()

    by_borough = step1_assign_cts_to_boroughs(ct_variables, centroids, borough_polygons, args.verbose)

    borough_rows: dict[str, dict[str, float]] = {}
    for borough_name, rows in by_borough.items():
        borough_rows[borough_name] = step3_weighted_average(rows, args.verbose, borough_name)

    step4_scale_and_score(borough_rows, args.verbose)
    area_rows = step5_map_to_areas(borough_rows, args.verbose)
    write_output(area_rows)
    print(f"Wrote {len(area_rows)} MVP areas to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
