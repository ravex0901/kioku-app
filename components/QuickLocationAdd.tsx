"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Location } from "@/lib/types";

/**
 * もの登録フォームの途中で使う簡易版の場所追加。
 * 種別は room・親の場所は null 固定で作成し、詳細な設定は /locations で行う。
 * <form> をネストさせるとsubmitイベントが外側のフォームまでバブリングして
 * もの登録が意図せず走ってしまうため、あえて <form> を使わずボタンのonClickで処理する。
 */
export function QuickLocationAdd({
  userId,
  onCreated,
  onCancel,
}: {
  userId: string;
  onCreated: (location: Location) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("場所の名前を入力してください。");
      return;
    }

    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("locations")
      .insert({
        user_id: userId,
        name: trimmed,
        location_type: "room",
        parent_location_id: null,
      })
      .select()
      .single();

    setSubmitting(false);

    if (insertError || !data) {
      setError("場所の追加に失敗しました。もう一度お試しください。");
      return;
    }

    onCreated(data);
    setName("");
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-green-200 bg-green-50/60 p-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink/80">
          新しい場所の名前
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="例:2階 寝室のクローゼット"
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
        <p className="text-xs text-ink/40">
          種別や親の場所を細かく設定したい場合は、場所を管理するページから追加してください。
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={submitting}
          className="rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
        >
          {submitting ? "追加中…" : "追加する"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-4 py-2 text-sm font-medium text-ink/60 hover:bg-black/5"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
