# Sprint Review Agenda - July 16, 2026

**Duration:** 60 minutes
**Format:** Working demo, acceptance review, and next-sprint decisions
**Repository snapshot:** July 15, 2026

## Review Goals

1. Demonstrate the Supabase and real-boundary work merged in PRs #15-#17.
2. Decide whether Issues #6 and #8 meet acceptance criteria or need named
   follow-up actions before closure.
3. Confirm the remaining work and ownership for the canonical dashboard under
   Issues #5 and #7.
4. Agree on the next-sprint order for scoring, testing, assistant validation,
   chatbot deployment, and final handoff.

## Current Snapshot

- 14 open issues and no open pull requests.
- PR #15 merged the Supabase schema, RLS, atomic loader, and validation contract
  into `feature/scoring-and-geo_spatial`.
- PR #16 merged real boundary artifacts and spatial QA into
  `feature/scoring-and-geo_spatial`.
- PR #17 merged Supabase-backed scores and real boundaries into the canonical
  `feature/dashboard` frontend.
- PRs #18 and #19 were closed without merge; their deleted branches are not
  part of the delivered sprint scope.
- The default branch is `dev`; promotion of accepted feature work remains an
  explicit integration decision.

## Required Attendees

| Owner | Review responsibility |
| --- | --- |
| Chloe | Product acceptance, integration order, and release decision |
| Jessie | Canonical dashboard UX, runtime states, testing, and map interactions |
| Laura | Supabase, service contracts, production categories, and data governance |
| Frondy | Scoring, geospatial QA, data presentation, and contract review |
| Mariam | Assistant behavior, user testing, and presentation evidence |

## Agenda

### 1. Opening And Sprint Outcome - 5 minutes

**Lead:** Chloe

- Restate the sprint goal: connect the canonical dashboard to secured Supabase
  data and replace synthetic map envelopes with validated real geometry.
- Confirm that the review is for acceptance and prioritization, not live defect
  fixing.
- Confirm the branch promotion path from the feature branches to `dev`.

**Decision:** Agree on the integration branch and reviewer required before
accepted work is promoted.

### 2. Supabase Foundation Demo - 10 minutes

