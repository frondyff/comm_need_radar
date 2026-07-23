import unittest

import pandas as pd

from scripts.data_pipeline.load_to_cloud import prepare_frame


class CloudLoaderTests(unittest.TestCase):
    def test_prepare_frame_normalizes_cisv_headers(self) -> None:
        frame = pd.DataFrame(
            [
                {
                    "Dissemination Area (DA)": "24580001",
                    "Province or territory": "Quebec",
                    "Dimension 1 Scores": -0.5,
                    "CISV Scores": -0.2,
                    "da_str": "24580001",
                }
            ]
        )

        prepared = prepare_frame("cisv_reference", frame)

        self.assertIn("dissemination_area", prepared.columns)
        self.assertIn("province_or_territory", prepared.columns)
        self.assertIn("dimension_1_score", prepared.columns)
        self.assertIn("cisv_score", prepared.columns)

    def test_prepare_frame_normalizes_true_values(self) -> None:
        for value in (1, "true", "YES"):
            with self.subTest(value=value):
                frame = pd.DataFrame([{"insufficient_visit_data": value}])
                prepared = prepare_frame("observed_need_index", frame)
                self.assertTrue(bool(prepared.loc[0, "insufficient_visit_data"]))

    def test_prepare_frame_normalizes_false_values(self) -> None:
        for value in (0, "false", "no"):
            with self.subTest(value=value):
                frame = pd.DataFrame([{"insufficient_visit_data": value}])
                prepared = prepare_frame("observed_need_index", frame)
                self.assertFalse(bool(prepared.loc[0, "insufficient_visit_data"]))

    def test_prepare_frame_rejects_unknown_boolean_values(self) -> None:
        frame = pd.DataFrame([{"insufficient_visit_data": "sometimes"}])

        with self.assertRaisesRegex(ValueError, "Cannot convert"):
            prepare_frame("observed_need_index", frame)


if __name__ == "__main__":
    unittest.main()
