-- 家族向け「もしもの時」画面でダッシュボードと同じ内容を表示するため、
-- get_handover_status_internal の items / digitalItems に項目を追加する。
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.get_handover_status_internal(text)'::regprocedure);
  d := replace(d,
    $a$jsonb_build_object('name', name, 'category_major', category_major, 'disposition', disposition)$a$,
    $b$jsonb_build_object('name', name, 'category_major', category_major, 'disposition', disposition, 'status', status, 'estimated_price_range', estimated_price_range, 'professional_appraisal', professional_appraisal, 'located', (location_id is not null))$b$);
  d := replace(d,
    $a$jsonb_build_object('title', title, 'item_type', item_type)$a$,
    $b$jsonb_build_object('title', title, 'item_type', item_type, 'status', status)$b$);
  if position('professional_appraisal' in d) = 0 or position($c$'located', (location_id is not null)$c$ in d) = 0 then
    raise exception 'replace failed';
  end if;
  execute d;
end
$mig$;
