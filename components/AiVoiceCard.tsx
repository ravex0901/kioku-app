"use client";

import { useRef, useState } from "react";
import { askAboutItems } from "@/app/actions/ai";

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
 * 「AIに話しかける」機能。
 * テキスト入力(必須)+ 対応ブラウザでは音声入力(Web Speech API)で質問し、
 * 登録済みの持ち物データをもとにAIが回答する。
 */
export function AiVoiceCard() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const speechSupported =
    typeof window !== "undefined" &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown })
          .webkitSpeechRecognition
    );

  async function handleAsk(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const result = await askAboutItems(trimmed);
      if (result.ok) {
        setAnswer(result.answer);
      } else {
        setError(result.error);
      }
    } catch {
      setError("回答の取得に失敗しました。もう一度お試しください。");
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
      setError("音声を認識できませんでした。もう一度お試しください。");
    };
    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    setListening(true);
    setError(null);
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
          <p className="text-sm font-bold text-ink">AIに話しかける</p>
          <p className="mt-1 text-xs text-ink/60">
            「押入れ、何が残ってる？」も聞けます
          </p>
        </div>
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-3">
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

          {loading && (
            <p className="rounded-xl bg-green-50 px-4 py-3 text-xs text-green-700">
              持ち物データを確認して考えています…
            </p>
          )}

          {!loading && answer && (
            <p className="whitespace-pre-wrap rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
              {answer}
            </p>
          )}

          {!loading && error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
