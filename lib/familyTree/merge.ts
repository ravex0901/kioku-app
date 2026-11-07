import type { MarriageRel, ParentChildRel, SiblingRel, TreeInput, TreePerson } from "./types";

// 共同家系図の自動統合。
//
// - 各アカウントが登録した人物・関係(Contribution)を材料に、承認済みのアカウント連携でつながった
//   グループごとに1つの共同家系図を作る。連鎖(A-B, C-D, A-C → A,B,C,D)も自動で一つになる。
// - 同一人物の判定は「同じID」「承認済みのアカウント紐付け」「明示的な統合の承認」だけ。
//   同姓同名・同じ生年だけでは統合せず、候補として権限者に提示する。
// - 統合しても元のID・元データは捨てず、MergeRecord に残す(取り消し可能)。
// - アカウント連携は血縁を意味しない。連携しただけで親子・夫婦の関係は作らない。

export type Contribution = {
  accountId: string;
  persons: TreePerson[];
  parentChild: ParentChildRel[];
  marriages: MarriageRel[];
  siblings: SiblingRel[];
};

export type AccountLink = { a: string; b: string; status: "approved" | "pending" | "revoked" };

/** 同一人物であると明示的に承認された組(承認者つき) */
export type IdentityConfirmation = { personA: string; personB: string; confirmedBy: string; revoked?: boolean };

export type MergeRecord = {
  canonicalId: string;
  /** 統合された元のID(canonical自身を含む) */
  sourceIds: string[];
  reason: "same_id" | "same_account" | "confirmed";
};

export type DuplicateCandidate = {
  personA: string;
  personB: string;
  /** 一致した材料(自動統合はしない) */
  evidence: ("name" | "birthYear" | "maidenName")[];
};

export type MergedTree = {
  groupId: string;
  accounts: string[];
  input: TreeInput;
  merges: MergeRecord[];
  candidates: DuplicateCandidate[];
  counts: {
    /** 登録された人物の延べ数(重複を含む) */
    registered: number;
    /** 重複統合後の固有人物数 */
    unique: number;
  };
};

class UF {
  private p = new Map<string, string>();
  find(x: string): string {
    if (!this.p.has(x)) this.p.set(x, x);
    let r = x;
    while (this.p.get(r) !== r) r = this.p.get(r) as string;
    let c = x;
    while (this.p.get(c) !== r) {
      const n = this.p.get(c) as string;
      this.p.set(c, r);
      c = n;
    }
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    // 辞書順で小さい方を代表にして、処理順に依存しない結果にする
    if (ra < rb) this.p.set(rb, ra);
    else this.p.set(ra, rb);
  }
}

/** 承認済みの連携でつながったアカウントのグループ。 */
export function accountGroups(accountIds: string[], links: AccountLink[]): string[][] {
  const uf = new UF();
  for (const a of accountIds) uf.find(a);
  for (const l of links) {
    if (l.status !== "approved") continue;
    uf.union(l.a, l.b);
  }
  const g = new Map<string, string[]>();
  for (const a of accountIds) {
    const r = uf.find(a);
    g.set(r, [...(g.get(r) ?? []), a]);
  }
  return [...g.values()].map((x) => x.sort()).sort((x, y) => (x[0] < y[0] ? -1 : 1));
}

