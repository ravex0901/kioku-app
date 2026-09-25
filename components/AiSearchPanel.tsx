"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  searchItemsByPhoto,
  searchItemsByText,
  type SearchResultItem,
} from "@/app/actions/itemSearch";
import { fileToBase64 } from "@/lib/fileToBase64";
import { resizeImageFile } from "@/lib/resizeImage";
import { formatPriceDisplay } from "@/lib/priceRange";

type Mode = "photo" | "text";

/**
 * AI検索パネル(請求項1のAI検索部・明細書図7〜9「写真で探す」に対応)。
 * 「見る・探す」画面の属性フィルタとは別に、写真またはAIが理解した検索キーワードで
 * 登録済みの遺品情報を検索する専用のUI。
 */
export function AiSearchPanel() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [textQuery, setTextQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetResults() {
    setError(null);
    setKeywords([]);
    setResults(null);
  }

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;

    resetResults();
    setMode("photo");
    setLoading(true);
    try {
      const resized = await resizeImageFile(file);
      const base64 = await fileToBase64(resized);
      const mediaType = resized.type || "image/jpeg";
      const result = await searchItemsByPhoto(base64, mediaType);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setKeywords(result.keywords);
      setResults(result.results);
    } catch {
      setError("写真での検索に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleTextSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!textQuery.trim()) return;

    resetResults();
    setMode("text");
    setLoading(true);
    try {
      const result = await searchItemsByText(textQuery);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setKeywords(result.keywords);
      setResults(result.results);
    } catch {
      setError("検索に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-green-100 bg-white/70 p-4 shadow-sm">
      <p className="text-sm font-semibold text-ink/80">✨ AIで探す</p>
      <p className="text-xs text-ink/50">
        写真を選ぶか、言葉で伝えると、AIが検索キーワードを考えて持ち物の中から探します。
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-full border border-green-300 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-100">
          📷 写真で探す
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoPick}
            className="hidden"
          />
        </label>

        <form onSubmit={handleTextSearch} className="flex min-w-[14rem] flex-1 gap-2">
          <input
            type="text"
            value={textQuery}
            onChange={(e) => setTextQuery(e.target.value)}
            placeholder="例:貴重品、キッチン用品…"
            className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-full border border-green-300 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-100"
          >
            AIで探す
          </button>
        </form>
      </div>

      {loading && (
        <p className="text-sm text-ink/50">
          {mode === "photo" ? "AIが写真を見て探しています…" : "AIが検索キーワードを考えています…"}
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {!loading && !error && results !== null && (
        <div className="flex flex-col gap-3">
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((k) => (
                <span
                  key={k}
                  className="rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-medium text-green-700"
                >
                  {k}
                </span>
              ))}
            </div>
          )}

          {results.length === 0 ? (
            <p className="rounded-xl border border-green-100 bg-cream px-4 py-3 text-sm text-ink/60">
              一致する持ち物が見つかりませんでした。
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {results.map((item) => (
                <Link
                  key={item.id}
                  href={`/items/${item.id}`}
                  className="flex flex-col overflow-hidden rounded-2xl border border-green-100 bg-white shadow-sm transition hover:shadow"
                >
                  <div className="aspect-square w-full bg-green-50">
                    {item.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.photoUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-green-300">
                        写真なし
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-2.5">
                    <span className="truncate text-xs font-medium text-ink">{item.name}</span>
                    <span className="truncate text-[11px] text-ink/50">
                      {item.categoryLabel} ・ {item.locationName}
                    </span>
                    {item.estimatedPriceRange && (
                      <span className="w-fit rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-semibold text-green-800">
                        {formatPriceDisplay(item.estimatedPriceRange)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
