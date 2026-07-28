-- Approved POC scoring contract 02.
--
-- This migration is additive. It does not publish candidate rows or change
-- RLS. GAP-PROD-01 remains live until the approved atomic refresh succeeds.

begin;

alter table public.area_profile
    add column if not exists population_basis text,
    add column if not exists structural_vulnerability_score double precision,
    add column if not exists structural_vulnerability_rank integer,
    add column if not exists structural_formula_id text,
    add column if not exists score_basis text,
    add column if not exists score_version text,
    add column if not exists source_year integer,
    add column if not exists source_geography_level text,
    add column if not exists source_geography_name text;

alter table public.accessibility
    add column if not exists distance_component double precision,
    add column if not exists availability_component double precision,
    add column if not exists accessibility_basis text,
    add column if not exists accessibility_version text,
    add column if not exists accessibility_formula_id text,
    add column if not exists formula_set_version text,
    add column if not exists taxonomy_version text,
    add column if not exists service_snapshot_id text,
    add column if not exists service_snapshot_date date,
    add column if not exists service_snapshot_total_rows integer,
    add column if not exists service_snapshot_mappable_rows integer;

alter table public.gap_score
    add column if not exists structural_vulnerability_score double precision,
    add column if not exists service_accessibility_score double precision,
    add column if not exists classification_status text,
    add column if not exists structural_formula_id text,
    add column if not exists accessibility_formula_id text,
    add column if not exists gap_formula_id text,
    add column if not exists formula_set_version text,
    add column if not exists gap_basis text,
    add column if not exists gap_version text,
    add column if not exists taxonomy_version text,
    add column if not exists service_snapshot_id text;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'area_profile_structural_alias_check'
          and conrelid = 'public.area_profile'::regclass
    ) then
        alter table public.area_profile
            add constraint area_profile_structural_alias_check
            check (
                structural_vulnerability_score is null
                or abs(vulnerability_score - structural_vulnerability_score) <= 0.01
            );
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'gap_score_structural_alias_check'
          and conrelid = 'public.gap_score'::regclass
    ) then
        alter table public.gap_score
            add constraint gap_score_structural_alias_check
            check (
                structural_vulnerability_score is null
                or abs(vulnerability_score - structural_vulnerability_score) <= 0.01
            );
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'area_profile_structural_rank_alias_check'
          and conrelid = 'public.area_profile'::regclass
    ) then
        alter table public.area_profile
            add constraint area_profile_structural_rank_alias_check
            check (
                structural_vulnerability_rank is null
                or vulnerability_rank = structural_vulnerability_rank
            );
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'gap_score_accessibility_alias_check'
          and conrelid = 'public.gap_score'::regclass
    ) then
        alter table public.gap_score
            add constraint gap_score_accessibility_alias_check
            check (
                service_accessibility_score is null
                or abs(overall_accessibility_score - service_accessibility_score) <= 0.01
            );
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'gap_score_formula_reconciliation_check'
          and conrelid = 'public.gap_score'::regclass
    ) then
        alter table public.gap_score
            add constraint gap_score_formula_reconciliation_check
            check (
                structural_vulnerability_score is null
                or service_accessibility_score is null
                or abs(
                    gap_score
                    - structural_vulnerability_score
                      * (100.0 - service_accessibility_score)
                      / 100.0
                ) <= 0.011
            );
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'accessibility_components_range_check'
          and conrelid = 'public.accessibility'::regclass
    ) then
        alter table public.accessibility
            add constraint accessibility_components_range_check
            check (
                (distance_component is null or distance_component between 0 and 100)
                and (
                    availability_component is null
                    or availability_component between 0 and 100
                )
                and accessibility_score between 0 and 100
            );
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'accessibility_components_reconciliation_check'
          and conrelid = 'public.accessibility'::regclass
    ) then
        alter table public.accessibility
            add constraint accessibility_components_reconciliation_check
            check (
                distance_component is null
                or availability_component is null
                or abs(
                    accessibility_score
                    - (0.5 * distance_component + 0.5 * availability_component)
                ) <= 0.011
            );
    end if;
end
$$;

create index if not exists ix_area_profile_structural_formula
    on public.area_profile (structural_formula_id);
create index if not exists ix_accessibility_formula
    on public.accessibility (accessibility_formula_id);
