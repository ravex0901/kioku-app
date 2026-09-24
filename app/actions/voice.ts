"use server";

import { createClient } from "@/lib/supabase/server";

// AIの声の「カスタム音声(自分の声)」機能。
// 録音した音声サンプルを外部の音声クローンAPI(ElevenLabs)に送って声のクローンを作成し、
// 以後そのクローン音声でテキストを読み上げられるようにする。
// ELEVENLABS_API_KEY が未設定の環境ではこの機能全体を無効化し、その旨をユーザーに伝える
// (料金が発生する外部サービスのため、管理者が明示的に鍵を設定した場合のみ有効になる)。

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const MAX_SAMPLE_BYTES = 15 * 1024 * 1024; // 15MB
const MIN_SAMPLE_BYTES = 5 * 1024; // 極端に短い録音(無音等)を弾く簡易チェック

export type VoiceProfileStatus = {
  status: "none" | "pending" | "ready" | "failed";
  errorMessage: string | null;
};

/**
 * 現在のユーザーのカスタム音声(クローン)の状態を取得する。
 */
export async function getVoiceProfileStatus(): Promise<VoiceProfileStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "none", errorMessage: null };

  const { data } = await supabase
    .from("voice_profiles")
    .select("status, error_message")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return { status: "none", errorMessage: null };
  return {
    status: data.status as VoiceProfileStatus["status"],
    errorMessage: data.error_message,
  };
}

export type UploadVoiceSampleResult = { ok: true } | { ok: false; error: string };

/**
 * 録音した音声サンプル(FormDataの"audio"フィールド)をアップロードし、
 * 外部APIで音声クローンを作成する。
 */
export async function uploadVoiceSample(
  formData: FormData
): Promise<UploadVoiceSampleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが必要です。" };

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "カスタム音声機能が設定されていません。管理者にお問い合わせください。",
    };
  }

  const file = formData.get("audio");
  if (!(file instanceof File)) {
    return { ok: false, error: "音声データが見つかりません。" };
  }
  if (file.size > MAX_SAMPLE_BYTES) {
    return { ok: false, error: "音声ファイルが大きすぎます。" };
  }
  if (file.size < MIN_SAMPLE_BYTES) {
    return { ok: false, error: "録音が短すぎます。もう一度録音してください。" };
  }

  const arrayBuffer = await file.arrayBuffer();
  const contentType = file.type || "audio/webm";
  const ext = contentType.includes("webm")
    ? "webm"
    : contentType.includes("mp4")
      ? "mp4"
      : contentType.includes("ogg")
        ? "ogg"
        : "wav";
  const storagePath = `${user.id}/sample-${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("voice-samples")
    .upload(storagePath, arrayBuffer, { contentType });

  if (uploadError) {
    console.error("uploadVoiceSample storage error", uploadError);
    return { ok: false, error: "音声のアップロードに失敗しました。" };
  }

  await supabase.from("voice_profiles").upsert(
    {
      user_id: user.id,
      provider: "elevenlabs",
      status: "pending",
      sample_storage_path: storagePath,
      error_message: null,
    },
    { onConflict: "user_id" }
  );

  try {
    const elForm = new FormData();
    elForm.append("name", `kioku-${user.id.slice(0, 8)}`);
    elForm.append(
      "files",
      new Blob([arrayBuffer], { type: contentType }),
      `sample.${ext}`
    );

    const res = await fetch(`${ELEVENLABS_BASE_URL}/voices/add`, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: elForm,
    });

    if (!res.ok) {
      const message = await res.text().catch(() => "");
      await supabase
        .from("voice_profiles")
        .update({
          status: "failed",
          error_message: (message || `HTTP ${res.status}`).slice(0, 300),
        })
        .eq("user_id", user.id);
      return {
        ok: false,
        error: "音声クローンの作成に失敗しました。時間をおいて再度お試しください。",
      };
    }

    const json = (await res.json()) as { voice_id?: string };
    if (!json.voice_id) {
      await supabase
        .from("voice_profiles")
        .update({ status: "failed", error_message: "voice_id が応答に含まれていません。" })
        .eq("user_id", user.id);
      return { ok: false, error: "音声クローンの作成に失敗しました。" };
    }

    await supabase
      .from("voice_profiles")
      .update({
        status: "ready",
        external_voice_id: json.voice_id,
        error_message: null,
      })
      .eq("user_id", user.id);

    return { ok: true };
  } catch (err) {
    console.error("uploadVoiceSample clone error", err);
    await supabase
      .from("voice_profiles")
      .update({ status: "failed", error_message: "通信エラーが発生しました。" })
      .eq("user_id", user.id);
    return { ok: false, error: "音声クローンの作成に失敗しました。" };
  }
}

/**
 * 登録済みのカスタム音声を削除する(外部APIの声データ・保存済み録音・DBレコードすべて)。
 */
export async function deleteVoiceProfile(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが必要です。" };

  const { data: profile } = await supabase
    .from("voice_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) return { ok: true };

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (apiKey && profile.external_voice_id) {
    try {
      await fetch(`${ELEVENLABS_BASE_URL}/voices/${profile.external_voice_id}`, {
        method: "DELETE",
        headers: { "xi-api-key": apiKey },
      });
    } catch (err) {
      // 外部APIの削除に失敗しても、ローカルのレコード削除は続行する
      console.error("deleteVoiceProfile external delete error", err);
    }
  }

  if (profile.sample_storage_path) {
    await supabase.storage.from("voice-samples").remove([profile.sample_storage_path]);
  }

  await supabase.from("voice_profiles").delete().eq("user_id", user.id);
  return { ok: true };
}

export type SynthesizeResult =
  | { ok: true; audioBase64: string }
  | { ok: false; error: string };

/**
 * カスタム音声(クローン済みの声)でテキストを読み上げる音声データを生成する。
 * 返り値はmp3音声のbase64文字列。
 */
export async function synthesizeWithCustomVoice(
  text: string
): Promise<SynthesizeResult> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "テキストがありません。" };

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "カスタム音声機能が設定されていません。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが必要です。" };

  const { data: profile } = await supabase
    .from("voice_profiles")
    .select("status, external_voice_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.status !== "ready" || !profile.external_voice_id) {
    return { ok: false, error: "カスタム音声が未設定です。" };
  }

  try {
    const res = await fetch(
      `${ELEVENLABS_BASE_URL}/text-to-speech/${profile.external_voice_id}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: trimmed.slice(0, 2000),
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!res.ok) {
      return { ok: false, error: "読み上げの生成に失敗しました。" };
    }

    const arrayBuffer = await res.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString("base64");
    return { ok: true, audioBase64 };
  } catch (err) {
    console.error("synthesizeWithCustomVoice error", err);
    return { ok: false, error: "読み上げの生成に失敗しました。" };
  }
}
