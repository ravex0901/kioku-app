import type {
  GenerationHint,
  MarriageRel,
  MarriageStatus,
  ParentChildRel,
  ParentKind,
  SiblingRel,
  TreeInput,
  TreePerson,
} from "./types";

// テスト・開発用の家系図データ生成ヘルパー。

export class TreeBuilder {
  persons: TreePerson[] = [];
  parentChild: ParentChildRel[] = [];
  marriages: MarriageRel[] = [];
  siblings: SiblingRel[] = [];
  hints: GenerationHint[] = [];
  viewerId?: string;
  private n = 0;

  person(id: string, name?: string, extra: Partial<TreePerson> = {}): this {
    this.persons.push({ id, name: name ?? id, createdAt: ++this.n, ...extra });
    return this;
  }
  viewer(id: string): this {
    this.viewerId = id;
    const p = this.persons.find((x) => x.id === id);
    if (p) p.isSelf = true;
    return this;
  }
  child(parentId: string | string[], childId: string, kind: ParentKind = "biological", priority = 10): this {
    for (const pid of Array.isArray(parentId) ? parentId : [parentId]) {
      this.parentChild.push({
        id: `pc:${pid}>${childId}:${kind}`,
        parentId: pid,
        childId,
        kind,
        priority,
      });
    }
    return this;
  }
  marry(a: string, b: string, status: MarriageStatus = "married", order?: number): this {
    this.marriages.push({ id: `m:${a}+${b}`, a, b, status, order, priority: 10 });
    return this;
  }
  sibling(a: string, b: string): this {
    this.siblings.push({ id: `s:${a}~${b}`, a, b, priority: 10 });
    return this;
  }
  hint(from: string, to: string, delta: number, priority = 50): this {
    this.hints.push({ id: `h:${from}>${to}:${delta}`, from, to, delta, priority });
    return this;
  }
  /** 夫婦と子どもたち(兄弟姉妹)をまとめて追加。 */
  family(father: string, mother: string, kids: string[], status: MarriageStatus = "married"): this {
    this.marry(father, mother, status);
    for (const k of kids) this.child([father, mother], k);
    return this;
  }
  build(): TreeInput {
    return {
      viewerId: this.viewerId,
      persons: this.persons,
      parentChild: this.parentChild,
      marriages: this.marriages,
      siblings: this.siblings,
      hints: this.hints,
    };
  }
}

/** n世代・各夫婦が子を k 人持つ、整った家系図(人数は約 sum)。 */
export function balancedTree(generations: number, kidsPerCouple: number): TreeBuilder {
  const b = new TreeBuilder();
  let counter = 0;
  const newPerson = (label: string) => {
    const id = `${label}${++counter}`;
    b.person(id, id);
    return id;
  };
  // 最上位の夫婦
  let couples: [string, string][] = [[newPerson("M"), newPerson("F")]];
  couples.forEach(([m, f]) => b.marry(m, f));
  for (let g = 1; g < generations; g++) {
    const next: [string, string][] = [];
    for (const [m, f] of couples) {
      const kids: string[] = [];
      for (let k = 0; k < kidsPerCouple; k++) kids.push(newPerson("C"));
      kids.forEach((kid) => b.child([m, f], kid));
      if (g < generations - 1) {
        // 子のうち偶数番目は配偶者を迎える(別の家系から)
        kids.forEach((kid, idx) => {
          if (idx % 2 === 0) {
            const spouse = newPerson("S");
            b.marry(kid, spouse);
            next.push([kid, spouse]);
          }
        });
      }
    }
    couples = next;
    if (couples.length === 0) break;
  }
  return b;
}
