import type {
  GenerationHint,
  Gender,
  MarriageRel,
  MarriageStatus,
  ParentChildRel,
  ParentKind,
  SiblingRel,
  TreeInput,
  TreePerson,
} from "./types";

// データベースの行(family_members・家族ネットワーク・明示的な親族関係)から、
// 家系図エンジンの入力(TreeInput)を作る。
//
// 厳守すること:
//  - アカウント連携と血縁関係は別。「つながっただけ」で親子・兄弟・夫婦とは推定しない。
//    (関係は、登録された続柄、または明示的な親族関係の登録から作る)
//  - 同一人物かどうかは、アカウントID・明示的な紐づけでのみ判定する。名前が同じでも統合しない。
//  - 自分(閲覧者)に見る権限がある人・関係だけを入れる(権限のない情報は渡さない)。

export type FamilyRow = {
  id: string;
  ownerId: string;
  name: string;
  relation: string;
  linkedUserId: string | null;
  createdAt?: string | number | null;
  gender?: Gender | null;
  birthYear?: number | null;
  deathYear?: number | null;
  maidenName?: string | null;
  birthOrder?: number | null;
};

export type AccountNode = {
  userId: string;
  name: string;
  isDeceased?: boolean;
  canViewJournal?: boolean;
  photoUrl?: string | null;
};

export type PersonRef = { accountId?: string | null; memberId?: string | null };

export type ExplicitRelRow = {
  id: string;
  type: "parent_child" | "marriage" | "sibling";
  /** parent_child のときは親、それ以外は片方 */
  a: PersonRef;
  /** parent_child のときは子 */
  b: PersonRef;
  parentKind?: ParentKind | null;
  marriageStatus?: MarriageStatus | null;
  marriageOrder?: number | null;
};

export type BuildArgs = {
  viewerId: string;
  viewerName: string;
  viewerDeceased?: boolean;
  /** 閲覧者自身の行(未紐づけを含む)+ 家族ネットワーク内の人どうしをつなぐ行 */
  rows: FamilyRow[];
  /** 閲覧できるアカウント(閲覧者自身は含めても含めなくてもよい) */
  accounts: AccountNode[];
  explicit?: ExplicitRelRow[];
  /** 続柄の表示名を返す関数(UI側の familyRelationLabel を渡す) */
  relationLabel?: (relation: string) => string;
};

type RelationInfo = {
  /** 対象(T)の性別 */
  gender?: Gender;
  /** T が O の親/子/配偶者/兄弟 など */
  role: "parent" | "child" | "spouse" | "sibling" | "other";
  /** 世代の目安:gen(T) - gen(O) */
  delta: number;
  /** 兄弟の年長(-1)/年少(+1)、長子(-2) */
  rank?: number;
};

const RELATIONS: Record<string, RelationInfo> = {
  great_grandfather: { gender: "male", role: "other", delta: -3 },
  great_grandmother: { gender: "female", role: "other", delta: -3 },
  grandfather: { gender: "male", role: "other", delta: -2 },
  grandmother: { gender: "female", role: "other", delta: -2 },
  father: { gender: "male", role: "parent", delta: -1 },
  mother: { gender: "female", role: "parent", delta: -1 },
  uncle: { gender: "male", role: "other", delta: -1 },
  aunt: { gender: "female", role: "other", delta: -1 },
  older_brother: { gender: "male", role: "sibling", delta: 0, rank: -1 },
  older_sister: { gender: "female", role: "sibling", delta: 0, rank: -1 },
  younger_brother: { gender: "male", role: "sibling", delta: 0, rank: 1 },
  younger_sister: { gender: "female", role: "sibling", delta: 0, rank: 1 },
  spouse: { role: "spouse", delta: 0 },
  son: { gender: "male", role: "child", delta: 1 },
  daughter: { gender: "female", role: "child", delta: 1 },
  eldest_son: { gender: "male", role: "child", delta: 1, rank: -2 },
  eldest_daughter: { gender: "female", role: "child", delta: 1, rank: -2 },
  grandson: { gender: "male", role: "other", delta: 2 },
  granddaughter: { gender: "female", role: "other", delta: 2 },
  great_grandson: { gender: "male", role: "other", delta: 3 },
  great_granddaughter: { gender: "female", role: "other", delta: 3 },
  other: { role: "other", delta: 0 },
};

