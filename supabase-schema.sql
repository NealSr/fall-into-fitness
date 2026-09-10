create extension if not exists pgcrypto;

-- Run this file once. The ALTER statements make it safe to run after the previous schema.
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  first_name text not null check (char_length(first_name) between 1 and 60),
  last_name text not null check (char_length(last_name) between 1 and 60),
  start_weight numeric(6, 1) not null check (start_weight > 0 and start_weight < 1000),
  created_at timestamptz not null default now()
);

alter table public.participants alter column user_id drop not null;
alter table public.participants drop constraint if exists participants_user_id_key;

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  weight numeric(6, 1) not null check (weight > 0 and weight < 1000),
  time_of_day text not null check (time_of_day in ('Morning', 'Midday', 'Evening')),
  checked_in_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_challenge_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admin_users where user_id = (select auth.uid())); $$;

alter table public.participants enable row level security;
alter table public.checkins enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "participants are readable by their owner" on public.participants;
drop policy if exists "users can join for themselves" on public.participants;
drop policy if exists "users can update their own participant" on public.participants;
drop policy if exists "owners can read their checkins" on public.checkins;
drop policy if exists "owners can add their checkins" on public.checkins;
drop policy if exists "admins can manage participants" on public.participants;
drop policy if exists "admins can manage checkins" on public.checkins;

create policy "admins can manage participants" on public.participants for all to authenticated
  using (public.is_challenge_admin()) with check (public.is_challenge_admin());
create policy "admins can manage checkins" on public.checkins for all to authenticated
  using (public.is_challenge_admin()) with check (public.is_challenge_admin());

create or replace view public.challenge_leaderboard as
with latest as (
  select distinct on (participant_id) participant_id, checked_in_on, time_of_day
  from public.checkins order by participant_id, checked_in_on desc, created_at desc
), current_weights as (
  select distinct on (participant_id) participant_id, weight
  from public.checkins order by participant_id, checked_in_on desc, created_at desc
)
select p.id as participant_id, p.first_name, p.last_name,
  round(((p.start_weight - cw.weight) / p.start_weight) * 100, 1) as percentage_lost,
  l.checked_in_on as latest_checkin, l.time_of_day as latest_time_of_day
from public.participants p
join current_weights cw on cw.participant_id = p.id
join latest l on l.participant_id = p.id
where public.is_challenge_admin();

revoke all on table public.participants from anon, authenticated;
revoke all on table public.checkins from anon, authenticated;
revoke all on table public.admin_users from anon, authenticated;
revoke all on public.challenge_leaderboard from anon, authenticated;
grant select, insert, update, delete on table public.participants to authenticated;
grant select, insert, update, delete on table public.checkins to authenticated;
grant select on public.challenge_leaderboard to authenticated;

-- After creating the one admin account in Supabase Auth, run this once:
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'admin@example.com'
-- on conflict (user_id) do nothing;
