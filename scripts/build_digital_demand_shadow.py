"""Build private, exposure-normalized digital-demand and shadow priority scores.

The pipeline intentionally does not update ``gap_score`` or any browser-readable
table. Version-2 analytics rows need a short-lived anonymous session, an area,
and an exposure denominator before they can influence the private shadow score.

Examples:
    python scripts/build_digital_demand_shadow.py \
      --page-events-csv /secure/page_events.csv \
      --flyer-downloads-csv /secure/flyer_downloads.csv \
      --as-of-date 2026-07-27

    VITE_SUPABASE_URL=https://... SUPABASE_SECRET_KEY=... \
      python scripts/build_digital_demand_shadow.py --from-supabase --publish
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import date, timedelta
import json
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, uuid5

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STRUCTURAL_PATH = (
    PROJECT_ROOT / "data" / "processed" / "area_vulnerability_index_real.csv"
)
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data" / "derived" / "digital_demand"
SCORING_VERSION = "digital-demand-shadow-v1"
DATA_BASIS = "anonymous_web_behavior_exposure_normalized"

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
    filtered["category"] = filtered["category"].fillna("").astype(str)
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
    filtered["event_weight"] = filtered["event_type"].map(EVENT_WEIGHTS).fillna(0.0)
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
        status = "reviewable" if reviewable else "experimental" if has_signal else "insufficient"
        rows.append(
            {
                "dataset_id": dataset_id,
                "area_id": area_id,
                "unique_sessions": unique_sessions,
                "active_days": active_days,
                "service_impressions": impressions,
                "weighted_intent": weighted_intent,
                "intent_rate_per_100_impressions": intent_rate,
                "digital_demand_score": None,
                "coverage_status": status,
                "data_basis": DATA_BASIS,
            }
        )
    result = pd.DataFrame(rows)
    # Do not rank a partial geography. Until every study area passes the same
    # quality gates, raw counts/rates remain diagnostic and every composite
    # falls back to the structural score.
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


def build_shadow_scores(
    area_demand: pd.DataFrame,
    structural: pd.DataFrame,
    digital_weight: float,
) -> pd.DataFrame:
    structural_column = (
        "vulnerability_index"
        if "vulnerability_index" in structural.columns
        else "mvp_focus_census_index"
    )
    if structural_column not in structural.columns:
        raise ValueError(
            "Structural input needs vulnerability_index or mvp_focus_census_index"
        )
    structural_scores = structural[["area_id", structural_column]].copy()
    structural_scores[structural_column] = pd.to_numeric(
        structural_scores[structural_column], errors="raise"
    )
    if not structural_scores[structural_column].between(0, 100).all():
        raise ValueError("Structural vulnerability scores must be between 0 and 100")
    merged = structural_scores.merge(area_demand, on="area_id", validate="one_to_one")
    rows: list[dict[str, Any]] = []
    for row in merged.to_dict("records"):
        approved_for_shadow = (
            row["coverage_status"] == "reviewable"
            and pd.notna(row["digital_demand_score"])
        )
        applied_digital_weight = digital_weight if approved_for_shadow else 0.0
        structural_weight = 1.0 - applied_digital_weight
        structural_score = float(row[structural_column])
        digital_score = (
            float(row["digital_demand_score"])
            if pd.notna(row["digital_demand_score"])
            else None
        )
        shadow_score = structural_score
        basis = "structural_only_insufficient_web_behavior"
        if approved_for_shadow and digital_score is not None:
            shadow_score = (
                structural_weight * structural_score
                + applied_digital_weight * digital_score
            )
            basis = "structural_census_plus_web_behavior_shadow_v1"
        rows.append(
            {
                "dataset_id": row["dataset_id"],
                "area_id": row["area_id"],
                "structural_vulnerability_score": round(structural_score, 2),
                "digital_demand_score": digital_score,
                "structural_weight": round(structural_weight, 4),
                "digital_weight": round(applied_digital_weight, 4),
                "priority_score_v2_shadow": round(shadow_score, 2),
                "coverage_status": row["coverage_status"],
                "score_data_basis": basis,
            }
        )
    result = pd.DataFrame(rows).sort_values(
        ["priority_score_v2_shadow", "area_id"], ascending=[False, True]
    )
    result["shadow_rank"] = range(1, len(result) + 1)
    return result


def build_dataset_record(
    dataset_id: str,
    label: str,
    period_start: date,
    period_end: date,
    window_days: int,
    thresholds: QualityThresholds,
    input_report: dict[str, int],
    area_demand: pd.DataFrame,
) -> dict[str, Any]:
    reviewable_areas = int((area_demand["coverage_status"] == "reviewable").sum())
    experimental_areas = int(
        area_demand["coverage_status"].isin(["reviewable", "experimental"]).sum()
    )
    quality_status = (
        "reviewable"
        if reviewable_areas == len(area_demand)
        else "experimental"
        if experimental_areas > 0
        else "insufficient"
    )
    input_total = (
        input_report["input_page_events"] + input_report["input_flyer_downloads"]
    )
    return {
        "dataset_id": dataset_id,
        "source_type": "web_behavior",
        "dataset_label": label,
        "publication_state": "private_pilot",
        "scoring_version": SCORING_VERSION,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "window_days": window_days,
        "event_weights": EVENT_WEIGHTS,
        "quality_thresholds": asdict(thresholds),
        "quality_status": quality_status,
        "input_page_event_count": input_report["input_page_events"],
        "input_flyer_download_count": input_report["input_flyer_downloads"],
        "eligible_event_count": input_report["eligible_events"],
        "excluded_event_count": input_total - input_report["eligible_events"],
        "reviewable_area_count": reviewable_areas,
        "experimental_or_better_area_count": experimental_areas,
    }


def _supabase_request(
    supabase_url: str,
    secret_key: str,
    path: str,
    *,
    method: str = "GET",
    payload: Any = None,
    prefer: str | None = None,
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
    if prefer:
        headers["prefer"] = prefer
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
        _read_supabase_table(
            supabase_url, secret_key, "page_events", period_start
        ),
        _read_supabase_table(
            supabase_url, secret_key, "flyer_downloads", period_start
        ),
    )


def publish_supabase_results(
    supabase_url: str,
    secret_key: str,
    dataset: dict[str, Any],
    area_demand: pd.DataFrame,
    shadow_scores: pd.DataFrame,
) -> None:
    def json_value(value: Any) -> Any:
        if pd.isna(value):
            return None
        return value.item() if hasattr(value, "item") else value

    def records(frame: pd.DataFrame) -> list[dict[str, Any]]:
        return [
            {key: json_value(value) for key, value in row.items()}
            for row in frame.to_dict("records")
        ]

    dataset_columns = {
        key: value
        for key, value in dataset.items()
        if key
        not in {
            "reviewable_area_count",
            "experimental_or_better_area_count",
        }
    }
    prefer = "resolution=merge-duplicates,return=minimal"
    _supabase_request(
        supabase_url,
        secret_key,
        "digital_demand_dataset?on_conflict=dataset_id",
        method="POST",
        payload=[dataset_columns],
        prefer=prefer,
    )
    _supabase_request(
        supabase_url,
        secret_key,
        "digital_demand_area?on_conflict=dataset_id,area_id",
        method="POST",
        payload=records(area_demand),
        prefer=prefer,
    )
    _supabase_request(
        supabase_url,
        secret_key,
        "priority_score_v2_shadow?on_conflict=dataset_id,area_id",
        method="POST",
        payload=records(shadow_scores),
        prefer=prefer,
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
    parser.add_argument("--digital-weight", type=float, default=0.15)
    parser.add_argument("--dataset-label")
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Upsert private shadow outputs to Supabase; never changes gap_score.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.window_days <= 0:
        raise SystemExit("--window-days must be positive")
    if not 0 <= args.digital_weight <= 0.25:
        raise SystemExit("--digital-weight must be between 0 and 0.25")
    thresholds = QualityThresholds(
        args.min_unique_sessions,
        args.min_active_days,
        args.min_service_impressions,
    )
    if min(asdict(thresholds).values()) <= 0:
        raise SystemExit("All quality thresholds must be positive")
    period_end = args.as_of_date
    period_start = period_end - timedelta(days=args.window_days - 1)
    supabase_url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    supabase_secret_key = os.environ.get("SUPABASE_SECRET_KEY")
    if args.from_supabase:
        if not supabase_url or not supabase_secret_key:
            raise SystemExit(
                "Set VITE_SUPABASE_URL and SUPABASE_SECRET_KEY "
                "before using --from-supabase"
            )
        page_events, flyer_downloads = read_supabase_inputs(
            supabase_url, supabase_secret_key, period_start
        )
    else:
        if not args.flyer_downloads_csv:
            raise SystemExit("--flyer-downloads-csv is required with --page-events-csv")
        page_events = pd.read_csv(args.page_events_csv)
        flyer_downloads = pd.read_csv(args.flyer_downloads_csv)

    structural = pd.read_csv(args.structural_csv)
    if structural["area_id"].duplicated().any():
        raise ValueError("Structural input contains duplicate area_id values")
    valid_area_ids = set(structural["area_id"].astype(str))
    eligible, input_report = prepare_eligible_events(
        page_events,
        flyer_downloads,
        valid_area_ids,
        period_start,
        period_end,
    )
    label = args.dataset_label or f"Web behavior pilot through {period_end.isoformat()}"
    dataset_id = str(
        uuid5(
            NAMESPACE_URL,
            f"{SCORING_VERSION}:{period_start}:{period_end}:{label}",
        )
    )
    area_demand = build_area_demand(eligible, structural, dataset_id, thresholds)
    shadow_scores = build_shadow_scores(
        area_demand, structural, args.digital_weight
    )
    dataset = build_dataset_record(
        dataset_id,
        label,
        period_start,
        period_end,
        args.window_days,
        thresholds,
        input_report,
        area_demand,
    )
    quality_report = {
        "dataset": dataset,
        "input_validation": input_report,
        "guardrails": {
            "production_gap_score_modified": False,
            "raw_analytics_public": False,
            "legacy_events_eligible": False,
            "maximum_digital_weight": 0.25,
        },
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    area_demand.to_csv(args.output_dir / "digital_demand_area.csv", index=False)
    shadow_scores.to_csv(
        args.output_dir / "priority_score_v2_shadow.csv", index=False
    )
    (args.output_dir / "quality_report.json").write_text(
        json.dumps(quality_report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    if args.publish:
        if not supabase_url or not supabase_secret_key:
            raise SystemExit(
                "Set VITE_SUPABASE_URL and SUPABASE_SECRET_KEY before using --publish"
            )
        publish_supabase_results(
            supabase_url,
            supabase_secret_key,
            dataset,
            area_demand,
            shadow_scores,
        )
    print(
        f"Built {len(area_demand)} area rows; quality={dataset['quality_status']}; "
        f"eligible_events={input_report['eligible_events']}; "
        f"output={args.output_dir}"
    )


if __name__ == "__main__":
    main()
