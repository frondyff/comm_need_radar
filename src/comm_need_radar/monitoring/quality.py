from __future__ import annotations

import csv
from pathlib import Path


def missing_count(rows: list[dict[str, object]], column: str) -> int:
    return sum(1 for row in rows if row.get(column) in (None, ""))


def unique_count(rows: list[dict[str, object]], column: str) -> int:
    return len({row[column] for row in rows})


def write_monitoring_summary(path: Path, summary_rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["check_name", "status", "value", "details"])
        writer.writeheader()
        writer.writerows(summary_rows)


def role_activity_rows() -> list[dict[str, str]]:
    return [
        {"date":"2026-06-11","owner":"Chloe","role":"Product / project lead","activity":"Locked MVP scope around synthetic data, local run, and optional cloud path","output":"docs/project-definition.md","decision_or_blocker":"Real public data deferred","next_step":"Open implementation issues"},
        {"date":"2026-06-11","owner":"Laura","role":"Data engineering lead","activity":"Created synthetic area and service source contracts","output":"data/raw/*.csv","decision_or_blocker":"211 access not needed for MVP","next_step":"Replace synthetic data later"},
        {"date":"2026-06-11","owner":"Frondy","role":"Geospatial / analytics lead","activity":"Implemented vulnerability, accessibility, and gap scoring","output":"data/processed/gap_score_table.csv","decision_or_blocker":"2.5 km threshold selected","next_step":"Validate with real geography later"},
        {"date":"2026-06-11","owner":"Jessie","role":"Dashboard / app lead","activity":"Built Planner, Frontline, Monitoring, and Activity Log views","output":"src/comm_need_radar/dashboard/app.py","decision_or_blocker":"Streamlit dependency required locally","next_step":"Test with users"},
        {"date":"2026-06-11","owner":"Mariam","role":"AI / insight / presentation lead","activity":"Added data-grounded area summaries and user-test notes","output":"summary_en and summary_fr fields","decision_or_blocker":"Full chatbot deferred","next_step":"Use summaries in presentation"},
        {"date":"2026-06-11","owner":"Chloe","role":"Integration lead","activity":"Verified local scripts and tests","output":"README and tests","decision_or_blocker":"Cloud deployment optional","next_step":"Prepare final demo script"},
    ]
