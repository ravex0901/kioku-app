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
//            相手を通じてつながっていた人(家系図の自動追加で本人とつながった相手の家族も含む)も、
//            本人とのアカウントのつながりを解除して家系図から外す(2026-11-11 オーナー決定)。
//            ひとりずつ「残す/残さない」を選べ、残した人はアプリのつながりのない家族(名前だけ)として登録する。
//
// 「相手を通じてつながっていた人」は、家系図の自動追加でできたつながり(双方の行が invite_token なし)を
// 除いて計算する。自動追加のつながりは、もとになった誰かのつながりから作られたものなので、
// それだけでは「本人と直接つながっている」とはみなさない。
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
  /** 自動追加でない線(解除の計算に使う) */
  manualEdges: { fromUserId: string; toUserId: string; relation: string }[];
  /** 自動追加だけでできたつながり(双方の行とも招待トークンなし) */
  autoPairs: [string, string][];
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

  const [graph, available, { data: myRows }] = await Promise.all([
    getFamilyTreeGraph(),
    relationshipsTableAvailable(supabase),
    supabase.from("family_members").select("linked_user_id, relation").eq("user_id", user.id),
  ]);
  if (!graph.ok) return { error: graph.error };

  // 自動追加だけでできたつながり(双方の行とも招待トークンなし)を除いた線で計算する
  const admin = createAdminClient();
  const split = admin
    ? await splitAutoEdges(admin, graph.nodes.map((n) => n.userId), graph.edges)
    : { manualEdges: graph.edges, autoPairs: [] as [string, string][] };
  const edges = split.manualEdges;
  const autoPairs = split.autoPairs;

  const impact = analyzeUnlink({
    viewerId: user.id,
    removedId: linkedUserId,
    removedRelation: (member as FamilyMember).relation,
    nodes: graph.nodes.map((n) => ({ userId: n.userId, name: n.name })),
    edges,
  });
  // 残すときの続柄:本人がすでにその人とつながっていれば、その続柄をそのまま使う
  const myRelation = new Map<string, string>();
  for (const r of (myRows ?? []) as { linked_user_id: string | null; relation: string }[]) {
    if (r.linked_user_id) myRelation.set(r.linked_user_id, r.relation);
  }
  for (const d of impact.dependents) {
    const r = myRelation.get(d.userId);
    if (r) d.suggestedRelation = r;
  }
  return { supabase, userId: user.id, member: member as FamilyMember, available, impact, manualEdges: edges, autoPairs };
}

/**
 * 自動追加のつながりは、もとになったつながり(自動追加でない線)でつながっている間だけ残す。
 * 解除によって、もとのつながりが切れた自動追加のつながり(ほかのご家族どうしのものも含む)を消す。
 */
async function pruneOrphanedAutoLinks(ctx: Pick<Ctx, "manualEdges" | "autoPairs">, cut: [string, string]) {
  const isCut = (a: string, b: string) => (a === cut[0] && b === cut[1]) || (a === cut[1] && b === cut[0]);
  await pruneAutoLinksWhere(ctx, isCut);
}

async function pruneAutoLinksWhere(
  ctx: Pick<Ctx, "manualEdges" | "autoPairs">,
  removed: (a: string, b: string) => boolean
) {
  const admin = createAdminClient();
  if (!admin || ctx.autoPairs.length === 0) return;
  const comp = (skipCut: boolean) => {
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let p = parent.get(x) ?? x;
      if (p !== x) {
        p = find(p);
        parent.set(x, p);
      }
      return p;
    };
    for (const e of ctx.manualEdges) {
      if (skipCut && removed(e.fromUserId, e.toUserId)) continue;
      parent.set(find(e.fromUserId), find(e.toUserId));
    }
    return find;
  };
  const before = comp(false);
  const after = comp(true);
  for (const [a, b] of ctx.autoPairs) {
    if (before(a) === before(b) && after(a) !== after(b)) {
      const { error } = await admin
        .from("family_members")
        .delete()
        .or(`and(user_id.eq.${a},linked_user_id.eq.${b}),and(user_id.eq.${b},linked_user_id.eq.${a})`)
        .is("invite_token", null);
      if (error) console.error("pruneOrphanedAutoLinks error", error);
    }
  }
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

type Edge = { fromUserId: string; toUserId: string; relation: string };

