"use client";

import { useState } from "react";
import { askTroubleConsult } from "@/app/actions/troubleConsult";

// 仮の連絡先。実際の窓口番号が決まり次第、ここ(と components/RequestClient.tsx)を差し替えてください。
const CONTACT_TEL = "0120000000";

type Turn = {
  question: string;
  answer?: string;
  needsVisit?: boolean;
  visitReason?: string | null;
  error?: string;
  loading?: boolean;
};

/**
 * お困りごと相談AI。
 * トップページの写真登録セクションの直下に配置する、何でも相談できるAIチャット。
 * AIの知識で答えられる相談はその場で回答し、電球交換・家具移動など現地対応が
 * 必要な相談には、電話でのご相談・ご依頼ページへの導線を表示する。
 */
export function TroubleConsultPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || submitting) return;

    setInput("");
    setSubmitting(true);
    setTurns((prev) => [...prev, { question: trimmed, loading: true }]);

    const result = await askTroubleConsult(trimmed);

    setTurns((prev) => {
      const next = [...prev];
      const idx = next.length - 1;
      next[idx] = result.ok
        ? {
            question: trimmed,
            answer: result.answer,
            needsVisit: result.needsVisit,
            visitReason: result.visitReason,
          }
        : { question: trimmed, error: result.error };
      return next;
    });
    setSubmitting(false);
  }

  return (
    <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-lg">
            🛠️
          </span>
          <span>
            <span className="block font-serif-jp text-base font-bold text-ink">お困りごと相談</span>
            <span className="block text-xs text-ink/50">
              電球交換、家具の移動…どんな「困った」もまずはAIに相談できます
            </span>
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-green-700">{open ? "閉じる" : "相談する"}</span>
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-3">
          {turns.length === 0 && (
            <p className="rounded-xl bg-cream px-4 py-3 text-sm text-ink/60">
              例:「電球を交換したいけど脚立がなくて届かない」「粗大ゴミの出し方がわからない」
            </p>
          )}

          <div className="flex flex-col gap-3">
            {turns.map((turn, i) => (
              <div key={i} className="flex flex-col gap-2">
                <p className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-green-700 px-4 py-2 text-sm text-cream">
                  {turn.question}
                </p>

                {turn.loading && <p className="text-sm text-ink/50">AIが考えています…</p>}

                {turn.error && (
                  <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{turn.error}</p>
                )}

                {turn.answer && (
                  <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-green-100 bg-white px-4 py-3 text-sm text-ink">
                    <p>{turn.answer}</p>

                    {turn.needsVisit && (
                      <div className="mt-3 flex flex-col gap-2 rounded-xl bg-gold/10 p-3">
                        <p className="text-xs font-semibold text-green-800">
                          🙋 これは人が直接お伺いした方がよさそうです
                          {turn.visitReason ? `(${turn.visitReason})` : ""}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={`tel:${CONTACT_TEL}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-green-700 px-4 py-2 text-xs font-semibold text-cream transition hover:bg-green-800"
                          >
                            📞 電話で相談する
                          </a>
                          <a
                            href="/request"
                            className="inline-flex items-center gap-1.5 rounded-full border border-green-300 bg-white px-4 py-2 text-xs font-semibold text-green-700 transition hover:bg-green-50"
                          >
                            ご依頼ページを見る
                          </a>
                        </div>
                        <p className="text-[11px] text-ink/40">
                          ※電話番号は仮の連絡先です。実際の窓口に差し替えてください。
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例:重い家具を動かしたい"
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={submitting || !input.trim()}
              className="rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-cream transition hover:bg-green-800 disabled:opacity-50"
            >
              相談する
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
