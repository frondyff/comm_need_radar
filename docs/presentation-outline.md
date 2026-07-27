# Final Presentation Outline

1. **Problem and audience** — frontline referral and planner prioritization.
2. **Product walkthrough** — Community and Planner paths.
3. **Architecture** — use `docs/production-web-architecture.md`.
4. **Data provenance** — distinguish census, geometry, services, analytics,
   synthetic encounters, and experimental V2.
5. **Scoring** — vulnerability × access deficit; explain the 2.5 km proxy.
6. **Real detail indicators** — raw census percentages versus normalized bars.
7. **Geospatial validation** — 12/12 areas, zero overlaps, explicit unmatched
   out-of-study records.
8. **Production quality** — CI, browser grill, accessibility, performance,
   security, load, promotion, and rollback.
9. **Bias and limitations** — use `docs/scoring-validation-2026-07-27.md`.
10. **User-testing findings** — populate from `docs/user-testing-plan.md`;
    do not invent results.
11. **Recommendation** — retain structural production scoring; defer V2.
12. **Handoff and ownership** — approvals, operating guide, and next milestone.

Validated screenshot assets:

- `frontend/tests/production/visual.spec.js-snapshots/landing-chromium-desktop-linux.png`
- `frontend/tests/production/visual.spec.js-snapshots/community-chromium-desktop-linux.png`
- `frontend/tests/production/visual.spec.js-snapshots/planner-chromium-desktop-linux.png`
- `frontend/tests/production/visual.spec.js-snapshots/flyer-chromium-desktop-linux.png`
