import unittest
from pathlib import Path
import sys

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from comm_need_radar.config.paths import (
    ACCESSIBILITY_TABLE_PATH,
    AREA_PROFILE_PATH,
    AREA_VULNERABILITY_INDEX_REAL_PATH,
    GAP_SCORE_PATH,
    OBSERVED_NEED_CATEGORY_SUMMARY_PATH,
    OBSERVED_NEED_INDEX_PATH,
    PROCESSED_DIR,
    ROLE_ACTIVITY_LOG_PATH,
    SCORING_FORMULA_MANIFEST_PATH,
    SERVICES_MASTER_PATH,
    SERVICE_TABLE_PATH,
    VULNERABILITY_INDEX_V2_PATH,
)


class ProcessedContractTests(unittest.TestCase):
    def test_processed_files_exist(self):
        for path in [AREA_PROFILE_PATH, SERVICE_TABLE_PATH, ACCESSIBILITY_TABLE_PATH, GAP_SCORE_PATH, ROLE_ACTIVITY_LOG_PATH]:
            self.assertTrue(path.exists(), f"Missing {path}")

    def test_gap_score_contract(self):
        profile = pd.read_csv(AREA_PROFILE_PATH)
        gap = pd.read_csv(GAP_SCORE_PATH)
        real = pd.read_csv(AREA_VULNERABILITY_INDEX_REAL_PATH)
        required = {
            "area_id",
            "area_name",
            "structural_vulnerability_score",
            "vulnerability_score",
            "service_accessibility_score",
            "overall_accessibility_score",
            "gap_score",
            "gap_rank",
            "priority_band",
            "priority_flag",
            "classification_formula_id",
            "classification_status",
            "priority_cutoff_rank",
            "comparison_set_size",
            "structural_formula_id",
            "accessibility_formula_id",
            "gap_formula_id",
            "formula_set_version",
        }
        self.assertTrue(required.issubset(gap.columns))
        self.assertEqual(gap["area_id"].nunique(), len(gap))
        self.assertTrue(gap["gap_score"].between(0, 100).all())
        self.assertEqual(gap["gap_rank"].nunique(), len(gap))
        candidates = gap[gap["gap_rank"] <= 5]
        remaining = gap[gap["gap_rank"] > 5]
        self.assertEqual(len(candidates), 5)
        self.assertEqual(set(candidates["priority_band"]), {"high_candidate"})
        self.assertEqual(
            set(candidates["priority_flag"]),
            {"High-priority candidate (POC)"},
        )
        self.assertTrue(remaining["priority_band"].isna().all())
        self.assertTrue(remaining["priority_flag"].isna().all())
        self.assertEqual(
            set(gap["classification_formula_id"]),
            {"CLASS-TOP5-02"},
        )
        self.assertEqual(
            set(gap["classification_status"]),
            {"poc_relative_candidate"},
        )
        self.assertEqual(set(gap["priority_cutoff_rank"]), {5})
        self.assertEqual(set(gap["comparison_set_size"]), {12})
        self.assertEqual(set(gap["structural_formula_id"]), {"STRUCT-01"})
        self.assertEqual(set(gap["accessibility_formula_id"]), {"ACCESS-REAL-02"})
        self.assertEqual(set(gap["gap_formula_id"]), {"GAP-CANON-02"})
        self.assertEqual(set(gap["formula_set_version"]), {"scoring-contract-03"})
        self.assertTrue(
            (
                profile["structural_vulnerability_rank"]
                == profile["vulnerability_rank"]
            ).all()
        )

        joined = (
            gap.merge(
                profile[
                    [
                        "area_id",
                        "structural_vulnerability_score",
                        "vulnerability_score",
                    ]
                ],
                on="area_id",
                suffixes=("_gap", "_profile"),
                validate="one_to_one",
            )
            .merge(
                real[["area_id", "vulnerability_index"]],
                on="area_id",
                validate="one_to_one",
            )
        )
        for column in [
            "structural_vulnerability_score_gap",
            "vulnerability_score_gap",
            "structural_vulnerability_score_profile",
            "vulnerability_score_profile",
        ]:
            self.assertTrue(
                (joined[column] - joined["vulnerability_index"]).abs().le(0.01).all(),
                column,
            )
        expected_gap = (
            joined["structural_vulnerability_score_gap"]
            * (100 - joined["service_accessibility_score"])
            / 100
        )
        self.assertTrue((joined["gap_score"] - expected_gap).abs().le(0.011).all())

        # Contract 03 changes interpretation only. These contract-02
        # GAP-CANON-02 values and ranks must not move when CLASS-TOP5-02 is
        # rebuilt.
        expected_score_rank = {
            "A002": (26.29, 1),
            "A004": (22.14, 2),
            "A008": (20.11, 3),
            "A006": (18.08, 4),
            "A009": (14.08, 5),
            "A007": (13.77, 6),
            "A005": (11.38, 7),
            "A003": (10.34, 8),
            "A001": (8.85, 9),
            "A011": (8.62, 10),
            "A012": (6.71, 11),
            "A010": (3.75, 12),
        }
        indexed_gap = gap.set_index("area_id")
        for area_id, (score, rank) in expected_score_rank.items():
            self.assertAlmostEqual(indexed_gap.loc[area_id, "gap_score"], score, 2)
            self.assertEqual(indexed_gap.loc[area_id, "gap_rank"], rank)

    def test_real_service_accessibility_contract(self):
        accessibility = pd.read_csv(ACCESSIBILITY_TABLE_PATH)
        services = pd.read_csv(SERVICES_MASTER_PATH)
        self.assertEqual(len(accessibility), 108)
        self.assertEqual(accessibility["area_id"].nunique(), 12)
        self.assertTrue(
            (accessibility.groupby("area_id")["service_category"].nunique() == 9).all()
        )
        self.assertEqual(set(accessibility["accessibility_formula_id"]), {"ACCESS-REAL-02"})
        self.assertEqual(set(accessibility["taxonomy_version"]), {"planning-needs-9-v1"})
        self.assertEqual(set(accessibility["service_snapshot_total_rows"]), {3664})
        self.assertEqual(set(accessibility["service_snapshot_mappable_rows"]), {3200})
        self.assertEqual(len(services), 3664)
        self.assertTrue(accessibility["distance_component"].between(0, 100).all())
        self.assertTrue(accessibility["availability_component"].between(0, 100).all())
        expected_access = (
            0.5 * accessibility["distance_component"]
            + 0.5 * accessibility["availability_component"]
        ).round(2)
        self.assertTrue(
            (accessibility["accessibility_score"] - expected_access)
            .abs()
            .le(0.011)
            .all()
        )
        overall = accessibility.groupby("area_id")["accessibility_score"].mean()
        self.assertGreaterEqual(overall.round(2).nunique(), 6)
        self.assertFalse((overall >= 95).all())

    def test_structural_regression_examples(self):
        profile = pd.read_csv(AREA_PROFILE_PATH).set_index("area_id")
        expected = {
            "A001": 62.87,
            "A003": 64.39,
            "A005": 30.24,
            "A009": 52.06,
        }
        for area_id, score in expected.items():
            self.assertAlmostEqual(
                profile.loc[area_id, "structural_vulnerability_score"],
                score,
                places=2,
            )
        self.assertEqual(
            set(profile["population_basis"]),
            {"synthetic_demo_not_for_scoring"},
        )

    def test_formula_manifest_records_official_production_release(self):
        import json

        manifest = json.loads(SCORING_FORMULA_MANIFEST_PATH.read_text(encoding="utf-8"))
        self.assertEqual(
            manifest["document_status"],
            "approved_release_candidate",
        )
        self.assertEqual(manifest["production_formula_set"], "GAP-CANON-02")
        self.assertEqual(
            manifest["previous_production_formula_set"],
            "GAP-PROD-01",
        )
        self.assertEqual(
            manifest["formulas"]["ACCESS-REAL-02"]["status"],
            "production",
        )
        self.assertEqual(
            manifest["formulas"]["GAP-CANON-02"]["status"],
            "production",
        )
        self.assertEqual(
            manifest["production_classification_formula"],
            "CLASS-TOP5-02",
        )
        self.assertEqual(
            manifest["formulas"]["CLASS-TOP5-02"]["status"],
            "production_poc",
        )
        self.assertEqual(
            manifest["formulas"]["GAP-PROD-01"]["status"],
            "historical",
        )
        self.assertEqual(len(manifest["service_category_crosswalk"]), 20)

    def test_role_activity_has_all_roles(self):
        log = pd.read_csv(ROLE_ACTIVITY_LOG_PATH)
        owners = set(log["owner"])
        self.assertTrue({"Chloe", "Laura", "Frondy", "Jessie", "Mariam"}.issubset(owners))

    def test_census_focus_contract(self):
        required = {
            "immigrant_census_concern_score",
            "indigenous_census_concern_score",
            "mvp_focus_census_index",
            "mvp_focus_data_basis",
            "mvp_focus_top_concern",
        }
        for name in [
            "census_vulnerability_index.csv",
            "statcan_census_vulnerability_index.csv",
            "area_vulnerability_index_real.csv",
        ]:
            table = pd.read_csv(PROCESSED_DIR / name)
            self.assertTrue(required.issubset(table.columns), name)
            self.assertTrue(table["immigrant_census_concern_score"].between(0, 100).all(), name)
            self.assertTrue(table["mvp_focus_census_index"].between(0, 100).all(), name)
        area_focus = pd.read_csv(PROCESSED_DIR / "area_vulnerability_index_real.csv")
        self.assertEqual(area_focus["area_id"].nunique(), 12)

    def test_frontline_v1_demand_contract(self):
        observed = pd.read_csv(OBSERVED_NEED_INDEX_PATH)
        required = {
            "rolling_visit_count",
            "top_need_category",
            "top_need_count",
            "top_need_share_pct",
            "top_category_pressure_score",
            "v1_demand_score",
            "data_through_date",
        }
        self.assertTrue(required.issubset(observed.columns))
        scored = observed[~observed["insufficient_visit_data"]]
        self.assertTrue(scored["v1_demand_score"].between(0, 100).all())
        self.assertTrue(
            scored["observed_data_basis"]
            .str.startswith("synthetic_demonstration_")
            .all()
        )
        # Generalised from a fixture-specific snapshot (previously hard-coded to the
        # 29-row demonstration data) so the contract holds on any visitor dataset:
        # each scored area's reported top need must be the actual maximum-count
        # category for that area in the category summary.
        categories = pd.read_csv(OBSERVED_NEED_CATEGORY_SUMMARY_PATH)
        for _, area in scored.iterrows():
            cats = categories[categories["area_id"] == area["area_id"]]
            self.assertFalse(cats.empty)
            top = cats.loc[cats["encounter_count"].idxmax()]
            self.assertEqual(area["top_need_category"], top["key_need"])
            self.assertEqual(area["top_need_count"], top["encounter_count"])

    def test_category_summary_reconciles_to_area_totals(self):
        observed = pd.read_csv(OBSERVED_NEED_INDEX_PATH)
        categories = pd.read_csv(OBSERVED_NEED_CATEGORY_SUMMARY_PATH)
        category_totals = categories.groupby("area_id")["encounter_count"].sum()
        sufficient = observed[~observed["insufficient_visit_data"]].set_index("area_id")
        self.assertEqual(category_totals.to_dict(), sufficient["rolling_visit_count"].to_dict())
        share_totals = categories.groupby("area_id")["encounter_share_pct"].sum()
        self.assertTrue(((share_totals - 100).abs() <= 0.05).all())

    def test_v2_exposes_v1_contributing_indicators(self):
        v2 = pd.read_csv(VULNERABILITY_INDEX_V2_PATH)
        required = {
            "v1_demand_score",
            "visit_volume_score",
            "top_category_pressure_score",
            "focus_category_share_score",
            "severity_breadth_score",
            "recency_score",
            "v2_observed_score",
        }
        self.assertTrue(required.issubset(v2.columns))
        observed_rows = v2[~v2["insufficient_visit_data"]]
        self.assertTrue(observed_rows["v2_observed_score"].between(0, 100).all())
        self.assertTrue(
            observed_rows["v2_data_basis"]
            .str.endswith("_synthetic_demonstration")
            .all()
        )


if __name__ == "__main__":
    unittest.main()
