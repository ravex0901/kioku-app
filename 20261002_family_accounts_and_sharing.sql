-- 家族アカウント連携・もしもの時2段階開示(死亡届+運営承認)・
-- タイムカプセルの条件付き開封(成人/結婚/本人と同じ歳)・
-- AI日記/ボイスメッセージの家族アカウントへの共有、に対応するための拡張。
-- Supabase の SQL Editor で1回だけ実行してください。

-- ============================================================
-- 1. 生年月日(年齢条件の判定に必要)
-- ============================================================
alter table public.profiles add column if not exists birth_date date;

-- ============================================================
-- 2. 家族アカウントの招待・紐付け
-- 招待された家族が「自分のアカウント」でサインアップしてログインできるようにする。
-- アカウントを作らない場合は、これまで通り共有リンク(もしもの時など)のみで閲覧する。
-- ============================================================
alter table public.family_members
  add column if not exists invite_token text unique default encode(gen_random_bytes(12), 'hex'),
  add column if not exists linked_user_id uuid references auth.users(id) on delete set null,
  add column if not exists linked_at timestamptz;

create index if not exists family_members_linked_user_id_idx on public.family_members(linked_user_id);

-- 既存ユーザーがリンク先を自分として検索できるようにする(自分が紐付けられた側の行を見る)。
drop policy if exists "family_members_select_linked" on public.family_members;
create policy "family_members_select_linked"
  on public.family_members for select
  using (auth.uid() = linked_user_id);

-- 招待情報(招待者名・続柄)をトークンだけで取得する公開RPC。
create or replace function public.get_family_invite_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
  v_inviter_name text;
begin
  select * into v_member from public.family_members where invite_token = p_token;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  if v_member.linked_user_id is not null then
    return jsonb_build_object('found', true, 'alreadyLinked', true);
  end if;
  select coalesce(name, '') into v_inviter_name from public.profiles where id = v_member.user_id;
  return jsonb_build_object(
    'found', true,
    'alreadyLinked', false,
    'inviteeName', v_member.name,
    'relation', v_member.relation,
    'inviterName', v_inviter_name
  );
end;
$$;

grant execute on function public.get_family_invite_info(text) to anon, authenticated;

-- ログイン済み(サインアップ直後含む)のユーザーが招待を受け入れて紐付ける。
-- 併せて、招待された側の家系図にも招待者が表示されるよう、逆方向の family_members 行を作る。
create or replace function public.accept_family_invite(p_token text, p_my_relation_to_inviter text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'ログインが必要です。');
  end if;

  select * into v_member from public.family_members where invite_token = p_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'このリンクは無効です。');
  end if;
  if v_member.linked_user_id is not null then
    return jsonb_build_object('ok', false, 'error', 'このリンクはすでに使用されています。');
  end if;
  if v_member.user_id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'ご自身を招待することはできません。');
  end if;

  update public.family_members
    set linked_user_id = v_uid, linked_at = now()
    where id = v_member.id;

  insert into public.family_members (user_id, name, relation, linked_user_id, linked_at)
  values (
    v_uid,
    coalesce((select name from public.profiles where id = v_member.user_id), 'ご家族'),
    coalesce(nullif(p_my_relation_to_inviter, ''), 'other'),
    v_member.user_id,
    now()
  );

  return jsonb_build_object('ok', true, 'inviterUserId', v_member.user_id, 'inviterName',
    (select name from public.profiles where id = v_member.user_id));
end;
$$;

grant execute on function public.accept_family_invite(text, text) to authenticated;

-- ============================================================
-- 3. もしもの時: 非アクティブ検知だけで即公開せず、
--    「共有相手への連絡(待機画面)→ 死亡届等の画像アップロード → 運営の承認」の順に進める。
-- ============================================================
alter table public.handover_settings
  add column if not exists disclosure_status text not null default 'pending'
    check (disclosure_status in ('pending', 'awaiting_certificate', 'certificate_submitted', 'approved', 'rejected'));

create table if not exists public.death_certificate_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_name text,
  image_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);

create index if not exists death_certificate_submissions_user_id_idx on public.death_certificate_submissions(user_id);

