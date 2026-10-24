"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import { notifyHandoverApproved } from "@/lib/adminNotify";

// 運営(管理者)専用の操作: 各アカウントの登録情報の編集、タイムカプセル(結婚条件)の承認、
// 「もしもの時」の開示の承認。すべてサーバー側で管理者かどうかを確認してから実行する。

export type AdminActionState = { ok?: boolean; error?: string } | undefined;

const GENDERS = ["male", "female", "other", "no_answer"] as const;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function adminUpdateAccount(
  userId: string,
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "権限がありません。" };
  const adminClient = createAdminClient();
  if (!adminClient) return { error: "管理機能が設定されていません。" };

  const name = String(formData.get("name") ?? "").trim();
  const birthDate = String(formData.get("birth_date") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();

  if (!name) return { error: "名前を入力してください。" };
  if (birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate)))) {
    return { error: "生年月日の形式が正しくありません。" };
  }
  if (gender && !(GENDERS as readonly string[]).includes(gender)) {
    return { error: "性別の値が正しくありません。" };
  }
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { error: "メールアドレスの形式が正しくありません。" };
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ name, birth_date: birthDate || null })
    .eq("id", userId);
  if (profileError) {
    console.error("adminUpdateAccount profile error", profileError);
    return { error: "名前・生年月日の保存に失敗しました。" };
  }

  const { error: detailsError } = await adminClient.from("profile_details").upsert(
    {
      user_id: userId,
      gender: gender ? (gender as (typeof GENDERS)[number]) : null,
      address: address || null,
      phone: phone || null,
      contact_email: contactEmail || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (detailsError) {
    console.error("adminUpdateAccount details error", detailsError);
    return { error: "登録情報の保存に失敗しました。" };
  }

  revalidatePath("/admin/users/" + userId);
  revalidatePath("/admin");
  return { ok: true };
}

// 結婚条件のタイムカプセルを、運営が(書類を確認したうえで)手動で承認する。
export async function adminApproveMarriageCapsule(
  capsuleId: string,
  note: string
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "権限がありません。" };
  const adminClient = createAdminClient();
  if (!adminClient) return { error: "管理機能が設定されていません。" };

  const { error } = await adminClient
    .from("time_capsules")
    .update({
      marriage_verified_at: new Date().toISOString(),
      marriage_review_note: note || "運営が確認し承認しました。",
    })
    .eq("id", capsuleId)
    .eq("unlock_condition_type", "marriage");
  if (error) {
    console.error("adminApproveMarriageCapsule error", error);
    return { error: "承認に失敗しました。" };
  }
  revalidatePath("/admin/capsules");
  return { ok: true };
}

// 「もしもの時」の開示を、運営の判断で承認する(提出書類の承認とは別に、手動で開示する場合)。
export async function adminApproveHandover(
  ownerId: string
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "権限がありません。" };
  const adminClient = createAdminClient();
  if (!adminClient) return { error: "管理機能が設定されていません。" };

  const now = new Date().toISOString();
  const { error } = await adminClient
    .from("handover_settings")
    .update({ disclosure_status: "approved", approved_at: now })
    .eq("user_id", ownerId);
  if (error) {
    console.error("adminApproveHandover error", error);
    return { error: "承認に失敗しました。" };
  }

  await adminClient
    .from("death_certificate_submissions")
    .update({ status: "approved", reviewed_at: now, reviewed_by: admin.email ?? null })
    .eq("user_id", ownerId)
    .eq("status", "pending");

  await notifyHandoverApproved(adminClient, ownerId);

  revalidatePath("/admin/handover");
  revalidatePath("/admin");
  return { ok: true };
}

// 開示済みの「もしもの時」を、提出待ちの状態に戻す(誤って承認した場合など)。
export async function adminRevokeHandover(
  ownerId: string
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "権限がありません。" };
  const adminClient = createAdminClient();
  if (!adminClient) return { error: "管理機能が設定されていません。" };

  const { error } = await adminClient
    .from("handover_settings")
    .update({ disclosure_status: "awaiting_certificate", approved_at: null })
    .eq("user_id", ownerId);
  if (error) return { error: "取り消しに失敗しました。" };

  revalidatePath("/admin/handover");
  return { ok: true };
}
