from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
DOCS_DIR = PROJECT_ROOT / "docs"

AREA_RAW_PATH = RAW_DIR / "synthetic_area_profiles.csv"
SERVICE_RAW_PATH = RAW_DIR / "synthetic_services.csv"
AREA_PROFILE_PATH = PROCESSED_DIR / "area_profile.csv"
SERVICE_TABLE_PATH = PROCESSED_DIR / "service_table.csv"
ACCESSIBILITY_TABLE_PATH = PROCESSED_DIR / "accessibility_table.csv"
GAP_SCORE_PATH = PROCESSED_DIR / "gap_score_table.csv"
FLYER_EXAMPLES_PATH = PROCESSED_DIR / "flyer_examples.csv"
MONITORING_SUMMARY_PATH = PROCESSED_DIR / "monitoring_summary.csv"
ROLE_ACTIVITY_LOG_PATH = PROCESSED_DIR / "role_activity_log.csv"