function norm(s: string | undefined): string {
  return (s ?? "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

export function mergeAll(
  contributions: Contribution[],
  links: AccountLink[],
  confirmations: IdentityConfirmation[] = []
): MergedTree[] {
  const accountIds = [...new Set(contributions.map((c) => c.accountId))];
  const groups = accountGroups(accountIds, links);
  const byAccount = new Map<string, Contribution[]>();
  for (const c of contributions) byAccount.set(c.accountId, [...(byAccount.get(c.accountId) ?? []), c]);
  return groups.map((accounts) => mergeGroup(accounts, accounts.flatMap((a) => byAccount.get(a) ?? []), confirmations));
}

function mergeGroup(accounts: string[], contribs: Contribution[], confirmations: IdentityConfirmation[]): MergedTree {
  const uf = new UF();
  const all: TreePerson[] = [];
  for (const c of contribs) for (const p of c.persons) all.push(p);

  // 1) 同じID → 同一人物(登録の重複)。ひもづいたアカウントが同じ → 同一人物。
  const byAccount = new Map<string, string[]>();
  const reasonOf = new Map<string, MergeRecord["reason"]>();
  for (const p of all) {
    uf.find(p.id);
    if (p.accountId) byAccount.set(p.accountId, [...(byAccount.get(p.accountId) ?? []), p.id]);
  }
  for (const ids of byAccount.values()) {
    for (const id of ids.slice(1)) {
      if (uf.find(id) !== uf.find(ids[0])) reasonOf.set(id, "same_account");
      uf.union(ids[0], id);
    }
  }
  // 2) 明示的な承認(両方の人物がこのグループに存在する場合のみ有効)
  const present = new Set(all.map((p) => p.id));
  for (const c of confirmations) {
    if (c.revoked) continue;
    if (!present.has(c.personA) || !present.has(c.personB)) continue;
    if (uf.find(c.personA) !== uf.find(c.personB)) reasonOf.set(c.personB, "confirmed");
    uf.union(c.personA, c.personB);
  }

  const canon = (id: string) => uf.find(id);

  // 人物: 代表IDにまとめる。情報は「先に埋まっている方」を採用し、空欄だけ他方から補う(上書きしない)。
  const persons = new Map<string, TreePerson>();
  const sources = new Map<string, Set<string>>();
  const sorted = [...all].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || (a.id < b.id ? -1 : 1));
  for (const p of sorted) {
    const cid = canon(p.id);
    sources.set(cid, (sources.get(cid) ?? new Set()).add(p.id));
    const cur = persons.get(cid);
    if (!cur) {
      persons.set(cid, { ...p, id: cid });
    } else {
      persons.set(cid, {
        ...cur,
        accountId: cur.accountId ?? p.accountId,
        isSelf: cur.isSelf || p.isSelf,
        isDeceased: cur.isDeceased || p.isDeceased,
        gender: cur.gender && cur.gender !== "unknown" ? cur.gender : p.gender,
        birthYear: cur.birthYear ?? p.birthYear,
        deathYear: cur.deathYear ?? p.deathYear,
        maidenName: cur.maidenName ?? p.maidenName,
        photoUrl: cur.photoUrl ?? p.photoUrl,
        href: cur.href ?? p.href,
        birthOrder: cur.birthOrder ?? p.birthOrder,
      });
    }
  }

  // 関係: 代表IDに付け替え、同じ内容は一つにまとめる(親子は親・子・種類、婚姻は組と状態)。
  const pcMap = new Map<string, ParentChildRel>();
  const mMap = new Map<string, MarriageRel>();
  const sMap = new Map<string, SiblingRel>();
  for (const c of contribs) {
    for (const r of c.parentChild) {
      const parentId = canon(r.parentId);
      const childId = canon(r.childId);
      const key = `${parentId}>${childId}:${r.kind}`;
      const prev = pcMap.get(key);
      if (!prev || r.priority < prev.priority) pcMap.set(key, { ...r, id: key, parentId, childId });
    }
    for (const r of c.marriages) {
      const a = canon(r.a);
      const b = canon(r.b);
      const [x, y] = a < b ? [a, b] : [b, a];
      const key = `${x}+${y}:${r.status}`;
      const prev = mMap.get(key);
      if (!prev || r.priority < prev.priority) mMap.set(key, { ...r, id: key, a: x, b: y });
    }
    for (const r of c.siblings) {
      const a = canon(r.a);
      const b = canon(r.b);
      const [x, y] = a < b ? [a, b] : [b, a];
      const key = `${x}~${y}`;
      const prev = sMap.get(key);
      if (!prev || r.priority < prev.priority) sMap.set(key, { ...r, id: key, a: x, b: y });
    }
  }

  // 重複候補(名前・生年が似ているだけ。統合はしない)
  const list = [...persons.values()];
  const candidates: DuplicateCandidate[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.accountId && b.accountId && a.accountId !== b.accountId) continue; // 別アカウントの本人同士は別人
      const evidence: DuplicateCandidate["evidence"] = [];
      if (norm(a.name) && norm(a.name) === norm(b.name)) evidence.push("name");
      if (a.birthYear !== undefined && a.birthYear === b.birthYear) evidence.push("birthYear");
      if (a.maidenName && norm(a.maidenName) === norm(b.maidenName)) evidence.push("maidenName");
      if (evidence.includes("name") || (evidence.includes("birthYear") && evidence.includes("maidenName"))) {
        const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        candidates.push({ personA: x, personB: y, evidence });
      }
    }
  }

  const merges: MergeRecord[] = [];
  for (const [cid, set] of sources) {
    if (set.size > 1) {
      const ids = [...set].sort();
      merges.push({
        canonicalId: cid,
        sourceIds: ids,
        reason: ids.some((i) => reasonOf.get(i) === "confirmed")
          ? "confirmed"
          : ids.some((i) => reasonOf.get(i) === "same_account")
            ? "same_account"
            : "same_id",
      });
    }
  }

  const sortedPersons = [...persons.values()].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || (a.id < b.id ? -1 : 1));
  return {
    groupId: accounts[0],
    accounts,
    input: {
      persons: sortedPersons,
      parentChild: [...pcMap.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
      marriages: [...mMap.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
      siblings: [...sMap.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
      hints: [],
    },
    merges,
    candidates,
    counts: { registered: all.length, unique: persons.size },
  };
}
