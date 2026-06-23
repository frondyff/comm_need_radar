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
    PROCESSED_DIR,
    ROLE_ACTIVITY_LOG_PATH,
    SERVICE_TABLE_PATH,
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


if __name__ == "__main__":
    unittest.main()
