// 本人から見た「続き柄」を、つながりをたどって割り出す(画面・サーバーのどちらからも使える純粋な関数)。
//
// 使いみち:
//   1. 家系図に出す人の範囲を決める(範囲外の人は出さない)
//   2. 範囲内で、まだ本人の家族欄にいない人を、正しい続柄で自動追加する
//
// 範囲(2026-11-11 オーナー決定):
//   - 本人の家系:曽祖父母〜曾孫(子や孫の配偶者を含む)、おじ・おば、いとこ、甥・姪
//   - 兄弟姉妹:本人とその配偶者まで(兄弟の配偶者の家族は出さない)
//   - 配偶者の家系:配偶者の親・兄弟姉妹・祖父母まで
//
// 守ること:
//   - 双方向の行がそろったつながり(お互いが認めたもの)だけをたどる
//   - 同じ人は 1 人分だけ。いちばん近い道(つながりの数が少ない道)の続柄を採用する
//   - 「元配偶者」「その他」など、続き柄が決められない行からは先をたどらない

export type KinEdge = { fromUserId: string; toUserId: string; relation: string };

export type Kin =
  | "self"
  | "spouse"
  | "parent"
  | "grandparent"
  | "great_grandparent"
  | "child"
  | "grandchild"
  | "great_grandchild"
  | "sibling"
  | "sibling_spouse"
  | "sibling_in_law"
  | "child_spouse"
  | "grandchild_spouse"
  | "uncle_aunt"
  | "cousin"
  | "nephew_niece"
  | "spouse_parent"
  | "spouse_sibling"
  | "spouse_grandparent";

export type Gender = "male" | "female";

export type KinInfo = {
  userId: string;
  kin: Kin;
  /** 本人からのつながりの数 */
  hops: number;
  gender?: Gender;
  /** 兄弟姉妹のとき、本人より年上か(分からなければ undefined) */
  older?: boolean;
};

// 続柄 → 線の種類(cat)と、相手の性別・年上かどうか
type EdgeCat =
  | "parent"
  | "child"
  | "sibling"
  | "spouse"
  | "grandparent"
  | "grandchild"
  | "great_grandparent"
  | "great_grandchild"
  | "uncle_aunt"
  | "nephew_niece"
  | "cousin"
  | "spouse_parent"
  | "spouse_grandparent"
  | "sibling_in_law"
  | "child_in_law"
  | "grandchild_in_law";

const REL: Record<string, { cat: EdgeCat; gender?: Gender; older?: boolean }> = {
  father: { cat: "parent", gender: "male" },
  mother: { cat: "parent", gender: "female" },
  son: { cat: "child", gender: "male" },
  daughter: { cat: "child", gender: "female" },
  eldest_son: { cat: "child", gender: "male" },
  eldest_daughter: { cat: "child", gender: "female" },
  older_brother: { cat: "sibling", gender: "male", older: true },
  younger_brother: { cat: "sibling", gender: "male", older: false },
  older_sister: { cat: "sibling", gender: "female", older: true },
  younger_sister: { cat: "sibling", gender: "female", older: false },
  brother: { cat: "sibling", gender: "male" },
  sister: { cat: "sibling", gender: "female" },
  spouse: { cat: "spouse" },
  grandfather: { cat: "grandparent", gender: "male" },
  grandmother: { cat: "grandparent", gender: "female" },
  grandson: { cat: "grandchild", gender: "male" },
  granddaughter: { cat: "grandchild", gender: "female" },
  great_grandfather: { cat: "great_grandparent", gender: "male" },
  great_grandmother: { cat: "great_grandparent", gender: "female" },
  great_grandson: { cat: "great_grandchild", gender: "male" },
  great_granddaughter: { cat: "great_grandchild", gender: "female" },
  uncle: { cat: "uncle_aunt", gender: "male" },
  aunt: { cat: "uncle_aunt", gender: "female" },
  nephew: { cat: "nephew_niece", gender: "male" },
  niece: { cat: "nephew_niece", gender: "female" },
  cousin: { cat: "cousin" },
  father_in_law: { cat: "spouse_parent", gender: "male" },
  mother_in_law: { cat: "spouse_parent", gender: "female" },
  grandfather_in_law: { cat: "spouse_grandparent", gender: "male" },
  grandmother_in_law: { cat: "spouse_grandparent", gender: "female" },
  sibling_in_law: { cat: "sibling_in_law" },
  son_in_law: { cat: "child_in_law", gender: "male" },
  daughter_in_law: { cat: "child_in_law", gender: "female" },
  grandchild_in_law: { cat: "grandchild_in_law" },
};

