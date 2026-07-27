-- Version anonymous analytics and connect real website behavior to the existing
-- observed-needs layer. Raw session identifiers remain in insert-only analytics
-- tables; database_visitor_tag stores only k-anonymized area snapshots.

begin;

create table if not exists public.page_events (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    event_type text not null,
    detail text,
    location text
);

create table if not exists public.flyer_downloads (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    group_filter text[] default '{}',
    gender_filter text,
    age_filter text[] default '{}',
    category_filter text[] default '{}',
    service_id text,
    service_name text,
    service_category text,
    distribution_location text,
    flyer_language text
);

alter table public.page_events
    add column if not exists event_version integer not null default 1,
    add column if not exists anonymous_session_id text,
    add column if not exists selected_area_id text,
    add column if not exists service_id text,
    add column if not exists service_area_id text,
    add column if not exists category text,
    add column if not exists source_view text,
    add column if not exists is_test boolean not null default false;

alter table public.flyer_downloads
    add column if not exists event_version integer not null default 1,
    add column if not exists anonymous_session_id text,
    add column if not exists selected_area_id text,
    add column if not exists service_area_id text,
    add column if not exists category text,
    add column if not exists source_view text,
    add column if not exists is_test boolean not null default false;

create index if not exists ix_page_events_created_at
    on public.page_events (created_at);
create index if not exists ix_page_events_observed_area
    on public.page_events (selected_area_id, service_area_id, created_at)
    where is_test = false and anonymous_session_id is not null;
create index if not exists ix_page_events_observed_session
    on public.page_events (anonymous_session_id, event_type, created_at)
    where is_test = false;
create index if not exists ix_flyer_downloads_created_at
    on public.flyer_downloads (created_at);
create index if not exists ix_flyer_downloads_observed_area
    on public.flyer_downloads (selected_area_id, service_area_id, created_at)
    where is_test = false and anonymous_session_id is not null;

alter table public.page_events enable row level security;
alter table public.flyer_downloads enable row level security;

revoke all on public.page_events from public, anon, authenticated;
revoke all on public.flyer_downloads from public, anon, authenticated;
grant insert on public.page_events to anon, authenticated;
grant insert on public.flyer_downloads to anon, authenticated;

drop policy if exists "Allow public insert" on public.page_events;
drop policy if exists "Allow public insert" on public.flyer_downloads;
drop policy if exists analytics_insert_page_events on public.page_events;
drop policy if exists analytics_insert_flyer_downloads on public.flyer_downloads;

-- Version 1 remains accepted during the deployment transition. Only version 2
-- rows have the session, area, and exposure context required for scoring.
create policy analytics_insert_page_events on public.page_events
    for insert to anon, authenticated
    with check (
        event_version between 1 and 2
        and length(event_type) between 1 and 64
        and coalesce(length(detail), 0) <= 120
        and coalesce(length(anonymous_session_id), 0) <= 128
        and coalesce(length(selected_area_id), 0) <= 32
        and coalesce(length(service_area_id), 0) <= 32
        and coalesce(length(category), 0) <= 120
        and coalesce(length(source_view), 0) <= 64
    );

create policy analytics_insert_flyer_downloads on public.flyer_downloads
    for insert to anon, authenticated
    with check (
        event_version between 1 and 2
        and coalesce(length(anonymous_session_id), 0) <= 128
        and coalesce(length(selected_area_id), 0) <= 32
        and coalesce(length(service_area_id), 0) <= 32
        and coalesce(length(category), 0) <= 120
        and coalesce(length(source_view), 0) <= 64
    );

-- Existing rows in this project are the documented synthetic demonstration
-- input. New partner rows must identify themselves; web rows are written only
-- by the private publication function below.
alter table public.database_visitor_tag
    add column if not exists source_type text,
    add column if not exists area_id text references public.area_profile (area_id),
    add column if not exists weighted_demand_total double precision,
    add column if not exists service_impression_count integer,
    add column if not exists intent_rate_per_100_impressions double precision,
    add column if not exists digital_demand_score double precision,
    add column if not exists coverage_status text,
    add column if not exists scoring_version text;

update public.database_visitor_tag
set source_type = 'synthetic_demonstration'
where source_type is null;

alter table public.database_visitor_tag
    alter column source_type set default 'partner_encounter',
    alter column source_type set not null;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.database_visitor_tag'::regclass
          and conname = 'database_visitor_tag_source_type_check'
    ) then
        alter table public.database_visitor_tag
            add constraint database_visitor_tag_source_type_check
            check (
                source_type in (
                    'synthetic_demonstration',
                    'partner_encounter',
                    'web_behavior'
                )
            );
    end if;
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.database_visitor_tag'::regclass
          and conname = 'database_visitor_tag_web_aggregate_check'
    ) then
        alter table public.database_visitor_tag
            add constraint database_visitor_tag_web_aggregate_check
            check (
                source_type <> 'web_behavior'
                or (
                    center_id is null
                    and area_id is not null
                    and k_anon_count >= 5
                    and weighted_demand_total >= 0
                    and service_impression_count >= 0
                    and (
                        intent_rate_per_100_impressions is null
                        or intent_rate_per_100_impressions >= 0
                    )
                    and (
                        digital_demand_score is null
                        or digital_demand_score between 0 and 100
                    )
                    and coverage_status in (
                        'insufficient',
                        'experimental',
                        'reviewable'
                    )
                    and scoring_version is not null
                )
            );
    end if;
