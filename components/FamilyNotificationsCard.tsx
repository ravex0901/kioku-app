"use client";

import Link from "next/link";
import { useState } from "react";
import { markFamilyNotificationsRead } from "@/app/actions/familyNotifications";
import type { FamilyNotification } from "@/lib/types";

const MOOD_TEXT: Record<string, string> = {
  good: "「元気です」と知らせました 😊",
  normal: "「ふつうです」と知らせました 🙂",
  bad: "「あまり元気がありません」と知らせました 😟",
};

const SLOT_TEXT: Record<string, string> = {
  lunch: "お昼",
  evening: "夕方",
  night: "夜",
};

export function describeFamilyNotification(n: FamilyNotification): { text: string; href: string | null } {
  const payload = (n.payload ?? {}) as Record<string, unknown>;
  if (n.kind === "mood") {
    return {
      text: MOOD_TEXT[String(payload.mood)] ?? "今日の調子を知らせました",
      href: `/journal/view/${n.senderId}`,
    };
  }
  if (n.kind === "voice_message") {
    const slot = SLOT_TEXT[String(payload.timeSlot)] ?? "";
    return {
      text: `${slot}のボイスメッセージを届けました 🎙`,
      href: null,
    };
  }
  const title = typeof payload.title === "string" ? payload.title : "";
  return {
    text: `タイムカプセル${title ? `「${title}」` : ""}を届けました 💌`,
    href: "/capsule",
  };
}

// ホーム画面で、ご家族から届いた未読のお知らせを表示する。
export function FamilyNotificationsCard({
  initialNotifications,
}: {
  initialNotifications: FamilyNotification[];
}) {
  const [items, setItems] = useState(
    initialNotifications.filter((n) => !n.read).slice(0, 10)
  );
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function handleRead() {
    setError(null);
    const result = await markFamilyNotificationsRead();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems([]);
  }

  return (
    <div className="flex flex-col gap-3 rounded-[1.75rem] border border-green-100 bg-white/80 p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">ご家族からのお知らせ</h2>
        <button
          type="button"
          onClick={handleRead}
          className="rounded-full border border-black/10 px-4 py-1.5 text-xs text-ink/60 transition hover:bg-black/5"
        >
          確認しました
        </button>
      </div>
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
              className="rounded-2xl border border-black/5 bg-cream/60 px-4 py-3 text-sm text-ink"
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
