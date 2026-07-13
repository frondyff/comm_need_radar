"""Build ONE deduplicated master services table.

Combines the 211 directory (service_directory_211.csv) with the open-data
service centers (database_centers.csv) into a single canonical list:
  - one row per real organization (de-duplicated across the two sources by
    normalized name and by location),
  - classified into the same taxonomy (service_taxonomy.py),
  - tagged with its source(s),
  - assigned to its MVP area where mappable (point-in-polygon -> nearest area
    centroid, identical method to map_centers_to_areas.py), so it is
    scoring-ready.

Frondy's existing database_center / center_area_lookup / scoring tables are left
untouched; this is the table his scoring can migrate onto (each row carries
area_id, and overlapping rows keep their legacy_center_id for reconciliation).

Reads:  data/processed/service_directory_211.csv
        data/raw/database_centers.csv
        data/raw/boundaries/montreal_boroughs.geojson
        data/raw/synthetic_area_profiles.csv
Writes: data/processed/services_master.csv
"""
from pathlib import Path
import hashlib
import json
import math
import re
import sys
import unicodedata

import pandas as pd
from shapely.geometry import Point, shape

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from service_taxonomy import classify  # noqa: E402

SD = ROOT / "data" / "processed" / "service_directory_211.csv"
DC = ROOT / "data" / "raw" / "database_centers.csv"
BOROUGHS = ROOT / "data" / "raw" / "boundaries" / "montreal_boroughs.geojson"
AREAS = ROOT / "data" / "raw" / "synthetic_area_profiles.csv"
OUT = ROOT / "data" / "processed" / "services_master.csv"

# database_center's coarse source categories -> (source label, seed taxonomy category)
DC_SOURCE = {"Recreation & Sport": "montreal_open_data", "Library & Culture": "montreal_open_data",
             "Community & Social Services": "community_services", "Food Support": "food_banks"}
# Park amenities (playgrounds, ball fields, splash pads, rinks) are equipment, not
# service organizations, so they are left out of the services master.
EXCLUDE_DC = {"Recreation & Sport"}
DC_SEED = {"Recreation & Sport": "Recreation & Culture", "Library & Culture": "Recreation & Culture",
           "Food Support": "Food", "Community & Social Services": "Community & Advocacy"}

