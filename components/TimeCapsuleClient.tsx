"use client";

import { useEffect, useRef, useState } from "react";
import { createTimeCapsule } from "@/app/actions/timeCapsule";
import type { TimeCapsule } from "@/lib/types";

const MAX_MS = 120000; // 最大2分

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

function minOpenDate() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function TimeCapsuleClient({
  locked,
  unlocked,
  audioMap,
}: {
  locked: TimeCapsule[];
  unlocked: TimeCapsule[];
  audioMap: Record<string, string>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [messageText, setMessageText] = useState("");
  const [openAt, setOpenAt] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [openedIds, setOpenedIds] = useState<Set<string>>(new Set());

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

  function resetForm() {
    setTitle("");
    setRecipientName("");
    setMessageText("");
    setOpenAt("");
    discardRecording();
  }

  async function handleSubmit() {
    if (!title.trim()) {
      setError("タイトルを入力してください。");
      return;
    }
    if (!openAt) {
      setError("開封日を指定してください。");
      return;
    }
    if (!messageText.trim() && !blobRef.current) {
      setError("テキストか声のどちらかでメッセージを残してください。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("recipientName", recipientName.trim());
      formData.append("messageText", messageText.trim());
      formData.append("openAt", openAt);
      if (blobRef.current) {
        formData.append("audio", blobRef.current, "message.webm");
      }
      const result = await createTimeCapsule(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setDone(true);
        resetForm();
      }
    } catch {
      setError("保存に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleOpen(id: string) {
    setOpenedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-6 shadow-sm">
        {!showForm && !done ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-green-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-green-800"
          >
            新しいタイムカプセルを残す
          </button>
        ) : done ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <p className="text-sm font-semibold text-green-700">
              タイムカプセルを残しました。指定した日まで大切に保管されます。
            </p>
            <button
              type="button"
              onClick={() => setDone(false)}
              className="text-xs text-ink/50 underline underline-offset-2"
            >
              閉じる
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold tracking-widest text-green-700/70">
              新しいタイムカプセル
            </p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タイトル(例: 20歳になったあなたへ)"
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
            <input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="宛先(例: 孫のゆうたへ)・省略可"
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={4}
              placeholder="残したいメッセージを書いてみましょう…"
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
                  声で残す
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

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-ink/60">
                開封日
              </label>
              <input
                type="date"
                value={openAt}
                min={minOpenDate()}
                onChange={(e) => setOpenAt(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-full bg-green-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:opacity-50"
              >
                {submitting ? "保存中…" : "封をする"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                  setError(null);
                }}
                disabled={submitting}
                className="rounded-full border border-black/10 px-4 py-2 text-xs text-ink/60 transition hover:bg-black/5"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>

      {unlocked.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink">開封できるもの</h2>
          <div className="flex flex-col gap-4">
            {unlocked.map((c) => {
              const isOpen = openedIds.has(c.id);
              return (
                <div
                  key={c.id}
                  className="rounded-2xl border border-gold/40 bg-white/70 p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-ink/40">
                        開封日 {formatDate(c.open_at)}
                      </p>
                      <p className="mt-1 font-serif-jp text-base font-bold text-ink">
                        {c.title}
                      </p>
                      {c.recipient_name && (
                        <p className="text-xs text-ink/50">
                          宛先: {c.recipient_name}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleOpen(c.id)}
                      className="shrink-0 rounded-full bg-gold/20 px-4 py-2 text-xs font-semibold text-green-800 transition hover:bg-gold/30"
                    >
                      {isOpen ? "閉じる" : "開封する"}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="mt-3 border-t border-black/5 pt-3">
                      {c.message_text && (
                        <p className="whitespace-pre-wrap text-sm text-ink/80">
                          {c.message_text}
                        </p>
                      )}
                      {c.message_audio_path &&
                        audioMap[c.message_audio_path] && (
                          // eslint-disable-next-line jsx-a11y/media-has-caption
                          <audio
                            src={audioMap[c.message_audio_path]}
                            controls
                            className="mt-2 w-full"
                          />
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-bold text-ink">ロック中</h2>
        {locked.length === 0 ? (
          <p className="text-sm text-ink/50">
            ロック中のタイムカプセルはありません。
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {locked.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-4 rounded-2xl border border-black/5 bg-black/[0.02] p-5"
              >
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink/40"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                    <rect
                      x="5"
                      y="10.5"
                      width="14"
                      height="9"
                      rx="1.6"
                      stroke="currentColor"
                      strokeWidth={1.6}
                    />
                    <path
                      d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
                      stroke="currentColor"
                      strokeWidth={1.6}
                    />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif-jp text-sm font-bold text-ink">
                    {c.title}
                  </p>
                  <p className="text-xs text-ink/50">
                    {formatDate(c.open_at)}に開封できます(あと
                    {daysUntil(c.open_at)}日)
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
