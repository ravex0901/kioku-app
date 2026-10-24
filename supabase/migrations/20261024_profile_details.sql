-- アカウント設定(アカウントネーム・性別・住所・電話番号・連絡用メール)。
-- 住所・電話番号などは家族にも見せない本人専用の情報なので、profilesとは別テーブルにして
-- RLSは「本人のみ」にする。名前(profiles.name)と生年月日(profiles.birth_date)は既存を使う。
create table if not exists public.profile_details (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_name text,
  gender text check (gender in ('male','female','other','no_answer')),
  address text,
  phone text,
  contact_email text,
  updated_at timestamptz not null default now()
);

create unique index if not exists profile_details_account_name_key
  on public.profile_details (lower(account_name)) where account_name is not null;

alter table public.profile_details enable row level security;

create policy profile_details_select_own on public.profile_details
  for select using (auth.uid() = user_id);
create policy profile_details_insert_own on public.profile_details
  for insert with check (auth.uid() = user_id);
create policy profile_details_update_own on public.profile_details
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
