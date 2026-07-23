begin;

create table if not exists public.census_tract (
    ct_code text primary key,
    dguid text,
    geo_name text,
    population_2021 integer,
    low_income_pct double precision,
    seniors_65plus_pct double precision,
    recent_immigrant_pct double precision,
    no_official_language_pct double precision,
    shelter_cost_burden_pct double precision,
    indigenous_identity_pct double precision,
    indigenous_identity_count integer,
    total_indigenous_identity_universe integer
);

create table if not exists public.ct_centroid (
    ct_code text primary key references public.census_tract (ct_code),
    dguid text,
    centroid_lon double precision,
    centroid_lat double precision
);

create table if not exists public.database_center (
    center_id text primary key,
    center_name text,
    latitude double precision,
    longitude double precision,
    address text,
    service_categories text,
    hours text,
    languages text,
    indigenous_led_or_specific boolean
);

create table if not exists public.database_visitor_tag (
    visit_group_id text primary key,
    center_id text references public.database_center (center_id),
    period_start date,
    period_end date,
    key_need text,
    k_anon_count integer,
    severity text,
    population_group text,
    language_need_flag boolean,
    settlement_need_flag boolean,
    indigenous_specific_need_flag boolean
);

create table if not exists public.service_table (
    service_id text primary key references public.database_center (center_id),
    service_name text,
    service_category text,
    address text,
    latitude double precision,
    longitude double precision,
    phone text,
    website text,
    language text,
    source_name text,
    source_url text,
    last_checked_date date
);

create table if not exists public.cisv_reference (
    dissemination_area text,
    province_or_territory text,
    dimension_1_score double precision,
    dimension_2_score double precision,
    dimension_3_score double precision,
    dimension_4_score double precision,
    cisv_score double precision,
    cisv_quintile integer,
    cisv_most_vulnerable_dimension text,
    da_str text primary key
);

-- The original pandas import preserved human-readable CISV headers. Add the
-- normalized migration columns when hardening an existing cloud project; the
-- next atomic refresh populates these columns and leaves legacy nullable
-- columns unused.
alter table public.cisv_reference add column if not exists dissemination_area text;
alter table public.cisv_reference add column if not exists province_or_territory text;
alter table public.cisv_reference add column if not exists dimension_1_score double precision;
alter table public.cisv_reference add column if not exists dimension_2_score double precision;
alter table public.cisv_reference add column if not exists dimension_3_score double precision;
alter table public.cisv_reference add column if not exists dimension_4_score double precision;
alter table public.cisv_reference add column if not exists cisv_score double precision;
alter table public.cisv_reference add column if not exists cisv_quintile integer;
alter table public.cisv_reference add column if not exists cisv_most_vulnerable_dimension text;

create table if not exists public.stm_stop (
    stop_id text primary key,
    stop_name text,
    stop_lat double precision,
    stop_lon double precision
);

create table if not exists public.area_profile (
    area_id text primary key,
    area_name text,
    borough_name text,
    latitude double precision,
    longitude double precision,
    population integer,
    income_indicator double precision,
    age_indicator double precision,
    language_indicator double precision,
    immigration_indicator double precision,
    housing_indicator double precision,
    vulnerability_score double precision,
    vulnerability_rank integer,
    top_vulnerability_drivers text
);

create table if not exists public.gap_score (
    area_id text primary key references public.area_profile (area_id),
    area_name text,
    borough_name text,
    latitude double precision,
    longitude double precision,
    vulnerability_score double precision,
    overall_accessibility_score double precision,
    gap_score double precision,
    gap_rank integer,
    priority_flag text,
    gap_drivers text,
    summary_en text,
    summary_fr text
);

create table if not exists public.accessibility (
    area_id text references public.area_profile (area_id),
    service_category text,
    nearest_service_distance_km double precision,
    service_count_within_threshold integer,
    accessibility_score double precision,
    accessibility_method text,
    primary key (area_id, service_category)
);

create table if not exists public.area_vulnerability_index_real (
    area_id text primary key references public.area_profile (area_id),
    area_name text,
    borough_name text,
    low_income_pct double precision,
    seniors_65plus_pct double precision,
    recent_immigrant_pct double precision,
    no_official_language_pct double precision,
    shelter_cost_burden_pct double precision,
    indigenous_identity_pct double precision,
    population_2021 double precision,
    low_income_pct_scaled double precision,
    seniors_65plus_pct_scaled double precision,
    recent_immigrant_pct_scaled double precision,
    no_official_language_pct_scaled double precision,
    shelter_cost_burden_pct_scaled double precision,
    indigenous_identity_pct_scaled double precision,
    vulnerability_index double precision,
    top_drivers text,
    immigrant_census_concern_score double precision,
    indigenous_census_concern_score double precision,
    mvp_focus_census_index double precision,
    mvp_focus_data_basis text,
    mvp_focus_top_concern text,
    vulnerability_rank integer
);

create table if not exists public.monitoring_summary (
    check_name text primary key,
    status text,
    value text,
    details text
);