const accountPid = (userId: string) => `a:${userId}`;
const memberPid = (rowId: string) => `m:${rowId}`;

function toMillis(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
}

export function buildTreeInput(args: BuildArgs): TreeInput {
  const label = args.relationLabel ?? ((r: string) => r);
  const accountById = new Map(args.accounts.map((a) => [a.userId, a]));
  const viewerPid = accountPid(args.viewerId);

  const persons = new Map<string, TreePerson>();
  const addAccount = (userId: string): TreePerson => {
    const pid = accountPid(userId);
    let p = persons.get(pid);
    if (!p) {
      const acc = accountById.get(userId);
      p = {
        id: pid,
        accountId: userId,
        name: userId === args.viewerId ? args.viewerName : acc?.name || "ご家族",
        isSelf: userId === args.viewerId,
        isDeceased: userId === args.viewerId ? !!args.viewerDeceased : !!acc?.isDeceased,
        photoUrl: acc?.photoUrl ?? undefined,
        href: acc?.canViewJournal && userId !== args.viewerId ? `/journal/view/${userId}` : undefined,
        relationLabel: userId === args.viewerId ? "本人" : undefined,
        labelRank: userId === args.viewerId ? 0 : undefined,
      };
      persons.set(pid, p);
    }
    return p;
  };
  addAccount(args.viewerId);
  for (const acc of args.accounts) {
    if (acc.userId !== args.viewerId) addAccount(acc.userId);
  }

  // 行 → 人物(未紐づけの人は行IDで1人)
  const rowsSorted = [...args.rows].sort(
    (a, b) => toMillis(a.createdAt) - toMillis(b.createdAt) || (a.id < b.id ? -1 : 1)
  );
  const rowById = new Map(rowsSorted.map((r) => [r.id, r]));
  const personForRow = (row: FamilyRow): string | null => {
    if (row.linkedUserId) {
      // 見る権限のないアカウントは載せない
      if (!accountById.has(row.linkedUserId) && row.linkedUserId !== args.viewerId) return null;
      return addAccount(row.linkedUserId).id;
    }
    // 未紐づけの人は、閲覧者自身が登録した人だけ表示する(他の人の未紐づけの家族は見せない)
    if (row.ownerId !== args.viewerId) return null;
    const pid = memberPid(row.id);
    if (!persons.has(pid)) {
      persons.set(pid, {
        id: pid,
        name: row.name,
        gender: row.gender ?? RELATIONS[row.relation]?.gender,
        birthYear: row.birthYear ?? undefined,
        deathYear: row.deathYear ?? undefined,
        maidenName: row.maidenName ?? undefined,
        birthOrder: row.birthOrder ?? undefined,
        relationLabel: label(row.relation),
        createdAt: toMillis(row.createdAt),
      });
    }
    return pid;
  };

  const parentChild: ParentChildRel[] = [];
  const marriages: MarriageRel[] = [];
  const siblings: SiblingRel[] = [];
  const hints: GenerationHint[] = [];
  let order = 0;

  for (const row of rowsSorted) {
    const info = RELATIONS[row.relation] ?? RELATIONS.other;
    // 持ち主(O)側の人物
    let ownerPid: string;
    if (row.ownerId === args.viewerId) {
      ownerPid = viewerPid;
    } else {
      // 他の人の行は、その人が閲覧できるアカウントのときだけ使う
      if (!accountById.has(row.ownerId)) continue;
      ownerPid = addAccount(row.ownerId).id;
    }
    const targetPid = personForRow(row);
    if (!targetPid || targetPid === ownerPid) continue;
    const target = persons.get(targetPid) as TreePerson;
    const owner = persons.get(ownerPid) as TreePerson;
    const base = row.ownerId === args.viewerId ? 10 : 20;
    const priority = base + order++ / 100000;

    // 閲覧者自身の行は、続柄・性別・順序の情報を人物に反映する
    if (row.ownerId === args.viewerId) {
      if (target.id !== viewerPid) {
        target.relationLabel = target.relationLabel ?? label(row.relation);
        if (info.gender && !target.gender) target.gender = info.gender;
        if (info.rank !== undefined && target.labelRank === undefined) target.labelRank = info.rank;
        if (row.birthOrder != null) target.birthOrder = row.birthOrder;
        if (row.birthYear != null) target.birthYear = row.birthYear;
        if (row.deathYear != null) target.deathYear = row.deathYear;
        if (row.maidenName) target.maidenName = row.maidenName;
      }
    } else if (info.gender && !target.gender) {
      target.gender = info.gender;
    }

    switch (info.role) {
      case "parent":
        parentChild.push({
          id: `pc:${targetPid}>${ownerPid}:biological`,
          parentId: targetPid,
          childId: ownerPid,
          kind: "biological",
          priority,
        });
        break;
      case "child":
        parentChild.push({
          id: `pc:${ownerPid}>${targetPid}:biological`,
          parentId: ownerPid,
          childId: targetPid,
          kind: "biological",
          priority,
        });
        break;
      case "spouse":
        marriages.push({
          id: `m:${[ownerPid, targetPid].sort().join("+")}`,
          a: ownerPid,
          b: targetPid,
          status: "married",
          priority,
        });
        break;
      case "sibling": {
        siblings.push({
          id: `s:${[ownerPid, targetPid].sort().join("~")}`,
          a: ownerPid,
          b: targetPid,
          kind: "unknown",
          priority,
        });
        // 他の人の行でも、兄弟どうしの年長・年少は分かる
        if (row.ownerId !== args.viewerId && info.rank !== undefined && target.labelRank === undefined) {
          target.labelRank = (owner.labelRank ?? 0) + info.rank;
        }
        break;
      }
      default:
        break;
    }
    // 祖父母・おじおば・孫など、間にだれがいるか分からない続柄は、線は引かず、
    // 世代の行を揃えるための目安(hint)としてだけ使う。
    if (info.role === "other" && row.relation !== "other") {
      hints.push({
        id: `h:${ownerPid}>${targetPid}:${info.delta}`,
        from: ownerPid,
        to: targetPid,
        delta: info.delta,
        priority,
      });
    }
  }

  // 明示的な親族関係(最優先)
  for (const e of args.explicit ?? []) {
    const resolveRef = (ref: PersonRef): string | null => {
      if (ref.accountId) {
        if (!accountById.has(ref.accountId) && ref.accountId !== args.viewerId) return null;
        return addAccount(ref.accountId).id;
      }
      if (ref.memberId) {
        const row = rowById.get(ref.memberId);
        if (!row) return null;
        return personForRow(row);
      }
      return null;
    };
    const pa = resolveRef(e.a);
    const pb = resolveRef(e.b);
    if (!pa || !pb || pa === pb) continue;
    if (e.type === "parent_child") {
      parentChild.push({
        id: `x:${e.id}`,
        parentId: pa,
        childId: pb,
        kind: e.parentKind ?? "biological",
        priority: 1,
      });
    } else if (e.type === "marriage") {
      marriages.push({
        id: `x:${e.id}`,
        a: pa,
        b: pb,
        status: e.marriageStatus ?? "married",
        order: e.marriageOrder ?? undefined,
        priority: 1,
      });
    } else {
      siblings.push({ id: `x:${e.id}`, a: pa, b: pb, kind: "unknown", priority: 1 });
    }
  }

  // 同じ関係を両側(「Aの息子B」「Bの父A」)から登録している場合は、1つにまとめる(優先度の高い方を残す)。
  const uniq = <T extends { id: string; priority: number }>(list: T[]): T[] => {
    const map = new Map<string, T>();
    for (const r of list) {
      const cur = map.get(r.id);
      if (!cur || r.priority < cur.priority) map.set(r.id, r);
    }
    return [...map.values()];
  };

  return {
    viewerId: viewerPid,
    persons: [...persons.values()],
    parentChild: uniq(parentChild),
    marriages: uniq(marriages),
    siblings: uniq(siblings),
    hints: uniq(hints),
  };
}