create index if not exists ix_gap_score_formula
    on public.gap_score (gap_formula_id);

comment on column public.area_profile.structural_vulnerability_score is
    'STRUCT-01: StatCan 2021 equal-weight five-indicator structural score.';
comment on column public.accessibility.accessibility_formula_id is
    'ACCESS-REAL-02: approved POC service-accessibility formula identifier.';
comment on column public.gap_score.gap_formula_id is
    'GAP-CANON-02: approved POC relative service-gap formula identifier.';
comment on column public.gap_score.classification_status is
    'unvalidated_poc means no High/Watch/Lower policy label may be displayed.';

-- Publish only the three scoring surfaces affected by this contract. The
-- function parses and validates the complete candidate snapshot before making
-- any change, then replaces all three surfaces in the caller's transaction.
-- Browser roles cannot execute it.
create or replace function public.publish_scoring_contract_02(
    p_area_profiles jsonb,
    p_accessibility jsonb,
    p_gap_scores jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    affected_rows integer;
    snapshot_id text;
begin
    perform pg_advisory_xact_lock(hashtext('publish_scoring_contract_02'));

    if jsonb_typeof(p_area_profiles) <> 'array'
       or jsonb_typeof(p_accessibility) <> 'array'
       or jsonb_typeof(p_gap_scores) <> 'array' then
        raise exception 'Scoring payloads must be JSON arrays';
    end if;

    create temporary table scoring_candidate_area_profile on commit drop as
    select *
    from jsonb_to_recordset(p_area_profiles) as payload_row(
        area_id text,
        area_name text,
        borough_name text,
        latitude double precision,
        longitude double precision,
        population integer,
        population_basis text,
        income_indicator double precision,
        age_indicator double precision,
        language_indicator double precision,
        immigration_indicator double precision,
        housing_indicator double precision,
        structural_vulnerability_score double precision,
        vulnerability_score double precision,
        structural_vulnerability_rank integer,
        vulnerability_rank integer,
        top_vulnerability_drivers text,
        structural_formula_id text,
        score_basis text,
        score_version text,
        source_year integer,
        source_geography_level text,
        source_geography_name text
    );

    create temporary table scoring_candidate_accessibility on commit drop as
    select *
    from jsonb_to_recordset(p_accessibility) as payload_row(
        area_id text,
        service_category text,
        nearest_service_distance_km double precision,
        service_count_within_threshold integer,
        distance_component double precision,
        availability_component double precision,
        accessibility_score double precision,
        accessibility_method text,
        accessibility_basis text,
        accessibility_version text,
        accessibility_formula_id text,
        formula_set_version text,
        taxonomy_version text,
        service_snapshot_id text,
        service_snapshot_date date,
        service_snapshot_total_rows integer,
        service_snapshot_mappable_rows integer
    );

    create temporary table scoring_candidate_gap on commit drop as
    select *
    from jsonb_to_recordset(p_gap_scores) as payload_row(
        area_id text,
        area_name text,
        borough_name text,
        latitude double precision,
        longitude double precision,
        structural_vulnerability_score double precision,
        vulnerability_score double precision,
        service_accessibility_score double precision,
        overall_accessibility_score double precision,
        gap_score double precision,
        gap_rank integer,
        priority_flag text,
        classification_status text,
        gap_drivers text,
        summary_en text,
        summary_fr text,
        structural_formula_id text,
        accessibility_formula_id text,
        gap_formula_id text,
        formula_set_version text,
        gap_basis text,
        gap_version text,
        taxonomy_version text,
        service_snapshot_id text
    );

    if (select count(*) from scoring_candidate_area_profile) <> 12
       or (
           select count(distinct area_id)
           from scoring_candidate_area_profile
       ) <> 12 then
        raise exception 'Candidate area_profile must contain 12 unique areas';
    end if;
    if exists (
        select 1
        from scoring_candidate_area_profile
        where structural_formula_id is distinct from 'STRUCT-01'
           or population_basis is distinct from 'synthetic_demo_not_for_scoring'
           or structural_vulnerability_score is null
           or structural_vulnerability_rank is null
           or structural_vulnerability_score not between 0 and 100
           or abs(
                structural_vulnerability_score - vulnerability_score
           ) > 0.01
           or structural_vulnerability_rank <> vulnerability_rank
    ) then
        raise exception 'Candidate area_profile violates STRUCT-01';
    end if;
    if (
        select count(*)
        from public.area_profile live
        join scoring_candidate_area_profile candidate using (area_id)
    ) <> 12 then
        raise exception 'Candidate area IDs do not match the live area registry';
    end if;

    if (select count(*) from scoring_candidate_accessibility) <> 108
       or (
           select count(*)
           from (
               select area_id
               from scoring_candidate_accessibility
               group by area_id
               having count(*) = 9
                  and count(distinct service_category) = 9
           ) complete_areas
       ) <> 12 then
        raise exception 'Candidate accessibility must be a 12 by 9 matrix';
    end if;
    if exists (
        select 1
        from scoring_candidate_accessibility
        where accessibility_formula_id is distinct from 'ACCESS-REAL-02'
           or formula_set_version is distinct from 'scoring-contract-02'
           or taxonomy_version is distinct from 'planning-needs-9-v1'
           or distance_component is null
           or availability_component is null
           or accessibility_score is null
           or distance_component not between 0 and 100
           or availability_component not between 0 and 100
           or accessibility_score not between 0 and 100
           or abs(
                accessibility_score
                - (0.5 * distance_component + 0.5 * availability_component)
           ) > 0.011
           or service_snapshot_total_rows <> 3664
           or service_snapshot_mappable_rows <> 3200
    ) then
        raise exception 'Candidate accessibility violates ACCESS-REAL-02';
    end if;
    if exists (
        select 1
        from scoring_candidate_accessibility candidate
        left join scoring_candidate_area_profile area using (area_id)
        where area.area_id is null
    ) then
        raise exception 'Candidate accessibility contains an unknown area';
    end if;
    select min(service_snapshot_id)
    into snapshot_id
    from scoring_candidate_accessibility;
    if snapshot_id is null
       or (
           select count(distinct service_snapshot_id)
           from scoring_candidate_accessibility
       ) <> 1 then
        raise exception 'Candidate accessibility must use one service snapshot';
    end if;

    if (select count(*) from scoring_candidate_gap) <> 12
       or (
           select count(distinct area_id)
           from scoring_candidate_gap
       ) <> 12 then
        raise exception 'Candidate gap_score must contain 12 unique areas';
    end if;
    if exists (
        select 1
        from scoring_candidate_gap candidate
        left join scoring_candidate_area_profile area using (area_id)
        where area.area_id is null
    ) then
        raise exception 'Candidate gap_score contains an unknown area';
    end if;
    if exists (
        select 1
        from scoring_candidate_gap gap
        join scoring_candidate_area_profile area using (area_id)
        where gap.structural_formula_id is distinct from 'STRUCT-01'
           or gap.accessibility_formula_id is distinct from 'ACCESS-REAL-02'
           or gap.gap_formula_id is distinct from 'GAP-CANON-02'
           or gap.formula_set_version is distinct from 'scoring-contract-02'
           or gap.classification_status is distinct from 'unvalidated_poc'
           or gap.structural_vulnerability_score is null
           or gap.service_accessibility_score is null
           or gap.gap_score is null
           or nullif(btrim(gap.priority_flag), '') is not null
           or gap.service_snapshot_id is distinct from snapshot_id
           or abs(
                gap.structural_vulnerability_score
                - area.structural_vulnerability_score
           ) > 0.01
           or abs(
                gap.vulnerability_score
                - gap.structural_vulnerability_score
           ) > 0.01
           or abs(
                gap.overall_accessibility_score
                - gap.service_accessibility_score
           ) > 0.01
           or abs(
                gap.gap_score
                - gap.structural_vulnerability_score
                  * (100.0 - gap.service_accessibility_score)
                  / 100.0
           ) > 0.011
    ) then
        raise exception 'Candidate gap_score violates GAP-CANON-02';
    end if;

    update public.area_profile live
    set
        area_name = candidate.area_name,
        borough_name = candidate.borough_name,
        latitude = candidate.latitude,
        longitude = candidate.longitude,
        population = candidate.population,
        population_basis = candidate.population_basis,
        income_indicator = candidate.income_indicator,
        age_indicator = candidate.age_indicator,
        language_indicator = candidate.language_indicator,
        immigration_indicator = candidate.immigration_indicator,
        housing_indicator = candidate.housing_indicator,
        structural_vulnerability_score =
            candidate.structural_vulnerability_score,
        vulnerability_score = candidate.vulnerability_score,
        structural_vulnerability_rank =
            candidate.structural_vulnerability_rank,
        vulnerability_rank = candidate.vulnerability_rank,
        top_vulnerability_drivers = candidate.top_vulnerability_drivers,
        structural_formula_id = candidate.structural_formula_id,
        score_basis = candidate.score_basis,
        score_version = candidate.score_version,
        source_year = candidate.source_year,
        source_geography_level = candidate.source_geography_level,
        source_geography_name = candidate.source_geography_name
    from scoring_candidate_area_profile candidate
    where live.area_id = candidate.area_id;
    get diagnostics affected_rows = row_count;
    if affected_rows <> 12 then
        raise exception 'Expected to update 12 area profiles, updated %',
            affected_rows;
    end if;

    -- Supabase enables a safe-update guard in production. Keep the explicit
    -- predicate even though this intentionally replaces the complete table.
    delete from public.accessibility
    where true;
    insert into public.accessibility (
        area_id,
        service_category,
        nearest_service_distance_km,
        service_count_within_threshold,
        distance_component,
        availability_component,
        accessibility_score,
        accessibility_method,
        accessibility_basis,
        accessibility_version,
        accessibility_formula_id,
        formula_set_version,
        taxonomy_version,
        service_snapshot_id,
        service_snapshot_date,
        service_snapshot_total_rows,
        service_snapshot_mappable_rows
    )
    select
        area_id,
        service_category,
        nearest_service_distance_km,
        service_count_within_threshold,
        distance_component,
        availability_component,
        accessibility_score,
        accessibility_method,
        accessibility_basis,
        accessibility_version,
        accessibility_formula_id,
        formula_set_version,
        taxonomy_version,
        service_snapshot_id,
        service_snapshot_date,
        service_snapshot_total_rows,
        service_snapshot_mappable_rows
    from scoring_candidate_accessibility;

    delete from public.gap_score
    where true;
    insert into public.gap_score (
        area_id,
        area_name,
        borough_name,
        latitude,
        longitude,
        structural_vulnerability_score,
        vulnerability_score,
        service_accessibility_score,
        overall_accessibility_score,
        gap_score,
        gap_rank,
        priority_flag,
        classification_status,
        gap_drivers,
        summary_en,
        summary_fr,
        structural_formula_id,
        accessibility_formula_id,
        gap_formula_id,
        formula_set_version,
        gap_basis,
        gap_version,
        taxonomy_version,
        service_snapshot_id
    )
    select
        area_id,
        area_name,
        borough_name,
        latitude,
        longitude,
        structural_vulnerability_score,
        vulnerability_score,
        service_accessibility_score,
        overall_accessibility_score,
        gap_score,
        gap_rank,
        nullif(priority_flag, ''),
        classification_status,
        gap_drivers,
        summary_en,
        summary_fr,
        structural_formula_id,
        accessibility_formula_id,
        gap_formula_id,
        formula_set_version,
        gap_basis,
        gap_version,
        taxonomy_version,
        service_snapshot_id
    from scoring_candidate_gap;

    return jsonb_build_object(
        'status', 'published',
        'formula_set_version', 'scoring-contract-02',
        'structural_formula_id', 'STRUCT-01',
        'accessibility_formula_id', 'ACCESS-REAL-02',
        'gap_formula_id', 'GAP-CANON-02',
        'service_snapshot_id', snapshot_id,
        'area_profile_rows', 12,
        'accessibility_rows', 108,
        'gap_score_rows', 12
    );
end;
$$;

revoke all on function public.publish_scoring_contract_02(
    jsonb,
    jsonb,
    jsonb
) from public, anon, authenticated;
grant execute on function public.publish_scoring_contract_02(
    jsonb,
    jsonb,
    jsonb
) to service_role;

comment on function public.publish_scoring_contract_02(jsonb, jsonb, jsonb) is
    'Private atomic publisher for the approved scoring-contract-02 snapshot.';

commit;
