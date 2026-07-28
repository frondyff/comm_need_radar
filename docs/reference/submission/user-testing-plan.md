# Structured User-Testing Plan

This plan supports issue #12. Do not mark that issue complete until at least
two representative non-technical users have completed the sessions below.

## Participants And Safety

- Recruit 2–3 participants who represent frontline/community and
  planner/funder perspectives.
- Do not collect names, case notes, immigration status, health information, or
  other personal data.
- Record only role type, task outcome, observed confusion, and optional
  non-identifying comments.
- Tell participants that observed-needs/V2 data is synthetic and experimental.

## Critical Tasks

### Frontline / Community

1. Choose a distribution location.
2. Find a food, medical, shelter, legal, or translation service.
3. Change distance and audience filters.
4. Select a service and verify address, contact details, hours, and source.
5. Generate and download the one-page flyer.

### Planner

1. Identify the highest current gap-score area.
2. Select a different area using the boundary map.
3. Explain the difference between raw census percentages, normalized bar
   widths, vulnerability, accessibility, and gap score.
4. Ask the assistant for a citywide ranking and verify the answer against the
   visible table.
5. Identify which outputs are real census/service data and which remain
   synthetic or experimental.

## Ground-Truth Checklist

Validate each assistant answer against:

- `gap_score`: priority, rank, vulnerability, accessibility, and gap values;
- `area_vulnerability_index_real`: income, shelter burden, immigration details;
- `services_master`: service identity, category, location, hours, and sources;
- documented limitations: no eligibility decisions, appointment booking,
  funding allocation, or production use of synthetic observed need.

## Findings Template

| Participant | Role | Task | Completed | Finding type | Severity | Evidence | Follow-up issue |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | Frontline |  |  | usability / data misunderstanding / request |  |  |  |
| P2 | Planner |  |  | usability / data misunderstanding / request |  |  |  |
| P3 | Optional |  |  | usability / data misunderstanding / request |  |  |  |

## Exit Criteria

- At least 2 participants complete all critical tasks.
- Every incorrect or overstated assistant answer becomes a linked issue.
- Findings explicitly separate usability defects, data misunderstandings, and
  feature requests.
- The final presentation summarizes the prioritized findings without PII.
