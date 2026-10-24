-- 家族向け「もしもの時」画面で、アルバムごとに開いて写真を見られるよう、
-- get_handover_status_internal に albums(名前+写真一覧)を追加する。
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.get_handover_status_internal(text)'::regprocedure);
  d := replace(d,
    $a$'moodRecent', case when v_share_mood$a$,
    $b$'albums', case when v_share_album then
          (select coalesce(jsonb_agg(jsonb_build_object(
              'name', a.name,
              'photos', (select coalesce(jsonb_agg(jsonb_build_object('url', p.long_lived_url, 'caption', p.caption) order by p.created_at desc), '[]'::jsonb)
                         from public.album_photos p where p.album_id = a.id and p.long_lived_url is not null)
            ) order by a.created_at), '[]'::jsonb)
           from public.albums a where a.user_id = v_owner_user_id)
        else '[]'::jsonb end,
      'moodRecent', case when v_share_mood$b$);
  if position($c$'albums', case when v_share_album$c$ in d) = 0 then
    raise exception 'replace failed';
  end if;
  execute d;
end
$mig$;
