-- ご家族への通知・ボイスメッセージ・タイムカプセルが「指定した相手に確実に届く」ようにする。
--
-- 1. 家族通知(アプリ内):今日の調子ボタン、ボイスメッセージ、タイムカプセルが
--    届いたことを、家系図でつながっている相手のホーム画面に表示する。
-- 2. 家族ボイスメッセージ:送れる相手の取得(get_voice_checkin_targets)が未作成で
--    「取得に失敗しました」となっていたため作成。送信者ごとに別々に保存し、上書きを防ぐ。
-- 3. タイムカプセル:宛先を「アカウント(recipient_user_id)」で直接保持し、
--    家族一覧の行が変わっても届くようにする。受取人が音声を再生できるようにもする。

-- ============================================================
-- 1. 家族通知
-- ============================================================
create table if not exists public.family_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('mood', 'voice_message', 'capsule')),
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_id, sender_id, kind, dedupe_key)
);

create index if not exists family_notifications_recipient_idx
  on public.family_notifications (recipient_id, created_at desc);

grant select, update on public.family_notifications to authenticated;
alter table public.family_notifications enable row level security;

drop policy if exists "family_notifications_select_own" on public.family_notifications;
create policy "family_notifications_select_own"
  on public.family_notifications for select
  using (auth.uid() = recipient_id);

drop policy if exists "family_notifications_update_own" on public.family_notifications;
create policy "family_notifications_update_own"
  on public.family_notifications for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- 今日の調子を、家系図でつながっている全員(何ホップ先でも)に通知する。
-- 同じ日に押し直した場合は、新しい内容に更新して未読に戻す。
create or replace function public.notify_family_mood(p_mood text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_date text := to_char((now() at time zone 'Asia/Tokyo')::date, 'YYYY-MM-DD');
  v_count integer;
begin
  if v_uid is null or p_mood not in ('good', 'normal', 'bad') then
    return 0;
  end if;

  insert into public.family_notifications (recipient_id, sender_id, kind, dedupe_key, payload)
  select n.user_id, v_uid, 'mood', v_date, jsonb_build_object('mood', p_mood)
  from public.get_family_network(v_uid) n
  where n.user_id <> v_uid
  on conflict (recipient_id, sender_id, kind, dedupe_key) do update
    set payload = excluded.payload, created_at = now(), read_at = null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 特定の相手(つながっている家族)への通知(ボイスメッセージ・タイムカプセル用)。
-- 家系図でつながっていない相手には通知できない。
create or replace function public.notify_family_event(
  p_recipient_id uuid,
  p_kind text,
  p_dedupe_key text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_recipient_id is null or p_recipient_id = v_uid then
    return false;
  end if;
  if p_kind not in ('voice_message', 'capsule') then
    return false;
  end if;
  if not exists (
    select 1 from public.get_family_network(v_uid) n where n.user_id = p_recipient_id
  ) then
    return false;
  end if;

  insert into public.family_notifications (recipient_id, sender_id, kind, dedupe_key, payload)
  values (p_recipient_id, v_uid, p_kind, coalesce(p_dedupe_key, ''), coalesce(p_payload, '{}'::jsonb))
  on conflict (recipient_id, sender_id, kind, dedupe_key) do update
    set payload = excluded.payload, created_at = now(), read_at = null;
  return true;
end;
$$;

-- 自分宛ての通知(新しい順に最大30件)。送り主の名前つき。
create or replace function public.get_my_family_notifications()
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc), '[]'::jsonb)
  from (
    select
      fn.id,
      fn.kind,
      fn.payload,
      fn.created_at as "createdAt",
      (fn.read_at is not null) as "read",
      coalesce((select name from public.profiles where id = fn.sender_id), 'ご家族') as "senderName",
      fn.sender_id as "senderId",
      fn.created_at
    from public.family_notifications fn
    where fn.recipient_id = auth.uid()
    order by fn.created_at desc
    limit 30
  ) t;
$$;

create or replace function public.mark_family_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.family_notifications
    set read_at = now()
    where recipient_id = auth.uid() and read_at is null;
$$;

grant execute on function public.notify_family_mood(text) to authenticated;
grant execute on function public.notify_family_event(uuid, text, text, jsonb) to authenticated;
grant execute on function public.get_my_family_notifications() to authenticated;
grant execute on function public.mark_family_notifications_read() to authenticated;

-- ============================================================
-- 2. 家族ボイスメッセージ
-- ============================================================
alter table public.voice_checkins
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

update public.voice_checkins set created_by_user_id = user_id where created_by_user_id is null;

