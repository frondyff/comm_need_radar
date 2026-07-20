"""Community Radar chatbot -- simple, grounded, no-LLM.

Matches keywords in a question, calls the right database query, and formats a
plain-language answer with a "Source" line naming the exact table(s) the answer
came from. No API key, no cost, no hallucination: every answer comes straight
from the project database, and questions outside scope or with no data are
declined honestly.

Usage:
    from scripts.chatbot import answer
    print(answer("Which areas have the highest demand for shelter services?"))

    python scripts/chatbot.py --chat        # interactive
    python scripts/chatbot.py "How many people received food assistance in Verdun?"
"""
import sys

import chatbot_queries as q

# Out-of-scope guardrail: refuse politely instead of guessing.
REFUSE = ("weather", "stock", "invest", "medical advice", "diagnos", "prescri", "joke",
          "recipe", "translate this", "who are you", "your name", "politic")

# Data the database does not collect -> answered honestly, not guessed.
NOT_COLLECTED = {
    "occupancy": "occupancy or capacity rates",
    "capacity": "occupancy or capacity rates",
    "what days": "day-of-week demand",
    "which days": "day-of-week demand",
    "resolve": "average case-resolution time",
    "resolution": "average case-resolution time",
    "how long": "average case-resolution time",
}


def _format(answer_source):
    text, source = answer_source
    return f"{text}\n\n\U0001F4CA Source (table): {source}"


def answer(question: str) -> str:
    ql = question.lower().strip()
    if not ql:
        return "Ask me about services, visits, demand, or gaps by area and category."

    if any(w in ql for w in REFUSE):
        return ("I can only answer questions about Montreal community services, service demand, and "
                "the vulnerability and gap scores in this project's database.")

    for kw, topic in NOT_COLLECTED.items():
        if kw in ql:
            return _format(q.not_collected(topic))

    cat = q.find_category(question)      # (need_label, service_category) or None
    area = q.find_area(question)         # (area_id, name) or None
    aud = q.find_audience(question)      # {'indigenous','immigrant','gender','age'} subset

    # 1. Specific-language questions: honestly cannot rank individual languages.
    if any(p in ql for p in ("which language", "what language", "which languages",
                             "what languages")) or ("language" in ql and "priorit" in ql):
        base = q.language_need(area)
        return _format((base[0] + " So I cannot rank specific languages, only the overall need.", base[1]))

    # 2. Vulnerability / gap / area profile. A named area gets its own numbers,
    #    not the ranking.
    if "vulnerab" in ql:
        return _format(q.explain_area(area) if area else q.most_vulnerable())
    if "gap" in ql:
        return _format(q.explain_area(area) if area else q.highest_gap())
    if any(w in ql for w in ("priority area", "underserved", "least served", "most in need")):
        return _format(q.highest_gap())
    if area and not cat and not aud and any(w in ql for w in ("tell me about", "explain", "profile",
                                                              "overview", "summary", "how vulnerable")):
        return _format(q.explain_area(area))

    # 3. Area demographics from the census profile, only when the question is about
    #    the AREA (population / income / immigration / housing), not services for a group.
    asking_services = any(w in ql for w in ("organization", "orgs", "service", "list", "show me",
                                            "banks", "clinic", "help"))
    if not asking_services:
        if ("demographic" in ql or "census" in ql) and area:
            return _format(q.area_stats(area))
        demo = next(((col, lbl) for kw, (col, lbl) in q.INDICATORS.items() if kw in ql), None)
        if demo:
            if any(w in ql for w in ("which area", "most", "highest", "lowest", "least", "rank")):
                asc = any(w in ql for w in ("lowest", "least"))
                return _format(q.rank_areas_by(demo[0], demo[1], asc))
            if area:
                return _format(q.area_stats(area))

    # 4. Total number of services.
    if not cat and not aud and not area and any(w in ql for w in ("in total", "total number",
                                                                  "how many services", "how many organizations")):
        return _format(q.total_services())

    # 5. Visit / demand numbers (require a service category).
    VISIT = ("demand", "visited", "visits", "request", "received", "submitted", "unmet", "additional",
             "need more", "most visitor", "most client", "most people", "people received",
             "greatest need", "need the most", "most need")
    if any(w in ql for w in VISIT) or (cat and ("area" in ql or "region" in ql) and "need" in ql):
        if cat is None:
            return ("For visit or demand numbers, please name a category: shelter, food, medical, "
                    "legal, or translation.")
        need, label = cat
        if any(w in ql for w in ("most visitor", "most client", "most people", "receive the most",
                                 "serve the most")):
            return _format(q.top_centers(label, need))
        if any(w in ql for w in ("unmet", "additional", "need more")):
            return _format(q.unmet(label, need, label))
        if any(w in ql for w in ("highest demand", "greatest", "most demand", "which area",
                                 "which region", "highest need", "need the most", "most need", "need")):
            return _format(q.demand_by_area(label, need))
        return _format(q.visits_in_area(label, need, area) if area else q.visits_total(label, need))

    # 6. Service catalog: list or count organizations by category / audience / area.
    if cat or aud or area:
        service_cat = cat[1] if cat else None
        if area and not cat and not aud and any(w in ql for w in ("need", "common", "frequent", "top")):
            return _format(q.top_needs(area))
        wants_count = any(w in ql for w in ("how many", "number of", "count", "how much"))
        return _format(q.query_services("count" if wants_count else "list", service_cat, area, aud))

    # 5. Nothing recognized.
    return ("I can answer questions like:\n"
            "  - List all shelters in Verdun / organizations for Indigenous people\n"
            "  - How many food organizations serve immigrants in Cote-des-Neiges?\n"
            "  - Which areas have the highest demand for legal services?\n"
            "  - Which areas are most vulnerable / have the highest service gap?\n"
            "  - Tell me about Hochelaga\n"
            "Name a category (shelter, food, medical, legal, translation), a group, or an area.")


def chat():
    print("Community Radar assistant. Ask about services, demand, or gaps. Type 'quit' to exit.\n")
    while True:
        try:
            question = input("you > ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if question.lower() in ("quit", "exit", "q"):
            break
        if question:
            print("\n" + answer(question) + "\n")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--chat":
        chat()
    elif args:
        print(answer(" ".join(args)))
    else:
        chat()
