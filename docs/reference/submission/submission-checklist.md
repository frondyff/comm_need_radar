# Submission checklist

## Repository and documentation

- [x] Root README explains what the tool is, how to run it, and how it works.
- [x] V1, V2, and chatbot behavior have canonical guides.
- [x] Current references are separated from historical planning documents.
- [x] Relative documentation links and stale canonical wording are checked in CI.
- [x] React/Vite is identified as the only supported local and production UI.
- [x] Branch and release responsibilities for `dev` and `main` are documented.

## Product and data

- [x] Statistics Canada structural indicators and suppression handling are documented.
- [x] Official boundaries and the A001/A002 derived partition are documented and validated.
- [x] V1 uses the canonical 3,664-row `services_master` directory.
- [x] Planner detail bars use real Census-derived fields.
- [x] Production vulnerability, accessibility, gap, rank, and priority formulas are documented.
- [x] Demo fallback and generated visitor-tag inputs are explicitly labelled synthetic.
- [x] `page_events` and `flyer_downloads` are documented as digital-demand signals only.
- [x] Browser analytics remain anonymous, insert-only, and excluded below `k >= 5`.
- [x] Production `gap_score` remains unchanged by web behavior.

## Validation and release

- [x] Python unit, scoring-bias, and spatial validation exist.
- [x] Frontend unit, contract, boundary, build, and production grill automation exist.
- [x] Vercel production deployment and guarded promotion workflow exist.
- [x] A 2026-07-28 no-publish dry run confirmed 0 of 12 reviewable areas and structural fallback.
- [ ] Complete documented sessions with 2–3 representative non-technical users.
- [ ] Record workstream-owner review of the submission.
- [ ] Approve, defer, or reject any future observed-demand application integration.

Unchecked items are explicit follow-up work, not hidden production assumptions.

## Evidence

- Product entrypoint: [`../../../README.md`](../../../README.md)
- V1: [`../../v1-frontline.md`](../../v1-frontline.md)
- V2 and scoring decision: [`../../v2-planner.md`](../../v2-planner.md)
- Chatbot: [`../../chatbot.md`](../../chatbot.md)
- Census and suppression: [`../data/census-variable-dictionary.md`](../data/census-variable-dictionary.md)
- Boundaries and joins: [`../data/spatial-join-validation.md`](../data/spatial-join-validation.md)
- Service inventory: [`../data/DATA_INVENTORY.md`](../data/DATA_INVENTORY.md)
- Scoring details: [`../scoring/scoring-metrics-guide.md`](../scoring/scoring-metrics-guide.md)
- Production testing: [`../operations/production-testing.md`](../operations/production-testing.md)
- User-test protocol: [`user-testing-plan.md`](user-testing-plan.md)
