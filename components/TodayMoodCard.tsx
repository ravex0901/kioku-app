"use client";

import { useState } from "react";
import { setTodayMood } from "@/app/actions/mood";
import type { MoodValue } from "@/lib/types";

const MOOD_OPTIONS: { value: MoodValue; emoji: string; label: string }[] = [
  { value: "good", emoji: "😊", label: "いい" },
  { value: "normal", emoji: "😐", label: "ふつう" },
  { value: "bad", emoji: "😟", label: "よくない" },
];

/**
 * 今日の調子ボタン。にこちゃんマークで「いい・ふつう・よくない」を
 * 1日1回選べる、ホーム画面の小さなカード。家族が様子を気にかけるきっかけになる。
 */
export function TodayMoodCard({ initialMood }: { initialMood: MoodValue | null }) {
  const [mood, setMood] = useState<MoodValue | null>(initialMood);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(value: MoodValue) {
    if (saving) return;
    const previous = mood;
    setMood(value);
    setSaving(true);
    setError(null);
    const result = await setTodayMood(value);
    setSaving(false);
    if (!result.ok) {
      setMood(previous);
      setError(result.error);
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-green-100 bg-white/70 px-5 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">今日の調子は？</p>
          <p className="mt-0.5 text-xs text-ink/50">
            {mood ? "今日の記録、ありがとうございます" : "気分のボタンをひとつ押してください"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {MOOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt.value)}
              disabled={saving}
              aria-pressed={mood === opt.value}
              aria-label={opt.label}
              className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl shadow-sm transition disabled:opacity-60 ${
                mood === opt.value
                  ? "bg-green-700 ring-2 ring-green-300"
                  : "bg-green-50 hover:bg-green-100"
              }`}
            >
              {opt.emoji}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
