"use client";

import { useRef, useState } from "react";
import {
  createAlbum,
  deleteAlbum,
  deleteAlbumPhoto,
  listAlbumPhotos,
  renameAlbum,
  uploadAlbumPhotos,
} from "@/app/actions/album";
import type { AlbumPhotoWithUrl } from "@/app/actions/album";
import type { Album } from "@/lib/types";

/**
 * アルバム機能。好きな名前のアルバムをいくつでも作れる。
 * アルバムを選ぶと、そのアルバムの写真が表示され、スマホの写真をまとめて追加できる。
 */
export function AlbumClient({
  initialAlbums,
  initialPhotos,
}: {
  initialAlbums: Album[];
  initialPhotos: AlbumPhotoWithUrl[];
}) {
  const [albums, setAlbums] = useState(initialAlbums);
  const [photos, setPhotos] = useState(initialPhotos);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = albums.find((a) => a.id === selectedId) ?? null;
  const selectedPhotos = photos.filter((p) => p.album_id === selectedId);

  async function refresh() {
    const result = await listAlbumPhotos();
    if (result.ok) {
      setAlbums(result.albums);
      setPhotos(result.photos);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    const result = await createAlbum(newName);
    setCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAlbums((prev) => [...prev, result.album]);
    setNewName("");
    setSelectedId(result.album.id);
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    const result = await renameAlbum(selected.id, renameValue);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const name = renameValue.trim();
    setAlbums((prev) =>
      prev.map((a) => (a.id === selected.id ? { ...a, name } : a))
    );
    setRenaming(false);
  }

  async function handleDeleteAlbum() {
    if (!selected) return;
    const ok = window.confirm(
      `「${selected.name}」を削除しますか?中の写真(${selectedPhotos.length}枚)もすべて削除されます。`
    );
    if (!ok) return;
    setError(null);
    const result = await deleteAlbum(selected.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAlbums((prev) => prev.filter((a) => a.id !== selected.id));
    setPhotos((prev) => prev.filter((p) => p.album_id !== selected.id));
    setSelectedId(null);
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedId) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("albumId", selectedId);
    Array.from(files).forEach((file) => formData.append("photos", file));

    const result = await uploadAlbumPhotos(formData);
    setUploading(false);
    e.target.value = "";

    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.failedCount > 0) {
      setError(
        `${result.uploadedCount}枚を保存しました(${result.failedCount}枚は失敗しました)。`
      );
    }
    await refresh();
  }

  async function handleDeletePhoto(id: string) {
    const previous = photos;
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    const result = await deleteAlbumPhoto(id);
    if (!result.ok) {
      setPhotos(previous);
      setError(result.error);
    }
  }

  const errorBox = error && (
    <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">{error}</p>
  );

  // ===== アルバムの中身 =====
  if (selected) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setRenaming(false);
              setError(null);
            }}
            className="rounded-full border border-green-200 bg-white/70 px-4 py-2 text-xs font-semibold text-green-800 transition hover:bg-green-50"
          >
            ← アルバム一覧へ
          </button>
        </div>

        <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm">
          {renaming ? (
            <form onSubmit={handleRename} className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                maxLength={40}
                className="flex-1 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-ink outline-none focus:border-green-400"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-full bg-green-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-800"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming(false)}
                  className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-ink/60"
                >
                  やめる
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif-jp text-xl font-bold text-ink">
                {selected.name}
              </h2>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRenameValue(selected.name);
                    setRenaming(true);
                  }}
                  className="rounded-full border border-green-200 px-3 py-1.5 text-xs font-semibold text-green-800 transition hover:bg-green-50"
                >
                  名前を変える
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAlbum}
                  className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                >
                  削除
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="mt-4 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-full bg-green-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17V8.5Z"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth={1.6} />
            </svg>
            {uploading ? "アップロード中…" : "スマホの写真を選んで追加する"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />
          <p className="mt-2 text-center text-[11px] text-ink/40">
            複数の写真をまとめて選ぶこともできます
          </p>
        </div>

        {errorBox}

        {selectedPhotos.length === 0 ? (
          <p className="rounded-[1.75rem] border border-green-100 bg-white/50 px-5 py-10 text-center text-sm text-ink/50">
            このアルバムにはまだ写真がありません。上のボタンから追加してみましょう。
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {selectedPhotos.map((photo) => (
              <div
                key={photo.id}
                className="group relative aspect-square overflow-hidden rounded-2xl border border-green-100 bg-green-50 shadow-sm"
              >
                {photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.url}
                    alt={photo.caption ?? "アルバムの写真"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-green-300">
                    読み込めません
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleDeletePhoto(photo.id)}
                  aria-label="削除する"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                    <path
                      d="M6 6l12 12M18 6 6 18"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ===== アルバム一覧 =====
  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={handleCreate}
        className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm"
      >
        <p className="mb-2 text-sm font-semibold text-ink">新しいアルバムを作る</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={40}
            placeholder="例:家族旅行、孫の成長、思い出の写真"
            className="flex-1 rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="shrink-0 rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:opacity-40"
          >
            {creating ? "作成中…" : "作る"}
          </button>
        </div>
      </form>

      {errorBox}

      {albums.length === 0 ? (
        <p className="rounded-[1.75rem] border border-green-100 bg-white/50 px-5 py-10 text-center text-sm text-ink/50">
          まだアルバムがありません。上で名前をつけて作ってみましょう。
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {albums.map((album) => {
            const albumPhotos = photos.filter((p) => p.album_id === album.id);
            const cover = albumPhotos.find((p) => p.url)?.url ?? null;
            return (
              <button
                key={album.id}
                type="button"
                onClick={() => {
                  setSelectedId(album.id);
                  setError(null);
                }}
                className="overflow-hidden rounded-2xl border border-green-100 bg-white/70 text-left shadow-sm transition hover:border-green-300"
              >
                <div className="aspect-square bg-green-50">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-green-300">
                      写真なし
                    </div>
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <p className="truncate text-sm font-semibold text-ink">
                    {album.name}
                  </p>
                  <p className="text-[11px] text-ink/50">{albumPhotos.length}枚</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
