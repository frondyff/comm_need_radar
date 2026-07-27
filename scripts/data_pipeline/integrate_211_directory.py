"""Fold the full 211 / Centraide directory into a single `service_directory` table.

Keeps EVERY organization extracted from the PDF (mappable or not). Organizations
with a geocodable address get latitude/longitude; the rest (confidential-address
shelters, crisis lines, etc.) are kept with blank coordinates and mappable=0, so
they stay fully searchable even though they cannot show as a map pin.

This is a standalone directory table: it does NOT modify database_center,
service_table, or any of Frondy's area-scoring outputs (center_area_lookup,
gap_score, accessibility, observed_need_*). Those stay exactly as validated.

Reads (gitignored, licensed):
    data/raw/service_sources/_211/montreal_social_resources_unique.csv   all orgs
    data/raw/service_sources/_211/montreal_social_resources_geocoded.csv coords (partial ok)
Writes:
    data/processed/service_directory_211.csv

Credit: 211 Grand Montreal / Centraide. Academic use only.
"""
from pathlib import Path
import hashlib
import re
import sys

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from service_taxonomy import classify  # noqa: E402

# Trailing PDF page/entry number that got glued onto the org name ("TEL-JEUNES 2655").
PAGE_NUM = re.compile(r"\s+\d{2,6}\s*$")
# Dangling separator/punctuation left at the end of a name ("ANONYME (L') -").
TRAIL_SEP = re.compile(r"[\s\-–—•:;,.]+$")
# A name that STARTS with a separator is an orphaned continuation line ("- MONTRÉAL ISLAND").
LEAD_SEP = re.compile(r"^[\s\-–—•:;,.]")
# A "name" that is really a phone/TTY line, a URL fragment, a postal code, or a
# lone place-name fragment, not an organization.
PHONE_NAME = re.compile(r"\d{3}[\s\-]\d{3,4}|\bTTY\b", re.I)
URL_FRAG = re.compile(r"^\?|clng=|https?://|^www\.", re.I)
POSTAL = re.compile(r"^[A-Za-z]\d[A-Za-z](\s?\d[A-Za-z]\d)?$")
PLACE_WORDS = {"plateau", "outremont", "hochelaga", "lachine", "verdun", "montreal", "montréal",
               "anjou", "lasalle", "rosemont", "ahuntsic", "westmount", "nord", "est", "ouest",
               "sud", "ville-marie", "mercier", "saint-laurent", "saint-michel", "cartierville",
               "notre-dame-de-grace", "notre-dame-de-grâce"}
# An address cell that is actually a leaked field label, not an address.
BAD_ADDR = re.compile(r"^\s*(Eligibility|Website|Services|Clientele|Fees|Hours|Languages)\s*:", re.I)
LETTERS = re.compile(r"[A-Za-zÀ-ÿ]")


def is_junk_name(s: str) -> bool:
    s = s.strip()
    if PHONE_NAME.search(s) or URL_FRAG.search(s) or POSTAL.match(s) or s.lower() in PLACE_WORDS:
        return True
    return sum(c.isdigit() for c in s) > sum(c.isalpha() for c in s)


def clean_name(s: str) -> str:
    """Strip PDF page numbers and dangling separators so index/entry/sub-service
    variants of the same org collapse to one canonical name."""
    s = " ".join(str(s).split())
    for _ in range(3):  # peel repeated "... 2301 -" / "... - 2301" tails
        s = TRAIL_SEP.sub("", PAGE_NUM.sub("", s)).strip()
    return s


def has_name(s: str) -> bool:
    return len(LETTERS.findall(s)) >= 2


def clean_addr(s: str) -> str:
    s = " ".join(str(s).split())
    if BAD_ADDR.match(s) or not LETTERS.search(s):  # field label, or a bare page number
        return ""
    return s

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SRC = PROJECT_ROOT / "data" / "raw" / "service_sources" / "_211"
UNIQUE = SRC / "montreal_social_resources_unique.csv"
GEOCODED = SRC / "montreal_social_resources_geocoded.csv"
OUT = PROJECT_ROOT / "data" / "processed" / "service_directory_211.csv"

SOURCE_NAME = "211 Grand Montreal / Centraide"
SOURCE_URL = "https://www.211qc.ca/"
CHECKED = "2026-07-13"


def directory_id(name: str) -> str:
    return "DIR_" + hashlib.sha1(name.strip().encode("utf-8")).hexdigest()[:10]


