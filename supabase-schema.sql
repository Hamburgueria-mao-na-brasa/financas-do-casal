create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Finanças do Casal',
  invite_code text not null unique,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.household_states (
  household_id uuid primary key references public.households(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_states enable row level security;

drop policy if exists "Criar cofre autenticado" on public.households;
create policy "Criar cofre autenticado"
on public.households
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "Ver cofres por membro" on public.households;
create policy "Ver cofres por membro"
on public.households
for select
to authenticated
using (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = households.id
      and hm.user_id = auth.uid()
  )
);

drop policy if exists "Ver membros do proprio cofre" on public.household_members;
create policy "Ver membros do proprio cofre"
on public.household_members
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.household_members hm
    where hm.household_id = household_members.household_id
      and hm.user_id = auth.uid()
  )
);

drop policy if exists "Inserir a si mesmo como membro" on public.household_members;
create policy "Inserir a si mesmo como membro"
on public.household_members
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Ver dados do proprio cofre" on public.household_states;
create policy "Ver dados do proprio cofre"
on public.household_states
for select
to authenticated
using (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = household_states.household_id
      and hm.user_id = auth.uid()
  )
);

drop policy if exists "Criar dados do proprio cofre" on public.household_states;
create policy "Criar dados do proprio cofre"
on public.household_states
for insert
to authenticated
with check (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = household_states.household_id
      and hm.user_id = auth.uid()
  )
);

drop policy if exists "Atualizar dados do proprio cofre" on public.household_states;
create policy "Atualizar dados do proprio cofre"
on public.household_states
for update
to authenticated
using (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = household_states.household_id
      and hm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.household_members hm
    where hm.household_id = household_states.household_id
      and hm.user_id = auth.uid()
  )
);

create or replace function public.join_household_by_code(join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  select id into target_id
  from public.households
  where invite_code = upper(trim(join_code));

  if target_id is null then
    raise exception 'Código do cofre não encontrado';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (target_id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;

  return target_id;
end;
$$;

grant execute on function public.join_household_by_code(text) to authenticated;

create or replace function public.rotate_household_invite(new_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  normalized_code text;
begin
  normalized_code := upper(trim(new_code));

  select hm.household_id into target_id
  from public.household_members hm
  where hm.user_id = auth.uid()
  order by case when hm.role = 'owner' then 0 else 1 end, hm.created_at
  limit 1;

  if target_id is null then
    raise exception 'Nenhum cofre encontrado para este usuario';
  end if;

  update public.households
  set invite_code = normalized_code
  where id = target_id;

  return normalized_code;
end;
$$;

grant execute on function public.rotate_household_invite(text) to authenticated;

create or replace function public.list_household_members()
returns table(user_id uuid, role text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select hm.user_id, hm.role, hm.created_at
  from public.household_members hm
  where hm.household_id = (
    select own.household_id
    from public.household_members own
    where own.user_id = auth.uid()
    order by case when own.role = 'owner' then 0 else 1 end, own.created_at
    limit 1
  )
  order by case when hm.role = 'owner' then 0 else 1 end, hm.created_at;
$$;

grant execute on function public.list_household_members() to authenticated;

create or replace function public.remove_household_member(member_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  select hm.household_id into target_id
  from public.household_members hm
  where hm.user_id = auth.uid()
    and hm.role = 'owner'
  limit 1;

  if target_id is null then
    raise exception 'Apenas o dono do cofre pode remover membros';
  end if;

  delete from public.household_members hm
  where hm.household_id = target_id
    and hm.user_id = member_user_id
    and hm.role <> 'owner';
end;
$$;

grant execute on function public.remove_household_member(uuid) to authenticated;
