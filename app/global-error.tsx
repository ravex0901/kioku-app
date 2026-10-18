"use client";

// ルートレイアウト自体でエラーが起きた場合の最終フォールバック(app/error.tsxではキャッチできない)。
// <html>/<body> を自前で描画する必要があるため、layout.tsxを再利用せずここで完結させる。
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "0 1.5rem",
            textAlign: "center",
            backgroundColor: "#f5efe4",
            fontFamily: "sans-serif",
          }}
        >
          <h1 style={{ fontSize: "1.875rem", fontWeight: 700 }}>
            一時的な問題が発生しました
          </h1>
          <p style={{ maxWidth: "24rem", fontSize: "0.875rem", color: "#555" }}>
            通信状況などにより、正しく読み込めませんでした。お手数ですが、もう一度お試しください。
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "50px",
              borderRadius: "9999px",
              backgroundColor: "#4e7d5b",
              color: "#fff",
              padding: "0.75rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              border: "none",
            }}
          >
            もう一度試す
          </button>
        </div>
      </body>
    </html>
  );
}
