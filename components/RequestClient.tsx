"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SERVICE_TYPE_OPTIONS } from "@/lib/constants";
import type { ServiceType } from "@/lib/types";

type TargetItem = {
  id: string;
  name: string;
};

export function RequestClient({
  userId,
  targetItems,
}: {
  userId: string;
  targetItems: TargetItem[];
}) {
  const [selected, setSelected] = useState<ServiceType>("all_in_one");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("service_requests")
      .insert({
        user_id: userId,
        service_type: selected,
        note: note.trim() || null,
      });
    setSubmitting(false);

    if (insertError) {
      setError("送信に失敗しました。時間をおいて再度お試しください。");
      return;
    }
    setDone(true);
    setNote("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {SERVICE_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSelected(opt.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              selected === opt.value
                ? "bg-green-700 text-white"
                : "bg-white/70 text-ink/60 hover:bg-black/5"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-base font-bold text-ink">サービスを選択</h2>
        <div className="flex flex-col gap-3">
          {SERVICE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelected(opt.value)}
              className={`rounded-2xl border p-4 text-left transition ${
                selected === opt.value
                  ? "border-green-600 bg-green-50/70 ring-1 ring-green-200"
                  : "border-green-100 bg-white/70 hover:bg-black/[0.02]"
              }`}
            >
              <p className="font-semibold text-ink">{opt.label}</p>
              {selected === opt.value && (
                <p className="mt-1 text-sm text-ink/60">{opt.description}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href="tel:0120000000"
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-black/10 bg-white/70 px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-black/5"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path
              d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5L16 13l4 1.5v3a2 2 0 0 1-2 2C11 19.5 4.5 13 4.5 6a2 2 0 0 1 2-2Z"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
          </svg>
          電話予約する
        </a>
        <a
          href="https://line.me/"
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-green-600 px-5 py-2.5 text-sm font-semibold text-green-700 transition hover:bg-green-50"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path
              d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1 0-2-.2-2.9-.5L5 20l1-3.6C4.7 15 4 13.6 4 12Z"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
          </svg>
          LINE予約する
        </a>
      </div>
      <p className="-mt-3 text-xs text-ink/40">
        ※電話番号・LINEは仮の連絡先です。実際の窓口に差し替えてください。
      </p>

      <div>
        <h2 className="mb-2 text-base font-bold text-ink">
          対象のもの(「手放す」に設定済み)
        </h2>
        {targetItems.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-green-200 bg-white/50 p-4 text-sm text-ink/60">
            「手放す」に設定したものがまだありません。見る・探すから方針を設定できます。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {targetItems.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-green-100 bg-white/70 px-4 py-2.5 text-sm text-ink"
              >
                {item.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink/80">
          ご要望・補足(任意)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="例:平日の午前中に来てほしい など"
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && (
        <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
          ご依頼を受け付けました。追ってご連絡します。
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="rounded-full bg-green-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-60"
      >
        {submitting ? "送信中…" : "この内容でご依頼する"}
      </button>
    </div>
  );
}