**Issues:** [#6](https://github.com/frondyff/comm_need_radar/issues/6)
**PR:** [#15](https://github.com/frondyff/comm_need_radar/pull/15)
**Demo leads:** Laura and Frondy

- Show the 19-table migration and read-only browser contract.
- Show owner and public validation results:
  - 12 areas and 12 gap scores.
  - 108 accessibility rows.
  - 4,255 services.
  - Anonymous writes denied and raw/source objects inaccessible.
- Explain transactional replacement, rollback behavior, and secret boundaries.

**Acceptance questions:**

- Is the remaining promotion to `dev` administrative, or is it required before
  Issue #6 can close?
- Does Laura accept the operations and recovery procedure?
- Does Frondy accept compatibility with the processed-data contracts?

**Required outcome:** Close Issue #6 or record one owner, one action, and one due
date for every unmet criterion.

### 3. Real Boundaries And Canonical Dashboard Demo - 12 minutes

**Issues:** [#8](https://github.com/frondyff/comm_need_radar/issues/8),
[#5](https://github.com/frondyff/comm_need_radar/issues/5)
**PRs:** [#16](https://github.com/frondyff/comm_need_radar/pull/16),
[#17](https://github.com/frondyff/comm_need_radar/pull/17)
**Demo leads:** Frondy and Jessie

- Demonstrate polygon selection in the canonical `feature/dashboard` UI.
- Confirm stable `A001`-`A012` selection IDs and live Supabase score coverage.
- Review spatial QA: zero overlaps, zero multiply matched records, and explicit
  reporting of records outside the study area.
- Show source attribution, boundary error behavior, and the 265 KB GeoJSON
  payload decision.
- Walk through Jessie's UX check for planner selection and frontline search.

**Required outcomes:**

- Jessie records pass/fail for the remaining Issue #8 UX acceptance criterion.
- Close Issue #8 if the interaction review passes.
- Chloe confirms whether the dashboard experience is accepted as the canonical
  product baseline for Issue #5.

### 4. Frontend Data Integration Gaps - 10 minutes

**Issue:** [#7](https://github.com/frondyff/comm_need_radar/issues/7)
**Leads:** Jessie, Laura, and Frondy

Review the eight findings from the current integration audit:

- Production category mapping.
- Source score scale versus normalized presentation.
- V1/V2 labeling pending Issue #9.
- Hardcoded planner KPIs.
- Distance from the selected distribution location.
- Visible loading, empty, error, retry, offline, and demo states.
- Bounded service queries and marker rendering.
- Explicit real-data versus demo-data labeling.

**Required outcome:** Convert the findings into a short delivery order with an
owner and acceptance test for each item. Do not close Issue #7 during this
review unless all eight findings have evidence.

### 5. Product And Data Decisions - 8 minutes

**Issues:** [#9](https://github.com/frondyff/comm_need_radar/issues/9),
[#10](https://github.com/frondyff/comm_need_radar/issues/10)
**Leads:** Frondy, Chloe, and Laura

- For Issue #9, review V1/V2 weight evidence, coverage bias, privacy-floor
  behavior, and the structural-only fallback.
- Chloe records one decision for V2 application use: approve, defer, or reject.
- For Issue #10, confirm that approved observed-needs data is still unavailable
  and that synthetic inputs remain clearly labeled.

**Required outcomes:** Record the Issue #9 decision or the exact evidence and
date needed to make it. Keep Issue #10 blocked unless data-sharing authority and
an approved export exist.

### 6. Next Sprint Commitment - 10 minutes

**Issues:** [#11](https://github.com/frondyff/comm_need_radar/issues/11),
[#12](https://github.com/frondyff/comm_need_radar/issues/12),
[#13](https://github.com/frondyff/comm_need_radar/issues/13),
[#14](https://github.com/frondyff/comm_need_radar/issues/14)

Proposed order:

1. Issue #11: frontend unit/E2E tests, CI, dependency gate, and bundle budget.
2. Issue #7: finish the audited production-data and runtime-state gaps.
3. Issue #14: assign Mariam, implement on the canonical frontend, deploy a
   Vercel preview, and validate grounded fallback behavior.
4. Issue #12: run 2-3 structured user sessions against the accepted frontend
   and assistant.
5. Issue #13: deploy the selected demo and complete report, presentation, and
   handoff evidence.

**Required outcome:** Confirm priorities, owners, due dates, and dependencies.
Issue #14 currently has no GitHub assignee and must leave the meeting assigned.

### 7. Close And Action Readback - 5 minutes

**Lead:** Chloe

- Read back every close/defer decision.
- Confirm owners and dates for all follow-up actions.
- Reconcile Issues #1-#4 under Issue #13 rather than starting unrelated work:
  branch protection follows Issue #11 CI; submission, MVP, and monitoring
  records are verified during final handoff.
- Confirm who updates issue checklists and the task-progress log after the
  meeting.

## Evidence To Prepare Before The Meeting

- **Laura:** Supabase owner/public validation output and refresh/recovery steps.
- **Frondy:** spatial QA summary and V1/V2 decision evidence.
- **Jessie:** canonical dashboard demo plus pass/fail notes for Issue #8 and the
  Issue #7 runtime-state gaps.
- **Mariam:** proposed assistant validation cases and user-test participant plan.
- **Chloe:** feature-to-`dev` promotion decision and release priority proposal.

## Decision Log Template

| Issue | Decision | Owner | Due date | Evidence/link |
| --- | --- | --- | --- | --- |
| #6 |  |  |  |  |
| #8 |  |  |  |  |
| #5 / #7 |  |  |  |  |
| #9 |  |  |  |  |
| #10 |  |  |  |  |
| #11 / #12 / #14 / #13 |  |  |  |  |