alter table public.death_certificate_submissions enable row level security;

drop policy if exists "death_cert_select_own" on public.death_certificate_submissions;
create policy "death_cert_select_own"
  on public.death_certificate_submissions for select
  using (auth.uid() = user_id);

-- 挿入・更新はNext.jsのサーバーアクションからサービスロール(管理者用クライアント)経由でのみ行うため、
-- 一般ユーザー向けのinsert/update/delete権限は付与しない(RLSにより事実上ブロックされる)。

-- get_handover_status を再定義: 非アクティブ条件を満たしても disclosure_status が
-- 'approved' になるまでは開示しない。
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
  v_requires_family_approval boolean;
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
  v_disclosure_status text;
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
  v_requires_family_approval := v_settings.approver_family_member_id is not null and v_settings.approved_at is null;

  v_disclosure_status := v_settings.disclosure_status;

  -- 条件を満たし、家族内承認(設定されていれば)も済んでいるのに、まだ死亡届の提出フローが
  -- 始まっていない場合は、ここで「連絡・提出待ち」状態に進める。
  if v_condition_met and not v_requires_family_approval and v_disclosure_status = 'pending' then
    update public.handover_settings set disclosure_status = 'awaiting_certificate' where user_id = v_owner_user_id;
    v_disclosure_status := 'awaiting_certificate';
  end if;

  v_unlocked := v_condition_met and not v_requires_family_approval and v_disclosure_status = 'approved';

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
      'disclosureStatus', v_disclosure_status,
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
      'requiresApproval', v_requires_family_approval,
      'disclosureStatus', v_disclosure_status,
      'inactiveDays', floor(v_inactive_days),
      'thresholdDays', v_settings.inactive_days,
      'recipientName', v_recipient_name,
      'ownerUserId', v_owner_user_id
    );
  end if;

  return v_result;
end;
$$;

grant execute on function public.get_handover_status(text) to anon, authenticated;

-- 死亡届等の画像を再提出できるよう、却下された場合は 'awaiting_certificate' に戻すRPC
-- (運営側の却下操作とセットでNext.js側のサーバーアクションから呼ぶ想定)。

-- ============================================================
-- 4. タイムカプセル: 家族アカウント宛て送付 + 条件付き開封
-- ============================================================
alter table public.time_capsules
  add column if not exists recipient_family_member_id uuid references public.family_members(id) on delete set null,
  add column if not exists unlock_condition_type text not null default 'date'
    check (unlock_condition_type in ('date', 'adulthood', 'marriage', 'same_age_as_sender')),
  add column if not exists sender_age_at_creation integer,
  add column if not exists marriage_certificate_path text,
  add column if not exists marriage_verified_at timestamptz,
  add column if not exists marriage_review_note text;

-- 自分宛てに届いているタイムカプセル(ロック中も含む)を取得する公開(認証済み)RPC。
-- 開封条件を満たしていない場合は本文を返さない。
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
  join public.family_members fm on fm.id = tc.recipient_family_member_id
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
  where fm.linked_user_id = v_uid and fm.user_id = tc.user_id;

  return v_result;
end;
$$;

grant execute on function public.get_received_time_capsules() to authenticated;

-- 受取人(紐付け済みの家族アカウント)が婚姻届等の画像を提出した結果を反映する。
-- AIの判定結果(p_verified)が true の場合のみ marriage_verified_at をセットして開封可能にする。
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
    join public.family_members fm on fm.id = tc.recipient_family_member_id
    where tc.id = p_capsule_id
      and fm.linked_user_id = v_uid
      and tc.unlock_condition_type = 'marriage'
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

grant execute on function public.verify_marriage_certificate(uuid, text, boolean, text) to authenticated;

insert into storage.buckets (id, name, public)
values ('marriage-certificates', 'marriage-certificates', false)
on conflict (id) do nothing;

