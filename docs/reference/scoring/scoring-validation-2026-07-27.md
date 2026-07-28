# V1/V2 Scoring Validation — 2026-07-27

## Decision Summary

The structural V1 census layer is suitable for the current production gap
score. V2 should remain experimental and should **not** replace the production
gap score until a product owner approves the weights after user review and the
synthetic observed-needs input is replaced.

This is a technical recommendation, not the product decision assigned to Chloe
in issue #9.

## Automated Findings

Run:

```bash
python scripts/validate_scoring_bias.py
```

Current committed-data results:

| Measure | Result | Interpretation |
| --- | ---: | --- |
| Center rows assigned to a study area | 2,537 / 4,255 (59.62%) | Out-of-study rows are retained but do not contribute equally |
| Centers per area | 7–347 | 49.57× coverage ratio |
| Areas passing the observed-data floor | 12 / 12 | All receive an experimental observed score |
| Rolling visits per area | 317–3,754 | 11.84× volume ratio |
| Visit-volume coefficient of variation | 0.58 | Material area imbalance |
| Structural/observed Spearman correlation | -0.43 | Synthetic observations do not track structural need |
| Mean absolute V2 rank shift | 4.42 places | V2 materially changes priorities |
| Maximum absolute V2 rank shift | 9 places | Large single-area impact |
| Visitor-tag rows below `k >= 5` | 0 / 1,408 | Privacy floor passes |
| Minimum `k_anon_count` | 6 | Above the locked privacy floor |

## Weight And Threshold Rationale

- Structural census index: equal-weight normalized census dimensions, chosen
  for transparency and to avoid unsupported precision.
- Accessibility threshold: 2.5 km straight-line distance, retained as an
  explainable MVP proxy rather than a travel-time claim.
- V1 demand: 70% normalized visit volume and 30% top-category pressure.
- Experimental V2: 60% structural focus and 40% observed focus.
- Privacy threshold: aggregated observed rows must have `k >= 5`.

These values are implemented and tested, but the V1/V2 weights are not
empirically calibrated. Representative users or domain reviewers must approve,
defer, or reject V2 before it can affect production scoring.

## Fallback Verification

Automated tests verify:

- rows below the privacy floor are marked insufficient;
- structural-only V2 fallback is used when observed data is unavailable;
- structural and observed weights sum to one;
- scores remain within their documented ranges;
- the committed synthetic dataset contains no row below `k >= 5`.

## Required Product Decision

Recommended decision: **defer V2 application integration**.

Product owner record:

- Decision: `approve / defer / reject`
- Owner: Chloe
- Date:
- Rationale:
- Follow-up issue or milestone:
