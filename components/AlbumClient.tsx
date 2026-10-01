"use client";

import { useRef, useState } from "react";
import { deleteAlbumPhoto, uploadAlbumPhotos } from "@/app/actions/album";
import type { AlbumPhotoWithUrl } from "@/app/actions/album";

/**
 * アルバム機能。スマホの写真を選ぶだけでこのシステム内にも保存しておける。
 * 複数枚まとめて選択してアップロードでき、一覧はグリッド表示される。
 */
export function AlbumClient({ initialPhotos }: { initialPhotos: AlbumPhotoWithUrl[] }) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
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

    // 一覧を再取得する代わりに、画面をリフレッシュして最新の状態を反映する
    window.location.reload();
  }

  async function handleDelete(id: string) {
    const previous = photos;
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    const result = await deleteAlbumPhoto(id);
    if (!result.ok) {
      setPhotos(previous);
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-green-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-50"
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
          {uploading ? "アップロード中…" : "スマホの写真を選んで保存する"}
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

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">{error}</p>
      )}

      {photos.length === 0 ? (
        <p className="rounded-[1.75rem] border border-green-100 bg-white/50 px-5 py-10 text-center text-sm text-ink/50">
          まだ写真がありません。上のボタンから保存してみましょう。
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo) => (
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
                onClick={() => handleDelete(photo.id)}
                aria-label="削除する"
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100"
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
