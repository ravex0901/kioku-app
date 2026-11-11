-- 家族のつながり:同意のない「片側だけのつながり」をなくし、家系図の自動追加に備える(2026-11-11)
--
-- 1. 画面(ブラウザ)からは linked_user_id(相手のアカウント)を書けないようにする。
--    つなぐのは、相手の同意を確かめる RPC(招待の受け入れ・申請の承認など)と、サーバー側の処理だけ。
-- 2. 家族ネットワークは、双方向の行がそろった(お互いが認めた)つながりだけをたどる。
-- 3. 利用者 ID を引数で受け取る関数は、呼び出した本人の ID のときだけ答える。
-- 4. 関数の実行権を、ログインなし(anon / PUBLIC)から外す(共有リンク・招待用の 3 つを除く)。
-- 5. 自動追加の除外リスト(紐づけを解除した相手を、自動で付け直さないため)。
-- 6. 新しい続柄(義父母・甥姪・いとこ など)の世代差。
--
-- 既存の行は消さない・変えない(2026-11-11 時点で、片側だけのつながりは 0 件)。

-- ---------- 1. linked_user_id はサーバー側だけが書ける ----------
create or replace function public.family_members_guard_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 画面からの直接の書き込み(authenticated / anon)は、相手のアカウントを設定・変更できない。
  -- SECURITY DEFINER の RPC やサーバー(service_role)からは通る。
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.linked_user_id is not null then
      raise exception 'linked_user_id can only be set through a consent flow' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.linked_user_id is distinct from old.linked_user_id then
      raise exception 'linked_user_id can only be changed through a consent flow' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists family_members_guard_link on public.family_members;
create trigger family_members_guard_link
  before insert or update on public.family_members
  for each row execute function public.family_members_guard_link();

-- 同じ相手への行は 1 本だけ(自動追加が同時に走っても重ならない。2026-11-11 時点で重複 0 件)
create unique index if not exists family_members_user_linked_unique
  on public.family_members (user_id, linked_user_id)
  where linked_user_id is not null;

-- ---------- 2. 双方向のつながりだけをたどる / 3. 本人の ID のときだけ答える ----------
create or replace function public.get_family_network(p_root_user_id uuid)
returns table(user_id uuid, hop_count integer, generation_delta integer, relation text)
language sql
stable security definer
set search_path to 'public'
as $function$
  with recursive network as (
    select fm.linked_user_id as user_id,
           1 as hop_count,
           public.family_generation_delta(fm.relation) as generation_delta,
           fm.relation as relation,
           array[p_root_user_id, fm.linked_user_id] as visited
    from public.family_members fm
    where fm.user_id = p_root_user_id
      and fm.linked_user_id is not null
      and (auth.uid() is null or auth.uid() = p_root_user_id)
      and exists (
        select 1 from public.family_members r
        where r.user_id = fm.linked_user_id and r.linked_user_id = fm.user_id
      )
    union
    select fm.linked_user_id,
           n.hop_count + 1,
           n.generation_delta + public.family_generation_delta(fm.relation),
           null::text,
           n.visited || fm.linked_user_id
    from network n
    join public.family_members fm on fm.user_id = n.user_id
    where fm.linked_user_id is not null
      and fm.linked_user_id <> all(n.visited)
      and n.hop_count < 30
      and exists (
        select 1 from public.family_members r
        where r.user_id = fm.linked_user_id and r.linked_user_id = fm.user_id
      )
  )
  select distinct on (user_id) user_id, hop_count, generation_delta, relation
  from network
  order by user_id, hop_count asc;
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
    and exists (select 1 from public.family_members fm where fm.user_id = p_b and fm.linked_user_id = p_a);
$function$;

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

