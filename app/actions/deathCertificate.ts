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

export type FamilyDeathReportTarget = {
  ownerId: string;
  name: string;
  // 提出済みの書類があれば、その状態(確認待ち・承認済み・却下)
  status: "pending" | "approved" | "rejected" | null;
};

/**
 * ログイン中のアカウントとつながっているご家族(アカウント連携済み)の一覧と、
 * それぞれの死亡届の提出状況を返す。
 */
export async function getFamilyDeathReportTargets(): Promise<FamilyDeathReportTarget[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: members } = await supabase
    .from("family_members")
    .select("name, linked_user_id")
    .eq("user_id", user.id)
    .not("linked_user_id", "is", null);
  const linked = (members ?? []).filter((m) => m.linked_user_id);
  if (linked.length === 0) return [];

  const ownerIds = [...new Set(linked.map((m) => m.linked_user_id as string))];
  const statusByOwner = new Map<string, "pending" | "approved" | "rejected">();
  const adminClient = createAdminClient();
  if (adminClient) {
    const { data: subs } = await adminClient
      .from("death_certificate_submissions")
      .select("user_id, status, submitted_at")
      .in("user_id", ownerIds)
      .order("submitted_at", { ascending: true });
    // 新しい提出の状態を優先する
    for (const s of subs ?? []) statusByOwner.set(s.user_id, s.status);
    // 運営が管理画面から直接承認した場合など、提出がなくても開示が承認済みなら「承認済み」にする
    const { data: approved } = await adminClient
      .from("handover_settings")
      .select("user_id")
      .in("user_id", ownerIds)
      .eq("disclosure_status", "approved");
    for (const a of approved ?? []) statusByOwner.set(a.user_id, "approved");
  }

  return ownerIds.map((id) => ({
    ownerId: id,
    name: linked.find((m) => m.linked_user_id === id)?.name ?? "ご家族",
    status: statusByOwner.get(id) ?? null,
  }));
}

/**
 * ログイン中のアカウントから、つながっているご家族の死亡届(または除籍謄本等)を提出する。
 * 共有リンクからの提出(submitDeathCertificate)と同じく、運営が確認・承認するまでは
 * 「もしもの時」の内容は開示されない。
 */
export async function submitFamilyDeathReport(
  ownerId: string,
  formData: FormData
): Promise<SubmitDeathCertificateResult> {
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return { ok: false, error: "画像を選択してください。" };
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "画像のサイズが大きすぎます。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "ログインしてください。" };
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return {
      ok: false,
      error: "現在この機能はご利用いただけません。しばらくしてから再度お試しください。",
    };
  }

  // 直接つながっているご家族だけが提出できる
  const { data: link } = await adminClient
    .from("family_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("linked_user_id", ownerId)
    .limit(1)
    .maybeSingle();
  if (!link) {
    return { ok: false, error: "つながっているご家族のみ提出できます。" };
  }

  const { data: settings } = await adminClient
    .from("handover_settings")
    .select("disclosure_status")
    .eq("user_id", ownerId)
    .maybeSingle();
  if (!settings) {
    return {
      ok: false,
      error: "このご家族は、まだ「もしもの時」の設定をされていません。",
    };
  }
  if (settings.disclosure_status === "approved") {
    return { ok: false, error: "すでに運営が確認し、開示が承認されています。" };
  }

  const { data: pending } = await adminClient
    .from("death_certificate_submissions")
    .select("id")
    .eq("user_id", ownerId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (pending) {
    return { ok: false, error: "すでに提出済みで、運営が確認中です。" };
  }

  const { data: me } = await adminClient
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  const arrayBuffer = await image.arrayBuffer();
  const contentType = image.type || "image/jpeg";
  const ext = contentType.includes("png") ? "png" : "jpg";
  const path = ownerId + "/" + Date.now() + "." + ext;

  const { error: uploadError } = await adminClient.storage
    .from(DEATH_CERT_BUCKET)
    .upload(path, arrayBuffer, { contentType, upsert: false });
  if (uploadError) {
    console.error("submitFamilyDeathReport upload error", uploadError);
    return { ok: false, error: "画像のアップロードに失敗しました。" };
  }

  const { error: insertError } = await adminClient
    .from("death_certificate_submissions")
    .insert({
      user_id: ownerId,
      recipient_name: me?.name || "(アカウントからの提出)",
      image_path: path,
      status: "pending",
    });
  if (insertError) {
    console.error("submitFamilyDeathReport insert error", insertError);
    return { ok: false, error: "提出に失敗しました。もう一度お試しください。" };
  }

  await adminClient
    .from("handover_settings")
    .update({ disclosure_status: "certificate_submitted" })
    .eq("user_id", ownerId);

  return { ok: true };
}
