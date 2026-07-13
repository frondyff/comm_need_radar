"""Community Radar chatbot -- simple, grounded, no-LLM.

Matches keywords in a question, calls the right database query, and formats a
plain-language answer. No API key, no cost, no hallucination: every answer comes
straight from the project database, and questions outside the supported scope are
politely declined.

Usage:
    from scripts.chatbot import answer
    print(answer("Which areas have the highest gap?"))
    print(answer("Why is Parc Extension high-gap?"))
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import chatbot_queries as db

SOURCE = "  (Source: Community Radar database)"


# ── Guardrails: the scope's "cannot answer" list ──────────────────────────────
REFUSALS = [
    (("eligib", "qualify", "am i eligible", "do i qualify"),
     "I can't determine service eligibility. Please contact the service directly for eligibility details."),
    (("open now", "open right now", "real-time", "real time", "currently open", "hours today", "wait time"),
     "I can't give real-time availability or hours. Please call the service to confirm."),
    (("refer me", "referral", "should i go", "what should i do", "give me advice"),
     "I can't make referrals or give personal advice, but I can show you nearby services and information."),
    (("how much funding", "funding recommendation", "recommend funding", "grant", "budget should"),
     "I can't make funding recommendations. I can show vulnerability, service access, and gap data to inform decisions."),
    (("policy", "should the city", "should the government", "what law"),
     "I can't make policy decisions. I can provide the underlying vulnerability and gap data."),
    (("predict", "will this person", "this individual", "individual risk"),
     "I can't make individual-level predictions. I only work with area-level, aggregate data."),
]


def _resolve_area(text):
    """Find an area named in the question. Returns (area_id, area_name) or (None, None)."""
    areas = db._q("select area_id, area_name from area_vulnerability_index_real")
    norm = lambda s: s.lower().replace("-", " ").replace("é", "e").strip()
    t = norm(text)
    for _, r in areas.iterrows():
        if norm(r["area_name"]) in t:
            return r["area_id"], r["area_name"]
    return None, None


def _need_area():
    return "Which area do you mean? For example: Parc Extension, Cote-des-Neiges, or Saint-Michel."


# ── Answer formatting ─────────────────────────────────────────────────────────

def _fmt_top_gap(n=10):
    df = db.top_gap_areas(n)
    lines = [f"{r.gap_rank}. {r.area_name} ({r.borough_name}) — gap {r.gap_score:.1f}, {r.priority_flag}"
             for r in df.itertuples()]
    return "The highest-priority (gap) areas are:\n" + "\n".join(lines) + SOURCE


def _fmt_explain(area_id):
    d = db.explain_area(area_id)
    if "error" in d:
        return _need_area()
    return (f"{d['area']} ({d['borough']}) is ranked #{d['vulnerability_rank']} for vulnerability "
            f"(index {d['vulnerability_index']}/100). Its top concern is {d['top_concern']}. "
            f"It has {d['services_in_area']} services and a gap score of {d['gap_score']} "
            f"({d['priority_flag']})." + SOURCE)


def _fmt_drivers(area_id):
    d = db.vulnerability_drivers(area_id)
    if "error" in d:
        return _need_area()
    top = ", ".join(f"{x['indicator']} ({x['value_pct']}%)" for x in d["drivers"][:3])
    return f"The main indicators driving vulnerability here are: {top}." + SOURCE


def _fmt_compare(area_id):
    d = db.compare_to_city(area_id)
    if "error" in d:
        return _need_area()
    return (f"This area's vulnerability index is {d['area_vulnerability']}, which is "
            f"{abs(d['difference'])} points {d['reads']} the city average of {d['city_average']}." + SOURCE)


def _fmt_category():
    df = db.services_by_category()
    lines = [f"{r.service_categories}: {r.centers}" for r in df.itertuples()]
    return "Services available across the city, by category:\n" + "\n".join(lines) + SOURCE


def _fmt_sources():
    df = db.data_sources()
    if df.empty:
        return "Data sources are documented in the project's data inventory."
    names = df["dataset_name"].head(8).tolist()
    return ("This uses public data including: Statistics Canada 2021 Census, Montreal Open Data, "
            "MSSS, OpenStreetMap, and STM transit. Key datasets: " + ", ".join(names) + SOURCE)


# ── Intent routing (checked in order) ─────────────────────────────────────────
INTENTS = [
    (("data source", "where does the data", "what data", "sources used"), lambda t, a: _fmt_sources()),
    (("what does the gap", "what is the gap", "gap score mean", "meaning of gap"), lambda t, a: db.gap_score_meaning() + SOURCE),
    (("highest gap", "top gap", "priority area", "most underserved", "top 10", "top ten", "highest priority"),
     lambda t, a: _fmt_top_gap(10)),
    (("which indicator", "drivers", "contribute most", "driving", "what makes"),
     lambda t, a: _fmt_drivers(a) if a else _need_area()),
    (("compare", "city average", "vs the city", "versus"), lambda t, a: _fmt_compare(a) if a else _need_area()),
    (("why", "high-gap", "high gap", "explain"), lambda t, a: _fmt_explain(a) if a else _need_area()),
    (("what services", "how many services", "service mix", "what's lacking", "whats lacking", "lacking", "available services"),
     lambda t, a: _fmt_explain(a) if a else _fmt_category()),
]

CAPABILITIES = ("I can help with: top gap/priority areas, why an area is high-gap, which indicators drive "
                "vulnerability, comparing an area to the city average, what services exist, and what data "
                "sources were used. Try naming an area, e.g. 'Why is Parc Extension high-gap?'")


def answer(question: str, area_id: str | None = None) -> str:
    """Return a grounded answer, or a polite decline / capability hint."""
    t = question.lower().strip()
    # 1. guardrails
    for keys, msg in REFUSALS:
        if any(k in t for k in keys):
            return msg
    # 2. resolve an area if one is named (unless the UI passed one)
    if area_id is None:
        area_id, _ = _resolve_area(question)
    # 3. match an intent
    for keys, handler in INTENTS:
        if any(k in t for k in keys):
            return handler(t, area_id)
    # 4. fallback
    return CAPABILITIES


def chat():
    """Interactive terminal chat. Type a question, or 'quit' to exit."""
    print("Community Radar assistant (type 'quit' to exit)\n" + CAPABILITIES + "\n")
    while True:
        try:
            q = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if q.lower() in ("quit", "exit", "q", ""):
            break
        print("Bot:", answer(q), "\n")


if __name__ == "__main__":
    if "--chat" in sys.argv:
        chat()
        sys.exit(0)
    demo = [
        "Which areas have the highest gap scores?",
        "Show the top 10 high-gap areas.",
        "Why is Parc Extension high-gap?",
        "Which indicators contribute most to the vulnerability score in Cote-des-Neiges?",
        "What does the gap score mean?",
        "Compare Saint-Michel to the city average.",
        "What services are available?",
        "What data sources were used?",
        "Am I eligible for these services?",       # should be declined
        "Recommend how much funding to give.",     # should be declined
        "What is the weather today?",              # fallback
    ]
    for q in demo:
        print("Q:", q)
        print("A:", answer(q), "\n")
