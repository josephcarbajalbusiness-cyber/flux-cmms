-- ─────────────────────────────────────────────────────────────────
-- 004_report_comments.sql
-- Comments / activity log per work order (OT)
-- ─────────────────────────────────────────────────────────────────

create table if not exists public.report_comments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  report_id   uuid not null references public.service_reports(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  message     text not null,
  created_at  timestamptz not null default now()
);

-- Index for fast per-report queries
create index if not exists idx_report_comments_report_id on public.report_comments(report_id, created_at);

-- Enable RLS
alter table public.report_comments enable row level security;

-- Only members of the same tenant can read/write
create policy "tenant_select_comments" on public.report_comments
  for select using (tenant_id = public.get_tenant_id(auth.uid()));

create policy "tenant_insert_comments" on public.report_comments
  for insert with check (tenant_id = public.get_tenant_id(auth.uid()));

create policy "tenant_delete_own_comment" on public.report_comments
  for delete using (
    tenant_id = public.get_tenant_id(auth.uid()) and author_id = auth.uid()
  );