// (今の人の続き柄) × (その人から見た次の人の続柄) → 次の人の続き柄。表にない組み合わせは範囲外。
const COMPOSE: Partial<Record<Kin, Partial<Record<EdgeCat, Kin>>>> = {
  self: {
    parent: "parent",
    child: "child",
    sibling: "sibling",
    spouse: "spouse",
    grandparent: "grandparent",
    grandchild: "grandchild",
    great_grandparent: "great_grandparent",
    great_grandchild: "great_grandchild",
    uncle_aunt: "uncle_aunt",
    nephew_niece: "nephew_niece",
    cousin: "cousin",
    spouse_parent: "spouse_parent",
    spouse_grandparent: "spouse_grandparent",
    sibling_in_law: "sibling_in_law",
    child_in_law: "child_spouse",
    grandchild_in_law: "grandchild_spouse",
  },
  parent: {
    parent: "grandparent",
    grandparent: "great_grandparent",
    sibling: "uncle_aunt",
    child: "sibling",
    spouse: "parent",
  },
  grandparent: { parent: "great_grandparent", spouse: "grandparent" },
  great_grandparent: { spouse: "great_grandparent" },
  child: {
    child: "grandchild",
    grandchild: "great_grandchild",
    spouse: "child_spouse",
    sibling: "child",
    child_in_law: "grandchild_spouse",
  },
  grandchild: { child: "great_grandchild", spouse: "grandchild_spouse", sibling: "grandchild" },
  great_grandchild: { sibling: "great_grandchild" },
  sibling: {
    spouse: "sibling_spouse",
    child: "nephew_niece",
    sibling: "sibling",
    parent: "parent",
    grandparent: "grandparent",
    great_grandparent: "great_grandparent",
    uncle_aunt: "uncle_aunt",
    cousin: "cousin",
  },
  uncle_aunt: { child: "cousin", parent: "grandparent", spouse: "uncle_aunt" },
  cousin: { sibling: "cousin", parent: "uncle_aunt" },
  nephew_niece: { sibling: "nephew_niece" },
  spouse: { parent: "spouse_parent", sibling: "spouse_sibling", grandparent: "spouse_grandparent", child: "child" },
  // 配偶者の親の子 = 配偶者の兄弟姉妹(配偶者本人は先に「配偶者」として決まっている)
  spouse_parent: { parent: "spouse_grandparent", spouse: "spouse_parent", child: "spouse_sibling" },
  spouse_grandparent: { spouse: "spouse_grandparent" },
  spouse_sibling: { sibling: "spouse_sibling" },
};

// 同じ数のつながりで複数の続き柄になるときの優先順(前ほど優先)
const PRIORITY: Kin[] = [
  "self",
  "spouse",
  "parent",
  "child",
  "sibling",
  "grandparent",
  "grandchild",
  "great_grandparent",
  "great_grandchild",
  "spouse_parent",
  "spouse_sibling",
  "spouse_grandparent",
  "child_spouse",
  "grandchild_spouse",
  "sibling_spouse",
  "sibling_in_law",
  "uncle_aunt",
  "nephew_niece",
  "cousin",
];
const rank = (k: Kin) => PRIORITY.indexOf(k);

/** 双方向の行がそろったつながりだけを残す(from → to と to → from の両方がある) */
function mutualEdges(edges: KinEdge[]): KinEdge[] {
  const keys = new Set(edges.map((e) => `${e.fromUserId}>${e.toUserId}`));
  return edges.filter((e) => e.fromUserId !== e.toUserId && keys.has(`${e.toUserId}>${e.fromUserId}`));
}

/** ほかの人が登録した続柄から、その人の性別を推定する(多数決。分からなければ undefined) */
export function inferGender(userId: string, edges: KinEdge[], profileGender?: string | null): Gender | undefined {
  if (profileGender === "male" || profileGender === "female") return profileGender;
  let m = 0;
  let f = 0;
  for (const e of edges) {
    if (e.toUserId !== userId) continue;
    const g = REL[e.relation]?.gender;
    if (g === "male") m++;
    if (g === "female") f++;
  }
  if (m > f) return "male";
  if (f > m) return "female";
  return undefined;
}