BOROUGH_NAME_MAP = {
    "Villeray-Saint-Michel-Parc-Extension": "Villeray-Saint-Michel-Parc-Extension",
    "Côte-des-Neiges-Notre-Dame-de-Grâce": "Cote-des-Neiges-Notre-Dame-de-Grace",
    "Montréal-Nord": "Montreal-Nord", "Mercier-Hochelaga-Maisonneuve": "Mercier-Hochelaga-Maisonneuve",
    "Verdun": "Verdun", "Ahuntsic-Cartierville": "Ahuntsic-Cartierville", "Lachine": "Lachine",
    "Westmount": "Westmount", "Le Plateau-Mont-Royal": "Le Plateau-Mont-Royal",
    "Le Sud-Ouest": "Le Sud-Ouest",
    "Rivière-des-Prairies-Pointe-aux-Trembles": "Riviere-des-Prairies-Pointe-aux-Trembles",
}


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    s = re.sub(r"[^\w\s]", " ", s.lower())
    s = re.sub(r"\b(le|la|les|de|des|du|of|the|montreal|inc|centre|center)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def ckey(la, lo):
    try:
        return (round(float(la), 4), round(float(lo), 4))
    except (ValueError, TypeError):
        return None


POSTAL = re.compile(r"^[A-Za-z]\d[A-Za-z](\s?\d[A-Za-z]\d)?$")  # an FSA or full postal code, not a name
PHONE_NAME = re.compile(r"\d{3}[\s\-]\d{3,4}|\bTTY\b", re.I)
FIELD_LABEL = re.compile(r"^\s*(Eligibility|Website|Services|Clientele|Fees|Hours):", re.I)
# A name that is only a Montréal place/direction word is a split-off address fragment.
PLACE_WORDS = {"plateau", "outremont", "hochelaga", "lachine", "verdun", "montreal", "montréal",
               "anjou", "lasalle", "rosemont", "ahuntsic", "westmount", "nord", "est", "ouest",
               "sud", "ville-marie", "mercier", "saint-laurent", "saint-michel", "cartierville",
               "notre-dame-de-grace", "notre-dame-de-grâce"}


def is_junk(name):
    s = str(name).strip()
    letters = [c for c in s if c.isalpha()]
    if len(letters) < 2 or POSTAL.match(s) or PHONE_NAME.search(s) or s.lower() in PLACE_WORDS:
        return True
    return sum(c.isdigit() for c in s) > len(letters)


def clean_addr(a):
    a = " ".join(str(a).split())
    if FIELD_LABEL.match(a) or (a and not re.search(r"[A-Za-zÀ-ÿ]", a)):  # label or bare number
        return ""
    return a


def haversine_km(la1, lo1, la2, lo2):
    r = 6371.0
    p1, p2 = math.radians(la1), math.radians(la2)
    dp, dl = math.radians(la2 - la1), math.radians(lo2 - lo1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def load_polys():
    gj = json.loads(BOROUGHS.read_text(encoding="utf-8"))
    out = []
    for f in gj["features"]:
        proj = BOROUGH_NAME_MAP.get(f["properties"]["NOM"])
        if proj:
            out.append((proj, shape(f["geometry"])))
    return out


def assign_area(lat, lon, polys, areas):
    pt = Point(lon, lat)
    borough = next((n for n, poly in polys if poly.contains(pt)), None)
    if not borough:
        return "", ""
    cands = [a for a in areas if a["borough_name"] == borough]
    if not cands:
        return "", borough
    aid = min(cands, key=lambda a: haversine_km(lat, lon, float(a["latitude"]), float(a["longitude"])))["area_id"]
    return aid, borough


def main():
    master, by_name, by_coord = {}, {}, {}

    def register(row):
        key = "SVC_" + hashlib.sha1(f"{norm(row['name'])}|{ckey(row['latitude'], row['longitude'])}".encode()).hexdigest()[:10]
        row["service_id"] = key
        master[key] = row
        return key

    def distinctive(nm):
        return len(nm.split()) >= 2 and len(nm) >= 8

    def jaccard(a, b):
        A, B = set(norm(a).split()), set(norm(b).split())
        return len(A & B) / len(A | B) if (A | B) else 0.0

    # 1. seed with the 211 directory (richer records win) and INDEX only these,
    #    so open-data centers de-dup against 211 but never against each other.
    sd = pd.read_csv(SD, dtype=str).fillna("")
    for _, o in sd.iterrows():
        if is_junk(o["org_name"]):
            continue
        key = register({"name": o["org_name"], "primary_category": o["primary_category"],
                        "service_categories": o["service_categories"], "address": clean_addr(o["address"]),
                        "latitude": o["latitude"], "longitude": o["longitude"], "mappable": o["mappable"],
                        "geocode_precision": o.get("geocode_precision", ""),
                        "phone": o["phone"], "website": o["website"], "email": o["email"],
                        "hours": o["hours"], "services": o["services"], "sources": "211",
                        "legacy_center_id": ""})
        nm = norm(o["org_name"])
        if distinctive(nm):
            by_name.setdefault(nm, key)
        ck = ckey(o["latitude"], o["longitude"])
        if ck and o["mappable"] == "1":
            by_coord.setdefault(ck, key)

    # 2. add the open-data centers. A center is the SAME org as a 211 listing only
    #    if it shares a distinctive name, or sits on the same point with an
    #    overlapping name. Everything else is a distinct service and is kept.
    dc = pd.read_csv(DC, dtype=str).fillna("")
    merged = added = skipped = 0
    for _, c in dc.iterrows():
        if c["service_categories"] in EXCLUDE_DC:   # skip park amenities
            skipped += 1
            continue
        if is_junk(c["center_name"]):
            skipped += 1
            continue
        nm, ck = norm(c["center_name"]), ckey(c["latitude"], c["longitude"])
        cand = by_name.get(nm) if distinctive(nm) else None
        if not cand and ck and ck in by_coord and jaccard(c["center_name"], master[by_coord[ck]]["name"]) >= 0.34:
            cand = by_coord[ck]
        src = DC_SOURCE.get(c["service_categories"], "montreal_open_data")
        if cand:  # reconcile with the existing 211 org, do not duplicate
            row = master[cand]
            row["sources"] = "; ".join(sorted(set(row["sources"].split("; ")) | {src}))
            row["legacy_center_id"] = c["center_id"]
            if ck:  # open-data coordinate is exact; prefer it over the 211 street-level geocode
                row["latitude"], row["longitude"], row["mappable"] = c["latitude"], c["longitude"], "1"
                row["geocode_precision"] = "exact"
            merged += 1
        else:
            seed = DC_SEED.get(c["service_categories"], "")
            cats, _ = classify("", c["center_name"])
            ordered = list(dict.fromkeys(cats + ([seed] if seed else [])))
            register({"name": c["center_name"], "primary_category": (ordered[0] if ordered else "Other"),
                      "service_categories": ("; ".join(ordered) if ordered else "Other"),
                      "address": clean_addr(c["address"]), "latitude": c["latitude"], "longitude": c["longitude"],
                      "mappable": "1" if ck else "0", "geocode_precision": "exact" if ck else "",
                      "phone": "", "website": "", "email": "",
                      "hours": c.get("hours", ""), "services": "", "sources": src,
                      "legacy_center_id": c["center_id"]})
            added += 1

    # 2b. collapse same-org near-duplicates (same distinctive name within ~400m,
    #     e.g. a hospital geocoded twice in the open data). Keep the richer row.
    from collections import defaultdict
    groups = defaultdict(list)
    for k, r in master.items():
        if distinctive(norm(r["name"])):
            groups[norm(r["name"])].append(k)
    collapsed = 0
    for keys in groups.values():
        if len(keys) < 2:
            continue
        keys.sort(key=lambda k: (master[k]["sources"] != "211", master[k]["services"] == ""))  # richest first
        base = master[keys[0]]
        for k in keys[1:]:
            r = master[k]
            try:
                near = haversine_km(float(base["latitude"]), float(base["longitude"]),
                                    float(r["latitude"]), float(r["longitude"])) < 0.4
            except ValueError:
                near = False
            if near:
                base["sources"] = "; ".join(sorted(set(base["sources"].split("; ")) | set(r["sources"].split("; "))))
                lids = [x for x in [base["legacy_center_id"], r["legacy_center_id"]] if x]
                base["legacy_center_id"] = "; ".join(dict.fromkeys(lids))
                del master[k]
                collapsed += 1

    # 3. assign each mappable service to its MVP area
    polys = load_polys()
    areas = pd.read_csv(AREAS, dtype=str).fillna("").to_dict("records")
    assigned = 0
    for row in master.values():
        if row["mappable"] == "1":
            aid, bor = assign_area(float(row["latitude"]), float(row["longitude"]), polys, areas)
            row["area_id"], row["borough_name"] = aid, bor
            assigned += 1 if aid else 0
        else:
            row["area_id"], row["borough_name"] = "", ""

    cols = ["service_id", "name", "primary_category", "service_categories", "address",
            "latitude", "longitude", "mappable", "geocode_precision", "area_id", "borough_name",
            "phone", "website", "email", "hours", "services", "sources", "legacy_center_id"]
    df = pd.DataFrame(list(master.values()))[cols]
    # Drop name-only entries (PDF cross-reference / sub-program stubs with no
    # address, phone, website, email, services, or coordinates): not actionable.
    usable = df[["address", "phone", "website", "email", "services", "latitude"]].apply(
        lambda r: any(str(v).strip() for v in r), axis=1)
    dropped_empty = int((~usable).sum())
    df = df[usable].sort_values("name").reset_index(drop=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT, index=False)

    n = len(df)
    print(f"services_master: {n} unique services -> {OUT}")
    print(f"  from 211 directory:            {len(sd)}")
    print(f"  open-data centers merged (dedup): {merged}")
    print(f"  open-data centers added new:      {added}")
    print(f"  park amenities skipped (not orgs): {skipped}")
    print(f"  name-only stubs dropped (no data): {dropped_empty}")
    print(f"  located: {(df['mappable']=='1').sum()}  (exact {(df['geocode_precision']=='exact').sum()}, "
          f"approximate {(df['geocode_precision']=='approximate').sum()})   assigned to an MVP area: {assigned}")
    print(f"  duplicate service_id: {df['service_id'].duplicated().sum()}   duplicate names: {df['name'].duplicated().sum()}")


if __name__ == "__main__":
    main()
