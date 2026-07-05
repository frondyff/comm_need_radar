"""Build the CISV validation reference for Montreal.

The Canadian Index of Social Vulnerability (CISV, 2021) is an externally-built
vulnerability index published by dissemination area. It is NOT blended into the
project's census index (no DA->CT crosswalk is bundled); it is kept as an
independent cross-check for the census-based vulnerability_index.

Source (under sources dir, default data/raw/_sources/cisv/):
    cisv_2021.zip   (Statistics Canada CISV scores + quintiles)

Output:
    data/processed/cisv_reference_montreal.csv   (one row per Montreal CMA DA)

Usage:
    SOURCES_DIR=/path/to/sources python scripts/data_pipeline/build_cisv_reference.py
"""
from pathlib import Path
import os
import sys
import zipfile

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from comm_need_radar.config.paths import RAW_DIR, PROCESSED_DIR  # noqa: E402

SOURCES_DIR = Path(os.environ.get("SOURCES_DIR", RAW_DIR / "_sources"))
CISV_ZIP = SOURCES_DIR / "cisv" / "cisv_2021.zip"
OUTPUT_PATH = PROCESSED_DIR / "cisv_reference_montreal.csv"

# Census divisions that make up the Montreal CMA (first 4 digits of the DA UID).
MONTREAL_CMA_CDS = {"2458", "2460", "2461", "2462", "2465",
                    "2466", "2467", "2469", "2470", "2471"}


def main() -> None:
    if not CISV_ZIP.exists():
        sys.exit(f"Missing source: {CISV_ZIP} (download the CISV 2021 release there)")
    with zipfile.ZipFile(CISV_ZIP) as z:
        scores = next(n for n in z.namelist() if "score" in n.lower() and n.endswith(".csv"))
        df = pd.read_csv(z.open(scores), encoding="latin-1", low_memory=False)
    df.columns = [c.replace("﻿", "").strip() for c in df.columns]
    da_col = next((c for c in df.columns if c.lower() in ("da_uid", "dissemination area (da)")
                   or ("da" in c.lower() and "uid" in c.lower())), df.columns[0])
    df["da_str"] = df[da_col].astype(str).str.zfill(8)
    mtl = df[df["da_str"].str[:4].isin(MONTREAL_CMA_CDS)].copy()
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    mtl.to_csv(OUTPUT_PATH, index=False)
    print(f"Wrote {len(mtl)} Montreal CMA dissemination areas to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
