"use server";

import { createClient } from "@/lib/supabase/server";
import type { TimeCapsule } from "@/lib/types";

const CAPSULE_AUDIO_BUCKET = "capsule-audio";

export type TimeCapsuleState = {
  locked: TimeCapsule[];
  unlocked: TimeCapsule[];
};

/**
 * タイムカプセル一覧を取得し、開封日を過ぎているかどうかで
 * 「ロック中」「開封できる」に振り分ける。
 */
export async function getTimeCapsules(): Promise<
  { ok: true; data: TimeCapsuleState } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが必要です。" };

  const { data, error } = await supabase
    .from("time_capsules")
    .select("*")
    .eq("user_id", user.id)
    .order("open_at", { ascending: true });

  if (error) {
    console.error("getTimeCapsules error", error);
    return { ok: false, error: "タイムカプセルの取得に失敗しました。" };
  }

  const all = (data ?? []) as TimeCapsule[];
  const now = new Date().toISOString();
  const locked = all.filter((c) => c.open_at > now);
  const unlocked = all
    .filter((c) => c.open_at <= now)
    .sort((a, b) => (a.open_at < b.open_at ? 1 : -1));

  return { ok: true, data: { locked, unlocked } };
}

export type CreateCapsuleResult = { ok: true } | { ok: false; error: string };

/**
 * 未来の家族に向けたタイムカプセルを作成する。
 * テキスト・音声のどちらか(または両方)と、開封日を指定する。
 */
export async function createTimeCapsule(
  formData: FormData
): Promise<CreateCapsuleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが必要です。" };

  const title = String(formData.get("title") ?? "").trim();
  const recipientName = String(formData.get("recipientName") ?? "").trim();
  const messageText = String(formData.get("messageText") ?? "").trim();
  const openAtRaw = String(formData.get("openAt") ?? "").trim();
  const audio = formData.get("audio");

  if (!title) {
    return { ok: false, error: "タイトルを入力してください。" };
  }
  if (!openAtRaw) {
    return { ok: false, error: "開封日を指定してください。" };
  }

  const openAtDate = new Date(`${openAtRaw}T00:00:00+09:00`);
  if (Number.isNaN(openAtDate.getTime())) {
    return { ok: false, error: "開封日の形式が正しくありません。" };
  }
  const now = new Date();
  if (openAtDate.getTime() <= now.getTime()) {
    return { ok: false, error: "開封日は未来の日付を指定してください。" };
  }

  if (!messageText && !(audio instanceof File && audio.size > 0)) {
    return {
      ok: false,
      error: "テキストか音声のどちらかでメッセージを残してください。",
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("time_capsules")
    .insert({
      user_id: user.id,
      title,
      recipient_name: recipientName || null,
      message_text: messageText || null,
      open_at: openAtDate.toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("createTimeCapsule insert error", insertError);
    return { ok: false, error: "タイムカプセルの作成に失敗しました。" };
  }

  if (audio instanceof File && audio.size > 0) {
    const arrayBuffer = await audio.arrayBuffer();
    const contentType = audio.type || "audio/webm";
    const ext = contentType.includes("webm") ? "webm" : "mp4";
    const audioPath = `${user.id}/${inserted.id}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(CAPSULE_AUDIO_BUCKET)
      .upload(audioPath, arrayBuffer, { contentType, upsert: true });

    if (uploadError) {
      console.error("createTimeCapsule upload error", uploadError);
      return { ok: false, error: "音声のアップロードに失敗しました。" };
    }

    const { error: updateError } = await supabase
      .from("time_capsules")
      .update({ message_audio_path: audioPath })
      .eq("id", inserted.id)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("createTimeCapsule update error", updateError);
      return { ok: false, error: "音声の保存に失敗しました。" };
    }
  }

  return { ok: true };
}
