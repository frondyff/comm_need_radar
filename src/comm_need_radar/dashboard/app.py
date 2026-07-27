from __future__ import annotations

from pathlib import Path
import re
import sys

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "src"))

from comm_need_radar.config.paths import (  # noqa: E402
    ACCESSIBILITY_TABLE_PATH,
    AREA_PROFILE_PATH,
    GAP_SCORE_PATH,
    MONITORING_SUMMARY_PATH,
    SERVICE_TABLE_PATH,
)
from comm_need_radar.scoring.metrics import haversine_km  # noqa: E402

st.set_page_config(page_title="Community Needs Radar MVP", layout="wide")

POSTAL_AREA_LOOKUP = {
    "H1E": "Riviere-des-Prairies",
    "H1H": "Montreal-Nord",
    "H1W": "Hochelaga",
    "H2J": "Plateau Mont-Royal",
    "H2M": "Ahuntsic",
    "H3K": "Pointe-Saint-Charles",
    "H3N": "Parc Extension",
    "H3S": "Cote-des-Neiges",
    "H3Y": "Westmount",
    "H4G": "Verdun",
    "H8S": "Lachine",
}

VULNERABILITY_TYPES = [
    ("income_indicator", "Income", "Income pressure"),
    ("age_indicator", "Age", "Age-related support"),
    ("language_indicator", "Language", "Language access"),
    ("immigration_indicator", "Newcomer", "Newcomer support"),
    ("housing_indicator", "Housing", "Housing pressure"),
]

VULNERABILITY_DETAILS = {
    "income_indicator": {
        "description": "Signals pressure from lower-income conditions and cost sensitivity.",
        "analysis_focus": "Look for food, employment, legal, and benefits-navigation supports near the client area.",
        "service_categories": ["Food Support", "Employment", "Legal Aid", "General Support"],
        "questions": "Ask about immediate food needs, job search barriers, income benefits, and documentation support.",
    },
    "age_indicator": {
        "description": "Signals higher need for age-related services and daily-living supports.",
        "analysis_focus": "Check whether senior, health, transportation, and general support services are close enough.",
        "service_categories": ["Senior Support", "General Support", "Mental Health"],
        "questions": "Ask about mobility, caregiver support, isolation, appointment access, and home-safety needs.",
    },
    "language_indicator": {
        "description": "Signals potential language-access barriers when finding or using services.",
        "analysis_focus": "Prioritize multilingual services, intake support, interpretation, and plain-language referrals.",
        "service_categories": ["Newcomer Support", "Legal Aid", "General Support", "Family Services"],
        "questions": "Ask preferred language, comfort with forms, interpretation needs, and digital access barriers.",
    },
    "immigration_indicator": {
        "description": "Signals newcomer-support needs and settlement navigation pressure.",
        "analysis_focus": "Prioritize settlement, employment, legal, family, and multilingual navigation services.",
        "service_categories": ["Newcomer Support", "Employment", "Legal Aid", "Family Services"],
        "questions": "Ask about settlement status, documents, school or childcare needs, work access, and social support.",
    },
    "housing_indicator": {
        "description": "Signals housing pressure, affordability stress, or instability risk.",
        "analysis_focus": "Check nearby housing clinics, legal aid, food support, and emergency stabilization resources.",
        "service_categories": ["Housing", "Legal Aid", "Food Support", "General Support"],
        "questions": "Ask about rent arrears, eviction notices, repair issues, crowding, and urgent safety concerns.",
    },
}


@st.cache_data
def load_data() -> dict[str, pd.DataFrame]:
    return {
        "areas": pd.read_csv(AREA_PROFILE_PATH),
        "services": pd.read_csv(SERVICE_TABLE_PATH),
        "accessibility": pd.read_csv(ACCESSIBILITY_TABLE_PATH),
        "gap": pd.read_csv(GAP_SCORE_PATH),
        "monitoring": pd.read_csv(MONITORING_SUMMARY_PATH),
    }


