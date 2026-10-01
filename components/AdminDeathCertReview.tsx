"use client";

import { useState, useTransition } from "react";
import {
  approveDeathCertificate,
  rejectDeathCertificate,
} from "@/app/actions/adminHandover";
import type { DeathCertificateSubmission } from "@/lib/types";

type Item = {
  submission: DeathCertificateSubmission;
  ownerName: string;
  imageUrl: string | null;
};

export function AdminDeathCertReview({ items }: { items: Item[] }) {
  const [handled, setHandled] = useState<Set<string>>(new Set());

  if (items.length === 0) {
    return (
      <p className="rounded-lg bg-black/5 px-4 py-3 text-center text-sm text-ink/50">
        現在、確認待ちの提出はありません。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items
        .filter((item) => !handled.has(item.submission.id))
        .map((item) => (
          <ReviewCard
            key={item.submission.id}
            item={item}
            onHandled={() =>
              setHandled((prev) => new Set(prev).add(item.submission.id))
            }
          />
        ))}
    </div>
  );
}

function ReviewCard({ item, onHandled }: { item: Item; onHandled: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveDeathCertificate(item.submission.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onHandled();
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectDeathCertificate(item.submission.id, note);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onHandled();
    });
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-ink">{item.ownerName} さんの件</p>
        <p className="text-xs text-ink/40">
          {new Date(item.submission.submitted_at).toLocaleString("ja-JP")}
        </p>
      </div>
      <p className="mb-3 text-xs text-ink/60">
        提出者: {item.submission.recipient_name || "(未入力)"}
      </p>
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
         alt="提出された死亡診断書・除籍謄本・死亡届記載事項証明書等の画像"
          className="mb-3 max-h-80 w-full rounded-lg border border-black/10 object-contain"
        />
      ) : (
        <p className="mb-3 text-xs text-red-500">画像を取得できませんでした。</p>
      )}
      <div className="mb-3 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-ink/70">却下理由(却下する場合)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例:画像が不鮮明なため再提出をお願いします"
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={pending}
          className="rounded-full bg-green-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
        >
          承認して開示する
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={pending}
          className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        >
          却下する
        </button>
      </div>
    </div>
  );
}
