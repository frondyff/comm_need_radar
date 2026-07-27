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
        'vulnerability_index_v2',
        'page_events',
        'flyer_downloads',
        'digital_demand_dataset',
        'digital_demand_area',
        'priority_score_v2_shadow'
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
    analytics_tables constant text[] := array[
        'page_events',
        'flyer_downloads'
    ];
    shadow_tables constant text[] := array[
        'digital_demand_dataset',
        'digital_demand_area',
        'priority_score_v2_shadow'
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
    if to_regprocedure('public.enforce_shadow_digital_coverage()') is null
       or not exists (
           select 1
           from pg_trigger
           where tgrelid = 'public.priority_score_v2_shadow'::regclass
             and tgname = 'enforce_shadow_digital_coverage'
             and not tgisinternal
       ) then
        raise exception 'Digital shadow coverage trigger is missing';
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
          and not (
              (table_name = any(app_tables) and privilege_type = 'SELECT')
              or (
                  table_name = any(analytics_tables)
                  and privilege_type = 'INSERT'
              )
          )
    ) then
        raise exception 'Browser roles have grants outside approved read or analytics-insert sets';
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

    select string_agg(name, ', ' order by name)
    into failed_objects
    from unnest(analytics_tables) as name
    where not exists (
        select 1
        from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = name
          and grantee = 'anon'
          and privilege_type = 'INSERT'
    ) or not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = name
          and cmd = 'INSERT'
          and ('anon' = any(roles) or 'public' = any(roles))
    );
    if failed_objects is not null then
        raise exception 'Analytics tables missing controlled anon INSERT access: %', failed_objects;
    end if;

    if exists (
        select 1
        from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = any(shadow_tables)
          and grantee in ('PUBLIC', 'anon', 'authenticated')
    ) then
        raise exception 'Browser roles can access private digital-demand shadow tables';
    end if;

    select string_agg(column_name, ', ' order by column_name)
    into missing_objects
    from unnest(array[
        'event_version',
        'anonymous_session_id',
        'selected_area_id',
        'service_area_id',
        'source_view',
        'is_test'
    ]) as required_column(column_name)
    where not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'page_events'
          and c.column_name = required_column.column_name
    ) or not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'flyer_downloads'
          and c.column_name = required_column.column_name
    );
    if missing_objects is not null then
        raise exception 'Analytics scoring columns missing: %', missing_objects;
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
    if exists (
        select 1 from public.priority_score_v2_shadow
        where abs((structural_weight + digital_weight) - 1.0) > 0.000001
           or digital_weight > 0.25
    ) then raise exception 'shadow priority weights violate the approved guardrail'; end if;
    if exists (
        select 1
        from public.priority_score_v2_shadow s
        join public.digital_demand_dataset d using (dataset_id)
        where s.digital_weight > 0
          and (
              d.quality_status <> 'reviewable'
              or (
                  select count(*)
                  from public.digital_demand_area a
                  where a.dataset_id = s.dataset_id
                    and a.coverage_status = 'reviewable'
              ) <> (select count(*) from public.area_profile)
          )
    ) then raise exception 'shadow digital weight applied before full area coverage'; end if;
    if exists (
        select 1 from public.digital_demand_dataset
        where publication_state = 'approved'
          and (approved_by is null or approved_at is null)
    ) then raise exception 'approved digital-demand dataset lacks owner approval'; end if;

    raise notice 'PASS issue #6 owner-level Supabase contract validation';
end;
$$;
