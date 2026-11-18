-- 家族が日記の音声を聞けるようにする(2026-11-18)
--
-- これまで journal-audio は本人しか読めず、家族が「日記を見る」を開いても録音だけの日記は中身が出なかった。
-- 文字の日記と同じ判定(can_view_family_content の 'journal')で、家族にも読み取りを許す。
-- 直接の家族は読める / 離縁した相手は読めない / 間接の家族は本人が共有をオンにしたときだけ。
-- 既存のポリシー・ファイルは変えない(読み取りの決まりを 1 つ足すだけ)。

create or replace function public.can_view_family_journal_audio(p_folder text, p_viewer_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  return public.can_view_family_content(p_folder::uuid, p_viewer_id, 'journal');
exception when others then
  return false;
end;
$function$;
revoke execute on function public.can_view_family_journal_audio(text, uuid) from public, anon;
grant execute on function public.can_view_family_journal_audio(text, uuid) to authenticated, service_role;

drop policy if exists journal_audio_select_family on storage.objects;
create policy journal_audio_select_family on storage.objects
  for select to authenticated
  using (
    bucket_id = 'journal-audio'
    and public.can_view_family_journal_audio((storage.foldername(name))[1], auth.uid())
  );
