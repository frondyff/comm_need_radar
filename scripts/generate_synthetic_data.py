from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from comm_need_radar.config.paths import RAW_DIR
from comm_need_radar.ingestion.synthetic_sources import write_raw_sources

if __name__ == "__main__":
    write_raw_sources(RAW_DIR)
    print(f"Wrote synthetic raw data to {RAW_DIR}")
