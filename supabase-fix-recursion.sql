drop policy if exists "Ver membros do proprio cofre" on public.household_members;
drop policy if exists "Ver meus vinculos de cofre" on public.household_members;
drop policy if exists "Inserir a si mesmo como membro" on public.household_members;
drop policy if exists "Entrar como membro" on public.household_members;

create policy "Ver meus vinculos de cofre"
on public.household_members
for select
to authenticated
using (user_id = auth.uid());

create policy "Entrar como membro"
on public.household_members
for insert
to authenticated
with check (user_id = auth.uid());

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
