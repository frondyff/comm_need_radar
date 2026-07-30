# Planner guided chatbot

## Current production behavior

The Planner View includes a floating, guided, deterministic query interface.
It is not displayed in V1 Community View. Planner users choose from menus; each
answer comes from a supported Supabase query and displays the source table.

The production widget does **not** send free-text prompts to a language model,
does not require an LLM API key, and does not currently call `/api/chat`.

Implementation:

- `frontend/src/chatbot/ChatbotWidget.jsx` controls menus and session history.
- `frontend/src/chatbot/groundedChatbot.js` runs the browser-side Supabase
  queries.
- `frontend/src/App.jsx` supplies the selected Planner area to the widget.

## Supported questions

| Menu | Examples | Source |
| --- | --- | --- |
| Find services | Category, area, and audience-filtered organizations | `services_master` |
| Service demand | Category interest in an area or highest-demand areas | `observed_need_category_summary` |
| About an area | Structural vulnerability, relative service accessibility, POC gap, source geography, and aggregate demand | `area_profile`, `gap_score`, `observed_need_index` |
| City-wide rankings | Highest structural vulnerability, relative gap rank, immigration pressure, or income pressure | `area_profile`, `gap_score` |

Scoring responses name `STRUCT-01`, `GAP-CANON-02`, and `CLASS-TOP5-02`, and
omit the synthetic population claim. The Planner chatbot calls ranks 1–5
**High-priority candidates (POC)** and states that this is a relative planning
label, not a policy or funding decision. Ranks 6–12 receive no priority label;
the historical High/Watch/Lower thresholds remain retired. The authoritative
formula status is
the [production scoring contract](reference/scoring/production-scoring-contract.md).

The chatbot offers all 12 areas and can also use the area selected on the
Planner map. Service answers are capped at 20 displayed organizations and show
the total count when more matches exist.

Demand answers read the stored `source_type` or `observed_data_basis`. If the
materialization is web-observed, answers say anonymous website sessions; they
must not call those events resident visits or partner encounters.

## Data and safety boundary

The widget uses the same public Supabase configuration as the dashboard:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

It only runs predefined selects against public application tables. There is no
free-text case-note field, model context, persistent chat profile, or user
authentication in the current proof of concept.

The chatbot is not suitable for:

- emergencies or crisis response;
- professional, legal, medical, or immigration advice;
- eligibility decisions;
- complete provider availability or wait-time information;
- individual vulnerability assessment; or
- claims about population demand from website activity.

Users should confirm service details directly with the provider.

## Language behavior

The launcher greeting follows the application's English/French setting, but
the guided menus and generated answers are currently English-only. The
interface explicitly discloses this limitation.

## Optional server route

`frontend/api/chat.ts` is an experimental server-side route retained for
contract testing and possible future integration. It can use a configured LLM
or a deterministic fallback, but the shipped `ChatbotWidget` is not wired to
that route.

Treating the route as production would require a separate product decision,
privacy and threat review, bilingual behavior, prompt-injection testing,
source-citation rules, monitoring, and an explicit interface change. Server
secrets must never be placed in `VITE_` variables.

The Python menu and query scripts under `scripts/chatbot*.py` are analytical
and local references, not the production UI.

## Validate a change

```bash
cd frontend
npm ci
npm run validate:chatbot
npm run test:unit
npm run typecheck:api
npm run build
```

Manual verification should cover:

1. confirming the widget opens in Planner View and is absent from Community View;
2. selecting a map area and using that area in chat;
3. each of the four top-level menus;
4. source labels on every result;
5. empty, failed, and unconfigured Supabase states;
6. English/French limitation disclosure; and
7. session summary and close behavior.

Any new query must remain parameterized through the Supabase client, use an
approved public table, disclose its source, and be reflected in interface and
contract tests.
