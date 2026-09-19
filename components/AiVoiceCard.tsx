"use client";

import { useState } from "react";

/**
 * 「AIに話しかける」は将来提供予定のコンセプト機能。
 * 現時点では音声認識の実装がないため、押されたら準備中であることを
 * その場で伝える(押しても何も起きないという状態をなくす)。
 */
export function AiVoiceCard() {
  const [showNotice, setShowNotice] = useState(false);

  return (
    <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setShowNotice((v) => !v)}
        className="flex w-full items-center gap-4 text-left"
      >
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-700"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path
              d="M12 15a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"
              stroke="currentColor"
              strokeWidth={1.6}
            />
            <path
              d="M7 11v1a5 5 0 0 0 10 0v-1M12 19v2"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div className="flex-1">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            AIに話しかける
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-gold">
              コンセプト
            </span>
          </p>
          <p className="mt-1 text-xs text-ink/60">
            「押入れ、何が残ってる？」も音声で聞けます
          </p>
        </div>
      </button>
      {showNotice && (
        <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-xs text-green-700">
          この機能は準備中です。今後のアップデートでご利用いただけるようになります。
        </p>
      )}
    </div>
  );
}

