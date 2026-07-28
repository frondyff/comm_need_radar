"""Generate the no-publish scoring comparison required before release.

This script reconstructs the live legacy formulas from their source fixtures,
compares them with scoring-contract-02, and performs the approved sensitivity
runs. It never connects to or writes to Supabase.
"""

from __future__ import annotations

from pathlib import Path
import sys

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from comm_need_radar.config.paths import (  # noqa: E402
    AREA_RAW_PATH,
    AREA_VULNERABILITY_INDEX_REAL_PATH,
    RAW_DIR,
    SERVICES_MASTER_PATH,
)
from comm_need_radar.processing.pipeline import (  # noqa: E402
    PLANNING_SERVICE_CATEGORIES,
    SERVICE_CATEGORY_CROSSWALK,
    _mappable_mask,
    build_accessibility,
    build_area_profile,
    build_gap_scores,
    load_boundary_reference_points,
)
from comm_need_radar.scoring.metrics import (  # noqa: E402
    accessibility_score,
    gap_score,
    haversine_km,
    vulnerability_score,
)


OUTPUT = ROOT / "docs" / "reference" / "scoring" / "scoring-candidate-comparison-2026-07-28.md"


def markdown_table(frame: pd.DataFrame) -> str:
    def clean(value: object) -> str:
        if pd.isna(value):
            return ""
        return str(value).replace("|", "\\|").replace("\n", " ")

    headers = [clean(column) for column in frame.columns]
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    lines.extend(
        "| " + " | ".join(clean(value) for value in row) + " |"
        for row in frame.itertuples(index=False, name=None)
    )
    return "\n".join(lines)


def rank_scores(frame: pd.DataFrame, score_column: str, output_column: str) -> pd.DataFrame:
    result = frame.copy()
    result[output_column] = result[score_column].rank(
        ascending=False, method="first"
    ).astype(int)
    return result


def legacy_accessibility(
    areas: pd.DataFrame,
    services: pd.DataFrame,
    *,
    category_column: str,
) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    categories = sorted(services[category_column].dropna().unique())
    for area in areas.itertuples(index=False):
        for category in categories:
            category_services = services[services[category_column] == category]
            distances = [
                haversine_km(
                    float(area.latitude),
                    float(area.longitude),
                    float(service.latitude),
                    float(service.longitude),
                )
                for service in category_services.itertuples(index=False)
            ]
            nearest = min(distances)
            count = sum(distance <= 2.5 for distance in distances)
            rows.append(
                {
                    "area_id": area.area_id,
                    "service_category": category,
                    "accessibility_score": accessibility_score(nearest, count),
                }
            )
    return pd.DataFrame(rows)


def real_services_with_planning_category(services: pd.DataFrame) -> pd.DataFrame:
    valid = services[
        _mappable_mask(services)
        & services["latitude"].notna()
        & services["longitude"].notna()
    ].copy()
    valid["planning_category"] = valid["primary_category"].map(
        SERVICE_CATEGORY_CROSSWALK
    )
    return valid


def average_accessibility(accessibility: pd.DataFrame, output_name: str) -> pd.DataFrame:
    return (
        accessibility.groupby("area_id", as_index=False)["accessibility_score"]
        .mean()
        .rename(columns={"accessibility_score": output_name})
        .assign(**{output_name: lambda frame: frame[output_name].round(2)})
    )