create table if not exists public.role_activity_log (
    date date,
    owner text,
    role text,
    activity text,
    output text,
    decision_or_blocker text,
    next_step text,
    primary key (date, owner, role, activity)
);

create table if not exists public.flyer_examples (
    selected_area_id text references public.area_profile (area_id),
    area_label text,
    selected_service_category text,
    service_name text,
    address text,
    phone text,
    website text,
    language text,
    distance_km double precision,
    generated_date date,
    disclaimer text,
    primary key (selected_area_id, selected_service_category, service_name)
);

create table if not exists public.services_master (
    service_id text primary key,
    name text,
    primary_category text,
    service_categories text,
    address text,
    latitude double precision,
    longitude double precision,
    mappable boolean,
    geocode_precision text,
    area_id text references public.area_profile (area_id),
    borough_name text,
    phone text,
    website text,
    email text,
    hours text,
    services text,
    sources text,
    legacy_center_id text
);

create table if not exists public.center_area_lookup (
    center_id text primary key references public.database_center (center_id),
    area_id text references public.area_profile (area_id),
    borough_name text,
    join_method text
);

create table if not exists public.observed_need_index (
    area_id text primary key references public.area_profile (area_id),
    rolling_window_days integer,
    rolling_visit_count integer,
    visit_volume_per_1000 double precision,
    observed_visit_volume_score double precision,
    top_need_category text,
    top_need_count integer,
    top_need_share_pct double precision,
    top_category_rate_per_1000 double precision,
    top_category_pressure_score double precision,
    v1_demand_score double precision,
    data_through_date date,
    observed_immigrant_need_score double precision,
    observed_indigenous_need_score double precision,
    focus_category_share_score double precision,
    observed_severity_breadth_score double precision,
    observed_recency_score double precision,
    v2_observed_score double precision,
    observed_focus_need_score double precision,
    observed_data_basis text,
    insufficient_visit_data boolean,
    top_key_needs text,
    observed_need_rank integer
);

create table if not exists public.observed_need_category_summary (
    area_id text references public.area_profile (area_id),
    key_need text,
    encounter_count integer,
    encounter_share_pct double precision,
    category_rank integer,
    primary key (area_id, key_need)
);

create table if not exists public.vulnerability_index_v2 (
    area_id text primary key references public.area_profile (area_id),
    area_name text,
    borough_name text,
    structural_vulnerability_index double precision,
    immigrant_census_concern_score double precision,
    indigenous_census_concern_score double precision,
    mvp_focus_census_index double precision,
    v1_demand_score double precision,
    visit_volume_score double precision,
    top_category_pressure_score double precision,
    focus_category_share_score double precision,
    severity_breadth_score double precision,
    recency_score double precision,
    v2_observed_score double precision,
    observed_focus_need_score double precision,
    vulnerability_index_v2 double precision,
    structural_weight double precision,
    observed_weight double precision,
    insufficient_visit_data boolean,
    v2_data_basis text,
    v2_top_concern text,
    vulnerability_rank_v2 integer
);

-- Existing pandas-created cloud tables predate the migration. Add their keys
-- explicitly and fail the migration if duplicate or orphaned rows exist.
create or replace function pg_temp.ensure_primary_key(
    target regclass,
    constraint_name text,
    columns_sql text
) returns void language plpgsql as $$
begin
    if not exists (
        select 1 from pg_constraint where conrelid = target and contype = 'p'
    ) then
        execute format(
            'alter table %s add constraint %I primary key (%s)',
            target,
            constraint_name,
            columns_sql
        );
    end if;
end;
$$;

select pg_temp.ensure_primary_key('public.census_tract', 'census_tract_pkey', 'ct_code');
select pg_temp.ensure_primary_key('public.ct_centroid', 'ct_centroid_pkey', 'ct_code');
select pg_temp.ensure_primary_key('public.database_center', 'database_center_pkey', 'center_id');
select pg_temp.ensure_primary_key('public.database_visitor_tag', 'database_visitor_tag_pkey', 'visit_group_id');
select pg_temp.ensure_primary_key('public.service_table', 'service_table_pkey', 'service_id');
select pg_temp.ensure_primary_key('public.cisv_reference', 'cisv_reference_pkey', 'da_str');
select pg_temp.ensure_primary_key('public.stm_stop', 'stm_stop_pkey', 'stop_id');
select pg_temp.ensure_primary_key('public.area_profile', 'area_profile_pkey', 'area_id');
select pg_temp.ensure_primary_key('public.gap_score', 'gap_score_pkey', 'area_id');
select pg_temp.ensure_primary_key('public.accessibility', 'accessibility_pkey', 'area_id, service_category');
select pg_temp.ensure_primary_key('public.area_vulnerability_index_real', 'area_vulnerability_index_real_pkey', 'area_id');
select pg_temp.ensure_primary_key('public.monitoring_summary', 'monitoring_summary_pkey', 'check_name');
select pg_temp.ensure_primary_key('public.role_activity_log', 'role_activity_log_pkey', 'date, owner, role, activity');
select pg_temp.ensure_primary_key('public.flyer_examples', 'flyer_examples_pkey', 'selected_area_id, selected_service_category, service_name');
select pg_temp.ensure_primary_key('public.services_master', 'services_master_pkey', 'service_id');
select pg_temp.ensure_primary_key('public.center_area_lookup', 'center_area_lookup_pkey', 'center_id');
select pg_temp.ensure_primary_key('public.observed_need_index', 'observed_need_index_pkey', 'area_id');
select pg_temp.ensure_primary_key('public.observed_need_category_summary', 'observed_need_category_summary_pkey', 'area_id, key_need');
select pg_temp.ensure_primary_key('public.vulnerability_index_v2', 'vulnerability_index_v2_pkey', 'area_id');

