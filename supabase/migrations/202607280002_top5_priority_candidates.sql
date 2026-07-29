-- Approved POC classification contract CLASS-TOP5-02.
--
-- GAP-CANON-02 and every numeric score remain unchanged. This additive
-- migration records a relative top-five interpretation for the fixed 12-area
-- comparison set and exposes a new atomic scoring-contract-03 publisher.

begin;

alter table public.gap_score
    add column if not exists priority_band text,
    add column if not exists classification_formula_id text,
    add column if not exists priority_cutoff_rank integer,
    add column if not exists comparison_set_size integer;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'gap_score_top5_candidate_contract_check'
          and conrelid = 'public.gap_score'::regclass
    ) then
        alter table public.gap_score
            add constraint gap_score_top5_candidate_contract_check
            check (
                classification_formula_id is null
                or (
                    classification_formula_id = 'CLASS-TOP5-02'
                    and classification_status = 'poc_relative_candidate'
                    and priority_cutoff_rank = 5
                    and comparison_set_size = 12
                    and gap_rank between 1 and comparison_set_size
                    and (
                        (
                            gap_rank <= priority_cutoff_rank
                            and priority_band = 'high_candidate'
                            and priority_flag = 'High-priority candidate (POC)'
                        )
                        or (
                            gap_rank > priority_cutoff_rank
                            and nullif(btrim(priority_band), '') is null
                            and nullif(btrim(priority_flag), '') is null
                        )
                    )
                )
            );
    end if;
end
$$;

create index if not exists ix_gap_score_classification_formula
    on public.gap_score (classification_formula_id);

comment on column public.gap_score.priority_band is
    'CLASS-TOP5-02: high_candidate only for ranks 1-5; null otherwise.';
comment on column public.gap_score.priority_flag is
    'Public POC label for CLASS-TOP5-02 ranks 1-5; not a policy threshold.';
comment on column public.gap_score.classification_formula_id is
    'CLASS-TOP5-02: relative top-five classification identifier.';
comment on column public.gap_score.classification_status is
    'poc_relative_candidate means a relative planning candidate, not a funding or policy decision.';
comment on column public.gap_score.priority_cutoff_rank is
    'Inclusive relative rank cutoff; fixed at 5 for CLASS-TOP5-02.';
comment on column public.gap_score.comparison_set_size is
    'Number of areas in the relative comparison set; fixed at 12 for CLASS-TOP5-02.';

create or replace function public.publish_scoring_contract_03(
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
    legacy_accessibility jsonb;
    legacy_gap_scores jsonb;
    result jsonb;
begin
    perform pg_advisory_xact_lock(hashtext('publish_scoring_contract_03'));

    if jsonb_typeof(p_area_profiles) <> 'array'
       or jsonb_typeof(p_accessibility) <> 'array'
       or jsonb_typeof(p_gap_scores) <> 'array' then
        raise exception 'Scoring payloads must be JSON arrays';
    end if;

    if jsonb_array_length(p_accessibility) <> 108
       or exists (
           select 1
           from jsonb_to_recordset(p_accessibility) as row_data(
               formula_set_version text
           )
           where formula_set_version is distinct from 'scoring-contract-03'
       ) then
        raise exception 'Candidate accessibility violates scoring-contract-03';
    end if;

    if jsonb_array_length(p_gap_scores) <> 12
       or (
           select count(distinct gap_rank)
           from jsonb_to_recordset(p_gap_scores) as row_data(gap_rank integer)
       ) <> 12
       or (
           select min(gap_rank) <> 1 or max(gap_rank) <> 12
           from jsonb_to_recordset(p_gap_scores) as row_data(gap_rank integer)
       )
       or exists (
           select 1
           from jsonb_to_recordset(p_gap_scores) as row_data(
               gap_rank integer,
               priority_band text,
               priority_flag text,
               classification_formula_id text,
               classification_status text,
               priority_cutoff_rank integer,
               comparison_set_size integer,
               formula_set_version text
           )
           where formula_set_version is distinct from 'scoring-contract-03'
              or classification_formula_id is distinct from 'CLASS-TOP5-02'
              or classification_status is distinct from 'poc_relative_candidate'
              or priority_cutoff_rank is distinct from 5
              or comparison_set_size is distinct from 12
              or (
                  gap_rank <= 5
                  and (
                      priority_band is distinct from 'high_candidate'
                      or priority_flag is distinct from
                         'High-priority candidate (POC)'
                  )
              )
              or (
                  gap_rank > 5
                  and (
                      nullif(btrim(priority_band), '') is not null
                      or nullif(btrim(priority_flag), '') is not null
                  )
              )
       ) then
        raise exception 'Candidate gap_score violates CLASS-TOP5-02';
    end if;

    -- Reuse the already reviewed contract-02 structural, accessibility, and
    -- gap reconciliation checks. Only the version/classification fields are
    -- adapted for that validator; all numeric payload values are unchanged.
    select jsonb_agg(
        (item - 'formula_set_version')
        || jsonb_build_object('formula_set_version', 'scoring-contract-02')
    )
    into legacy_accessibility
    from jsonb_array_elements(p_accessibility) item;

    select jsonb_agg(
        (
            item
            - 'formula_set_version'
            - 'priority_flag'
            - 'classification_status'
        )
        || jsonb_build_object(
            'formula_set_version', 'scoring-contract-02',
            'priority_flag', '',
            'classification_status', 'unvalidated_poc'
        )
    )
    into legacy_gap_scores
    from jsonb_array_elements(p_gap_scores) item;

    result := public.publish_scoring_contract_02(
        p_area_profiles,
        legacy_accessibility,
        legacy_gap_scores
    );

    update public.accessibility
    set formula_set_version = 'scoring-contract-03'
    where true;

    update public.gap_score live
    set
        priority_band = nullif(candidate.priority_band, ''),
        priority_flag = nullif(candidate.priority_flag, ''),
        classification_formula_id = candidate.classification_formula_id,
        classification_status = candidate.classification_status,
        priority_cutoff_rank = candidate.priority_cutoff_rank,
        comparison_set_size = candidate.comparison_set_size,
        formula_set_version = candidate.formula_set_version
    from jsonb_to_recordset(p_gap_scores) as candidate(
        area_id text,
        priority_band text,
        priority_flag text,
        classification_formula_id text,
        classification_status text,
        priority_cutoff_rank integer,
        comparison_set_size integer,
        formula_set_version text
    )
    where live.area_id = candidate.area_id;

    return result || jsonb_build_object(
        'formula_set_version', 'scoring-contract-03',
        'classification_formula_id', 'CLASS-TOP5-02',
        'priority_cutoff_rank', 5,
        'comparison_set_size', 12,
        'high_priority_candidate_rows', 5
    );
end;
$$;

revoke all on function public.publish_scoring_contract_03(
    jsonb,
    jsonb,
    jsonb
) from public, anon, authenticated;
grant execute on function public.publish_scoring_contract_03(
    jsonb,
    jsonb,
    jsonb
) to service_role;

comment on function public.publish_scoring_contract_03(jsonb, jsonb, jsonb) is
    'Private atomic publisher for scoring-contract-03 and CLASS-TOP5-02.';

commit;
