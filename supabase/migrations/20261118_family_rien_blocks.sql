-- 「離縁」:相手(と相手だけにつながっている人)と、お互いの写真・日記・持ち物・ボイス・タイムカプセル・お知らせを見えなくする(2026-11-18 オーナー決定)
--
-- - 家系図のつながり(family_members)はそのまま残す。見られる内容だけを止める。
-- - family_content_blocks に双方向の行を置き、内容を見せる関数・ポリシーの入口で確かめる。
-- - 書き込みはサーバー(service_role)だけ。本人は自分の行(user_id = 自分)だけ読める。
-- 既存の行は消さない・変えない。

create table if not exists public.family_content_blocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  other_user_id uuid not null references auth.users (id) on delete cascade,
  -- 離縁した相手(この行を作るもとになった人。相手だけにつながっている人の行にも入る)
  origin_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, other_user_id),
  constraint family_content_blocks_not_self check (user_id <> other_user_id)
);
create index if not exists family_content_blocks_other_idx on public.family_content_blocks (other_user_id);
alter table public.family_content_blocks enable row level security;
drop policy if exists family_content_blocks_select_own on public.family_content_blocks;
create policy family_content_blocks_select_own on public.family_content_blocks
  for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.family_content_blocks to authenticated;
grant select, insert, update, delete on public.family_content_blocks to service_role;

-- 2 人が離縁しているか(どちら向きの行でも)。呼び出した本人が当事者のときだけ答える
create or replace function public.family_content_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable security definer
set search_path = ''
as $function$
  select p_a is not null and p_b is not null
    and (auth.uid() is null or auth.uid() in (p_a, p_b))
    and exists (
      select 1 from public.family_content_blocks b
      where (b.user_id = p_a and b.other_user_id = p_b)
         or (b.user_id = p_b and b.other_user_id = p_a)
    );
$function$;
revoke execute on function public.family_content_blocked(uuid, uuid) from public, anon;
grant execute on function public.family_content_blocked(uuid, uuid) to authenticated, service_role;

