"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DispositionBadge } from "@/components/DispositionBadge";
import {
  CATEGORY_OPTIONS,
  DISPOSITION_OPTIONS,
  ITEM_STATUS_BADGE_STYLE,
  ITEM_STATUS_OPTIONS,
  labelFor,
} from "@/lib/constants";
import { formatPriceDisplay } from "@/lib/priceRange";
import type { CategoryMajor, Disposition, ItemStatus } from "@/lib/types";

type GridItem = {
  id: string;
  name: string;
  category_major: CategoryMajor | null;
  disposition: Disposition | null;
  status: ItemStatus | null;
  estimated_price_range: string | null;
  professional_appraisal: string | null;
  photo_url: string | null;
  location: { name: string } | { name: string }[] | null;
};

// 「見る・探す」の一覧。通常時はタップで詳細ページへ、
// 「選択する」モードでは複数選択してまとめて査定依頼・整理方針の変更ができる
// (個別の「査定を依頼する」ボタンの代わり)。
export function ItemsBulkGrid({
  userId,
  items,
  photoMap,
  locationLabel,
}: {
  userId: string;
  items: GridItem[];
  photoMap: Record<string, string>;
  locationLabel: (item: GridItem) => string;
}) {
  const router = useRouter();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [bulkDisposition, setBulkDisposition] = useState<Disposition>(
    DISPOSITION_OPTIONS[0].value
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
    setMessage(null);
  }

  async function handleBulkAppraisal() {
    if (selected.size === 0) return;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const ids = Array.from(selected);
    const targetItems = items.filter((i) => ids.includes(i.id));

    const { error } = await supabase.from("service_requests").insert(
      targetItems.map((item) => ({
        user_id: userId,
        service_type: "appraisal" as const,
        item_id: item.id,
        note: `「${item.name}」の査定依頼(AI概算:${
          formatPriceDisplay(item.estimated_price_range) ?? "―"
        })`,
      }))
    );

    if (error) {
      setBusy(false);
      setMessage("査定の依頼に失敗しました。もう一度お試しください。");
      return;
    }

    const pendingIds = targetItems
      .filter((i) => (i.status ?? "photo_registered") === "photo_registered")
      .map((i) => i.id);
    if (pendingIds.length > 0) {
      await supabase
        .from("items")
        .update({ status: "appraisal_pending" })
        .in("id", pendingIds);
    }

    setBusy(false);
    setMessage(`${ids.length}件の査定をまとめて依頼しました。`);
    router.refresh();
  }

  async function handleBulkDisposition() {
    if (selected.size === 0) return;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const ids = Array.from(selected);

    const { error } = await supabase
      .from("items")
      .update({ disposition: bulkDisposition })
      .in("id", ids);

    setBusy(false);
    if (error) {
      setMessage("整理の方針の一括変更に失敗しました。もう一度お試しください。");
      return;
    }
    setMessage(`${ids.length}件の整理の方針を変更しました。`);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-ink/50">
          {selectMode ? `${selected.size}件を選択中` : `${items.length}件`}
        </div>
        {selectMode ? (
          <button
            type="button"
            onClick={exitSelectMode}
            className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:bg-black/5"
          >
            選択をやめる
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="rounded-full border border-green-600 px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-50"
          >
            選択する
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-green-100 bg-white/70 p-8 text-center text-sm text-ink/60">
          条件に一致するものが見つかりませんでした。
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => {
            const isChecked = selected.has(item.id);
            const card = (
              <div className="flex flex-col overflow-hidden rounded-2xl border border-green-100 bg-white/70 shadow-sm transition hover:shadow">
                <div className="relative aspect-square w-full bg-green-50">
                  {item.photo_url && photoMap[item.photo_url] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoMap[item.photo_url]}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-green-300">
                      写真なし
                    </div>
                  )}
                  {selectMode && (
                    <div
                      className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${
                        isChecked
                          ? "border-green-600 bg-green-600 text-white"
                          : "border-white bg-white/70 text-transparent"
                      }`}
                    >
                      ✓
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <span className="truncate text-sm font-medium text-ink">
                    {item.name}
                  </span>
                  <span className="truncate text-xs text-ink/50">
                    {labelFor(CATEGORY_OPTIONS, item.category_major)} ・{" "}
                    {locationLabel(item)}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <DispositionBadge disposition={item.disposition} />
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        ITEM_STATUS_BADGE_STYLE[item.status ?? "photo_registered"]
                      }`}
                    >
                      {labelFor(ITEM_STATUS_OPTIONS, item.status ?? "photo_registered")}
                    </span>
                    {item.estimated_price_range && (
                      <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-semibold text-green-800">
                        {formatPriceDisplay(item.estimated_price_range)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );

            if (selectMode) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item.id)}
                  className={`rounded-2xl text-left ${
                    isChecked ? "ring-2 ring-green-600" : ""
                  }`}
                >
                  {card}
                </button>
              );
            }

            return (
              <Link key={item.id} href={`/items/${item.id}`}>
                {card}
              </Link>
            );
          })}
        </div>
      )}

      {selectMode && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-20 mx-auto flex max-w-5xl flex-col gap-2 px-4 sm:px-6">
          <div className="flex flex-col gap-2 rounded-2xl border border-green-200 bg-white p-3 shadow-lg sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleBulkAppraisal}
              disabled={busy}
              className="rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
            >
              {busy ? "処理中…" : `選択した${selected.size}件の査定をまとめて依頼する`}
            </button>
            <div className="flex items-center gap-2">
              <select
                value={bulkDisposition}
                onChange={(e) => setBulkDisposition(e.target.value as Disposition)}
                className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm"
              >
                {DISPOSITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleBulkDisposition}
                disabled={busy}
                className="rounded-full border border-green-600 px-4 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-50 disabled:opacity-60"
              >
                に一括変更
              </button>
            </div>
          </div>
          {message && (
            <p className="rounded-xl bg-white px-3 py-2 text-xs text-ink/70 shadow">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

