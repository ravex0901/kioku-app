"use server";

import { createClient } from "@/lib/supabase/server";

// 「家族ネットワーク」機能(間接的な家族とのつながり・多世代対応)用のサーバーアクション。
// 直接の家族(family_members)だけでなく、そのまた家族…と無制限(安全のため30世代まで)に
// たどった「間接の家族」を取得したり、日記・持ち物の共有設定/故人設定を変更したりする。

export type ExtendedFamilyNetworkMember = {
  userId: string;
  name: string | null;
  hopCount: number;
  generationDelta: number;
  isDeceased: boolean;
  canViewJournal: boolean;
  canViewItems: boolean;
};

export type GetExtendedFamilyNetworkResult =
  | { ok: true; network: ExtendedFamilyNetworkMember[] }
  | { ok: false; error: string };

/**
 * 自分から見た「間接の家族」(2ホップ以上先でつながっている家族)の一覧を取得する。
 * 直接の家族(1ホップ)は、これまで通り family_members の一覧で表示するため含まれない。
 */
export async function getExtendedFamilyNetwork(): Promise<GetExtendedFamilyNetworkResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_extended_family_network");

  if (error || !data) {
    console.error("getExtendedFamilyNetwork error", error);
    return { ok: false, error: "間接のご家族の取得に失敗しました。" };
  }

  const result = data as unknown as {
    ok: boolean;
    error?: string;
    network?: ExtendedFamilyNetworkMember[];
  };

  if (!result.ok) {
    return { ok: false, error: result.error ?? "間接のご家族の取得に失敗しました。" };
  }

  return { ok: true, network: result.network ?? [] };
}

export type FamilyShareSettings = {
  shareJournalWithNetwork: boolean;
  shareItemsWithNetwork: boolean;
};

/**
 * 自分の「間接の家族にも日記・持ち物を共有するか」の設定を取得する。
 * (本人が生きている間は、本人だけがこの設定を変更できる)
 */
export async function getFamilyShareSettings(): Promise<FamilyShareSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_family_share_settings");

  if (error || !data) {
    console.error("getFamilyShareSettings error", error);
    return { shareJournalWithNetwork: false, shareItemsWithNetwork: false };
  }

  return data as unknown as FamilyShareSettings;
}

export type SimpleActionResult = { ok: true } | { ok: false; error: string };

/**
 * 自分の「間接の家族にも日記・持ち物を共有するか」の設定を変更する。
 */
export async function setFamilyShareSettings(
  shareJournalWithNetwork: boolean,
  shareItemsWithNetwork: boolean
): Promise<SimpleActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_family_share_settings", {
    p_share_journal: shareJournalWithNetwork,
    p_share_items: shareItemsWithNetwork,
  });

  if (error || !data) {
    console.error("setFamilyShareSettings error", error);
    return { ok: false, error: "設定の保存に失敗しました。" };
  }

  const result = data as unknown as { ok: boolean; error?: string };
  if (!result.ok) {
    return { ok: false, error: result.error ?? "設定の保存に失敗しました。" };
  }
  return { ok: true };
}

/**
 * 直接つながっている家族のアカウントを「故人」として設定/解除する。
 * (直接つながっている家族なら誰でも設定できる)
 */
export async function markFamilyMemberDeceased(
  linkedUserId: string,
  deceased: boolean
): Promise<SimpleActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_family_member_deceased", {
    p_user_id: linkedUserId,
    p_deceased: deceased,
  });

  if (error || !data) {
    console.error("markFamilyMemberDeceased error", error);
    return { ok: false, error: "設定の変更に失敗しました。" };
  }

  const result = data as unknown as { ok: boolean; error?: string };
  if (!result.ok) {
    return { ok: false, error: result.error ?? "設定の変更に失敗しました。" };
  }
  return { ok: true };
}

/**
 * 故人アカウントの、間接の家族(孫など)への共有可否の現在値を取得する。
 */
export async function getFamilyLegacyShare(
  deceasedUserId: string
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_family_legacy_share", {
    p_deceased_user_id: deceasedUserId,
  });
  if (error) {
    console.error("getFamilyLegacyShare error", error);
    return false;
  }
  return Boolean(data);
}

/**
 * 故人アカウントについて、間接の家族(孫など)に日記・持ち物を共有するかどうかを設定する。
 * (直接つながっている家族なら誰でも設定できる)
 */
export async function setFamilyLegacyShare(
  deceasedUserId: string,
  share: boolean
): Promise<SimpleActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_family_legacy_share", {
    p_deceased_user_id: deceasedUserId,
    p_share: share,
  });

  if (error || !data) {
    console.error("setFamilyLegacyShare error", error);
    return { ok: false, error: "設定の保存に失敗しました。" };
  }

  const result = data as unknown as { ok: boolean; error?: string };
  if (!result.ok) {
    return { ok: false, error: result.error ?? "設定の保存に失敗しました。" };
  }
  return { ok: true };
}
