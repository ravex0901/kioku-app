-- 新機能まとめて追加分
-- (1) やりたいことリスト (2) 医療情報 (3) アルバム (4) 今日の調子 (5) 家族ボイスメッセージ
-- (6) 家族への機能別共有制限(handover_recipientsの拡張)
-- Supabase の SQL Editor で1回だけ実行してください。

-- ============================================================
-- 1. やりたいことリスト(チェックボックス式)
-- ============================================================
create table if not exists public.bucket_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bucket_list_items_user_id_idx on public.bucket_list_items(user_id);

grant select, insert, update, delete on public.bucket_list_items to authenticated;

alter table public.bucket_list_items enable row level security;

drop policy if exists "bucket_list_items_select_own" on public.bucket_list_items;
create policy "bucket_list_items_select_own"
  on public.bucket_list_items for select
  using (auth.uid() = user_id);

drop policy if exists "bucket_list_items_insert_own" on public.bucket_list_items;
create policy "bucket_list_items_insert_own"
  on public.bucket_list_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "bucket_list_items_update_own" on public.bucket_list_items;
create policy "bucket_list_items_update_own"
  on public.bucket_list_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "bucket_list_items_delete_own" on public.bucket_list_items;
create policy "bucket_list_items_delete_own"
  on public.bucket_list_items for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 2. 医療情報(かかりつけ医・持病・服薬) ユーザーにつき1件
-- ============================================================
create table if not exists public.medical_info (
  user_id uuid primary key references auth.users(id) on delete cascade,
  doctor_name text,
  hospital_name text,
  doctor_phone text,
  conditions text,
  medications text,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.medical_info to authenticated;

alter table public.medical_info enable row level security;

drop policy if exists "medical_info_select_own" on public.medical_info;
create policy "medical_info_select_own"
  on public.medical_info for select
  using (auth.uid() = user_id);

drop policy if exists "medical_info_insert_own" on public.medical_info;
create policy "medical_info_insert_own"
  on public.medical_info for insert
  with check (auth.uid() = user_id);

drop policy if exists "medical_info_update_own" on public.medical_info;
create policy "medical_info_update_own"
  on public.medical_info for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "medical_info_delete_own" on public.medical_info;
create policy "medical_info_delete_own"
  on public.medical_info for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 3. アルバム(スマホの写真を複数保存)
-- ============================================================
create table if not exists public.album_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  caption text,
  -- 「もしもの時」共有ページ(家族向け)で、都度署名を発行せず長期間表示できるようにする
  -- 長期有効(10年)の署名付きURL。will動画のvideo_urlと同じ考え方。
  long_lived_url text,
  created_at timestamptz not null default now()
);

create index if not exists album_photos_user_id_idx on public.album_photos(user_id);

grant select, insert, update, delete on public.album_photos to authenticated;

alter table public.album_photos enable row level security;

drop policy if exists "album_photos_select_own" on public.album_photos;
create policy "album_photos_select_own"
  on public.album_photos for select
  using (auth.uid() = user_id);

drop policy if exists "album_photos_insert_own" on public.album_photos;
create policy "album_photos_insert_own"
  on public.album_photos for insert
  with check (auth.uid() = user_id);

drop policy if exists "album_photos_update_own" on public.album_photos;
create policy "album_photos_update_own"
  on public.album_photos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "album_photos_delete_own" on public.album_photos;
create policy "album_photos_delete_own"
  on public.album_photos for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('album-photos', 'album-photos', false)
on conflict (id) do nothing;

