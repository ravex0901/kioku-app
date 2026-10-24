-- アルバムを複数作れるようにする(albums テーブル + album_photos.album_id)
create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists albums_user_id_idx on public.albums(user_id);
grant select, insert, update, delete on public.albums to authenticated;
alter table public.albums enable row level security;

create policy "albums_select_own" on public.albums for select using (auth.uid() = user_id);
create policy "albums_insert_own" on public.albums for insert with check (auth.uid() = user_id);
create policy "albums_update_own" on public.albums for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "albums_delete_own" on public.albums for delete using (auth.uid() = user_id);

alter table public.album_photos
  add column if not exists album_id uuid references public.albums(id) on delete cascade;
create index if not exists album_photos_album_id_idx on public.album_photos(album_id);

-- 既存の写真は、ユーザーごとに「マイアルバム」にまとめる
insert into public.albums (user_id, name)
select distinct user_id, 'マイアルバム' from public.album_photos where album_id is null;

update public.album_photos p
set album_id = a.id
from public.albums a
where p.album_id is null and a.user_id = p.user_id and a.name = 'マイアルバム';