def main() -> None:
    area_registry = pd.read_csv(AREA_RAW_PATH)
    real_index = pd.read_csv(AREA_VULNERABILITY_INDEX_REAL_PATH)
    synthetic_services = pd.read_csv(RAW_DIR / "synthetic_services.csv")
    services_master = pd.read_csv(SERVICES_MASTER_PATH)
    points = load_boundary_reference_points()
    candidate_profile = build_area_profile(area_registry, real_index, points)

    legacy_profile = area_registry[["area_id", "area_name"]].copy()
    legacy_profile["displayed_profile_vulnerability"] = area_registry.apply(
        lambda row: vulnerability_score(row.to_dict()),
        axis=1,
    )

    old_access = average_accessibility(
        legacy_accessibility(
            area_registry,
            synthetic_services,
            category_column="service_category",
        ),
        "legacy_synthetic_access",
    )

    real_planning_services = real_services_with_planning_category(services_master)
    legacy_real_access = average_accessibility(
        legacy_accessibility(
            candidate_profile,
            real_planning_services,
            category_column="planning_category",
        ),
        "old_formula_real_service_access",
    )

    candidate_access_rows = build_accessibility(candidate_profile, services_master)
    candidate_gap = build_gap_scores(candidate_profile, candidate_access_rows)

    comparison = (
        candidate_profile[
            ["area_id", "area_name", "structural_vulnerability_score"]
        ]
        .merge(legacy_profile, on=["area_id", "area_name"], validate="one_to_one")
        .merge(old_access, on="area_id", validate="one_to_one")
        .merge(legacy_real_access, on="area_id", validate="one_to_one")
        .merge(
            candidate_gap[
                [
                    "area_id",
                    "service_accessibility_score",
                    "gap_score",
                    "gap_rank",
                ]
            ],
            on="area_id",
            validate="one_to_one",
        )
    )
    comparison["legacy_gap"] = comparison.apply(
        lambda row: gap_score(
            row.structural_vulnerability_score,
            row.legacy_synthetic_access,
        ),
        axis=1,
    )
    comparison["old_formula_real_service_gap"] = comparison.apply(
        lambda row: gap_score(
            row.structural_vulnerability_score,
            row.old_formula_real_service_access,
        ),
        axis=1,
    )
    comparison = rank_scores(comparison, "legacy_gap", "legacy_rank")
    comparison = rank_scores(
        comparison,
        "old_formula_real_service_gap",
        "old_formula_real_service_rank",
    )
    comparison["rank_change"] = comparison["legacy_rank"] - comparison["gap_rank"]
    comparison = comparison.sort_values("gap_rank")

    sensitivity_rows: list[dict[str, object]] = []
    default_ranks = candidate_gap.set_index("area_id")["gap_rank"]
    for threshold in (1.5, 2.5, 5.0):
        for distance_weight in (0.25, 0.5, 0.75):
            access = build_accessibility(
                candidate_profile,
                services_master,
                threshold_km=threshold,
                distance_weight=distance_weight,
                availability_weight=1.0 - distance_weight,
            )
            scored = build_gap_scores(candidate_profile, access).set_index("area_id")
            rank_delta = scored["gap_rank"] - default_ranks
            sensitivity_rows.append(
                {
                    "radius_km": threshold,
                    "distance_weight": distance_weight,
                    "availability_weight": 1.0 - distance_weight,
                    "spearman_vs_default": round(
                        # Both inputs are already ranks, so their ordinary
                        # Pearson correlation is Spearman's rho.
                        scored["gap_rank"].corr(default_ranks),
                        3,
                    ),
                    "maximum_absolute_rank_change": int(rank_delta.abs().max()),
                    "top_ranked_area": scored.sort_values("gap_rank").iloc[0]["area_name"],
                }
            )
    sensitivity = pd.DataFrame(sensitivity_rows)

    table_columns = [
        "area_name",
        "displayed_profile_vulnerability",
        "structural_vulnerability_score",
        "legacy_synthetic_access",
        "legacy_gap",
        "legacy_rank",
        "old_formula_real_service_access",
        "old_formula_real_service_gap",
        "service_accessibility_score",
        "gap_score",
        "gap_rank",
        "rank_change",
    ]
    display = comparison[table_columns].rename(
        columns={
            "area_name": "Area",
            "displayed_profile_vulnerability": "Legacy profile vuln",
            "structural_vulnerability_score": "STRUCT-01",
            "legacy_synthetic_access": "Legacy synthetic access",
            "legacy_gap": "GAP-PROD-01",
            "legacy_rank": "Legacy rank",
            "old_formula_real_service_access": "Old formula + real services access",
            "old_formula_real_service_gap": "Old formula + real services gap",
            "service_accessibility_score": "ACCESS-REAL-02",
            "gap_score": "GAP-CANON-02",
            "gap_rank": "Candidate rank",
            "rank_change": "Rank change",
        }
    )
    numeric_columns = display.select_dtypes(include="number").columns
    display[numeric_columns] = display[numeric_columns].round(2)

    content = f"""# Candidate Scoring Comparison — 2026-07-28

Status: **approved for controlled POC release; not yet published**

This report is generated locally. It does not update Supabase or Vercel.

## Decision

`ACCESS-REAL-02` and `GAP-CANON-02` were approved for the POC interface on
2026-07-28. Production remains `GAP-PROD-01`, which combines `STRUCT-01` with
`ACCESS-LEGACY-01`, until the controlled migration, refresh, validation, and
deployment finish.

## Twelve-Area Comparison

{markdown_table(display)}

`Rank change` is legacy rank minus candidate rank; a positive value means the
area moves upward under the candidate.

The “old formula + real services” columns demonstrate the saturation defect:
the count component was calibrated for 14 synthetic services and collapses most
real-service gaps toward zero.

## Sensitivity

{markdown_table(sensitivity)}

The candidate default is radius 2.5 km with 50% distance and 50% log-scaled
availability.

## Coverage And Bias Limitations

- Structural vulnerability is a borough-level StatCan 2021 index. Parc
  Extension and Saint-Michel therefore share `STRUCT-01`.
- Accessibility uses {len(services_master):,} directory rows, of which
  {len(real_planning_services):,} have usable coordinates.
- Straight-line distance is not travel time.
- Directory presence does not measure capacity, eligibility, language,
  operating hours, service quality, or whether a resident can obtain help.
- The nine-category crosswalk is a planning simplification; original service
  categories remain available for audit.
- Relative availability depends on the current 12-area comparison set and
  service snapshot.
- V1, experimental V2, `page_events`, and `flyer_downloads` do not contribute
  to `GAP-CANON-02`.

## Approval Record

- Decision: `approve`
- Owner: repository maintainer, recorded from the implementation-thread approval
- Date: 2026-07-28
- Rationale: resolve the mixed vulnerability contract and use the reviewed real
  service directory while retaining POC labels, documented limitations, and no
  policy classification.
- Approved formula IDs: `STRUCT-01`, `ACCESS-REAL-02`, `GAP-CANON-02`
- Follow-up: apply the additive migration, publish the three scoring tables
  atomically, validate owner/public contracts, grill the staged release, and
  record the production snapshot and deployment.
"""
    OUTPUT.write_text(content, encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
