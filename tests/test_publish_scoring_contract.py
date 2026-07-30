from copy import deepcopy
import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "publish_scoring_contract",
    ROOT / "scripts" / "publish_scoring_contract.py",
)
assert SPEC and SPEC.loader
publisher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publisher)


class PublishScoringContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.areas = publisher.read_rows(publisher.AREA_PATH)
        cls.accessibility = publisher.read_rows(publisher.ACCESSIBILITY_PATH)
        cls.gaps = publisher.read_rows(publisher.GAP_PATH)

    def test_committed_payload_is_publishable(self) -> None:
        snapshot_id = publisher.validate(
            self.areas,
            self.accessibility,
            self.gaps,
        )
        self.assertEqual(
            snapshot_id,
            "97c29b249d986c4ffa5de6fe21400dc99dd5121f6026bda0a779116869806c1b",
        )

    def test_mixed_structural_alias_is_rejected(self) -> None:
        invalid = deepcopy(self.areas)
        invalid[0]["vulnerability_score"] = 0.0
        with self.assertRaisesRegex(ValueError, "STRUCT-01"):
            publisher.validate(invalid, self.accessibility, self.gaps)

    def test_legacy_gap_formula_is_rejected(self) -> None:
        invalid = deepcopy(self.gaps)
        invalid[0]["gap_formula_id"] = "GAP-PROD-01"
        with self.assertRaisesRegex(ValueError, "GAP-CANON-02"):
            publisher.validate(self.areas, self.accessibility, invalid)

    def test_sixth_candidate_label_is_rejected(self) -> None:
        invalid = deepcopy(self.gaps)
        sixth = next(row for row in invalid if row["gap_rank"] == 6)
        sixth["priority_band"] = "high_candidate"
        sixth["priority_flag"] = "High-priority candidate (POC)"
        with self.assertRaisesRegex(ValueError, "GAP-CANON-02"):
            publisher.validate(self.areas, self.accessibility, invalid)

    def test_atomic_replacement_is_compatible_with_safe_updates(self) -> None:
        migration = (
            ROOT
            / "supabase"
            / "migrations"
            / "202607280002_top5_priority_candidates.sql"
        ).read_text(encoding="utf-8")
        self.assertIn("public.publish_scoring_contract_02(", migration)
        self.assertIn("update public.accessibility", migration)
        self.assertIn("update public.gap_score live", migration)


if __name__ == "__main__":
    unittest.main()
