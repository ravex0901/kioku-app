"use client";

import { useRef, useState } from "react";
import { VOICE_CHECKIN_SLOT_LABELS } from "@/lib/constants";
import type { VoiceCheckinSlot } from "@/lib/types";

type Props = {
  slot: VoiceCheckinSlot;
  speakerName: string;
  messageText: string | null;
  audioUrl: string | null;
};

/**
 * ホーム画面に表示する、家族ボイスメッセージのカード。
 * その時間帯(お昼/夕方/夜)に家族が録音したメッセージがあれば、
 * アラームのようにここに表示され、タップで実際の録音音声を再生できる。
 */
export function VoiceCheckinCard({ slot, speakerName, messageText, audioUrl }: Props) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function handlePlay() {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
    } else {
      void audioRef.current.play();
      setPlaying(true);
    }
  }

  return (
    <div className="flex items-center gap-4 overflow-hidden rounded-[1.75rem] border border-gold/40 bg-gold/10 px-5 py-4 shadow-sm">
      <span
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold/30 text-xl"
      >
        💌
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-green-800">
          {VOICE_CHECKIN_SLOT_LABELS[slot]}のメッセージ・{speakerName}さんから
        </p>
        {messageText && (
          <p className="mt-0.5 truncate text-sm text-ink/70">{messageText}</p>
        )}
      </div>
      {audioUrl && (
        <>
          <button
            type="button"
            onClick={handlePlay}
            aria-label={playing ? "停止する" : "声を聞く"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-700 text-white shadow-sm transition hover:bg-green-800"
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
          </button>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            ref={audioRef}
            src={audioUrl}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
        </>
      )}
    </div>
  );
}