drop policy if exists "marriage_cert_storage_select_own" on storage.objects;
create policy "marriage_cert_storage_select_own"
  on storage.objects for select
  using (bucket_id = 'marriage-certificates' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "marriage_cert_storage_insert_own" on storage.objects;
create policy "marriage_cert_storage_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'marriage-certificates' and (storage.foldername(name))[1] = auth.uid()::text);

-- 死亡届画像は未ログインの共有相手がアップロードするため、専用バケットは作るが
-- Next.js サーバーアクションからサービスロールキーでアップロードし、
-- anon向けのstorage insertポリシーは設けない(安全のため)。
insert into storage.buckets (id, name, public)
values ('death-certificates', 'death-certificates', false)
on conflict (id) do nothing;

-- ============================================================
-- 5. AI日記(journal_entries)を、紐付けられた家族アカウントが読めるようにする
-- ============================================================
drop policy if exists "journal_entries_select_linked_family" on public.journal_entries;
create policy "journal_entries_select_linked_family"
  on public.journal_entries for select
  using (
    exists (
      select 1 from public.family_members fm
      where fm.user_id = journal_entries.user_id and fm.linked_user_id = auth.uid()
    )
  );

drop policy if exists "conversation_logs_select_linked_family" on public.conversation_logs;
create policy "conversation_logs_select_linked_family"
  on public.conversation_logs for select
  using (
    exists (
      select 1 from public.family_members fm
      where fm.user_id = conversation_logs.user_id and fm.linked_user_id = auth.uid()
    )
  );

-- ============================================================
-- 6. ボイスメッセージ: 紐付けられた家族が「自分のアカウントから」本人宛てに録音・送信できる
-- ============================================================
alter table public.voice_checkins
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

drop policy if exists "voice_checkins_insert_linked_family" on public.voice_checkins;
create policy "voice_checkins_insert_linked_family"
  on public.voice_checkins for insert
  with check (
    exists (
      select 1 from public.family_members fm
      where fm.user_id = voice_checkins.user_id and fm.linked_user_id = auth.uid()
    )
  );

drop policy if exists "voice_checkins_update_linked_family" on public.voice_checkins;
create policy "voice_checkins_update_linked_family"
  on public.voice_checkins for update
  using (
    exists (
      select 1 from public.family_members fm
      where fm.user_id = voice_checkins.user_id and fm.linked_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.family_members fm
      where fm.user_id = voice_checkins.user_id and fm.linked_user_id = auth.uid()
    )
  );

-- 家族(紐付け済みアカウント)が、自分がボイスメッセージを送れる相手(本人)の一覧を見るためのRPC。
create or replace function public.get_voice_checkin_targets()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'ownerUserId', fm.user_id,
    'ownerName', coalesce((select name from public.profiles where id = fm.user_id), 'ご本人')
  )), '[]'::jsonb)
  from public.family_members fm
  where fm.linked_user_id = auth.uid();
$$;

grant execute on function public.get_voice_checkin_targets() to authenticated;

-- ============================================================
-- 7. 音声ファイルの署名付きURL発行を、紐付けられた家族アカウントにも許可する
--    (journal-audio: AI日記の音声回答, capsule-audio: タイムカプセルの音声メッセージ)
--    既存のバケットが存在しない環境でもマイグレーションが落ちないよう、
--    対象バケットが存在する場合のみポリシーを追加する。
-- ============================================================
do $$
begin
  if exists (select 1 from storage.buckets where id = 'journal-audio') then
    drop policy if exists "journal_audio_select_linked_family" on storage.objects;
    create policy "journal_audio_select_linked_family"
      on storage.objects for select
      using (
        bucket_id = 'journal-audio'
        and exists (
          select 1 from public.family_members fm
          where fm.linked_user_id = auth.uid()
            and fm.user_id::text = (storage.foldername(name))[1]
        )
      );
  end if;

  if exists (select 1 from storage.buckets where id = 'capsule-audio') then
    drop policy if exists "capsule_audio_select_linked_family" on storage.objects;
    create policy "capsule_audio_select_linked_family"
      on storage.objects for select
      using (
        bucket_id = 'capsule-audio'
        and exists (
          select 1 from public.family_members fm
          where fm.linked_user_id = auth.uid()
            and fm.user_id::text = (storage.foldername(name))[1]
        )
      );
  end if;
end $$;

notify pgrst, 'reload schema';
