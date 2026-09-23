"use client";

import { useState } from "react";

// 各ページ配下で予期せぬエラーが発生した際の共通フォールバック画面。
// これが無いと、サーバー側の例外がブラウザ標準の無機質なエラー画面
// (「このページを読み込めませんでした」等)としてそのまま表示されてしまうため、
// ユーザーに状況が伝わり、再試行しやすい案内を出す。
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 端末のメモリ逼迫など、アプリのJS実行状態そのものが不安定な状況で
  // このエラー画面が表示された場合、reset()(Reactの再レンダリングのみ)では
  // 復帰できないことがある。その場合でもボタンが「反応しない」ように見えない
  // よう、一定時間reset()の効果が見られなければページ自体を再読み込みする。
  const [retrying, setRetrying] = useState(false);

  function handleRetry() {
    setRetrying(true);
    try {
      reset();
    } catch {
      // reset自体が投げても以下のフォールバックで復帰させる
    }
    // resetで復帰しない場合に備えた保険。正常に遷移できていれば
    // このコンポーネントはアンマウントされ、以下のタイマーは実行されない。
    window.setTimeout(() => {
      window.location.reload();
    }, 800);
  }

  function handleHome() {
    // <a href>のクライアント側ナビゲーションが固まったアプリ状態の影響を
    // 受ける可能性があるため、確実に遷移する location.href を使う。
    window.location.href = "/home";
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-6 text-center">
      <p className="text-sm font-semibold tracking-[0.15em] text-ink/40">
        きおく
      </p>
      <h1 className="font-serif-jp text-xl font-bold text-ink">
        一時的な問題が発生しました
      </h1>
      <p className="max-w-sm text-sm text-ink/60">
        通信状況などにより、正しく読み込めませんでした。お手数ですが、もう一度お試しください。
      </p>
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="rounded-full bg-green-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
        >
          {retrying ? "再読み込み中…" : "もう一度試す"}
        </button>
        <button
          type="button"
          onClick={handleHome}
          className="rounded-full border border-black/10 px-6 py-3 text-sm font-medium text-ink/70 transition hover:bg-black/5"
        >
          ホームに戻る
        </button>
      </div>
    </div>
  );
}

