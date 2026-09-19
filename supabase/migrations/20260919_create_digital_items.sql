-- 「契約・情報のしおり」(デジタル情報)機能用テーブル
-- Supabase の SQL Editor で1回だけ実行してください。
-- (このリポジトリには自動マイグレーション実行の仕組みがないため、手動での実行が必要です)

create table if not exists public.digital_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null default 'other',
  title text not null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists digital_items_user_id_idx on public.digital_items(user_id);

alter table public.digital_items enable row level security;

drop policy if exists "digital_items_select_own" on public.digital_items;
create policy "digital_items_select_own"
  on public.digital_items for select
  using (auth.uid() = user_id);

drop policy if exists "digital_items_insert_own" on public.digital_items;
create policy "digital_items_insert_own"
  on public.digital_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "digital_items_update_own" on public.digital_items;
create policy "digital_items_update_own"
  on public.digital_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "digital_items_delete_own" on public.digital_items;
create policy "digital_items_delete_own"
  on public.digital_items for delete
  using (auth.uid() = user_id);

-- updated_at を自動更新
create or replace function public.set_digital_items_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists digital_items_set_updated_at on public.digital_items;
create trigger digital_items_set_updated_at
  before update on public.digital_items
  for each row
  execute function public.set_digital_items_updated_at();

