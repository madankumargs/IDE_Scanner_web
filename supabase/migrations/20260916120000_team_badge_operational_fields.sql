alter table public.team_badges
  add column if not exists capability_assessment jsonb;
