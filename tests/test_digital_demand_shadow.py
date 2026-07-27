import unittest
from datetime import date

import pandas as pd

from scripts.build_digital_demand_shadow import (
    QualityThresholds,
    build_area_demand,
    build_dataset_record,
    build_shadow_scores,
    prepare_eligible_events,
)


class DigitalDemandShadowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.structural = pd.DataFrame(
            [
                {"area_id": "A001", "vulnerability_index": 80.0},
                {"area_id": "A002", "vulnerability_index": 40.0},
            ]
        )
        self.period_start = date(2026, 7, 1)
        self.period_end = date(2026, 7, 31)

    def test_eligibility_excludes_legacy_test_unknown_and_duplicate_rows(self) -> None:
        base = {
            "created_at": "2026-07-20T12:00:00Z",
            "event_version": 2,
            "anonymous_session_id": "session-1",
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
                dict(base),
                {**base, "event_version": 1, "anonymous_session_id": "legacy"},
                {**base, "is_test": True, "anonymous_session_id": "test"},
                {**base, "selected_area_id": "A999", "anonymous_session_id": "unknown"},
                {**base, "event_type": "page_view", "anonymous_session_id": "view"},
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
        self.assertEqual(report["excluded_unsupported_event"], 1)

    def test_reviewable_events_influence_only_the_shadow_composite(self) -> None:
        page_events = pd.DataFrame(
            [
                {
                    "created_at": "2026-07-20T12:00:00Z",
                    "event_version": 2,
                    "anonymous_session_id": "session-a",
                    "selected_area_id": "A001",
                    "service_id": "svc-1",
                    "service_area_id": "A001",
                    "category": "Food",
                    "is_test": False,
                    "event_type": "service_impression",
                },
                {
                    "created_at": "2026-07-20T12:01:00Z",
                    "event_version": 2,
                    "anonymous_session_id": "session-a",
                    "selected_area_id": "A001",
                    "service_id": "svc-1",
                    "service_area_id": "A001",
                    "category": "Food",
                    "is_test": False,
                    "event_type": "service_card_opened",
                },
                {
                    "created_at": "2026-07-20T12:00:00Z",
                    "event_version": 2,
                    "anonymous_session_id": "session-b",
                    "selected_area_id": "A002",
                    "service_id": "svc-2",
                    "service_area_id": "A002",
                    "category": "Legal",
                    "is_test": False,
                    "event_type": "service_impression",
                },
            ]
        )
        flyer_downloads = pd.DataFrame(
            [
                {
                    "created_at": "2026-07-20T12:02:00Z",
                    "event_version": 2,
                    "anonymous_session_id": "session-a",
                    "selected_area_id": "A001",
                    "service_id": "svc-1",
                    "service_area_id": "A001",
                    "service_category": "Food",
                    "is_test": False,
                }
            ]
        )
        eligible, _ = prepare_eligible_events(
            page_events,
            flyer_downloads,
            {"A001", "A002"},
            self.period_start,
            self.period_end,
        )
        demand = build_area_demand(
            eligible,
            self.structural,
            "00000000-0000-0000-0000-000000000001",
            QualityThresholds(1, 1, 1),
        )
        shadow = build_shadow_scores(demand, self.structural, digital_weight=0.15)

        area_one = shadow.set_index("area_id").loc["A001"]
        area_two = shadow.set_index("area_id").loc["A002"]
        self.assertEqual(area_one["digital_demand_score"], 100.0)
        self.assertEqual(area_one["priority_score_v2_shadow"], 83.0)
        self.assertEqual(area_one["digital_weight"], 0.15)
        self.assertEqual(area_two["digital_demand_score"], 0.0)
        self.assertEqual(area_two["priority_score_v2_shadow"], 34.0)
        self.assertEqual(area_two["digital_weight"], 0.15)
        self.assertEqual(
            self.structural.set_index("area_id").loc["A001", "vulnerability_index"],
            80.0,
        )

    def test_insufficient_coverage_falls_back_to_structural_only(self) -> None:
        demand = build_area_demand(
            pd.DataFrame(
                columns=[
                    "area_id",
                    "anonymous_session_id",
                    "event_day",
                    "event_type",
                    "event_weight",
                ]
            ),
            self.structural,
            "00000000-0000-0000-0000-000000000002",
            QualityThresholds(),
        )
        shadow = build_shadow_scores(demand, self.structural, digital_weight=0.15)

        self.assertTrue((shadow["digital_weight"] == 0).all())
        self.assertEqual(
            shadow.set_index("area_id")["priority_score_v2_shadow"].to_dict(),
            {"A001": 80.0, "A002": 40.0},
        )
        self.assertTrue(
            shadow["score_data_basis"]
            .eq("structural_only_insufficient_web_behavior")
            .all()
        )

    def test_low_coverage_area_cannot_change_reviewable_normalization(self) -> None:
        events = pd.DataFrame(
            [
                {
                    "area_id": "A001",
                    "anonymous_session_id": "session-a",
                    "event_day": "2026-07-20",
                    "event_type": "service_impression",
                    "event_weight": 0.0,
                },
                {
                    "area_id": "A001",
                    "anonymous_session_id": "session-a",
                    "event_day": "2026-07-20",
                    "event_type": "service_card_opened",
                    "event_weight": 1.0,
                },
            ]
        )
        demand = build_area_demand(
            events,
            self.structural,
            "00000000-0000-0000-0000-000000000004",
            QualityThresholds(),
        )
        area_one = demand.set_index("area_id").loc["A001"]

        self.assertEqual(area_one["coverage_status"], "experimental")
        self.assertTrue(pd.isna(area_one["digital_demand_score"]))
        shadow = build_shadow_scores(demand, self.structural, digital_weight=0.15)
        self.assertEqual(
            shadow.set_index("area_id").loc["A001", "digital_weight"],
            0.0,
        )

    def test_dataset_quality_is_not_reviewable_until_every_area_passes(self) -> None:
        demand = pd.DataFrame(
            [
                {"coverage_status": "reviewable"},
                {"coverage_status": "experimental"},
            ]
        )
        report = {
            "input_page_events": 4,
            "input_flyer_downloads": 1,
            "eligible_events": 3,
        }
        dataset = build_dataset_record(
            "00000000-0000-0000-0000-000000000003",
            "pilot",
            self.period_start,
            self.period_end,
            31,
            QualityThresholds(),
            report,
            demand,
        )

        self.assertEqual(dataset["quality_status"], "experimental")
        self.assertEqual(dataset["excluded_event_count"], 2)
        self.assertEqual(dataset["publication_state"], "private_pilot")


if __name__ == "__main__":
    unittest.main()
