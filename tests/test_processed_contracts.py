import unittest
from pathlib import Path
import sys

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from comm_need_radar.config.paths import (
    ACCESSIBILITY_TABLE_PATH,
    AREA_PROFILE_PATH,
    GAP_SCORE_PATH,
    OBSERVED_NEED_CATEGORY_SUMMARY_PATH,
    OBSERVED_NEED_INDEX_PATH,
    PROCESSED_DIR,
    ROLE_ACTIVITY_LOG_PATH,
    SERVICE_TABLE_PATH,
    VULNERABILITY_INDEX_V2_PATH,
)


class ProcessedContractTests(unittest.TestCase):
    def test_processed_files_exist(self):
        for path in [AREA_PROFILE_PATH, SERVICE_TABLE_PATH, ACCESSIBILITY_TABLE_PATH, GAP_SCORE_PATH, ROLE_ACTIVITY_LOG_PATH]:
            self.assertTrue(path.exists(), f"Missing {path}")

    def test_gap_score_contract(self):
        gap = pd.read_csv(GAP_SCORE_PATH)
        required = {"area_id", "area_name", "vulnerability_score", "overall_accessibility_score", "gap_score", "gap_rank", "priority_flag"}
        self.assertTrue(required.issubset(gap.columns))
        self.assertEqual(gap["area_id"].nunique(), len(gap))
        self.assertTrue(gap["gap_score"].between(0, 100).all())
        self.assertEqual(gap["gap_rank"].nunique(), len(gap))

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
        a001 = scored.loc[scored["area_id"] == "A001"].iloc[0]
        self.assertEqual(a001["top_need_category"], "Settlement Navigation")
        self.assertEqual(a001["top_need_count"], 200)

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


if __name__ == "__main__":
    unittest.main()
