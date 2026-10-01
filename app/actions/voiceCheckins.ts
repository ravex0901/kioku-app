"use server";

import { createClient } from "@/lib/supabase/server";
import { getSignedUrl } from "@/lib/storage";
import type { VoiceCheckin, VoiceCheckinSlot } from "@/lib/types";

// 家族ボイスメッセージ機能。
// 家族(お孫さんなど)が録音した本人の声のメッセージを、お昼・夕方・夜の
// 時間帯に合わせてホーム画面でアラームのように届ける。
// 現時点では「実際に録音した本人の声」をそのまま再生する(AIによる音声クローンではない)。
// 将来ELEVENLABS_API_KEYを設定すれば、この録音をもとに声をクローンし、
// 毎回違う文面を同じ声で読み上げる拡張も可能(app/actions/voice.tsと同じ仏組み)。

const VOICE_CHECKIN_BUCKET = "voice-checkins";
const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15MB

// 注意: このファイルは "use server" のため、export できるのは非同期関数のみ
// (Next.jsのServer Actionsの制約)。時間帯ラベルはlib/constants.tsのVOICE_CHECKIN_SLOT_LABELSを使う。

// JST基準で現在の時間帯を判定する(ホーム画面でどのメッセージを出すか)。
// お昼: 11:00-14:59 / 夕方: 15:00-18:59 / 夜: 19:00-22:59(それ以外は表示しない)
function currentSlotJst(): VoiceCheckinSlot | null {
    const now = new Date();
    const jstHour = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
    if (jstHour >= 11 && jstHour < 15) return "lunch";
    if (jstHour >= 15 && jstHour < 19) return "evening";
    if (jstHour >= 19 && jstHour < 23) return "night";
    return null;
}

export type VoiceCheckinWithUrl = VoiceCheckin & { audioUrl: string | null };

export type VoiceCheckinsResult =
    | { ok: true; checkins: VoiceCheckinWithUrl[] }
  | { ok: false; error: string };

/**
 * 登録済みのボイスメッセージ(お昼・夕方・夜)をすべて取得する(設定画面用)。
 */
export async function listVoiceCheckins(): Promise<VoiceCheckinsResult> {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const { data, error } = await supabase
      .from("voice_checkins")
      .select("*")
      .eq("user_id", user.id);

  if (error) {
        console.error("listVoiceCheckins error", error);
        return { ok: false, error: "取得に失敗しました。" };
  }

  const checkins = (data ?? []) as VoiceCheckin[];
    const withUrls = await Promise.all(
          checkins.map(async (c) => ({
                  ...c,
                  audioUrl: await getSignedUrl(supabase, c.storage_path, VOICE_CHECKIN_BUCKET),
          }))
        );

  return { ok: true, checkins: withUrls };
}

export type TodayCheckinResult =
    | { ok: true; checkin: VoiceCheckinWithUrl | null; slot: VoiceCheckinSlot | null }
  | { ok: false; error: string };

/**
 * 今の時間帯(お昼/夕方/夜)に表示すべきボイスメッセージを1件取得する(ホーム画面用)。
 * 該当する時間帯でないか、その時間帯のメッセージが未登録ならcheckin: nullを返す。
 */
export async function getCurrentVoiceCheckin(): Promise<TodayCheckinResult> {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const slot = currentSlotJst();
    if (!slot) return { ok: true, checkin: null, slot: null };

  const { data, error } = await supabase
      .from("voice_checkins")
      .select("*")
      .eq("user_id", user.id)
      .eq("time_slot", slot)
      .maybeSingle();

  if (error) {
        console.error("getCurrentVoiceCheckin error", error);
        return { ok: false, error: "取得に失敗しました。" };
  }

  if (!data) return { ok: true, checkin: null, slot };

  const row = data as VoiceCheckin;
    const audioUrl = await getSignedUrl(supabase, row.storage_path, VOICE_CHECKIN_BUCKET);

  return { ok: true, checkin: { ...row, audioUrl }, slot };
}

export type SaveCheckinResult = { ok: true } | { ok: false; error: string };

/**
 * 時間帯ごとのボイスメッセージを登録・上書きする。
 * FormData: timeSlot, speakerName, familyMemberId(任意), messageText(任意), audio(任意・録音ファイル)
 */
export async function saveVoiceCheckin(formData: FormData): Promise<SaveCheckinResult> {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const timeSlot = String(formData.get("timeSlot") ?? "");
    if (timeSlot !== "lunch" && timeSlot !== "evening" && timeSlot !== "night") {
          return { ok: false, error: "時間帯の指定が正しくありません。" };
    }

  const speakerName = String(formData.get("speakerName") ?? "").trim();
    if (!speakerName) {
          return { ok: false, error: "お名前を入力してください。" };
    }

  const familyMemberIdRaw = String(formData.get("familyMemberId") ?? "").trim();
    const familyMemberId = familyMemberIdRaw || null;
    const messageText = String(formData.get("messageText") ?? "").trim() || null;

  let storagePath: string | null = null;
    const audio = formData.get("audio");
    if (audio instanceof File && audio.size > 0) {
          if (audio.size > MAX_AUDIO_BYTES) {
                  return { ok: false, error: "音声ファイルが大きすぎます。" };
          }
          const arrayBuffer = await audio.arrayBuffer();
          const contentType = audio.type || "audio/webm";
          const ext = contentType.includes("webm") ? "webm" : "mp4";
          storagePath = `${user.id}/${timeSlot}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from(VOICE_CHECKIN_BUCKET)
            .upload(storagePath, arrayBuffer, { contentType, upsert: true });
          if (uploadError) {
                  console.error("saveVoiceCheckin upload error", uploadError);
                  return { ok: false, error: "音声のアップロードに失敗しました。" };
          }
    }

  // 既存レコードがあれば、新しい録音がない場合は元のstorage_pathを維持する
  const { data: existing } = await supabase
      .from("voice_checkins")
      .select("storage_path")
      .eq("user_id", user.id)
      .eq("time_slot", timeSlot)
      .maybeSingle();

  const finalStoragePath = storagePath ?? existing?.storage_path ?? null;

  if (!messageText && !finalStoragePath) {
        return { ok: false, error: "メッセージ文か録音のどちらかを入力してください。" };
  }

  const { error } = await supabase.from("voice_checkins").upsert(
    {
            user_id: user.id,
            time_slot: timeSlot,
            speaker_name: speakerName,
            family_member_id: familyMemberId,
            message_text: messageText,
            storage_path: finalStoragePath,
            updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,time_slot" }
      );

  if (error) {
        console.error("saveVoiceCheckin upsert error", error);
        return { ok: false, error: "保存に失敗しました。もう一度お試しください。" };
  }

  return { ok: true };
}

export type SimpleResult = { ok: true } | { ok: false; error: string };

/**
 * 時間帯のボイスメッセージを削除する。
 */
export async function deleteVoiceCheckin(timeSlot: VoiceCheckinSlot): Promise<SimpleResult> {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const { data: existing } = await supabase
      .from("voice_checkins")
      .select("storage_path")
      .eq("user_id", user.id)
      .eq("time_slot", timeSlot)
      .maybeSingle();

  if (existing?.storage_path) {
        await supabase.storage.from(VOICE_CHECKIN_BUCKET).remove([existing.storage_path]);
  }

  const { error } = await supabase
      .from("voice_checkins")
      .delete()
      .eq("user_id", user.id)
      .eq("time_slot", timeSlot);

  if (error) {
        console.error("deleteVoiceCheckin error", error);
        return { ok: false, error: "削除に失敗しました。" };
  }

  return { ok: true };
}
