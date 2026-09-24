-- カスタム音声(AIクローン)機能。
-- ユーザーが録音した音声サンプルをもとに、外部音声合成サービス(ElevenLabs等)で
-- 音声クローンを作成し、AIの回答読み上げに使えるようにする。
-- 実際のクローン作成・音声合成APIの呼び出しは app/actions/voice.ts が担い、
-- ここではそのための保存先テーブルと、録音音声のアップロード先バケットのみを用意する。

create table if not exists public.voice_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'elevenlabs',
  external_voice_id text,
  sample_storage_path text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.voice_profiles to authenticated;

alter table public.voice_profiles enable row level security;

drop policy if exists "voice_profiles_select_own" on public.voice_profiles;
create policy "voice_profiles_select_own"
  on public.voice_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "voice_profiles_insert_own" on public.voice_profiles;
create policy "voice_profiles_insert_own"
  on public.voice_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "voice_profiles_update_own" on public.voice_profiles;
create policy "voice_profiles_update_own"
  on public.voice_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "voice_profiles_delete_own" on public.voice_profiles;
create policy "voice_profiles_delete_own"
  on public.voice_profiles for delete
  using (auth.uid() = user_id);

-- 録音した音声サンプルのアップロード先(非公開バケット)。
-- item-media バケットと同様に、各ユーザーは自分の user_id フォルダ配下のみ読み書きできる。
insert into storage.buckets (id, name, public)
values ('voice-samples', 'voice-samples', false)
on conflict (id) do nothing;

drop policy if exists "voice_samples_select_own" on storage.objects;
create policy "voice_samples_select_own"
  on storage.objects for select
  using (bucket_id = 'voice-samples' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "voice_samples_insert_own" on storage.objects;
create policy "voice_samples_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'voice-samples' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "voice_samples_update_own" on storage.objects;
create policy "voice_samples_update_own"
  on storage.objects for update
  using (bucket_id = 'voice-samples' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "voice_samples_delete_own" on storage.objects;
create policy "voice_samples_delete_own"
  on storage.objects for delete
  using (bucket_id = 'voice-samples' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
