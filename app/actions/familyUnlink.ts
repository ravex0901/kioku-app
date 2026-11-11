"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFamilyTreeGraph } from "@/app/actions/familyTree";
import { FAMILY_RELATION_OPTIONS } from "@/lib/constants";
import { relationshipsTableAvailable } from "@/lib/familyRelationshipsDb";
import { analyzeUnlink, type Dependent, type ImpactNode } from "@/lib/familyTree/unlinkImpact";
import type { FamilyMember, FamilyRelation } from "@/lib/types";

// 「紐づけを解除」の先の選択:
//   - 離別 … アカウントのつながりは切る(相手は日記・持ち物などを見られなくなる)。
//            家系図には「元配偶者」として残し、点々線でつなぐ。
//   - 削除 … アカウントのつながりを切り、家系図からも消す。
//            相手を通じてだけつながっていた人は、ひとりずつ「残す/残さない」を選べる。
//            残した人は、アプリのつながりのない家族(名前だけ)としてご本人の家族に登録する。
// 保存先テーブル(family_relationships)がまだ無い間は「お試し」で、何も書き込まずに結果だけ返す。

const SEPARABLE = new Set(["spouse", "ex_spouse", "other"]);
const RELATION_VALUES = new Set<string>([...FAMILY_RELATION_OPTIONS.map((o) => o.value), "ex_spouse"]);

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type UnlinkPreview = {
  ok: true;
  /** false のときは「お試し」:押しても実際には解除しない */
  available: boolean;
  name: string;
  relation: string;
  /** 「離別」を選べるか(配偶者・元配偶者・続柄未設定の方) */
  canSeparate: boolean;
  /** 解除しても、別の方を通じて家系図に残るか */
  removedStillConnected: boolean;
  via: ImpactNode[];
  dependents: Dependent[];
};

type Ctx = {
  supabase: ServerClient;
  userId: string;
  member: FamilyMember;
  available: boolean;
  impact: ReturnType<typeof analyzeUnlink>;
};

async function loadContext(linkedUserId: string): Promise<Ctx | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインしてください。" };
  if (!linkedUserId || linkedUserId === user.id) return { error: "指定が正しくありません。" };

  const { data: member } = await supabase
    .from("family_members")
    .select("*")
    .eq("user_id", user.id)
    .eq("linked_user_id", linkedUserId)
    .maybeSingle();
  if (!member) return { error: "直接つながっているご家族のみ解除できます。" };

  const [graph, available] = await Promise.all([getFamilyTreeGraph(), relationshipsTableAvailable(supabase)]);
  if (!graph.ok) return { error: graph.error };

  const impact = analyzeUnlink({
    viewerId: user.id,
    removedId: linkedUserId,
    removedRelation: (member as FamilyMember).relation,
    nodes: graph.nodes.map((n) => ({ userId: n.userId, name: n.name })),
    edges: graph.edges,
  });
  return { supabase, userId: user.id, member: member as FamilyMember, available, impact };
}

