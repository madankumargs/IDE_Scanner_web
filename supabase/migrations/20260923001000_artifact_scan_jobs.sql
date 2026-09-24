create table if not exists public.artifact_scan_jobs (
  id uuid primary key default gen_random_uuid(), artifact_id uuid not null references public.artifacts(id) on delete cascade,
  artifact_version text not null, kind text not null check (kind in ('skill','plugin','mcp')),
  source text not null check (source in ('github','npm')), source_ref text not null, locator jsonb not null,
  requested_by uuid, status text not null default 'queued' check (status in ('queued','running','complete','failed')),
  lifecycle_stage text not null default 'queued', error text, dispatch_succeeded_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz,
  unique (artifact_id, artifact_version)
);
create index if not exists artifact_scan_jobs_status_idx on public.artifact_scan_jobs (status, created_at);
create table if not exists public.artifact_scan_job_events (
  id bigint generated always as identity primary key, job_id uuid not null references public.artifact_scan_jobs(id) on delete cascade,
  stage text not null, event_type text not null, detail jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
