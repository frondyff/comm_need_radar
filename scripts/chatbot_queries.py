"""Grounded query backbone for the Community Radar chatbot.

Each function answers one of the assistant's supported questions using ONLY the
project database, so every answer is grounded in real data (no hallucination).
The chatbot UI, or an LLM tool-calling layer, simply calls these functions.

Connection: reads DATABASE_URL from .env (shared Supabase) if present, otherwise
falls back to the local SQLite database.

Usage:
    from scripts.chatbot_queries import top_gap_areas, explain_area, services_near
    top_gap_areas(5)
    explain_area("A001")
    services_near(45.5017, -73.5673, radius_km=1.0, category="Food Support")
"""
from pathlib import Path
import math
import os

import pandas as pd
import sqlalchemy
from sqlalchemy import text

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

BASE = Path(__file__).resolve().parents[1]


def _engine():
    url = os.environ.get("DATABASE_URL")
    if url:
        return sqlalchemy.create_engine(url.replace("postgres://", "postgresql://", 1))
    return sqlalchemy.create_engine(f"sqlite:///{BASE / 'data' / 'community_radar.sqlite'}")


def _q(sql, **params):
    with _engine().connect() as c:
        return pd.read_sql(text(sql), c, params=params)


# ── V2 planner questions ──────────────────────────────────────────────────────

def top_gap_areas(n: int = 10) -> pd.DataFrame:
    """Which areas have the highest gap / priority scores."""
    return _q("""select gap_rank, area_name, borough_name, priority_flag, gap_score
                 from gap_score order by gap_rank limit :n""", n=n)


def most_vulnerable_areas(n: int = 10) -> pd.DataFrame:
    """Which areas are most vulnerable, and the top concern for each."""
    return _q("""select vulnerability_rank, area_name, borough_name,
                        vulnerability_index, mvp_focus_top_concern
                 from area_vulnerability_index_real
                 order by vulnerability_rank limit :n""", n=n)


def explain_area(area_id: str) -> dict:
    """Why is this area high-gap: vulnerability + drivers + service coverage."""
    v = _q("select * from area_vulnerability_index_real where area_id = :a", a=area_id)
    g = _q("select gap_score, gap_rank, priority_flag from gap_score where area_id = :a", a=area_id)
    svc = _q("""select count(*) n from center_area_lookup where area_id = :a""", a=area_id)
    if v.empty:
        return {"error": f"No area {area_id}"}
    r = v.iloc[0]
    return {
        "area": r["area_name"],
        "borough": r["borough_name"],
        "vulnerability_index": round(float(r["vulnerability_index"]), 1),
        "vulnerability_rank": int(r["vulnerability_rank"]),
        "top_concern": r["mvp_focus_top_concern"],
        "gap_score": None if g.empty else round(float(g.iloc[0]["gap_score"]), 1),
        "priority_flag": None if g.empty else g.iloc[0]["priority_flag"],
        "services_in_area": int(svc.iloc[0]["n"]),
    }


def vulnerability_drivers(area_id: str) -> dict:
    """Which indicators contribute most to the vulnerability score for an area."""
    v = _q("""select low_income_pct, seniors_65plus_pct, recent_immigrant_pct,
                     no_official_language_pct, shelter_cost_burden_pct
              from area_vulnerability_index_real where area_id = :a""", a=area_id)
    if v.empty:
        return {"error": f"No area {area_id}"}
    row = v.iloc[0].to_dict()
    labels = {"low_income_pct": "income poverty", "seniors_65plus_pct": "seniors",
              "recent_immigrant_pct": "recent immigrants",
              "no_official_language_pct": "language barrier",
              "shelter_cost_burden_pct": "housing cost burden"}
    ranked = sorted(row.items(), key=lambda kv: float(kv[1] or 0), reverse=True)
    return {"drivers": [{"indicator": labels[k], "value_pct": round(float(v or 0), 1)} for k, v in ranked]}


def compare_to_city(area_id: str) -> dict:
    """Compare an area's vulnerability to the city average."""
    a = _q("select vulnerability_index from area_vulnerability_index_real where area_id = :a", a=area_id)
    city = _q("select avg(vulnerability_index) avg from area_vulnerability_index_real")
    if a.empty:
        return {"error": f"No area {area_id}"}
    av, cv = float(a.iloc[0]["vulnerability_index"]), float(city.iloc[0]["avg"])
    return {"area_vulnerability": round(av, 1), "city_average": round(cv, 1),
            "difference": round(av - cv, 1),
            "reads": "above" if av > cv else "below"}


# ── V1 frontline questions ────────────────────────────────────────────────────

def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dlam = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def services_near(lat: float, lon: float, radius_km: float = 1.0, category: str | None = None) -> pd.DataFrame:
    """Services within a radius of a location (for the frontline finder / flyer)."""
    df = _q("select center_name, service_categories, address, latitude, longitude from database_center")
    if category:
        df = df[df["service_categories"] == category]
    df["distance_km"] = df.apply(lambda r: _haversine_km(lat, lon, r["latitude"], r["longitude"]), axis=1)
    return (df[df["distance_km"] <= radius_km]
            .sort_values("distance_km")
            [["center_name", "service_categories", "address", "distance_km"]]
            .round({"distance_km": 2}))


def services_by_category() -> pd.DataFrame:
    """How many services exist per category."""
    return _q("""select service_categories, count(*) as centers
                 from database_center group by service_categories order by centers desc""")


# ── Meta questions ────────────────────────────────────────────────────────────

def gap_score_meaning() -> str:
    return ("The gap score combines how vulnerable an area is with how accessible its "
            "services are. A high gap score means high need and low service access, so "
            "the area is a higher priority. It is rescaled 0-100 and ranked across areas.")


def data_sources() -> pd.DataFrame:
    """What data sources were used (from the provenance file)."""
    p = BASE / "data" / "raw" / "source_metadata.csv"
    cols = ["dataset_name", "source_url", "license_or_use_note"]
    return pd.read_csv(p)[cols] if p.exists() else pd.DataFrame()


if __name__ == "__main__":
    print("Top 3 gap areas:\n", top_gap_areas(3).to_string(index=False))
    print("\nExplain A001:\n", explain_area("A001"))
