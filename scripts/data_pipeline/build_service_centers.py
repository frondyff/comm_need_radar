"""Build the real service-centers table from public Montreal service data.

Assembles every service source into one unified table, then maps it to the team
contract:

    data/raw/database_centers.csv
      center_id, center_name, latitude, longitude, address,
      service_categories, hours, languages, indigenous_led_or_specific

Sources (committed under data/raw/service_sources/):
    lieux_culturels.csv                  Ville de Montreal cultural venues (libraries, museums)
    installations_recreatives_shp.zip    Ville de Montreal recreation/sport installations (shapefile)
    clsc_montreal.csv                    MSSS M02 CLSCs (health/social access points)
    community_services_curated.csv       Curated shelters, newcomer, women's/youth services
    foodbanks_montreal.csv               Moisson Montreal network food banks
    indigenous_services_index.csv        INDex (reseaumtlnetwork.com) Indigenous orgs, geocoded

CLSC / food-bank / Indigenous CSVs are produced by the fetch_* scripts; the
downloadable open-data files are produced by download_sources.py.

Usage:
    python scripts/data_pipeline/build_service_centers.py
"""
from pathlib import Path
import hashlib
import sys
import zipfile

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from comm_need_radar.config.paths import RAW_DIR  # noqa: E402

SRC = RAW_DIR / "service_sources"
OUTPUT_PATH = RAW_DIR / "database_centers.csv"

CATEGORY_LABEL = {
    "community_service_211": "Community & Social Services",
    "food_bank": "Food Support",
    "culture_library": "Library & Culture",
    "recreation_sport": "Recreation & Sport",
}


def fix_mojibake(value):
    """Repair UTF-8 bytes wrongly decoded as Latin-1 ('BiodÃ´me' -> 'Biodôme')."""
    if not isinstance(value, str):
        return value
    if any(m in value for m in ("Ã", "Â", "Å", "â\x80", "Ð")):
        try:
            return value.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return value
    return value


def blank(n):
    return pd.Series([pd.NA] * n)


def load_unified() -> pd.DataFrame:
    frames = []

    cult_path = SRC / "lieux_culturels.csv"
    if cult_path.exists():
        c = pd.read_csv(cult_path, encoding="utf-8-sig", low_memory=False)
        c.columns = [col.strip() for col in c.columns]
        frames.append(pd.DataFrame({
            "name": c["Nom du lieu culturel municipal"].map(fix_mojibake),
            "service_category": "culture_library",
            "lat": pd.to_numeric(c["Latitude"], errors="coerce"),
            "lon": pd.to_numeric(c["Longitude"], errors="coerce"),
            "address": c.get("Adresse", blank(len(c))).map(fix_mojibake),
            "languages": pd.NA,
            "source": "montreal_open_data:lieux_culturels",
        }).dropna(subset=["lat", "lon"]))

    recr_zip = SRC / "installations_recreatives_shp.zip"
    if recr_zip.exists():
        import geopandas as gpd
        recr_dir = SRC / "installations_recreatives_shp"
        recr_dir.mkdir(exist_ok=True)
        with zipfile.ZipFile(recr_zip) as z:
            z.extractall(recr_dir)
        g = gpd.read_file(next(recr_dir.glob("**/*.shp"))).to_crs("EPSG:4326").reset_index(drop=True)
        pts = g.geometry.representative_point()
        frames.append(pd.DataFrame({
            "name": g["NOM"].map(fix_mojibake),
            "service_category": "recreation_sport",
            "lat": pts.y.values,
            "lon": pts.x.values,
            "address": pd.NA,
            "languages": pd.NA,
            "source": "montreal_open_data:installations_recreatives",
        }).dropna(subset=["lat", "lon"]))

    for f in sorted(SRC.glob("*.csv")):
        if f.name == "lieux_culturels.csv":
            continue
        s = pd.read_csv(f, encoding="utf-8-sig", low_memory=False)
        s.columns = [col.strip().lower() for col in s.columns]
        if not {"name", "lat", "lon"}.issubset(s.columns):
            continue
        frames.append(pd.DataFrame({
            "name": s["name"].map(fix_mojibake),
            "service_category": s.get("service_category", pd.Series(["community_service_211"] * len(s))),
            "lat": pd.to_numeric(s["lat"], errors="coerce"),
            "lon": pd.to_numeric(s["lon"], errors="coerce"),
            "address": (s["address"].map(fix_mojibake) if "address" in s.columns else blank(len(s))),
            "languages": s.get("languages", blank(len(s))),
            "source": f"service_sources:{f.stem}",
        }).dropna(subset=["lat", "lon"]))

    services = pd.concat(frames, ignore_index=True)
    # 1) exact dedup: same name at the same ~1 m location (all categories)
    name_key = (services["name"].astype(str).str.strip().str.lower()
                + "@" + services["lat"].round(5).astype(str)
                + "," + services["lon"].round(5).astype(str))
    services = services[~name_key.duplicated()].reset_index(drop=True)
    # 2) coincident dedup -- ONLY for the multi-source social categories, where the
    #    same real facility (e.g. a CLSC) is listed by both MSSS and OpenStreetMap.
    #    Recreation/culture come from a single source with legitimately clustered
    #    points, so they are left untouched.
    multi_source = services["service_category"].isin(["community_service_211", "food_bank"])
    loc_key = (services["service_category"].astype(str)
               + "@" + services["lat"].round(4).astype(str)
               + "," + services["lon"].round(4).astype(str))
    drop = multi_source & loc_key.duplicated()
    services = services[~drop].reset_index(drop=True)
    services = services[services["lat"].between(45.3, 45.75)
                        & services["lon"].between(-74.1, -73.3)].reset_index(drop=True)
    return services


def center_id(row) -> str:
    h = hashlib.md5(f"{row['name']}|{row['lat']:.5f}|{row['lon']:.5f}".encode()).hexdigest()[:8]
    return f"CTR_{h}"


def main() -> None:
    svc = load_unified()
    centers = pd.DataFrame({
        "center_id": svc.apply(center_id, axis=1),
        "center_name": svc["name"],
        "latitude": svc["lat"].round(6),
        "longitude": svc["lon"].round(6),
        "address": svc["address"].fillna(""),
        "service_categories": svc["service_category"].map(CATEGORY_LABEL).fillna(svc["service_category"]),
        "hours": "",
        "languages": svc["languages"].fillna(""),
        "indigenous_led_or_specific": svc["source"].fillna("").str.contains("indigenous", case=False),
    })
    dups = centers["center_id"].duplicated(keep=False)
    if dups.any():
        centers.loc[dups, "center_id"] = (centers.loc[dups, "center_id"] + "_"
                                          + (centers.loc[dups].groupby("center_id").cumcount() + 1).astype(str))
    centers.to_csv(OUTPUT_PATH, index=False)
    print(f"Wrote {len(centers)} service centers to {OUTPUT_PATH}")
    print("  category breakdown:", centers["service_categories"].value_counts().to_dict())
    print("  indigenous-led/specific:", int(centers["indigenous_led_or_specific"].sum()))


if __name__ == "__main__":
    main()
