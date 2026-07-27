"""Scrape the INDex (reseaumtlnetwork.com) Indigenous community resource directory.

Pulls the WordPress `organisations-index` listing, parses each org page for
address/phone/website, geocodes addresses via OpenStreetMap Nominatim (1 req/sec),
and writes:

    data/raw/service_sources/indigenous_services_index.csv

Orgs with confidential / non-street addresses are kept with blank coordinates.

Usage:
    python scripts/data_pipeline/fetch_indigenous_services.py
"""
from pathlib import Path
import csv
import html
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from comm_need_radar.config.paths import RAW_DIR  # noqa: E402

OUT = RAW_DIR / "service_sources" / "indigenous_services_index.csv"
API = "https://reseaumtlnetwork.com/wp-json/wp/v2/organisations-index"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
S = requests.Session()
S.headers.update({"User-Agent": "CommunityRadar-research/1.0 (McGill BUSA649)"})


def fetch_orgs() -> list[dict]:
    orgs, page = [], 1
    while True:
        r = S.get(API, params={"per_page": 100, "page": page}, timeout=30)
        if r.status_code != 200 or not r.json():
            break
        orgs += r.json()
        if len(r.json()) < 100:
            break
        page += 1
    return orgs


def parse_org_page(link: str):
    soup = BeautifulSoup(S.get(link, timeout=30).text, "html.parser")
    addr = phone = web = None
    for c in soup.select(".contact"):
        a = c.find("a", href=True)
        txt = c.get_text(" ", strip=True)
        if a:
            href = a["href"]
            if href.startswith("tel:") and not phone:
                phone = href[4:].strip()
            elif href.startswith("http") and not web and "reseaumtlnetwork" not in href:
                web = href.strip()
        elif txt and not addr:
            addr = txt
    return addr, phone, web


def geocode(address):
    if not address or not re.search(r"\d", address) or "confiden" in address.lower():
        return None, None
    q = address if re.search(r"montr|qc|québec", address, re.I) else f"{address}, Montréal, QC, Canada"
    try:
        d = S.get(NOMINATIM, params={"q": q, "format": "json", "limit": 1, "countrycodes": "ca"},
                  timeout=30).json()
        time.sleep(1.1)  # Nominatim policy
        if d:
            lat, lon = float(d[0]["lat"]), float(d[0]["lon"])
            if 45.3 <= lat <= 45.75 and -74.1 <= lon <= -73.3:
                return lat, lon
    except Exception:  # noqa: BLE001
        pass
    return None, None


def main() -> None:
    orgs = fetch_orgs()
    print(f"Fetched {len(orgs)} organizations from INDex")
    rows = []
    for o in orgs:
        name = html.unescape(o["title"]["rendered"]).strip()
        addr, phone, web = parse_org_page(o["link"])
        lat, lon = geocode(addr)
        rows.append({"name": name, "address": addr or "", "phone": phone or "",
                     "website": web or "", "lat": lat or "", "lon": lon or "",
                     "service_category": "community_service_211", "source": "reseaumtlnetwork_index"})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    cols = ["name", "address", "phone", "website", "lat", "lon", "service_category", "source"]
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    mapped = sum(1 for r in rows if r["lat"])
    print(f"  ✓ {len(rows)} orgs ({mapped} geocoded) -> {OUT}")


if __name__ == "__main__":
    main()
