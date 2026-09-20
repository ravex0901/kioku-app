-- 請求項8対応: 遺言の「本人の意思(想い)」と「法的な遺言事項」を明確に区別する。
-- 既存の message/video_url は「本人の想い・メッセージ」として維持し、
-- 財産分与など法的な遺言事項は legal_will_note に分けて保存する。
-- Supabase の SQL Editor で1回だけ実行してください。

alter table public.wills add column if not exists legal_will_note text;
alter table public.wills add column if not exists legal_disclaimer_acknowledged_at timestamptz;

-- get_handover_status: 開示するwill情報に legal_will_note / legal_disclaimer_acknowledged_at を追加する
create or replace function public.get_handover_status(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_last_active timestamptz;
  v_inactive_days numeric;
  v_condition_met boolean;
  v_requires_approval boolean;
  v_unlocked boolean;
  v_result jsonb;
begin
  select * into v_settings from public.handover_settings where share_token = p_token;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  select last_active_at into v_last_active from public.profiles where id = v_settings.user_id;
  v_inactive_days := extract(epoch from (now() - coalesce(v_last_active, v_settings.updated_at))) / 86400;
  v_condition_met := v_inactive_days >= v_settings.inactive_days;
  v_requires_approval := v_settings.approver_family_member_id is not null and v_settings.approved_at is null;
  v_unlocked := v_condition_met and not v_requires_approval;

  if v_unlocked then
    v_result := jsonb_build_object(
      'found', true,
      'unlocked', true,
      'conditionMet', v_condition_met,
      'requiresApproval', false,
      'inactiveDays', floor(v_inactive_days),
      'thresholdDays', v_settings.inactive_days,
      'will', (
        select jsonb_build_object(
          'message', message,
          'video_url', video_url,
          'legal_will_note', legal_will_note,
          'legal_disclaimer_acknowledged_at', legal_disclaimer_acknowledged_at
        )
        from public.wills where user_id = v_settings.user_id
      ),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'category_major', category_major, 'disposition', disposition)), '[]'::jsonb) from public.items where user_id = v_settings.user_id),
      'digitalItems', (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'item_type', item_type)), '[]'::jsonb) from public.digital_items where user_id = v_settings.user_id),
      'checklistProgress', (select coalesce(jsonb_object_agg(procedure_key, done), '{}'::jsonb) from public.inheritance_checklist_progress where user_id = v_settings.user_id)
    );
  else
    v_result := jsonb_build_object(
      'found', true,
      'unlocked', false,
      'conditionMet', v_condition_met,
      'requiresApproval', v_requires_approval,
      'inactiveDays', floor(v_inactive_days),
      'thresholdDays', v_settings.inactive_days
    );
  end if;

  return v_result;
end;
$$;

grant execute on function public.get_handover_status(text) to anon, authenticated;

notify pgrst, 'reload schema';
