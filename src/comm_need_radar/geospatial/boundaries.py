"""Build stable MVP area polygons from approved Montreal boundaries."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import csv
import json
import math
from pathlib import Path
from typing import Any, Iterable

from shapely.geometry import MultiPoint, Point, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform, voronoi_diagram


BOROUGH_NAME_MAP = {
    "Villeray-Saint-Michel-Parc-Extension": "Villeray-Saint-Michel-Parc-Extension",
    "Côte-des-Neiges-Notre-Dame-de-Grâce": "Cote-des-Neiges-Notre-Dame-de-Grace",
    "Montréal-Nord": "Montreal-Nord",
    "Mercier-Hochelaga-Maisonneuve": "Mercier-Hochelaga-Maisonneuve",
    "Verdun": "Verdun",
    "Ahuntsic-Cartierville": "Ahuntsic-Cartierville",
    "Lachine": "Lachine",
    "Westmount": "Westmount",
    "Le Plateau-Mont-Royal": "Le Plateau-Mont-Royal",
    "Le Sud-Ouest": "Le Sud-Ouest",
    "Rivière-des-Prairies-Pointe-aux-Trembles": (
        "Riviere-des-Prairies-Pointe-aux-Trembles"
    ),
}

SOURCE_URL = (
    "https://donnees.montreal.ca/fr/dataset/"
    "9797a946-9da8-41ec-8815-f6b276dec7e9"
)
SOURCE_LICENSE = "CC BY 4.0"
SOURCE_DOWNLOADED_DATE = "2026-06-23"


@dataclass(frozen=True)
class AreaBoundary:
    area_id: str
    area_name: str
    borough_name: str
    centroid_latitude: float
    centroid_longitude: float
    boundary_type: str
    geometry: BaseGeometry


def load_area_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def load_official_boroughs(path: Path) -> dict[str, BaseGeometry]:
    source = json.loads(path.read_text(encoding="utf-8"))
    boroughs: dict[str, BaseGeometry] = {}
    for feature in source["features"]:
        official_name = feature["properties"]["NOM"]
        project_name = BOROUGH_NAME_MAP.get(official_name)
        if project_name is None:
            continue
        geometry = shape(feature["geometry"])
        if not geometry.is_valid:
            geometry = geometry.buffer(0)
        if geometry.is_empty:
            raise ValueError(f"Official boundary is empty: {official_name}")
        boroughs[project_name] = geometry
    return boroughs


def _local_projection(reference_latitude: float):
    longitude_scale = math.cos(math.radians(reference_latitude))

    def project(x: float, y: float, z: float | None = None):
        return (x * longitude_scale, y)

    def unproject(x: float, y: float, z: float | None = None):
        return (x / longitude_scale, y)

    return project, unproject


def _partition_borough(
    borough: BaseGeometry,
    area_rows: list[dict[str, str]],
) -> dict[str, BaseGeometry]:
    reference_latitude = sum(float(row["latitude"]) for row in area_rows) / len(area_rows)
    project, unproject = _local_projection(reference_latitude)
    projected_borough = transform(project, borough)
    projected_points = [
        transform(project, Point(float(row["longitude"]), float(row["latitude"])))
        for row in area_rows
    ]
    cells = voronoi_diagram(
        MultiPoint(projected_points),
        envelope=projected_borough.envelope.buffer(0.1),
    )

    partitions: dict[str, BaseGeometry] = {}
    for row, point in zip(area_rows, projected_points, strict=True):
        candidates = [cell for cell in cells.geoms if cell.covers(point)]
        if len(candidates) != 1:
            raise ValueError(
                f"Expected one Voronoi cell for {row['area_id']}, found {len(candidates)}"
            )
        geometry = transform(unproject, projected_borough.intersection(candidates[0]))
        if geometry.is_empty or not geometry.is_valid:
            raise ValueError(f"Invalid derived boundary for {row['area_id']}")
        partitions[row["area_id"]] = geometry
    return partitions


def build_area_boundaries(
    area_rows: list[dict[str, str]],
    boroughs: dict[str, BaseGeometry],
) -> list[AreaBoundary]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in area_rows:
        grouped[row["borough_name"]].append(row)

    boundaries: list[AreaBoundary] = []
    for borough_name, rows in grouped.items():
        official_geometry = boroughs.get(borough_name)
        if official_geometry is None:
            raise ValueError(f"Missing official boundary for {borough_name}")

        if len(rows) == 1:
            geometries = {rows[0]["area_id"]: official_geometry}
            boundary_type = "official_administrative_boundary"
        else:
            geometries = _partition_borough(official_geometry, rows)
            boundary_type = "centroid_partition_within_official_boundary"

        for row in rows:
            boundaries.append(
                AreaBoundary(
                    area_id=row["area_id"],
                    area_name=row["area_name"],
                    borough_name=borough_name,
                    centroid_latitude=float(row["latitude"]),
                    centroid_longitude=float(row["longitude"]),
                    boundary_type=boundary_type,
                    geometry=geometries[row["area_id"]],
                )
            )
    return sorted(boundaries, key=lambda boundary: boundary.area_id)


def build_area_boundaries_from_files(
    area_path: Path,
    borough_path: Path,
) -> list[AreaBoundary]:
    return build_area_boundaries(
        load_area_rows(area_path),
        load_official_boroughs(borough_path),
    )


def area_boundaries_from_feature_collection(
    collection: dict[str, Any],
    area_rows: list[dict[str, str]],
) -> list[AreaBoundary]:
    areas_by_id = {row["area_id"]: row for row in area_rows}
    boundaries = []
    seen_ids: set[str] = set()
    for feature in collection["features"]:
        properties = feature["properties"]
        area_id = properties["area_id"]
        if area_id in seen_ids:
            raise ValueError(f"GeoJSON contains duplicate area_id: {area_id}")
        seen_ids.add(area_id)
        row = areas_by_id.get(area_id)
        if row is None:
            raise ValueError(f"GeoJSON contains unknown area_id: {area_id}")
        boundaries.append(
            AreaBoundary(
                area_id=area_id,
                area_name=properties["area_name"],
                borough_name=properties["borough_name"],
                centroid_latitude=float(row["latitude"]),
                centroid_longitude=float(row["longitude"]),
                boundary_type=properties["boundary_type"],
                geometry=shape(feature["geometry"]),
            )
        )
    expected_ids = set(areas_by_id)
    if seen_ids != expected_ids:
        missing_ids = sorted(expected_ids - seen_ids)
        raise ValueError(
            "GeoJSON area IDs do not match the area profile; "
            f"missing: {', '.join(missing_ids) or 'none'}"
        )
    return sorted(boundaries, key=lambda boundary: boundary.area_id)


def match_point(
    longitude: float,
    latitude: float,
    boundaries: Iterable[AreaBoundary],
) -> list[AreaBoundary]:
    point = Point(longitude, latitude)
    interior = [boundary for boundary in boundaries if boundary.geometry.contains(point)]
    if interior:
        return interior
    return [boundary for boundary in boundaries if boundary.geometry.covers(point)]


def _round_coordinates(value: Any) -> Any:
    if isinstance(value, (list, tuple)):
        return [_round_coordinates(item) for item in value]
    if isinstance(value, float):
        return round(value, 6)
    return value


def area_feature_collection(boundaries: Iterable[AreaBoundary]) -> dict[str, Any]:
    features = []
    for boundary in boundaries:
        geometry = mapping(boundary.geometry)
        geometry["coordinates"] = _round_coordinates(geometry["coordinates"])
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "area_id": boundary.area_id,
                    "area_name": boundary.area_name,
                    "borough_name": boundary.borough_name,
                    "boundary_type": boundary.boundary_type,
                    "boundary_source": "Ville de Montreal administrative boundaries",
                    "source_downloaded_date": SOURCE_DOWNLOADED_DATE,
                },
                "geometry": geometry,
            }
        )
    return {
        "type": "FeatureCollection",
        "name": "community_area_boundaries_real_v1",
        "source_url": SOURCE_URL,
        "license": SOURCE_LICENSE,
        "features": features,
    }
