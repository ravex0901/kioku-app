-- 家系図:明示的な親族関係(離婚・再婚・「どの配偶者との子か」・養子・継子)
--
-- family_members の「続柄」だけでは表せない関係を、本人が自分で登録するためのテーブル。
-- 例:
--   - 前の妻とは離婚、今の妻とは婚姻中(marriage / marriage_status)
--   - 息子の母は前の妻(parent_child:前の妻 → 息子)
--   - 配偶者の連れ子(parent_child / parent_kind = 'step')
--
-- 人物の指し方(a・b それぞれ、どちらか1つだけ):
--   *_account_id … アプリのアカウントを持っている人(本人・つながった家族)
--   *_member_id  … 本人が登録した家族で、アカウントをまだ持っていない人(family_members.id)
-- parent_child のときは a が親、b が子。
--
-- 見える範囲:登録した本人だけ(離婚歴などはセンシティブなため)。
-- 既存のテーブル・データには一切触れない(追加のみ)。

create table if not exists public.family_relationships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('parent_child', 'marriage')),

  a_account_id uuid references auth.users (id) on delete cascade,
  a_member_id uuid references public.family_members (id) on delete cascade,
  b_account_id uuid references auth.users (id) on delete cascade,
  b_member_id uuid references public.family_members (id) on delete cascade,

  parent_kind text check (
    parent_kind in ('biological', 'legal', 'adoptive', 'special_adoptive', 'step')
  ),
  marriage_status text check (
    marriage_status in ('married', 'divorced', 'widowed', 'common_law')
  ),
  -- 同じ人の結婚の順番(1 = 最初の結婚)。分からなければ空でよい。
  marriage_order smallint check (marriage_order between 1 and 20),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- a・b はそれぞれ、アカウントか登録済みの家族のどちらか1つだけ
  constraint family_relationships_a_one check (num_nonnulls(a_account_id, a_member_id) = 1),
  constraint family_relationships_b_one check (num_nonnulls(b_account_id, b_member_id) = 1),
  -- 種類ごとに必要な項目
  constraint family_relationships_kind_fields check (
    (type = 'parent_child' and parent_kind is not null and marriage_status is null and marriage_order is null)
    or (type = 'marriage' and marriage_status is not null and parent_kind is null)
  ),
  -- 自分自身との関係は登録できない
  constraint family_relationships_not_self check (
    a_account_id is distinct from b_account_id or a_account_id is null
  ),
  constraint family_relationships_not_self_member check (
    a_member_id is distinct from b_member_id or a_member_id is null
  )
);

-- 外部キー・RLS で使う列の索引
create index if not exists family_relationships_owner_id_idx on public.family_relationships (owner_id);
create index if not exists family_relationships_a_account_id_idx on public.family_relationships (a_account_id);
create index if not exists family_relationships_a_member_id_idx on public.family_relationships (a_member_id);
create index if not exists family_relationships_b_account_id_idx on public.family_relationships (b_account_id);
create index if not exists family_relationships_b_member_id_idx on public.family_relationships (b_member_id);

-- 更新日時
create or replace function public.family_relationships_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists family_relationships_touch_updated_at on public.family_relationships;
create trigger family_relationships_touch_updated_at
  before update on public.family_relationships
  for each row execute function public.family_relationships_touch_updated_at();

-- RLS:登録した本人だけが読み書きできる。
-- 家族(member)を指すときは、本人が登録した家族に限る。
alter table public.family_relationships enable row level security;

drop policy if exists family_relationships_select_own on public.family_relationships;
create policy family_relationships_select_own on public.family_relationships
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists family_relationships_insert_own on public.family_relationships;
create policy family_relationships_insert_own on public.family_relationships
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and (a_member_id is null or exists (
      select 1 from public.family_members m
      where m.id = a_member_id and m.user_id = (select auth.uid())
    ))
    and (b_member_id is null or exists (
      select 1 from public.family_members m
      where m.id = b_member_id and m.user_id = (select auth.uid())
    ))
  );

drop policy if exists family_relationships_update_own on public.family_relationships;
create policy family_relationships_update_own on public.family_relationships
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and (a_member_id is null or exists (
      select 1 from public.family_members m
      where m.id = a_member_id and m.user_id = (select auth.uid())
    ))
    and (b_member_id is null or exists (
      select 1 from public.family_members m
      where m.id = b_member_id and m.user_id = (select auth.uid())
    ))
  );

drop policy if exists family_relationships_delete_own on public.family_relationships;
create policy family_relationships_delete_own on public.family_relationships
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- このプロジェクトは新しいテーブルに自動で権限を付けないため、明示的に付ける(行の制限は上の RLS)。
grant select, insert, update, delete on public.family_relationships to authenticated;
grant select, insert, update, delete on public.family_relationships to service_role;
