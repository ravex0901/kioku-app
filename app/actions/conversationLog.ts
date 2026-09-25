"use server";

import { createClient } from "@/lib/supabase/server";
import type { ConversationLogEntry } from "@/lib/types";

/**
 * 「AIと会話する」機能でのやり取り(質問と回答)を自分史用に記録する。
 * 失敗しても会話自体は継続できるよう、呼び出し側はエラーを無視してよい。
 */
export async function logConversationTurn(
  question: string,
  answer: string
): Promise<{ ok: boolean }> {
  const trimmedQuestion = question.trim();
  const trimmedAnswer = answer.trim();
  if (!trimmedQuestion || !trimmedAnswer) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase.from("conversation_logs").insert({
    user_id: user.id,
    question: trimmedQuestion,
    answer: trimmedAnswer,
  });

  if (error) {
    console.error("logConversationTurn error", error);
    return { ok: false };
  }
  return { ok: true };
}

export type ConversationDayGroup = {
  date: string; // YYYY-MM-DD (JST)
  entries: ConversationLogEntry[];
};

// JSTの日付(YYYY-MM-DD)を返す
function toJstDateKey(isoString: string): string {
  const d = new Date(isoString);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * これまでのAI会話ログを日付ごとにグループ化して取得する。
 * 「この日はこういう会話をしていた」という自分史の一部として表示する。
 */
export async function getConversationHistory(): Promise<ConversationDayGroup[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("conversation_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const entries = (data ?? []) as ConversationLogEntry[];
  const groups = new Map<string, ConversationLogEntry[]>();
  for (const entry of entries) {
    const key = toJstDateKey(entry.created_at);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  return Array.from(groups.entries()).map(([date, dayEntries]) => ({
    date,
    entries: dayEntries,
  }));
}
