-- Wave 1: 特許請求項準拠のための機能追加
-- 請求項7(整理進捗ワークフロー・ステータス履歴)
-- 請求項9(デジタル情報の手続担当者・関連書類・状態)
-- 請求項4(専門査定結果を別フィールドで保存)

-- items: 整理進捗ステータス + 専門査定結果
alter table public.items
  add column if not exists status text not null default 'photo_registered'
    check (status in (
      'photo_registered',
      'appraisal_pending',
      'appraisal_done',
      'family_confirmed',
      'policy_recorded',
      'transport_scheduled',
      'completed'
    )),
  add column if not exists professional_appraisal text;

-- digital_items: 手続担当者・関連書類・状態(請求項9)
alter table public.digital_items
  add column if not exists contact_person text,
  add column if not exists related_documents text,
  add column if not exists status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'done'));

-- item_status_history: ステータス変更履歴(変更前、変更後、変更者、日時)
create table if not exists public.item_status_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

alter table public.item_status_history enable row level security;

drop policy if exists "item_status_history_select_own" on public.item_status_history;
create policy "item_status_history_select_own"
  on public.item_status_history for select
  using (auth.uid() = user_id);

drop policy if exists "item_status_history_insert_own" on public.item_status_history;
create policy "item_status_history_insert_own"
  on public.item_status_history for insert
  with check (auth.uid() = user_id);

grant select, insert on public.item_status_history to authenticated;

create index if not exists item_status_history_item_id_idx
  on public.item_status_history(item_id);
