"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type {
  ReceivedTimeCapsule,
  TimeCapsule,
  TimeCapsuleUnlockConditionType,
} from "@/lib/types";

const CAPSULE_AUDIO_BUCKET = "capsule-audio";
const MARRIAGE_CERT_BUCKET = "marriage-certificates";
// date以外の条件(年齢・結婚など)は open_at を直接使わないため、十分先の日付を
// プレースホルダーとして入れておく(open_atはNOT NULL制約のため)。
const FAR_FUTURE_DATE = "2099-12-31T00:00:00+09:00";

function calcAge(birthDateStr: string, atDate: Date): number {
  const birth = new Date(`${birthDateStr}T00:00:00+09:00`);
  let age = atDate.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    atDate.getMonth() > birth.getMonth() ||
    (atDate.getMonth() === birth.getMonth() && atDate.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

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

const UNLOCK_CONDITION_VALUES: TimeCapsuleUnlockConditionType[] = [
  "date",
  "adulthood",
  "marriage",
  "same_age_as_sender",
];

/**
 * 未来の家族に向けたタイムカプセルを作成する。
 * テキスト・音声のどちらか(または両方)と、開封条件(日付指定/成人になったら/
 * 結婚したら/送った本人と同じ歳になったら)を指定する。紐付け済みの家族アカウント宛てに
 * 送る場合は recipientFamilyMemberId を指定する。
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
  const recipientFamilyMemberId = String(
    formData.get("recipientFamilyMemberId") ?? ""
  ).trim();
  const messageText = String(formData.get("messageText") ?? "").trim();
  const openAtRaw = String(formData.get("openAt") ?? "").trim();
  const unlockConditionTypeRaw = String(
    formData.get("unlockConditionType") ?? "date"
  ).trim();
  const audio = formData.get("audio");

  if (!title) {
    return { ok: false, error: "タイトルを入力してください。" };
  }
  if (
    !UNLOCK_CONDITION_VALUES.includes(
      unlockConditionTypeRaw as TimeCapsuleUnlockConditionType
    )
  ) {
    return { ok: false, error: "開封条件の指定が正しくありません。" };
  }
  const unlockConditionType =
    unlockConditionTypeRaw as TimeCapsuleUnlockConditionType;

  if (unlockConditionType !== "date") {
    if (!recipientFamilyMemberId) {
      return {
        ok: false,
        error:
          "年齢や結婚を条件にする場合は、紐付け済みの家族アカウント宛てに送る必要があります。",
      };
    }
  }

  let openAtIso = FAR_FUTURE_DATE;
  if (unlockConditionType === "date") {
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
    openAtIso = openAtDate.toISOString();
  }

  if (!messageText && !(audio instanceof File && audio.size > 0)) {
    return {
      ok: false,
      error: "テキストか音声のどちらかでメッセージを残してください。",
    };
  }

  let senderAgeAtCreation: number | null = null;
  if (unlockConditionType === "same_age_as_sender") {
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("birth_date")
      .eq("id", user.id)
      .maybeSingle();
    if (!myProfile?.birth_date) {
      return {
        ok: false,
        error:
          "「送った本人と同じ歳になったら」にはご自身の生年月日の登録が必要です。設定画面から登録してください。",
      };
    }
    senderAgeAtCreation = calcAge(myProfile.birth_date, new Date());
  }

  const { data: inserted, error: insertError } = await supabase
    .from("time_capsules")
    .insert({
      user_id: user.id,
      title,
      recipient_name: recipientName || null,
      recipient_family_member_id: recipientFamilyMemberId || null,
      message_text: messageText || null,
      open_at: openAtIso,
      unlock_condition_type: unlockConditionType,
      sender_age_at_creation: senderAgeAtCreation,
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

export type GetReceivedCapsulesResult =
  | { ok: true; capsules: ReceivedTimeCapsule[] }
  | { ok: false; error: string };

/**
 * 紐付け済みの家族アカウントとして、自分宛てに届いているタイムカプセルを取得する。
 * 開封条件を満たしていないものは「ロック中」として、本文を含まない形で返される
 * (get_received_time_capsules RPC側で判定・マスキングされる)。
 */
export async function getReceivedTimeCapsules(): Promise<GetReceivedCapsulesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが必要です。" };

  const { data, error } = await supabase.rpc("get_received_time_capsules");
  if (error) {
    console.error("getReceivedTimeCapsules error", error);
    return { ok: false, error: "取得に失敗しました。" };
  }

  return { ok: true, capsules: (data as unknown as ReceivedTimeCapsule[]) ?? [] };
}

export type SubmitMarriageCertificateResult =
  | { ok: true; verified: boolean; reason: string }
  | { ok: false; error: string };

/**
 * 「結婚したら開封」のタイムカプセルに対し、婚姻届等の画像を提出する。
 * AIが画像の内容を確認し、婚姻届(または受理証明書等)らしいと判定できれば、
 * その場で自動的に開封条件を満たした状態にする。
 */
export async function submitMarriageCertificate(
  capsuleId: string,
  formData: FormData
): Promise<SubmitMarriageCertificateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが必要です。" };

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return { ok: false, error: "画像を選択してください。" };
  }

  // 自分がこのタイムカプセルの受取人として紐付いているか確認する
  // (RLSのselectポリシーが無いため、受け取れるかはget_received_time_capsules経由で間接確認する)。
  const { data: receivedData } = await supabase.rpc("get_received_time_capsules");
  const received = (receivedData as unknown as ReceivedTimeCapsule[]) ?? [];
  const target = received.find((c) => c.id === capsuleId);
  if (!target) {
    return { ok: false, error: "対象のタイムカプセルが見つかりません。" };
  }

  const supportedMediaTypes = ["image/jpeg", "image/png", "image/webp"] as const;
  const contentType = (image.type || "image/jpeg") as (typeof supportedMediaTypes)[number];
  if (!supportedMediaTypes.includes(contentType)) {
    return { ok: false, error: "この画像形式には対応していません。" };
  }

  const arrayBuffer = await image.arrayBuffer();
  const base64Data = Buffer.from(arrayBuffer).toString("base64");
  const path = `${user.id}/${capsuleId}-${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(MARRIAGE_CERT_BUCKET)
    .upload(path, arrayBuffer, { contentType, upsert: false });
  if (uploadError) {
    console.error("submitMarriageCertificate upload error", uploadError);
    return { ok: false, error: "画像のアップロードに失敗しました。" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let isMarriageCertificate = false;
  let reason = "AI機能が設定されていないため、確認できませんでした。";

  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: contentType, data: base64Data },
              },
              {
                type: "text",
                                text:
                  "この画像は、結婚の事実を証明する書類ですか? 次のいずれかに該当すれば有効と判定してください: " +
                  "「婚姻届」そのもの、「婚姻届受理証明書」、「戸籍謄本(戸籍全部事項証明書)」、" +
                  "「戸籍抄本(戸籍個人事項証明書)」、またはそれらに準ずる、結婚(婚姻)の事実が確認できる公的書類。" +
                  "慎重に確認し、次のJSON形式のみで回答してください。" +
                  '{"is_marriage_certificate": true または false, "reason": "判定理由を日本語で1文"}',
              },
            ],
          },
        ],
      });
      const textBlock = message.content.find((b) => b.type === "text");
      const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as {
          is_marriage_certificate?: boolean;
          reason?: string;
        };
        isMarriageCertificate = !!parsed.is_marriage_certificate;
        reason = parsed.reason ?? "";
      }
    } catch (err) {
      console.error("submitMarriageCertificate AI error", err);
      reason = "AIによる確認中にエラーが発生しました。もう一度お試しください。";
    }
  }

  // 本人(送信者)側のレコードを更新する必要があるため、RPC経由ではなくAPIルート相当の
  // 更新を行う: 受取人はtime_capsulesへの直接updateポリシーを持たないため、
  // 専用のRPCを用意せず、ここではまず画像パスのみを自分のストレージに保存し、
  // AIが確認できた場合は承認RPCを呼ぶ。
  const { error: verifyError } = await supabase.rpc("verify_marriage_certificate", {
    p_capsule_id: capsuleId,
    p_image_path: path,
    p_verified: isMarriageCertificate,
    p_note: reason,
  });

  if (verifyError) {
    console.error("verify_marriage_certificate rpc error", verifyError);
    return { ok: false, error: "確認結果の保存に失敗しました。" };
  }

  return { ok: true, verified: isMarriageCertificate, reason };
}
