"""Fetch MSSS health/social facilities (and food-bank fallbacks) into service_sources/.

Sources:
  - MSSS M02 "Repertoire des installations" (Donnees Quebec): all Montreal (RSS 6)
    public health/social access points -- CLSCs, hospitals (CHSGS), psychiatric
    (CHPSY), addiction (CRD), disability/autism (CRDITED), youth protection (CPEJ),
    and youth rehab (CRJDA). Residential long-term care (CHSLD) is excluded to avoid
    overlap with OSM nursing homes.
  - Curated Moisson-Montreal food-bank fallback list (macommunaute.ca has no open export).

Outputs (committed; re-run to refresh):
    data/raw/service_sources/msss_montreal.csv
    data/raw/service_sources/foodbanks_montreal.csv

Usage:
    python scripts/data_pipeline/fetch_community_services.py
"""
from pathlib import Path
import io
import sys

import pandas as pd
import requests

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from comm_need_radar.config.paths import RAW_DIR  # noqa: E402

OUT = RAW_DIR / "service_sources"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "CommunityRadar-research/1.0 (McGill BUSA649)"})

M02_URL = (
    "https://www.donneesquebec.ca/recherche/dataset/"
    "51998b55-7d4c-4381-8c20-0ac1cd9c1b87/resource/"
    "2aa06e66-c1d0-4e2f-bf3c-c2e413c3f84d/download/installationscsv.csv"
)

FOODBANK_FALLBACK = [
    ("Moisson Montréal (Warehouse/HQ)", 45.5311, -73.6217),
    ("Dépannage Alimentaire Côte-des-Neiges", 45.4937, -73.6260),
    ("Garde-manger Pour Tous", 45.5290, -73.5870),
    ("La Corbeille (Villeray)", 45.5538, -73.6123),
    ("La Maison du Partage de Youville", 45.5196, -73.5591),
    ("Dépannage Alimentaire NDG", 45.4727, -73.6148),
    ("Centre Évangélique Bethel (Parc-Extension)", 45.5367, -73.6332),
    ("Dépannage Alimentaire Mercier-Hochelaga", 45.5610, -73.5488),
    ("Dépannage Alimentaire Pointe-Saint-Charles", 45.4678, -73.5648),
    ("La Ressourcerie alimentaire Saint-Laurent", 45.5078, -73.6890),
    ("Dépannage Alimentaire Rosemont", 45.5481, -73.5955),
    ("Le Comptoir alimentaire Hochelaga", 45.5443, -73.5476),
]


# Mission columns to keep (excludes CHSLD residential long-term care), with a
# human label for the `type` field.
MISSIONS = {
    "CLSC": "CLSC", "CHSGS": "Hospital", "CHPSY": "Psychiatric",
    "CRD": "Addiction", "CRDITED": "Disability/Autism",
    "CPEJ": "Youth protection", "CRJDA": "Youth rehab",
}


def fetch_msss() -> pd.DataFrame:
    print("Fetching Montreal MSSS health/social facilities from M02 …")
    try:
        r = SESSION.get(M02_URL, timeout=60)
        r.raise_for_status()
        df = pd.read_csv(io.StringIO(r.content.decode("utf-8-sig")), low_memory=False)
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ download failed: {e}")
        return pd.DataFrame()
    df["RSS_CODE"] = df["RSS_CODE"].astype(str).str.strip().str.lstrip("0")
    mtl = df[df["RSS_CODE"] == "6"].copy()
    for col in MISSIONS:
        mtl[col] = mtl.get(col, "").astype(str).str.strip().str.lower()
    has_mission = mtl[list(MISSIONS)].eq("oui").any(axis=1)
    mtl = mtl[has_mission].copy()
    mtl["type"] = mtl.apply(
        lambda r: "; ".join(lbl for col, lbl in MISSIONS.items() if r[col] == "oui"), axis=1)
    out = pd.DataFrame({
        "name": mtl["INSTAL_NOM"], "address": mtl["ADRESSE"], "postal_code": mtl["CODE_POSTA"],
        "lat": pd.to_numeric(mtl["LATITUDE"], errors="coerce"),
        "lon": pd.to_numeric(mtl["LONGITUDE"], errors="coerce"),
        "service_category": "community_service_211", "type": mtl["type"],
    }).dropna(subset=["lat", "lon"]).drop_duplicates(subset=["name", "lat", "lon"])
    print(f"  ✓ {len(out)} MSSS facilities ({out['type'].str.contains('CLSC').sum()} CLSCs)")
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    msss = fetch_msss()
    if not msss.empty:
        msss.to_csv(OUT / "msss_montreal.csv", index=False, encoding="utf-8")
    food = pd.DataFrame(FOODBANK_FALLBACK, columns=["name", "lat", "lon"])
    food["service_category"] = "food_bank"
    food.to_csv(OUT / "foodbanks_montreal.csv", index=False, encoding="utf-8")
    print(f"  ✓ {len(food)} food banks (curated fallback)")
    print("Next: python scripts/data_pipeline/build_service_centers.py")


if __name__ == "__main__":
    main()
