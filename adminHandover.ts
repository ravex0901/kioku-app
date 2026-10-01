"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";

// 運営(管理者)が、提出された死亡届(または除籍謄本等)の画像を確認し、
// 「もしもの時」の内容を開示してよいか判断する。承認すると disclosure_status が
// 'approved' になり、get_handover_status RPC経由で家族が内容を見られるようになる。

export type AdminActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return null;
  }
  return user;
}

export async function approveDeathCertificate(
  submissionId: string
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "権限がありません。" };
  }
  const adminClient = createAdminClient();
  if (!adminClient) {
    return { ok: false, error: "管理機能が設定されていません。" };
  }

  const { data: submission, error: fetchError } = await adminClient
    .from("death_certificate_submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();
  if (fetchError || !submission) {
    return { ok: false, error: "提出データが見つかりません。" };
  }

  const { error: updateSubError } = await adminClient
    .from("death_certificate_submissions")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.email ?? null,
    })
    .eq("id", submissionId);
  if (updateSubError) {
    return { ok: false, error: "承認処理に失敗しました。" };
  }

  const { error: updateSettingsError } = await adminClient
    .from("handover_settings")
    .update({ disclosure_status: "approved", approved_at: new Date().toISOString() })
    .eq("user_id", submission.user_id);
  if (updateSettingsError) {
    return { ok: false, error: "開示設定の更新に失敗しました。" };
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function rejectDeathCertificate(
  submissionId: string,
  note: string
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "権限がありません。" };
  }
  const adminClient = createAdminClient();
  if (!adminClient) {
    return { ok: false, error: "管理機能が設定されていません。" };
  }

  const { data: submission, error: fetchError } = await adminClient
    .from("death_certificate_submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();
  if (fetchError || !submission) {
    return { ok: false, error: "提出データが見つかりません。" };
  }

  const { error: updateSubError } = await adminClient
    .from("death_certificate_submissions")
    .update({
      status: "rejected",
      admin_note: note || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.email ?? null,
    })
    .eq("id", submissionId);
  if (updateSubError) {
    return { ok: false, error: "却下処理に失敗しました。" };
  }

  // 再提出できるよう、提出待ちの状態に戻す
  const { error: updateSettingsError } = await adminClient
    .from("handover_settings")
    .update({ disclosure_status: "awaiting_certificate" })
    .eq("user_id", submission.user_id);
  if (updateSettingsError) {
    return { ok: false, error: "開示設定の更新に失敗しました。" };
  }

  revalidatePath("/admin");
  return { ok: true };
}

export type DeathCertSignedUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function getDeathCertificateImageUrl(
  imagePath: string
): Promise<DeathCertSignedUrlResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "権限がありません。" };
  }
  const adminClient = createAdminClient();
  if (!adminClient) {
    return { ok: false, error: "管理機能が設定されていません。" };
  }
  const { data, error } = await adminClient.storage
    .from("death-certificates")
    .createSignedUrl(imagePath, 60 * 10);
  if (error || !data) {
    return { ok: false, error: "画像の取得に失敗しました。" };
  }
  return { ok: true, url: data.signedUrl };
}
