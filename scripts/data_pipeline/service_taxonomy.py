"""Grounded, no-LLM service classifier.

Classifies each 211 organization onto a clean, fixed taxonomy the app controls,
using what the org actually DOES: its Services description text plus its name.
(The 211 PDF has no category headers in the body, so the extracted "category"
field is unreliable and is deliberately NOT used here.)

Pure keyword matching: transparent, deterministic, no model, nothing to maintain
except this dictionary. The five core categories the app already uses come first
(Shelter, Food, Medical, Legal, Translation); the rest were added because the
directory clearly needs them. An org can match several (multi-label); the
priority order below also picks the single `primary_category`, acute needs first.
Anything matching nothing is "Other".
"""

# Priority order (acute need first). Keywords are lowercase substrings matched
# against " {services description} {org name} ".
TAXONOMY = {
    "Shelter": ["shelter", "héberg", "heberg", "housing", "logement", "homeless",
                "itinér", "refuge", "lodging", "rooming", "transitional housing",
                "emergency housing", "supportive housing", "night shelter",
                "temporary accommodation", "sans-abri"],
    "Food": ["food", "aliment", "banque alimentaire", "collective kitchen", "cuisine collective",
             "food aid", "food assistance", "food security", "food distribution",
             "meal", "repas", "grocery", "épicerie", "soup kitchen", "christmas basket",
             "panier de no", "meals-on-wheels", "meals on wheels", "popote",
             "community garden", "dépannage", "collective cooking"],
    "Medical": ["health", "santé", "medical", "clinic", "cliniqu", "clsc", "psychosocial",
                "psycholog", "mental health", "santé mentale", "addiction", "dépendance",
                "toxicoman", "substance abuse", "psychiatr", "dental", "dentaire",
                "nursing", "nurse", "palliativ", "palliatif", "therap", "thérap",
                "rehabilitation", "réadaptation", "suicide", "home care", "detox"],
    "Legal": ["legal", "juridique", "aide juridique", "legal aid", "legal information",
              "rights", "droits", "courthouse", "tribunal", "advocacy", "défense des droits",
              "correctional", "offender", "consumer protection", "ombuds", "notar",
              "immigration law"],
    "Translation": ["translation", "traduction", "interpret", "interprèt", "french class",
                    "french course", "cours de fran", "francisation", "language class",
                    "language course", "second language", "langue seconde", " esl ", " fsl "],
    "Domestic Violence & Safety": ["domestic violence", "violence conjugale", "conjugal",
                                   "spousal abuse", "sexual assault", "sexual abuse",
                                   "agression sexuelle", "child abuse", "elder abuse",
                                   "victims of violence", "battered", "women's shelter",
                                   "hébergement pour femmes", "sexual violence"],
    "Immigration & Newcomers": ["immigrant", "immigration", "newcomer", "nouvel arrivant",
                                "nouveaux arrivants", "settlement service", "integration of immigrants",
                                "refugee", "réfugié", "asylum", "asile", "sponsorship",
                                "parrainage", "migrant"],
    "Employment & Income": ["employment", "emploi", "job search", "recherche d'emploi",
                            "income support", "vocational", "tax clinic", "clinique d'impôt",
                            "impôt", "budget consultation", "welfare", "aide sociale",
                            "financial assistance", "unemploy", "back to work", "job placement"],
    "Seniors": ["senior", "aîné", "elderly", "elder", "âge d'or", "age d'or", "retired",
                "retraité", "old age", "loss of autonomy", "perte d'autonomie"],
    "Youth & Family": ["youth", "jeune", "children", "enfant", "family", "famille", "parent",
                       "daycare", "garderie", "day camp", "summer camp", "tutoring", "homework",
                       "childcare", "adoption", "maternity", "maternité", "teen", "toddler"],
    "Disability": ["disabilit", "disabled", "handicap", "déficience", "deficience", "deaf",
                   "sourd", "blind", "aveugle", "hearing impair", "visually impair",
                   "wheelchair", "autism", "autis", "intellectual disab", "physical disab",
                   "braille", "audio book", "adapted book", "sign language"],
    "Education & Literacy": ["literacy", "alphabét", "tutoring", "homework", "school", "école",
                             "academic", "library", "biblioth", "reading room", "computer course",
                             "educational", "scholarship", "diploma", "vocational training",
                             "book loan", "books loan", "loan of"],
    "Material Aid": ["thrift", "clothing", "vêtement", "clothes", "furniture", "meuble",
                     "material aid", "school supplies", "friperie", "second-hand", "donation of"],
    "Indigenous": ["indigenous", "autochtone", "aboriginal", "first nation", "premières nations",
                   "inuit", "métis", "metis"],
    "Gender & LGBTQ+": ["lgbt", " gay ", "lesbian", "queer", "transgender", "two-spirit",
                        "women's center", "women's centre", "centre de femmes"],
    "Government Services": ["government service", "federal service", "provincial service",
                            "municipal service", "official document", "service canada",
                            "passport", "passeport", "birth certificate", "identity document",
                            "public safety", "police", "access to information"],
    "Transportation": ["paratransit", "transport adapté", "accompanied transport",
                       "volunteer driver", "shuttle service", "adapted transport"],
    "Community & Advocacy": ["community action", "community centre", "community center",
                             "community development", "volunteer", "bénévol", "neighbourhood",
                             "quartier", "mutual aid", "self-help", "drop-in",
                             "information and referral", "info-referral", "referral service"],
    "Recreation & Culture": ["recreation", "recreational", "loisir", "sports", "leisure",
                             "arts and culture", "cultural activities", "day camp",
                             "museum", "musée", "artistic"],
}

CORE_FIVE = ["Shelter", "Food", "Medical", "Legal", "Translation"]


def _hits(hay, kws):
    return any(k in hay for k in kws)


def classify(services_text: str, org_name: str = ""):
    """Return (list_of_matched_categories, primary_category).

    Multi-label matches on the services description + org name. For the single
    primary_category, an org's NAME is the strongest signal of its main purpose
    (e.g. "...déficience intellectuelle" -> Disability), so name matches win;
    only if the name signals nothing do we fall back to the service text. Within
    each pool the TAXONOMY priority order breaks ties (acute needs first)."""
    name_hay = f" {org_name} ".lower()
    full_hay = f" {services_text} {org_name} ".lower()

    matched = [cat for cat, kws in TAXONOMY.items() if _hits(full_hay, kws)]
    name_matched = [cat for cat, kws in TAXONOMY.items() if _hits(name_hay, kws)]

    pool = name_matched or matched
    primary = pool[0] if pool else "Other"   # TAXONOMY is priority-ordered
    return matched, primary
