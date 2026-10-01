"use client";

import { useRef, useState } from "react";
import { deleteVoiceCheckin, saveVoiceCheckin } from "@/app/actions/voiceCheckins";
import { VOICE_CHECKIN_SLOT_LABELS } from "@/lib/constants";
import type { FamilyMember, VoiceCheckinSlot } from "@/lib/types";
import type { VoiceCheckinWithUrl } from "@/app/actions/voiceCheckins";

const SLOTS: VoiceCheckinSlot[] = ["lunch", "evening", "night"];
const MIN_MS = 3000; // 最低3秒
const MAX_MS = 30000; // 最大30秒

type SlotState = {
  speakerName: string;
  familyMemberId: string;
  messageText: string;
  recording: boolean;
  elapsedMs: number;
  previewUrl: string | null;
  saving: boolean;
  error: string | null;
  saved: boolean;
};

function initialStateFor(checkin: VoiceCheckinWithUrl | undefined): SlotState {
  return {
    speakerName: checkin?.speaker_name ?? "",
    familyMemberId: checkin?.family_member_id ?? "",
    messageText: checkin?.message_text ?? "",
    recording: false,
    elapsedMs: 0,
    previewUrl: null,
    saving: false,
    error: null,
    saved: false,
  };
}

/**
 * 家族ボイスメッセージの設定画面。
 * お昼・夕方・夜それぞれに、家族(お孫さんなど)が短い音声メッセージを録音して登録できる。
 * 本人のホーム画面では、その時間帯になると録音した声がそのまま再生される。
 */
export function VoiceCheckinsClient({
  family,
  initialCheckins,
}: {
  family: FamilyMember[];
  initialCheckins: VoiceCheckinWithUrl[];
}) {
  const [activeSlot, setActiveSlot] = useState<VoiceCheckinSlot>("lunch");
  const [states, setStates] = useState<Record<VoiceCheckinSlot, SlotState>>({
    lunch: initialStateFor(initialCheckins.find((c) => c.time_slot === "lunch")),
    evening: initialStateFor(initialCheckins.find((c) => c.time_slot === "evening")),
    night: initialStateFor(initialCheckins.find((c) => c.time_slot === "night")),
  });
  const [existingAudioUrls, setExistingAudioUrls] = useState<
    Record<VoiceCheckinSlot, string | null>
  >({
    lunch: initialCheckins.find((c) => c.time_slot === "lunch")?.audioUrl ?? null,
    evening: initialCheckins.find((c) => c.time_slot === "evening")?.audioUrl ?? null,
    night: initialCheckins.find((c) => c.time_slot === "night")?.audioUrl ?? null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const blobRef = useRef<Blob | null>(null);

  const state = states[activeSlot];

  function updateState(partial: Partial<SlotState>) {
    setStates((prev) => ({ ...prev, [activeSlot]: { ...prev[activeSlot], ...partial } }));
  }

  async function startRecording() {
    updateState({ error: null, saved: false });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        blobRef.current = blob;
        updateState({ previewUrl: URL.createObjectURL(blob) });
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      updateState({ recording: true, elapsedMs: 0 });
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        updateState({ elapsedMs: elapsed });
        if (elapsed >= MAX_MS) stopRecording();
      }, 200);
    } catch {
      updateState({ error: "マイクにアクセスできませんでした。ブラウザの権限設定をご確認ください。" });
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current?.stop();
    updateState({ recording: false });
  }

  async function handleSave() {
    const trimmedName = state.speakerName.trim();
    if (!trimmedName) {
      updateState({ error: "お名前を入力してください。" });
      return;
    }
    if (state.previewUrl && state.elapsedMs < MIN_MS) {
      updateState({ error: `もう少し長く録音してください(最低${MIN_MS / 1000}秒)。` });
      return;
    }

    updateState({ saving: true, error: null, saved: false });

    const formData = new FormData();
    formData.append("timeSlot", activeSlot);
    formData.append("speakerName", trimmedName);
    formData.append("familyMemberId", state.familyMemberId);
    formData.append("messageText", state.messageText.trim());
    if (blobRef.current) {
      formData.append("audio", blobRef.current, "sample.webm");
    }

    const result = await saveVoiceCheckin(formData);
    updateState({ saving: false });

    if (!result.ok) {
      updateState({ error: result.error });
      return;
    }

    updateState({ saved: true, previewUrl: null });
    if (state.previewUrl) {
      setExistingAudioUrls((prev) => ({ ...prev, [activeSlot]: state.previewUrl }));
    }
    blobRef.current = null;
  }

  async function handleDelete() {
    updateState({ saving: true, error: null });
    const result = await deleteVoiceCheckin(activeSlot);
    updateState({ saving: false });
    if (!result.ok) {
      updateState({ error: result.error });
      return;
    }
    setStates((prev) => ({ ...prev, [activeSlot]: initialStateFor(undefined) }));
    setExistingAudioUrls((prev) => ({ ...prev, [activeSlot]: null }));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2 rounded-full border border-green-100 bg-white/70 p-1.5 shadow-sm">
        {SLOTS.map((slot) => (
          <button
            key={slot}
            type="button"
            onClick={() => setActiveSlot(slot)}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
              activeSlot === slot
                ? "bg-green-700 text-white"
                : "text-ink/50 hover:bg-green-50"
            }`}
          >
            {VOICE_CHECKIN_SLOT_LABELS[slot]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm">
        <p className="text-xs leading-relaxed text-ink/50">
          {VOICE_CHECKIN_SLOT_LABELS[activeSlot]}の時間帯(目安: お昼11〜15時・夕方15〜19時・夜19〜23時)に、
          ホーム画面にメッセージが表示されます。録音した声がそのまま再生されます。
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink/60">お名前(例:たろう)</span>
          <input
            type="text"
            value={state.speakerName}
            onChange={(e) => updateState({ speakerName: e.target.value })}
            placeholder="例:たろう"
            className="rounded-xl border border-green-100 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400"
          />
        </label>

        {family.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink/60">家族リストから選ぶ(任意)</span>
            <select
              value={state.familyMemberId}
              onChange={(e) => updateState({ familyMemberId: e.target.value })}
              className="rounded-xl border border-green-100 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400"
            >
              <option value="">選択しない</option>
              {family.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink/60">画面に表示する文字(任意)</span>
          <input
            type="text"
            value={state.messageText}
            onChange={(e) => updateState({ messageText: e.target.value })}
            placeholder="例:お昼ごはん食べた?"
            className="rounded-xl border border-green-100 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400"
          />
        </label>

        <div>
          <span className="text-xs font-medium text-ink/60">声を録音する(任意・最大{MAX_MS / 1000}秒)</span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!state.recording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={state.saving}
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
                録音を止める({Math.floor(state.elapsedMs / 1000)}秒)
              </button>
            )}
          </div>

          {state.previewUrl && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio src={state.previewUrl} controls className="mt-3 w-full" />
          )}

          {!state.previewUrl && existingAudioUrls[activeSlot] && (
            <div className="mt-3 flex flex-col gap-1">
              <span className="text-[11px] text-ink/40">現在登録されている声</span>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio src={existingAudioUrls[activeSlot] ?? undefined} controls className="w-full" />
            </div>
          )}
        </div>

        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
        {state.saved && <p className="text-xs text-green-700">保存しました。</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={state.saving}
            className="rounded-full bg-green-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-50"
          >
            {state.saving ? "保存中…" : "この内容を保存する"}
          </button>
          {(existingAudioUrls[activeSlot] || state.messageText) && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={state.saving}
              className="rounded-full border border-red-200 px-5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              この時間帯のメッセージを削除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
