create extension if not exists pgcrypto;

create table if not exists public.duofin_v2_households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'DuoFin',
  invite_code text not null unique,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.duofin_v2_members (
  household_id uuid not null references public.duofin_v2_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.duofin_v2_states (
  household_id uuid primary key references public.duofin_v2_households(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.duofin_v2_households enable row level security;
alter table public.duofin_v2_members enable row level security;
alter table public.duofin_v2_states enable row level security;

create or replace function public.duofin_v2_is_member(target_household uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.duofin_v2_members m
    where m.household_id = target_household
      and m.user_id = auth.uid()
  );
$$;

drop policy if exists "duofin_v2_households_insert" on public.duofin_v2_households;
create policy "duofin_v2_households_insert"
on public.duofin_v2_households
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "duofin_v2_households_select" on public.duofin_v2_households;
create policy "duofin_v2_households_select"
on public.duofin_v2_households
for select
to authenticated
using (public.duofin_v2_is_member(id) or created_by = auth.uid());

drop policy if exists "duofin_v2_households_update" on public.duofin_v2_households;
create policy "duofin_v2_households_update"
on public.duofin_v2_households
for update
to authenticated
using (public.duofin_v2_is_member(id) or created_by = auth.uid())
with check (public.duofin_v2_is_member(id) or created_by = auth.uid());

drop policy if exists "duofin_v2_members_select" on public.duofin_v2_members;
create policy "duofin_v2_members_select"
on public.duofin_v2_members
for select
to authenticated
using (user_id = auth.uid() or public.duofin_v2_is_member(household_id));

drop policy if exists "duofin_v2_members_insert_self" on public.duofin_v2_members;
create policy "duofin_v2_members_insert_self"
on public.duofin_v2_members
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "duofin_v2_states_select" on public.duofin_v2_states;
create policy "duofin_v2_states_select"
on public.duofin_v2_states
for select
to authenticated
using (public.duofin_v2_is_member(household_id));

drop policy if exists "duofin_v2_states_insert" on public.duofin_v2_states;
create policy "duofin_v2_states_insert"
on public.duofin_v2_states
for insert
to authenticated
with check (public.duofin_v2_is_member(household_id));

drop policy if exists "duofin_v2_states_update" on public.duofin_v2_states;
create policy "duofin_v2_states_update"
on public.duofin_v2_states
for update
to authenticated
using (public.duofin_v2_is_member(household_id))
with check (public.duofin_v2_is_member(household_id));

create or replace function public.duofin_v2_join_by_code(join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  select id into target_id
  from public.duofin_v2_households
  where invite_code = upper(trim(join_code));

  if target_id is null then
    raise exception 'Codigo nao encontrado';
  end if;

  insert into public.duofin_v2_members (household_id, user_id, role)
  values (target_id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;

  return target_id;
end;
$$;

grant execute on function public.duofin_v2_join_by_code(text) to authenticated;
