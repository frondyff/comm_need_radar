from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
DOCS_DIR = PROJECT_ROOT / "docs"

AREA_RAW_PATH = RAW_DIR / "synthetic_area_profiles.csv"
SERVICE_RAW_PATH = RAW_DIR / "synthetic_services.csv"
DATABASE_CENTERS_PATH = RAW_DIR / "database_centers.csv"
DATABASE_VISITOR_TAGS_PATH = RAW_DIR / "database_visitor_tags.csv"

AREA_PROFILE_PATH = PROCESSED_DIR / "area_profile.csv"
SERVICE_TABLE_PATH = PROCESSED_DIR / "service_table.csv"
ACCESSIBILITY_TABLE_PATH = PROCESSED_DIR / "accessibility_table.csv"
GAP_SCORE_PATH = PROCESSED_DIR / "gap_score_table.csv"
FLYER_EXAMPLES_PATH = PROCESSED_DIR / "flyer_examples.csv"
MONITORING_SUMMARY_PATH = PROCESSED_DIR / "monitoring_summary.csv"
ROLE_ACTIVITY_LOG_PATH = PROCESSED_DIR / "role_activity_log.csv"
AREA_VULNERABILITY_INDEX_REAL_PATH = PROCESSED_DIR / "area_vulnerability_index_real.csv"
CENTER_AREA_LOOKUP_PATH = PROCESSED_DIR / "center_area_lookup.csv"
OBSERVED_NEED_INDEX_PATH = PROCESSED_DIR / "observed_need_index.csv"
OBSERVED_NEED_CATEGORY_SUMMARY_PATH = PROCESSED_DIR / "observed_need_category_summary.csv"
VULNERABILITY_INDEX_V2_PATH = PROCESSED_DIR / "vulnerability_index_v2.csv"
