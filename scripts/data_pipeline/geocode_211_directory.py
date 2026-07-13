"""Geocode the 211 directory organizations (addresses with a postal code) via
OpenStreetMap Nominatim (free, 1 req/sec). Incremental + resumable.

Reads : data/raw/service_sources/_211/montreal_social_resources_unique.csv
Writes: data/raw/service_sources/_211/montreal_social_resources_geocoded.csv
"""
from pathlib import Path
import csv
import os
import re
import sys
import time

import pandas as pd
import requests

SRC = Path(__file__).resolve().parents[2] / "data" / "raw" / "service_sources" / "_211"
IN = SRC / "montreal_social_resources_unique.csv"
OUT = SRC / "montreal_social_resources_geocoded.csv"
POSTAL = re.compile(r"[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d")

d = pd.read_csv(IN)
todo = d[d["address"].fillna("").str.contains(POSTAL)].copy()

done = set()
if OUT.exists():
    try:
        done = set(pd.read_csv(OUT)["name"])
    except Exception:
        done = set()

S = requests.Session()
S.headers.update({"User-Agent": "CommunityRadar-research/1.0 (McGill BUSA649 academic project)"})


def _call(**p):
    p.update({"format": "json", "limit": 1, "countrycodes": "ca"})
    try:
        r = S.get("https://nominatim.openstreetmap.org/search", params=p, timeout=30)
        time.sleep(1.1)
        js = r.json()
        if js:
            la, lo = float(js[0]["lat"]), float(js[0]["lon"])
            if 45.2 <= la <= 45.9 and -74.5 <= lo <= -73.0:
                return round(la, 6), round(lo, 6)
    except Exception:
        pass
    return None


def geocode(addr):
    parts = [x.strip() for x in addr.split(",")]
    pc = POSTAL.search(addr).group(0)
    street = re.sub(r"\s*(Suite|Apt|Bureau|Unit|#|ext).*", "", parts[0], flags=re.I).strip()
    city = next((p for p in parts[1:] if not re.search(r"\d", p)
                 and p.lower() not in ("qc", "quebec", "québec", "montréal", "montreal")), "Montréal")
    return (_call(street=street, postalcode=pc, country="Canada")
            or _call(q=f"{street}, {city}, QC, Canada")
            or _call(postalcode=pc, country="Canada"))


first = not OUT.exists()
n = len(done)
with open(OUT, "a", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    if first:
        w.writerow(["name", "address", "lat", "lon", "categories", "phone", "website"])
    for _, r in todo.iterrows():
        if r["name"] in done:
            continue
        res = geocode(str(r["address"]))
        lat, lon = res if res else ("", "")
        w.writerow([r["name"], r["address"], lat, lon, r["categories"], r.get("phone", ""), r.get("website", "")])
        f.flush()
        n += 1
        if n % 100 == 0:
            print(f"  geocoded {n}/{len(todo)}", file=sys.stderr, flush=True)

res = pd.read_csv(OUT)
hit = res["lat"].astype(str).str.strip().replace("", pd.NA).notna().sum()
print(f"DONE: {len(res)} orgs processed, {hit} geocoded ({100*hit/max(len(res),1):.0f}%) -> {OUT}")