def main() -> None:
    orgs = pd.read_csv(UNIQUE, dtype=str).fillna("")
    orgs = orgs[orgs["name"].str.strip() != ""].copy()

    # Attach coordinates by exact organization name. Drop off-island matches
    # (wrong town). Keep on-island coordinates but rate their precision: a point
    # shared by <=4 orgs is a real building location ("exact"); a bigger stack is
    # a postal/street centroid the free geocoder fell back to ("approximate") --
    # good enough to place the org in the right area, not for a precise map pin.
    coords = {}
    if GEOCODED.exists():
        g = pd.read_csv(GEOCODED, dtype=str).fillna("")
        g = g[g["lat"].str.strip() != ""].copy()
        g["latf"] = pd.to_numeric(g["lat"], errors="coerce")
        g["lonf"] = pd.to_numeric(g["lon"], errors="coerce")
        g = g[g["latf"].between(45.40, 45.72) & g["lonf"].between(-73.99, -73.47)]
        g["pt"] = g["lat"] + "," + g["lon"]
        g["stack"] = g.groupby("pt")["name"].transform("size")
        for _, r in g.iterrows():
            prec = "exact" if r["stack"] <= 4 else "approximate"
            coords[r["name"].strip()] = (r["lat"].strip(), r["lon"].strip(), prec)

    rows = []
    for _, o in orgs.iterrows():
        raw = o["name"].strip()                 # geocode file is keyed on the raw name
        if LEAD_SEP.match(raw):                 # orphaned continuation line, not an org
            continue
        name = clean_name(raw)                  # display name, page number stripped
        if not has_name(name) or is_junk_name(name):   # drop fragments / phone-number lines
            continue
        lat, lon, prec = coords.get(raw, ("", "", ""))
        rows.append({
            "directory_id": directory_id(name),
            "org_name": name,
            "services": " ".join(str(o.get("services", "")).split()),
            "address": clean_addr(o.get("address", "")),
            "latitude": lat,
            "longitude": lon,
            "geocode_precision": prec,
            "mappable": 1 if lat and lon else 0,
            "phone": o.get("phone", ""),
            "website": o.get("website", ""),
            "email": o.get("email", ""),
            "coverage_area": o.get("coverage_area", ""),
            "hours": o.get("hours", ""),
            "source_name": SOURCE_NAME,
            "source_url": SOURCE_URL,
            "last_checked_date": CHECKED,
        })

    # Each org appears twice in the PDF (index line with a page number + the real
    # entry). Stripping the page number collapses them to one directory_id; merge
    # those rows by taking the first non-empty value for every field so no address
    # or phone is lost, and union the categories.
    def first_real(s):
        for v in s:
            if str(v).strip():
                return v
        return ""

    def longest(s):
        return max((str(v) for v in s), key=len, default="")

    raw = pd.DataFrame(rows)
    df = raw.groupby("directory_id", as_index=False).agg(
        org_name=("org_name", "first"),
        services=("services", longest),
        address=("address", first_real),
        latitude=("latitude", first_real),
        longitude=("longitude", first_real),
        geocode_precision=("geocode_precision", first_real),
        phone=("phone", first_real),
        website=("website", first_real),
        email=("email", first_real),
        coverage_area=("coverage_area", first_real),
        hours=("hours", first_real),
        source_name=("source_name", "first"),
        source_url=("source_url", "first"),
        last_checked_date=("last_checked_date", "first"),
    )
    df["mappable"] = ((df["latitude"].astype(str).str.strip() != "") &
                      (df["longitude"].astype(str).str.strip() != "")).astype(int)

    # Classify every org into the app taxonomy from its services text + name
    # (multi-label + a single primary). The unreliable 211 category field is not used.
    labels = df.apply(lambda r: classify(r["services"], r["org_name"]), axis=1)
    df["service_categories"] = labels.apply(lambda t: "; ".join(t[0]) if t[0] else "Other")
    df["primary_category"] = labels.apply(lambda t: t[1])

    df = df[["directory_id", "org_name", "primary_category", "service_categories",
             "address", "latitude", "longitude", "mappable", "geocode_precision",
             "phone", "website", "email", "coverage_area", "hours", "services",
             "source_name", "source_url", "last_checked_date"]] \
        .sort_values("org_name").reset_index(drop=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT, index=False)

    n = len(df)
    exact = int((df["geocode_precision"] == "exact").sum())
    approx = int((df["geocode_precision"] == "approximate").sum())
    print(f"service_directory: {n} organizations -> {OUT}")
    print(f"  located: {exact + approx} ({100*(exact+approx)/max(n,1):.0f}%)  ->  exact {exact}, approximate {approx}")
    print(f"  directory-only (no public address / not geocoded): {n - exact - approx}")
    print("\n  organizations by primary category:")
    for cat, c in df["primary_category"].value_counts().items():
        print(f"    {cat:28} {c}")


if __name__ == "__main__":
    main()
