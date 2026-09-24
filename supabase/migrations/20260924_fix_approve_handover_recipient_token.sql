-- get_handover_status() は共有相手ごとの handover_recipients.share_token にも
-- 対応させたが、approve_handover() 側は handover_settings.share_token しか見ておらず、
-- 共有相手専用リンクから「開示を承認する」を押すと常に失敗していたバグを修正する。
-- get_handover_status() と同じ手順で、まず handover_recipients からトークンを解決し、
-- 見つからない場合は従来通り handover_settings から解決する(後方互換)。
create or replace function public.approve_handover(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
  v_settings record;
  v_owner_user_id uuid;
  v_last_active timestamptz;
  v_inactive_days numeric;
begin
  select * into v_recipient from public.handover_recipients where share_token = p_token;
  if found then
    v_owner_user_id := v_recipient.user_id;
  else
    select * into v_settings from public.handover_settings where share_token = p_token;
    if not found then
      return false;
    end if;
    v_owner_user_id := v_settings.user_id;
  end if;

  select * into v_settings from public.handover_settings where user_id = v_owner_user_id;
  if not found then
    return false;
  end if;

  select last_active_at into v_last_active from public.profiles where id = v_owner_user_id;
  v_inactive_days := extract(epoch from (now() - coalesce(v_last_active, v_settings.updated_at))) / 86400;

  if v_inactive_days < v_settings.inactive_days then
    return false;
  end if;

  update public.handover_settings
    set approved_at = now()
    where user_id = v_owner_user_id and approved_at is null;

  return true;
end;
$$;

grant execute on function public.approve_handover(text) to anon, authenticated;

notify pgrst, 'reload schema';
