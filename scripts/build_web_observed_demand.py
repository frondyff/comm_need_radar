"""Build the observed-needs layer from anonymous website behavior.

The pipeline converts versioned ``page_events`` and ``flyer_downloads`` into
k-anonymized, area-level ``database_visitor_tag`` snapshots. The exposure-
normalized digital-demand score is the V2 observed score; the final experimental
index uses the repository's original 60% structural / 40% observed formula.

The live ``gap_score`` and Census structural tables are never modified.

Examples:
    python scripts/build_web_observed_demand.py \
      --page-events-csv /secure/page_events.csv \
      --flyer-downloads-csv /secure/flyer_downloads.csv \
      --as-of-date 2026-07-27

    VITE_SUPABASE_URL=https://... SUPABASE_SECRET_KEY=... \
      python scripts/build_web_observed_demand.py --from-supabase --publish
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import date, timedelta
import json
import os
from pathlib import Path
import sys
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, uuid5

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from comm_need_radar.scoring.metrics import (  # noqa: E402
    K_ANON_FLOOR,
    OBSERVED_WEIGHT,
    STRUCTURAL_WEIGHT,
    composite_vulnerability_index,
)


DEFAULT_STRUCTURAL_PATH = (
    PROJECT_ROOT / "data" / "processed" / "area_vulnerability_index_real.csv"
)
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data" / "derived" / "web_observed_demand"
SCORING_VERSION = "web-observed-demand-v1"
OBSERVED_DATA_BASIS = "real_web_behavior_exposure_normalized_experimental"

EVENT_WEIGHTS = {
    "category_filter": 0.25,
    "map_opened": 0.25,
    "service_card_opened": 1.0,
    "dist_location_selected": 1.5,
    "flyer_download": 3.0,
}
EXPOSURE_EVENT = "service_impression"


@dataclass(frozen=True)
class QualityThresholds:
    min_unique_sessions: int = 20
    min_active_days: int = 7
    min_service_impressions: int = 20


def _empty_events() -> pd.DataFrame:
    return pd.DataFrame(
        columns=[
            "created_at",
            "event_version",
            "anonymous_session_id",
            "selected_area_id",
            "service_id",
            "service_area_id",
            "category",
            "is_test",
            "event_type",
            "source",
        ]
    )


def _truthy(value: Any) -> bool:
    if pd.isna(value):
        return False
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "t", "yes"}
    return bool(value)


def _column(frame: pd.DataFrame, name: str, default: Any = None) -> pd.Series:
    if name in frame.columns:
        return frame[name]
    return pd.Series([default] * len(frame), index=frame.index, dtype="object")


def normalize_page_events(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return _empty_events()
    normalized = pd.DataFrame(index=frame.index)
    for name in [
        "created_at",
        "event_version",
        "anonymous_session_id",
        "selected_area_id",
        "service_id",
        "service_area_id",
        "category",
        "is_test",
        "event_type",
    ]:
        normalized[name] = _column(frame, name)
    normalized["source"] = "page_events"
    return normalized


def normalize_flyer_downloads(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return _empty_events()
    normalized = pd.DataFrame(index=frame.index)
    for name in [
        "created_at",
        "event_version",
        "anonymous_session_id",
        "selected_area_id",
        "service_id",
        "service_area_id",
        "category",
        "is_test",
    ]:
        normalized[name] = _column(frame, name)
    missing_category = normalized["category"].isna() | (
        normalized["category"].astype(str).str.strip() == ""
    )
    normalized.loc[missing_category, "category"] = _column(
        frame, "service_category"
    )[missing_category]
    normalized["event_type"] = "flyer_download"
    normalized["source"] = "flyer_downloads"
    return normalized


def prepare_eligible_events(
    page_events: pd.DataFrame,
    flyer_downloads: pd.DataFrame,
    valid_area_ids: set[str],
    period_start: date,
    period_end: date,
) -> tuple[pd.DataFrame, dict[str, int]]:
    """Normalize, validate, and deterministically deduplicate analytics rows."""
    combined = pd.concat(
        [
            normalize_page_events(page_events),
            normalize_flyer_downloads(flyer_downloads),
        ],
        ignore_index=True,
    )
    report = {
        "input_page_events": int(len(page_events)),
        "input_flyer_downloads": int(len(flyer_downloads)),
        "excluded_test_rows": 0,
        "excluded_outside_window": 0,
        "excluded_legacy_or_unversioned": 0,
        "excluded_missing_session": 0,
        "excluded_missing_or_unknown_area": 0,
        "excluded_unsupported_event": 0,
        "deduplicated_rows": 0,
    }
    if combined.empty:
        report["eligible_events"] = 0
        return combined, report

    combined["created_at"] = pd.to_datetime(
        combined["created_at"], errors="coerce", utc=True
    )
    combined["event_version"] = pd.to_numeric(
        combined["event_version"], errors="coerce"
    ).fillna(1)
    combined["is_test"] = combined["is_test"].map(_truthy)
    combined["area_id"] = _column(combined, "selected_area_id")
    missing_area = combined["area_id"].isna() | (
        combined["area_id"].astype(str).str.strip() == ""
    )
    combined.loc[missing_area, "area_id"] = _column(
        combined, "service_area_id"
    )[missing_area]
    combined["area_id"] = combined["area_id"].fillna("").astype(str).str.strip()
    combined["anonymous_session_id"] = (
        combined["anonymous_session_id"].fillna("").astype(str).str.strip()
    )
    combined["event_type"] = combined["event_type"].fillna("").astype(str)
    accepted_events = set(EVENT_WEIGHTS) | {EXPOSURE_EVENT}

    start_ts = pd.Timestamp(period_start, tz="UTC")
    end_ts = pd.Timestamp(period_end + timedelta(days=1), tz="UTC")
    masks = [
        ("excluded_test_rows", combined["is_test"]),
        (
            "excluded_outside_window",
            combined["created_at"].isna()
            | (combined["created_at"] < start_ts)
            | (combined["created_at"] >= end_ts),
        ),
        ("excluded_legacy_or_unversioned", combined["event_version"] < 2),
        ("excluded_missing_session", combined["anonymous_session_id"] == ""),
        (
            "excluded_missing_or_unknown_area",
            ~combined["area_id"].isin(valid_area_ids),
        ),
        (
            "excluded_unsupported_event",
            ~combined["event_type"].isin(accepted_events),
        ),
    ]
    eligible = pd.Series(True, index=combined.index)
    for label, mask in masks:
        newly_excluded = eligible & mask
        report[label] = int(newly_excluded.sum())
        eligible &= ~mask

    filtered = combined.loc[eligible].copy()
    filtered["event_day"] = filtered["created_at"].dt.strftime("%Y-%m-%d")
    filtered["service_id"] = filtered["service_id"].fillna("").astype(str)
    filtered["category"] = (
        filtered["category"].fillna("").astype(str).str.strip()
    )
    dedupe_columns = [
        "source",
        "event_type",
        "anonymous_session_id",
        "area_id",
        "service_id",
        "category",
        "event_day",
    ]
    before_dedupe = len(filtered)
    filtered = filtered.drop_duplicates(subset=dedupe_columns, keep="first")
    report["deduplicated_rows"] = int(before_dedupe - len(filtered))
    filtered["event_weight"] = (
        filtered["event_type"].map(EVENT_WEIGHTS).fillna(0.0)
    )
    report["eligible_events"] = int(len(filtered))
    return filtered, report


def _min_max_scores(values: pd.Series) -> pd.Series:
    if values.empty:
        return values
    minimum = float(values.min())
    maximum = float(values.max())
    if maximum == minimum:
        return pd.Series(50.0, index=values.index)
    return ((values - minimum) / (maximum - minimum) * 100).round(2)


def build_area_demand(
    events: pd.DataFrame,
    structural: pd.DataFrame,
    dataset_id: str,
    thresholds: QualityThresholds,
) -> pd.DataFrame:
    """Build exposure-normalized demand and enforce the all-area quality gate."""
    rows: list[dict[str, Any]] = []
    for area_id in structural["area_id"].astype(str):
        area_events = events[events["area_id"] == area_id]
        unique_sessions = int(area_events["anonymous_session_id"].nunique())
        active_days = int(area_events["event_day"].nunique())
        impressions = int((area_events["event_type"] == EXPOSURE_EVENT).sum())
        weighted_intent = round(float(area_events["event_weight"].sum()), 4)
        intent_rate = (
            round(weighted_intent / impressions * 100, 4)
            if impressions > 0
            else None
        )
        has_signal = unique_sessions > 0 and impressions > 0
        reviewable = (
            unique_sessions >= thresholds.min_unique_sessions
            and active_days >= thresholds.min_active_days
            and impressions >= thresholds.min_service_impressions
        )
        status = (
            "reviewable"
            if reviewable
            else "experimental"
            if has_signal
            else "insufficient"
        )
        rows.append(
            {
                "dataset_id": dataset_id,
                "area_id": area_id,
                "unique_sessions": unique_sessions,
                "active_days": active_days,
                "service_impressions": impressions,
                "weighted_demand_total": weighted_intent,
                "intent_rate_per_100_impressions": intent_rate,
                "digital_demand_score": None,
                "coverage_status": status,
            }
        )

    result = pd.DataFrame(rows)
    all_areas_reviewable = result["coverage_status"].eq("reviewable").all()
    scorable = (
        result["coverage_status"].eq("reviewable")
        if all_areas_reviewable
        else pd.Series(False, index=result.index)
    )
    result.loc[scorable, "digital_demand_score"] = _min_max_scores(
        result.loc[scorable, "intent_rate_per_100_impressions"].astype(float)
    )
    return result


def build_category_summary(events: pd.DataFrame) -> pd.DataFrame:
    """Return only category groups that meet the k-anonymity floor."""
    intent = events[(events["event_weight"] > 0) & (events["category"] != "")].copy()
    fields = [
        "area_id",
        "key_need",
        "encounter_count",
        "encounter_share_pct",
        "category_rank",
        "weighted_demand_total",
        "weighted_demand_share_pct",
        "source_type",
    ]
    if intent.empty:
        return pd.DataFrame(columns=fields)

    grouped = (
        intent.groupby(["area_id", "category"], as_index=False)
        .agg(
            encounter_count=("anonymous_session_id", "nunique"),
            weighted_demand_total=("event_weight", "sum"),
        )
        .rename(columns={"category": "key_need"})
    )
    grouped = grouped[grouped["encounter_count"] >= K_ANON_FLOOR].copy()
    if grouped.empty:
        return pd.DataFrame(columns=fields)

    grouped["weighted_demand_total"] = grouped["weighted_demand_total"].round(4)
    grouped["encounter_share_pct"] = (
        grouped["encounter_count"]
        / grouped.groupby("area_id")["encounter_count"].transform("sum")
        * 100
    ).round(2)
    grouped["weighted_demand_share_pct"] = (
        grouped["weighted_demand_total"]
        / grouped.groupby("area_id")["weighted_demand_total"].transform("sum")
        * 100
    ).round(2)
    grouped = grouped.sort_values(
        ["area_id", "weighted_demand_total", "key_need"],
        ascending=[True, False, True],
    )
    grouped["category_rank"] = grouped.groupby("area_id").cumcount() + 1
    grouped["source_type"] = "web_behavior"
    return grouped[fields].reset_index(drop=True)


def build_visitor_tags(
    area_demand: pd.DataFrame,
    category_summary: pd.DataFrame,
    period_start: date,
    period_end: date,
) -> pd.DataFrame:
    """Materialize one privacy-safe web visitor-tag snapshot per area."""
    top_category = {}
    if not category_summary.empty:
        top_category = (
            category_summary[category_summary["category_rank"] == 1]
            .set_index("area_id")["key_need"]
            .to_dict()
        )

    rows = []
    for row in area_demand.to_dict("records"):
        if int(row["unique_sessions"]) < K_ANON_FLOOR:
            continue
        area_id = str(row["area_id"])
        visit_group_id = "WEB_" + str(
            uuid5(
                NAMESPACE_URL,
                f"{SCORING_VERSION}:{period_start}:{period_end}:{area_id}",
            )
        )
        rows.append(
            {
                "visit_group_id": visit_group_id,
                "center_id": None,
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "key_need": top_category.get(area_id, "Digital service demand"),
                "k_anon_count": int(row["unique_sessions"]),
                "severity": "observed",
                "population_group": "anonymous_web_sessions",
                "language_need_flag": False,
                "settlement_need_flag": False,
                "indigenous_specific_need_flag": False,
                "source_type": "web_behavior",
                "area_id": area_id,
                "weighted_demand_total": float(row["weighted_demand_total"]),
                "service_impression_count": int(row["service_impressions"]),
                "intent_rate_per_100_impressions": row[
                    "intent_rate_per_100_impressions"
                ],
                "digital_demand_score": row["digital_demand_score"],
                "coverage_status": row["coverage_status"],
                "scoring_version": SCORING_VERSION,
            }
        )
    return pd.DataFrame(rows)


def build_observed_need_index(
    area_demand: pd.DataFrame,
    category_summary: pd.DataFrame,
    window_days: int,
    period_end: date,
) -> pd.DataFrame:
    """Map digital demand directly to the existing V2 observed-score contract."""
    categories_by_area: dict[str, list[dict[str, Any]]] = {}
    for row in category_summary.to_dict("records"):
        categories_by_area.setdefault(str(row["area_id"]), []).append(row)

    rows = []
    for area in area_demand.to_dict("records"):
        area_id = str(area["area_id"])
        categories = categories_by_area.get(area_id, [])
        top = categories[0] if categories else {}
        score = (
            float(area["digital_demand_score"])
            if pd.notna(area["digital_demand_score"])
            else None
        )
        insufficient = score is None
        rows.append(
            {
                "area_id": area_id,
                "rolling_window_days": window_days,
                "rolling_visit_count": int(area["unique_sessions"]),
                "visit_volume_per_1000": None,
                "observed_visit_volume_score": score,
                "top_need_category": top.get("key_need"),
                "top_need_count": top.get("encounter_count"),
                "top_need_share_pct": top.get("weighted_demand_share_pct"),
                "top_category_rate_per_1000": None,
                "top_category_pressure_score": None,
                "v1_demand_score": score,
                "data_through_date": period_end.isoformat(),
                "observed_immigrant_need_score": None,
                "observed_indigenous_need_score": None,
                "focus_category_share_score": None,
                "observed_severity_breadth_score": None,
                "observed_recency_score": None,
                "v2_observed_score": score,
                "observed_focus_need_score": score,
                "observed_data_basis": (
                    OBSERVED_DATA_BASIS
                    if score is not None
                    else "real_web_behavior_insufficient_coverage"
                ),
                "insufficient_visit_data": insufficient,
                "top_key_needs": "; ".join(
                    str(item["key_need"]) for item in categories[:5]
                ),
                "observed_need_rank": None,
            }
        )

    result = pd.DataFrame(rows)
    scored = result["v2_observed_score"].notna()
    if scored.any():
        result.loc[scored, "observed_need_rank"] = (
            result.loc[scored, "v2_observed_score"]
            .rank(method="first", ascending=False)
            .astype(int)
        )
    return result


def build_vulnerability_v2(
    observed: pd.DataFrame,
    structural: pd.DataFrame,
) -> pd.DataFrame:
    """Apply the original 60% structural / 40% observed V2 formula."""
    required = {
        "area_id",
        "mvp_focus_census_index",
        "vulnerability_index",
    }
    missing = sorted(required - set(structural.columns))
    if missing:
        raise ValueError(f"Structural input is missing: {', '.join(missing)}")
    if structural["area_id"].duplicated().any():
        raise ValueError("Structural input contains duplicate area_id values")

    merged = structural.merge(observed, on="area_id", validate="one_to_one")
    observed_count = int(merged["v2_observed_score"].notna().sum())
    if observed_count not in (0, len(merged)):
        raise ValueError(
            "Observed scoring must cover every area or use structural-only fallback"
        )
    rows = []
    for row in merged.to_dict("records"):
        structural_score = float(row["mvp_focus_census_index"])
        observed_score = (
            float(row["v2_observed_score"])
            if pd.notna(row["v2_observed_score"])
            else None
        )
        v2_score, _ = composite_vulnerability_index(
            structural_score,
            observed_score,
            structural_weight=STRUCTURAL_WEIGHT,
            observed_weight=OBSERVED_WEIGHT,
        )
        has_observed = observed_score is not None
        rows.append(
            {
                "area_id": row["area_id"],
                "area_name": row.get("area_name"),
                "borough_name": row.get("borough_name"),
                "structural_vulnerability_index": float(row["vulnerability_index"]),
                "immigrant_census_concern_score": row.get(
                    "immigrant_census_concern_score"
                ),
                "indigenous_census_concern_score": row.get(
                    "indigenous_census_concern_score"
                ),
                "mvp_focus_census_index": structural_score,
                "v1_demand_score": observed_score,
                "visit_volume_score": observed_score,
                "top_category_pressure_score": None,
                "focus_category_share_score": None,
                "severity_breadth_score": None,
                "recency_score": None,
                "v2_observed_score": observed_score,
                "observed_focus_need_score": observed_score,
                "vulnerability_index_v2": v2_score,
                "structural_weight": (
                    STRUCTURAL_WEIGHT if has_observed else 1.0
                ),
                "observed_weight": OBSERVED_WEIGHT if has_observed else 0.0,
                "insufficient_visit_data": not has_observed,
                "v2_data_basis": (
                    "structural_and_observed_web_behavior_experimental"
                    if has_observed
                    else "structural_focus_only_web_observed_insufficient"
                ),
                "v2_top_concern": (
                    row.get("top_need_category")
                    or row.get("mvp_focus_top_concern")
                ),
                "vulnerability_rank_v2": None,
            }
        )

    result = pd.DataFrame(rows).sort_values(
        ["vulnerability_index_v2", "area_id"], ascending=[False, True]
    )
    result["vulnerability_rank_v2"] = range(1, len(result) + 1)
    return result


def build_quality_report(
    dataset_id: str,
    period_start: date,
    period_end: date,
    window_days: int,
    thresholds: QualityThresholds,
    input_report: dict[str, int],
    area_demand: pd.DataFrame,
) -> dict[str, Any]:
    reviewable = int(area_demand["coverage_status"].eq("reviewable").sum())
    return {
        "dataset_id": dataset_id,
        "scoring_version": SCORING_VERSION,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "window_days": window_days,
        "event_weights": EVENT_WEIGHTS,
        "quality_thresholds": asdict(thresholds),
        "quality_status": (
            "reviewable"
            if reviewable == len(area_demand)
            else "experimental"
            if int(area_demand["unique_sessions"].sum()) > 0
            else "insufficient"
        ),
        "reviewable_area_count": reviewable,
        "expected_area_count": int(len(area_demand)),
        "input_validation": input_report,
        "guardrails": {
            "production_gap_score_modified": False,
            "synthetic_visitor_tags_used": False,
            "raw_session_ids_persisted": False,
            "minimum_persisted_group_size": K_ANON_FLOOR,
            "structural_weight": STRUCTURAL_WEIGHT,
            "observed_weight": OBSERVED_WEIGHT,
        },
    }


def _supabase_request(
    supabase_url: str,
    secret_key: str,
    path: str,
    *,
    method: str = "GET",
    payload: Any = None,
    range_header: str | None = None,
) -> Any:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {
        "apikey": secret_key,
        "authorization": f"Bearer {secret_key}",
        "accept": "application/json",
    }
    if body is not None:
        headers["content-type"] = "application/json"
    if range_header:
        headers["range"] = range_header
    request = Request(
        f"{supabase_url.rstrip('/')}/rest/v1/{path}",
        data=body,
        headers=headers,
        method=method,
    )
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Supabase REST {method} {path.split('?')[0]} failed "
            f"with HTTP {error.code}: {detail[:500]}"
        ) from error


def _read_supabase_table(
    supabase_url: str,
    secret_key: str,
    table: str,
    period_start: date,
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    page_size = 1000
    query = urlencode(
        {
            "select": "*",
            "created_at": f"gte.{period_start.isoformat()}T00:00:00Z",
            "order": "created_at.asc",
        }
    )
    for offset in range(0, 1_000_000, page_size):
        page = _supabase_request(
            supabase_url,
            secret_key,
            f"{table}?{query}",
            range_header=f"{offset}-{offset + page_size - 1}",
        )
        rows.extend(page or [])
        if not page or len(page) < page_size:
            break
    else:
        raise RuntimeError(f"{table} exceeded the one-million-row pipeline safety cap")
    return pd.DataFrame(rows)


def read_supabase_inputs(
    supabase_url: str,
    secret_key: str,
    period_start: date,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    return (
        _read_supabase_table(supabase_url, secret_key, "page_events", period_start),
        _read_supabase_table(
            supabase_url, secret_key, "flyer_downloads", period_start
        ),
    )


def _json_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    def value(item: Any) -> Any:
        if pd.isna(item):
            return None
        return item.item() if hasattr(item, "item") else item

    return [
        {key: value(item) for key, item in row.items()}
        for row in frame.to_dict("records")
    ]


def publish_supabase_results(
    supabase_url: str,
    secret_key: str,
    visitor_tags: pd.DataFrame,
    observed: pd.DataFrame,
    category_summary: pd.DataFrame,
    vulnerability_v2: pd.DataFrame,
) -> None:
    """Atomically replace web-observed materializations through a private RPC."""
    _supabase_request(
        supabase_url,
        secret_key,
        "rpc/publish_web_observed_demand",
        method="POST",
        payload={
            "visitor_rows": _json_records(visitor_tags),
            "observed_rows": _json_records(observed),
            "category_rows": _json_records(category_summary),
            "v2_rows": _json_records(vulnerability_v2),
        },
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--from-supabase",
        action="store_true",
        help="Read private analytics through Supabase REST and SUPABASE_SECRET_KEY.",
    )
    source.add_argument(
        "--page-events-csv",
        type=Path,
        help="Secure CSV export of page_events; also requires --flyer-downloads-csv.",
    )
    parser.add_argument("--flyer-downloads-csv", type=Path)
    parser.add_argument("--structural-csv", type=Path, default=DEFAULT_STRUCTURAL_PATH)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--as-of-date", type=date.fromisoformat, default=date.today())
    parser.add_argument("--window-days", type=int, default=90)
    parser.add_argument("--min-unique-sessions", type=int, default=20)
    parser.add_argument("--min-active-days", type=int, default=7)
    parser.add_argument("--min-service-impressions", type=int, default=20)
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Atomically replace web-observed visitor tags and V2 materializations.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.window_days <= 0:
        raise SystemExit("--window-days must be positive")
    thresholds = QualityThresholds(
        args.min_unique_sessions,
        args.min_active_days,
        args.min_service_impressions,
    )
    if min(asdict(thresholds).values()) <= 0:
        raise SystemExit("All quality thresholds must be positive")

    period_end = args.as_of_date
    period_start = period_end - timedelta(days=args.window_days - 1)
    supabase_url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get(
        "SUPABASE_URL"
    )
    secret_key = os.environ.get("SUPABASE_SECRET_KEY")
    if args.from_supabase:
        if not supabase_url or not secret_key:
            raise SystemExit(
                "Set VITE_SUPABASE_URL and SUPABASE_SECRET_KEY "
                "before using --from-supabase"
            )
        page_events, flyer_downloads = read_supabase_inputs(
            supabase_url, secret_key, period_start
        )
    else:
        if not args.flyer_downloads_csv:
            raise SystemExit(
                "--flyer-downloads-csv is required with --page-events-csv"
            )
        page_events = pd.read_csv(args.page_events_csv)
        flyer_downloads = pd.read_csv(args.flyer_downloads_csv)

    structural = pd.read_csv(args.structural_csv)
    if structural["area_id"].duplicated().any():
        raise ValueError("Structural input contains duplicate area_id values")
    structural["area_id"] = structural["area_id"].astype(str)
    period_key = f"{SCORING_VERSION}:{period_start}:{period_end}"
    dataset_id = str(uuid5(NAMESPACE_URL, period_key))
    eligible, input_report = prepare_eligible_events(
        page_events,
        flyer_downloads,
        set(structural["area_id"]),
        period_start,
        period_end,
    )
    area_demand = build_area_demand(
        eligible, structural, dataset_id, thresholds
    )
    category_summary = build_category_summary(eligible)
    visitor_tags = build_visitor_tags(
        area_demand, category_summary, period_start, period_end
    )
    observed = build_observed_need_index(
        area_demand, category_summary, args.window_days, period_end
    )
    vulnerability_v2 = build_vulnerability_v2(observed, structural)
    quality_report = build_quality_report(
        dataset_id,
        period_start,
        period_end,
        args.window_days,
        thresholds,
        input_report,
        area_demand,
    )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    visitor_tags.to_csv(args.output_dir / "database_visitor_tag.csv", index=False)
    area_demand.to_csv(args.output_dir / "web_observed_area.csv", index=False)
    observed.to_csv(args.output_dir / "observed_need_index.csv", index=False)
    category_summary.to_csv(
        args.output_dir / "observed_need_category_summary.csv", index=False
    )
    vulnerability_v2.to_csv(
        args.output_dir / "vulnerability_index_v2.csv", index=False
    )
    (args.output_dir / "quality_report.json").write_text(
        json.dumps(quality_report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    if args.publish:
        if not supabase_url or not secret_key:
            raise SystemExit(
                "Set VITE_SUPABASE_URL and SUPABASE_SECRET_KEY before using --publish"
            )
        publish_supabase_results(
            supabase_url,
            secret_key,
            visitor_tags,
            observed,
            category_summary,
            vulnerability_v2,
        )

    print(
        f"Built {len(area_demand)} area rows; "
        f"quality={quality_report['quality_status']}; "
        f"eligible_events={input_report['eligible_events']}; "
        f"output={args.output_dir}"
    )


if __name__ == "__main__":
    main()
