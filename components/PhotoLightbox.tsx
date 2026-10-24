"use client";

import { useEffect, useState } from "react";

/**
 * 写真を画面いっぱいに拡大して表示し、端末に保存できるようにする。
 * 背景または「閉じる」で閉じる。
 */
export function PhotoLightbox({
  url,
  caption,
  onClose,
}: {
  url: string | null;
  caption?: string | null;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, onClose]);

  if (!url) return null;

  async function handleSave() {
    if (!url) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const ext = blob.type.includes("png")
        ? "png"
        : blob.type.includes("webp")
          ? "webp"
          : blob.type.includes("heic")
            ? "heic"
            : "jpg";
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `kioku-photo-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch {
      // 直接保存できない端末向け: 新しいタブで開く(長押しで保存できる)
      window.open(url, "_blank", "noopener,noreferrer");
      setMessage("写真を新しいタブで開きました。長押しして保存してください。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label="写真の拡大表示"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-white/90 px-5 py-2.5 text-sm font-semibold text-green-900 transition hover:bg-white disabled:opacity-60"
        >
          {saving ? "保存中…" : "この写真を保存する"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/50 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          閉じる
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={caption ?? "拡大した写真"}
          className="max-h-full max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      {message && (
        <p className="px-4 pb-4 text-center text-xs text-white/80">{message}</p>
      )}
    </div>
  );
}