-- ---------- 日記・持ち物(写真)・ボイスの送信・カプセルの音声 ----------
create or replace function public.can_view_family_content(p_owner_id uuid, p_viewer_id uuid, p_kind text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_hop int;
  v_deceased boolean;
  v_share boolean;
begin
  if p_viewer_id is null then
    return false;
  end if;
  if auth.uid() is not null and p_viewer_id is distinct from auth.uid() then
    return false;
  end if;
  if p_owner_id = p_viewer_id then
    return true;
  end if;
  -- 離縁した相手どうしは、お互いの内容を見られない
  if public.family_content_blocked(p_owner_id, p_viewer_id) then
    return false;
  end if;

  select hop_count into v_hop
  from public.get_family_network(p_viewer_id)
  where user_id = p_owner_id;

  if v_hop is null then
    return false;
  end if;

  -- 直接の家族(1ホップ)は、これまで通り常に閲覧可能(既存の挙動を変えない)。
  if v_hop = 1 then
    return true;
  end if;

  select is_deceased into v_deceased from public.profiles where id = p_owner_id;

  if coalesce(v_deceased, false) then
    select share_with_network into v_share
    from public.family_legacy_shares
    where deceased_user_id = p_owner_id;
    return coalesce(v_share, false);
  end if;

  if p_kind = 'journal' then
    select share_journal_with_network into v_share
    from public.family_share_settings where user_id = p_owner_id;
  else
    select share_items_with_network into v_share
    from public.family_share_settings where user_id = p_owner_id;
  end if;

  return coalesce(v_share, false);
end;
$function$;

create or replace function public.can_view_family_items(p_owner_id uuid, p_viewer_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_hop int;
  v_share boolean;
  v_deceased boolean;
begin
  if p_viewer_id is null or p_owner_id is null then
    return false;
  end if;
  if auth.uid() is not null and p_viewer_id is distinct from auth.uid() then
    return false;
  end if;
  if p_owner_id = p_viewer_id then
    return true;
  end if;
  if public.family_content_blocked(p_owner_id, p_viewer_id) then
    return false;
  end if;
  select hop_count into v_hop from public.get_family_network(p_viewer_id) where user_id = p_owner_id;
  if v_hop is null then
    return false;
  end if;
  if v_hop = 1 then
    select is_deceased into v_deceased from public.profiles where id = p_owner_id;
    if coalesce(v_deceased, false) then
      return true;
    end if;
    select share_items_with_direct into v_share from public.family_share_settings where user_id = p_owner_id;
    return coalesce(v_share, false);
  end if;
  return public.can_view_family_content(p_owner_id, p_viewer_id, 'items');
end;
$function$;

create or replace function public.is_directly_linked(p_a uuid, p_b uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select p_a is not null and p_b is not null and p_a <> p_b
    and (auth.uid() is null or auth.uid() in (p_a, p_b))
    and exists (select 1 from public.family_members fm where fm.user_id = p_a and fm.linked_user_id = p_b)
    and exists (select 1 from public.family_members fm where fm.user_id = p_b and fm.linked_user_id = p_a)
    and not public.family_content_blocked(p_a, p_b);
$function$;

create or replace function public.can_read_capsule_audio(p_path text, p_uid uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_birth date;
begin
  if p_uid is null then return false; end if;
  if auth.uid() is not null and p_uid is distinct from auth.uid() then return false; end if;
  select birth_date into v_birth from public.profiles where id = p_uid;
  return exists (
    select 1 from public.time_capsules tc
    left join public.family_members fm on fm.id = tc.recipient_family_member_id
    where tc.message_audio_path = p_path
      and not public.family_content_blocked(tc.user_id, p_uid)
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
$function$;

-- ---------- ボイスメッセージを送れる相手 ----------
create or replace function public.get_voice_checkin_targets()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('ownerUserId', t.id, 'ownerName', t.name) order by t.name), '[]'::jsonb)
  from (
    select distinct p.id, coalesce(p.name, 'ご家族') as name
    from (
      select fm.linked_user_id as other_id from public.family_members fm where fm.user_id = auth.uid() and fm.linked_user_id is not null
      union
      select fm.user_id as other_id from public.family_members fm where fm.linked_user_id = auth.uid()
    ) o
    join public.profiles p on p.id = o.other_id
    where o.other_id <> auth.uid()
      and not public.family_content_blocked(auth.uid(), o.other_id)
  ) t;
$function$;

-- ---------- お知らせ(ボイス・カプセル・今日の調子) ----------
create or replace function public.notify_family_event(p_recipient_id uuid, p_kind text, p_dedupe_key text, p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_recipient_id is null or p_recipient_id = v_uid then return false; end if;
  if p_kind not in ('voice_message', 'capsule') then return false; end if;
  if not exists (select 1 from public.get_family_network(v_uid) n where n.user_id = p_recipient_id) then return false; end if;
  if public.family_content_blocked(v_uid, p_recipient_id) then return false; end if;
  insert into public.family_notifications (recipient_id, sender_id, kind, dedupe_key, payload)
  values (p_recipient_id, v_uid, p_kind, coalesce(p_dedupe_key, ''), coalesce(p_payload, '{}'::jsonb))
  on conflict (recipient_id, sender_id, kind, dedupe_key) do update
    set payload = excluded.payload, created_at = now(), read_at = null;
  return true;
end;
$function$;

create or replace function public.notify_family_mood(p_mood text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_date text := to_char((now() at time zone 'Asia/Tokyo')::date, 'YYYY-MM-DD');
  v_count integer;
begin
  if v_uid is null or p_mood not in ('good', 'normal', 'bad') then return 0; end if;
  insert into public.family_notifications (recipient_id, sender_id, kind, dedupe_key, payload)
  select n.user_id, v_uid, 'mood', v_date, jsonb_build_object('mood', p_mood)
  from public.get_family_network(v_uid) n
  where n.user_id <> v_uid
    and not public.family_content_blocked(v_uid, n.user_id)
  on conflict (recipient_id, sender_id, kind, dedupe_key) do update
    set payload = excluded.payload, created_at = now(), read_at = null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- ---------- 受け取ったタイムカプセル(離縁した相手からのものは出さない) ----------
create or replace function public.get_received_time_capsules()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_my_birth_date date;
  v_result jsonb;
begin
  if v_uid is null then return '[]'::jsonb; end if;
  select birth_date into v_my_birth_date from public.profiles where id = v_uid;
  select coalesce(jsonb_agg(row_result order by tc.created_at desc), '[]'::jsonb) into v_result
  from public.time_capsules tc
  left join public.family_members fm on fm.id = tc.recipient_family_member_id
  join lateral (
    select (case tc.unlock_condition_type
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
      jsonb_build_object('id', tc.id, 'title', tc.title,
        'senderName', coalesce((select name from public.profiles where id = tc.user_id), '本人'),
        'unlocked', true, 'unlockConditionType', tc.unlock_condition_type,
        'messageText', tc.message_text, 'messageAudioPath', tc.message_audio_path,
        'openAt', tc.open_at, 'createdAt', tc.created_at)
    else
      jsonb_build_object('id', tc.id, 'title', tc.title,
        'senderName', coalesce((select name from public.profiles where id = tc.user_id), '本人'),
        'unlocked', false, 'unlockConditionType', tc.unlock_condition_type,
        'openAt', tc.open_at, 'createdAt', tc.created_at,
        'marriageSubmitted', tc.marriage_certificate_path is not null and tc.marriage_verified_at is null)
    end as row_result
  ) packed on true
  where (tc.recipient_user_id = v_uid
     or (tc.recipient_user_id is null and fm.linked_user_id = v_uid and fm.user_id = tc.user_id))
    and not public.family_content_blocked(v_uid, tc.user_id);
  return v_result;
end;
$function$;

-- ---------- 届いたボイス・お知らせ(離縁した相手からのものは見えない) ----------
drop policy if exists voice_checkins_select_own on public.voice_checkins;
create policy voice_checkins_select_own on public.voice_checkins
  for select
  using (
    (auth.uid() = user_id or auth.uid() = created_by_user_id)
    and (created_by_user_id is null or created_by_user_id = user_id
         or not public.family_content_blocked(user_id, created_by_user_id))
  );

drop policy if exists family_notifications_select_own on public.family_notifications;
create policy family_notifications_select_own on public.family_notifications
  for select
  using (
    auth.uid() = recipient_id
    and (sender_id is null or not public.family_content_blocked(recipient_id, sender_id))
  );
