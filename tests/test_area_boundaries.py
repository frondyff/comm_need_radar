import csv
from copy import deepcopy
import gzip
import json
from pathlib import Path
import sys
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from comm_need_radar.geospatial.boundaries import (
    area_boundaries_from_feature_collection,
    area_feature_collection,
    build_area_boundaries_from_files,
    match_point,
)


AREA_PATH = PROJECT_ROOT / "data" / "processed" / "area_profile.csv"
BOROUGH_PATH = PROJECT_ROOT / "data" / "raw" / "boundaries" / "montreal_boroughs.geojson"
CENTER_PATH = PROJECT_ROOT / "data" / "raw" / "database_centers.csv"
CENTER_LOOKUP_PATH = PROJECT_ROOT / "data" / "processed" / "center_area_lookup.csv"
GEOJSON_PATH = PROJECT_ROOT / "frontend" / "public" / "geo" / "areas.geojson"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


class AreaBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.area_rows = read_csv(AREA_PATH)
        cls.boundaries = build_area_boundaries_from_files(AREA_PATH, BOROUGH_PATH)

    def test_boundaries_preserve_stable_area_ids(self) -> None:
        expected_ids = {row["area_id"] for row in self.area_rows}
        actual_ids = {boundary.area_id for boundary in self.boundaries}

        self.assertEqual(actual_ids, expected_ids)
        self.assertEqual(len(self.boundaries), 12)
        derived_ids = {
            boundary.area_id
            for boundary in self.boundaries
            if boundary.boundary_type == "centroid_partition_within_official_boundary"
        }
        self.assertEqual(derived_ids, {"A001", "A002"})

    def test_geometries_are_valid_nonoverlapping_and_contain_centroids(self) -> None:
        for boundary in self.boundaries:
            self.assertTrue(boundary.geometry.is_valid, boundary.area_id)
            self.assertFalse(boundary.geometry.is_empty, boundary.area_id)
            matches = match_point(
                boundary.centroid_longitude,
                boundary.centroid_latitude,
                self.boundaries,
            )
            self.assertEqual([match.area_id for match in matches], [boundary.area_id])

        for index, left in enumerate(self.boundaries):
            for right in self.boundaries[index + 1 :]:
                self.assertLessEqual(
                    left.geometry.intersection(right.geometry).area,
                    1e-12,
                    f"{left.area_id} overlaps {right.area_id}",
                )

    def test_center_lookup_reconciles_to_real_polygons(self) -> None:
        expected = {
            row["center_id"]: row["area_id"] for row in read_csv(CENTER_LOOKUP_PATH)
        }
        matched = unmatched = multiply_matched = mismatched = 0
        for row in read_csv(CENTER_PATH):
            matches = match_point(
                float(row["longitude"]),
                float(row["latitude"]),
                self.boundaries,
            )
            matched += len(matches) == 1
            unmatched += len(matches) == 0
            multiply_matched += len(matches) > 1
            actual = matches[0].area_id if len(matches) == 1 else ""
            mismatched += actual != expected[row["center_id"]]

        self.assertEqual(matched, 2537)
        self.assertEqual(unmatched, 1718)
        self.assertEqual(multiply_matched, 0)
        self.assertEqual(mismatched, 0)

    def test_committed_geojson_is_reproducible_and_within_budget(self) -> None:
        committed = json.loads(GEOJSON_PATH.read_text(encoding="utf-8"))
        self.assertEqual(committed, area_feature_collection(self.boundaries))
        committed_boundaries = area_boundaries_from_feature_collection(
            committed,
            self.area_rows,
        )
        self.assertTrue(all(boundary.geometry.is_valid for boundary in committed_boundaries))
        payload = GEOJSON_PATH.read_bytes()
        self.assertLessEqual(len(payload), 600_000)
        self.assertLessEqual(len(gzip.compress(payload, mtime=0)), 200_000)

    def test_committed_geojson_rejects_duplicate_area_ids(self) -> None:
        committed = json.loads(GEOJSON_PATH.read_text(encoding="utf-8"))
        invalid = deepcopy(committed)
        invalid["features"][1]["properties"]["area_id"] = "A001"

        with self.assertRaisesRegex(ValueError, "duplicate area_id: A001"):
            area_boundaries_from_feature_collection(invalid, self.area_rows)


if __name__ == "__main__":
    unittest.main()
