import unittest
from datetime import date

import pandas as pd

from scripts.build_web_observed_demand import (
    QualityThresholds,
    build_area_demand,
    build_category_summary,
    build_observed_need_index,
    build_visitor_tags,
    build_vulnerability_v2,
    prepare_eligible_events,
)


class WebObservedDemandTests(unittest.TestCase):
    def setUp(self) -> None:
        self.structural = pd.DataFrame(
            [
                {
                    "area_id": "A001",
                    "area_name": "Area One",
                    "borough_name": "Borough",
                    "vulnerability_index": 70.0,
                    "mvp_focus_census_index": 80.0,
                    "mvp_focus_top_concern": "Newcomer support",
                },
                {
                    "area_id": "A002",
                    "area_name": "Area Two",
                    "borough_name": "Borough",
                    "vulnerability_index": 45.0,
                    "mvp_focus_census_index": 40.0,
                    "mvp_focus_top_concern": "Language access",
                },
            ]
        )
        self.period_start = date(2026, 7, 1)
        self.period_end = date(2026, 7, 31)

    def test_filters_legacy_test_unknown_and_duplicate_events(self) -> None:
        base = {
            "created_at": "2026-07-20T12:00:00Z",
            "event_version": 2,
            "anonymous_session_id": "session-a",
            "selected_area_id": "A001",
            "service_id": "svc-1",
            "service_area_id": "A001",
            "category": "Food",
            "is_test": False,
            "event_type": "service_card_opened",
        }
        page_events = pd.DataFrame(
            [
                base,
                base,
                {**base, "event_version": 1},
                {**base, "is_test": True},
                {**base, "selected_area_id": "UNKNOWN"},
            ]
        )
        eligible, report = prepare_eligible_events(
            page_events,
            pd.DataFrame(),
            {"A001", "A002"},
            self.period_start,
            self.period_end,
        )
        self.assertEqual(len(eligible), 1)
        self.assertEqual(report["deduplicated_rows"], 1)
        self.assertEqual(report["excluded_legacy_or_unversioned"], 1)
        self.assertEqual(report["excluded_test_rows"], 1)
        self.assertEqual(report["excluded_missing_or_unknown_area"], 1)

    def _reviewable_events(self) -> pd.DataFrame:
        rows = []
        for area_id, category, intent_count in [
            ("A001", "Food", 2),
            ("A002", "Legal", 1),
        ]:
            for session_number in range(5):
                session = f"{area_id}-{session_number}"
                rows.append(
                    {
                        "area_id": area_id,
                        "anonymous_session_id": session,
                        "event_day": f"2026-07-{session_number + 1:02d}",
                        "event_type": "service_impression",
                        "event_weight": 0.0,
                        "category": category,
                    }
                )
                for event_number in range(intent_count):
                    rows.append(
                        {
                            "area_id": area_id,
                            "anonymous_session_id": session,
                            "event_day": f"2026-07-{session_number + 1:02d}",
                            "event_type": "service_card_opened",
                            "event_weight": 1.0,
                            "category": category,
                            "event_number": event_number,
                        }
                    )
        return pd.DataFrame(rows)

    def test_original_sixty_forty_formula_uses_digital_as_observed(self) -> None:
        events = self._reviewable_events()
        demand = build_area_demand(
            events,
            self.structural,
            "00000000-0000-0000-0000-000000000001",
            QualityThresholds(5, 5, 5),
        )
        categories = build_category_summary(events)
        observed = build_observed_need_index(
            demand, categories, 31, self.period_end
        )
        v2 = build_vulnerability_v2(observed, self.structural).set_index("area_id")

        self.assertEqual(v2.loc["A001", "v2_observed_score"], 100.0)
        self.assertEqual(v2.loc["A001", "vulnerability_index_v2"], 88.0)
        self.assertEqual(v2.loc["A001", "structural_weight"], 0.6)
        self.assertEqual(v2.loc["A001", "observed_weight"], 0.4)
        self.assertEqual(v2.loc["A002", "v2_observed_score"], 0.0)
        self.assertEqual(v2.loc["A002", "vulnerability_index_v2"], 24.0)

    def test_incomplete_area_coverage_forces_structural_only(self) -> None:
        events = self._reviewable_events()
        events = events[events["area_id"] == "A001"]
        demand = build_area_demand(
            events,
            self.structural,
            "00000000-0000-0000-0000-000000000002",
            QualityThresholds(5, 5, 5),
        )
        observed = build_observed_need_index(
            demand, build_category_summary(events), 31, self.period_end
        )
        v2 = build_vulnerability_v2(observed, self.structural).set_index("area_id")

        self.assertTrue(observed["v2_observed_score"].isna().all())
        self.assertEqual(v2.loc["A001", "vulnerability_index_v2"], 80.0)
        self.assertEqual(v2.loc["A002", "vulnerability_index_v2"], 40.0)
        self.assertTrue((v2["observed_weight"] == 0).all())

    def test_partial_observed_scores_are_rejected(self) -> None:
        observed = pd.DataFrame(
            [
                {
                    "area_id": "A001",
                    "v2_observed_score": 50.0,
                    "top_need_category": "Food",
                },
                {
                    "area_id": "A002",
                    "v2_observed_score": None,
                    "top_need_category": None,
                },
            ]
        )
        with self.assertRaisesRegex(ValueError, "cover every area"):
            build_vulnerability_v2(observed, self.structural)

    def test_visitor_tags_store_aggregates_not_session_ids(self) -> None:
        events = self._reviewable_events()
        demand = build_area_demand(
            events,
            self.structural,
            "00000000-0000-0000-0000-000000000003",
            QualityThresholds(5, 5, 5),
        )
        tags = build_visitor_tags(
            demand,
            build_category_summary(events),
            self.period_start,
            self.period_end,
        )

        self.assertEqual(len(tags), 2)
        self.assertNotIn("anonymous_session_id", tags.columns)
        self.assertTrue((tags["k_anon_count"] >= 5).all())
        self.assertTrue((tags["source_type"] == "web_behavior").all())
        self.assertEqual(
            set(tags["digital_demand_score"].astype(float)), {0.0, 100.0}
        )

    def test_category_summary_suppresses_groups_below_k(self) -> None:
        events = self._reviewable_events()
        small = pd.DataFrame(
            [
                {
                    "area_id": "A001",
                    "anonymous_session_id": "small-session",
                    "event_day": "2026-07-01",
                    "event_type": "service_card_opened",
                    "event_weight": 1.0,
                    "category": "Suppressed need",
                }
            ]
        )
        categories = build_category_summary(pd.concat([events, small]))
        self.assertNotIn("Suppressed need", set(categories["key_need"]))


if __name__ == "__main__":
    unittest.main()
