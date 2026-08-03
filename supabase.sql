-- ═══════════════════════════════════════════════════════════════
-- WINLIST interest list — Supabase schema
-- Run once in Supabase → SQL Editor → New query → Run.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.interest_signups (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  role        text        not null check (role in ('builder','mentor')),
  full_name   text        not null,
  email       text        not null,
  phone       text        not null,
  city        text        not null,

  field       text        not null,
  focus       text        not null,
  link        text,
  goals       text[]      not null default '{}',
  referral    text,
  notes       text,
  consent     boolean     not null default false,

  source      text,
  user_agent  text
);

-- One row per person. Lets a resubmit update the same row instead of
-- creating a duplicate (the API uses on_conflict=email).
create unique index if not exists interest_signups_email_key
  on public.interest_signups (email);

-- Handy for "who signed up today" and for opening cities by density.
create index if not exists interest_signups_created_idx
  on public.interest_signups (created_at desc);
create index if not exists interest_signups_city_idx
  on public.interest_signups (lower(city));

-- Keep updated_at honest so the API can tell a new signup from an edit.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists interest_signups_touch on public.interest_signups;
create trigger interest_signups_touch
  before update on public.interest_signups
  for each row execute function public.touch_updated_at();

-- ── Lock it down ──────────────────────────────────────────────
-- RLS on with NO policies means: the public anon key can neither read nor
-- write this table. Only the service_role key (server-side, in /api/join)
-- and you in the Supabase dashboard can touch it.
alter table public.interest_signups enable row level security;

-- ── Useful views for the dashboard ────────────────────────────
create or replace view public.signups_by_city as
  select city,
         count(*)                                      as total,
         count(*) filter (where role = 'builder')      as builders,
         count(*) filter (where role = 'mentor')       as mentors,
         max(created_at)                               as latest
  from public.interest_signups
  group by city
  order by total desc;
