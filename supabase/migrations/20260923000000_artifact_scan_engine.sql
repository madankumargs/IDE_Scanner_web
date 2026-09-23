create table if not exists public.artifact_scans (
  id uuid primary key default gen_random_uuid(), artifact_id uuid not null references public.artifacts(id) on delete cascade,
  decision text not null, verdict text not null, severity text not null, decision_reason text,
  public_outcome text, coverage_percent numeric, risk_score numeric, malware_score numeric,
  capability_assessment jsonb not null default '{}'::jsonb, analysis_coverage jsonb not null default '{}'::jsonb,
  analysis_status text not null default 'incomplete', findings jsonb not null default '[]'::jsonb, scanned_at timestamptz not null default now()
);
create index if not exists artifact_scans_artifact_scanned_idx on public.artifact_scans (artifact_id, scanned_at desc);