drop policy if exists "album_photos_storage_select_own" on storage.objects;
create policy "album_photos_storage_select_own"
  on storage.objects for select
  using (bucket_id = 'album-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "album_photos_storage_insert_own" on storage.objects;
create policy "album_photos_storage_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'album-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "album_photos_storage_update_own" on storage.objects;
create policy "album_photos_storage_update_own"
  on storage.objects for update
  using (bucket_id = 'album-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "album_photos_storage_delete_own" on storage.objects;
create policy "album_photos_storage_delete_own"
  on storage.objects for delete
  using (bucket_id = 'album-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 4. 今日の調子(にこちゃんマーク、1日1回)
-- ============================================================
create table if not exists public.daily_mood_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  mood text not null check (mood in ('good', 'normal', 'bad')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, log_date)
);

grant select, insert, update, delete on public.daily_mood_logs to authenticated;

alter table public.daily_mood_logs enable row level security;

drop policy if exists "daily_mood_logs_select_own" on public.daily_mood_logs;
create policy "daily_mood_logs_select_own"
  on public.daily_mood_logs for select
  using (auth.uid() = user_id);

drop policy if exists "daily_mood_logs_insert_own" on public.daily_mood_logs;
create policy "daily_mood_logs_insert_own"
  on public.daily_mood_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "daily_mood_logs_update_own" on public.daily_mood_logs;
create policy "daily_mood_logs_update_own"
  on public.daily_mood_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "daily_mood_logs_delete_own" on public.daily_mood_logs;
create policy "daily_mood_logs_delete_own"
  on public.daily_mood_logs for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 5. 家族ボイスメッセージ(お昼・夕方・夜のアラーム形式)
-- 現時点では家族が録音した本人の声をそのまま再生する(AIクローンではない)。
-- ELEVENLABS_API_KEY 設定後は、この録音をもとに声をクローンし、
-- 毎回違うメッセージを同じ声で読み上げる拡張が可能(voice_profilesと同じ仕組みを流用)。
-- ============================================================
create table if not exists public.voice_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_member_id uuid references public.family_members(id) on delete set null,
  speaker_name text not null,
  time_slot text not null check (time_slot in ('lunch', 'evening', 'night')),
  message_text text,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, time_slot)
);

create index if not exists voice_checkins_user_id_idx on public.voice_checkins(user_id);

grant select, insert, update, delete on public.voice_checkins to authenticated;

alter table public.voice_checkins enable row level security;

drop policy if exists "voice_checkins_select_own" on public.voice_checkins;
create policy "voice_checkins_select_own"
  on public.voice_checkins for select
  using (auth.uid() = user_id);

drop policy if exists "voice_checkins_insert_own" on public.voice_checkins;
create policy "voice_checkins_insert_own"
  on public.voice_checkins for insert
  with check (auth.uid() = user_id);

drop policy if exists "voice_checkins_update_own" on public.voice_checkins;
create policy "voice_checkins_update_own"
  on public.voice_checkins for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "voice_checkins_delete_own" on public.voice_checkins;
create policy "voice_checkins_delete_own"
  on public.voice_checkins for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('voice-checkins', 'voice-checkins', false)
on conflict (id) do nothing;

