"use server";

import { createClient } from "@/lib/supabase/server";
import type { FamilyRelation, PendingFamilyLinkRequest } from "@/lib/types";

// 「アカウントIDでつなぐ」を、即座につながる方式から
// 「申請→相手がホーム画面で許可するまでは何も反映されない」方式に変える。
// 相手が許可するまでは family_members に行が作られないため、家系図にも出てこない。

export type RequestFamilyLinkResult =
  | { ok: true; targetName: string; alreadyRequested?: boolean }
  | { ok: false; error: string };

/**
 * 相手のアカウントIDを指定して、家族連携の「申請」を送る。
 * この時点ではまだつながらない(相手が許可するまで待つ)。
 */
export async function requestFamilyLink(
  accountCode: string,
  relation: FamilyRelation
): Promise<RequestFamilyLinkResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_family_link", {
    p_account_code: accountCode,
    p_relation: relation,
  });

  if (error || !data) {
    console.error("requestFamilyLink error", error);
    return { ok: false, error: "申請に失敗しました。もう一度お試しください。" };
  }

  const result = data as unknown as {
    ok: boolean;
    error?: string;
    targetName?: string;
    alreadyRequested?: boolean;
  };

  if (!result.ok) {
    return { ok: false, error: result.error ?? "申請に失敗しました。" };
  }

  return {
    ok: true,
    targetName: result.targetName ?? "",
    alreadyRequested: result.alreadyRequested,
  };
}

/**
 * 自分宛てに届いている、まだ返事をしていない家族連携の申請一覧を取得する。
 * ホーム画面で「許可」ボタンとあわせて表示する。
 */
export async function getPendingFamilyLinkRequests(): Promise<
  PendingFamilyLinkRequest[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_pending_family_link_requests"
  );
  if (error || !data) {
    return [];
  }
  return data as unknown as PendingFamilyLinkRequest[];
}

export type RespondFamilyLinkRequestResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * 届いた申請を許可する。ここで初めて双方の family_members に行が作られ、
 * 家系図にも反映されるようになる。
 */
export async function approveFamilyLinkRequest(
  requestId: string
): Promise<RespondFamilyLinkRequestResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_family_link_request", {
    p_request_id: requestId,
  });

  if (error || !data) {
    console.error("approveFamilyLinkRequest error", error);
    return { ok: false, error: "許可に失敗しました。もう一度お試しください。" };
  }

  const result = data as unknown as { ok: boolean; error?: string };
  if (!result.ok) {
    return { ok: false, error: result.error ?? "許可に失敗しました。" };
  }
  return { ok: true };
}

/**
 * 届いた申請を断る(つながらない)。
 */
export async function declineFamilyLinkRequest(
  requestId: string
): Promise<RespondFamilyLinkRequestResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decline_family_link_request", {
    p_request_id: requestId,
  });

  if (error || !data) {
    console.error("declineFamilyLinkRequest error", error);
    return { ok: false, error: "操作に失敗しました。もう一度お試しください。" };
  }

  const result = data as unknown as { ok: boolean; error?: string };
  if (!result.ok) {
    return { ok: false, error: result.error ?? "操作に失敗しました。" };
  }
  return { ok: true };
}
