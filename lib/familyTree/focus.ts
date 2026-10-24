import { resolveModel } from "./resolve";
import type { TreeInput, TreePerson } from "./types";

// 家系図の「表示範囲」(世代別表示・直系のみ・近親のみ)と人物検索。
// データは変更せず、表示する人物だけを絞り込んだ TreeInput を返す。

export type FocusScope = "all" | "lineage" | "close";

export type FocusOptions = {
  scope: FocusScope;
  centerId: string;
  /** 中心の人物より上(祖先側)に何世代まで表示するか。null なら制限なし */
  generationsUp: number | null;
  /** 中心の人物より下(子孫側)に何世代まで表示するか。null なら制限なし */
  generationsDown: number | null;
};

export type FocusResult = {
  input: TreeInput;
  shown: number;
  hidden: number;
};

export function focusInput(input: TreeInput, opts: FocusOptions): FocusResult {
  const total = input.persons.length;
  const ids = new Set(input.persons.map((p) => p.id));
  if (!ids.has(opts.centerId)) return { input, shown: total, hidden: 0 };

  let keep = new Set(ids);

  if (opts.scope === "lineage") {
    keep = lineageOf(input, opts.centerId);
  } else if (opts.scope === "close") {
    keep = withinDistance(input, opts.centerId, 2);
  }

  if (opts.generationsUp !== null || opts.generationsDown !== null) {
    const model = resolveModel(input);
    const cg = model.gen.get(opts.centerId);
    const cf = model.frameOf.get(opts.centerId);
    if (cg !== undefined) {
      const next = new Set<string>();
      for (const id of keep) {
        if (id === opts.centerId) {
          next.add(id);
          continue;
        }
        if (model.frameOf.get(id) !== cf) continue;
        const g = model.gen.get(id) as number;
        const up = opts.generationsUp === null ? Infinity : opts.generationsUp;
        const down = opts.generationsDown === null ? Infinity : opts.generationsDown;
        if (g >= cg - up && g <= cg + down) next.add(id);
      }
      keep = next;
    }
  }

  const filtered: TreeInput = {
    viewerId: input.viewerId,
    persons: input.persons.filter((p) => keep.has(p.id)),
    parentChild: input.parentChild.filter((r) => keep.has(r.parentId) && keep.has(r.childId)),
    marriages: input.marriages.filter((r) => keep.has(r.a) && keep.has(r.b)),
    siblings: input.siblings.filter((r) => keep.has(r.a) && keep.has(r.b)),
    hints: input.hints.filter((r) => keep.has(r.from) && keep.has(r.to)),
  };
  return { input: filtered, shown: filtered.persons.length, hidden: total - filtered.persons.length };
}

/** 祖先・子孫(と、その配偶者)。 */
function lineageOf(input: TreeInput, centerId: string): Set<string> {
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const r of input.parentChild) {
    parentsOf.set(r.childId, [...(parentsOf.get(r.childId) ?? []), r.parentId]);
    childrenOf.set(r.parentId, [...(childrenOf.get(r.parentId) ?? []), r.childId]);
  }
  const out = new Set<string>([centerId]);
  const walk = (start: string, next: Map<string, string[]>) => {
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop() as string;
      for (const n of next.get(cur) ?? []) {
        if (!out.has(n)) {
          out.add(n);
          stack.push(n);
        }
      }
    }
  };
  walk(centerId, parentsOf);
  walk(centerId, childrenOf);
  for (const m of input.marriages) {
    if (out.has(m.a)) out.add(m.b);
    if (out.has(m.b)) out.add(m.a);
  }
  return out;
}

function withinDistance(input: TreeInput, centerId: string, maxDist: number): Set<string> {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)?.add(b);
    adj.get(b)?.add(a);
  };
  for (const r of input.parentChild) link(r.parentId, r.childId);
  for (const r of input.marriages) link(r.a, r.b);
  for (const r of input.siblings) link(r.a, r.b);
  const dist = new Map<string, number>([[centerId, 0]]);
  const queue = [centerId];
  while (queue.length) {
    const cur = queue.shift() as string;
    const d = dist.get(cur) as number;
    if (d >= maxDist) continue;
    for (const n of adj.get(cur) ?? []) {
      if (!dist.has(n)) {
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  return new Set(dist.keys());
}

function normalize(s: string): string {
  // 全角/半角・大文字小文字・ひらがな/カタカナの違いを吸収して検索する
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
}

export function searchPersons(persons: TreePerson[], query: string): TreePerson[] {
  const q = normalize(query);
  if (!q) return [];
  return persons.filter(
    (p) =>
      normalize(p.name).includes(q) ||
      (p.relationLabel ? normalize(p.relationLabel).includes(q) : false) ||
      (p.maidenName ? normalize(p.maidenName).includes(q) : false)
  );
}

export type RelativeSummary = {
  parents: TreePerson[];
  spouses: { person: TreePerson; status: string }[];
  children: TreePerson[];
  siblings: TreePerson[];
};

/** 人物の詳細表示用:登録されている親・配偶者・子・兄弟姉妹(関係データから)。 */
export function summarizeRelatives(input: TreeInput, id: string): RelativeSummary {
  const byId = new Map(input.persons.map((p) => [p.id, p]));
  const pick = (ids: string[]) => ids.map((i) => byId.get(i)).filter(Boolean) as TreePerson[];
  const parents = pick([...new Set(input.parentChild.filter((r) => r.childId === id).map((r) => r.parentId))]);
  const children = pick([...new Set(input.parentChild.filter((r) => r.parentId === id).map((r) => r.childId))]);
  const spouses = input.marriages
    .filter((m) => m.a === id || m.b === id)
    .map((m) => ({
      person: byId.get(m.a === id ? m.b : m.a) as TreePerson,
      status:
        m.status === "married"
          ? "婚姻中"
          : m.status === "divorced"
            ? "離婚"
            : m.status === "widowed"
              ? "死別"
              : "事実婚",
    }))
    .filter((s) => s.person);
  const parentIds = new Set(parents.map((p) => p.id));
  const sibIds = new Set<string>();
  for (const r of input.parentChild) {
    if (r.childId !== id && parentIds.has(r.parentId)) sibIds.add(r.childId);
  }
  for (const s of input.siblings) {
    if (s.a === id) sibIds.add(s.b);
    if (s.b === id) sibIds.add(s.a);
  }
  return { parents, spouses, children, siblings: pick([...sibIds]) };
}
