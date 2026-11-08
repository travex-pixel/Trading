-- EdgeLab optional persistence schema for Supabase (PostgreSQL).
--
-- NOT wired in version one. The application stores everything in the browser
-- behind a Repository interface (src/lib/store/types.ts). This schema is the
-- target for the Supabase implementation of that interface once authentication
-- exists. Every table is owned by a user and protected by row-level security so
-- that a public anon key can never read another user's data.

create extension if not exists "pgcrypto";

create table if not exists public.experiments (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  lineage_id text not null,
  version integer not null check (version >= 1),
  name text not null,
  hypothesis text not null default '',
  config jsonb not null,                 -- validated StrategyConfig
  dataset jsonb not null,                -- { provider, version, label, isSynthetic }
  period jsonb not null,                 -- { start, end, bars }
  timeframe text not null check (timeframe in ('1h','4h','1d')),
  assets text[] not null,
  result jsonb not null,                 -- ExperimentResultSummary
  findings text not null default '',
  weaknesses text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists experiments_user_created on public.experiments (user_id, created_at desc);
create index if not exists experiments_lineage on public.experiments (user_id, lineage_id, version);

create table if not exists public.paper_portfolios (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  config jsonb not null,
  started_at bigint not null,
  clock bigint not null,
  status text not null check (status in ('running','stopped')),
  stopped_at bigint,
  data_version text not null,
  created_at timestamptz not null default now()
);
create index if not exists paper_portfolios_user on public.paper_portfolios (user_id, created_at desc);

create table if not exists public.competitions (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  rules jsonb not null,
  participants jsonb not null,           -- CompetitionParticipant[]
  status text not null check (status in ('open','completed')),
  created_at timestamptz not null default now()
);
create index if not exists competitions_user on public.competitions (user_id, created_at desc);

alter table public.experiments enable row level security;
alter table public.paper_portfolios enable row level security;
alter table public.competitions enable row level security;

create policy "own experiments" on public.experiments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own portfolios" on public.paper_portfolios
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own competitions" on public.competitions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Market candles are deliberately NOT persisted here: demo data is regenerated
-- deterministically and live data is cached in memory with a short TTL.
