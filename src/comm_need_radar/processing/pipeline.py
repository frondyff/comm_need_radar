from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pandas as pd
from shapely.geometry import shape

from comm_need_radar.config.paths import (
    ACCESSIBILITY_TABLE_PATH,
    AREA_BOUNDARIES_PATH,
    AREA_PROFILE_PATH,
    AREA_RAW_PATH,
    AREA_VULNERABILITY_INDEX_REAL_PATH,
    FLYER_EXAMPLES_PATH,
    GAP_SCORE_PATH,
    MONITORING_SUMMARY_PATH,
    PROCESSED_DIR,
    SCORING_FORMULA_MANIFEST_PATH,
    SERVICES_MASTER_PATH,
)
from comm_need_radar.monitoring.quality import write_monitoring_summary
from comm_need_radar.rag.summaries import area_summary_en, area_summary_fr
from comm_need_radar.scoring.formula_registry import (
    ACCESSIBILITY_FORMULA_ID,
    FORMULA_SET_VERSION,
    GAP_FORMULA_ID,
    PLANNING_SERVICE_CATEGORIES,
    SERVICE_CATEGORY_CROSSWALK,
    SERVICE_SNAPSHOT_DATE,
    STRUCTURAL_FORMULA_ID,
    TAXONOMY_VERSION,
    write_formula_manifest,
)
from comm_need_radar.scoring.metrics import (
    ACCESS_THRESHOLD_KM,
    gap_score,
    haversine_km,
    relative_accessibility_score,
    require_columns,
)

AREA_REGISTRY_REQUIRED = [
    "area_id",
    "area_name",
    "borough_name",
    "population",
]

REAL_INDEX_REQUIRED = [
    "area_id",
    "area_name",
    "borough_name",
    "low_income_pct_scaled",
    "seniors_65plus_pct_scaled",
    "recent_immigrant_pct_scaled",
    "no_official_language_pct_scaled",
    "shelter_cost_burden_pct_scaled",
    "vulnerability_index",
    "vulnerability_rank",
    "top_drivers",
]

SERVICE_MASTER_REQUIRED = [
    "service_id",
    "name",
    "primary_category",
    "latitude",
    "longitude",
    "mappable",
]

GENERIC_INDICATOR_MAP = {
    "income_indicator": "low_income_pct_scaled",
    "age_indicator": "seniors_65plus_pct_scaled",
    "language_indicator": "no_official_language_pct_scaled",
    "immigration_indicator": "recent_immigrant_pct_scaled",
    "housing_indicator": "shelter_cost_burden_pct_scaled",
}


def _mappable_mask(services: pd.DataFrame) -> pd.Series:
    return services["mappable"].astype(str).str.strip().str.lower().isin(
        {"1", "true", "t", "yes"}
    )


