from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from comm_need_radar.processing.pipeline import run_pipeline

if __name__ == "__main__":
    run_pipeline()
    print("Wrote processed MVP data")