/**
 * 本人から見た続き柄を割り出す。範囲外の人は結果に入らない。
 * genders:プロフィールに登録された性別(あれば優先)
 */
export function computeKinship(
  viewerId: string,
  allEdges: KinEdge[],
  opts: { genders?: Record<string, string | null | undefined> } = {}
): Map<string, KinInfo> {
  const edges = mutualEdges(allEdges);
  const out = new Map<string, KinInfo>();
  out.set(viewerId, { userId: viewerId, kin: "self", hops: 0 });

  const byFrom = new Map<string, KinEdge[]>();
  for (const e of edges) {
    const list = byFrom.get(e.fromUserId) ?? [];
    list.push(e);
    byFrom.set(e.fromUserId, list);
  }

  // 1 つながりずつ広げる(同じ数のつながりで届く候補から、優先順で 1 つ選ぶ)
  let frontier = [viewerId];
  for (let hops = 1; frontier.length > 0 && hops <= 12; hops++) {
    const candidates = new Map<string, Kin>();
    for (const u of frontier) {
      const uk = out.get(u)!.kin;
      for (const e of byFrom.get(u) ?? []) {
        if (out.has(e.toUserId)) continue;
        const cat = REL[e.relation]?.cat;
        if (!cat) continue;
        const next = COMPOSE[uk]?.[cat];
        if (!next) continue;
        const cur = candidates.get(e.toUserId);
        if (!cur || rank(next) < rank(cur)) candidates.set(e.toUserId, next);
      }
    }
    frontier = [];
    for (const [id, kin] of candidates) {
      out.set(id, { userId: id, kin, hops });
      frontier.push(id);
    }
  }

  // 性別・年上かどうか
  for (const info of out.values()) {
    if (info.kin === "self") continue;
    info.gender = inferGender(info.userId, edges, opts.genders?.[info.userId]);
    if (info.kin === "sibling") {
      // 本人が相手をどう登録しているか(older_brother など)、または相手が本人をどう登録しているか
      const mine = edges.find((e) => e.fromUserId === viewerId && e.toUserId === info.userId);
      const theirs = edges.find((e) => e.fromUserId === info.userId && e.toUserId === viewerId);
      const a = mine ? REL[mine.relation]?.older : undefined;
      const b = theirs ? REL[theirs.relation]?.older : undefined;
      if (a !== undefined) info.older = a;
      else if (b !== undefined) info.older = !b;
    }
  }
  return out;
}

const pick = (g: Gender | undefined, male: string, female: string) => (g === "male" ? male : g === "female" ? female : "other");

function siblingName(g: Gender | undefined, older: boolean | undefined): string {
  if (!g) return "other";
  if (older === undefined) return g === "male" ? "brother" : "sister";
  if (g === "male") return older ? "older_brother" : "younger_brother";
  return older ? "older_sister" : "younger_sister";
}

/** 本人の家族欄に入れる続柄(本人から見たその人) */
export function forwardRelation(info: KinInfo): string {
  const g = info.gender;
  switch (info.kin) {
    case "self":
      return "other";
    case "spouse":
      return "spouse";
    case "parent":
      return pick(g, "father", "mother");
    case "grandparent":
      return pick(g, "grandfather", "grandmother");
    case "great_grandparent":
      return pick(g, "great_grandfather", "great_grandmother");
    case "child":
      return pick(g, "son", "daughter");
    case "grandchild":
      return pick(g, "grandson", "granddaughter");
    case "great_grandchild":
      return pick(g, "great_grandson", "great_granddaughter");
    case "sibling":
      return siblingName(g, info.older);
    case "sibling_spouse":
    case "spouse_sibling":
    case "sibling_in_law":
      return "sibling_in_law";
    case "child_spouse":
      return pick(g, "son_in_law", "daughter_in_law");
    case "grandchild_spouse":
      return "grandchild_in_law";
    case "uncle_aunt":
      return pick(g, "uncle", "aunt");
    case "cousin":
      return "cousin";
    case "nephew_niece":
      return pick(g, "nephew", "niece");
    case "spouse_parent":
      return pick(g, "father_in_law", "mother_in_law");
    case "spouse_grandparent":
      return pick(g, "grandfather_in_law", "grandmother_in_law");
  }
}

