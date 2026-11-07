"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ExplicitRelRow, PersonRef } from "@/lib/familyTree/fromRows";
import type { MarriageStatus, ParentKind } from "@/lib/familyTree/types";

// 家系図:明示的な親族関係(離婚・再婚・「どの配偶者との子か」・養子・継子)の読み書き。
// テーブル family_relationships(supabase/migrations/20261107_family_relationships.sql)を使う。
// テーブルがまだ無い環境では available: false を返し、画面は「お試し(保存しない)」で動く。

const MARRIAGE_STATUSES: MarriageStatus[] = ["married", "divorced", "widowed", "common_law"];
const PARENT_KINDS: ParentKind[] = ["biological", "legal", "adoptive", "special_adoptive", "step"];

type DbRow = {
  id: string;
  type: "parent_child" | "marriage";
  a_account_id: string | null;
  a_member_id: string | null;
  b_account_id: string | null;
  b_member_id: string | null;
  parent_kind: ParentKind | null;
  marriage_status: MarriageStatus | null;
  marriage_order: number | null;
};

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (/family_relationships/.test(error.message ?? "") &&
      /(does not exist|schema cache)/.test(error.message ?? ""))
  );
}

function toExplicit(r: DbRow): ExplicitRelRow {
  return {
    id: r.id,
    type: r.type,
    a: { accountId: r.a_account_id, memberId: r.a_member_id },
    b: { accountId: r.b_account_id, memberId: r.b_member_id },
    parentKind: r.parent_kind,
    marriageStatus: r.marriage_status,
    marriageOrder: r.marriage_order,
  };
}

export type ListRelationshipsResult =
  | { ok: true; available: true; relationships: ExplicitRelRow[] }
  | { ok: true; available: false; relationships: [] }
  | { ok: false; error: string };

export async function listFamilyRelationships(): Promise<ListRelationshipsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインしてください。" };

  const { data, error } = await supabase
    .from("family_relationships")
    .select(
      "id, type, a_account_id, a_member_id, b_account_id, b_member_id, parent_kind, marriage_status, marriage_order"
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  if (isMissingTable(error)) return { ok: true, available: false, relationships: [] };
  if (error) {
    console.error("listFamilyRelationships error", error);
    return { ok: false, error: "親族関係の読み込みに失敗しました。" };
  }
  return { ok: true, available: true, relationships: ((data ?? []) as DbRow[]).map(toExplicit) };
}

export type RelationshipInput =
  | { type: "marriage"; a: PersonRef; b: PersonRef; marriageStatus: MarriageStatus; marriageOrder?: number | null }
  | { type: "parent_child"; parent: PersonRef; child: PersonRef; parentKind: ParentKind };

export type SaveRelationshipResult = { ok: true; id: string } | { ok: false; error: string; unavailable?: boolean };

function refColumns(prefix: "a" | "b", ref: PersonRef) {
  const accountId = ref.accountId || null;
  const memberId = accountId ? null : ref.memberId || null;
  return { [`${prefix}_account_id`]: accountId, [`${prefix}_member_id`]: memberId };
}

function sameRef(x: PersonRef, y: PersonRef): boolean {
  if (x.accountId && y.accountId) return x.accountId === y.accountId;
  if (x.memberId && y.memberId) return x.memberId === y.memberId;
  return false;
}

export async function addFamilyRelationship(input: RelationshipInput): Promise<SaveRelationshipResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインしてください。" };

  const a = input.type === "marriage" ? input.a : input.parent;
  const b = input.type === "marriage" ? input.b : input.child;
  if (!(a.accountId || a.memberId) || !(b.accountId || b.memberId)) {
    return { ok: false, error: "人を2人選んでください。" };
  }
  if (sameRef(a, b)) return { ok: false, error: "同じ人どうしは登録できません。" };

  let fields: Record<string, unknown>;
  if (input.type === "marriage") {
    if (!MARRIAGE_STATUSES.includes(input.marriageStatus)) return { ok: false, error: "夫婦の状態を選んでください。" };
    const order = input.marriageOrder ?? null;
    if (order !== null && (!Number.isInteger(order) || order < 1 || order > 20)) {
      return { ok: false, error: "結婚の順番は1〜20で入れてください。" };
    }
    fields = { type: "marriage", marriage_status: input.marriageStatus, marriage_order: order };
  } else {
    if (!PARENT_KINDS.includes(input.parentKind)) return { ok: false, error: "親子の種類を選んでください。" };
    fields = { type: "parent_child", parent_kind: input.parentKind };
  }

  const { data, error } = await supabase
    .from("family_relationships")
    .insert({ owner_id: user.id, ...fields, ...refColumns("a", a), ...refColumns("b", b) })
    .select("id")
    .single();

  if (isMissingTable(error)) {
    return { ok: false, unavailable: true, error: "保存の準備がまだできていません(データベースの準備待ち)。" };
  }
  if (error || !data) {
    console.error("addFamilyRelationship error", error);
    return { ok: false, error: "保存できませんでした。もう一度お試しください。" };
  }
  revalidatePath("/family-tree");
  return { ok: true, id: (data as { id: string }).id };
}

export async function deleteFamilyRelationship(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインしてください。" };

  const { error } = await supabase.from("family_relationships").delete().eq("id", id).eq("owner_id", user.id);
  if (error) {
    console.error("deleteFamilyRelationship error", error);
    return { ok: false, error: "削除できませんでした。" };
  }
  revalidatePath("/family-tree");
  return { ok: true };
}
