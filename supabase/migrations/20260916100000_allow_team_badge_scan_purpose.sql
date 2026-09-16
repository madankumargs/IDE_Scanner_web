-- Team Badge Studio uses the existing scan lifecycle with an explicit purpose
-- so badge scans can be identified without creating a parallel job system.
-- The purpose is intentionally excluded from public-monitoring triggers by
-- their existing allow-lists; it remains available to the badge owner and
-- the immutable report pipeline.
alter table public.scan_jobs
  drop constraint if exists scan_jobs_purpose_check;

alter table public.scan_jobs
  add constraint scan_jobs_purpose_check
  check (scan_purpose in ('public_intelligence', 'user_request', 'benchmark', 'development', 'team_badge'));

alter table public.scans
  drop constraint if exists scans_purpose_check;

alter table public.scans
  add constraint scans_purpose_check
  check (scan_purpose in ('public_intelligence', 'user_request', 'benchmark', 'development', 'team_badge'));
