import unittest

from scripts.validate_scoring_bias import calculate_metrics


class ScoringBiasValidationTests(unittest.TestCase):
    def test_privacy_floor_and_output_contracts(self):
        metrics = calculate_metrics()
        self.assertEqual(metrics["rows_below_privacy_floor"], 0)
        self.assertGreaterEqual(metrics["minimum_k_anon_count"], 5)
        self.assertEqual(metrics["areas_with_sufficient_observed_data"], 12)

    def test_bias_metrics_are_quantified(self):
        metrics = calculate_metrics()
        self.assertGreater(metrics["center_coverage_ratio_max_to_min"], 1)
        self.assertGreater(metrics["visit_volume_ratio_max_to_min"], 1)
        self.assertGreaterEqual(metrics["maximum_absolute_rank_shift"], 0)


if __name__ == "__main__":
    unittest.main()
