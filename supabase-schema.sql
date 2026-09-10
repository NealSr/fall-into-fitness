create extension if not exists pgcrypto;

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 60),
  last_name text not null check (char_length(last_name) between 1 and 60),
  start_weight numeric(6, 1) not null check (start_weight > 0 and start_weight < 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  weight numeric(6, 1) not null check (weight > 0 and weight < 1000),
  time_of_day text not null check (time_of_day in ('Morning', 'Midday', 'Evening')),
  checked_in_on date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.participants enable row level security;
alter table public.checkins enable row level security;

create policy "participants are readable by their owner"
  on public.participants for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users can join for themselves"
  on public.participants for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users can update their own participant"
  on public.participants for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "owners can read their checkins"
  on public.checkins for select to authenticated
  using (exists (
    select 1 from public.participants
    where participants.id = checkins.participant_id
      and participants.user_id = (select auth.uid())
  ));

create policy "owners can add their checkins"
  on public.checkins for insert to authenticated
  with check (exists (
    select 1 from public.participants
    where participants.id = checkins.participant_id
      and participants.user_id = (select auth.uid())
  ));

create or replace view public.challenge_leaderboard as
with latest as (
  select distinct on (participant_id)
    participant_id, checked_in_on, time_of_day
  from public.checkins
  order by participant_id, checked_in_on desc, created_at desc
), current_weights as (
  select distinct on (participant_id)
    participant_id, weight
  from public.checkins
  order by participant_id, checked_in_on desc, created_at desc
)
select
  p.id as participant_id,
  p.first_name,
  p.last_name,
  round(((p.start_weight - cw.weight) / p.start_weight) * 100, 1) as percentage_lost,
  l.checked_in_on as latest_checkin,
  l.time_of_day as latest_time_of_day
from public.participants p
join current_weights cw on cw.participant_id = p.id
join latest l on l.participant_id = p.id;

revoke all on table public.participants from anon, authenticated;
revoke all on table public.checkins from anon, authenticated;
grant select on public.challenge_leaderboard to anon, authenticated;
