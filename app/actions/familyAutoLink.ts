"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeKinship, forwardRelation, planAutoLinks, type KinEdge, type MemberRow } from "@/lib/familyTree/kinship";
import { fitRelationToGender } from "@/lib/constants";
import type { FamilyRelation } from "@/lib/types";

// 家系図の範囲内(lib/familyTree/kinship.ts)の人を、本人の家族欄に自動で加える(2026-11-11 オーナー決定)。
//
// - 範囲内で、まだ本人とつながっていないアカウントの人を見つけたら、双方の家族欄に行を作る。
//   (本当の家族として登録するので、お互いに「直接の家族」になる)
// - 本人が名前だけで登録していた人と同じ立場(父・母・配偶者)なら、新しく作らずにその行をつなぐ。
//   ほかの立場は、続柄と名前の両方が同じときだけつなぐ。
// - 「紐づけを解除」した相手(family_auto_link_exclusions)は、自動で付け直さない。
// - たどるのは、お互いが認めたつながり(双方向の行)だけ。DB の get_family_tree_graph がそれだけを返す。
// - 本人の行で続柄が「その他」のまま(申請の承認・招待で仮に入る)のものは、
//   相手側の登録とつながりから割り出した続柄に直す(割り出せなければそのまま)。
// - 相手がプロフィールで性別を登録していて、続柄がその性別と食い違うもの(女性なのに「父」など)は、
//   同じ立場の続柄に直す(「父」→「母」)。
// - 相手側の行は RLS では作れないため、サーバー側の管理用クライアントで書く。
//   どの人を加えるかは、この関数の中で DB のデータから計算し直す(画面から相手を指定させない)。

export type SyncResult = { ok: true; added: number } | { ok: false; error: string };

export async function syncAutoFamily(): Promise<SyncResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインしてください。" };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "自動追加の設定がありません。" };

  const { data: graphData, error: graphError } = await supabase.rpc("get_family_tree_graph");
  if (graphError || !graphData) return { ok: false, error: "家系図の取得に失敗しました。" };
  const graph = graphData as unknown as {
    ok: boolean;
    nodes?: { userId: string; name: string }[];
    edges?: KinEdge[];
  };
  if (!graph.ok) return { ok: false, error: "家系図の取得に失敗しました。" };
  const edges = graph.edges ?? [];
  const nameOf = new Map((graph.nodes ?? []).map((n) => [n.userId, n.name]));

  const ids = [...new Set([user.id, ...(graph.nodes ?? []).map((n) => n.userId)])];
  const [{ data: details }, { data: excl }, { data: rowsData }] = await Promise.all([
    admin.from("profile_details").select("user_id, gender").in("user_id", ids),
    admin.from("family_auto_link_exclusions").select("other_user_id").eq("user_id", user.id),
    admin.from("family_members").select("id, user_id, name, relation, linked_user_id").in("user_id", ids),
  ]);
  const genders = Object.fromEntries((details ?? []).map((d) => [d.user_id, d.gender]));
  const excluded = new Set((excl ?? []).map((e) => e.other_user_id));
  const rows = (rowsData ?? []) as MemberRow[];

  const ops = planAutoLinks({ viewerId: user.id, edges, rows, excluded, names: nameOf, genders });

  // 本人の行の続柄を直す(本人の行なので本人の権限で書く):
  //   ①「その他」のまま → 割り出せた続柄に  ② 相手の登録した性別と食い違う → 同じ立場の続柄に
  const kin = computeKinship(user.id, edges, { genders });
  for (const r of rows) {
    if (r.user_id !== user.id || !r.linked_user_id) continue;
    let rel = r.relation;
    if (rel === "other") {
      const info = kin.get(r.linked_user_id);
      if (info && info.kin !== "self") rel = forwardRelation(info);
    }
    rel = fitRelationToGender(rel, genders[r.linked_user_id]);
    if (rel === r.relation) continue;
    const { error } = await supabase
      .from("family_members")
      .update({ relation: rel as FamilyRelation })
      .eq("id", r.id)
      .eq("user_id", user.id)
      .eq("relation", r.relation);
    if (error) console.error("syncAutoFamily: fix relation failed", error);
    else r.relation = rel;
  }

  let added = 0;
  const now = new Date().toISOString();
  for (const op of ops) {
    if (op.kind === "link_existing") {
      const { error } = await admin
        .from("family_members")
        .update({ linked_user_id: op.other, linked_at: now, invite_token: null })
        .eq("id", op.rowId)
        .is("linked_user_id", null);
      if (error) {
        console.error("syncAutoFamily: link existing row failed", error);
        continue;
      }
    } else {
      const { error } = await admin.from("family_members").insert({
        user_id: op.owner,
        name: op.name,
        relation: op.relation as FamilyRelation,
        linked_user_id: op.other,
        linked_at: now,
        invite_token: null,
      });
      // 同時に開いた画面が先に作った場合(一意制約)は、作成済みとして扱う
      if (error && error.code !== "23505") {
        console.error("syncAutoFamily: insert failed", error);
        continue;
      }
    }
    if (op.owner === user.id) added++;
  }
  return { ok: true, added };
}
