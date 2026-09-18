-- Every new Supabase-backed public release must carry the same immutable
-- accuracy-gate attestation used by the Cloudflare/D1 publication path.
-- Existing releases remain readable for compatibility; the activation RPC
-- below refuses to create or promote a new release without these fields.
alter table public.scan_publication_releases
  add column if not exists accuracy_gate_corpus_id text,
  add column if not exists accuracy_gate_corpus_version text,
  add column if not exists accuracy_gate_sha256 text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.scan_publication_releases'::regclass
      and conname = 'scan_publication_releases_accuracy_gate_sha256_check'
  ) then
    alter table public.scan_publication_releases
      add constraint scan_publication_releases_accuracy_gate_sha256_check
      check (accuracy_gate_sha256 is null or accuracy_gate_sha256 ~ '^[0-9a-f]{64}$');
  end if;
end
$$;

drop function if exists public.activate_scan_publication_release(
  text, text, text, text, integer, uuid[]
);

create function public.activate_scan_publication_release(
  p_policy_version text,
  p_ruleset_version text,
  p_score_schema_version text,
  p_scanner_build text,
  p_expected_reports integer,
  p_scan_ids uuid[],
  p_accuracy_gate_corpus_id text,
  p_accuracy_gate_corpus_version text,
  p_accuracy_gate_sha256 text
)
returns public.scan_publication_releases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release public.scan_publication_releases;
  v_report_count integer;
  v_artifact_count integer;
begin
  perform set_config('statement_timeout', '10s', true);
  if coalesce(p_policy_version, '') in ('', 'legacy')
    or coalesce(p_ruleset_version, '') in ('', 'unknown')
    or coalesce(p_score_schema_version, '') = ''
    or coalesce(p_scanner_build, '') !~ '^[0-9a-f]{40}$'
    or p_expected_reports <= 0
    or p_scan_ids is null
    or cardinality(p_scan_ids) <> p_expected_reports
    or (
      select count(distinct scan_id)
      from unnest(p_scan_ids) as supplied(scan_id)
    ) <> p_expected_reports
    or coalesce(p_accuracy_gate_corpus_id, '') = ''
    or coalesce(p_accuracy_gate_corpus_version, '') = ''
    or coalesce(p_accuracy_gate_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid scan publication release or accuracy gate identity';
  end if;

  lock table public.scan_publication_releases in share row exclusive mode;

  select
    count(*)::integer,
    count(distinct (lower(scan.extension_id), scan.version))::integer
  into v_report_count, v_artifact_count
  from public.scans scan
  where scan.id = any(p_scan_ids)
    and scan.scan_purpose in ('public_intelligence', 'benchmark')
    and scan.analysis_status = 'complete'
    and scan.policy_version = p_policy_version
    and scan.ruleset_version = p_ruleset_version
    and scan.score_schema_version = p_score_schema_version
    and scan.scanner_build = p_scanner_build
    and scan.superseded_at is null;

  if v_report_count <> p_expected_reports
    or v_artifact_count <> p_expected_reports then
    raise exception
      'Classification release manifest has % valid reports across % exact artifacts; % required',
      v_report_count, v_artifact_count, p_expected_reports;
  end if;

  update public.scan_publication_releases
  set active = false
  where active;

  insert into public.scan_publication_releases (
    policy_version,
    ruleset_version,
    score_schema_version,
    scanner_build,
    accuracy_gate_corpus_id,
    accuracy_gate_corpus_version,
    accuracy_gate_sha256,
    expected_reports,
    report_count_at_activation,
    active,
    activated_at
  )
  values (
    p_policy_version,
    p_ruleset_version,
    p_score_schema_version,
    p_scanner_build,
    p_accuracy_gate_corpus_id,
    p_accuracy_gate_corpus_version,
    p_accuracy_gate_sha256,
    p_expected_reports,
    p_expected_reports,
    true,
    now()
  )
  on conflict (policy_version, ruleset_version, score_schema_version, scanner_build)
  do update set
    accuracy_gate_corpus_id = excluded.accuracy_gate_corpus_id,
    accuracy_gate_corpus_version = excluded.accuracy_gate_corpus_version,
    accuracy_gate_sha256 = excluded.accuracy_gate_sha256,
    expected_reports = excluded.expected_reports,
    report_count_at_activation = excluded.report_count_at_activation,
    active = true,
    activated_at = excluded.activated_at
  returning * into v_release;

  delete from public.scan_publication_release_scans
  where release_id = v_release.id;

  insert into public.scan_publication_release_scans (
    release_id, scan_id, extension_id, version, artifact_sha256
  )
  select
    v_release.id,
    scan.id,
    scan.extension_id,
    scan.version,
    scan.artifact_sha256
  from public.scans scan
  where scan.id = any(p_scan_ids);

  return v_release;
end;
$$;

revoke all on function public.activate_scan_publication_release(
  text, text, text, text, integer, uuid[], text, text, text
) from public, anon, authenticated;
grant execute on function public.activate_scan_publication_release(
  text, text, text, text, integer, uuid[], text, text, text
) to service_role;

comment on column public.scan_publication_releases.accuracy_gate_sha256 is
  'SHA-256 of the immutable combined regression and fresh exact-artifact holdout gate required for new releases.';
