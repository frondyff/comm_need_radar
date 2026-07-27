-- Version anonymous product analytics for exposure-normalized digital-demand
-- research. These signals remain private and cannot replace the production
-- Census vulnerability/gap score without a later product decision.

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
create index if not exists ix_page_events_shadow_area
    on public.page_events (selected_area_id, service_area_id, created_at)
    where is_test = false and anonymous_session_id is not null;
create index if not exists ix_page_events_shadow_session
    on public.page_events (anonymous_session_id, event_type, created_at)
    where is_test = false;
create index if not exists ix_flyer_downloads_created_at
    on public.flyer_downloads (created_at);
create index if not exists ix_flyer_downloads_shadow_area
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
-- rows have enough session/area/exposure context to enter shadow scoring.
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

create table if not exists public.digital_demand_dataset (
    dataset_id uuid primary key,
    source_type text not null default 'web_behavior'
        check (source_type = 'web_behavior'),
    dataset_label text not null,
    publication_state text not null default 'private_pilot'
        check (publication_state in ('private_pilot', 'reviewable', 'approved', 'rejected')),
    scoring_version text not null,
    period_start date not null,
    period_end date not null,
    window_days integer not null check (window_days > 0),
    event_weights jsonb not null,
    quality_thresholds jsonb not null,
    quality_status text not null
        check (quality_status in ('insufficient', 'experimental', 'reviewable', 'failed')),
    input_page_event_count integer not null default 0 check (input_page_event_count >= 0),
    input_flyer_download_count integer not null default 0 check (input_flyer_download_count >= 0),
    eligible_event_count integer not null default 0 check (eligible_event_count >= 0),
    excluded_event_count integer not null default 0 check (excluded_event_count >= 0),
    approved_by text,
    approved_at timestamptz,
    created_at timestamptz not null default now(),
    check (period_end >= period_start),
    check (
        publication_state <> 'approved'
        or (approved_by is not null and approved_at is not null)
    )
);

create table if not exists public.digital_demand_area (
    dataset_id uuid not null references public.digital_demand_dataset (dataset_id)
        on delete cascade,
    area_id text not null references public.area_profile (area_id),
    unique_sessions integer not null check (unique_sessions >= 0),
    active_days integer not null check (active_days >= 0),
    service_impressions integer not null check (service_impressions >= 0),
    weighted_intent double precision not null check (weighted_intent >= 0),
    intent_rate_per_100_impressions double precision,
    digital_demand_score double precision,
    coverage_status text not null
        check (coverage_status in ('insufficient', 'experimental', 'reviewable')),
    data_basis text not null,
    primary key (dataset_id, area_id),
    check (
        digital_demand_score is null
        or digital_demand_score between 0 and 100
    )
);

create table if not exists public.priority_score_v2_shadow (
    dataset_id uuid not null references public.digital_demand_dataset (dataset_id)
        on delete cascade,
    area_id text not null references public.area_profile (area_id),
    structural_vulnerability_score double precision not null
        check (structural_vulnerability_score between 0 and 100),
    digital_demand_score double precision,
    structural_weight double precision not null
        check (structural_weight between 0.75 and 1.0),
    digital_weight double precision not null
        check (digital_weight between 0 and 0.25),
    priority_score_v2_shadow double precision not null
        check (priority_score_v2_shadow between 0 and 100),
    coverage_status text not null
        check (coverage_status in ('insufficient', 'experimental', 'reviewable')),
    score_data_basis text not null,
    shadow_rank integer not null check (shadow_rank > 0),
    primary key (dataset_id, area_id),
    check (abs((structural_weight + digital_weight) - 1.0) < 0.000001),
    check (
        digital_demand_score is null
        or digital_demand_score between 0 and 100
    ),
    check (digital_weight = 0 or digital_demand_score is not null)
);

create index if not exists ix_digital_demand_dataset_period
    on public.digital_demand_dataset (period_end desc);
create index if not exists ix_digital_demand_area_rank
    on public.digital_demand_area (dataset_id, digital_demand_score desc);
create index if not exists ix_priority_score_v2_shadow_rank
    on public.priority_score_v2_shadow (dataset_id, shadow_rank);

alter table public.digital_demand_dataset enable row level security;
alter table public.digital_demand_area enable row level security;
alter table public.priority_score_v2_shadow enable row level security;

revoke all on public.digital_demand_dataset from public, anon, authenticated;
revoke all on public.digital_demand_area from public, anon, authenticated;
revoke all on public.priority_score_v2_shadow from public, anon, authenticated;

create or replace function public.enforce_shadow_digital_coverage()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    dataset_quality text;
    reviewable_areas integer;
    expected_areas integer;
begin
    if new.digital_weight = 0 then
        return new;
    end if;

    select quality_status into dataset_quality
    from public.digital_demand_dataset
    where dataset_id = new.dataset_id;

    select count(*) into reviewable_areas
    from public.digital_demand_area
    where dataset_id = new.dataset_id
      and coverage_status = 'reviewable';

    select count(*) into expected_areas from public.area_profile;

    if dataset_quality <> 'reviewable'
       or reviewable_areas <> expected_areas then
        raise exception
            'Digital shadow weight requires a reviewable dataset covering all areas';
    end if;
    return new;
end;
$$;

drop trigger if exists enforce_shadow_digital_coverage
    on public.priority_score_v2_shadow;
create trigger enforce_shadow_digital_coverage
    before insert or update on public.priority_score_v2_shadow
    for each row execute function public.enforce_shadow_digital_coverage();

revoke all on function public.enforce_shadow_digital_coverage()
    from public, anon, authenticated;

comment on table public.digital_demand_dataset is
    'Private provenance and quality record for experimental web-behavior demand scoring.';
comment on table public.digital_demand_area is
    'Private exposure-normalized web-behavior demand aggregates; not a population estimate.';
comment on table public.priority_score_v2_shadow is
    'Private shadow composite. It does not feed the production gap score.';
