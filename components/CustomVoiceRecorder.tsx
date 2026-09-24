"use client";

import { useEffect, useRef, useState } from "react";
import {
  uploadVoiceSample,
  deleteVoiceProfile,
  getVoiceProfileStatus,
} from "@/app/actions/voice";

const MIN_MS = 8000; // 最低8秒
const MAX_MS = 60000; // 最大60秒

type Status = "loading" | "none" | "pending" | "ready" | "failed";

/**
 * AIの声の設定内にある「自分の声を録音してAIに使う」機能。
 * MediaRecorderでマイク音声を録音し、確認再生後にアップロードすると、
 * 外部音声クローンAPI(app/actions/voice.ts経由)で声のクローンが作成される。
 */
export function CustomVoiceRecorder({ onReady }: { onReady?: () => void }) {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const blobRef = useRef<Blob | null>(null);

  useEffect(() => {
    void refreshStatus();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshStatus() {
    try {
      const result = await getVoiceProfileStatus();
      setStatus(result.status);
      setErrorMessage(result.errorMessage);
      if (result.status === "ready") {
        onReady?.();
      }
    } catch {
      setStatus("none");
    }
  }

  async function startRecording() {
    setSubmitError(null);
    setPreviewUrl(null);
    blobRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        if (elapsed >= MAX_MS) {
          stopRecording();
        }
      }, 200);
    } catch {
      setSubmitError(
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

  async function handleSubmit() {
    if (!blobRef.current) return;
    if (elapsedMs < MIN_MS) {
      setSubmitError(`もう少し長く録音してください(最低${MIN_MS / 1000}秒)。`);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const formData = new FormData();
      formData.append("audio", blobRef.current, "sample.webm");
      const result = await uploadVoiceSample(formData);
      if (!result.ok) {
        setSubmitError(result.error);
        setStatus("failed");
      } else {
        setPreviewUrl(null);
        blobRef.current = null;
        await refreshStatus();
      }
    } catch {
      setSubmitError("アップロードに失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setSubmitting(true);
    try {
      await deleteVoiceProfile();
      await refreshStatus();
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return <p className="text-xs text-ink/40">読み込み中…</p>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/5 bg-white/70 p-4">
      <p className="text-sm font-semibold text-ink/80">
        自分の声を録音してAIに使う
      </p>
      <p className="text-[11px] leading-relaxed text-ink/50">
        {MIN_MS / 1000}〜{MAX_MS / 1000}秒ほど、はっきりとした声で何か話してください
        (例: 好きな本の一節を読み上げるなど)。録音した声をもとに、AIの回答読み上げを
        あなたの声で再生できるようになります。
      </p>

      {status === "ready" && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          カスタム音声の準備ができています。上の「自分の声(AIクローン)を使う」を選ぶと利用できます。
        </div>
      )}
      {status === "pending" && (
        <div className="rounded-lg bg-black/[0.03] px-3 py-2 text-xs text-ink/60">
          音声を処理しています…
        </div>
      )}
      {status === "failed" && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          音声クローンの作成に失敗しました。{errorMessage ? `(${errorMessage})` : ""}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={submitting}
            className="rounded-full bg-green-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-800 disabled:opacity-50"
          >
            録音を始める
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

        {(status === "ready" || status === "pending" || status === "failed") && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="rounded-full border border-red-200 px-4 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            削除する
          </button>
        )}
      </div>

      {previewUrl && (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={previewUrl} controls className="w-full" />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="self-start rounded-full bg-green-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-800 disabled:opacity-50"
          >
            {submitting ? "登録中…" : "この声を登録する"}
          </button>
        </div>
      )}

      {submitError && <p className="text-xs text-red-600">{submitError}</p>}
    </div>
  );
}
