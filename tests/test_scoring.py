import unittest

from comm_need_radar.scoring.metrics import accessibility_score, gap_score, haversine_km, priority_flag


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
        self.assertEqual(priority_flag(50), "High priority")
        self.assertEqual(priority_flag(30), "Watch")
        self.assertEqual(priority_flag(10), "Lower priority")


if __name__ == "__main__":
    unittest.main()