create or replace function public.can_upload_voice_checkin(p_folder text, p_uid uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and p_uid is distinct from auth.uid() then
    return false;
  end if;
  return public.is_directly_linked(p_folder::uuid, p_uid);
exception when others then
  return false;
end;
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

-- 家系図に渡す線も、双方向のつながりだけにする
create or replace function public.get_family_tree_graph()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_viewer uuid := auth.uid();
  v_nodes jsonb;
  v_edges jsonb;
begin
  with network as (
    select user_id, hop_count, generation_delta
    from public.get_family_network(v_viewer)
    union all
    select v_viewer, 0, 0
  ),
  node_rows as (
    select
      n.user_id,
      n.hop_count,
      n.generation_delta,
      p.name,
      coalesce(p.is_deceased, false) as is_deceased,
      (n.user_id = v_viewer) as is_self,
      case when n.user_id = v_viewer then true
           else public.can_view_family_content(n.user_id, v_viewer, 'journal') end as can_view_journal,
      case when n.user_id = v_viewer then true
           else public.can_view_family_content(n.user_id, v_viewer, 'items') end as can_view_items
    from network n
    join public.profiles p on p.id = n.user_id
    where v_viewer is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', user_id,
    'name', name,
    'hopCount', hop_count,
    'generationDelta', generation_delta,
    'isDeceased', is_deceased,
    'isSelf', is_self,
    'canViewJournal', can_view_journal,
    'canViewItems', can_view_items
  ) order by hop_count, user_id), '[]'::jsonb)
  into v_nodes
  from node_rows;

  with network_ids as (
    select user_id from public.get_family_network(v_viewer)
    union
    select v_viewer
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'fromUserId', fm.user_id,
    'toUserId', fm.linked_user_id,
    'relation', fm.relation
  ) order by fm.user_id, fm.linked_user_id), '[]'::jsonb)
  into v_edges
  from public.family_members fm
  where fm.linked_user_id is not null
    and v_viewer is not null
    and fm.user_id in (select user_id from network_ids)
    and fm.linked_user_id in (select user_id from network_ids)
    and exists (
      select 1 from public.family_members r
      where r.user_id = fm.linked_user_id and r.linked_user_id = fm.user_id
    );

  if v_viewer is null then
    return jsonb_build_object('ok', false, 'error', 'ログインが必要です。');
  end if;

  return jsonb_build_object(
    'ok', true,
    'selfUserId', v_viewer,
    'nodes', v_nodes,
    'edges', v_edges
  );
end;
$function$;

-- ---------- 6. 新しい続柄の世代差 ----------
create or replace function public.family_generation_delta(p_relation text)
returns integer
language sql
immutable
set search_path = ''
as $function$
  select case p_relation
    when 'great_grandfather' then -3
    when 'great_grandmother' then -3
    when 'grandfather' then -2
    when 'grandmother' then -2
    when 'grandfather_in_law' then -2
    when 'grandmother_in_law' then -2
    when 'father' then -1
    when 'mother' then -1
    when 'father_in_law' then -1
    when 'mother_in_law' then -1
    when 'uncle' then -1
    when 'aunt' then -1
    when 'son' then 1
    when 'daughter' then 1
    when 'eldest_son' then 1
    when 'eldest_daughter' then 1
    when 'son_in_law' then 1
    when 'daughter_in_law' then 1
    when 'nephew' then 1
    when 'niece' then 1
    when 'grandson' then 2
    when 'granddaughter' then 2
    when 'grandchild_in_law' then 2
    when 'great_grandson' then 3
    when 'great_granddaughter' then 3
    else 0
  end;
$function$;

-- ---------- 5. 自動追加の除外リスト ----------
create table if not exists public.family_auto_link_exclusions (
  user_id uuid not null references auth.users (id) on delete cascade,
  other_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, other_user_id),
  constraint family_auto_link_exclusions_not_self check (user_id <> other_user_id)
);
create index if not exists family_auto_link_exclusions_other_idx on public.family_auto_link_exclusions (other_user_id);
alter table public.family_auto_link_exclusions enable row level security;
drop policy if exists family_auto_link_exclusions_select_own on public.family_auto_link_exclusions;
create policy family_auto_link_exclusions_select_own on public.family_auto_link_exclusions
  for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.family_auto_link_exclusions to authenticated;
grant select, insert, update, delete on public.family_auto_link_exclusions to service_role;

-- ---------- 4. 関数の実行権を、ログインなしから外す ----------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.proname in ('process_scheduled_notifications', 'get_handover_status_internal', 'rls_auto_enable')
       or r.proname like 'test\_%' or r.proname like '\_test\_%' then
      execute format('revoke execute on function %s from authenticated', r.sig);
    else
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$$;

-- 共有リンク・招待リンク(ログインなしで開く画面)で使う 3 つだけは、ログインなしでも呼べるようにする
grant execute on function public.get_family_invite_info(text) to anon;
grant execute on function public.get_handover_status(text) to anon;
grant execute on function public.approve_handover(text) to anon;
