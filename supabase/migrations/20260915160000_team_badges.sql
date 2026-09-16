-- Team-owned exact-release badges. Public rendering is intentionally served
-- from a narrow token lookup and never from the workspace response.
create table public.team_badges (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  extension_id text not null references public.extensions(id) on delete cascade,
  badge_key text not null,
  display_name text not null check (char_length(display_name) between 1 and 255),
  mode text not null default 'exact_release' check (mode in ('exact_release', 'latest')),
  version text not null check (char_length(version) between 1 and 120),
  scan_id uuid references public.scans(id) on delete set null,
  scan_job_id uuid references public.scan_jobs(id) on delete set null,
  artifact_sha256 text check (artifact_sha256 is null or artifact_sha256 ~ '^[0-9a-fA-F]{64}$'),
  public_token text not null unique check (char_length(public_token) between 8 and 160),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  status text not null default 'pending' check (status in ('pending', 'ready', 'stale', 'failed', 'revoked')),
  decision text,
  verdict text,
  public_outcome text,
  trust_tier text check (trust_tier is null or trust_tier in ('verified', 'analyzed', 'attention', 'confirmed_risk', 'unanalyzed')),
  trust_label text,
  coverage_percent numeric check (coverage_percent is null or coverage_percent between 0 and 100),
  risk_score numeric check (risk_score is null or risk_score between 0 and 100),
  malware_score numeric check (malware_score is null or malware_score between 0 and 100),
  scanned_at timestamptz,
  last_error text,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id, badge_key)
);

create index team_badges_team_status_idx
  on public.team_badges(team_id, status, updated_at desc);
create index team_badges_team_extension_idx
  on public.team_badges(team_id, extension_id, updated_at desc);

alter table public.team_badges enable row level security;
create policy "members read team badges"
  on public.team_badges for select to authenticated
  using (private.is_team_member(team_id));
create policy "analysts create team badges"
  on public.team_badges for insert to authenticated
  with check (private.can_decide_for_team(team_id) and created_by = (select auth.uid()));
create policy "analysts update team badges"
  on public.team_badges for update to authenticated
  using (private.can_decide_for_team(team_id))
  with check (private.can_decide_for_team(team_id));

revoke all on public.team_badges from anon, authenticated;
grant select, insert, update on public.team_badges to authenticated;
