import type {
  GenerationHint,
  MarriageRel,
  ParentChildRel,
  ParentKind,
  SiblingRel,
  TreeInput,
  TreeIssue,
} from "./types";

// 関係データを検証し、矛盾する関係を(データは消さずに)描画から外し、
// 各人物の「世代の行」を決める。
//
// 世代の決め方:
//  - 親子:子は親より1つ下(必ず)
//  - 婚姻:夫婦は同じ行
//  - 兄弟姉妹(親が分からない場合の関係):同じ行
//  - 世代の目安(続柄ラベル):他の関係では決まらない人の行を、本人の行に揃えるためだけに使う(線は引かない)
// これを「重み付きUnion-Find」で一度に解く。すでに決まった世代と食い違う関係が来たら、
// 優先度が低い方を矛盾として除外し、確認が必要な事項(issue)として報告する。

export type ResolvedModel = {
  issues: TreeIssue[];
  parentChild: ParentChildRel[];
  marriages: MarriageRel[];
  siblings: SiblingRel[];
  /** 人物ID → 世代(同じ「世代の枠」の中で相対的な値) */
  gen: Map<string, number>;
  /** 人物ID → 世代の枠(同じ枠の人どうしは行を比べられる)の番号。 */
  frameOf: Map<string, number>;
  /** 閲覧者を含む枠。なければ最も人数の多い枠。 */
  mainFrame: number;
  frameCount: number;
  /** どの関係にも登場しない人物だけを集めた枠(続柄未設定の方々)。なければ null。 */
  looseFrame: number | null;
};

class OffsetUF {
  private parent = new Map<string, string>();
  // off.get(x) = gen(x) - gen(parent(x))
  private off = new Map<string, number>();

  add(x: string) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.off.set(x, 0);
    }
  }

  find(x: string): { root: string; offset: number } {
    this.add(x);
    let cur = x;
    let acc = 0;
    const path: string[] = [];
    while (this.parent.get(cur) !== cur) {
      path.push(cur);
      acc += this.off.get(cur) ?? 0;
      cur = this.parent.get(cur) as string;
    }
    // 経路圧縮(各ノードを根に直接つなぐ)
    let remaining = acc;
    for (const node of path) {
      const o = this.off.get(node) ?? 0;
      this.parent.set(node, cur);
      this.off.set(node, remaining);
      remaining -= o;
    }
    return { root: cur, offset: acc };
  }

  /** gen(b) - gen(a) = d を加える。矛盾していれば "conflict"。 */
  union(a: string, b: string, d: number): "ok" | "same" | "conflict" {
    const fa = this.find(a);
    const fb = this.find(b);
    if (fa.root === fb.root) {
      return fb.offset - fa.offset === d ? "same" : "conflict";
    }
    // gen(b) = gen(a) + d。 gen(x)=gen(root)+offset(x)
    // rootB を rootA の下につなぐ:gen(rootB) - gen(rootA) = (gen(b)-offB) - (gen(a)-offA) = d - offB + offA
    this.parent.set(fb.root, fa.root);
    this.off.set(fb.root, d - fb.offset + fa.offset);
    return "ok";
  }
}

