"""Second-pass geocoder: recover coordinates for the 211 orgs that pass 1 missed.

Still free (OpenStreetMap Nominatim, 1 req/sec). For every org that does not yet
have coordinates but has an address with a street/postal signal, it tries a
ladder of looser queries, from most precise (full street + postal) down to the
postal-code / borough area, stopping at the first result inside Montreal.

Reads / updates:
    data/raw/service_sources/_211/montreal_social_resources_unique.csv   (source addresses)
    data/raw/service_sources/_211/montreal_social_resources_geocoded.csv (appended to)
"""
from pathlib import Path
import csv
import re
import sys
import time

import pandas as pd
import requests

SRC = Path(__file__).resolve().parents[2] / "data" / "raw" / "service_sources" / "_211"
UNIQUE = SRC / "montreal_social_resources_unique.csv"
OUT = SRC / "montreal_social_resources_geocoded.csv"

POSTAL = re.compile(r"[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d")
SUITE = re.compile(r"\s*(Suite|Apt|Bureau|Unit|Office|#|ext|local).*", re.I)
HOUSE_NO = re.compile(r"^\s*\d+[A-Za-z]?\s+")
CITY_WORDS = {"qc", "quebec", "québec", "montréal", "montreal", "canada"}

S = requests.Session()
S.headers.update({"User-Agent": "CommunityRadar-research/1.0 (McGill BUSA649 academic project)"})


def _call(**p):
    p.update({"format": "json", "limit": 1, "countrycodes": "ca"})
    try:
        r = S.get("https://nominatim.openstreetmap.org/search", params=p, timeout=30)
        time.sleep(1.1)  # Nominatim fair-use
        js = r.json()
        if js:
            la, lo = float(js[0]["lat"]), float(js[0]["lon"])
            if 45.2 <= la <= 45.9 and -74.5 <= lo <= -73.0:
                return round(la, 6), round(lo, 6)
    except Exception:
        pass
    return None


def geocode(addr: str):
    parts = [x.strip() for x in str(addr).split(",") if x.strip()]
    if not parts:
        return None
    pm = POSTAL.search(addr)
    postal = pm.group(0) if pm else ""
    street = SUITE.sub("", parts[0]).strip()
    borough = next((p for p in parts[1:] if p.lower() not in CITY_WORDS
                    and not POSTAL.search(p) and not p.isdigit()), "")
    street_no_num = HOUSE_NO.sub("", street).strip()

    ladder = [
        dict(street=street, city="Montréal", state="Québec", postalcode=postal),
        dict(q=f"{street}, {borough}, Montréal, Québec, Canada") if borough else None,
        dict(q=f"{street}, Montréal, Québec, Canada"),
        dict(q=f"{street_no_num}, {borough}, Montréal, Québec, Canada") if borough else None,
        dict(postalcode=postal, country="Canada") if postal else None,
        dict(q=f"{postal[:3]}, Montréal, Québec, Canada") if len(postal) >= 3 else None,
        dict(q=f"{borough}, Montréal, Québec, Canada") if borough else None,
    ]
    for q in ladder:
        if not q:
            continue
        hit = _call(**q)
        if hit:
            return hit
    return None


def main() -> None:
    u = pd.read_csv(UNIQUE, dtype=str).fillna("")
    done = set()
    if OUT.exists():
        g = pd.read_csv(OUT, dtype=str).fillna("")
        done = set(g[g["lat"].str.strip() != ""]["name"].str.strip())  # already placed

    # candidates: not yet placed, address has a street number or a postal code, not confidential
    def worth_trying(a):
        a = str(a)
        if "confidential" in a.lower():
            return False
        return bool(POSTAL.search(a) or HOUSE_NO.search(a))

    todo = u[(~u["name"].str.strip().isin(done)) & (u["address"].apply(worth_trying))]
    print(f"retrying {len(todo)} orgs without coordinates...", file=sys.stderr, flush=True)

    added = 0
    with open(OUT, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        for i, (_, r) in enumerate(todo.iterrows(), 1):
            hit = geocode(r["address"])
            if hit:
                w.writerow([r["name"].strip(), r["address"], hit[0], hit[1],
                            r.get("categories", ""), r.get("phone", ""), r.get("website", "")])
                f.flush()
                added += 1
            if i % 100 == 0:
                print(f"  {i}/{len(todo)} tried, {added} newly placed", file=sys.stderr, flush=True)

    print(f"DONE second pass: {added} new coordinates recovered (appended to {OUT.name})")


if __name__ == "__main__":
    main()
