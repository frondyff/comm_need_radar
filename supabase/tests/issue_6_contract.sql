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
        'flyer_downloads'
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
    private_tables constant text[] := array[
        'database_visitor_tag'
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
    if to_regprocedure(
        'public.publish_web_observed_demand(jsonb,jsonb,jsonb,jsonb)'
    ) is null then
        raise exception 'Private web-observed publication function is missing';
    end if;
    if to_regprocedure(
        'public.publish_scoring_contract_02(jsonb,jsonb,jsonb)'
    ) is null then
        raise exception 'Private scoring-contract publication function is missing';
    end if;
    if has_function_privilege(
        'anon',
        'public.publish_scoring_contract_02(jsonb,jsonb,jsonb)',
        'EXECUTE'
    ) or has_function_privilege(
        'authenticated',
        'public.publish_scoring_contract_02(jsonb,jsonb,jsonb)',
        'EXECUTE'
    ) or not has_function_privilege(
        'service_role',
        'public.publish_scoring_contract_02(jsonb,jsonb,jsonb)',
        'EXECUTE'
    ) then
        raise exception 'Scoring publication function permissions are unsafe';
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
          and table_name = any(private_tables)
          and grantee in ('PUBLIC', 'anon', 'authenticated')
    ) then
        raise exception 'Browser roles can access private visitor-tag data';
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

    select string_agg(column_name, ', ' order by column_name)
    into missing_objects
    from unnest(array[
        'source_type',
        'area_id',
        'weighted_demand_total',
        'service_impression_count',
        'intent_rate_per_100_impressions',
        'digital_demand_score',
        'coverage_status',
        'scoring_version'
    ]) as required_column(column_name)
    where not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'database_visitor_tag'
          and c.column_name = required_column.column_name
    );
    if missing_objects is not null then
        raise exception 'Web visitor-tag columns missing: %', missing_objects;
    end if;

    -- Candidate scoring-contract-02 columns. This owner-level test is expected
    -- to pass only after the additive migration and approved atomic data
    -- refresh; it is not a command to publish the candidate.
    select string_agg(spec.table_name || '.' || spec.column_name, ', ' order by 1)
    into missing_objects
    from (
        values
            ('area_profile', 'population_basis'),
            ('area_profile', 'structural_vulnerability_score'),
            ('area_profile', 'structural_vulnerability_rank'),
            ('area_profile', 'structural_formula_id'),
            ('area_profile', 'score_basis'),
            ('area_profile', 'score_version'),
            ('area_profile', 'source_year'),
            ('area_profile', 'source_geography_level'),
            ('area_profile', 'source_geography_name'),
            ('accessibility', 'distance_component'),
            ('accessibility', 'availability_component'),
            ('accessibility', 'accessibility_basis'),
            ('accessibility', 'accessibility_version'),
            ('accessibility', 'accessibility_formula_id'),
            ('accessibility', 'formula_set_version'),
            ('accessibility', 'taxonomy_version'),
            ('accessibility', 'service_snapshot_id'),
            ('accessibility', 'service_snapshot_date'),
            ('accessibility', 'service_snapshot_total_rows'),
            ('accessibility', 'service_snapshot_mappable_rows'),
            ('gap_score', 'structural_vulnerability_score'),
            ('gap_score', 'service_accessibility_score'),
            ('gap_score', 'classification_status'),
            ('gap_score', 'structural_formula_id'),
            ('gap_score', 'accessibility_formula_id'),
            ('gap_score', 'gap_formula_id'),
            ('gap_score', 'formula_set_version'),
            ('gap_score', 'gap_basis'),
            ('gap_score', 'gap_version'),
            ('gap_score', 'taxonomy_version'),
            ('gap_score', 'service_snapshot_id')
    ) as spec(table_name, column_name)
    where not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = spec.table_name
          and c.column_name = spec.column_name
    );
    if missing_objects is not null then
        raise exception 'Candidate scoring columns missing: %', missing_objects;
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
        select 1
        from public.area_profile
        where structural_formula_id is distinct from 'STRUCT-01'
           or structural_vulnerability_score is null
           or structural_vulnerability_rank is null
           or abs(vulnerability_score - structural_vulnerability_score) > 0.01
           or vulnerability_rank <> structural_vulnerability_rank
    ) then raise exception 'area_profile structural aliases or formula IDs are inconsistent'; end if;
    if exists (
        select 1
        from public.accessibility
        where accessibility_formula_id is distinct from 'ACCESS-REAL-02'
           or formula_set_version is distinct from 'scoring-contract-02'
           or taxonomy_version is distinct from 'planning-needs-9-v1'
           or distance_component not between 0 and 100
           or availability_component not between 0 and 100
           or accessibility_score not between 0 and 100
           or abs(
                accessibility_score
                - (0.5 * distance_component + 0.5 * availability_component)
           ) > 0.011
           or service_snapshot_total_rows <> 3664
           or service_snapshot_mappable_rows <> 3200
    ) then raise exception 'accessibility rows violate scoring-contract-02'; end if;
    select count(distinct service_category) into actual_count
    from public.accessibility;
    if actual_count <> 9 then
        raise exception 'accessibility expected 9 planning categories, found %', actual_count;
    end if;
    if exists (
        select 1
        from public.gap_score
        where structural_formula_id is distinct from 'STRUCT-01'
           or accessibility_formula_id is distinct from 'ACCESS-REAL-02'
           or gap_formula_id is distinct from 'GAP-CANON-02'
           or formula_set_version is distinct from 'scoring-contract-02'
           or classification_status is distinct from 'unvalidated_poc'
           or structural_vulnerability_score is null
           or service_accessibility_score is null
           or nullif(btrim(priority_flag), '') is not null
           or abs(vulnerability_score - structural_vulnerability_score) > 0.01
           or abs(overall_accessibility_score - service_accessibility_score) > 0.01
           or abs(
                gap_score
                - structural_vulnerability_score
                  * (100.0 - service_accessibility_score)
                  / 100.0
           ) > 0.011
    ) then raise exception 'gap_score rows violate scoring-contract-02'; end if;
    if exists (
        select 1 from public.vulnerability_index_v2
        where abs((structural_weight + observed_weight) - 1.0) > 0.000001
    ) then raise exception 'vulnerability_index_v2 weights do not sum to 1'; end if;
    if exists (
        select 1 from public.database_visitor_tag
        where source_type = 'web_behavior'
          and (
              k_anon_count < 5
              or weighted_demand_total < 0
              or service_impression_count < 0
              or (
                  digital_demand_score is not null
                  and digital_demand_score not between 0 and 100
              )
          )
    ) then raise exception 'Web visitor-tag aggregates violate privacy or score bounds'; end if;
    if exists (
        select 1 from public.observed_need_category_summary
        where source_type = 'web_behavior'
          and encounter_count < 5
    ) then raise exception 'Web observed categories violate the k-anonymity floor'; end if;
    if exists (
        select 1 from public.vulnerability_index_v2
        where observed_weight not in (0.0, 0.4)
           or structural_weight not in (0.6, 1.0)
    ) then raise exception 'V2 does not use structural fallback or the original 60/40 formula'; end if;
    select count(*) into actual_count
    from public.vulnerability_index_v2
    where observed_weight = 0.4;
    if actual_count not in (0, 12) then
        raise exception 'Observed weight is applied to only part of the study geography';
    end if;
    if actual_count = 12 and (
        select count(distinct area_id)
        from public.database_visitor_tag
        where source_type = 'web_behavior'
          and coverage_status = 'reviewable'
          and digital_demand_score is not null
    ) <> 12 then
        raise exception '60/40 V2 lacks reviewable web visitor tags for all areas';
    end if;

    raise notice 'PASS issue #6 owner-level Supabase contract validation';
end;
$$;
