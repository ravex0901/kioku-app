"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { markFamilyNotificationsRead } from "@/app/actions/familyNotifications";
import { describeFamilyNotification } from "@/components/FamilyNotificationsCard";
import type { FamilyNotification } from "@/lib/types";

// ベルのボタンから開く、ご家族からのお知らせの一覧(最新30件)。未読は目立つ色で表示する。
export function NotificationsList({
  initialNotifications,
}: {
  initialNotifications: FamilyNotification[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialNotifications);
  const [error, setError] = useState<string | null>(null);
  const unreadCount = items.filter((n) => !n.read).length;

  async function handleReadAll() {
    setError(null);
    const result = await markFamilyNotificationsRead();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    // ヘッダーのベルの未読バッジも更新する
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-green-100 bg-white/70 p-5 text-sm text-ink/60">
        まだお知らせはありません。ご家族が今日の調子・ボイスメッセージ・タイムカプセルを届けると、ここに表示されます。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {unreadCount > 0 && (
        <button
          type="button"
          onClick={handleReadAll}
          className="self-end rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm text-ink/70 transition hover:bg-black/5"
        >
          すべて確認しました
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-2">
        {items.map((n) => {
          const { text, href } = describeFamilyNotification(n);
          const body = (
            <>
              <span className="font-semibold">{n.senderName}</span>
              さんが、{text}
            </>
          );
          return (
            <li
              key={n.id}
              className={`rounded-2xl border px-4 py-3 text-sm text-ink ${
                n.read
                  ? "border-black/5 bg-white/60"
                  : "border-gold/40 bg-gold/10"
              }`}
            >
              {href ? (
                <Link href={href} className="block hover:underline">
                  {body}
                </Link>
              ) : (
                body
              )}
              <p className="mt-1 text-xs text-ink/40">
                {new Date(n.createdAt).toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
