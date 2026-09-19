-- 「ご依頼」「家族と共有」機能用テーブル
-- Supabase の SQL Editor で1回だけ実行してください。

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_type text not null default 'all_in_one',
  note text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists service_requests_user_id_idx on public.service_requests(user_id);

grant select, insert, update, delete on public.service_requests to authenticated;

alter table public.service_requests enable row level security;

drop policy if exists "service_requests_select_own" on public.service_requests;
create policy "service_requests_select_own"
  on public.service_requests for select
  using (auth.uid() = user_id);

drop policy if exists "service_requests_insert_own" on public.service_requests;
create policy "service_requests_insert_own"
  on public.service_requests for insert
  with check (auth.uid() = user_id);

drop policy if exists "service_requests_update_own" on public.service_requests;
create policy "service_requests_update_own"
  on public.service_requests for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "service_requests_delete_own" on public.service_requests;
create policy "service_requests_delete_own"
  on public.service_requests for delete
  using (auth.uid() = user_id);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relation text not null default 'other',
  created_at timestamptz not null default now()
);

create index if not exists family_members_user_id_idx on public.family_members(user_id);

grant select, insert, update, delete on public.family_members to authenticated;

alter table public.family_members enable row level security;

drop policy if exists "family_members_select_own" on public.family_members;
create policy "family_members_select_own"
  on public.family_members for select
  using (auth.uid() = user_id);

drop policy if exists "family_members_insert_own" on public.family_members;
create policy "family_members_insert_own"
  on public.family_members for insert
  with check (auth.uid() = user_id);

drop policy if exists "family_members_update_own" on public.family_members;
create policy "family_members_update_own"
  on public.family_members for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "family_members_delete_own" on public.family_members;
create policy "family_members_delete_own"
  on public.family_members for delete
  using (auth.uid() = user_id);

