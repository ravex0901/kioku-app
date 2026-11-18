-- 故人の「孫など間接のご家族にも共有する」を変えられるのは、直接つながっているご家族だけにする(2026-11-18 オーナー決定)
--
-- 家系図の自動追加でつながった方(双方の行とも招待トークンなし=自動追加の印)は「間接のご家族」とみなし、変えられない。
-- 招待・申請の承認・本人の登録でつながった方(どちらかの行に招待トークンあり)だけが変えられる。
-- 離縁している相手も変えられない。既存の設定値は変えない。

create or replace function public.set_family_legacy_share(p_deceased_user_id uuid, p_share boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_direct boolean;
  v_deceased boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'ログインが必要です。');
  end if;

  select exists (
    select 1
    from public.family_members mine
    join public.family_members theirs
      on theirs.user_id = mine.linked_user_id and theirs.linked_user_id = mine.user_id
    where mine.user_id = v_uid
      and mine.linked_user_id = p_deceased_user_id
      and (mine.invite_token is not null or theirs.invite_token is not null)
  ) into v_direct;

  if not v_direct or public.family_content_blocked(v_uid, p_deceased_user_id) then
    return jsonb_build_object('ok', false, 'error', '直接つながっているご家族のみ設定できます。');
  end if;

  select is_deceased into v_deceased from public.profiles where id = p_deceased_user_id;
  if not coalesce(v_deceased, false) then
    return jsonb_build_object('ok', false, 'error', '故人として設定されたアカウントのみ対象です。');
  end if;

  insert into public.family_legacy_shares (deceased_user_id, share_with_network, updated_by_user_id, updated_at)
  values (p_deceased_user_id, p_share, v_uid, now())
  on conflict (deceased_user_id) do update
    set share_with_network = excluded.share_with_network,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$function$;
