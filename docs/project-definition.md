# Project Definition

## Product Concept

Community Needs Radar MVP demonstrates an interactive dashboard that maps social
vulnerability against community service accessibility across Greater Montreal.
This version uses synthetic data so the team can validate workflows, interfaces,
and monitoring before connecting public datasets.

## Users

- **Frontline / Community users:** residents, newcomers, volunteers, and staff
  looking for nearby services and printable flyers.
- **Planner / Organization users:** nonprofits, funders, borough planners, and
  policy analysts comparing vulnerability, service access, and priority gaps.

## MVP Objectives

1. Generate synthetic area and service data that resembles the final public-data
   contracts.
2. Process raw synthetic data into dashboard-ready outputs.
3. Calculate vulnerability, accessibility, and gap scores.
4. Provide Planner, Frontline, and Monitoring dashboard views.
5. Record simulated team task activity by role in docs and processed data.

## In Scope

- Synthetic raw and processed datasets.
- Distance-based service accessibility.
- Transparent scoring formulas.
- Local Streamlit app.
- Optional cloud-readiness through simple file-based inputs.
- Role-based simulated activity log as a documentation and data artifact.

## Out Of Scope

- Real public data ingestion.
- Private or personally identifiable information.
- Real-time service availability.
- Mandatory Dockerization.
- Case management, referral workflows, or appointment booking.

## Success Criteria

- Processed outputs match `docs/interfaces.md`.
- Dashboard starts locally when dependencies are installed.
- Planner users can identify top priority areas and score drivers.
- Planner users can click priority areas on the map and inspect category-level
  service access.
- Planner users can ask a local policymaker assistant about priorities,
  service-access gaps, borough comparisons, and policy actions using the
  processed synthetic data.
- Frontline users can search by synthetic postal-code prefix or community area,
  click vulnerability-type cards to open analysis details, click service points
  on the map, filter nearby services, and produce flyer-ready rows.
- Monitoring view reports row counts, missingness, join coverage, and blockers.
- Simulated role activity log documents all MVP workstreams in
  `docs/task-progress.md` and `data/processed/role_activity_log.csv`.