def load_inputs() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load the stable area registry, official Census index, and service master."""
    area_registry = pd.read_csv(AREA_RAW_PATH)
    real_index = pd.read_csv(AREA_VULNERABILITY_INDEX_REAL_PATH)
    services = pd.read_csv(SERVICES_MASTER_PATH)
    require_columns(area_registry.columns, AREA_REGISTRY_REQUIRED, "area registry")
    require_columns(real_index.columns, REAL_INDEX_REQUIRED, "real vulnerability index")
    require_columns(services.columns, SERVICE_MASTER_REQUIRED, "services master")
    return area_registry, real_index, services


def load_boundary_reference_points(path: Path = AREA_BOUNDARIES_PATH) -> pd.DataFrame:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows: list[dict[str, object]] = []
    for feature in payload.get("features", []):
        properties = feature.get("properties", {})
        area_id = properties.get("area_id")
        if not area_id:
            continue
        point = shape(feature["geometry"]).representative_point()
        rows.append(
            {
                "area_id": area_id,
                "latitude": round(float(point.y), 6),
                "longitude": round(float(point.x), 6),
            }
        )
    result = pd.DataFrame(rows)
    if len(result) != 12 or result["area_id"].nunique() != 12:
        raise ValueError("Real boundary file must contain exactly 12 unique area IDs")
    return result


def build_area_profile(
    area_registry: pd.DataFrame,
    real_index: pd.DataFrame,
    boundary_points: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Build one canonical STRUCT-01 area profile.

    The legacy population is retained only for interface compatibility and is
    explicitly excluded from production scoring.
    """
    points = boundary_points if boundary_points is not None else load_boundary_reference_points()
    registry = area_registry[
        ["area_id", "area_name", "borough_name", "population"]
    ].copy()
    real_columns = ["area_id", *[column for column in REAL_INDEX_REQUIRED if column != "area_id"]]
    profile = registry.merge(
        real_index[real_columns],
        on="area_id",
        how="inner",
        validate="one_to_one",
        suffixes=("_registry", ""),
    )
    profile = profile.merge(points, on="area_id", how="inner", validate="one_to_one")
    if len(profile) != 12:
        raise ValueError(f"Canonical profile expected 12 areas, found {len(profile)}")

    # Names from the official index win; registry names are used only to detect
    # accidental area-key drift.
    if (
        profile["area_name_registry"].str.strip()
        != profile["area_name"].str.strip()
    ).any():
        raise ValueError("Area registry and official index names do not match")
    if (
        profile["borough_name_registry"].str.strip()
        != profile["borough_name"].str.strip()
    ).any():
        raise ValueError("Area registry and official index boroughs do not match")

    for output_column, source_column in GENERIC_INDICATOR_MAP.items():
        profile[output_column] = profile[source_column].round(2)

    recalculated_structural = profile[list(GENERIC_INDICATOR_MAP.values())].mean(
        axis=1
    ).round(2)
    if (
        recalculated_structural - profile["vulnerability_index"].round(2)
    ).abs().gt(0.01).any():
        raise ValueError(
            "STRUCT-01 components do not reconcile to vulnerability_index"
        )
    profile["structural_vulnerability_score"] = recalculated_structural
    profile["vulnerability_score"] = profile["structural_vulnerability_score"]
    profile["structural_vulnerability_rank"] = profile["vulnerability_rank"].astype(int)
    profile["vulnerability_rank"] = profile["structural_vulnerability_rank"]
    profile["top_vulnerability_drivers"] = profile["top_drivers"]
    profile["structural_formula_id"] = STRUCTURAL_FORMULA_ID
    profile["score_basis"] = "statcan-2021-equal5-borough"
    profile["score_version"] = "structural-v1"
    profile["source_year"] = 2021
    profile["source_geography_level"] = "borough"
    profile["source_geography_name"] = profile["borough_name"]
    profile["population_basis"] = "synthetic_demo_not_for_scoring"

    columns = [
        "area_id",
        "area_name",
        "borough_name",
        "latitude",
        "longitude",
        "population",
        "population_basis",
        *GENERIC_INDICATOR_MAP,
        "structural_vulnerability_score",
        "vulnerability_score",
        "structural_vulnerability_rank",
        "vulnerability_rank",
        "top_vulnerability_drivers",
        "structural_formula_id",
        "score_basis",
        "score_version",
        "source_year",
        "source_geography_level",
        "source_geography_name",
    ]
    return profile.sort_values("structural_vulnerability_rank")[columns].reset_index(drop=True)


def service_snapshot_id(services: pd.DataFrame) -> str:
    columns = [
        "service_id",
        "primary_category",
        "latitude",
        "longitude",
        "mappable",
    ]
    stable = services[columns].copy().sort_values("service_id")
    serialized = stable.to_csv(index=False, lineterminator="\n", na_rep="")
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def build_accessibility(
    area_profile: pd.DataFrame,
    services: pd.DataFrame,
    *,
    threshold_km: float = ACCESS_THRESHOLD_KM,
    distance_weight: float = 0.5,
    availability_weight: float = 0.5,
) -> pd.DataFrame:
    source_categories = set(services["primary_category"].dropna().unique())
    unmapped = sorted(source_categories - set(SERVICE_CATEGORY_CROSSWALK))
    missing = sorted(set(SERVICE_CATEGORY_CROSSWALK) - source_categories)
    if unmapped or missing:
        raise ValueError(
            "services_master category crosswalk mismatch: "
            f"unmapped={unmapped}, missing={missing}"
        )

    valid_services = services[
        _mappable_mask(services)
        & services["latitude"].notna()
        & services["longitude"].notna()
    ].copy()
    valid_services["planning_category"] = valid_services["primary_category"].map(
        SERVICE_CATEGORY_CROSSWALK
    )
    snapshot_id = service_snapshot_id(services)

    raw_rows: list[dict[str, object]] = []
    for area in area_profile.itertuples(index=False):
        for category in PLANNING_SERVICE_CATEGORIES:
            category_services = valid_services[
                valid_services["planning_category"] == category
            ]
            distances = [
                haversine_km(
                    float(area.latitude),
                    float(area.longitude),
                    float(service.latitude),
                    float(service.longitude),
                )
                for service in category_services.itertuples(index=False)
            ]
            if not distances:
                raise ValueError(f"No mappable services for planning category {category}")
            raw_rows.append(
                {
                    "area_id": area.area_id,
                    "service_category": category,
                    "nearest_service_distance_km": min(distances),
                    "service_count_within_threshold": sum(
                        distance <= threshold_km for distance in distances
                    ),
                }
            )

    raw = pd.DataFrame(raw_rows)
    maximum_counts = raw.groupby("service_category")[
        "service_count_within_threshold"
    ].max()

    rows: list[dict[str, object]] = []
    for row in raw.itertuples(index=False):
        score, distance_component, availability_component = relative_accessibility_score(
            float(row.nearest_service_distance_km),
            int(row.service_count_within_threshold),
            int(maximum_counts.loc[row.service_category]),
            threshold_km=threshold_km,
            distance_weight=distance_weight,
            availability_weight=availability_weight,
        )
        rows.append(
            {
                "area_id": row.area_id,
                "service_category": row.service_category,
                "nearest_service_distance_km": round(
                    float(row.nearest_service_distance_km), 2
                ),
                "service_count_within_threshold": int(
                    row.service_count_within_threshold
                ),
                "distance_component": distance_component,
                "availability_component": availability_component,
                "accessibility_score": score,
                "accessibility_method": (
                    f"relative straight-line distance and log availability; "
                    f"threshold {threshold_km:g} km; weights "
                    f"{distance_weight:g}/{availability_weight:g}"
                ),
                "accessibility_basis": "services_master_mappable_relative_12_area",
                "accessibility_version": "services-master-relative-v1",
                "accessibility_formula_id": ACCESSIBILITY_FORMULA_ID,
                "formula_set_version": FORMULA_SET_VERSION,
                "taxonomy_version": TAXONOMY_VERSION,
                "service_snapshot_id": snapshot_id,
                "service_snapshot_date": SERVICE_SNAPSHOT_DATE,
                "service_snapshot_total_rows": len(services),
                "service_snapshot_mappable_rows": len(valid_services),
            }
        )
    return pd.DataFrame(rows).sort_values(
        ["area_id", "service_category"]
    ).reset_index(drop=True)