end;
$$;

create index if not exists ix_database_visitor_tag_web_period
    on public.database_visitor_tag (source_type, period_end desc, area_id);

alter table public.observed_need_category_summary
    add column if not exists weighted_demand_total double precision,
    add column if not exists weighted_demand_share_pct double precision,
    add column if not exists source_type text;

-- One service-role call replaces all public observed materializations inside a
-- single transaction. The function validates the 12-area contract and refuses
-- person/session identifiers or sub-k category groups.
create or replace function public.publish_web_observed_demand(
    visitor_rows jsonb,
    observed_rows jsonb,
    category_rows jsonb,
    v2_rows jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    expected_areas integer;
    record_count integer;
begin
    if jsonb_typeof(visitor_rows) <> 'array'
       or jsonb_typeof(observed_rows) <> 'array'
       or jsonb_typeof(category_rows) <> 'array'
       or jsonb_typeof(v2_rows) <> 'array' then
        raise exception 'All publication payloads must be JSON arrays';
    end if;

    select count(*) into expected_areas from public.area_profile;
    if expected_areas = 0 then
        raise exception 'area_profile is empty';
    end if;
    if jsonb_array_length(observed_rows) <> expected_areas
       or jsonb_array_length(v2_rows) <> expected_areas then
        raise exception
            'Observed and V2 payloads must each cover all % areas',
            expected_areas;
    end if;
    if exists (
        select 1
        from jsonb_array_elements(visitor_rows) as item
        where item ? 'anonymous_session_id'
    ) then
        raise exception 'Raw session identifiers cannot enter database_visitor_tag';
    end if;

    select count(*) into record_count
    from jsonb_to_recordset(visitor_rows) as x(
        source_type text,
        k_anon_count integer,
        weighted_demand_total double precision,
        service_impression_count integer,
        digital_demand_score double precision
    )
    where source_type <> 'web_behavior'
       or k_anon_count < 5
       or weighted_demand_total < 0
       or service_impression_count < 0
       or (
           digital_demand_score is not null
           and digital_demand_score not between 0 and 100
       );
    if record_count > 0 then
        raise exception 'Invalid or sub-k web visitor-tag payload';
    end if;

    select count(*) into record_count
    from jsonb_to_recordset(category_rows) as x(
        source_type text,
        encounter_count integer,
        weighted_demand_total double precision
    )
    where source_type <> 'web_behavior'
       or encounter_count < 5
       or weighted_demand_total < 0;
    if record_count > 0 then
        raise exception 'Invalid or sub-k observed category payload';
    end if;

    select count(*) into record_count
    from jsonb_to_recordset(v2_rows) as x(
        observed_weight double precision
    )
    where observed_weight = 0.4;
    if record_count not in (0, expected_areas) then
        raise exception
            'Observed weight must cover every area or use structural-only fallback';
    end if;
    if record_count = expected_areas and (
        select count(distinct area_id)
        from jsonb_to_recordset(visitor_rows) as x(
            area_id text,
            coverage_status text,
            digital_demand_score double precision
        )
        where coverage_status = 'reviewable'
          and digital_demand_score is not null
    ) <> expected_areas then
        raise exception
            'The 40 percent observed weight requires reviewable visitor tags for every area';
    end if;

    delete from public.database_visitor_tag
    where source_type = 'web_behavior';
    insert into public.database_visitor_tag
    select *
    from jsonb_populate_recordset(
        null::public.database_visitor_tag,
        visitor_rows
    );

    -- The old category rows are synthetic demonstration output. They must not
    -- remain beside the real web-derived observed snapshot.
    delete from public.observed_need_category_summary;
    insert into public.observed_need_category_summary
    select *
    from jsonb_populate_recordset(
        null::public.observed_need_category_summary,
        category_rows
    );

    delete from public.observed_need_index;
    insert into public.observed_need_index
    select *
    from jsonb_populate_recordset(
        null::public.observed_need_index,
        observed_rows
    );

    delete from public.vulnerability_index_v2;
    insert into public.vulnerability_index_v2
    select *
    from jsonb_populate_recordset(
        null::public.vulnerability_index_v2,
        v2_rows
    );

    if exists (
        select 1
        from public.observed_need_index
        where v2_observed_score is not null
          and observed_data_basis
              <> 'real_web_behavior_exposure_normalized_experimental'
    ) then
        raise exception 'Scored observed rows have invalid provenance';
    end if;

    if exists (
        select 1
        from public.vulnerability_index_v2
        where abs((structural_weight + observed_weight) - 1.0) > 0.000001
           or observed_weight not in (0.0, 0.4)
           or structural_weight not in (0.6, 1.0)
    ) then
        raise exception 'V2 payload violates the original 60/40 formula';
    end if;
end;
$$;

revoke all on function public.publish_web_observed_demand(
    jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.publish_web_observed_demand(
    jsonb, jsonb, jsonb, jsonb
) to service_role;

comment on column public.database_visitor_tag.weighted_demand_total is
    'Accumulated deduplicated digital-demand points; never a person count.';
comment on column public.database_visitor_tag.k_anon_count is
    'For web_behavior rows, distinct anonymous sessions in the reporting window.';
comment on function public.publish_web_observed_demand(
    jsonb, jsonb, jsonb, jsonb
) is
    'Private atomic refresh from real anonymous web behavior into the observed-needs and 60/40 V2 materializations.';

commit;