/** 家系図の線を、自動追加でない線(manualEdges)と、自動追加だけでできた組(autoPairs)に分ける */
async function splitAutoEdges(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  ids: string[],
  allEdges: Edge[]
): Promise<{ manualEdges: Edge[]; autoPairs: [string, string][] }> {
  if (ids.length === 0) return { manualEdges: allEdges, autoPairs: [] };
  const { data: rows } = await admin
    .from("family_members")
    .select("user_id, linked_user_id, invite_token")
    .in("user_id", ids)
    .not("linked_user_id", "is", null);
  const auto = new Set((rows ?? []).filter((r) => !r.invite_token).map((r) => `${r.user_id}>${r.linked_user_id}`));
  const isAutoPair = (e: Edge) => auto.has(`${e.fromUserId}>${e.toUserId}`) && auto.has(`${e.toUserId}>${e.fromUserId}`);
  return {
    manualEdges: allEdges.filter((e) => !isAutoPair(e)),
    autoPairs: allEdges.filter((e) => e.fromUserId < e.toUserId && isAutoPair(e)).map((e) => [e.fromUserId, e.toUserId]),
  };
}

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

  // 相手を通じてつながっていた人も、本人とのアカウントのつながりを解除し、自動で付け直さないようにする
  for (const d of ctx.impact.dependents) {
    const { data: direct } = await ctx.supabase
      .from("family_members")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("linked_user_id", d.userId)
      .maybeSingle();
    if (direct) {
      const e = await unlinkRpc(ctx.supabase, d.userId);
      if (e) console.error("remove: unlink dependent failed", d.userId, e);
    }
    await recordExclusion(ctx.userId, d.userId);
  }
  // もとのつながりが切れた自動追加のつながり(ほかのご家族どうしのもの)も消す
  await pruneOrphanedAutoLinks(ctx, [ctx.userId, linkedUserId]);

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

// ---------------------------------------------------------------------------
// 離縁(2026-11-18 オーナー決定)
//   家系図のつながりは残したまま、相手と「相手だけにつながっている人」(離婚なら相手の親など)と、
//   お互いの写真・持ち物・日記・ボイス・タイムカプセル・お知らせを見えなくする。
//   見えなくするのは DB の family_content_blocks(内容を見せる関数・ポリシーが確かめる)。
//   配偶者なら、家系図の線を離婚(点々線)にする。
// ---------------------------------------------------------------------------

export type RienPreview =
  | { ok: true; name: string; relation: string; isSpouse: boolean; others: ImpactNode[] }
  | { ok: false; error: string };

