-- 遺言(意思伝達)・もしもの時設定・相続手続きチェックリスト機能
-- Supabase の SQL Editor で1回だけ実行してください。

alter table public.profiles add column if not exists last_active_at timestamptz;

create table if not exists public.wills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  message text,
  video_url text,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.wills to authenticated;

alter table public.wills enable row level security;

drop policy if exists "wills_select_own" on public.wills;
create policy "wills_select_own"
  on public.wills for select
  using (auth.uid() = user_id);

drop policy if exists "wills_insert_own" on public.wills;
create policy "wills_insert_own"
  on public.wills for insert
  with check (auth.uid() = user_id);

drop policy if exists "wills_update_own" on public.wills;
create policy "wills_update_own"
  on public.wills for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "wills_delete_own" on public.wills;
create policy "wills_delete_own"
  on public.wills for delete
  using (auth.uid() = user_id);

create table if not exists public.handover_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  inactive_days integer not null default 14,
  approver_family_member_id uuid references public.family_members(id) on delete set null,
  share_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.handover_settings to authenticated;

alter table public.handover_settings enable row level security;

drop policy if exists "handover_settings_select_own" on public.handover_settings;
create policy "handover_settings_select_own"
  on public.handover_settings for select
  using (auth.uid() = user_id);

drop policy if exists "handover_settings_insert_own" on public.handover_settings;
create policy "handover_settings_insert_own"
  on public.handover_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "handover_settings_update_own" on public.handover_settings;
create policy "handover_settings_update_own"
  on public.handover_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "handover_settings_delete_own" on public.handover_settings;
create policy "handover_settings_delete_own"
  on public.handover_settings for delete
  using (auth.uid() = user_id);

create table if not exists public.inheritance_checklist_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  procedure_key text not null,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, procedure_key)
);

grant select, insert, update, delete on public.inheritance_checklist_progress to authenticated;

alter table public.inheritance_checklist_progress enable row level security;

drop policy if exists "checklist_progress_select_own" on public.inheritance_checklist_progress;
create policy "checklist_progress_select_own"
  on public.inheritance_checklist_progress for select
  using (auth.uid() = user_id);

drop policy if exists "checklist_progress_insert_own" on public.inheritance_checklist_progress;
create policy "checklist_progress_insert_own"
  on public.inheritance_checklist_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "checklist_progress_update_own" on public.inheritance_checklist_progress;
create policy "checklist_progress_update_own"
  on public.inheritance_checklist_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "checklist_progress_delete_own" on public.inheritance_checklist_progress;
create policy "checklist_progress_delete_own"
  on public.inheritance_checklist_progress for delete
  using (auth.uid() = user_id);

-- 家族が「もしもの時」の情報を閲覧できるかどうかを判定するRPC(共有トークンのみで認証する公開関数)
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
      'will', (select jsonb_build_object('message', message, 'video_url', video_url) from public.wills where user_id = v_settings.user_id),
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

-- 承認者が開示を承認する(非アクティブ条件を満たしている場合のみ有効)
create or replace function public.approve_handover(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_last_active timestamptz;
  v_inactive_days numeric;
begin
  select * into v_settings from public.handover_settings where share_token = p_token;
  if not found then
    return false;
  end if;

  select last_active_at into v_last_active from public.profiles where id = v_settings.user_id;
  v_inactive_days := extract(epoch from (now() - coalesce(v_last_active, v_settings.updated_at))) / 86400;

  if v_inactive_days < v_settings.inactive_days then
    return false;
  end if;

  update public.handover_settings
    set approved_at = now()
    where share_token = p_token and approved_at is null;

  return true;
end;
$$;

grant execute on function public.approve_handover(text) to anon, authenticated;

notify pgrst, 'reload schema';
