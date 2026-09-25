"use client";

import { useEffect, useRef, useState } from "react";
import { submitJournalAnswer } from "@/app/actions/journal";
import type { JournalEntry } from "@/lib/types";

const MAX_MS = 120000; // 最大2分

/**
 * 「AIと日記」機能の画面。今週の質問にテキストか声で答えると、
 * これまでの記録として下に蓄積されていく。
 */
export function JournalClient({
  currentEntry,
  history,
  audioMap,
}: {
  currentEntry: JournalEntry | null;
  history: JournalEntry[];
  audioMap: Record<string, string>;
}) {
  const [answerText, setAnswerText] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const blobRef = useRef<Blob | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  async function startRecording() {
    setError(null);
    setPreviewUrl(null);
    blobRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        blobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_MS) stopRecording();
      }, 200);
    } catch {
      setError(
        "マイクにアクセスできませんでした。ブラウザの権限設定をご確認ください。"
      );
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function discardRecording() {
    blobRef.current = null;
    setPreviewUrl(null);
  }

  async function handleSubmit() {
    if (!currentEntry) return;
    if (!answerText.trim() && !blobRef.current) {
      setError("テキストか声のどちらかで答えてください。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("answerText", answerText.trim());
      if (blobRef.current) {
        formData.append("audio", blobRef.current, "answer.webm");
      }
      const result = await submitJournalAnswer(currentEntry.id, formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setDone(true);
      }
    } catch {
      setError("保存に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-6 shadow-sm">
        <p className="text-xs font-semibold tracking-widest text-green-700/70">
          今週の質問
        </p>

        {currentEntry && !done ? (
          <>
            <p className="mt-3 font-serif-jp text-lg font-bold leading-relaxed text-ink">
              {currentEntry.question}
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                rows={4}
                placeholder="思い出したことを書いてみましょう…"
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
              />

              <div className="flex flex-wrap items-center gap-2">
                {!recording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={submitting}
                    className="rounded-full bg-green-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-800 disabled:opacity-50"
                  >
                    声で話す
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
                  >
                    録音を止める({Math.floor(elapsedMs / 1000)}秒)
                  </button>
                )}
                {previewUrl && (
                  <button
                    type="button"
                    onClick={discardRecording}
                    disabled={submitting}
                    className="rounded-full border border-black/10 px-4 py-2 text-xs text-ink/60 transition hover:bg-black/5"
                  >
                    録音をやり直す
                  </button>
                )}
              </div>

              {previewUrl && (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <audio src={previewUrl} controls className="w-full" />
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="self-start rounded-full bg-green-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:opacity-50"
              >
                {submitting ? "保存中…" : "記録する"}
              </button>
            </div>
          </>
        ) : (
          <p className="mt-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
            今週の質問には答えました。また来週、あたらしい質問が届きます。
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold text-ink">これまでの記録</h2>
        {history.length === 0 ? (
          <p className="text-sm text-ink/50">
            まだ記録がありません。今週の質問から始めてみましょう。
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {history.map((h) => (
              <div
                key={h.id}
                className="rounded-2xl border border-green-100 bg-white/70 p-5 shadow-sm"
              >
                <p className="text-xs text-ink/40">
                  {new Date(h.answered_at ?? h.created_at).toLocaleDateString(
                    "ja-JP"
                  )}
                </p>
                <p className="mt-1 font-serif-jp text-sm font-bold text-ink">
                  {h.question}
                </p>
                {h.answer_text && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink/80">
                    {h.answer_text}
                  </p>
                )}
                {h.answer_audio_path && audioMap[h.answer_audio_path] && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <audio
                    src={audioMap[h.answer_audio_path]}
                    controls
                    className="mt-2 w-full"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
