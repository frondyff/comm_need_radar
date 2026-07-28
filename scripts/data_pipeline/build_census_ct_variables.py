"""Extract the real Montreal census-tract variables from the 2021 Census Profile.

Reads the bulk StatCan Census Profile file (catalogue 98-401-X2021007) and writes
the team's contract file:

    data/raw/statcan_2021_montreal_ct_variables.csv

one row per Montreal CMA (462) census tract, with the five locked vulnerability
variables from docs/reference/data/census-variable-dictionary.md plus the immigrant/Indigenous
MVP-focus fields.

Characteristic IDs (2021 Census Profile, 98-401-X2021007):
    1          -> population_2021                (count)
    37         -> seniors_65plus_pct             (already a %)
    345        -> low_income_pct  (LIM-AT)        (already a %)
    1536 / 1527-> recent_immigrant_pct           (2016-2021 immigrants / total pop)
    387  / 383 -> no_official_language_pct        (neither EN/FR / total)
    1467 / 1465-> shelter_cost_burden_pct         (30%+ on shelter / total households)
    1403 / 1402-> indigenous_identity_pct         (Indigenous identity / universe)

Tracts where any of the five locked variables are suppressed/blank keep the row
(blank cells) so downstream scripts decide how to handle them; the build-index
scripts already drop tracts with suppressed core cells.

Source file (place under the sources dir, default data/raw/_sources/census/):
    census_profile_2021_CMA_CT.csv   (the StatCan bulk download; actually a ZIP)

Usage:
    SOURCES_DIR=/path/to/sources python scripts/data_pipeline/build_census_ct_variables.py
    # default SOURCES_DIR = data/raw/_sources
"""
from pathlib import Path
import os
import sys
import zipfile

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "src"))
from comm_need_radar.config.paths import RAW_DIR  # noqa: E402

SOURCES_DIR = Path(os.environ.get("SOURCES_DIR", RAW_DIR / "_sources"))
CENSUS_BULK = SOURCES_DIR / "census" / "census_profile_2021_CMA_CT.csv"
OUTPUT_PATH = RAW_DIR / "statcan_2021_montreal_ct_variables.csv"

MONTREAL_CMA = "462"
# characteristic_id -> internal column we pivot on
PULL = {
    1: "pop", 37: "seniors", 345: "lowinc",
    1536: "imm_recent", 1527: "imm_total",
    387: "lang_none", 383: "lang_total",
    1467: "shelter_burden", 1465: "shelter_total",
    1403: "indig_count", 1402: "indig_total",
}


def _ct_code(dguid: str) -> str:
    """Derive the contract ct_code from the DGUID, dropping trailing zeros so the
    output matches the committed contract, e.g.
    '2021S05074620001.00' -> '4620001'; '2021S05074620072.01' -> '4620072.01';
    '2021S05074620415.10' -> '4620415.1'."""
    code = str(dguid)[9:]            # strip the '2021S0507' geography prefix
    return code.rstrip("0").rstrip(".") if "." in code else code


def _fmt(x):
    """Render a number the way the contract file does: blank when missing, an
    integer string when whole (14 not 14.0), otherwise rounded to 2 decimals."""
    if x is None or x == "" or pd.isna(x):
        return ""
    x = round(float(x), 2)
    return str(int(x)) if x == int(x) else str(x)


def _pct(num, den):
    if pd.isna(num) or pd.isna(den) or den in (0, 0.0):
        return ""
    return num / den * 100


def load_montreal_characteristics() -> pd.DataFrame:
    if not CENSUS_BULK.exists():
        sys.exit(
            f"Missing source: {CENSUS_BULK}\n"
            "Download the 2021 Census Profile bulk file (98-401-X2021007, CSV) and place it there,\n"
            "or run scripts/data_pipeline/download_sources.py first."
        )
    usecols = ["DGUID", "ALT_GEO_CODE", "GEO_LEVEL", "CHARACTERISTIC_ID", "C1_COUNT_TOTAL"]
    opener = (lambda: zipfile.ZipFile(CENSUS_BULK).open(
        next(n for n in zipfile.ZipFile(CENSUS_BULK).namelist() if n.endswith(".csv"))))
    is_zip = zipfile.is_zipfile(CENSUS_BULK)
    src = opener() if is_zip else CENSUS_BULK
    chunks = []
    for ch in pd.read_csv(src, usecols=usecols, chunksize=1_000_000,
                          encoding="latin-1", low_memory=False):
        ch = ch[ch["GEO_LEVEL"] == "Census tract"]
        ch = ch[ch["ALT_GEO_CODE"].astype(str).str.startswith(MONTREAL_CMA)]
        ch = ch[ch["CHARACTERISTIC_ID"].isin(PULL)]
        if len(ch):
            chunks.append(ch)
    return pd.concat(chunks, ignore_index=True)


def main() -> None:
    raw = load_montreal_characteristics()
    raw["val"] = pd.to_numeric(raw["C1_COUNT_TOTAL"], errors="coerce")
    wide = raw.pivot_table(index=["DGUID", "ALT_GEO_CODE"], columns="CHARACTERISTIC_ID",
                           values="val", aggfunc="first").reset_index()
    wide = wide.rename(columns=PULL)

    out = pd.DataFrame()
    out["ct_code"] = wide["DGUID"].map(_ct_code)
    out["dguid"] = wide["DGUID"]
    out["geo_name"] = out["ct_code"]
    out["population_2021"] = wide.get("pop").astype("Int64")
    out["low_income_pct"] = wide.get("lowinc").map(_fmt)
    out["seniors_65plus_pct"] = wide.get("seniors").map(_fmt)
    out["recent_immigrant_pct"] = [_fmt(_pct(n, d)) for n, d in zip(wide.get("imm_recent"), wide.get("imm_total"))]
    out["no_official_language_pct"] = [_fmt(_pct(n, d)) for n, d in zip(wide.get("lang_none"), wide.get("lang_total"))]
    out["shelter_cost_burden_pct"] = [_fmt(_pct(n, d)) for n, d in zip(wide.get("shelter_burden"), wide.get("shelter_total"))]
    out["indigenous_identity_pct"] = [_fmt(_pct(n, d)) for n, d in zip(wide.get("indig_count"), wide.get("indig_total"))]
    out["indigenous_identity_count"] = wide.get("indig_count").astype("Int64")
    out["total_indigenous_identity_universe"] = wide.get("indig_total").astype("Int64")

    out = out.sort_values("ct_code").reset_index(drop=True)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUTPUT_PATH, index=False)
    pop = out["indigenous_identity_pct"].astype(str).ne("").sum()
    print(f"Wrote {len(out)} Montreal CMA census tracts to {OUTPUT_PATH}")
    print(f"  indigenous_identity_pct populated for {pop} tracts")


if __name__ == "__main__":
    main()
