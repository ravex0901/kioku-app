"use client";

import { useRef, useState } from "react";
import { VOICE_CHECKIN_SLOT_LABELS } from "@/lib/constants";
import type { VoiceCheckinSlot } from "@/lib/types";

type Props = {
  slot: VoiceCheckinSlot;
  speakerName: string;
  messageText: string | null;
  audioUrl: string | null;
  /** 録音が登録されているか(登録はあるのに audioUrl が無い=読み込みに失敗、を見分ける) */
  hasRecording?: boolean;
};

/**
 * ホーム画面に表示する、家族ボイスメッセージのカード。
 * その時間帯(お昼/夕方/夜)に家族が登録したメッセージがあれば、
 * アラームのようにここに表示される。
 * - 録音があれば、カードのどこを押しても再生・停止できる。
 * - 文字だけのメッセージは、押すと全文が開く(押しても何も起きない状態にしない)。
 * - 再生できなかった時は、理由を画面に出す。
 */
export function VoiceCheckinCard({
  slot,
  speakerName,
  messageText,
  audioUrl,
  hasRecording = Boolean(audioUrl),
}: Props) {
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const canPlay = Boolean(audioUrl);
  const loadFailed = hasRecording && !audioUrl;

  async function handleTap() {
    setError(null);
    const el = audioRef.current;
    if (canPlay && el) {
      if (playing) {
        el.pause();
        el.currentTime = 0;
        setPlaying(false);
        return;
      }
      setOpen(true);
      try {
        await el.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
        setError(
          "この端末ではお声を再生できませんでした。ブラウザを最新にするか、別の端末でお試しください。"
        );
      }
      return;
    }
    // 録音がない/読み込めない場合は、メッセージ文の開閉だけ行う
    setOpen((v) => !v);
  }

  const hint = playing
    ? "再生中です。もう一度押すと止まります"
    : canPlay
      ? "押すとお声を聞けます"
      : messageText
        ? open
          ? "押すと閉じます"
          : "押すと全文が読めます"
        : null;

  return (
    <button
      type="button"
      onClick={handleTap}
      aria-expanded={messageText ? open : undefined}
      aria-label={`${VOICE_CHECKIN_SLOT_LABELS[slot]}のメッセージ、${speakerName}さんから。${
        canPlay ? (playing ? "押すと止まります" : "押すと再生します") : "押すと開きます"
      }`}
      className="flex w-full min-h-[4.5rem] items-center gap-4 overflow-hidden rounded-[1.75rem] border border-gold/40 bg-gold/10 px-5 py-4 text-left shadow-sm transition active:scale-[0.99] hover:bg-gold/15"
    >
      <span
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold/30 text-xl"
      >
        💌
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-green-800">
          {VOICE_CHECKIN_SLOT_LABELS[slot]}のメッセージ・{speakerName}さんから
        </span>
        {messageText && (
          <span
            className={`mt-0.5 block text-sm text-ink/70 ${open ? "whitespace-pre-wrap break-words" : "truncate"}`}
          >
            {messageText}
          </span>
        )}
        {loadFailed && (
          <span className="mt-0.5 block text-xs text-red-600" role="alert">
            録音を読み込めません。少し時間をおいて、もう一度開いてください。
          </span>
        )}
        {error && (
          <span className="mt-0.5 block text-xs text-red-600" role="alert">
            {error}
          </span>
        )}
        {hint && !error && <span className="mt-1 block text-xs text-ink/50">{hint}</span>}
      </span>
      {canPlay && (
        <>
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-700 text-white shadow-sm"
          >
            {playing ? (
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M7 5v14l12-7L7 5Z" fill="currentColor" />
              </svg>
            )}
          </span>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            ref={audioRef}
            src={audioUrl ?? undefined}
            preload="none"
            onEnded={() => setPlaying(false)}
            onPause={() => setPlaying(false)}
            onError={() => {
              setPlaying(false);
              setError(
                "この端末ではお声を再生できませんでした。ブラウザを最新にするか、別の端末でお試しください。"
              );
            }}
            className="hidden"
          />
        </>
      )}
    </button>
  );
}
