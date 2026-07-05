"""Build the geography join inputs from official boundary files.

Outputs:
    data/raw/boundaries/ct_centroids_montreal.csv   (ct_code, dguid, centroid_lon, centroid_lat)
    data/raw/boundaries/montreal_boroughs.geojson   (11 target boroughs, NOM only)

Sources (under the sources dir, default data/raw/_sources/boundaries/):
    census_tracts_2021_national.zip        StatCan 2021 cartographic CT boundaries (lct_000b21a_e)
    montreal_arrondissements_wgs84.geojson Ville de Montreal administrative boundaries

The 11 boroughs kept are exactly the aggregation targets used by
scripts/aggregate_ct_to_areas.py (the 12 MVP areas map onto these 11 boroughs).

Usage:
    SOURCES_DIR=/path/to/sources python scripts/data_pipeline/build_geography.py
"""
from pathlib import Path
import json
import os
import sys
import zipfile

import geopandas as gpd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from comm_need_radar.config.paths import RAW_DIR  # noqa: E402

SOURCES_DIR = Path(os.environ.get("SOURCES_DIR", RAW_DIR / "_sources"))
CT_ZIP = SOURCES_DIR / "boundaries" / "census_tracts_2021_national.zip"
ARROND_GEOJSON = SOURCES_DIR / "boundaries" / "montreal_arrondissements_wgs84.geojson"

OUT_DIR = RAW_DIR / "boundaries"
CENTROIDS_OUT = OUT_DIR / "ct_centroids_montreal.csv"
BOROUGHS_OUT = OUT_DIR / "montreal_boroughs.geojson"

MONTREAL_CMA = "462"
# The 11 boroughs the 12 MVP areas aggregate onto (official NOM spelling).
TARGET_BOROUGHS = {
    "Ahuntsic-Cartierville", "Côte-des-Neiges-Notre-Dame-de-Grâce", "Lachine",
    "Le Plateau-Mont-Royal", "Le Sud-Ouest", "Mercier-Hochelaga-Maisonneuve",
    "Montréal-Nord", "Rivière-des-Prairies-Pointe-aux-Trembles", "Verdun",
    "Villeray-Saint-Michel-Parc-Extension", "Westmount",
}


def build_centroids() -> None:
    if not CT_ZIP.exists():
        sys.exit(f"Missing source: {CT_ZIP} (run download_sources.py or place the file)")
    extract_dir = SOURCES_DIR / "boundaries" / "ct_national_shp"
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(CT_ZIP) as z:
        z.extractall(extract_dir)
    shp = next(extract_dir.glob("*.shp"))
    gdf = gpd.read_file(shp)
    # The cartographic CT file carries no CMAUID column; every Montreal CMA tract's
    # CTUID begins with the CMA code (462), so filter on that prefix.
    gdf = gdf[gdf["CTUID"].astype(str).str.startswith(MONTREAL_CMA)].to_crs("EPSG:4326")
    centroids = gdf.geometry.centroid
    out = gdf[["CTUID", "DGUID"]].copy()
    out.columns = ["ct_code", "dguid"]
    out["centroid_lon"] = centroids.x.round(6).values
    out["centroid_lat"] = centroids.y.round(6).values
    out = out.sort_values("ct_code")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out.to_csv(CENTROIDS_OUT, index=False)
    print(f"Wrote {len(out)} CT centroids to {CENTROIDS_OUT}")


def build_boroughs() -> None:
    if not ARROND_GEOJSON.exists():
        sys.exit(f"Missing source: {ARROND_GEOJSON} (run download_sources.py or place the file)")
    src = json.loads(ARROND_GEOJSON.read_text(encoding="utf-8"))
    features = [
        {"type": "Feature",
         "properties": {"NOM": f["properties"]["NOM"]},
         "geometry": f["geometry"]}
        for f in src["features"]
        if f["properties"].get("NOM") in TARGET_BOROUGHS
    ]
    out = {"type": "FeatureCollection", "features": features}
    BOROUGHS_OUT.write_text(json.dumps(out), encoding="utf-8")
    print(f"Wrote {len(features)} boroughs to {BOROUGHS_OUT}")


def main() -> None:
    build_centroids()
    build_boroughs()


if __name__ == "__main__":
    main()
