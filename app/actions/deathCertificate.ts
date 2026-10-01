"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// もしもの時の開示フロー: 非アクティブ検知の条件を満たしても即座には開示せず、
// 1. 共有相手に「ご本人と連絡が取れません」と案内し、死亡届(または除籍謄本等)の画像の提出を求める
// 2. 画像は運営(管理者)が確認し、承認して初めて開示される
// 提出者は共有リンクを開いただけの未ログインの家族のため、サービスロールキーを持つ
// 管理用クライアントでアップロード・DB更新を行う(通常のRLSには依存しない)。

const DEATH_CERT_BUCKET = "death-certificates";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB

export type SubmitDeathCertificateResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitDeathCertificate(
  token: string,
  formData: FormData
): Promise<SubmitDeathCertificateResult> {
  const submittedByName = String(formData.get("submittedByName") ?? "").trim();
  const image = formData.get("image");

  if (!submittedByName) {
    return { ok: false, error: "お名前を入力してください。" };
  }
  if (!(image instanceof File) || image.size === 0) {
    return { ok: false, error: "画像を選択してください。" };
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "画像のサイズが大きすぎます。" };
  }

  // トークンから本人(オーナー)のユーザーIDを特定する(通常の匿名クライアントで、
  // 既存のget_handover_status RPC経由で間接的に検証する)。
  const anonSupabase = await createClient();
  const { data: statusData, error: statusError } = await anonSupabase.rpc(
    "get_handover_status",
    { p_token: token }
  );
  if (statusError || !statusData) {
    return { ok: false, error: "リンクが無効です。" };
  }
  const status = statusData as unknown as { found?: boolean; ownerUserId?: string };
  if (!status.found || !status.ownerUserId) {
    return { ok: false, error: "リンクが無効です。" };
  }
  const ownerUserId = status.ownerUserId;

  const adminClient = createAdminClient();
  if (!adminClient) {
    return {
      ok: false,
      error: "現在この機能はご利用いただけません。しばらくしてから再度お試しください。",
    };
  }

  const arrayBuffer = await image.arrayBuffer();
  const contentType = image.type || "image/jpeg";
  const ext = contentType.includes("png") ? "png" : "jpg";
  const path = `${ownerUserId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await adminClient.storage
    .from(DEATH_CERT_BUCKET)
    .upload(path, arrayBuffer, { contentType, upsert: false });
  if (uploadError) {
    console.error("submitDeathCertificate upload error", uploadError);
    return { ok: false, error: "画像のアップロードに失敗しました。" };
  }

  const { error: insertError } = await adminClient
    .from("death_certificate_submissions")
    .insert({
      user_id: ownerUserId,
      recipient_name: submittedByName,
      image_path: path,
      status: "pending",
    });
  if (insertError) {
    console.error("submitDeathCertificate insert error", insertError);
    return { ok: false, error: "提出に失敗しました。もう一度お試しください。" };
  }

  const { error: updateError } = await adminClient
    .from("handover_settings")
    .update({ disclosure_status: "certificate_submitted" })
    .eq("user_id", ownerUserId);
  if (updateError) {
    console.error("submitDeathCertificate status update error", updateError);
  }

  return { ok: true };
}
