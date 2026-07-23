import unittest
from datetime import date

from scripts.build_observed_need_index import aggregate_area


def visitor_tag(
    key_need: str,
    count: int,
    *,
    language_need: bool = False,
    settlement_need: bool = False,
) -> dict[str, str]:
    return {
        "key_need": key_need,
        "k_anon_count": str(count),
        "period_end": "2026-06-20",
        "population_group": "immigrant_newcomer" if settlement_need else "general",
        "language_need_flag": "1" if language_need else "0",
        "settlement_need_flag": "1" if settlement_need else "0",
        "indigenous_specific_need_flag": "0",
    }


class ObservedNeedBuilderTests(unittest.TestCase):
    def test_top_category_tie_is_alphabetical(self):
        tags = [visitor_tag("Food Support", 10), visitor_tag("Employment", 10)]

        result, categories = aggregate_area(tags, population=1000, today=date(2026, 7, 2))

        self.assertEqual(result["top_need_category"], "Employment")
        self.assertEqual([row["key_need"] for row in categories], ["Employment", "Food Support"])

    def test_focus_encounters_are_not_double_counted_across_flags(self):
        tags = [
            visitor_tag(
                "Settlement Navigation",
                10,
                language_need=True,
                settlement_need=True,
            ),
            visitor_tag("General Support", 10),
        ]

        result, _ = aggregate_area(tags, population=1000, today=date(2026, 7, 2))

        self.assertEqual(result["focus_category_share_score"], 50.0)


if __name__ == "__main__":
    unittest.main()
