begin;

-- Audience-filter columns for services_master, powering the app's who-is-served
-- filters (group / gender / age). Populated by
-- scripts/data_pipeline/classify_service_audience.py during the services_master
-- build; keyword-derived, so treat as best-effort hints, not authoritative.
alter table public.services_master
    add column if not exists serves_indigenous boolean,
    add column if not exists serves_immigrant boolean,
    add column if not exists gender_focus text,
    add column if not exists age_groups text;

commit;