export async function previewUnlink(linkedUserId: string): Promise<UnlinkPreview | { ok: false; error: string }> {
  const ctx = await loadContext(linkedUserId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  return {
    ok: true,
    available: ctx.available,
    name: ctx.member.name,
    relation: ctx.member.relation,
    canSeparate: SEPARABLE.has(ctx.member.relation),
    removedStillConnected: ctx.impact.removedStillConnected,
    via: ctx.impact.via,
    dependents: ctx.impact.dependents,
  };
}

export type UnlinkResult =
  | {
      ok: true;
      /** true のときは「お試し」で、何も変更していない */
      dryRun: boolean;
      /** ご本人の家族一覧に新しく加わった行(元配偶者・残した方) */
      added: FamilyMember[];
    }
  | { ok: false; error: string };

/** 解除した相手を、家系図の自動追加で付け直さないよう、双方向に記録する */
async function recordExclusion(userId: string, otherUserId: string) {
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin.from("family_auto_link_exclusions").upsert(
    [
      { user_id: userId, other_user_id: otherUserId },
      { user_id: otherUserId, other_user_id: userId },
    ],
    { onConflict: "user_id,other_user_id", ignoreDuplicates: true }
  );
  if (error) console.error("recordExclusion error", error);
}

async function unlinkRpc(supabase: ServerClient, linkedUserId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("unlink_family_member", { p_linked_user_id: linkedUserId });
  if (error || !data) {
    console.error("unlink_family_member error", error);
    return "解除に失敗しました。もう一度お試しください。";
  }
  const r = data as unknown as { ok: boolean; error?: string };
  return r.ok ? null : r.error ?? "解除に失敗しました。";
}

/** つながりの登録(family_relationships)で、アカウントで指していた人を、名前だけの家族に付け替える */
async function moveRefsToMember(ctx: Ctx, accountId: string, memberId: string) {
  const { supabase, userId } = ctx;
  await supabase
    .from("family_relationships")
    .update({ a_account_id: null, a_member_id: memberId })
    .eq("owner_id", userId)
    .eq("a_account_id", accountId);
  await supabase
    .from("family_relationships")
    .update({ b_account_id: null, b_member_id: memberId })
    .eq("owner_id", userId)
    .eq("b_account_id", accountId);
}

async function insertNameOnlyMember(ctx: Ctx, name: string, relation: FamilyRelation): Promise<FamilyMember | null> {
  // 招待リンク(invite_token)を付けない = 「家系図に残すために登録した方」。家系図に表示される。
  const { data, error } = await ctx.supabase
    .from("family_members")
    .insert({ user_id: ctx.userId, name, relation, invite_token: null })
    .select("*")
    .single();
  if (error || !data) {
    console.error("insertNameOnlyMember error", error);
    return null;
  }
  return data as FamilyMember;
}

/** 離別:つながりは切り、家系図には元配偶者として点々線で残す */
export async function separateFamilyMember(linkedUserId: string): Promise<UnlinkResult> {
  const ctx = await loadContext(linkedUserId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!SEPARABLE.has(ctx.member.relation)) {
    return { ok: false, error: "離別は、配偶者の方だけ選べます。" };
  }
  if (!ctx.available) return { ok: true, dryRun: true, added: [] };

  const err = await unlinkRpc(ctx.supabase, linkedUserId);
  if (err) return { ok: false, error: err };
  await recordExclusion(ctx.userId, linkedUserId);

  const added: FamilyMember[] = [];
  // 夫婦の登録が残っていれば消して、「離別」として登録し直す
  await ctx.supabase
    .from("family_relationships")
    .delete()
    .eq("owner_id", ctx.userId)
    .eq("type", "marriage")
    .or(`a_account_id.eq.${linkedUserId},b_account_id.eq.${linkedUserId}`);

  if (ctx.impact.removedStillConnected) {
    // お子さんなどを通じて相手が家系図に残る:同じ方を2人出さないよう、アカウントのまま離別の線を引く
    const { error } = await ctx.supabase.from("family_relationships").insert({
      owner_id: ctx.userId,
      type: "marriage",
      a_account_id: ctx.userId,
      b_account_id: linkedUserId,
      marriage_status: "divorced",
    });
    if (error) {
      console.error("separate: insert marriage error", error);
      return { ok: false, error: "つながりは解除しましたが、離別の線を登録できませんでした。家系図の画面から登録し直してください。" };
    }
  } else {
    const m = await insertNameOnlyMember(ctx, ctx.member.name, "ex_spouse");
    if (!m) {
      return { ok: false, error: "つながりは解除しましたが、家系図に残す登録ができませんでした。家系図の画面から前の配偶者として追加してください。" };
    }
    added.push(m);
    await moveRefsToMember(ctx, linkedUserId, m.id);
  }

  revalidatePath("/family-tree");
  revalidatePath("/settings");
  return { ok: true, dryRun: false, added };
}

/** 削除:つながりを切り、家系図から消す。keepUserIds の方は名前だけの家族として残す */
export async function removeFamilyMember(linkedUserId: string, keepUserIds: string[]): Promise<UnlinkResult> {
  const ctx = await loadContext(linkedUserId);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  // 残せるのは、解除で一緒に消える方だけ(サーバー側で計算し直したものだけを使う)
  const keepSet = new Set(keepUserIds);
  const keep = ctx.impact.dependents.filter((d) => keepSet.has(d.userId));
  if (!ctx.available) return { ok: true, dryRun: true, added: [] };

  const err = await unlinkRpc(ctx.supabase, linkedUserId);
  if (err) return { ok: false, error: err };
  await recordExclusion(ctx.userId, linkedUserId);

  const added: FamilyMember[] = [];
  const failed: string[] = [];
  for (const d of keep) {
    const rel = (RELATION_VALUES.has(d.suggestedRelation) ? d.suggestedRelation : "other") as FamilyRelation;
    const m = await insertNameOnlyMember(ctx, d.name, rel);
    if (!m) {
      failed.push(d.name);
      continue;
    }
    added.push(m);
    await moveRefsToMember(ctx, d.userId, m.id);
  }

  // 家系図から消える方を指していた、つながりの登録は消す
  if (!ctx.impact.removedStillConnected) {
    await ctx.supabase
      .from("family_relationships")
      .delete()
      .eq("owner_id", ctx.userId)
      .or(`a_account_id.eq.${linkedUserId},b_account_id.eq.${linkedUserId}`);
  }

  revalidatePath("/family-tree");
  revalidatePath("/settings");
  if (failed.length) {
    return {
      ok: false,
      error: `削除はしましたが、${failed.join("、")}さんを残す登録ができませんでした。家系図の下の「家族」の欄から登録し直してください。`,
    };
  }
  return { ok: true, dryRun: false, added };
}
