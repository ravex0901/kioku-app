"use server";

import { createClient } from "@/lib/supabase/server";
import type { FamilyNotification } from "@/lib/types";

// 家系図でつながっているご家族からのアプリ内通知
// (今日の調子・ボイスメッセージ・タイムカプセルが届いたお知らせ)。

export async function getMyFamilyNotifications(): Promise<FamilyNotification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase.rpc("get_my_family_notifications");
  if (error) {
    console.error("getMyFamilyNotifications error", error);
    return [];
  }
  return (data as unknown as FamilyNotification[]) ?? [];
}

export async function markFamilyNotificationsRead(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが必要です。" };

  const { error } = await supabase.rpc("mark_family_notifications_read");
  if (error) {
    console.error("markFamilyNotificationsRead error", error);
    return { ok: false, error: "更新に失敗しました。" };
  }
  return { ok: true };
}
