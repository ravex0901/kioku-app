"use server";

import { createClient } from "@/lib/supabase/server";
import type { FamilyRelation } from "@/lib/types";

// 家系図:直接の家族だけでなく、承認済みのつながりをたどって合流した
// 家族ネットワーク全体(ノードとエッジ)を取得する。
//
// 重要:ここで返されるのは「家系図にどう表示されるか」の情報だけで、
// 日記・持ち物などの閲覧権限(can_view_family_content によるRLS)には一切影響しない。
// canViewJournal / canViewItems は、既存のそのルールをそのまま反映した値。

export type FamilyTreeNode = {
  userId: string;
  name: string;
  hopCount: number;
  generationDelta: number;
  isDeceased: boolean;
  isSelf: boolean;
  canViewJournal: boolean;
  canViewItems: boolean;
};

export type FamilyTreeEdge = {
  fromUserId: string;
  toUserId: string;
  relation: FamilyRelation;
};

export type FamilyTreeGraphResult =
  | { ok: true; selfUserId: string; nodes: FamilyTreeNode[]; edges: FamilyTreeEdge[] }
  | { ok: false; error: string };

export async function getFamilyTreeGraph(): Promise<FamilyTreeGraphResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_family_tree_graph");

  if (error || !data) {
    console.error("getFamilyTreeGraph error", error);
    return { ok: false, error: "家系図の取得に失敗しました。" };
  }

  const result = data as unknown as {
    ok: boolean;
    error?: string;
    selfUserId?: string;
    nodes?: FamilyTreeNode[];
    edges?: FamilyTreeEdge[];
  };

  if (!result.ok) {
    return { ok: false, error: result.error ?? "家系図の取得に失敗しました。" };
  }

  return {
    ok: true,
    selfUserId: result.selfUserId ?? "",
    nodes: result.nodes ?? [],
    edges: result.edges ?? [],
  };
}

export type UnlinkFamilyMemberResult = { ok: true } | { ok: false; error: string };

/**
 * 直接つながっている相手とのアカウントの紐づけを解除する。
 * 紐づけの申請・承認という手続き自体は変更しない(解除のみ)。
 * 解除すると、相手経由でだけつながっていた間接の家族ネットワークも、
 * 家系図からは自動的に外れる(都度 get_family_tree_graph で再計算されるため)。
 */
export async function unlinkFamilyMember(
  linkedUserId: string
): Promise<UnlinkFamilyMemberResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unlink_family_member", {
    p_linked_user_id: linkedUserId,
  });

  if (error || !data) {
    console.error("unlinkFamilyMember error", error);
    return { ok: false, error: "解除に失敗しました。もう一度お試しください。" };
  }

  const result = data as unknown as { ok: boolean; error?: string };
  if (!result.ok) {
    return { ok: false, error: result.error ?? "解除に失敗しました。" };
  }
  return { ok: true };
}