drop policy if exists "voice_checkins_storage_select_own" on storage.objects;
create policy "voice_checkins_storage_select_own"
  on storage.objects for select
  using (bucket_id = 'voice-checkins' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "voice_checkins_storage_insert_own" on storage.objects;
create policy "voice_checkins_storage_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'voice-checkins' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "voice_checkins_storage_update_own" on storage.objects;
create policy "voice_checkins_storage_update_own"
  on storage.objects for update
  using (bucket_id = 'voice-checkins' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "voice_checkins_storage_delete_own" on storage.objects;
create policy "voice_checkins_storage_delete_own"
  on storage.objects for delete
  using (bucket_id = 'voice-checkins' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 6. 家族への機能別共有制限(共有相手ごとに、どの情報を見せるか)
-- ============================================================
alter table public.handover_recipients
  add column if not exists share_items boolean not null default true,
  add column if not exists share_digital_items boolean not null default true,
  add column if not exists share_checklist boolean not null default true,
  add column if not exists share_bucket_list boolean not null default true,
  add column if not exists share_medical boolean not null default true,
  add column if not exists share_album boolean not null default true,
  add column if not exists share_mood boolean not null default true;

-- get_handover_status を再定義し、共有相手ごとのON/OFF設定と新しい情報区分を反映する。
create or replace function public.get_handover_status(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
  v_has_recipient boolean := false;
  v_settings record;
  v_owner_user_id uuid;
  v_recipient_name text;
  v_last_active timestamptz;
  v_inactive_days numeric;
  v_condition_met boolean;
  v_requires_approval boolean;
  v_unlocked boolean;
  v_result jsonb;
  v_will jsonb;
  v_share_items boolean := true;
  v_share_digital boolean := true;
  v_share_checklist boolean := true;
  v_share_bucket_list boolean := true;
  v_share_medical boolean := true;
  v_share_album boolean := true;
  v_share_mood boolean := true;
begin
  select * into v_recipient from public.handover_recipients where share_token = p_token;
  if found then
    v_has_recipient := true;
    v_owner_user_id := v_recipient.user_id;
    v_recipient_name := v_recipient.name;
    v_share_items := v_recipient.share_items;
    v_share_digital := v_recipient.share_digital_items;
    v_share_checklist := v_recipient.share_checklist;
    v_share_bucket_list := v_recipient.share_bucket_list;
    v_share_medical := v_recipient.share_medical;
    v_share_album := v_recipient.share_album;
    v_share_mood := v_recipient.share_mood;
  else
    select * into v_settings from public.handover_settings where share_token = p_token;
    if not found then
      return jsonb_build_object('found', false);
    end if;
    v_owner_user_id := v_settings.user_id;
    v_recipient_name := null;
  end if;

  select * into v_settings from public.handover_settings where user_id = v_owner_user_id;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  select last_active_at into v_last_active from public.profiles where id = v_owner_user_id;
  v_inactive_days := extract(epoch from (now() - coalesce(v_last_active, v_settings.updated_at))) / 86400;
  v_condition_met := v_inactive_days >= v_settings.inactive_days;
  v_requires_approval := v_settings.approver_family_member_id is not null and v_settings.approved_at is null;
  v_unlocked := v_condition_met and not v_requires_approval;

  if v_unlocked then
    if v_has_recipient and (
      v_recipient.message is not null
      or v_recipient.video_url is not null
      or v_recipient.legal_will_note is not null
    ) then
      v_will := jsonb_build_object(
        'message', v_recipient.message,
        'video_url', v_recipient.video_url,
        'legal_will_note', v_recipient.legal_will_note,
        'legal_disclaimer_acknowledged_at', v_recipient.legal_disclaimer_acknowledged_at
      );
    else
      select jsonb_build_object(
        'message', message,
        'video_url', video_url,
        'legal_will_note', legal_will_note,
        'legal_disclaimer_acknowledged_at', legal_disclaimer_acknowledged_at
      ) into v_will
      from public.wills where user_id = v_owner_user_id;
    end if;

    v_result := jsonb_build_object(
      'found', true,
      'unlocked', true,
      'conditionMet', v_condition_met,
      'requiresApproval', false,
      'inactiveDays', floor(v_inactive_days),
      'thresholdDays', v_settings.inactive_days,
      'recipientName', v_recipient_name,
      'will', v_will,
      'items', case when v_share_items then
          (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'category_major', category_major, 'disposition', disposition)), '[]'::jsonb) from public.items where user_id = v_owner_user_id)
        else '[]'::jsonb end,
      'digitalItems', case when v_share_digital then
          (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'item_type', item_type)), '[]'::jsonb) from public.digital_items where user_id = v_owner_user_id)
        else '[]'::jsonb end,
      'checklistProgress', case when v_share_checklist then
          (select coalesce(jsonb_object_agg(procedure_key, done), '{}'::jsonb) from public.inheritance_checklist_progress where user_id = v_owner_user_id)
        else '{}'::jsonb end,
      'bucketList', case when v_share_bucket_list then
          (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'done', done) order by created_at), '[]'::jsonb) from public.bucket_list_items where user_id = v_owner_user_id)
        else '[]'::jsonb end,
      'medical', case when v_share_medical then
          (select jsonb_build_object('doctor_name', doctor_name, 'hospital_name', hospital_name, 'doctor_phone', doctor_phone, 'conditions', conditions, 'medications', medications) from public.medical_info where user_id = v_owner_user_id)
        else null end,
      'album', case when v_share_album then
          (select coalesce(jsonb_agg(jsonb_build_object('url', long_lived_url, 'caption', caption) order by created_at desc), '[]'::jsonb) from public.album_photos where user_id = v_owner_user_id and long_lived_url is not null limit 12)
        else '[]'::jsonb end,
      'moodRecent', case when v_share_mood then
          (select jsonb_build_object('mood', mood, 'log_date', log_date) from public.daily_mood_logs where user_id = v_owner_user_id order by log_date desc limit 1)
        else null end
    );
  else
    v_result := jsonb_build_object(
      'found', true,
      'unlocked', false,
      'conditionMet', v_condition_met,
      'requiresApproval', v_requires_approval,
      'inactiveDays', floor(v_inactive_days),
      'thresholdDays', v_settings.inactive_days,
      'recipientName', v_recipient_name
    );
  end if;

  return v_result;
end;
$$;

grant execute on function public.get_handover_status(text) to anon, authenticated;

notify pgrst, 'reload schema';