def build_gap_scores(
    area_profile: pd.DataFrame,
    accessibility: pd.DataFrame,
) -> pd.DataFrame:
    access_avg = (
        accessibility.groupby("area_id", as_index=False)["accessibility_score"]
        .mean()
        .rename(columns={"accessibility_score": "service_accessibility_score"})
    )
    gap = area_profile.merge(access_avg, on="area_id", how="left", validate="one_to_one")
    gap["service_accessibility_score"] = gap["service_accessibility_score"].round(2)
    gap["overall_accessibility_score"] = gap["service_accessibility_score"]
    gap["gap_score"] = gap.apply(
        lambda row: gap_score(
            float(row.structural_vulnerability_score),
            float(row.service_accessibility_score),
        ),
        axis=1,
    )
    gap["gap_rank"] = gap["gap_score"].rank(
        ascending=False, method="first"
    ).astype(int)
    gap["priority_flag"] = ""
    gap["classification_status"] = "unvalidated_poc"
    gap["structural_formula_id"] = STRUCTURAL_FORMULA_ID
    gap["accessibility_formula_id"] = ACCESSIBILITY_FORMULA_ID
    gap["gap_formula_id"] = GAP_FORMULA_ID
    gap["formula_set_version"] = FORMULA_SET_VERSION
    gap["gap_basis"] = "structural-census-plus-relative-service-access"
    gap["gap_version"] = "gap-v1"
    gap["taxonomy_version"] = TAXONOMY_VERSION

    snapshot_ids = accessibility["service_snapshot_id"].dropna().unique()
    if len(snapshot_ids) != 1:
        raise ValueError("Accessibility rows must share one service snapshot ID")
    gap["service_snapshot_id"] = snapshot_ids[0]

    weakest = (
        accessibility.sort_values(["area_id", "accessibility_score"])
        .groupby("area_id")["service_category"]
        .apply(lambda values: "; ".join(values.head(3)))
        .to_dict()
    )
    gap["gap_drivers"] = gap.apply(
        lambda row: (
            f"{row.top_vulnerability_drivers}; comparatively weaker access: "
            f"{weakest[row.area_id]}"
        ),
        axis=1,
    )
    gap["summary_en"] = gap.apply(
        lambda row: area_summary_en(
            row.area_name,
            row.structural_vulnerability_score,
            row.service_accessibility_score,
            row.top_vulnerability_drivers,
        ),
        axis=1,
    )
    gap["summary_fr"] = gap.apply(
        lambda row: area_summary_fr(
            row.area_name,
            row.structural_vulnerability_score,
            row.service_accessibility_score,
            row.top_vulnerability_drivers,
        ),
        axis=1,
    )
    columns = [
        "area_id",
        "area_name",
        "borough_name",
        "latitude",
        "longitude",
        "structural_vulnerability_score",
        "vulnerability_score",
        "service_accessibility_score",
        "overall_accessibility_score",
        "gap_score",
        "gap_rank",
        "priority_flag",
        "classification_status",
        "gap_drivers",
        "summary_en",
        "summary_fr",
        "structural_formula_id",
        "accessibility_formula_id",
        "gap_formula_id",
        "formula_set_version",
        "gap_basis",
        "gap_version",
        "taxonomy_version",
        "service_snapshot_id",
    ]
    return gap.sort_values("gap_rank")[columns].reset_index(drop=True)


