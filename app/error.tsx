"use client";

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
          onClick={() => reset()}
          className="rounded-full bg-green-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-green-800"
        >
          もう一度試す
        </button>
        <a
          href="/home"
          className="rounded-full border border-black/10 px-6 py-3 text-sm font-medium text-ink/70 transition hover:bg-black/5"
        >
          ホームに戻る
        </a>
      </div>
    </div>
  );
}
