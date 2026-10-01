"use server";

import { createClient } from "@/lib/supabase/server";
import type { FamilyRelation } from "@/lib/types";

// 家族招待(本人のアカウントでサインアップ/ログインして紐付ける)機能。
// 息子・孫など、代々このアプリを引き継いでいく「家族アプリ」としての土台になる。
// 招待された側がアカウントを作らない場合は、これまで通り共有リンク(もしもの時など)のみで閲覧する。

export type InviteInfo =
  | { found: false }
  | { found: true; alreadyLinked: true }
  | {
      found: true;
      alreadyLinked: false;
      inviteeName: string;
      relation: FamilyRelation;
      inviterName: string;
    };

/**
 * 招待リンク(トークン)から、招待者名・続柄などの情報を取得する(未ログインでも呼べる)。
 */
export async function getFamilyInviteInfo(token: string): Promise<InviteInfo> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_family_invite_info", {
    p_token: token,
  });
  if (error || !data) {
    return { found: false };
  }
  return data as unknown as InviteInfo;
}

export type AcceptInviteResult =
  | { ok: true; inviterUserId: string; inviterName: string | null }
  | { ok: false; error: string };

/**
 * ログイン済み(サインアップ直後含む)のユーザーが招待を受け入れて、招待者のfamily_membersに
 * 自分のアカウントを紐付ける。あわせて自分の家系図にも招待者が表示されるようにする。
 */
export async function acceptFamilyInvite(
  token: string,
  myRelationToInviter: FamilyRelation
): Promise<AcceptInviteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "ログインが必要です。" };
  }

  const { data, error } = await supabase.rpc("accept_family_invite", {
    p_token: token,
    p_my_relation_to_inviter: myRelationToInviter,
  });

  if (error || !data) {
    console.error("acceptFamilyInvite error", error);
    return { ok: false, error: "招待の受け入れに失敗しました。" };
  }

  const result = data as unknown as {
    ok: boolean;
    error?: string;
    inviterUserId?: string;
    inviterName?: string | null;
  };

  if (!result.ok || !result.inviterUserId) {
    return { ok: false, error: result.error ?? "招待の受け入れに失敗しました。" };
  }

  return {
    ok: true,
    inviterUserId: result.inviterUserId,
    inviterName: result.inviterName ?? null,
  };
}
