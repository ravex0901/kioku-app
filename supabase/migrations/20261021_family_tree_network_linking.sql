-- 家系図:直接つながっている家族だけでなく、承認済みのつながりをたどって
-- 間接的につながった家族ネットワーク全体を、1つの家系図として表示できるようにする。
--
-- 既存の get_family_network / can_view_family_content は変更しない。
-- 日記・持ち物などの閲覧権限(RLSポリシー)にも一切影響を与えない。
-- (「家系図に表示される範囲」を広げるだけで、「閲覧できる範囲」は従来の
--  can_view_family_content のルール(直接の家族は常に閲覧可、間接の家族は
--  本人が共有設定をONにした場合のみ)のまま変える)
--
-- Supabase の SQL Editor で1回だけ実行してください(すでに適用済みの場合は
-- create or replace のため安全に再実行できます)。

-- ============================================================
-- 1. 家系図グラフ取得:自分からたどり着ける家族ネットワーク全員(ノード)と、
--    そのネットワーク内の家族関係(エッジ)をまとめて返す。
-- ============================================================
create or replace function public.get_family_tree_graph()
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_nodes jsonb;
  v_edges jsonb;
begin
  if v_viewer is null then
    return jsonb_build_object('ok', false, 'error', 'ログインが必要です。');
  end if;

  -- ノード:自分自身 + get_family_network で見つかる全員(何ホップ先でも)。
  -- get_family_network 側ですでに巡回・重複対策(visited配列・hop上限30・
  -- user_idごとの最短ホップのみ採用)がされているため、ここでは呼び出すだけでよい。
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

  -- エッジ:ネットワーク内の人同士を直接つなぐ family_members の行(双方向とも)。
  -- relation は、各行の持ち主(user_id)から見た linked_user_id の続柄。
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
    and fm.user_id in (select user_id from network_ids)
    and fm.linked_user_id in (select user_id from network_ids);

  return jsonb_build_object(
    'ok', true,
    'selfUserId', v_viewer,
    'nodes', v_nodes,
    'edges', v_edges
  );
end;
$$;

grant execute on function public.get_family_tree_graph() to authenticated;

-- ============================================================
-- 2. 家族の紐づけ解除:直接つながっている相手との family_members の行を
--    双方向とも削除する。紐づけの申請・承認手続き自体は変更しない。
--
-- 実装上の注意:DELETE文は、ガード条件(if文など)より前に、単独の
-- 最初の文として置くこと。ガード判定はすべてDELETEの後(get diagnostics
-- で削除件数を取得したあと)に行うこと。
-- ============================================================
create or replace function public.unlink_family_member(p_linked_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted_count int;
begin
  delete from public.family_members
    where user_id = v_uid
      and linked_user_id = p_linked_user_id
      and v_uid is not null
      and p_linked_user_id is not null
      and p_linked_user_id <> v_uid;
  get diagnostics v_deleted_count = row_count;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'ログインが必要です。');
  end if;

  if p_linked_user_id is null or p_linked_user_id = v_uid then
    return jsonb_build_object('ok', false, 'error', '指定が正しくありません。');
  end if;

  if v_deleted_count = 0 then
    return jsonb_build_object('ok', false, 'error', '直接つながっているご家族のみ解除できます。');
  end if;

  -- 相手側の行も削除し、双方向のつながりを解除する。
  -- (相手はまだ知らない間に解除されるが、紐づけ自体がそもそも双方同意で
  --  成立したものであり、どちらからでも解除できる必要があるため)
  delete from public.family_members
    where user_id = p_linked_user_id and linked_user_id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.unlink_family_member(uuid) to authenticated;

notify pgrst, 'reload schema';
