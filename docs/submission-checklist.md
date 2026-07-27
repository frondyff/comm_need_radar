# Submission Checklist

## MVP Complete

- [x] README explains local run path.
- [x] Synthetic raw data exists.
- [x] Processed dashboard-ready data exists.
- [x] Vulnerability score exists.
- [x] Accessibility score exists.
- [x] Gap score and priority ranking exist.
- [x] Frontline V1 demand score and category summary exist.
- [x] Experimental V2 observed and structural composite scores exist.
- [x] V1/V2 privacy, formula, fallback, and output-contract tests exist.
- [x] Streamlit dashboard source exists.
- [x] Monitoring summary exists.
- [x] Simulated role activity log exists.
- [x] Streamlit Community Cloud entrypoint and config exist.
- [x] Local tests exist.

## Remaining For Real Project

- [x] Add a Statistics Canada structural census extract and area aggregation.
- [x] Add the Indigenous census field and document StatCan suppression handling.
- [x] Replace synthetic frontend area envelopes with approved real area boundaries.
- [x] Replace synthetic frontend services with the canonical 3,664-row real service layer.
- [ ] Replace demonstration center/encounter inputs with approved production data.
- [x] Quantify V1/V2 thresholds and center-coverage bias with an automated report.
- [ ] Validate V1/V2 weights and thresholds with representative users or domain reviewers.
- [ ] Decide whether to wire V2 into gap scoring and application views.
- [x] Validate spatial joins against real geographies.
- [ ] Run user testing with 2-3 non-technical users.
- [x] Deploy the canonical React application to Vercel and record the public URL.
- [x] Prepare the final technical report and presentation outline with validated screenshots.
- [ ] Record final approval from all workstream owners.

## Evidence

- Census and suppression: `docs/census-variable-dictionary.md`
- Real boundaries and joins: `docs/spatial-join-validation.md`
- Service inventory: `docs/DATA_INVENTORY.md`
- Scoring and bias: `docs/scoring-validation-2026-07-27.md`
- Production URL and gates: `docs/deployment-verification-2026-07-23.md`
- Final report and presentation: `docs/final-report.md`,
  `docs/presentation-outline.md`
- Pending real-user sessions: `docs/user-testing-plan.md`
