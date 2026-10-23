-- 持ち物の共有:つながっているご家族(直接つながっている人)に、
-- 持ち物の記録を見せるかどうかを、持ち主本人がチェックボックスで選べるようにする。
-- (初期設定はOFF。チェックを入れた人の持ち物だけが、つながっているご家族に見える)
--
-- ・間接の家族(2ホップ以上)への共有設定(share_items_with_network)は従来どおり別に残す。
-- ・故人アカウントの持ち物は、従来どおり直接のご家族が見られる(本人はチェックできないため)。
-- ・日記の閲覧ルール(can_view_family_content の 'journal')は変更しない。

alter table public.family_share_settings
  add column if not exists share_items_with_direct boolean not null default false;

-- 設定の取得・保存(既存の get/set_family_share_settings とは別の関数にして、既存の呼び出しを壊さない)
create or replace function public.get_family_items_direct_share()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select coalesce(
    (select share_items_with_direct from public.family_share_settings where user_id = auth.uid()),
    false
  );
$$;

create or replace function public.set_family_items_direct_share(p_share boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'ログインが必要です。');
  end if;

  insert into public.family_share_settings (user_id, share_items_with_direct, updated_at)
  values (v_uid, coalesce(p_share, false), now())
  on conflict (user_id) do update
    set share_items_with_direct = excluded.share_items_with_direct,
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

-- 持ち物を見てよいか:
--  ・自分 → 可
--  ・直接のご家族(1ホップ) → 持ち主がチェックを入れていれば可(故人アカウントは従来どおり可)
--  ・間接の家族 → 従来の can_view_family_content('items') のルールのまま
create or replace function public.can_view_family_items(p_owner_id uuid, p_viewer_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_hop int;
  v_share boolean;
  v_deceased boolean;
begin
  if p_viewer_id is null or p_owner_id is null then
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

  if v_hop = 1 then
    select is_deceased into v_deceased from public.profiles where id = p_owner_id;
    if coalesce(v_deceased, false) then
      return true;
    end if;
    select share_items_with_direct into v_share
    from public.family_share_settings where user_id = p_owner_id;
    return coalesce(v_share, false);
  end if;

  return public.can_view_family_content(p_owner_id, p_viewer_id, 'items');
end;
$$;

grant execute on function public.get_family_items_direct_share() to authenticated;
grant execute on function public.set_family_items_direct_share(boolean) to authenticated;
grant execute on function public.can_view_family_items(uuid, uuid) to authenticated;

-- 持ち物の閲覧ポリシーを、新しい判定に切り替える(DROPせずALTERで変更)。
alter policy items_select_extended_network on public.items
  using (public.can_view_family_items(user_id, auth.uid()));

-- ご家族の持ち物の写真も、同じ条件のときだけ署名付きURLで見られるようにする。
-- (保存先は「持ち主のID/ファイル名」の形)
create or replace function public.can_view_family_item_media(p_folder text, p_viewer_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
begin
  return public.can_view_family_items(p_folder::uuid, p_viewer_id);
exception when others then
  return false;
end;
$$;

grant execute on function public.can_view_family_item_media(text, uuid) to authenticated;

create policy item_media_select_family on storage.objects
  for select
  using (
    bucket_id = 'item-media'
    and public.can_view_family_item_media((storage.foldername(name))[1], auth.uid())
  );

notify pgrst, 'reload schema';
