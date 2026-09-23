"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { askAboutItems, type ReferencedItem } from "@/app/actions/ai";
import { speakText } from "@/lib/voicePreference";

type ChatTurn = {
  id: string;
  question: string;
  answer: string | null;
  referencedItems: ReferencedItem[];
  error: string | null;
  loading: boolean;
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
 * 「AIと会話する」機能。
 * テキスト入力(必須)+ 対応ブラウザでは音声入力(Web Speech API)で質問し、
 * 登録済みの持ち物データをもとにAIが回答する。やり取りは会話形式(複数ターン)で
 * 画面に積み重なって表示され、回答はチェックを入れると音声で読み上げられる
 * (読み上げに使う声は設定画面のVoiceSettingsで選べる)。
 */
export function AiVoiceCard() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const speechSupported =
    typeof window !== "undefined" &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown })
          .webkitSpeechRecognition
    );

  // 会話形式(複数ターンの質問・回答をまとめて表示)。1回ごとの回答は
  // 引き続き登録済みデータのみを根拠に生成されるが、画面上は会話のように
  // やり取りが積み重なっていく。
  async function handleAsk(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    const turnId = crypto.randomUUID();
    setLoading(true);
    setQuestion("");
    setTurns((prev) => [
      ...prev,
      {
        id: turnId,
        question: trimmed,
        answer: null,
        referencedItems: [],
        error: null,
        loading: true,
      },
    ]);
    try {
      const result = await askAboutItems(trimmed);
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? result.ok
              ? {
                  ...t,
                  answer: result.answer,
                  referencedItems: result.referencedItems,
                  loading: false,
                }
              : { ...t, error: result.error, loading: false }
            : t
        )
      );
      if (result.ok && speakEnabled) {
        speakText(result.answer);
      }
    } catch {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                error: "回答の取得に失敗しました。もう一度お試しください。",
                loading: false,
              }
            : t
        )
      );
    } finally {
      setLoading(false);
    }
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
      // 話し終えて結果が確定した時点で、ブラウザの無音検出を待たずに
      // すぐマイクを止める(つけっぱなしに見える問題への対応)。
      recognition.stop();
      setListening(false);
      if (transcript) {
        setQuestion(transcript);
        handleAsk(transcript);
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
    <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
          <p className="text-sm font-bold text-ink">AIと会話する</p>
          <p className="mt-1 text-xs text-ink/60">
            「押入れ、何が残ってる？」も聞けます
          </p>
        </div>
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center justify-end">
            <label className="flex items-center gap-1.5 text-xs text-ink/60">
              <input
                type="checkbox"
                checked={speakEnabled}
                onChange={(e) => setSpeakEnabled(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              回答を読み上げる
            </label>
          </div>

          {turns.length > 0 && (
            <div className="flex max-h-80 flex-col gap-3 overflow-y-auto rounded-xl bg-black/[0.02] p-3">
              {turns.map((t) => (
                <div key={t.id} className="flex flex-col gap-1.5">
                  <div className="self-end rounded-2xl rounded-br-sm bg-green-700 px-3 py-2 text-sm text-white">
                    {t.question}
                  </div>
                  {t.loading && (
                    <div className="self-start rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-xs text-ink/50 shadow-sm">
                      考え中…
                    </div>
                  )}
                  {!t.loading && t.answer && (
                    <div className="self-start rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-ink shadow-sm">
                      <p className="whitespace-pre-wrap">{t.answer}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => t.answer && speakText(t.answer)}
                          className="text-[11px] font-medium text-green-700 hover:underline"
                        >
                          🔊 読み上げる
                        </button>
                      </div>
                      {t.referencedItems.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-black/5 pt-2">
                          <span className="text-[11px] text-ink/40">根拠にした登録情報:</span>
                          {t.referencedItems.map((item) => (
                            <Link
                              key={item.id}
                              href={`/items/${item.id}`}
                              className="rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-800 hover:bg-green-100"
                            >
                              {item.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {!t.loading && t.error && (
                    <div className="self-start rounded-2xl rounded-bl-sm bg-red-50 px-3 py-2 text-xs text-red-600">
                      {t.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAsk(question);
                }
              }}
              placeholder="質問を入力(例: 寝室に何がある?)"
              className="flex-1 rounded-full border border-green-100 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400"
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
              type="button"
              onClick={() => handleAsk(question)}
              disabled={loading || !question.trim()}
              className="shrink-0 rounded-full bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:opacity-40"
            >
              {loading ? "考え中…" : "きく"}
            </button>
          </div>

          {listening && (
            <p className="text-xs text-green-700">聞き取り中です…話しかけてください</p>
          )}

          {micError && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">
              {micError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
