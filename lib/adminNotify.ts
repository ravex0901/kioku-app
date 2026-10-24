import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

// 運営が「もしもの時」の開示を承認したとき、本人と直接つながっているご家族に
// アプリ内で知らせる(サーバー側の管理用クライアントから呼ぶ)。
export async function notifyHandoverApproved(
  adminClient: SupabaseClient<Database>,
  ownerId: string
) {
  const { data: linked } = await adminClient
    .from("family_members")
    .select("linked_user_id")
    .eq("user_id", ownerId)
    .not("linked_user_id", "is", null);

  const recipientIds = [
    ...new Set((linked ?? []).map((r) => r.linked_user_id as string)),
  ];
  if (recipientIds.length === 0) return;

  await adminClient.from("family_notifications").upsert(
    recipientIds.map((id) => ({
      recipient_id: id,
      sender_id: ownerId,
      kind: "handover_approved" as const,
      dedupe_key: "approved",
      payload: {},
      read_at: null,
    })),
    { onConflict: "recipient_id,sender_id,kind,dedupe_key" }
  );
}
