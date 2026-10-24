-- 開封日になったタイムカプセル・「もしもの時」の連絡待ちを、ご家族のアプリ内通知に自動で出す。
-- これまでは開封や非アクティブ検知の「時点」で通知を出す仕組みがなく、誰にも通知が届かなかった。

-- 通知の種類を追加する
do $$
begin
  execute 'alter table public.family_notifications drop constraint if exists family_notifications_kind_check';
  execute 'alter table public.family_notifications add constraint family_notifications_kind_check check (kind in (''mood'',''voice_message'',''capsule'',''capsule_open'',''handover_waiting'',''handover_approved''))';
end $$;

create or replace function public.process_scheduled_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handover int := 0;
  v_capsule int := 0;
  v_n int;
begin
  -- 1) 「もしもの時」: 一定期間アプリが使われていない方は、連絡待ちの状態に進め、
  --    直接つながっているご家族に知らせる(死亡届の提出を促す)。
  update public.handover_settings s
     set disclosure_status = 'awaiting_certificate'
   where s.disclosure_status = 'pending'
     and (s.approver_family_member_id is null or s.approved_at is not null)
     and extract(epoch from (now() - coalesce(
           (select p.last_active_at from public.profiles p where p.id = s.user_id), s.updated_at))) / 86400
         >= s.inactive_days;

  insert into public.family_notifications (recipient_id, sender_id, kind, dedupe_key, payload)
  select distinct fm.linked_user_id, s.user_id, 'handover_waiting', 'waiting', '{}'::jsonb
    from public.handover_settings s
    join public.family_members fm on fm.user_id = s.user_id and fm.linked_user_id is not null
   where s.disclosure_status = 'awaiting_certificate'
  on conflict (recipient_id, sender_id, kind, dedupe_key) do nothing;
  get diagnostics v_n = row_count;
  v_handover := v_n;

  -- 2) タイムカプセル: 開封条件を満たしたものを、宛先のアカウントに知らせる。
  insert into public.family_notifications (recipient_id, sender_id, kind, dedupe_key, payload)
  select tc.recipient_user_id, tc.user_id, 'capsule_open', tc.id::text,
         jsonb_build_object('title', tc.title)
    from public.time_capsules tc
    left join public.profiles rp on rp.id = tc.recipient_user_id
   where tc.recipient_user_id is not null
     and (case tc.unlock_condition_type
            when 'date' then tc.open_at <= now()
            when 'adulthood' then rp.birth_date is not null and (rp.birth_date + interval '18 years') <= now()
            when 'marriage' then tc.marriage_verified_at is not null
            when 'same_age_as_sender' then rp.birth_date is not null and tc.sender_age_at_creation is not null
              and (rp.birth_date + (tc.sender_age_at_creation || ' years')::interval) <= now()
            else false
          end)
  on conflict (recipient_id, sender_id, kind, dedupe_key) do nothing;
  get diagnostics v_n = row_count;
  v_capsule := v_n;

  return jsonb_build_object('handoverNotified', v_handover, 'capsuleNotified', v_capsule);
end;
$$;

revoke all on function public.process_scheduled_notifications() from public, anon, authenticated;

-- 1時間ごとに自動実行する(pg_cronが使える場合)
create extension if not exists pg_cron;
do $$
begin
  perform cron.schedule('kioku-scheduled-notifications', '0 * * * *', 'select public.process_scheduled_notifications()');
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
