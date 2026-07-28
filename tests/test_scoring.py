import unittest

from comm_need_radar.scoring.metrics import (
    K_ANON_FLOOR,
    OBSERVED_WEIGHT,
    STRUCTURAL_WEIGHT,
    V1_TOP_CATEGORY_WEIGHT,
    V1_VOLUME_WEIGHT,
    V2_OBSERVED_WEIGHTS,
    accessibility_score,
    composite_vulnerability_index,
    gap_score,
    has_sufficient_observed_data,
    haversine_km,
    observed_focus_need_score,
    priority_flag,
    relative_accessibility_score,
    v1_demand_score,
    v2_observed_need_score,
)


class ScoringTests(unittest.TestCase):
    def test_haversine_zero_distance(self):
        self.assertEqual(round(haversine_km(45.5, -73.6, 45.5, -73.6), 4), 0.0)

    def test_accessibility_score_is_bounded(self):
        self.assertGreaterEqual(accessibility_score(0.5, 3), 0)
        self.assertLessEqual(accessibility_score(0.5, 3), 100)
        self.assertEqual(accessibility_score(99, 0), 0)

    def test_gap_score_increases_when_access_is_low(self):
        self.assertGreater(gap_score(80, 20), gap_score(80, 80))

    def test_priority_flag(self):
        # CLASS-LEGACY-01 remains tested for historical reproducibility only.
        self.assertEqual(priority_flag(50), "High priority")
        self.assertEqual(priority_flag(30), "Watch")
        self.assertEqual(priority_flag(10), "Lower priority")

    def test_relative_accessibility_components_reconcile(self):
        score, distance, availability = relative_accessibility_score(
            1.25, 4, 16
        )
        self.assertEqual(distance, 50.0)
        self.assertAlmostEqual(score, round((distance + availability) / 2, 2))
        self.assertGreater(availability, 0)
        self.assertLessEqual(availability, 100)

    def test_relative_accessibility_rejects_invalid_contract(self):
        with self.assertRaises(ValueError):
            relative_accessibility_score(1, 6, 5)
        with self.assertRaises(ValueError):
            relative_accessibility_score(
                1,
                1,
                5,
                distance_weight=0.6,
                availability_weight=0.5,
            )


class KAnonFloorTests(unittest.TestCase):
    def test_exactly_at_floor_is_sufficient(self):
        self.assertTrue(has_sufficient_observed_data(K_ANON_FLOOR))

    def test_below_floor_is_insufficient(self):
        self.assertFalse(has_sufficient_observed_data(K_ANON_FLOOR - 1))

    def test_zero_is_insufficient(self):
        self.assertFalse(has_sufficient_observed_data(0))

    def test_above_floor_is_sufficient(self):
        self.assertTrue(has_sufficient_observed_data(K_ANON_FLOOR + 10))


class ObservedFocusScoreTests(unittest.TestCase):
    def test_score_is_average_of_three_components_without_indigenous(self):
        score, basis = observed_focus_need_score(60.0, 40.0, 50.0)
        expected = round((60.0 + 40.0 + 50.0) / 3, 2)
        self.assertEqual(score, expected)
        self.assertNotIn("indigenous", basis)

    def test_score_includes_indigenous_when_provided(self):
        score, basis = observed_focus_need_score(60.0, 40.0, 50.0, indigenous_need_score=80.0)
        expected = round((60.0 + 40.0 + 50.0 + 80.0) / 4, 2)
        self.assertEqual(score, expected)
        self.assertIn("indigenous", basis)

    def test_score_is_bounded_0_to_100(self):
        score, _ = observed_focus_need_score(100.0, 100.0, 100.0, indigenous_need_score=100.0)
        self.assertGreaterEqual(score, 0)
        self.assertLessEqual(score, 100)

    def test_none_indigenous_excluded_from_average(self):
        score_without, _ = observed_focus_need_score(60.0, 40.0, 50.0, indigenous_need_score=None)
        score_with, _ = observed_focus_need_score(60.0, 40.0, 50.0, indigenous_need_score=80.0)
        self.assertNotEqual(score_without, score_with)


class CompositeVulnerabilityIndexTests(unittest.TestCase):
    def test_structural_only_fallback_when_observed_is_none(self):
        score, basis = composite_vulnerability_index(70.0, None)
        self.assertEqual(score, 70.0)
        self.assertIn("structural_focus_only", basis)

    def test_composite_uses_correct_weights(self):
        score, basis = composite_vulnerability_index(80.0, 60.0)
        expected = round(STRUCTURAL_WEIGHT * 80.0 + OBSERVED_WEIGHT * 60.0, 2)
        self.assertEqual(score, expected)
        self.assertIn("structural_and_observed", basis)

    def test_composite_score_bounded_0_to_100(self):
        score, _ = composite_vulnerability_index(100.0, 100.0)
        self.assertGreaterEqual(score, 0)
        self.assertLessEqual(score, 100)

    def test_zero_observed_still_valid(self):
        score, _ = composite_vulnerability_index(50.0, 0.0)
        expected = round(STRUCTURAL_WEIGHT * 50.0 + OBSERVED_WEIGHT * 0.0, 2)
        self.assertEqual(score, expected)

    def test_custom_weights_respected(self):
        score, _ = composite_vulnerability_index(100.0, 0.0, structural_weight=1.0, observed_weight=0.0)
        self.assertEqual(score, 100.0)


class FrontlineDemandScoreTests(unittest.TestCase):
    def test_v1_uses_volume_and_top_category_weights(self):
        score = v1_demand_score(80.0, 40.0)
        expected = round(V1_VOLUME_WEIGHT * 80.0 + V1_TOP_CATEGORY_WEIGHT * 40.0, 2)
        self.assertEqual(score, expected)

    def test_v1_score_is_bounded(self):
        self.assertEqual(v1_demand_score(200.0, 200.0), 100.0)
        self.assertEqual(v1_demand_score(-10.0, -20.0), 0.0)


class V2ObservedScoreTests(unittest.TestCase):
    def test_component_weights_sum_to_one(self):
        self.assertAlmostEqual(sum(V2_OBSERVED_WEIGHTS.values()), 1.0)

    def test_v2_observed_uses_fixed_component_weights(self):
        score = v2_observed_need_score(80.0, 60.0, 50.0, 40.0, 20.0)
        expected = round(0.3 * 80.0 + 0.2 * 60.0 + 0.2 * 50.0 + 0.2 * 40.0 + 0.1 * 20.0, 2)
        self.assertEqual(score, expected)

    def test_recency_alone_has_limited_effect(self):
        self.assertEqual(v2_observed_need_score(0.0, 0.0, 0.0, 0.0, 100.0), 10.0)

    def test_effective_v2_weights_sum_to_one(self):
        effective_observed = sum(
            OBSERVED_WEIGHT * weight for weight in V2_OBSERVED_WEIGHTS.values()
        )
        self.assertAlmostEqual(STRUCTURAL_WEIGHT + effective_observed, 1.0)


if __name__ == "__main__":
    unittest.main()
