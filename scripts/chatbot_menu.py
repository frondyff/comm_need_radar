"""Guided (decision-tree) version of the Community Radar assistant.

Instead of typing free text, the user picks from menus. Every leaf calls the same
grounded query functions in chatbot_queries.py, so answers stay accurate and show
their source table, and the user can only ask what the data can actually answer
(no misroutes, nothing to decline).

Two ways to use it:
  - Interactive menu:   python scripts/chatbot_menu.py
  - Structured call (for the frontend's buttons/dropdowns):
        from chatbot_menu import answer_structured
        answer_structured("find_services", category="Shelter", area="Verdun",
                          audience={"immigrant": True})
"""
import sys

import chatbot_queries as q

BACK = "__back__"

CATEGORY_OPTS = [("Shelter", "shelter"), ("Food", "food"), ("Medical", "medical"),
                 ("Legal", "legal"), ("Translation", "translation")]
GROUP_OPTS = [("Anyone", {}), ("Indigenous people", {"indigenous": True}),
              ("Immigrants / newcomers", {"immigrant": True}), ("Women", {"gender": "Female"}),
              ("Youth (under 25)", {"age": "Under 25"}), ("Seniors (65+)", {"age": "65+"})]


def _areas(all_option=True):
    opts = [(name, (aid, name)) for aid, name in
            q.rows("SELECT area_id, area_name FROM area_profile ORDER BY area_name")]
    return opts + ([("All of Montreal", None)] if all_option else [])


def _area_tuple(name):
    if not name:
        return None
    r = q.rows("SELECT area_id, area_name FROM area_profile WHERE LOWER(area_name)=LOWER(:n)",
               {"n": name})
    return (r[0][0], r[0][1]) if r else None


def _service_cat(category):
    if not category:
        return None
    return q.CATEGORIES.get(category.lower(), (None, category))[1]


# ------------------------------------------------------- structured entry ----
def answer_structured(intent, category=None, area=None, audience=None, metric=None):
    """Map a set of menu selections to a grounded query. Returns (answer, source)."""
    at = _area_tuple(area) if area else None
    if intent == "find_services":
        return q.query_services("list", _service_cat(category), at, audience or {})
    if intent == "demand" and category:
        need, sc = q.CATEGORIES[category.lower()]
        if metric == "visits":
            return q.visits_in_area(sc, need, at) if at else q.visits_total(sc, need)
        if metric == "demand":
            return q.demand_by_area(sc, need)
        if metric == "centres":
            return q.top_centers(sc, need)
        if metric == "unmet":
            return q.unmet(sc, need, sc)
    if intent == "area_info" and at:
        return {"overview": q.explain_area, "demographics": q.area_stats,
                "needs": q.top_needs, "demand": q.area_demand}.get(metric, q.explain_area)(at)
    if intent == "ranking":
        if metric == "vulnerable":
            return q.most_vulnerable()
        if metric == "gap":
            return q.highest_gap()
        if metric == "immigrants":
            return q.rank_areas_by("immigration_indicator", "immigrant concentration")
        if metric == "income_low":
            return q.rank_areas_by("income_indicator", "income pressure", ascending=True)
        if metric == "housing":
            return q.rank_areas_by("housing_indicator", "housing pressure")
    return ("That selection is not available.", "n/a")


# --------------------------------------------------------- interactive CLI ---
def pick(prompt, options):
    print("\n" + prompt)
    for i, (label, _) in enumerate(options, 1):
        print(f"  {i}. {label}")
    print("  (b = back)")
    while True:
        s = input("> ").strip().lower()
        if s in ("b", "back", "q", "quit", "exit"):
            return BACK
        if s.isdigit() and 1 <= int(s) <= len(options):
            return options[int(s) - 1][1]
        print("Please enter a number from the list.")


def show(result):
    text, source = result
    print("\n" + text)
    print(f"\n\U0001F4CA Source (table): {source}")


def _find():
    cat = pick("Which service category?", CATEGORY_OPTS + [("Any category", None)])
    if cat is BACK:
        return
    area = pick("Which area?", _areas())
    if area is BACK:
        return
    grp = pick("For a specific group?", GROUP_OPTS)
    if grp is BACK:
        return
    sc = q.CATEGORIES[cat][1] if cat else None
    show(q.query_services("list", sc, area, grp))


def _demand():
    cat = pick("Which service category?", CATEGORY_OPTS)
    if cat is BACK:
        return
    need, sc = q.CATEGORIES[cat]
    metric = pick("What would you like?", [
        ("Total visits in an area", "visits"),
        ("Which areas have the highest demand", "demand"),
        ("Which centres get the most visitors", "centres"),
        ("Which areas need more of this service", "unmet")])
    if metric is BACK:
        return
    if metric == "visits":
        area = pick("Which area?", _areas())
        if area is BACK:
            return
        show(q.visits_in_area(sc, need, area) if area else q.visits_total(sc, need))
    elif metric == "demand":
        show(q.demand_by_area(sc, need))
    elif metric == "centres":
        show(q.top_centers(sc, need))
    elif metric == "unmet":
        show(q.unmet(sc, need, sc))


def _area():
    area = pick("Which area?", _areas(all_option=False))
    if area is BACK:
        return
    metric = pick("What about it?", [
        ("Overview (vulnerability, gap, needs)", "overview"),
        ("Demographics (population, income, immigration)", "demographics"),
        ("Top reported needs", "needs"),
        ("Total service demand", "demand")])
    if metric is BACK:
        return
    show({"overview": q.explain_area, "demographics": q.area_stats,
          "needs": q.top_needs, "demand": q.area_demand}[metric](area))


def _rank():
    metric = pick("Rank the areas by:", [
        ("Most vulnerable", "vulnerable"), ("Highest service gap", "gap"),
        ("Most immigrants", "immigrants"), ("Lowest income", "income_low"),
        ("Highest housing pressure", "housing")])
    if metric is BACK:
        return
    show(answer_structured("ranking", metric=metric))


def menu():
    print("Community Radar assistant (guided). Pick a number.")
    while True:
        choice = pick("What would you like to know?", [
            ("Find services / organizations", "find"),
            ("Service demand and visits", "demand"),
            ("About an area", "area"),
            ("City-wide rankings", "rank"),
            ("Quit", "quit")])
        if choice in (BACK, "quit"):
            print("Goodbye.")
            return
        {"find": _find, "demand": _demand, "area": _area, "rank": _rank}[choice]()


if __name__ == "__main__":
    try:
        menu()
    except (EOFError, KeyboardInterrupt):
        pass
