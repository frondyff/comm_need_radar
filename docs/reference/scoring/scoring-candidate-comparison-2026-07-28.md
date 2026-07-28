# Candidate Scoring Comparison — 2026-07-28

Status: **approved for controlled POC release; not yet published**

This report is generated locally. It does not update Supabase or Vercel.

## Decision

`ACCESS-REAL-02` and `GAP-CANON-02` were approved for the POC interface on
2026-07-28. Production remains `GAP-PROD-01`, which combines `STRUCT-01` with
`ACCESS-LEGACY-01`, until the controlled migration, refresh, validation, and
deployment finish.

## Twelve-Area Comparison

| Area | Legacy profile vuln | STRUCT-01 | Legacy synthetic access | GAP-PROD-01 | Legacy rank | Old formula + real services access | Old formula + real services gap | ACCESS-REAL-02 | GAP-CANON-02 | Candidate rank | Rank change |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Saint-Michel | 73.0 | 62.87 | 10.59 | 56.21 | 2 | 86.18 | 8.69 | 58.18 | 26.29 | 1 | 1 |
| Montreal-Nord | 76.0 | 53.72 | 10.93 | 47.85 | 4 | 86.77 | 7.11 | 58.79 | 22.14 | 2 | 2 |
| Lachine | 45.8 | 32.03 | 10.36 | 28.71 | 10 | 61.9 | 12.2 | 37.23 | 20.11 | 3 | 7 |
| Verdun | 40.4 | 36.89 | 14.23 | 31.64 | 8 | 84.86 | 5.59 | 50.98 | 18.08 | 4 | 4 |
| Westmount | 24.6 | 52.06 | 11.57 | 46.04 | 5 | 95.38 | 2.41 | 72.96 | 14.08 | 5 | 0 |
| Ahuntsic | 47.2 | 49.75 | 11.61 | 43.97 | 6 | 99.46 | 0.27 | 72.33 | 13.77 | 6 | 0 |
| Hochelaga | 50.0 | 30.24 | 10.51 | 27.06 | 11 | 88.78 | 3.39 | 62.37 | 11.38 | 7 | 4 |
| Cote-des-Neiges | 74.6 | 64.39 | 11.49 | 56.99 | 1 | 97.99 | 1.29 | 83.94 | 10.34 | 8 | -7 |
| Parc Extension | 78.2 | 62.87 | 12.28 | 55.15 | 3 | 100.0 | 0.0 | 85.93 | 8.85 | 9 | -6 |
| Pointe-Saint-Charles | 46.4 | 35.9 | 19.04 | 29.06 | 9 | 97.55 | 0.88 | 75.98 | 8.62 | 10 | -1 |
| Riviere-des-Prairies | 52.6 | 11.06 | 10.18 | 9.93 | 12 | 73.87 | 2.89 | 39.29 | 6.71 | 11 | 1 |
| Plateau Mont-Royal | 33.0 | 50.94 | 18.02 | 41.76 | 7 | 100.0 | 0.0 | 92.64 | 3.75 | 12 | -5 |

`Rank change` is legacy rank minus candidate rank; a positive value means the
area moves upward under the candidate.

The “old formula + real services” columns demonstrate the saturation defect:
the count component was calibrated for 14 synthetic services and collapses most
real-service gaps toward zero.

## Sensitivity

| radius_km | distance_weight | availability_weight | spearman_vs_default | maximum_absolute_rank_change | top_ranked_area |
| --- | --- | --- | --- | --- | --- |
| 1.5 | 0.25 | 0.75 | 0.874 | 3 | Saint-Michel |
| 1.5 | 0.5 | 0.5 | 0.881 | 3 | Saint-Michel |
| 1.5 | 0.75 | 0.25 | 0.846 | 4 | Saint-Michel |
| 2.5 | 0.25 | 0.75 | 0.986 | 1 | Saint-Michel |
| 2.5 | 0.5 | 0.5 | 1.0 | 0 | Saint-Michel |
| 2.5 | 0.75 | 0.25 | 0.979 | 2 | Saint-Michel |
| 5.0 | 0.25 | 0.75 | 0.797 | 6 | Montreal-Nord |
| 5.0 | 0.5 | 0.5 | 0.895 | 4 | Montreal-Nord |
| 5.0 | 0.75 | 0.25 | 0.965 | 2 | Montreal-Nord |

The candidate default is radius 2.5 km with 50% distance and 50% log-scaled
availability.

## Coverage And Bias Limitations

- Structural vulnerability is a borough-level StatCan 2021 index. Parc
  Extension and Saint-Michel therefore share `STRUCT-01`.
- Accessibility uses 3,664 directory rows, of which
  3,200 have usable coordinates.
- Straight-line distance is not travel time.
- Directory presence does not measure capacity, eligibility, language,
  operating hours, service quality, or whether a resident can obtain help.
- The nine-category crosswalk is a planning simplification; original service
  categories remain available for audit.
- Relative availability depends on the current 12-area comparison set and
  service snapshot.
- V1, experimental V2, `page_events`, and `flyer_downloads` do not contribute
  to `GAP-CANON-02`.

## Approval Record

- Decision: `approve`
- Owner: repository maintainer, recorded from the implementation-thread approval
- Date: 2026-07-28
- Rationale: resolve the mixed vulnerability contract and use the reviewed real
  service directory while retaining POC labels, documented limitations, and no
  policy classification.
- Approved formula IDs: `STRUCT-01`, `ACCESS-REAL-02`, `GAP-CANON-02`
- Follow-up: apply the additive migration, publish the three scoring tables
  atomically, validate owner/public contracts, grill the staged release, and
  record the production snapshot and deployment.
