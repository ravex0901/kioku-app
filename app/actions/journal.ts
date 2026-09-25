"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { JournalEntry } from "@/lib/types";

const JOURNAL_AUDIO_BUCKET = "journal-audio";

const QUESTION_SYSTEM_PROMPT =
  "あなたは生前整理・家族の記憶を残すアプリ「きおく」の中で、ユーザーの人生の思い出や" +
  "日々の出来事をやさしく引き出す聞き役です。1日1問、あたたかく具体的な質問を1つだけ" +
  "日本語で作ってください。子どもの頃、家族、仕事、趣味、旅行、大切にしているもの、" +
  "今日あった小さな出来事など、幅広いテーマからバランスよく選んでください。" +
  "過去に聞いた質問と似た内容は避けてください。専門用語や難しい言い回しは避け、" +
  "説明や前置きは一切付けず、質問文だけを1文で出力してください。";

const FALLBACK_QUESTIONS = [
  "子どもの頃、よく遊んだ場所はどこですか?",
  "今までで一番心に残っている旅行はどこですか?",
  "大切にしている宝物について教えてください。",
  "若い頃、夢中になっていたことは何ですか?",
  "家族との思い出で、一番好きなエピソードは何ですか?",
  "今日一日で、ちょっと嬉しかったことはありますか?",
  "これまでの人生で、一番感謝している人は誰ですか?",
  "学生時代の忘れられない出来事はありますか?",
  "初めて自分でお金を稼いだ時のことを覚えていますか?",
  "一番好きだった季節の思い出を教えてください。",
];

function pickFallbackQuestion(pastQuestions: string[]): string {
  const unused = FALLBACK_QUESTIONS.filter((q) => !pastQuestions.includes(q));
  const pool = unused.length > 0 ? unused : FALLBACK_QUESTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function generateQuestion(pastQuestions: string[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return pickFallbackQuestion(pastQuestions);

  try {
    const client = new Anthropic({ apiKey });
    const recentText =
      pastQuestions.length > 0
        ? `【これまでに聞いた質問(内容が重複しないようにする)】\n${pastQuestions
            .slice(0, 15)
            .join("\n")}`
        : "まだ質問したことはありません。";
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 128,
      system: QUESTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: recentText }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    const text =
      textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    return text || pickFallbackQuestion(pastQuestions);
  } catch (err) {
    console.error("generateQuestion error", err);
    return pickFallbackQuestion(pastQuestions);
  }
}

// JSTの「今日」の開始・終了時刻をUTC ISO文字列で返す(1日1問の判定に使う)
function todayRangeJst() {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jstNow.getUTCFullYear();
  const m = jstNow.getUTCMonth();
  const d = jstNow.getUTCDate();
  const startJst = Date.UTC(y, m, d, 0, 0, 0) - 9 * 60 * 60 * 1000;
  const endJst = startJst + 24 * 60 * 60 * 1000;
  return {
    start: new Date(startJst).toISOString(),
    end: new Date(endJst).toISOString(),
  };
}

export type JournalState = {
  currentEntry: JournalEntry | null;
  history: JournalEntry[];
};

/**
 * 「AIと日記」機能。1日1問、AIが質問を出し、テキストか音声で答えると
 * 自分史として蓄積されていく。今日分の未回答の質問があればそれを返し、
 * なければ新しく生成して保存する。
 */
export async function getJournalState(): Promise<
  { ok: true; data: JournalState } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが必要です。" };

  const { data: historyData } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(60);

  const allEntries = (historyData ?? []) as JournalEntry[];
  const { start, end } = todayRangeJst();
  let todayEntry =
    allEntries.find((e) => e.created_at >= start && e.created_at < end) ??
    null;

  if (!todayEntry) {
    const pastQuestions = allEntries.map((e) => e.question);
    const question = await generateQuestion(pastQuestions);
    const { data: inserted, error } = await supabase
      .from("journal_entries")
      .insert({ user_id: user.id, question })
      .select("*")
      .single();
    if (error || !inserted) {
      console.error("getJournalState insert error", error);
      return { ok: false, error: "今日の質問の準備に失敗しました。" };
    }
    todayEntry = inserted as JournalEntry;
    allEntries.unshift(todayEntry);
  }

  const currentEntry =
    todayEntry.answer_text || todayEntry.answer_audio_path
      ? null
      : todayEntry;
  const history = allEntries.filter(
    (e) => e.answer_text || e.answer_audio_path
  );

  return { ok: true, data: { currentEntry, history } };
}

export type SubmitJournalResult = { ok: true } | { ok: false; error: string };

/**
 * 今日の質問への回答を保存する(テキスト・音声のどちらか、または両方)。
 */
export async function submitJournalAnswer(
  entryId: string,
  formData: FormData
): Promise<SubmitJournalResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが必要です。" };

  const answerText = String(formData.get("answerText") ?? "").trim();
  const audio = formData.get("audio");

  let audioPath: string | null = null;
  if (audio instanceof File && audio.size > 0) {
    const arrayBuffer = await audio.arrayBuffer();
    const contentType = audio.type || "audio/webm";
    const ext = contentType.includes("webm") ? "webm" : "mp4";
    audioPath = `${user.id}/${entryId}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(JOURNAL_AUDIO_BUCKET)
      .upload(audioPath, arrayBuffer, { contentType, upsert: true });
    if (uploadError) {
      console.error("submitJournalAnswer upload error", uploadError);
      return { ok: false, error: "音声のアップロードに失敗しました。" };
    }
  }

  if (!answerText && !audioPath) {
    return { ok: false, error: "テキストか音声のどちらかで回答を入力してください。" };
  }

  const { error } = await supabase
    .from("journal_entries")
    .update({
      answer_text: answerText || null,
      answer_audio_path: audioPath,
      answered_at: new Date().toISOString(),
    })
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) {
    console.error("submitJournalAnswer update error", error);
    return { ok: false, error: "回答の保存に失敗しました。" };
  }

  return { ok: true };
}
