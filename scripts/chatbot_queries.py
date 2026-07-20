"""Grounded query layer for the Community Radar chatbot. Every function returns
(answer_text, source) where `source` names the exact database table(s) the answer
came from, so the chatbot can always show where its information is from.

Reads the shared Supabase database if DATABASE_URL is set, otherwise the local
SQLite build. SQL uses :named params and LOWER() so it runs on both.
"""
import os
import re
import sqlite3
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQLITE = ROOT / "data" / "community_radar.sqlite"

# One of the app's 5 filter categories -> (need label used in the visit/demand
# tables, primary_category used in the services table).
CATEGORIES = {
    "shelter": ("Housing & Shelter", "Shelter"),
    "housing": ("Housing & Shelter", "Shelter"),
    "homeless": ("Housing & Shelter", "Shelter"),
    "food": ("Food Support", "Food"),
    "medical": ("Mental Health", "Medical"),
    "health": ("Mental Health", "Medical"),
    "mental": ("Mental Health", "Medical"),
    "clinic": ("Mental Health", "Medical"),
    "legal": ("Legal Aid", "Legal"),
    "translation": ("Language Access", "Translation"),
    "language": ("Language Access", "Translation"),
    "interpret": ("Language Access", "Translation"),
    "employment": ("Employment", "Employment & Income"),
    "job": ("Employment", "Employment & Income"),
}


def rows(sql, params=None):
    params = params or {}
    url = os.environ.get("DATABASE_URL")
    if url:
        from sqlalchemy import create_engine, text
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        with create_engine(url).connect() as c:
            return [tuple(r) for r in c.execute(text(sql), params)]
    conn = sqlite3.connect(SQLITE)
    try:
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()


def _fold(s):
    return unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()


def _is_true(col):
    # serves_* is boolean in Postgres/Supabase but integer 0/1 in the local SQLite build.
    return f"{col} = TRUE" if os.environ.get("DATABASE_URL") else f"{col} = 1"


def find_audience(q):
    """Detect who a question is about: Indigenous / immigrant / gender / age band."""
    ql = _fold(q)
    a = {}
    if any(w in ql for w in ("indigenous", "autochtone", "aboriginal", "first nation", "inuit", "metis")):
        a["indigenous"] = True
    if any(w in ql for w in ("immigrant", "newcomer", "refugee", "migrant", "nouvel arrivant", "asylum")):
        a["immigrant"] = True
    if any(w in ql for w in ("women", "woman", "female", "girls", "mother")):
        a["gender"] = "Female"
    elif re.search(r"\b(men|male|boys|fathers?)\b", ql):
        a["gender"] = "Male"
    if any(w in ql for w in ("youth", "young", "teen", "children", "kids", "adolescent")):
        a["age"] = "Under 25"
    elif any(w in ql for w in ("senior", "elderly", "older adult", "aine")):
        a["age"] = "65+"
    return a


def find_category(q):
    ql = _fold(q)
    for kw, pair in CATEGORIES.items():
        if kw in ql:
            return pair            # (need_label, service_category)
    return None


def find_area(q):
    """Return (area_id, area_name) if the question names one of the 12 areas."""
    ql = _fold(q)
    for area_id, name in rows("SELECT area_id, area_name FROM area_profile"):
        toks = [t for t in _fold(name).split("-") if len(t) > 3]
        if _fold(name) in ql or (toks and all(t in ql for t in toks)):
            return area_id, name
    return None


# ---------------------------------------------------------------- answers ----
def visits_in_area(cat, need, area):
    area_id, name = area
    r = rows("SELECT encounter_count FROM observed_need_category_summary "
             "WHERE area_id=:a AND LOWER(key_need)=LOWER(:n)", {"a": area_id, "n": need})
    total = r[0][0] if r else 0
    return (f"In {name}, about {total:,} recorded visits were for {cat.lower()} services "
            f"(need category: {need}).",
            "observed_need_category_summary (synthetic visit/usage data)")


def top_centers(cat, need):
    r = rows("SELECT center_name, SUM(k_anon_count) v FROM v_visit_needs_by_center "
             "WHERE LOWER(key_need)=LOWER(:n) GROUP BY center_name ORDER BY v DESC LIMIT 5",
             {"n": need})
    if not r:
        return (f"No visit records are tagged to {cat.lower()} centres.", "v_visit_needs_by_center")
    lst = "\n".join(f"  {i}. {nm} ({int(v):,} visits)" for i, (nm, v) in enumerate(r, 1))
    return (f"Centres receiving the most visitors for {cat.lower()} needs:\n{lst}",
            "v_visit_needs_by_center (synthetic visits joined to database_center)")