/** 離縁すると見えなくなる人(相手と、相手だけにつながっている人) */
export async function previewRien(linkedUserId: string): Promise<RienPreview> {
  const ctx = await loadContext(linkedUserId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  return {
    ok: true,
    name: ctx.member.name,
    relation: ctx.member.relation,
    isSpouse: SPOUSE_LIKE.has(ctx.member.relation),
    others: ctx.impact.dependents.map((d) => ({ userId: d.userId, name: d.name })),
  };
}

const SPOUSE_LIKE = new Set(["spouse", "ex_spouse"]);

export async function rienFamilyMember(linkedUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await loadContext(linkedUserId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "いまは離縁できません(サーバーの設定がありません)。" };

  const targets = [linkedUserId, ...ctx.impact.dependents.map((d) => d.userId)];
  const rows = targets.flatMap((t) => [
    { user_id: ctx.userId, other_user_id: t, origin_user_id: linkedUserId },
    { user_id: t, other_user_id: ctx.userId, origin_user_id: linkedUserId },
  ]);
  const { error } = await admin
    .from("family_content_blocks")
    .upsert(rows, { onConflict: "user_id,other_user_id", ignoreDuplicates: true });
  if (error) {
    console.error("rien: insert blocks failed", error);
    return { ok: false, error: "離縁できませんでした。もう一度お試しください。" };
  }

  // 配偶者なら、双方の家系図で線を離婚(点々線)にする
  if (SPOUSE_LIKE.has(ctx.member.relation) && ctx.available) {
    for (const owner of [ctx.userId, linkedUserId]) {
      const other = owner === ctx.userId ? linkedUserId : ctx.userId;
      await admin
        .from("family_relationships")
        .delete()
        .eq("owner_id", owner)
        .eq("type", "marriage")
        .or(
          `and(a_account_id.eq.${owner},b_account_id.eq.${other}),and(a_account_id.eq.${other},b_account_id.eq.${owner})`
        );
      const { error: mErr } = await admin.from("family_relationships").insert({
        owner_id: owner,
        type: "marriage",
        a_account_id: owner,
        b_account_id: other,
        marriage_status: "divorced",
      });
      if (mErr) console.error("rien: divorced line failed", owner, mErr);
    }
  }

  revalidatePath("/family-tree");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 家系図から自分を切り離す(2026-11-18 オーナー決定)
//   本人の家族欄をすべて消し(名前だけの家族・招待リンクも含む)、
//   ほかの方の家族欄にある本人とのつながりも消す。本人を通じてだけできていた
//   自動追加のつながり(ほかのご家族どうしのもの)も消す。取り消せない。
// ---------------------------------------------------------------------------

export async function detachFromFamilyTree(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインしてください。" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "いまは切り離せません(サーバーの設定がありません)。" };

  // 消す前の家系図(本人を通じてだけできていた自動追加のつながりを見つけるため)
  const graph = await getFamilyTreeGraph();
  const edges = graph.ok ? await splitAutoEdges(admin, graph.nodes.map((n) => n.userId), graph.edges) : null;

  const steps = [
    admin.from("family_members").delete().or(`user_id.eq.${user.id},linked_user_id.eq.${user.id}`),
    admin.from("family_relationships").delete().eq("owner_id", user.id),
    admin.from("family_content_blocks").delete().or(`user_id.eq.${user.id},other_user_id.eq.${user.id}`),
    admin.from("family_auto_link_exclusions").delete().or(`user_id.eq.${user.id},other_user_id.eq.${user.id}`),
  ];
  for (const step of steps) {
    const { error } = await step;
    // 保存先の表がまだない(family_relationships)ときは飛ばす
    if (error && error.code !== "42P01") {
      console.error("detachFromFamilyTree error", error);
      return { ok: false, error: "切り離しの途中で失敗しました。もう一度お試しください。" };
    }
  }

  if (edges) {
    await pruneAutoLinksWhere(edges, (a, b) => a === user.id || b === user.id);
  }

  revalidatePath("/family-tree");
  revalidatePath("/settings");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 復縁(2026-11-18 オーナー決定):離縁を取り消す。家系図で離縁した方をタップして行う。
//   その離縁で一緒に見えなくした方(相手だけにつながっていた方)の分もまとめて戻す。
//   配偶者の離縁で引いた離婚の線(家系図の点々線)も消す。
// ---------------------------------------------------------------------------

export async function reconcileFamilyMember(otherUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインしてください。" };
  if (!otherUserId || otherUserId === user.id) return { ok: false, error: "指定が正しくありません。" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "いまは復縁できません(サーバーの設定がありません)。" };

  // 本人の離縁の記録(本人の行だけ読める)
  const { data: block } = await supabase
    .from("family_content_blocks")
    .select("origin_user_id")
    .eq("user_id", user.id)
    .eq("other_user_id", otherUserId)
    .maybeSingle();
  if (!block) return { ok: false, error: "この方とは離縁していません。" };
  const origin = block.origin_user_id ?? otherUserId;

  const { error } = await admin
    .from("family_content_blocks")
    .delete()
    .eq("origin_user_id", origin)
    .or(`user_id.eq.${user.id},other_user_id.eq.${user.id}`);
  if (error) {
    console.error("reconcile: delete blocks failed", error);
    return { ok: false, error: "復縁できませんでした。もう一度お試しください。" };
  }
  // 起点の記録がない古い行のため、この 2 人の行も消す
  await admin
    .from("family_content_blocks")
    .delete()
    .or(
      `and(user_id.eq.${user.id},other_user_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},other_user_id.eq.${user.id})`
    );

  // 離縁で引いた離婚の線を消す(双方の家系図)
  for (const owner of [user.id, origin]) {
    const other = owner === user.id ? origin : user.id;
    const { error: mErr } = await admin
      .from("family_relationships")
      .delete()
      .eq("owner_id", owner)
      .eq("type", "marriage")
      .eq("marriage_status", "divorced")
      .or(`and(a_account_id.eq.${owner},b_account_id.eq.${other}),and(a_account_id.eq.${other},b_account_id.eq.${owner})`);
    if (mErr && mErr.code !== "42P01") console.error("reconcile: remove divorced line failed", mErr);
  }

  revalidatePath("/family-tree");
  return { ok: true };
}
