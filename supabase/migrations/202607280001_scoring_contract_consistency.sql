-- Candidate scoring contract 02.
--
-- This migration is additive. It does not publish candidate rows or change
-- RLS. GAP-PROD-01 remains live until the separately approved atomic refresh.

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
    'Stable formula identifier. ACCESS-REAL-02 remains candidate until approved.';
comment on column public.gap_score.gap_formula_id is
    'Stable gap formula identifier. GAP-CANON-02 remains candidate until approved.';
comment on column public.gap_score.classification_status is
    'unvalidated_poc means no High/Watch/Lower policy label may be displayed.';

commit;
