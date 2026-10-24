"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 開示が承認されたあと、指定されたご家族のアカウントが「もしもの時」の
 * 相続手続きチェックリストにチェックを付ける/外す。
 * 表示できるのと同じ人(ご本人から指定されたアカウント)だけが操作できる。
 */
export async function toggleFamilyChecklist(
  ownerId: string,
  procedureKey: string,
  done: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!procedureKey || procedureKey.length > 100) {
    return { ok: false, error: "不正な項目です。" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインしてください。" };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "現在この機能はご利用いただけません。" };

  const { data: settings } = await admin
    .from("handover_settings")
    .select("disclosure_status")
    .eq("user_id", ownerId)
    .maybeSingle();
  if (!settings || settings.disclosure_status !== "approved") {
    return { ok: false, error: "まだ開示が承認されていません。" };
  }

  const { data: recipients } = await admin
    .from("handover_recipients")
    .select("family_member_id, share_checklist")
    .eq("user_id", ownerId);

  let allowed = false;
  if (recipients && recipients.length > 0) {
    const memberIds = recipients
      .map((r) => r.family_member_id)
      .filter((id): id is string => Boolean(id));
    const { data: members } = memberIds.length
      ? await admin
          .from("family_members")
          .select("id, linked_user_id")
          .in("id", memberIds)
      : { data: [] as { id: string; linked_user_id: string | null }[] };
    allowed = recipients.some(
      (r) =>
        r.share_checklist &&
        (members ?? []).some(
          (m) => m.id === r.family_member_id && m.linked_user_id === user.id
        )
    );
  } else {
    const { data: link } = await admin
      .from("family_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("linked_user_id", ownerId)
      .limit(1)
      .maybeSingle();
    allowed = Boolean(link);
  }
  if (!allowed) return { ok: false, error: "操作する権限がありません。" };

  const { error } = await admin.from("inheritance_checklist_progress").upsert(
    {
      user_id: ownerId,
      procedure_key: procedureKey,
      done,
    },
    { onConflict: "user_id,procedure_key" }
  );
  if (error) {
    console.error("toggleFamilyChecklist error", error);
    return { ok: false, error: "保存に失敗しました。" };
  }
  return { ok: true };
}
