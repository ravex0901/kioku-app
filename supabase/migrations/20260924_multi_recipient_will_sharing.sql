-- 複数の共有相手ごとに、別々の遺言動画・遺言書(意思伝達情報)と
-- 別々の共有リンクを設定できるようにする。
-- 既存の wills / handover_settings はそのまま「共通のデフォルト内容」として維持し、
-- handover_recipients に登録がない場合はこれまで通り wills の内容が使われる(後方互換)。
-- Supabase の SQL Editor で1回だけ実行してください。

create table if not exists public.handover_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_member_id uuid references public.family_members(id) on delete set null,
  name text not null,
  message text,
  video_url text,
  legal_will_note text,
  legal_disclaimer_acknowledged_at timestamptz,
  share_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists handover_recipients_user_id_idx on public.handover_recipients(user_id);

grant select, insert, update, delete on public.handover_recipients to authenticated;

alter table public.handover_recipients enable row level security;

drop policy if exists "handover_recipients_select_own" on public.handover_recipients;
create policy "handover_recipients_select_own"
  on public.handover_recipients for select
  using (auth.uid() = user_id);

drop policy if exists "handover_recipients_insert_own" on public.handover_recipients;
create policy "handover_recipients_insert_own"
  on public.handover_recipients for insert
  with check (auth.uid() = user_id);

drop policy if exists "handover_recipients_update_own" on public.handover_recipients;
create policy "handover_recipients_update_own"
  on public.handover_recipients for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "handover_recipients_delete_own" on public.handover_recipients;
create policy "handover_recipients_delete_own"
  on public.handover_recipients for delete
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists handover_recipients_set_updated_at on public.handover_recipients;
create trigger handover_recipients_set_updated_at
  before update on public.handover_recipients
  for each row
  execute function public.set_updated_at();

-- get_handover_status: 共有トークンが handover_recipients のものであれば、
-- その相手専用の遺言動画・遺言書を返す(未設定の項目は wills の内容にフォールバック)。
-- 開示条件(非アクティブ日数・承認者)はアカウント単位の handover_settings を共通で使う。
create or replace function public.get_handover_status(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
  v_has_recipient boolean := false;
  v_settings record;
  v_owner_user_id uuid;
  v_recipient_name text;
  v_last_active timestamptz;
  v_inactive_days numeric;
  v_condition_met boolean;
  v_requires_approval boolean;
  v_unlocked boolean;
  v_result jsonb;
  v_will jsonb;
begin
  select * into v_recipient from public.handover_recipients where share_token = p_token;
  if found then
    v_has_recipient := true;
    v_owner_user_id := v_recipient.user_id;
    v_recipient_name := v_recipient.name;
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
  v_condition_met := v_inactive_days >= v_settings.inactive_days;
  v_requires_approval := v_settings.approver_family_member_id is not null and v_settings.approved_at is null;
  v_unlocked := v_condition_met and not v_requires_approval;

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
      'requiresApproval', false,
      'inactiveDays', floor(v_inactive_days),
      'thresholdDays', v_settings.inactive_days,
      'recipientName', v_recipient_name,
      'will', v_will,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'category_major', category_major, 'disposition', disposition)), '[]'::jsonb) from public.items where user_id = v_owner_user_id),
      'digitalItems', (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'item_type', item_type)), '[]'::jsonb) from public.digital_items where user_id = v_owner_user_id),
      'checklistProgress', (select coalesce(jsonb_object_agg(procedure_key, done), '{}'::jsonb) from public.inheritance_checklist_progress where user_id = v_owner_user_id)
    );
  else
    v_result := jsonb_build_object(
      'found', true,
      'unlocked', false,
      'conditionMet', v_condition_met,
      'requiresApproval', v_requires_approval,
      'inactiveDays', floor(v_inactive_days),
      'thresholdDays', v_settings.inactive_days,
      'recipientName', v_recipient_name
    );
  end if;

  return v_result;
end;
$$;

grant execute on function public.get_handover_status(text) to anon, authenticated;

notify pgrst, 'reload schema';