/** 相手の家族欄に入れる続柄(その人から見た本人)。viewerGender は本人の性別 */
export function inverseRelation(info: KinInfo, viewerGender: Gender | undefined): string {
  const g = viewerGender;
  switch (info.kin) {
    case "self":
      return "other";
    case "spouse":
      return "spouse";
    case "parent":
      return pick(g, "son", "daughter");
    case "grandparent":
      return pick(g, "grandson", "granddaughter");
    case "great_grandparent":
      return pick(g, "great_grandson", "great_granddaughter");
    case "child":
      return pick(g, "father", "mother");
    case "grandchild":
      return pick(g, "grandfather", "grandmother");
    case "great_grandchild":
      return pick(g, "great_grandfather", "great_grandmother");
    case "sibling":
      return siblingName(g, info.older === undefined ? undefined : !info.older);
    case "sibling_spouse":
    case "spouse_sibling":
    case "sibling_in_law":
      return "sibling_in_law";
    case "child_spouse":
      return pick(g, "father_in_law", "mother_in_law");
    case "grandchild_spouse":
      return pick(g, "grandfather_in_law", "grandmother_in_law");
    case "uncle_aunt":
      return pick(g, "nephew", "niece");
    case "cousin":
      return "cousin";
    case "nephew_niece":
      return pick(g, "uncle", "aunt");
    case "spouse_parent":
      return pick(g, "son_in_law", "daughter_in_law");
    case "spouse_grandparent":
      return "grandchild_in_law";
  }
}

/** 1 人しかいない立場(名前だけの登録と、見つかったアカウントを同じ人とみなす) */
export const UNIQUE_SLOTS = new Set(["father", "mother", "spouse"]);

export type MemberRow = {
  id: string;
  user_id: string;
  name: string;
  relation: string;
  linked_user_id: string | null;
};

export type LinkOp =
  | { kind: "link_existing"; rowId: string; owner: string; other: string; relation: string }
  | { kind: "insert"; owner: string; other: string; relation: string; name: string };

/**
 * 自動追加で行う書き込みを決める(書き込みはしない)。
 * - 範囲内で、本人とまだつながっていない人 → 本人側と相手側の行(なければ)
 * - 名前だけの行が同じ立場(父・母・配偶者)、または同じ続柄かつ同じ名前なら、その行をつなぐ
 * - excluded(紐づけを解除した相手)は加えない
 */
export function planAutoLinks(args: {
  viewerId: string;
  edges: KinEdge[];
  rows: MemberRow[];
  excluded: Set<string>;
  names: Map<string, string>;
  genders?: Record<string, string | null | undefined>;
}): LinkOp[] {
  const { viewerId, edges, excluded, names } = args;
  const rows = args.rows.map((r) => ({ ...r }));
  const kinship = computeKinship(viewerId, edges, { genders: args.genders });
  const viewerGender = inferGender(viewerId, edges, args.genders?.[viewerId]);
  const viewerName = names.get(viewerId) ?? "ご家族";
  const ops: LinkOp[] = [];

  const hasLink = (owner: string, other: string) => rows.some((r) => r.user_id === owner && r.linked_user_id === other);
  const add = (owner: string, other: string, relation: string, name: string) => {
    const slot = rows.find(
      (r) =>
        r.user_id === owner &&
        !r.linked_user_id &&
        r.relation === relation &&
        (UNIQUE_SLOTS.has(relation) || r.name.trim() === name.trim())
    );
    if (slot) {
      slot.linked_user_id = other;
      ops.push({ kind: "link_existing", rowId: slot.id, owner, other, relation });
    } else {
      rows.push({ id: "", user_id: owner, name, relation, linked_user_id: other });
      ops.push({ kind: "insert", owner, other, relation, name });
    }
  };

  for (const info of kinship.values()) {
    if (info.kin === "self" || excluded.has(info.userId)) continue;
    const other = info.userId;
    if (!hasLink(viewerId, other)) add(viewerId, other, forwardRelation(info), names.get(other) ?? "ご家族");
    if (!hasLink(other, viewerId)) add(other, viewerId, inverseRelation(info, viewerGender), viewerName);
  }
  return ops;
}
