begin;

-- Allow the app's anon key to read the per-area need-category breakdown so the
-- grounded frontend chatbot's demand-by-category answers work in the browser.
-- Consistent with the other app_read_* policies. Read-only; no write access.
alter table public.observed_need_category_summary enable row level security;

drop policy if exists app_read_observed_need_category_summary on public.observed_need_category_summary;
create policy app_read_observed_need_category_summary on public.observed_need_category_summary
for select to anon, authenticated using (true);

commit;