def demand_by_area(cat, need):
    r = rows("SELECT ap.area_name, s.encounter_count FROM observed_need_category_summary s "
             "JOIN area_profile ap ON ap.area_id=s.area_id WHERE LOWER(s.key_need)=LOWER(:n) "
             "ORDER BY s.encounter_count DESC LIMIT 5", {"n": need})
    if not r:
        return (f"No demand is recorded for {cat.lower()}.", "observed_need_category_summary")
    lst = "\n".join(f"  {i}. {nm} ({int(c):,} visits)" for i, (nm, c) in enumerate(r, 1))
    return (f"Areas with the highest demand for {cat.lower()} services:\n{lst}",
            "observed_need_category_summary + area_profile (synthetic demand)")


def unmet(cat, need, service_cat):
    demand = dict(rows("SELECT area_id, encounter_count FROM observed_need_category_summary "
                       "WHERE LOWER(key_need)=LOWER(:n)", {"n": need}))
    supply = dict(rows("SELECT area_id, COUNT(*) FROM services_master "
                       "WHERE LOWER(primary_category)=LOWER(:c) AND area_id<>'' GROUP BY area_id",
                       {"c": service_cat}))
    names = dict(rows("SELECT area_id, area_name FROM area_profile"))
    scored = sorted(((d - 8 * supply.get(a, 0), a, d, supply.get(a, 0)) for a, d in demand.items()),
                    reverse=True)[:5]
    lst = "\n".join(f"  {i}. {names.get(a, a)} (demand {int(d):,}, only {s} {cat.lower()} services)"
                    for i, (_, a, d, s) in enumerate(scored, 1))
    return (f"Areas that most need additional {cat.lower()} resources (high demand, few services):\n{lst}",
            "observed_need_category_summary (demand) + services_master (supply)")


def query_services(mode, service_cat=None, area=None, aud=None, limit=20):
    """List or count organizations in services_master, filtered by any of:
    category, area, and audience (Indigenous / immigrant / gender / age)."""
    aud = aud or {}
    conds, params, labels = [], {}, []
    if service_cat:
        conds.append("LOWER(primary_category)=LOWER(:c)"); params["c"] = service_cat
        labels.append(service_cat.lower())
    if aud.get("indigenous"):
        conds.append(_is_true("serves_indigenous")); labels.append("Indigenous-serving")
    if aud.get("immigrant"):
        conds.append(_is_true("serves_immigrant")); labels.append("immigrant and newcomer")
    if aud.get("gender"):
        conds.append("LOWER(gender_focus)=LOWER(:g)"); params["g"] = aud["gender"]
        labels.append(f"{aud['gender'].lower()}-focused")
    if aud.get("age"):
        # Age-focused orgs only: exclude the all-ages default so "for seniors" is meaningful.
        conds.append("age_groups LIKE :ag AND age_groups <> :allages")
        params["ag"] = f"%{aud['age']}%"
        params["allages"] = "Under 25; 25-44; 45-64; 65+"
        labels.append(f"{aud['age']}-focused")
    area_txt = ""
    if area:
        aid, name = area; conds.append("area_id=:a"); params["a"] = aid; area_txt = f" in {name}"
    where = " AND ".join(conds) if conds else "1=1"
    desc = (" ".join(labels) + " organizations").strip()
    src = "services_master (real 211 + open-data services)"
    total = rows(f"SELECT COUNT(*) FROM services_master WHERE {where}", params)[0][0]
    if mode == "count":
        return (f"There are {total} {desc}{area_txt}.", src)
    r = rows(f"SELECT name, phone FROM services_master WHERE {where} ORDER BY name LIMIT {int(limit)}", params)
    if not r:
        return (f"There are no {desc}{area_txt} in the directory.", src)
    lines = "\n".join(f"  - {nm}" + (f"  ({' '.join(str(ph).split())})" if ph and str(ph).strip() else "")
                      for nm, ph in r)
    more = f"\n  ...and {total - int(limit)} more" if total > int(limit) else ""
    return (f"{desc[:1].upper()}{desc[1:]}{area_txt} ({total} total):\n{lines}{more}", src)


INDICATORS = {   # question keyword -> (area_profile column, human label)
    "income": ("income_indicator", "income pressure"),
    "immigra": ("immigration_indicator", "immigrant concentration"),
    "newcomer": ("immigration_indicator", "immigrant concentration"),
    "language": ("language_indicator", "language-access need"),
    "housing": ("housing_indicator", "housing pressure"),
    "population": ("population", "population"),
}


def area_stats(area):
    aid, name = area
    r = rows("SELECT population, income_indicator, immigration_indicator, language_indicator, "
             "housing_indicator, vulnerability_score FROM area_profile WHERE area_id=:a", {"a": aid})
    if not r:
        return (f"No profile is available for {name}.", "area_profile")
    pop, inc, imm, lang, hou, vul = r[0]
    return (f"{name} (census-based profile):\n"
            f"  Population: about {int(pop):,}\n"
            f"  Vulnerability: {float(vul):.0f}/100\n"
            f"  Pressure indicators (0-100): income {inc}, immigrant concentration {imm}, "
            f"language-access need {lang}, housing {hou}",
            "area_profile (real, census-based)")


