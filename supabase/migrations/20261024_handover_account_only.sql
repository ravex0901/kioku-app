-- 開示承認後の遺言・動画などは、共有リンクでは表示せず、指定されたアカウント内でのみ表示する。
-- 本体ロジックは内部関数(service_role専用)に移し、公開側の get_handover_status は
-- 開示済みの内容を除いた状態だけを返すラッパーにする。
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'get_handover_status_internal') then
    execute 'alter function public.get_handover_status(text) rename to get_handover_status_internal';
  end if;
end $$;

revoke all on function public.get_handover_status_internal(text) from public, anon, authenticated;
grant execute on function public.get_handover_status_internal(text) to service_role;

create or replace function public.get_handover_status(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r jsonb;
begin
  r := public.get_handover_status_internal(p_token);
  if coalesce((r->>'unlocked')::boolean, false) then
    return jsonb_build_object(
      'found', true,
      'unlocked', false,
      'accountOnly', true,
      'conditionMet', true,
      'requiresApproval', false,
      'disclosureStatus', 'approved',
      'inactiveDays', r->'inactiveDays',
      'thresholdDays', r->'thresholdDays',
      'recipientName', r->'recipientName'
    );
  end if;
  return r;
end;
$function$;

grant execute on function public.get_handover_status(text) to anon, authenticated;