-- 送信者ごとに別々に保存する(別のご家族のメッセージを上書きしない)。
alter table public.voice_checkins drop constraint if exists voice_checkins_user_id_time_slot_key;
alter table public.voice_checkins
  drop constraint if exists voice_checkins_user_slot_sender_key;
alter table public.voice_checkins
  add constraint voice_checkins_user_slot_sender_key unique (user_id, time_slot, created_by_user_id);

-- 直接つながっている家族か(どちらの向きの登録でもよい)。
create or replace function public.is_directly_linked(p_a uuid, p_b uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select p_a is not null and p_b is not null and p_a <> p_b and exists (
    select 1 from public.family_members fm
    where (fm.user_id = p_a and fm.linked_user_id = p_b)
       or (fm.user_id = p_b and fm.linked_user_id = p_a)
  );
$$;

grant execute on function public.is_directly_linked(uuid, uuid) to authenticated;

-- ボイスメッセージを送れる相手(=直接つながっている家族アカウント)の一覧。
create or replace function public.get_voice_checkin_targets()
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('ownerUserId', t.id, 'ownerName', t.name) order by t.name), '[]'::jsonb)
  from (
    select distinct p.id, coalesce(p.name, 'ご家族') as name
    from (
      select fm.linked_user_id as other_id from public.family_members fm
        where fm.user_id = auth.uid() and fm.linked_user_id is not null
      union
      select fm.user_id as other_id from public.family_members fm
        where fm.linked_user_id = auth.uid()
    ) o
    join public.profiles p on p.id = o.other_id
    where o.other_id <> auth.uid()
  ) t;
$$;

grant execute on function public.get_voice_checkin_targets() to authenticated;

-- 送り主(家族)が、相手宛てのメッセージを登録・更新・削除でき、自分が送った分は読めるようにする。
drop policy if exists "voice_checkins_select_own" on public.voice_checkins;
create policy "voice_checkins_select_own"
  on public.voice_checkins for select
  using (auth.uid() = user_id or auth.uid() = created_by_user_id);

drop policy if exists "voice_checkins_insert_own" on public.voice_checkins;
create policy "voice_checkins_insert_own"
  on public.voice_checkins for insert
  with check (
    (auth.uid() = user_id and coalesce(created_by_user_id, user_id) = user_id)
    or (auth.uid() = created_by_user_id and public.is_directly_linked(user_id, auth.uid()))
  );

drop policy if exists "voice_checkins_update_own" on public.voice_checkins;
create policy "voice_checkins_update_own"
  on public.voice_checkins for update
  using (auth.uid() = user_id or auth.uid() = created_by_user_id)
  with check (
    (auth.uid() = user_id and coalesce(created_by_user_id, user_id) = user_id)
    or (auth.uid() = created_by_user_id and public.is_directly_linked(user_id, auth.uid()))
  );

drop policy if exists "voice_checkins_delete_own" on public.voice_checkins;
create policy "voice_checkins_delete_own"
  on public.voice_checkins for delete
  using (auth.uid() = user_id or auth.uid() = created_by_user_id);

-- 家族が録音を、相手のフォルダ(相手のID/…)にアップロードできるようにする。
create or replace function public.can_upload_voice_checkin(p_folder text, p_uid uuid)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
begin
  return public.is_directly_linked(p_folder::uuid, p_uid);
exception when others then
  return false;
end;
$$;

grant execute on function public.can_upload_voice_checkin(text, uuid) to authenticated;

drop policy if exists "voice_checkins_storage_insert_family" on storage.objects;
create policy "voice_checkins_storage_insert_family"
  on storage.objects for insert
  with check (
    bucket_id = 'voice-checkins'
    and public.can_upload_voice_checkin((storage.foldername(name))[1], auth.uid())
  );

drop policy if exists "voice_checkins_storage_update_family" on storage.objects;
create policy "voice_checkins_storage_update_family"
  on storage.objects for update
  using (
    bucket_id = 'voice-checkins'
    and public.can_upload_voice_checkin((storage.foldername(name))[1], auth.uid())
  );

-- ============================================================
-- 3. タイムカプセル
-- ============================================================
alter table public.time_capsules
  add column if not exists recipient_user_id uuid references auth.users(id) on delete set null;

update public.time_capsules tc
  set recipient_user_id = fm.linked_user_id
  from public.family_members fm
  where fm.id = tc.recipient_family_member_id
    and fm.linked_user_id is not null
    and tc.recipient_user_id is null;

create index if not exists time_capsules_recipient_user_idx
  on public.time_capsules (recipient_user_id);