def rank_areas_by(column, label, ascending=False):
    order = "ASC" if ascending else "DESC"
    r = rows(f"SELECT area_name, {column} FROM area_profile ORDER BY {column} {order} LIMIT 5")
    lst = "\n".join(f"  {i}. {nm} ({v})" for i, (nm, v) in enumerate(r, 1))
    hi = "lowest" if ascending else "highest"
    return (f"Areas with the {hi} {label}:\n{lst}", "area_profile (real, census-based)")


def total_services():
    n = rows("SELECT COUNT(*) FROM services_master")[0][0]
    return (f"There are {n} organizations in the services directory.",
            "services_master (real 211 + open-data services)")


def most_vulnerable():
    r = rows("SELECT area_name, vulnerability_score FROM area_profile ORDER BY vulnerability_rank LIMIT 5")
    lst = "\n".join(f"  {i}. {nm} (vulnerability {float(sc):.0f}/100)" for i, (nm, sc) in enumerate(r, 1))
    return (f"The most vulnerable areas (structural vulnerability from census data):\n{lst}",
            "area_profile / area_vulnerability_index_real (real, census-based)")


def highest_gap():
    r = rows("SELECT area_name, gap_score, priority_flag FROM gap_score ORDER BY gap_rank LIMIT 5")
    lst = "\n".join(f"  {i}. {nm} (gap {float(g):.0f})" + (f" - {pf}" if pf else "")
                    for i, (nm, g, pf) in enumerate(r, 1))
    return (f"The areas with the largest service gap (high need, low access):\n{lst}", "gap_score")


def explain_area(area):
    aid, name = area
    v = rows("SELECT vulnerability_score, vulnerability_rank, top_vulnerability_drivers "
             "FROM area_profile WHERE area_id=:a", {"a": aid})
    g = rows("SELECT gap_score, gap_rank, priority_flag FROM gap_score WHERE area_id=:a", {"a": aid})
    n = rows("SELECT top_key_needs FROM observed_need_index WHERE area_id=:a", {"a": aid})
    parts = [f"{name}:"]
    if v:
        vs, vr, drv = v[0]
        parts.append(f"  Vulnerability {float(vs):.0f}/100 (rank {vr} of 12). Main drivers: {drv}.")
    if g:
        gs, gr, pf = g[0]
        parts.append(f"  Service gap {float(gs):.0f} (rank {gr})" + (f", {pf}." if pf else "."))
    if n and n[0][0]:
        parts.append(f"  Most reported needs: {n[0][0]}.")
    return ("\n".join(parts), "area_profile + gap_score + observed_need_index")


def visits_total(cat, need):
    r = rows("SELECT SUM(encounter_count) FROM observed_need_category_summary "
             "WHERE LOWER(key_need)=LOWER(:n)", {"n": need})
    total = (r[0][0] or 0) if r else 0
    return (f"Across Montreal, about {int(total):,} recorded visits were for {cat.lower()} services "
            f"(need category: {need}).",
            "observed_need_category_summary (synthetic visit/usage data)")


def top_needs(area):
    area_id, name = area
    r = rows("SELECT top_key_needs FROM observed_need_index WHERE area_id=:a", {"a": area_id})
    if not r or not r[0][0]:
        return (f"No demand summary is available for {name}.", "observed_need_index")
    return (f"The most reported needs in {name} are: {r[0][0]}.",
            "observed_need_index (synthetic demand summary)")


def language_need(area=None):
    if area:
        area_id, name = area
        r = rows("SELECT encounter_count FROM observed_need_category_summary "
                 "WHERE area_id=:a AND key_need='Language Access'", {"a": area_id})
        n, where = (r[0][0] if r else 0), f"in {name}"
    else:
        r = rows("SELECT SUM(encounter_count) FROM observed_need_category_summary "
                 "WHERE key_need='Language Access'")
        n, where = (r[0][0] or 0), "across Montreal"
    return (f"About {int(n):,} recorded visits {where} needed language or interpretation support. "
            "Note: the data records whether language help was needed, not the specific language, so "
            "it shows where interpreters are most in demand but not the individual languages.",
            "observed_need_category_summary + database_visitor_tag.language_need_flag (synthetic)")


def not_collected(topic):
    return (f"That information ({topic}) is not collected in the current database, so I will not guess. "
            "The database covers services, visit volumes by area and need category, and vulnerability "
            "and gap scores.",
            "n/a (data not available)")
