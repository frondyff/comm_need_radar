# Community Radar chatbot

A simple, grounded, no-LLM assistant. It matches keywords in a question, runs a
query against the project database, and answers in plain language with the source
table shown on every reply. No API key, no cost, no maintenance, and it cannot
hallucinate: every answer comes from a real table, and anything it cannot map to
a supported query is declined instead of guessed.

## How to run

From the repository root:

```bash
cd comm_need_radar

# interactive (type 'quit' to stop)
python3 scripts/chatbot.py --chat

# a single question
python3 scripts/chatbot.py "list all the shelters in Verdun"
```

### Guided (decision-tree) mode

Instead of typing questions, the user picks from menus. Same grounded backend, so
every answer is accurate and shows its source, and the user can only ask what the
data supports (no misroutes, nothing to decline).

```bash
python3 scripts/chatbot_menu.py
```

The menu tree:

```
What would you like to know?
  1. Find services / organizations  -> category -> area -> group
  2. Service demand and visits      -> category -> (total visits / demand by area /
                                                    top centres / areas needing more)
  3. About an area                  -> area -> (overview / demographics / needs / demand)
  4. City-wide rankings             -> (most vulnerable / highest gap / most immigrants /
                                        lowest income / housing pressure)
```

For the frontend, wire buttons/dropdowns to the structured entry point (it returns
the same `(answer, source_table)`):

```python
from chatbot_menu import answer_structured
answer_structured("find_services", category="Shelter", area="Verdun",
                  audience={"immigrant": True})
answer_structured("demand", category="food", area="Verdun", metric="visits")
answer_structured("ranking", metric="vulnerable")
```

### Open-text mode

By default it reads the local `data/community_radar.sqlite` and needs only
Python's standard library. If `python3` is not found, use the Anaconda Python
(`/opt/anaconda3/bin/python3`).

To query the shared Supabase database instead of the local file, set one
environment variable and run the same commands (this path needs `sqlalchemy` and
`psycopg2`):

```bash
export DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-1-ca-central-1.pooler.supabase.com:5432/postgres"
python3 scripts/chatbot.py --chat
```

From Python (for the frontend or a notebook):

```python
import sys; sys.path.insert(0, "scripts")
from chatbot import answer
print(answer("How many food organizations serve immigrants in Cote-des-Neiges?"))
```

## What you can ask

Name a category (shelter, food, medical, legal, translation), a group, and/or one
of the 12 areas (Parc Extension, Saint-Michel, Cote-des-Neiges, Montreal-Nord,
Hochelaga, Verdun, Ahuntsic, Lachine, Westmount, Plateau Mont-Royal,
Pointe-Saint-Charles, Riviere-des-Prairies).

| Question type | Example | Source table |
| --- | --- | --- |
| List / count organizations | "list all shelters in Verdun" | `services_master` (real) |
| By group / gender / age | "organizations for Indigenous people", "services for women in Verdun" | `services_master` (real) |
| Total services | "how many services are there in total?" | `services_master` (real) |
| Visits / requests | "how many people received food assistance in Verdun?" | `observed_need_category_summary` (synthetic) |
| Highest demand by area | "which areas have the highest demand for legal services?" | `observed_need_category_summary` (synthetic) |
| Most-visited centres | "which shelters receive the most visitors?" | `v_visit_needs_by_center` (synthetic) |
| Areas needing more resources | "which areas most need additional medical resources?" | demand vs `services_master` |
| Area demographics | "what is the population of Hochelaga?", "which area has the most immigrants?" | `area_profile` (real) |
| Area vulnerability / gap | "how vulnerable is Ahuntsic?", "which areas have the highest service gap?" | `area_profile`, `gap_score` (real) |
| Area profile | "tell me about Hochelaga" | `area_profile` + `gap_score` + `observed_need_index` |

## Architecture

Two files:

- `scripts/chatbot_queries.py` (data layer): one `rows()` gateway to the database
  (SQLite locally, Supabase if `DATABASE_URL` is set), detectors that turn text
  into filters (category, area, audience), and one function per answer type. Each
  function returns `(answer_text, source_table)`.
- `scripts/chatbot.py` (router): `answer()` applies guardrails, matches one intent
  by keywords, calls the query function, and formats the reply with its source.

```
question -> chatbot.py answer()
              guardrails (out of scope / not collected)
              parse: category, area, audience
              match one intent (services / visits / demand / demographics /
                                 vulnerability / gap / area profile)
              -> chatbot_queries.py function
              -> rows(sql) -> SQLite or Supabase
              -> (answer, source table)
              -> "answer + Source (table): ..."
```

The router only selects a query function; it never writes an answer itself. Every
answer therefore comes from a real table.

## Grounding and honesty

- Every answer shows its source table, and whether that table is real (services,
  demographics, vulnerability, gap) or synthetic (visit and demand data).
- Questions the database does not collect (occupancy, day-of-week demand,
  case-resolution time, specific languages) are declined, not guessed.
- Out-of-scope questions (weather, advice, etc.) are politely refused.

## Known limitations

- The visit and demand answers use the synthetic visitor layer, since no public
  service-usage data exists. This is labelled on every such answer.
- The group / gender / age filters come from a keyword-based classification, so
  group and gender are reliable while the age filter is broad.
- Being keyword-based, an unusual phrasing may not match a supported query. When
  that happens it declines and lists what it can answer, rather than inventing.
