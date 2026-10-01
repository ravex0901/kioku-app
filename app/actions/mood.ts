"use server";

import { createClient } from "@/lib/supabase/server";
import type { MoodValue } from "@/lib/types";

// 今日の調子ボタン機能。にこちゃんマークで「良い・普通・悪い」を
// 1日1回選べるようにし、家族が様子を気にかけるきっかけにする。

// JSTの「今日」をYYYY-MM-DD形式で返す。
function todayJstDateString(): string {
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
}

export type TodayMoodResult =
    | { ok: true; mood: MoodValue | null; date: string }
  | { ok: false; error: string };

/**
 * 今日すでに記録した調子を取得する(未記録ならmood: null)。
 */
export async function getTodayMood(): Promise<TodayMoodResult> {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const date = todayJstDateString();
    const { data, error } = await supabase
      .from("daily_mood_logs")
      .select("mood")
      .eq("user_id", user.id)
      .eq("log_date", date)
      .maybeSingle();

  if (error) {
        console.error("getTodayMood error", error);
        return { ok: false, error: "取得に失敗しました。" };
  }

  return { ok: true, mood: (data?.mood as MoodValue | undefined) ?? null, date };
}

export type SetTodayMoodResult = { ok: true } | { ok: false; error: string };

/**
 * 今日の調子を記録する(同じ日にもう一度押した場合は上書きする)。
 */
export async function setTodayMood(mood: MoodValue): Promise<SetTodayMoodResult> {
    if (mood !== "good" && mood !== "normal" && mood !== "bad") {
          return { ok: false, error: "不正な値です。" };
    }

  const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const date = todayJstDateString();
    const { error } = await supabase.from("daily_mood_logs").upsert(
      {
              user_id: user.id,
              log_date: date,
              mood,
              updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,log_date" }
        );

  if (error) {
        console.error("setTodayMood error", error);
        return { ok: false, error: "記録に失敗しました。もう一度お試しください。" };
  }

  return { ok: true };
}
