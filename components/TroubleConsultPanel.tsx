"use client";

import { useEffect, useRef, useState } from "react";
import {
  askTroubleConsult,
  getPersonalizedQuickPrompts,
  DEFAULT_QUICK_PROMPTS,
} from "@/app/actions/troubleConsult";

// 仮の連絡先。実際の窓口番号が決まり次第、ここ(と components/RequestClient.tsx)を差し替えてください。
const CONTACT_TEL = "0120000000";

type Turn = {
  id: string;
  question: string;
  answer?: string;
  needsVisit?: boolean;
  visitReason?: string | null;
  error?: string;
  loading?: boolean;
};

// SpeechRecognition の最小限の型定義(標準libにDOM型がないブラウザAPIのため独自定義)。
type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
};
type SpeechRecognitionErrorEventLike = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

// マイクのエラーコードごとに、次にどうすればよいかが伝わる案内文を出し分ける
// (itemSearch.ts の describeSearchError と同じ考え方)。
function describeMicError(code: string): string {
  switch (code) {
    case "no-speech":
      return "音声が聞き取れませんでした。マイクに向かって、もう少しはっきりお話しください。";
    case "audio-capture":
      return "マイクを利用できませんでした。マイクが接続されているかご確認ください。";
    case "not-allowed":
    case "service-not-allowed":
      return "マイクの使用が許可されていません。ブラウザの設定でマイクへのアクセスを許可してください。";
    case "network":
      return "通信状況が不安定で、音声を認識できませんでした。もう一度お試しください。";
    case "aborted":
      return "";
    default:
      return "音声を認識できませんでした。もう一度お試しください。";
  }
}

/**
 * お困りごと相談AI。
 * トップページの写真登録セクションの直下に配置する、何でも相談できるAIチャット。
 *
 * タップして開く手間をなくし、テキスト入力・大きめのマイクボタン・
 * (利用者ごとにAIが考える)ワンタップ候補を最初から画面に出しておくことで、
 * 「手軽に・すぐ使える」ことを優先したレイアウトにしている。
 *
 * マイクは continuous + interimResults を使い、無音検出による早すぎる打ち切りで
 * 発話の後半が失われる問題を避けている。話し終えたらもう一度マイクをタップして
 * 終了する(その時点までに認識できた内容を自動で送信する)、
 * ブラウザ側の無音タイムアウトで自動終了した場合もそれまでの内容を送信する、
 * という二段構えでできるだけ取りこぼしを減らしている。
 *
 * AIの知識で答えられる相談はその場で回答し、電球交換・家具移動など現地対応が
 * 必要な相談には、電話でのご相談・ご依頼ページへの導線を表示する。
 */
export function TroubleConsultPanel() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [quickPrompts, setQuickPrompts] = useState<string[]>(DEFAULT_QUICK_PROMPTS);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const lastInterimRef = useRef("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const speechSupported =
    typeof window !== "undefined" &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown })
          .webkitSpeechRecognition
    );

  // 起動時、この人の登録データの傾向に合わせてAIにワンタップ候補を考えてもらう。
  // 生成が終わるまでは静的な既定候補を表示しておき、失敗時もそのまま既定候補を使い続ける
  // (AI呼び出しの成否がホーム画面の見た目を左右しないようにする)。
  useEffect(() => {
    let cancelled = false;
    void getPersonalizedQuickPrompts().then((result) => {
      if (!cancelled && result.ok) {
        setQuickPrompts(result.prompts);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  function stopListening() {
    // stop() は認識中の内容を確定させてから onend を発火させる
    // (abort() だとその時点までの内容を破棄してしまうため使わない)。
    recognitionRef.current?.stop();
  }

  function startListening() {
    if (!speechSupported) return;

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
    // continuous + interimResults: 話している途中で無音検出により打ち切られるのを防ぎ、
    // 話し終わるまでできるだけ長く聞き続ける。話している内容はリアルタイムに
    // 入力欄へ反映し(ライブキャプション)、聞き取れているかを利用者が目で確認できるようにする。
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    finalTranscriptRef.current = "";
    lastInterimRef.current = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalTranscriptRef.current += transcript;
        } else {
          interim += transcript;
        }
      }
      lastInterimRef.current = interim;
      setInput((finalTranscriptRef.current + interim).trim());
    };

    recognition.onerror = (event) => {
      const message = describeMicError(event.error);
      if (message) setMicError(message);
    };

    recognition.onend = () => {
      setListening(false);
      // isFinal が付かないままブラウザ側の判断で終了することがあるため、
      // 確定分が空でも直近の認識中テキストがあればそれを使って送信する
      // (「たまに何も入力されない」を防ぐフォールバック)。
      const finalText = (finalTranscriptRef.current || lastInterimRef.current).trim();
      if (finalText) {
        void submit(finalText);
      }
    };

    recognitionRef.current = recognition;
    setListening(true);
    setMicError(null);
    setInput("");
    recognition.start();
  }

  function handleMicClick() {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  }

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-green-100 bg-gradient-to-b from-white to-green-50/50 shadow-sm">
      <div className="flex items-center gap-3 px-5 pb-1 pt-5">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-600 to-green-800 text-base shadow-sm"
        >
          🛠️
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-ink">お困りごと相談</p>
            <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-semibold text-green-800">
              ✨ AIがすぐ回答
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ink/60">
            電球交換、家具の移動…どんな「困った」もどうぞ
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-5 pt-3">
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

        {/* 大きめのマイクボタンを主役に、テキスト入力を隣に添える形。
            タップ1つで最初から音声入力できるようにし、「開かないと入力できない」状態を作らない。 */}
        <div className="flex items-center gap-3">
          {speechSupported && (
            <button
              type="button"
              onClick={handleMicClick}
              aria-pressed={listening}
              aria-label={listening ? "音声入力を終了する" : "音声で相談する"}
              className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full shadow-md transition ${
                listening
                  ? "bg-red-500 text-white"
                  : "bg-gradient-to-br from-green-600 to-green-800 text-white hover:brightness-110"
              }`}
            >
              {listening && (
                <span className="absolute inset-0 animate-ping rounded-full bg-red-400/60" />
              )}
              <svg viewBox="0 0 24 24" fill="none" className="relative h-7 w-7">
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

          <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-full border border-green-100 bg-white px-4 py-2.5 shadow-sm focus-within:border-green-400">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  listening ? "聞いています…話しかけてください" : "例:重い家具を動かしたい"
                }
                className="w-full min-w-0 bg-transparent text-sm text-ink outline-none"
                disabled={submitting}
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !input.trim()}
              aria-label="相談する"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-700 text-white shadow-sm transition hover:bg-green-800 disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M4 12h16M13 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </form>
        </div>

        {listening && (
          <p className="text-center text-xs font-medium text-green-700">
            🔴 聞いています…話し終えたらもう一度マイクをタップ
          </p>
        )}
        {micError && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">{micError}</p>
        )}

        {turns.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-center text-[11px] text-ink/40">よくある相談から選ぶこともできます</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {quickPrompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleQuickPrompt(p)}
                  disabled={submitting}
                  className="rounded-full border border-green-100 bg-white px-3 py-1.5 text-xs font-medium text-green-800 shadow-sm transition hover:bg-green-50 disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
