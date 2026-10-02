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
    // 「招待した方が、自分(ログイン中のユーザー)から見て何にあたるか」を渡す。
    // (例)招待した方が父親なら relation = "father" を渡す。
    p_inviter_relation_to_me: myRelationToInviter,
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

export type LinkByEmailResult =
  | { ok: true; targetName: string }
  | { ok: false; error: string };

/**
 * 招待リンクを使わずに、既に相手が持っているアカウントのメールアドレスを
 * 指定して、その場で双方向に家族として紐付ける。
 * (すでにアカウントを持っている家族が、招待リンク経由で別アカウントを
 *  二重に作ってしまう混乱を避けるための機能)
 */
export async function linkFamilyByEmail(
  email: string,
  relation: FamilyRelation
): Promise<LinkByEmailResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("link_family_by_email", {
    p_email: email,
    p_relation: relation,
  });

  if (error || !data) {
    console.error("linkFamilyByEmail error", error);
    return { ok: false, error: "追加に失敗しました。もう一度お試しください。" };
  }

  const result = data as unknown as {
    ok: boolean;
    error?: string;
    targetName?: string;
  };

  if (!result.ok) {
    return { ok: false, error: result.error ?? "追加に失敗しました。" };
  }

  return { ok: true, targetName: result.targetName ?? "" };
}