def normalize_lookup(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def resolve_area_search(search_text: str, areas: pd.DataFrame) -> tuple[str | None, str | None]:
    query = search_text.strip()
    if not query:
        return None, None

    postal = re.sub(r"[^A-Za-z0-9]", "", query).upper()
    if len(postal) >= 3 and postal[:3] in POSTAL_AREA_LOOKUP:
        area_name = POSTAL_AREA_LOOKUP[postal[:3]]
        return area_name, f"{postal[:3]} matched to {area_name}"

    normalized_query = normalize_lookup(query)
    for _, area in areas.sort_values("area_name").iterrows():
        area_name = str(area.area_name)
        borough_name = str(area.borough_name)
        if normalized_query in normalize_lookup(area_name):
            return area_name, area_name
        if normalized_query in normalize_lookup(borough_name):
            return area_name, borough_name

    return None, None


def vulnerability_level(score: float) -> str:
    if score >= 75:
        return "Very high"
    if score >= 60:
        return "High"
    if score >= 45:
        return "Moderate"
    return "Lower"


def top_vulnerability_type(area: pd.Series) -> tuple[str, str, float]:
    column, short_label, full_label = max(
        VULNERABILITY_TYPES, key=lambda item: float(area[item[0]])
    )
    return short_label, full_label, float(area[column])


def top_vulnerability_column(area: pd.Series) -> str:
    return max(VULNERABILITY_TYPES, key=lambda item: float(area[item[0]]))[0]


def vulnerability_metadata(column_name: str) -> tuple[str, str]:
    for column, short_label, full_label in VULNERABILITY_TYPES:
        if column == column_name:
            return short_label, full_label
    raise ValueError(f"Unknown vulnerability column: {column_name}")


def vulnerability_rank(areas: pd.DataFrame, column_name: str, area_id: str) -> int:
    ranked = areas.sort_values(column_name, ascending=False).reset_index(drop=True)
    match = ranked.index[ranked["area_id"] == area_id].tolist()
    return match[0] + 1 if match else len(ranked)


def services_for_vulnerability(services: pd.DataFrame, column_name: str) -> pd.DataFrame:
    categories = VULNERABILITY_DETAILS[column_name]["service_categories"]
    return services[services["service_category"].isin(categories)].sort_values("distance_km")


def chart_selected_id(chart_event: object) -> str | None:
    if not chart_event:
        return None

    selection = getattr(chart_event, "selection", None)
    if selection is None and isinstance(chart_event, dict):
        selection = chart_event.get("selection")
    if not selection:
        return None

    points = getattr(selection, "points", None)
    if points is None and isinstance(selection, dict):
        points = selection.get("points")
    if not points:
        return None

    first_point = points[0]
    customdata = getattr(first_point, "customdata", None)
    if customdata is None and isinstance(first_point, dict):
        customdata = first_point.get("customdata")
    if isinstance(customdata, list) and customdata:
        return str(customdata[0])
    if customdata:
        return str(customdata)
    return None


def map_center(*frames: pd.DataFrame) -> dict[str, float]:
    coords = pd.concat([frame[["latitude", "longitude"]] for frame in frames if not frame.empty])
    return {"lat": float(coords["latitude"].mean()), "lon": float(coords["longitude"].mean())}


def build_priority_map(areas: pd.DataFrame, selected_area_id: str | None) -> go.Figure:
    center = map_center(areas)
    selected = areas[areas["area_id"] == selected_area_id]
    marker_sizes = areas["gap_score"].clip(lower=12) / areas["gap_score"].max() * 34

    fig = go.Figure()
    fig.add_trace(
        go.Scattermap(
            lat=areas["latitude"],
            lon=areas["longitude"],
            mode="markers",
            customdata=areas[["area_id"]],
            text=areas["area_name"],
            marker={
                "size": marker_sizes,
                "color": areas["gap_score"],
                "colorscale": "YlOrRd",
                "showscale": True,
                "colorbar": {"title": "Gap"},
                "opacity": 0.78,
            },
            hovertemplate=(
                "<b>%{text}</b><br>"
                "Gap score: %{marker.color:.1f}<br>"
                "Click to inspect this area<extra></extra>"
            ),
            name="Priority areas",
        )
    )
    if not selected.empty:
        fig.add_trace(
            go.Scattermap(
                lat=selected["latitude"],
                lon=selected["longitude"],
                mode="markers",
                customdata=selected[["area_id"]],
                text=selected["area_name"],
                marker={"size": 38, "color": "#1f77b4", "opacity": 0.95},
                hovertemplate="<b>%{text}</b><br>Selected area<extra></extra>",
                name="Selected area",
            )
        )

    fig.update_layout(
        height=470,
        margin={"l": 0, "r": 0, "t": 4, "b": 0},
        map={"style": "open-street-map", "center": center, "zoom": 9.5},
        legend={"orientation": "h", "y": 0.01, "x": 0.01},
    )
    return fig


def build_service_map(
    area: pd.Series, services: pd.DataFrame, selected_service_id: str | None
) -> go.Figure:
    center = map_center(pd.DataFrame([area]), services)
    selected = services[services["service_id"] == selected_service_id]

    fig = go.Figure()
    fig.add_trace(
        go.Scattermap(
            lat=services["latitude"],
            lon=services["longitude"],
            mode="markers",
            customdata=services[["service_id"]],
            text=services["service_name"],
            marker={
                "size": 13,
                "color": services["distance_km"],
                "colorscale": "Viridis",
                "showscale": True,
            },
            hovertemplate=(
                "<b>%{text}</b><br>"
                "%{customdata[0]}<br>"
                "Distance: %{marker.color:.1f} km<br>"
                "Click for service details<extra></extra>"
            ),
            name="Services",
        )
    )
    fig.add_trace(
        go.Scattermap(
            lat=[area.latitude],
            lon=[area.longitude],
            mode="markers",
            customdata=[[area.area_id]],
            text=[area.area_name],
            marker={"size": 24, "color": "#d62728"},
            hovertemplate="<b>%{text}</b><br>Client area<extra></extra>",
            name="Client area",
        )
    )
    if not selected.empty:
        fig.add_trace(
            go.Scattermap(
                lat=selected["latitude"],
                lon=selected["longitude"],
                mode="markers",
                customdata=selected[["service_id"]],
                text=selected["service_name"],
                marker={"size": 24, "color": "#111827"},
                hovertemplate="<b>%{text}</b><br>Selected service<extra></extra>",
                name="Selected service",
            )
        )

    fig.update_layout(
        height=450,
        margin={"l": 0, "r": 0, "t": 4, "b": 0},
        map={"style": "open-street-map", "center": center, "zoom": 10},
        legend={"orientation": "h", "y": 0.01, "x": 0.01},
    )
    return fig


def add_service_distances(area: pd.Series, services: pd.DataFrame) -> pd.DataFrame:
    enriched = services.copy()
    enriched["distance_km"] = enriched.apply(
        lambda row: haversine_km(area.latitude, area.longitude, row.latitude, row.longitude),
        axis=1,
    )
    return enriched.sort_values("distance_km")


def format_priority_rows(rows: pd.DataFrame) -> str:
    lines = []
    for _, row in rows.iterrows():
        lines.append(
            f"- {row.area_name}: gap {row.gap_score:.1f}, "
            f"vulnerability {row.vulnerability_score:.1f}, access {row.overall_accessibility_score:.1f}"
        )
    return "\n".join(lines)


def policy_assistant_response(
    prompt: str,
    data: dict[str, pd.DataFrame],
    selected_area: str,
    service_category: str,
) -> str:
    gap = data["gap"]
    accessibility = data["accessibility"]
    services = data["services"]
    query = prompt.lower()
    selected_profile = gap[gap["area_name"] == selected_area].iloc[0]

    if any(term in query for term in ["top", "priority", "prioritize", "highest", "rank"]):
        top_rows = gap.sort_values("gap_rank").head(5)
        return (
            "Top policy priority areas in the synthetic MVP data:\n"
            f"{format_priority_rows(top_rows)}\n\n"
            "A practical first action is to review the lowest-access service categories in the top "
            "three areas, then compare whether existing providers are close enough for outreach or funding."
        )

    if any(term in query for term in ["borough", "district", "compare"]):
        borough_summary = (
            gap.groupby("borough_name", as_index=False)
            .agg(
                avg_gap_score=("gap_score", "mean"),
                avg_vulnerability=("vulnerability_score", "mean"),
                high_priority_areas=("priority_flag", lambda values: int((values == "High priority").sum())),
            )
            .sort_values(["high_priority_areas", "avg_gap_score"], ascending=[False, False])
            .head(5)
        )
        lines = [
            f"- {row.borough_name}: avg gap {row.avg_gap_score:.1f}, "
            f"avg vulnerability {row.avg_vulnerability:.1f}, high-priority areas {row.high_priority_areas}"
            for _, row in borough_summary.iterrows()
        ]
        return "Borough comparison from the synthetic data:\n" + "\n".join(lines)

    area_access = accessibility[accessibility["area_id"] == selected_profile.area_id]
    if service_category != "All":
        area_access = area_access[area_access["service_category"] == service_category]
    lowest_access = area_access.sort_values("accessibility_score").head(3)

    if any(term in query for term in ["service", "access", "gap", "category", "nearby"]):
        lines = [
            f"- {row.service_category}: access score {row.accessibility_score:.1f}, "
            f"nearest service {row.nearest_service_distance_km:.1f} km, "
            f"{int(row.service_count_within_threshold)} within threshold"
            for _, row in lowest_access.iterrows()
        ]
        return (
            f"For {selected_area}, the weakest service-access categories are:\n"
            f"{chr(10).join(lines)}\n\n"
            "Use this to decide whether the policy response should fund a new service point, mobile outreach, "
            "transport support, or better referral navigation."
        )

    if any(term in query for term in ["why", "driver", "explain", "summary"]):
        return (
            f"{selected_area} ranks #{int(selected_profile.gap_rank)} with a gap score of "
            f"{selected_profile.gap_score:.1f}. {selected_profile.summary_en}\n\n"
            f"Main score drivers: {selected_profile.gap_drivers}."
        )

    if any(term in query for term in ["fund", "budget", "intervention", "recommend", "action"]):
        relevant_services = services.copy()
        relevant_services["distance_km"] = relevant_services.apply(
            lambda row: haversine_km(
                selected_profile.latitude,
                selected_profile.longitude,
                row.latitude,
                row.longitude,
            ),
            axis=1,
        )
        nearby_count = int((relevant_services["distance_km"] <= 2.5).sum())
        weakest = lowest_access.iloc[0] if not lowest_access.empty else None
        weakest_text = (
            f"The weakest category is {weakest.service_category} with access score "
            f"{weakest.accessibility_score:.1f}."
            if weakest is not None
            else "No weak category is available under the current filter."
        )
        return (
            f"Recommended policy action for {selected_area}: focus on targeted access improvement. "
            f"{weakest_text} There are {nearby_count} synthetic services within 2.5 km across all categories.\n\n"
            "Policy options: fund additional capacity in the weakest category, add mobile outreach, "
            "coordinate referrals with nearby providers, and track whether nearest-service distance improves."
        )

    return (
        "I can answer policy questions using the synthetic MVP tables. Try asking about top priority areas, "
        f"why {selected_area} is ranked where it is, weakest service categories, borough comparisons, "
        "or recommended funding actions."
    )


def policymaker_chatbot(
    data: dict[str, pd.DataFrame],
    selected_area: str,
    service_category: str,
) -> None:
    st.subheader("Policymaker Assistant")
    st.caption("Local synthetic-data assistant. It answers from the dashboard tables and does not call an external model.")

    if "policy_chat_messages" not in st.session_state:
        st.session_state["policy_chat_messages"] = [
            {
                "role": "assistant",
                "content": (
                    "Ask about priority areas, access gaps, borough comparisons, or policy actions. "
                    "Responses are generated from the processed synthetic data."
                ),
            }
        ]

    suggested_prompts = [
        "What are the top priority areas?",
        f"Why is {selected_area} a priority?",
        f"What should policymakers fund in {selected_area}?",
    ]
    prompt_columns = st.columns(len(suggested_prompts))
    for column_ui, suggested_prompt in zip(prompt_columns, suggested_prompts):
        if column_ui.button(suggested_prompt, key=f"policy_prompt_{normalize_lookup(suggested_prompt)}"):
            st.session_state["policy_chat_messages"].append(
                {"role": "user", "content": suggested_prompt}
            )
            st.session_state["policy_chat_messages"].append(
                {
                    "role": "assistant",
                    "content": policy_assistant_response(
                        suggested_prompt, data, selected_area, service_category
                    ),
                }
            )
            st.rerun()

    for message in st.session_state["policy_chat_messages"]:
        with st.chat_message(message["role"]):
            st.write(message["content"])

    prompt = st.chat_input("Ask a policymaker question about priorities or service gaps")
    if prompt:
        st.session_state["policy_chat_messages"].append({"role": "user", "content": prompt})
        st.session_state["policy_chat_messages"].append(
            {
                "role": "assistant",
                "content": policy_assistant_response(prompt, data, selected_area, service_category),
            }
        )
        st.rerun()


def planner_view(data: dict[str, pd.DataFrame]) -> None:
    st.header("Planner / Organization View")
    gap = data["gap"]
    services = data["services"]
    accessibility = data["accessibility"]

    boroughs = ["All"] + sorted(gap["borough_name"].unique())
    selected_borough = st.sidebar.selectbox("Borough", boroughs)
    min_gap = st.sidebar.slider("Minimum gap score", 0, 100, 0)
    service_category = st.sidebar.selectbox(
        "Service category", ["All"] + sorted(accessibility["service_category"].unique())
    )
    catchment_radius = st.sidebar.slider("Catchment radius km", 1.0, 10.0, 2.5, 0.5)

    filtered = gap[gap["gap_score"] >= min_gap]
    if selected_borough != "All":
        filtered = filtered[filtered["borough_name"] == selected_borough]
    if filtered.empty:
        st.warning("No areas match the current filters.")
        return

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Areas", len(filtered))
    c2.metric("High priority", int((filtered["priority_flag"] == "High priority").sum()))
    c3.metric("Avg vulnerability", f"{filtered['vulnerability_score'].mean():.1f}")
    c4.metric("Avg access", f"{filtered['overall_accessibility_score'].mean():.1f}")

    area_names = filtered["area_name"].tolist()
    selected_area = st.session_state.get("planner_selected_area", area_names[0])
    if selected_area not in area_names:
        selected_area = area_names[0]

    selected_area = st.selectbox("Area profile", area_names, index=area_names.index(selected_area))
    st.session_state["planner_selected_area"] = selected_area
    selected_area_id = filtered.loc[filtered["area_name"] == selected_area, "area_id"].iloc[0]

    st.subheader("Interactive Priority Map")
    priority_event = st.plotly_chart(
        build_priority_map(filtered, selected_area_id),
        width="stretch",
        key="planner_priority_map",
        on_select="rerun",
        selection_mode="points",
    )
    clicked_area_id = chart_selected_id(priority_event)
    if clicked_area_id in set(filtered["area_id"]) and clicked_area_id != selected_area_id:
        selected_area = filtered.loc[filtered["area_id"] == clicked_area_id, "area_name"].iloc[0]
        st.session_state["planner_selected_area"] = selected_area
        st.rerun()

    profile = gap[gap["area_name"] == selected_area].iloc[0]
    nearby = add_service_distances(profile, services)
    if service_category != "All":
        nearby = nearby[nearby["service_category"] == service_category]
    within_radius = nearby[nearby["distance_km"] <= catchment_radius]

    p1, p2, p3 = st.columns(3)
    p1.metric("Services in radius", len(within_radius))
    p2.metric("Nearest service", f"{nearby['distance_km'].min():.1f} km" if not nearby.empty else "n/a")
    p3.metric("Selected radius", f"{catchment_radius:.1f} km")

    st.subheader(selected_area)
    st.write(profile["summary_en"])
    st.write(f"Drivers: {profile['gap_drivers']}")

    access_rows = accessibility[accessibility["area_id"] == profile.area_id].sort_values("accessibility_score")
    if service_category != "All":
        access_rows = access_rows[access_rows["service_category"] == service_category]
    st.dataframe(
        access_rows[
            [
                "service_category",
                "nearest_service_distance_km",
                "service_count_within_threshold",
                "accessibility_score",
                "accessibility_method",
            ]
        ],
        width="stretch",
        hide_index=True,
    )

    st.dataframe(
        nearby.sort_values("distance_km")[
            ["service_name", "service_category", "address", "phone", "language", "distance_km"]
        ].head(8),
        width="stretch",
        hide_index=True,
    )

    st.subheader("Priority Ranking")
    st.dataframe(
        filtered[
            [
                "gap_rank",
                "area_name",
                "borough_name",
                "vulnerability_score",
                "overall_accessibility_score",
                "gap_score",
                "priority_flag",
                "gap_drivers",
            ]
        ],
        width="stretch",
        hide_index=True,
    )

    policymaker_chatbot(data, selected_area, service_category)


def frontline_view(data: dict[str, pd.DataFrame]) -> None:
    st.header("Frontline / Community View")
    gap = data["gap"]
    areas = data["areas"]
    services = data["services"]

    area_options = gap.sort_values("area_name")["area_name"].tolist()
    if "frontline_area" not in st.session_state or st.session_state["frontline_area"] not in area_options:
        st.session_state["frontline_area"] = area_options[0]

    search_text = st.text_input(
        "Postal code or community area",
        placeholder="H3N 1X1 or Parc Extension",
    )
    matched_area, matched_label = resolve_area_search(search_text, gap)
    if matched_area:
        st.session_state["frontline_area"] = matched_area
        st.caption(f"Matched: {matched_label}")
    elif search_text.strip():
        st.warning("No synthetic area match found.")

    c1, c2, c3 = st.columns([1.2, 1.2, 0.8])
    selected_area = c1.selectbox("Community area", area_options, key="frontline_area")
    selected_category = c2.selectbox(
        "Service category", ["All"] + sorted(services["service_category"].unique())
    )
    selected_language = c3.selectbox("Flyer language", ["English", "French"])
    radius_km = st.slider("Service search radius km", 1.0, 12.0, 5.0, 0.5)

    profile = gap[gap["area_name"] == selected_area].iloc[0]
    area_detail = areas[areas["area_id"] == profile.area_id].iloc[0]
    all_services_by_distance = add_service_distances(profile, services)
    primary_column = top_vulnerability_column(area_detail)
    primary_short, primary_full, primary_score = top_vulnerability_type(area_detail)
    valid_vulnerability_columns = {column for column, _, _ in VULNERABILITY_TYPES}
    if st.session_state.get("frontline_card_area") != selected_area:
        st.session_state["frontline_vulnerability_card"] = primary_column
        st.session_state["frontline_card_area"] = selected_area
    if st.session_state.get("frontline_vulnerability_card") not in valid_vulnerability_columns:
        st.session_state["frontline_vulnerability_card"] = primary_column

    st.subheader("Area Profile")
    profile_card, metric_card_1, metric_card_2 = st.columns([1.4, 1, 1])
    with profile_card.container(border=True):
        st.metric("Vulnerability type", primary_short, f"{primary_score:.0f}/100")
        st.write(primary_full)
        st.caption(f"{vulnerability_level(primary_score)} need")
    with metric_card_1.container(border=True):
        st.metric("Gap score", f"{profile.gap_score:.1f}", profile.priority_flag)
        st.caption(f"Rank {int(profile.gap_rank)}")
    with metric_card_2.container(border=True):
        st.metric("Population", f"{int(area_detail.population):,}")
        st.caption(profile.borough_name)

    selected_vulnerability = st.session_state["frontline_vulnerability_card"]
    type_columns = st.columns(len(VULNERABILITY_TYPES))
    for column_ui, (column_name, short_label, full_label) in zip(type_columns, VULNERABILITY_TYPES):
        score = float(area_detail[column_name])
        is_selected = column_name == selected_vulnerability
        with column_ui.container(border=True):
            st.metric(short_label, f"{score:.0f}")
            st.progress(score / 100)
            st.caption(f"{vulnerability_level(score)} | {full_label}")
            if st.button(
                "Selected" if is_selected else "Details",
                key=f"frontline_vulnerability_{column_name}",
                type="primary" if is_selected else "secondary",
                width="stretch",
            ):
                selected_vulnerability = column_name
                st.session_state["frontline_vulnerability_card"] = column_name

    selected_short, selected_full = vulnerability_metadata(selected_vulnerability)
    selected_score = float(area_detail[selected_vulnerability])
    comparison_average = float(areas[selected_vulnerability].mean())
    comparison_delta = selected_score - comparison_average
    selected_rank = vulnerability_rank(areas, selected_vulnerability, str(profile.area_id))
    detail = VULNERABILITY_DETAILS[selected_vulnerability]
    related_services = services_for_vulnerability(all_services_by_distance, selected_vulnerability).head(5)

    st.subheader("Card Detail")
    detail_left, detail_right = st.columns([1.4, 1])
    with detail_left.container(border=True):
        st.markdown(f"**{selected_full}**")
        st.write(detail["description"])
        detail_metrics = st.columns(3)
        detail_metrics[0].metric("Area score", f"{selected_score:.0f}/100", vulnerability_level(selected_score))
        detail_metrics[1].metric("Synthetic average", f"{comparison_average:.0f}/100", f"{comparison_delta:+.1f}")
        detail_metrics[2].metric("Area rank", f"{selected_rank} of {len(areas)}")
        st.write(detail["analysis_focus"])
        st.caption(detail["questions"])
    with detail_right.container(border=True):
        st.markdown("**Relevant service categories**")
        st.write(", ".join(detail["service_categories"]))
        if related_services.empty:
            st.caption("No matching services in the synthetic service table.")
        else:
            st.dataframe(
                related_services[["service_name", "service_category", "distance_km"]].reset_index(drop=True),
                width="stretch",
                hide_index=True,
            )

    filtered = all_services_by_distance.copy()
    if selected_category != "All":
        filtered = filtered[filtered["service_category"] == selected_category]
    nearby = filtered[filtered["distance_km"] <= radius_km]
    mapped_services = nearby if not nearby.empty else filtered.head(10)

    selected_service_id = st.session_state.get("frontline_selected_service")
    if selected_service_id not in set(mapped_services["service_id"]):
        selected_service_id = mapped_services["service_id"].iloc[0] if not mapped_services.empty else None
        st.session_state["frontline_selected_service"] = selected_service_id

    st.subheader("Nearby Services")
    if mapped_services.empty:
        st.warning("No services match the selected filters.")
        return

    service_event = st.plotly_chart(
        build_service_map(profile, mapped_services, selected_service_id),
        width="stretch",
        key="frontline_service_map",
        on_select="rerun",
        selection_mode="points",
    )
    clicked_service_id = chart_selected_id(service_event)
    if clicked_service_id in set(mapped_services["service_id"]) and clicked_service_id != selected_service_id:
        st.session_state["frontline_selected_service"] = clicked_service_id
        st.rerun()

    selected_service = mapped_services[mapped_services["service_id"] == selected_service_id].iloc[0]
    s1, s2, s3 = st.columns(3)
    s1.metric("Services shown", len(mapped_services))
    s2.metric("Selected distance", f"{selected_service.distance_km:.1f} km")
    s3.metric("Radius", f"{radius_km:.1f} km")

    st.write(
        f"Selected service: {selected_service.service_name} | {selected_service.service_category} | "
        f"{selected_service.address} | {selected_service.phone}"
    )
    st.dataframe(
        mapped_services[
            ["service_name", "service_category", "address", "phone", "website", "language", "distance_km"]
        ].head(10),
        width="stretch",
        hide_index=True,
    )

    st.subheader("Printable Flyer")
    title = (
        "Nearby Community Services"
        if selected_language == "English"
        else "Services communautaires proches"
    )
    disclaimer = (
        "Synthetic MVP data. Confirm service details before referral. For emergencies, call local emergency services."
        if selected_language == "English"
        else (
            "Donnees synthetiques MVP. Confirmez les details avant une reference. "
            "En cas d'urgence, appelez les services d'urgence locaux."
        )
    )
    flyer_rows = []
    for _, row in mapped_services.head(5).iterrows():
        flyer_rows.append(
            f"- {row.service_name} | {row.service_category} | {row.address} | "
            f"{row.phone} | {row.distance_km:.1f} km"
        )
    st.code(
        "\n".join([title, f"Area: {selected_area}", "", *flyer_rows, "", disclaimer]),
        language="text",
    )


def monitoring_view(data: dict[str, pd.DataFrame]) -> None:
    st.header("Monitoring View")
    st.write("MVP monitoring focuses on data health, coverage, and project blockers.")
    st.dataframe(data["monitoring"], width="stretch", hide_index=True)

    status_counts = data["monitoring"].groupby("status", as_index=False).size()
    st.bar_chart(status_counts.set_index("status"))


def main() -> None:
    st.title("Community Needs Radar MVP")
    data = load_data()
    view = st.sidebar.radio(
        "View",
        ["Planner / Organization", "Frontline / Community", "Monitoring"],
    )
    if view == "Planner / Organization":
        planner_view(data)
    elif view == "Frontline / Community":
        frontline_view(data)
    else:
        monitoring_view(data)


if __name__ == "__main__":
    main()
