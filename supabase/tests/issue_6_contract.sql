do $$
declare
    required_tables constant text[] := array[
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
    ];
    app_tables constant text[] := array[
        'area_profile',
        'gap_score',
        'accessibility',
        'service_table',
        'services_master',
        'observed_need_index',
        'observed_need_category_summary',
        'vulnerability_index_v2'
    ];
    missing_objects text;
    failed_objects text;
    actual_count bigint;
begin
    select string_agg(name, ', ' order by name)
    into missing_objects
    from unnest(required_tables) as name
    where to_regclass(format('public.%I', name)) is null;
    if missing_objects is not null then
        raise exception 'Missing required tables: %', missing_objects;
    end if;

    if to_regclass('public.v_visit_needs_by_center') is null
       or to_regclass('public.v_ct_vulnerability') is null then
        raise exception 'One or more required views are missing';
    end if;

    select string_agg(name, ', ' order by name)
    into failed_objects
    from unnest(required_tables) as name
    where not exists (
        select 1
        from pg_constraint
        where conrelid = to_regclass(format('public.%I', name))
          and contype = 'p'
    );
    if failed_objects is not null then
        raise exception 'Tables without primary keys: %', failed_objects;
    end if;

    select string_agg(name, ', ' order by name)
    into failed_objects
    from unnest(required_tables) as name
    join pg_class c on c.oid = to_regclass(format('public.%I', name))
    where not c.relrowsecurity;
    if failed_objects is not null then
        raise exception 'Tables without RLS: %', failed_objects;
    end if;

    select string_agg(name, ', ' order by name)
    into failed_objects
    from unnest(app_tables) as name
    where not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = name
          and cmd = 'SELECT'
          and ('anon' = any(roles) or 'public' = any(roles))
          and qual = 'true'
    );
    if failed_objects is not null then
        raise exception 'App tables without an unconditional anon SELECT policy: %', failed_objects;
    end if;

    if exists (
        select 1
        from information_schema.role_table_grants
        where table_schema = 'public'
          and grantee in ('PUBLIC', 'anon', 'authenticated')
          and (
              table_name <> all(app_tables)
              or privilege_type <> 'SELECT'
          )
    ) then
        raise exception 'Browser roles have grants outside the approved read-only table set';
    end if;

    select string_agg(name, ', ' order by name)
    into failed_objects
    from unnest(app_tables) as name
    where not exists (
        select 1
        from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = name
          and grantee = 'anon'
          and privilege_type = 'SELECT'
    );
    if failed_objects is not null then
        raise exception 'App tables missing anon SELECT grants: %', failed_objects;
    end if;

    if not exists (
        select 1 from pg_class
        where oid = 'public.v_visit_needs_by_center'::regclass
          and reloptions @> array['security_invoker=true']
    ) or not exists (
        select 1 from pg_class
        where oid = 'public.v_ct_vulnerability'::regclass
          and reloptions @> array['security_invoker=true']
    ) then
        raise exception 'Required views must use security_invoker=true';
    end if;

    select count(*) into actual_count from public.area_profile;
    if actual_count <> 12 then raise exception 'area_profile expected 12 rows, found %', actual_count; end if;
    select count(*) into actual_count from public.gap_score;
    if actual_count <> 12 then raise exception 'gap_score expected 12 rows, found %', actual_count; end if;
    select count(*) into actual_count from public.accessibility;
    if actual_count <> 108 then raise exception 'accessibility expected 108 rows, found %', actual_count; end if;
    select count(*) into actual_count from public.service_table;
    if actual_count <> 4255 then raise exception 'service_table expected 4255 rows, found %', actual_count; end if;
    select count(*) into actual_count from public.services_master;
    if actual_count <> 3664 then raise exception 'services_master expected 3664 rows, found %', actual_count; end if;
    select count(*) into actual_count from public.observed_need_index;
    if actual_count <> 12 then raise exception 'observed_need_index expected 12 rows, found %', actual_count; end if;
    select count(*) into actual_count from public.observed_need_category_summary;
    if actual_count <> 110 then raise exception 'observed_need_category_summary expected 110 rows, found %', actual_count; end if;
    select count(*) into actual_count from public.vulnerability_index_v2;
    if actual_count <> 12 then raise exception 'vulnerability_index_v2 expected 12 rows, found %', actual_count; end if;

    if exists (
        select 1 from public.gap_score g
        left join public.area_profile a using (area_id)
        where a.area_id is null
    ) then raise exception 'gap_score contains orphan area IDs'; end if;
    if exists (
        select 1 from public.accessibility x
        left join public.area_profile a using (area_id)
        where a.area_id is null
    ) then raise exception 'accessibility contains orphan area IDs'; end if;
    if exists (
        select 1 from public.observed_need_index o
        left join public.area_profile a using (area_id)
        where a.area_id is null
    ) then raise exception 'observed_need_index contains orphan area IDs'; end if;
    if exists (
        select 1 from public.observed_need_category_summary o
        left join public.area_profile a using (area_id)
        where a.area_id is null
    ) then raise exception 'observed_need_category_summary contains orphan area IDs'; end if;
    if exists (
        select 1 from public.vulnerability_index_v2 v
        left join public.area_profile a using (area_id)
        where a.area_id is null
    ) then raise exception 'vulnerability_index_v2 contains orphan area IDs'; end if;

    if exists (
        select 1 from public.observed_need_index
        where observed_data_basis is null or btrim(observed_data_basis) = ''
    ) then raise exception 'observed_need_index has a missing data basis'; end if;
    if exists (
        select 1 from public.vulnerability_index_v2
        where v2_data_basis is null or btrim(v2_data_basis) = ''
    ) then raise exception 'vulnerability_index_v2 has a missing data basis'; end if;
    if exists (
        select 1 from public.vulnerability_index_v2
        where abs((structural_weight + observed_weight) - 1.0) > 0.000001
    ) then raise exception 'vulnerability_index_v2 weights do not sum to 1'; end if;

    raise notice 'PASS issue #6 owner-level Supabase contract validation';
end;
$$;