create or replace function pg_temp.ensure_foreign_key(
    target regclass,
    constraint_name text,
    definition_sql text
) returns void language plpgsql as $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = target and conname = constraint_name and contype = 'f'
    ) then
        execute format(
            'alter table %s add constraint %I foreign key %s',
            target,
            constraint_name,
            definition_sql
        );
    end if;
end;
$$;

select pg_temp.ensure_foreign_key('public.ct_centroid', 'ct_centroid_ct_code_fkey', '(ct_code) references public.census_tract (ct_code)');
select pg_temp.ensure_foreign_key('public.database_visitor_tag', 'database_visitor_tag_center_id_fkey', '(center_id) references public.database_center (center_id)');
select pg_temp.ensure_foreign_key('public.service_table', 'service_table_service_id_fkey', '(service_id) references public.database_center (center_id)');
select pg_temp.ensure_foreign_key('public.gap_score', 'gap_score_area_id_fkey', '(area_id) references public.area_profile (area_id)');
select pg_temp.ensure_foreign_key('public.accessibility', 'accessibility_area_id_fkey', '(area_id) references public.area_profile (area_id)');
select pg_temp.ensure_foreign_key('public.area_vulnerability_index_real', 'area_vulnerability_index_real_area_id_fkey', '(area_id) references public.area_profile (area_id)');
select pg_temp.ensure_foreign_key('public.flyer_examples', 'flyer_examples_area_id_fkey', '(selected_area_id) references public.area_profile (area_id)');
select pg_temp.ensure_foreign_key('public.services_master', 'services_master_area_id_fkey', '(area_id) references public.area_profile (area_id)');
select pg_temp.ensure_foreign_key('public.center_area_lookup', 'center_area_lookup_center_id_fkey', '(center_id) references public.database_center (center_id)');
select pg_temp.ensure_foreign_key('public.center_area_lookup', 'center_area_lookup_area_id_fkey', '(area_id) references public.area_profile (area_id)');
select pg_temp.ensure_foreign_key('public.observed_need_index', 'observed_need_index_area_id_fkey', '(area_id) references public.area_profile (area_id)');
select pg_temp.ensure_foreign_key('public.observed_need_category_summary', 'observed_need_category_summary_area_id_fkey', '(area_id) references public.area_profile (area_id)');
select pg_temp.ensure_foreign_key('public.vulnerability_index_v2', 'vulnerability_index_v2_area_id_fkey', '(area_id) references public.area_profile (area_id)');

create index if not exists ix_database_visitor_tag_center_id on public.database_visitor_tag (center_id);
create index if not exists ix_database_visitor_tag_period_end on public.database_visitor_tag (period_end);
create index if not exists ix_database_center_service_categories on public.database_center (service_categories);
create index if not exists ix_service_table_category on public.service_table (service_category);
create index if not exists ix_service_table_coordinates on public.service_table (latitude, longitude);
create index if not exists ix_area_profile_borough on public.area_profile (borough_name);
create index if not exists ix_gap_score_rank on public.gap_score (gap_rank);
create index if not exists ix_services_master_area on public.services_master (area_id);
create index if not exists ix_services_master_category on public.services_master (primary_category);
create index if not exists ix_observed_need_rank on public.observed_need_index (observed_need_rank);
create index if not exists ix_vulnerability_v2_rank on public.vulnerability_index_v2 (vulnerability_rank_v2);

create or replace view public.v_visit_needs_by_center
with (security_invoker = true) as
select
    c.center_id,
    c.center_name,
    c.service_categories,
    c.indigenous_led_or_specific,
    v.key_need,
    v.population_group,
    v.k_anon_count,
    v.severity
from public.database_visitor_tag v
join public.database_center c on c.center_id = v.center_id;

create or replace view public.v_ct_vulnerability
with (security_invoker = true) as
select
    t.ct_code,
    t.geo_name,
    t.population_2021,
    t.low_income_pct,
    t.recent_immigrant_pct,
    t.indigenous_identity_pct,
    g.centroid_lat,
    g.centroid_lon
from public.census_tract t
left join public.ct_centroid g on g.ct_code = t.ct_code;

commit;
