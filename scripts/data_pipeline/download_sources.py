"""Download the large public source files the data pipeline needs.

Fetches into data/raw/_sources/ (gitignored). The small service inputs
(cultural venues, recreation shapefile, curated/fetched CSVs) are committed under
data/raw/service_sources/ and are NOT downloaded here.

Downloads:
    census/census_profile_2021_CMA_CT.csv        StatCan Census Profile bulk (98-401-X2021007)
    boundaries/census_tracts_2021_national.zip   StatCan 2021 cartographic CT boundaries
    boundaries/montreal_arrondissements_wgs84.geojson  Ville de Montreal admin boundaries

Usage:
    python scripts/data_pipeline/download_sources.py
"""
from pathlib import Path
import sys

import requests

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from comm_need_radar.config.paths import RAW_DIR  # noqa: E402

SOURCES_DIR = RAW_DIR / "_sources"

DOWNLOADS = [
    (
        "https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/"
        "download-telecharger/comp/getFile.cfm?Lang=E&FILETYPE=CSV&GEONO=007",
        "census/census_profile_2021_CMA_CT.csv",
        "2021 Census Profile bulk file (98-401-X2021007, ~250 MB ZIP)",
    ),
    (
        "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/"
        "boundary-limites/files-fichiers/lct_000b21a_e.zip",
        "boundaries/census_tracts_2021_national.zip",
        "2021 cartographic census-tract boundaries",
    ),
    (
        "https://donnees.montreal.ca/fr/dataset/9797a946-9da8-41ec-8815-f6b276dec7e9/"
        "resource/e18bfd07-edc8-4ce8-8a5a-3b617662a794/download/"
        "limites-administratives-agglomeration.geojson",
        "boundaries/montreal_arrondissements_wgs84.geojson",
        "Ville de Montreal administrative boundaries (WGS84)",
    ),
]


def download(url: str, dest: Path, label: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        print(f"  ✓ already present: {dest.relative_to(RAW_DIR)}")
        return
    print(f"  downloading {label} …")
    try:
        with requests.get(url, stream=True, timeout=180,
                          headers={"User-Agent": "CommunityRadar-research/1.0"}) as r:
            r.raise_for_status()
            with dest.open("wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    f.write(chunk)
        print(f"  ✓ saved {dest.relative_to(RAW_DIR)} ({dest.stat().st_size/1e6:.1f} MB)")
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ failed: {e}\n    Download manually and place at {dest}")


def main() -> None:
    print(f"Downloading sources into {SOURCES_DIR} …")
    for url, rel, label in DOWNLOADS:
        download(url, SOURCES_DIR / rel, label)
    print("\nNext: python scripts/data_pipeline/build_census_ct_variables.py "
          "&& python scripts/data_pipeline/build_geography.py")


if __name__ == "__main__":
    main()
