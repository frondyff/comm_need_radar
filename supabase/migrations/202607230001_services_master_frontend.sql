begin;

-- The canonical dashboard reads the deduplicated service directory. Preserve
-- the legacy service_table read contract during migration, while adding the
-- reviewed read-only services_master contract used by production.
alter table public.services_master enable row level security;
revoke all on public.services_master from public, anon, authenticated;
grant select on public.services_master to anon, authenticated;

drop policy if exists app_read_services_master on public.services_master;
create policy app_read_services_master on public.services_master
for select to anon, authenticated using (true);

commit;
