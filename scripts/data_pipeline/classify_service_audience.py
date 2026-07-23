"""Best-effort, no-LLM classification of WHO each service serves, for the app's
audience filters:
    group:  serves_indigenous (0/1), serves_immigrant (0/1)   [independent flags]
    gender: gender_focus in {All, Female, Male}
    age:    age_groups, a subset of {Under 25, 25-44, 45-64, 65+}

Keyword matching on the org name + services description (accent-folded, word
boundaries). Conservative: an org is tagged for a group / a gender / a specific
age band only on a clear signal; with no signal it defaults to the general public
(gender=All, all four age bands).

This is a STANDALONE side table keyed by service_id so it does not change the
migrated services_master schema (the Supabase loader validates columns). Fold the
columns into services_master + a migration when the filters are wired up.

Reads:  data/processed/services_master.csv
Writes: data/processed/services_master_audience.csv
"""
from pathlib import Path
import re
import unicodedata

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "processed" / "services_master.csv"
OUT = ROOT / "data" / "processed" / "services_master_audience.csv"


def fold(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return " " + re.sub(r"\s+", " ", s) + " "


INDIGENOUS = re.compile(r"\b(indigenous|autochtones?|aboriginal|first nations?|premieres? nations?|inuit|metis)\b")
IMMIGRANT = re.compile(r"\b(immigrants?|immigration|newcomers?|nouvel? arrivante?s?|nouveaux arrivants|refugees?|refugies?|asylum|asile|migrants?|multicultural|ethnocultural|allophones?)\b|cultural communit|settlement service")
FEMALE = re.compile(r"\b(women|woman|femmes?|feminine?|feminist|girls?|filles?|mothers?|meres?|maternal|maternite|pregnant|enceinte)\b")
# "pere"/"peres" alone matches places named after a priest (Bibliothèque Père-Ambroise),
# so require a father-serving context instead.
MALE = re.compile(r"\b(men|mens|hommes|fathers?|boys|garcons|paternite)\b|\bmale\b|peres de famille|aux peres|soutien aux peres|pour hommes")
YOUTH = re.compile(r"\b(youth|jeunes?|teens?|adolescents?|child|children|enfants?|kids|young|students?|etudiants?|daycare|garderie|toddlers?|newborns?|perinatal|school)\b|day camp|summer camp|tutoring|homework")
SENIOR = re.compile(r"\b(seniors?|aines?|elderly|elders?|retired|retraites?|aged|aging)\b|age d'or|old age|loss of autonomy|perte d'autonomie|65 ans|65\+")
ADULT = re.compile(r"\b(adults?|adultes?|employment|emploi|jobs?|workers?|workforce|employability)\b")

AGE_ORDER = ["Under 25", "25-44", "45-64", "65+"]


def classify_audience(name, services="", categories=""):
    hay = fold(f"{services} {name} {categories}")
    fem, mal = bool(FEMALE.search(hay)), bool(MALE.search(hay))
    gender = "Female" if fem and not mal else "Male" if mal and not fem else "All"
    ages = set()
    if YOUTH.search(hay):
        ages.add("Under 25")
    if SENIOR.search(hay):
        ages.add("65+")
    if ADULT.search(hay):
        ages.update({"25-44", "45-64"})
    if not ages:                                  # no signal -> general public
        ages = set(AGE_ORDER)
    return {
        "serves_indigenous": int(bool(INDIGENOUS.search(hay))),
        "serves_immigrant": int(bool(IMMIGRANT.search(hay))),
        "gender_focus": gender,
        "age_groups": "; ".join(a for a in AGE_ORDER if a in ages),
    }


def main():
    d = pd.read_csv(SRC, dtype=str).fillna("")
    rows = []
    for _, r in d.iterrows():
        a = classify_audience(r["name"], r.get("services", ""), r.get("service_categories", ""))
        rows.append({"service_id": r["service_id"], "name": r["name"],
                     "primary_category": r["primary_category"], **a})
    out = pd.DataFrame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)

    n = len(out)
    print(f"services_master_audience: {n} services -> {OUT}\n")
    print(f"  serves_indigenous: {int(out['serves_indigenous'].astype(int).sum())}")
    print(f"  serves_immigrant:  {int(out['serves_immigrant'].astype(int).sum())}")
    print("  gender focus:")
    for g, c in out["gender_focus"].value_counts().items():
        print(f"    {g:8} {c}")
    print("  age bands (orgs tagged for each):")
    for band in AGE_ORDER:
        print(f"    {band:9} {out['age_groups'].str.contains(re.escape(band)).sum()}")
    print(f"  serve a specific age band only (not general public): "
          f"{(out['age_groups'] != '; '.join(AGE_ORDER)).sum()}")


if __name__ == "__main__":
    main()
