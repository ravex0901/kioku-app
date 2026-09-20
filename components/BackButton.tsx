"use client";

import { useRouter } from "next/navigation";

// タブ(ホーム・見る/探す・記録・ご依頼・設定)から一段階以上深いページに
// 表示する、シンプルな「戻る」ボタン。履歴があればそこへ戻り、
// なければ fallbackHref (指定がなければホーム) に遷移する。
export function BackButton({
  fallbackHref = "/home",
  label = "戻る",
}: {
  fallbackHref?: string;
  label?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className="mb-3 inline-flex items-center gap-1 rounded-full py-1 pr-2 text-sm font-medium text-ink/60 transition hover:text-ink"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M15 18l-6-6 6-6"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </button>
  );
}

