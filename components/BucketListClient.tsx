"use client";

import { useState } from "react";
import {
  addBucketItem,
  deleteBucketItem,
  toggleBucketItem,
} from "@/app/actions/bucketList";
import type { BucketListItem } from "@/lib/types";

/**
 * やりたいことリスト(チェックボックス式)。
 * 思いついたことをどんどん追加し、やり終えたらチェックを入れるだけのシンプルな機能。
 */
export function BucketListClient({ initialItems }: { initialItems: BucketListItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doneCount = items.filter((i) => i.done).length;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    setError(null);
    const result = await addBucketItem(trimmed);
    setAdding(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTitle("");
    setItems((prev) => [result.item, ...prev]);
  }

  async function handleToggle(item: BucketListItem) {
    const nextDone = !item.done;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, done: nextDone } : i))
    );
    const result = await toggleBucketItem(item.id, nextDone);
    if (!result.ok) {
      // 失敗したら元に戻す
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, done: item.done } : i))
      );
      setError(result.error);
    }
  }

  async function handleDelete(id: string) {
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    const result = await deleteBucketItem(id);
    if (!result.ok) {
      setItems(previous);
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={handleAdd}
        className="flex items-center gap-2 rounded-[1.75rem] border border-green-100 bg-white/70 p-4 shadow-sm"
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例：富士山に登る、孫と温泉に行く"
          className="min-w-0 flex-1 rounded-full border border-green-100 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400"
          disabled={adding}
        />
        <button
          type="submit"
          disabled={adding || !title.trim()}
          className="shrink-0 rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-40"
        >
          追加する
        </button>
      </form>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">{error}</p>
      )}

      {items.length > 0 && (
        <p className="text-xs text-ink/50">
          {doneCount} / {items.length} 件、達成しました
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-[1.75rem] border border-green-100 bg-white/50 px-5 py-10 text-center text-sm text-ink/50">
          まだ何も登録されていません。やってみたいことを入力してみましょう。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-2xl border border-green-100 bg-white/70 px-4 py-3 shadow-sm"
            >
              <button
                type="button"
                onClick={() => handleToggle(item)}
                aria-pressed={item.done}
                aria-label={item.done ? "未完了に戻す" : "完了にする"}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  item.done
                    ? "border-green-600 bg-green-600 text-white"
                    : "border-black/20 text-transparent"
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path
                    d="M5 13l4 4L19 7"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <span
                className={`flex-1 text-sm ${
                  item.done ? "text-ink/35 line-through" : "text-ink"
                }`}
              >
                {item.title}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                aria-label="削除する"
                className="shrink-0 rounded-full p-1.5 text-ink/30 transition hover:bg-red-50 hover:text-red-500"
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
