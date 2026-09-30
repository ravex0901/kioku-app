"use client";

import { useEffect, useRef, useState } from "react";
import { askTroubleConsult } from "@/app/actions/troubleConsult";

// 仮の連絡先。実際の窓口番号が決まり次第、ここ(と components/RequestClient.tsx)を差し替えてください。
const CONTACT_TEL = "0120000000";

// よくある相談のワンタップ候補。タップするとその場で相談を送信する。
const QUICK_PROMPTS = [
  "電球を交換したい",
  "重い家具を動かしたい",
  "粗大ゴミの出し方",
  "収納のコツを知りたい",
  "庭の手入れをお願いしたい",
];

type Turn = {
  id: string;
  question: string;
  answer?: string;
  needsVisit?: boolean;
  visitReason?: string | null;
  error?: string;
  loading?: boolean;
};

type SpeechRecognitionResultLike = {
  results: { [index: number]: { [index: number]: { transcript: string } } };
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

/**
 * お困りごと相談AI。
 * トップページの写真登録セクションの直下に配置する、何でも相談できるAIチャット。
 * テキスト入力に加えて(対応ブラウザでは)components/AiVoiceCard.tsx と同じ
 * Web Speech APIによる音声入力にも対応し、よくある相談はワンタップの候補
 * (QUICK_PROMPTS)から選べるようにして、手軽に・気軽に使えるようにしている。
 * AIの知識で答えられる相談はその場で回答し、電球交換・家具移動など現地対応が
 * 必要な相談には、電話でのご相談・ご依頼ページへの導線を表示する。
 */
export function TroubleConsultPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const speechSupported =
    typeof window !== "undefined" &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown })
          .webkitSpeechRecognition
    );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  async function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed || submitting) return;

    const turnId = crypto.randomUUID();
    setInput("");
    setSubmitting(true);
    setTurns((prev) => [...prev, { id: turnId, question: trimmed, loading: true }]);

    const result = await askTroubleConsult(trimmed);

    setTurns((prev) =>
      prev.map((t) =>
        t.id === turnId
          ? result.ok
            ? {
                ...t,
                answer: result.answer,
                needsVisit: result.needsVisit,
                visitReason: result.visitReason,
                loading: false,
              }
            : { ...t, error: result.error, loading: false }
          : t
      )
    );
    setSubmitting(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submit(input);
  }

  function handleQuickPrompt(text: string) {
    void submit(text);
  }

  function handleMicClick() {
    if (!speechSupported) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        }
      ).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "ja-JP";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      // 話し終えて結果が確定した時点で、無音検出を待たずにすぐマイクを止める。
      recognition.stop();
      setListening(false);
      if (transcript) {
        setInput(transcript);
        void submit(transcript);
      }
    };
    recognition.onerror = () => {
      recognition.stop();
      setListening(false);
      setMicError("音声を認識できませんでした。もう一度お試しください。");
    };
    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    setListening(true);
    setMicError(null);
    recognition.start();
  }

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-green-100 bg-white/70 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 p-5 text-left transition hover:bg-black/[0.015]"
      >
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-600 to-green-800 text-lg shadow-sm"
        >
          🛠️
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-ink">お困りごと相談</p>
            <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-semibold text-green-800">
              AIがすぐ回答
            </span>
          </div>
          <p className="mt-1 text-xs text-ink/60">
            電球交換、家具の移動…話すだけ・打つだけで相談できます
          </p>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={`h-4 w-4 shrink-0 text-ink/30 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-green-50 p-5 pt-4">
          {turns.length === 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-ink/50">
                よくある相談から選ぶか、マイクで話しかけてください
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleQuickPrompt(p)}
                    disabled={submitting}
                    className="rounded-full border border-green-100 bg-cream px-3 py-1.5 text-xs font-medium text-green-800 transition hover:bg-green-50 disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.length > 0 && (
            <div
              ref={scrollRef}
              className="flex max-h-80 flex-col gap-3 overflow-y-auto rounded-xl bg-black/[0.02] p-3"
            >
              {turns.map((turn) => (
                <div key={turn.id} className="flex flex-col gap-1.5">
                  <p className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-green-700 px-3.5 py-2 text-sm text-white shadow-sm">
                    {turn.question}
                  </p>

                  {turn.loading && (
                    <div className="flex items-center gap-1 self-start rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 shadow-sm">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-green-400 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-green-400 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-green-400" />
                    </div>
                  )}

                  {turn.error && (
                    <p className="max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-red-50 px-3.5 py-2 text-sm text-red-600 shadow-sm">
                      {turn.error}
                    </p>
                  )}

                  {turn.answer && (
                    <div className="max-w-[90%] self-start rounded-2xl rounded-bl-sm border border-green-50 bg-white px-3.5 py-3 text-sm text-ink shadow-sm">
                      <p className="whitespace-pre-wrap">{turn.answer}</p>

                      {turn.needsVisit && (
                        <div className="mt-3 flex flex-col gap-2 rounded-xl bg-gold/10 p-3">
                          <p className="text-xs font-semibold text-green-800">
                            🙋 これは人が直接お伺いした方がよさそうです
                            {turn.visitReason ? `(${turn.visitReason})` : ""}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <a
                              href={`tel:${CONTACT_TEL}`}
                              className="inline-flex items-center gap-1.5 rounded-full bg-green-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-800"
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
          )}

          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? "聞き取り中…" : "例:重い家具を動かしたい"}
              className="min-w-0 flex-1 rounded-full border border-green-100 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400"
              disabled={submitting}
            />
            {speechSupported && (
              <button
                type="button"
                onClick={handleMicClick}
                aria-pressed={listening}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                  listening
                    ? "bg-red-500 text-white"
                    : "bg-green-50 text-green-700 hover:bg-green-100"
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
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
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || !input.trim()}
              className="shrink-0 rounded-full bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:opacity-40"
            >
              相談する
            </button>
          </form>

          {listening && (
            <p className="text-xs text-green-700">聞き取り中です…話しかけてください</p>
          )}
          {micError && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">{micError}</p>
          )}
        </div>
      )}
    </div>
  );
}