create or replace function public.get_received_time_capsules()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_my_birth_date date;
  v_result jsonb;
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;

  select birth_date into v_my_birth_date from public.profiles where id = v_uid;

  select coalesce(jsonb_agg(row_result order by tc.created_at desc), '[]'::jsonb) into v_result
  from public.time_capsules tc
  left join public.family_members fm on fm.id = tc.recipient_family_member_id
  join lateral (
    select
      (case tc.unlock_condition_type
        when 'date' then tc.open_at <= now()
        when 'adulthood' then v_my_birth_date is not null and (v_my_birth_date + interval '18 years') <= now()
        when 'marriage' then tc.marriage_verified_at is not null
        when 'same_age_as_sender' then v_my_birth_date is not null and tc.sender_age_at_creation is not null
          and (v_my_birth_date + (tc.sender_age_at_creation || ' years')::interval) <= now()
        else false
      end) as is_unlocked
  ) calc on true
  join lateral (
    select case when calc.is_unlocked then
      jsonb_build_object(
        'id', tc.id,
        'title', tc.title,
        'senderName', coalesce((select name from public.profiles where id = tc.user_id), '本人'),
        'unlocked', true,
        'unlockConditionType', tc.unlock_condition_type,
        'messageText', tc.message_text,
        'messageAudioPath', tc.message_audio_path,
        'openAt', tc.open_at,
        'createdAt', tc.created_at
      )
    else
      jsonb_build_object(
        'id', tc.id,
        'title', tc.title,
        'senderName', coalesce((select name from public.profiles where id = tc.user_id), '本人'),
        'unlocked', false,
        'unlockConditionType', tc.unlock_condition_type,
        'openAt', tc.open_at,
        'createdAt', tc.created_at,
        'marriageSubmitted', tc.marriage_certificate_path is not null and tc.marriage_verified_at is null
      )
    end as row_result
  ) packed on true
  where tc.recipient_user_id = v_uid
     or (tc.recipient_user_id is null and fm.linked_user_id = v_uid and fm.user_id = tc.user_id);

  return v_result;
end;
$$;

create or replace function public.verify_marriage_certificate(
  p_capsule_id uuid,
  p_image_path text,
  p_verified boolean,
  p_note text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ok boolean;
begin
  if v_uid is null then
    return false;
  end if;

  select exists (
    select 1
    from public.time_capsules tc
    left join public.family_members fm on fm.id = tc.recipient_family_member_id
    where tc.id = p_capsule_id
      and tc.unlock_condition_type = 'marriage'
      and (tc.recipient_user_id = v_uid or fm.linked_user_id = v_uid)
  ) into v_ok;

  if not v_ok then
    return false;
  end if;

  update public.time_capsules
    set marriage_certificate_path = p_image_path,
        marriage_review_note = p_note,
        marriage_verified_at = case when p_verified then now() else marriage_verified_at end
    where id = p_capsule_id;

  return true;
end;
$$;

-- 受取人が、開封できる状態になったタイムカプセルの音声を再生できるようにする。
create or replace function public.can_read_capsule_audio(p_path text, p_uid uuid)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_birth date;
begin
  if p_uid is null then
    return false;
  end if;
  select birth_date into v_birth from public.profiles where id = p_uid;
  return exists (
    select 1
    from public.time_capsules tc
    left join public.family_members fm on fm.id = tc.recipient_family_member_id
    where tc.message_audio_path = p_path
      and (tc.recipient_user_id = p_uid or (tc.recipient_user_id is null and fm.linked_user_id = p_uid))
      and (case tc.unlock_condition_type
        when 'date' then tc.open_at <= now()
        when 'adulthood' then v_birth is not null and (v_birth + interval '18 years') <= now()
        when 'marriage' then tc.marriage_verified_at is not null
        when 'same_age_as_sender' then v_birth is not null and tc.sender_age_at_creation is not null
          and (v_birth + (tc.sender_age_at_creation || ' years')::interval) <= now()
        else false
      end)
  );
end;
$$;

grant execute on function public.can_read_capsule_audio(text, uuid) to authenticated;

drop policy if exists "capsule_audio_select_recipient" on storage.objects;
create policy "capsule_audio_select_recipient"
  on storage.objects for select
  using (bucket_id = 'capsule-audio' and public.can_read_capsule_audio(name, auth.uid()));

notify pgrst, 'reload schema';

-- 家族が自分でアップロードした録音を、再アップロード(上書き)できるよう読めるようにする。
drop policy if exists "voice_checkins_storage_select_uploader" on storage.objects;
create policy "voice_checkins_storage_select_uploader"
  on storage.objects for select
  using (bucket_id = 'voice-checkins' and owner_id = auth.uid()::text);