function sortByPriority<T extends { priority: number; id: string }>(list: T[]): T[] {
  return [...list].sort((x, y) => x.priority - y.priority || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

type ParentClass = "biological" | "legal" | "adoptive" | "step";
export function parentClassOf(kind: ParentKind): ParentClass {
  if (kind === "special_adoptive" || kind === "adoptive") return "adoptive";
  return kind;
}

export function resolveModel(input: TreeInput): ResolvedModel {
  const issues: TreeIssue[] = [];
  const personIds = new Set(input.persons.map((p) => p.id));
  const nameOf = (id: string) => input.persons.find((p) => p.id === id)?.name ?? "?";

  const ids = new Set<string>();
  for (const p of input.persons) {
    if (ids.has(p.id)) {
      issues.push({
        code: "duplicate_person",
        severity: "error",
        message: `同じ人物(${p.name})が重複して登録されています。`,
        personIds: [p.id],
        relIds: [],
      });
    }
    ids.add(p.id);
  }

  // ---- 基本検証(未知の人物・自分自身との関係・重複) ----
  const okPerson = (rid: string, ...pids: string[]) => {
    for (const pid of pids) {
      if (!personIds.has(pid)) {
        issues.push({
          code: "unknown_person",
          severity: "error",
          message: "存在しない人物を指す関係が登録されています(表示から除外しました)。",
          personIds: [],
          relIds: [rid],
        });
        return false;
      }
    }
    if (pids.length === 2 && pids[0] === pids[1]) {
      issues.push({
        code: "self_relation",
        severity: "error",
        message: `${nameOf(pids[0])}さんが自分自身との関係として登録されています(表示から除外しました)。`,
        personIds: [pids[0]],
        relIds: [rid],
      });
      return false;
    }
    return true;
  };

  const seen = new Set<string>();
  const dedupe = (key: string) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  let pcList = sortByPriority(input.parentChild).filter(
    (r) => okPerson(r.id, r.parentId, r.childId) && dedupe(`pc|${r.parentId}|${r.childId}|${r.kind}`)
  );
  const marriageList = sortByPriority(input.marriages).filter(
    (r) =>
      okPerson(r.id, r.a, r.b) &&
      dedupe(`m|${[r.a, r.b].sort().join("|")}|${r.status}`)
  );
  const siblingList = sortByPriority(input.siblings).filter(
    (r) => okPerson(r.id, r.a, r.b) && dedupe(`s|${[r.a, r.b].sort().join("|")}`)
  );
  const hintList = sortByPriority(input.hints).filter((r) => okPerson(r.id, r.from, r.to));

  // ---- 子ごとの親の数の上限(クラスごとに2人まで) ----
  const byChildClass = new Map<string, ParentChildRel[]>();
  for (const r of pcList) {
    const key = `${r.childId}|${parentClassOf(r.kind)}`;
    const list = byChildClass.get(key) ?? [];
    list.push(r);
    byChildClass.set(key, list);
  }
  const dropped = new Set<string>();
  for (const [key, list] of byChildClass) {
    const cls = key.split("|")[1];
    if (cls === "step") continue;
    const parents = [...new Set(list.map((r) => r.parentId))];
    if (parents.length > 2) {
      const keep = new Set(parents.slice(0, 2)); // priority順に並んでいる
      for (const r of list) {
        if (!keep.has(r.parentId)) {
          dropped.add(r.id);
          issues.push({
            code: "too_many_parents",
            severity: "error",
            message: `${nameOf(r.childId)}さんの親が3人以上登録されています。${nameOf(r.parentId)}さんとの親子関係は確認が必要です(表示から除外しました)。`,
            personIds: [r.childId, r.parentId],
            relIds: [r.id],
          });
        }
      }
    }
  }
  pcList = pcList.filter((r) => !dropped.has(r.id));

  // ---- 世代の解決 ----
  const uf = new OffsetUF();
  for (const p of input.persons) uf.add(p.id);

  const acceptedPc: ParentChildRel[] = [];
  const childrenOf = new Map<string, string[]>();
  const reaches = (from: string, target: string): boolean => {
    const stack = [from];
    const visited = new Set<string>();
    while (stack.length) {
      const cur = stack.pop() as string;
      if (cur === target) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const c of childrenOf.get(cur) ?? []) stack.push(c);
    }
    return false;
  };

  for (const r of pcList) {
    // 子が親の(祖先の)親になっていたら循環
    const cyc = reaches(r.childId, r.parentId);
    const res = cyc ? "conflict" : uf.union(r.parentId, r.childId, 1);
    if (res === "conflict") {
      issues.push({
        code: cyc ? "parent_cycle" : "generation_conflict",
        severity: "error",
        message: cyc
          ? `${nameOf(r.parentId)}さんと${nameOf(r.childId)}さんの親子関係が、他の登録と循環して矛盾しています(確認が必要です)。`
          : `${nameOf(r.parentId)}さんと${nameOf(r.childId)}さんの親子関係が、他の登録した世代と食い違っています(確認が必要です)。`,
        personIds: [r.parentId, r.childId],
        relIds: [r.id],
      });
      continue;
    }
    acceptedPc.push(r);
    const list = childrenOf.get(r.parentId) ?? [];
    list.push(r.childId);
    childrenOf.set(r.parentId, list);
  }

  const acceptedMarriages: MarriageRel[] = [];
  for (const r of marriageList) {
    const res = uf.union(r.a, r.b, 0);
    if (res === "conflict") {
      issues.push({
        code: "marriage_generation_gap",
        severity: "warning",
        message: `${nameOf(r.a)}さんと${nameOf(r.b)}さんは婚姻として登録されていますが、世代が異なる位置にあるため線を引いていません(確認が必要です)。`,
        personIds: [r.a, r.b],
        relIds: [r.id],
      });
      continue;
    }
    acceptedMarriages.push(r);
  }

  const acceptedSiblings: SiblingRel[] = [];
  for (const r of siblingList) {
    const res = uf.union(r.a, r.b, 0);
    if (res === "conflict") {
      issues.push({
        code: "generation_conflict",
        severity: "warning",
        message: `${nameOf(r.a)}さんと${nameOf(r.b)}さんは兄弟姉妹として登録されていますが、他の登録と世代が食い違っています(確認が必要です)。`,
        personIds: [r.a, r.b],
        relIds: [r.id],
      });
      continue;
    }
    acceptedSiblings.push(r);
  }

  // 世代の目安(線は引かない)。新しく枠を結ぶか、食い違いを報告するだけ。
  for (const h of hintList) {
    const res = uf.union(h.from, h.to, h.delta);
    if (res === "conflict") {
      issues.push({
        code: "relation_label_conflict",
        severity: "warning",
        message: `${nameOf(h.from)}さんから見た${nameOf(h.to)}さんの続柄の登録が、家系図の他の関係と食い違っています(確認が必要です)。`,
        personIds: [h.from, h.to],
        relIds: [h.id],
      });
    }
  }

  // ---- 兄弟姉妹の整合:親が両方分かっているのに共通の親がない ----
  const parentsOf = new Map<string, Set<string>>();
  for (const r of acceptedPc) {
    if (r.kind === "step") continue;
    const s = parentsOf.get(r.childId) ?? new Set<string>();
    s.add(r.parentId);
    parentsOf.set(r.childId, s);
  }
  const finalSiblings: SiblingRel[] = [];
  for (const r of acceptedSiblings) {
    const pa = parentsOf.get(r.a);
    const pb = parentsOf.get(r.b);
    if (pa && pb && pa.size > 0 && pb.size > 0) {
      const shared = [...pa].some((p) => pb.has(p));
      if (!shared) {
        issues.push({
          code: "sibling_parent_mismatch",
          severity: "warning",
          message: `${nameOf(r.a)}さんと${nameOf(r.b)}さんは兄弟姉妹として登録されていますが、登録されている親が共通していません(異父・異母の可能性や、登録の誤りがないか確認してください)。`,
          personIds: [r.a, r.b],
          relIds: [r.id],
        });
        continue; // 親が両方分かっているので、親子の線だけで描く(推測の線は引かない)
      }
      continue; // 共通の親がある → 親子の線で描くので兄弟の線は不要
    }
    finalSiblings.push(r);
  }

  // ---- 世代の枠(frame)と相対世代 ----
  const gen = new Map<string, number>();
  const frameIndex = new Map<string, number>();
  const frameOf = new Map<string, number>();
  let frameCount = 0;
  for (const p of input.persons) {
    const { root, offset } = uf.find(p.id);
    if (!frameIndex.has(root)) frameIndex.set(root, frameCount++);
    frameOf.set(p.id, frameIndex.get(root) as number);
    gen.set(p.id, offset);
  }
  // 各枠の最小世代を0に揃える
  const minByFrame = new Map<number, number>();
  for (const p of input.persons) {
    const f = frameOf.get(p.id) as number;
    const g = gen.get(p.id) as number;
    minByFrame.set(f, Math.min(minByFrame.get(f) ?? Infinity, g));
  }
  for (const p of input.persons) {
    gen.set(p.id, (gen.get(p.id) as number) - (minByFrame.get(frameOf.get(p.id) as number) as number));
  }

  let mainFrame = 0;
  const viewerFrame = input.viewerId ? frameOf.get(input.viewerId) : undefined;
  if (viewerFrame !== undefined) {
    mainFrame = viewerFrame;
  } else {
    const counts = new Map<number, number>();
    for (const p of input.persons) {
      const f = frameOf.get(p.id) as number;
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    let best = -1;
    for (const [f, c] of counts) {
      if (c > best) {
        best = c;
        mainFrame = f;
      }
    }
  }

  // 関係が1つもない人(続柄「その他」など)は、1人ずつ別の枠にせず、1つの枠にまとめて並べる。
  const frameSize = new Map<number, number>();
  for (const p of input.persons) {
    const f = frameOf.get(p.id) as number;
    frameSize.set(f, (frameSize.get(f) ?? 0) + 1);
  }
  let looseFrame: number | null = null;
  {
    const loosePersons = input.persons.filter((p) => {
      const f = frameOf.get(p.id) as number;
      return f !== mainFrame && frameSize.get(f) === 1;
    });
    if (loosePersons.length > 0) {
      looseFrame = frameCount;
      frameCount += 1;
      loosePersons.forEach((p, i) => {
        frameOf.set(p.id, looseFrame as number);
        gen.set(p.id, i); // 配置側で、行ごとに折り返す
      });
    }
  }

  return {
    issues,
    parentChild: acceptedPc,
    marriages: acceptedMarriages,
    siblings: finalSiblings,
    gen,
    frameOf,
    mainFrame,
    frameCount,
    looseFrame,
  };
}

export type { GenerationHint };
