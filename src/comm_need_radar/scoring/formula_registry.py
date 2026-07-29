"""Stable identifiers and metadata for every scoring formula.

Formula identifiers are deliberately independent from deployment status.  A
candidate can become the official production formula without breaking stored
lineage or documentation links.
"""

from __future__ import annotations

import json
from pathlib import Path


FORMULA_SET_VERSION = "scoring-contract-03"
TAXONOMY_VERSION = "planning-needs-9-v1"
SERVICE_SNAPSHOT_DATE = "2026-07-28"
PRODUCTION_EFFECTIVE_DATE = "2026-07-28"
PRODUCTION_IMPLEMENTATION_COMMIT = (
    "cc050f6a5e662b02723e885180e961db7b0f32ea"
)
PRODUCTION_SERVICE_SNAPSHOT_ID = (
    "97c29b249d986c4ffa5de6fe21400dc99dd5121f6026bda0a779116869806c1b"
)
PRODUCTION_VERCEL_DEPLOYMENT_ID = "dpl_9qNZZxNYpKFyLFkePzR3BXdAFd69"

PROFILE_LEGACY_FORMULA_ID = "PROFILE-LEGACY-01"
STRUCTURAL_FORMULA_ID = "STRUCT-01"
ACCESSIBILITY_LEGACY_FORMULA_ID = "ACCESS-LEGACY-01"
GAP_LEGACY_FORMULA_ID = "GAP-PROD-01"
CLASSIFICATION_LEGACY_FORMULA_ID = "CLASS-LEGACY-01"
CLASSIFICATION_FORMULA_ID = "CLASS-TOP5-02"
FOCUS_IMMIGRANT_FORMULA_ID = "FOCUS-EXP-01"
FOCUS_COMPOSITE_FORMULA_ID = "FOCUS-EXP-02"
V1_DEMAND_FORMULA_ID = "V1-DEMAND-EXP-01"
V2_OBSERVED_FORMULA_ID = "V2-OBS-EXP-01"
V2_COMPOSITE_FORMULA_ID = "V2-COMP-EXP-01"
WEB_DEMAND_FORMULA_ID = "WEB-DEMAND-EXP-01"
ACCESSIBILITY_FORMULA_ID = "ACCESS-REAL-02"
GAP_FORMULA_ID = "GAP-CANON-02"

SCORING_FORMULAS = {
    PROFILE_LEGACY_FORMULA_ID: {
        "name": "Synthetic area-profile vulnerability",
        "status": "historical",
        "production_use": "none; superseded by STRUCT-01",
    },
    STRUCTURAL_FORMULA_ID: {
        "name": "StatCan 2021 equal-weight five-indicator structural vulnerability",
        "status": "production",
        "production_use": "current profile, chatbot, and gap structural input",
    },
    ACCESSIBILITY_LEGACY_FORMULA_ID: {
        "name": "Synthetic distance-plus-count accessibility",
        "status": "historical",
        "production_use": "none; superseded by ACCESS-REAL-02",
    },
    GAP_LEGACY_FORMULA_ID: {
        "name": "Current mixed-basis production gap",
        "status": "historical",
        "production_use": "none; superseded by GAP-CANON-02",
    },
    CLASSIFICATION_LEGACY_FORMULA_ID: {
        "name": "Unvalidated High/Watch/Lower thresholds",
        "status": "historical",
        "production_use": "none; public classifications are retired",
    },
    CLASSIFICATION_FORMULA_ID: {
        "name": "Relative top-five POC priority candidates",
        "status": "production_poc",
        "production_use": (
            "labels ranks 1-5 of the fixed 12-area comparison set; "
            "not a policy threshold or allocation decision"
        ),
    },
    FOCUS_IMMIGRANT_FORMULA_ID: {
        "name": "Immigrant and language Census concern",
        "status": "experimental",
        "production_use": "none",
    },
    FOCUS_COMPOSITE_FORMULA_ID: {
        "name": "Immigrant and Indigenous focus Census composite",
        "status": "experimental",
        "production_use": "none",
    },
    V1_DEMAND_FORMULA_ID: {
        "name": "Frontline demand score",
        "status": "experimental",
        "production_use": "none in gap",
    },
    V2_OBSERVED_FORMULA_ID: {
        "name": "Fixed-component observed-needs score",
        "status": "experimental",
        "production_use": "none in gap",
    },
    V2_COMPOSITE_FORMULA_ID: {
        "name": "Structural-focus plus observed-needs composite",
        "status": "experimental",
        "production_use": "none in gap",
    },
    WEB_DEMAND_FORMULA_ID: {
        "name": "Coverage-gated anonymous web-demand score",
        "status": "experimental",
        "production_use": "none in gap",
    },
    ACCESSIBILITY_FORMULA_ID: {
        "name": "Relative accessibility from services_master",
        "status": "production",
        "production_use": "current production accessibility input",
    },
    GAP_FORMULA_ID: {
        "name": "Canonical structural plus relative-service-access gap",
        "status": "production",
        "production_use": "current production formula set",
    },
}

# Every source category must map exactly once. The broad General Support bucket
# is intentionally conservative: it avoids falsely relabelling specialized
# services as family, health, or food programs.
SERVICE_CATEGORY_CROSSWALK = {
    "Employment & Income": "Employment",
    "Youth & Family": "Family Services",
    "Food": "Food Support",
    "Community & Advocacy": "General Support",
    "Education & Literacy": "General Support",
    "Other": "General Support",
    "Recreation & Culture": "General Support",
    "Disability": "General Support",
    "Government Services": "General Support",
    "Material Aid": "General Support",
    "Domestic Violence & Safety": "General Support",
    "Gender & LGBTQ+": "General Support",
    "Indigenous": "General Support",
    "Transportation": "General Support",
    "Shelter": "Housing & Shelter",
    "Legal": "Legal Aid",
    "Medical": "Health & Mental Health",
    "Immigration & Newcomers": "Newcomer Support",
    "Translation": "Newcomer Support",
    "Seniors": "Senior Support",
}

PLANNING_SERVICE_CATEGORIES = tuple(sorted(set(SERVICE_CATEGORY_CROSSWALK.values())))


def formula_manifest() -> dict[str, object]:
    return {
        "document_status": "official_production",
        "production_formula_set": GAP_FORMULA_ID,
        "production_classification_formula": CLASSIFICATION_FORMULA_ID,
        "previous_production_formula_set": GAP_LEGACY_FORMULA_ID,
        "formula_set_version": FORMULA_SET_VERSION,
        "taxonomy_version": TAXONOMY_VERSION,
        "service_snapshot_date": SERVICE_SNAPSHOT_DATE,
        "production_effective_date": PRODUCTION_EFFECTIVE_DATE,
        "implementation_commit": PRODUCTION_IMPLEMENTATION_COMMIT,
        "service_snapshot_id": PRODUCTION_SERVICE_SNAPSHOT_ID,
        "vercel_deployment_id": PRODUCTION_VERCEL_DEPLOYMENT_ID,
        "formulas": SCORING_FORMULAS,
        "service_category_crosswalk": SERVICE_CATEGORY_CROSSWALK,
    }


def write_formula_manifest(path: Path) -> None:
    path.write_text(
        json.dumps(formula_manifest(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
