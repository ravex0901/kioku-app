-- 1) profile_details: authenticated ロールにテーブル権限が無く、アカウント設定の保存が失敗していた。
grant select, insert, update on public.profile_details to authenticated;

-- 2) 「もしもの時」でアクティブ検知なし(inactive_days >= 36500)の人も、
--    死亡届の提出 → 運営の承認 で内容を開示できるようにする。
create or replace function public.get_handover_status(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recipient record;
  v_has_recipient boolean := false;
  v_settings record;
  v_owner_user_id uuid;
  v_recipient_name text;
  v_last_active timestamptz;
  v_inactive_days numeric;
  v_no_detection boolean;
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

  -- アクティブ検知なし: 日数条件・家族内承認は使わず、死亡届の提出と運営の承認のみで開示する。
  v_no_detection := v_settings.inactive_days >= 36500;
  v_condition_met := v_no_detection or v_inactive_days >= v_settings.inactive_days;
  v_requires_family_approval := (not v_no_detection)
    and v_settings.approver_family_member_id is not null and v_settings.approved_at is null;

  v_disclosure_status := v_settings.disclosure_status;

  if v_condition_met and not v_no_detection and not v_requires_family_approval and v_disclosure_status = 'pending' then
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
      'noDetection', v_no_detection,
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
      'noDetection', v_no_detection,
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
$function$;