def build_flyer_examples(
    gap: pd.DataFrame,
    services: pd.DataFrame,
) -> pd.DataFrame:
    valid_services = services[
        _mappable_mask(services)
        & services["latitude"].notna()
        & services["longitude"].notna()
    ].copy()

    def display_text(value: object) -> str:
        if pd.isna(value):
            return ""
        return " ".join(str(value).split())

    rows: list[dict[str, object]] = []
    for area in gap.head(5).itertuples(index=False):
        candidates = valid_services.copy()
        candidates["distance_km"] = candidates.apply(
            lambda service: haversine_km(
                float(area.latitude),
                float(area.longitude),
                float(service.latitude),
                float(service.longitude),
            ),
            axis=1,
        )
        for service in candidates.nsmallest(4, "distance_km").itertuples(index=False):
            rows.append(
                {
                    "selected_area_id": area.area_id,
                    "area_label": area.area_name,
                    "selected_service_category": service.primary_category,
                    "service_name": display_text(service.name),
                    "address": display_text(service.address),
                    "phone": display_text(service.phone),
                    "website": display_text(service.website),
                    "language": "",
                    "distance_km": round(float(service.distance_km), 2),
                    "generated_date": SERVICE_SNAPSHOT_DATE,
                    "disclaimer": (
                        "Public directory snapshot. Confirm service details and "
                        "availability directly before referral."
                    ),
                }
            )
    return pd.DataFrame(rows)

def build_monitoring(
    area_registry: pd.DataFrame,
    services: pd.DataFrame,
    accessibility: pd.DataFrame,
    gap: pd.DataFrame,
) -> list[dict[str, object]]:
    mappable_count = int(_mappable_mask(services).sum())
    return [
        {
            "check_name": "canonical_area_rows",
            "status": "pass",
            "value": len(area_registry),
            "details": "12 stable area IDs joined to official Census index",
        },
        {
            "check_name": "services_master_rows",
            "status": "pass",
            "value": len(services),
            "details": "Deduplicated public service-directory records",
        },
        {
            "check_name": "mappable_service_rows",
            "status": "pass",
            "value": mappable_count,
            "details": "Rows eligible for ACCESS-REAL-02",
        },
        {
            "check_name": "accessibility_rows",
            "status": "pass" if len(accessibility) == 108 else "fail",
            "value": len(accessibility),
            "details": "12 areas x 9 planning service categories",
        },
        {
            "check_name": "gap_score_rows",
            "status": "pass" if len(gap) == 12 else "fail",
            "value": len(gap),
            "details": f"Candidate {GAP_FORMULA_ID} rows",
        },
        {
            "check_name": "formula_alias_reconciliation",
            "status": (
                "pass"
                if (
                    gap["vulnerability_score"]
                    == gap["structural_vulnerability_score"]
                ).all()
                else "fail"
            ),
            "value": len(gap),
            "details": "Compatibility aliases equal STRUCT-01",
        },
        {
            "check_name": "classification_status",
            "status": "watch",
            "value": 0,
            "details": "No High/Watch/Lower bands until product validation",
        },
    ]


def run_pipeline() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    area_registry, real_index, services = load_inputs()
    area_profile = build_area_profile(area_registry, real_index)
    accessibility = build_accessibility(area_profile, services)
    gap = build_gap_scores(area_profile, accessibility)
    flyer = build_flyer_examples(gap, services)

    area_profile.to_csv(AREA_PROFILE_PATH, index=False, lineterminator="\n")
    accessibility.to_csv(
        ACCESSIBILITY_TABLE_PATH,
        index=False,
        lineterminator="\n",
    )
    gap.to_csv(GAP_SCORE_PATH, index=False, lineterminator="\n")
    flyer.to_csv(FLYER_EXAMPLES_PATH, index=False, lineterminator="\n")
    write_formula_manifest(SCORING_FORMULA_MANIFEST_PATH)
    write_monitoring_summary(
        MONITORING_SUMMARY_PATH,
        build_monitoring(area_registry, services, accessibility, gap),
    )
