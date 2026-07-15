begin;

-- Supabase's public schema is API-exposed. Start with no browser-role access,
-- then grant SELECT only on the six reviewed app-ready tables.
revoke create on schema public from public, anon, authenticated;
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'census_tract',
        'ct_centroid',
        'database_center',
        'database_visitor_tag',
        'service_table',
        'cisv_reference',
        'stm_stop',
        'area_profile',
        'gap_score',
        'accessibility',
        'area_vulnerability_index_real',
        'monitoring_summary',
        'role_activity_log',
        'flyer_examples',
        'services_master',
        'center_area_lookup',
        'observed_need_index',
        'observed_need_category_summary',
        'vulnerability_index_v2'
    ] loop
        execute format('alter table public.%I enable row level security', table_name);
    end loop;
end;
$$;

-- Remove policies inherited from the initial import. Grants and policies are
-- both required for access, but deleting stale write policies prevents a future
-- grant change from silently reopening writes.
do $$
declare
    policy_record record;
begin
    for policy_record in
        select schemaname, tablename, policyname
        from pg_policies
        where schemaname = 'public'
    loop
        execute format(
            'drop policy %I on %I.%I',
            policy_record.policyname,
            policy_record.schemaname,
            policy_record.tablename
        );
    end loop;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select on table
    public.area_profile,
    public.gap_score,
    public.accessibility,
    public.service_table,
    public.observed_need_index,
    public.vulnerability_index_v2
to anon, authenticated;

drop policy if exists app_read_area_profile on public.area_profile;
create policy app_read_area_profile on public.area_profile
for select to anon, authenticated using (true);

drop policy if exists app_read_gap_score on public.gap_score;
create policy app_read_gap_score on public.gap_score
for select to anon, authenticated using (true);

drop policy if exists app_read_accessibility on public.accessibility;
create policy app_read_accessibility on public.accessibility
for select to anon, authenticated using (true);

drop policy if exists app_read_service_table on public.service_table;
create policy app_read_service_table on public.service_table
for select to anon, authenticated using (true);

drop policy if exists app_read_observed_need_index on public.observed_need_index;
create policy app_read_observed_need_index on public.observed_need_index
for select to anon, authenticated using (true);

drop policy if exists app_read_vulnerability_index_v2 on public.vulnerability_index_v2;
create policy app_read_vulnerability_index_v2 on public.vulnerability_index_v2
for select to anon, authenticated using (true);

-- Raw-data views inherit their underlying tables' RLS and are not granted to
-- browser roles. They remain available to the database owner and loader role.
revoke all on public.v_visit_needs_by_center from public, anon, authenticated;
revoke all on public.v_ct_vulnerability from public, anon, authenticated;

commit;
