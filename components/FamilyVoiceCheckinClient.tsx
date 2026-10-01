"use client";

import { useEffect, useRef, useState } from "react";
import { saveFamilyVoiceCheckin } from "@/app/actions/voiceCheckins";
import { VOICE_CHECKIN_SLOT_LABELS } from "@/lib/constants";
import type { VoiceCheckinSlot } from "@/lib/types";
import type { VoiceCheckinTarget } from "@/app/actions/voiceCheckins";

const SLOTS: VoiceCheckinSlot[] = ["lunch", "evening", "night"];
const MAX_MS = 30000; // 最大30秒

/**
 * 紐付け済みの家族アカウントから、本人(例: 親・祖父母)宛てに
 * お昼・夕方・夜のボイスメッセージを録音して送る画面。
 * 本人専用だった従来のボイスメッセージ機能を、家族アカウント側からも
 * 使えるようにしたもの。
 */
export function FamilyVoiceCheckinClient({
  targets,
}: {
  targets: VoiceCheckinTarget[];
}) {
  const [ownerUserId, setOwnerUserId] = useState(
    targets[0]?.ownerUserId ?? ""
  );
  const [timeSlot, setTimeSlot] = useState<VoiceCheckinSlot>("lunch");
  const [speakerName, setSpeakerName] = useState("");
  const [messageText, setMessageText] = useState("");
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
    if (!ownerUserId) {
      setError("送り先を選んでください。");
      return;
    }
    if (!speakerName.trim()) {
      setError("お名前を入力してください。");
      return;
    }
    if (!messageText.trim() && !blobRef.current) {
      setError("メッセージ文か録音のどちらかを入力してください。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("timeSlot", timeSlot);
      formData.append("speakerName", speakerName.trim());
      formData.append("messageText", messageText.trim());
      if (blobRef.current) {
        formData.append("audio", blobRef.current, "message.webm");
      }
      const result = await saveFamilyVoiceCheckin(ownerUserId, formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setDone(true);
        setMessageText("");
        discardRecording();
      }
    } catch {
      setError("保存に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  if (targets.length === 0) {
    return (
      <p className="rounded-lg bg-black/5 px-4 py-3 text-sm text-ink/50">
        まだ紐付けられたご本人のアカウントがありません。ご本人から招待リンクを受け取って、アカウントをつないでください。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-[1.75rem] border border-green-100 bg-white/70 p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-ink/60">送り先</label>
        <select
          value={ownerUserId}
          onChange={(e) => setOwnerUserId(e.target.value)}
          className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        >
          {targets.map((t) => (
            <option key={t.ownerUserId} value={t.ownerUserId}>
              {t.ownerName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-ink/60">時間帯</label>
        <div className="flex gap-2">
          {SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => setTimeSlot(slot)}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
                timeSlot === slot
                  ? "bg-green-700 text-white"
                  : "border border-black/10 text-ink/60 hover:bg-black/5"
              }`}
            >
              {VOICE_CHECKIN_SLOT_LABELS[slot]}
            </button>
          ))}
        </div>
      </div>

      <input
        value={speakerName}
        onChange={(e) => setSpeakerName(e.target.value)}
        placeholder="お名前(例: 孫のゆうた)"
        className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
      />

      <textarea
        value={messageText}
        onChange={(e) => setMessageText(e.target.value)}
        rows={3}
        placeholder="メッセージ文(任意・音声だけでも可)"
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
            声で録音する
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
      {done && (
        <p className="text-xs font-semibold text-green-700">
          送信しました。選んだ時間帯にご本人のホーム画面で再生されます。
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="self-start rounded-full bg-green-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:opacity-50"
      >
        {submitting ? "送信中…" : "送る"}
      </button>
    </div>
  );
}
