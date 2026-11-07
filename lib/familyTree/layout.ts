import { parentClassOf, resolveModel } from "./resolve";
import type {
  EdgeStyle,
  LayoutBand,
  LayoutEdge,
  LayoutNode,
  LayoutOptions,
  LayoutResult,
  MarriageRel,
  ParentChildRel,
  Segment,
  SiblingRel,
  TreeInput,
  TreePerson,
} from "./types";

// ============================================================
// 日本式の縦型家系図の自動レイアウトエンジン
//
// 方針
//  1. 世代(行)は関係データから決める(resolve.ts)。同世代は同じ高さ。
//  2. 「夫婦(再婚があれば連なる)」「親が分からない兄弟姉妹」を、横一列に並べる1つの配置単位
//     (cluster)として扱う。婚姻中の夫婦は必ず隣り合う。
//  3. 子どもは「親(夫婦)の幹線(union)」から生えるものとして、親の cluster の下に置く。
//  4. 並び順は、親子関係の木を深さ優先でたどる順(=線が交差しない順)。兄弟姉妹は左から出生順。
//     別の家系から嫁いだ(婿入りした)配偶者の親の家系は、その配偶者の側に並べる。
//  5. 横位置は、各行ごとに「親は子の真上、子は親の真下」に近づける重み付き最小二乗(PAV法)を
//     上下に繰り返して求め、人物カードが重ならない最小間隔を必ず守る。
//  6. 線は、位置が決まった後に「関係データ」から直交線(水平・垂直)で生成する。
//     縦線は人物カードの間(夫婦の間)か、行と行の間の隙間だけを通るので、カードを貫通しない。
// ============================================================

const DEFAULT_CARD_W = 116;
const DEFAULT_CARD_H = 150;
const AVATAR_CENTER_Y = 36; // カード上端から、アバター中心(=婚姻線の高さ)まで
const GAP_PARTNER = 48; // 夫婦の間(二重線を引く)
const GAP_SIBLING = 28; // 親不明の兄弟姉妹の間
const GAP_CLUSTER = 36; // 別の配置単位の間の最小間隔
const GAP_TREE_EXTRA = 28; // 別の家系(親が違う)の間に足す余白
const BUS_STEP = 12; // 幹線の段の間隔
const LANE_TOP = 34; // 次の行のカードの上に確保する隙間(兄弟のU字リンク用)
const LANE_BOTTOM = 18; // 行のカードの下の最初の余白
const ARC_STEP = 10;
const BAND_GAP = 72;
const BAND_TITLE_H = 40;
const MARGIN = 24;

type Cluster = {
  id: number;
  gen: number;
  members: string[]; // 左から右の順
  /** 隣り合うメンバー間のつながり(婚姻・親不明の兄弟など)。members[i] と members[i+1] の間。 */
  links: ClusterLink[];
  offsets: Map<string, number>; // メンバー左端のcluster内相対x
  width: number;
  x: number;
};

type ClusterLink = {
  a: string;
  b: string;
  type: "marriage" | "coparent" | "sibling";
  marriage?: MarriageRel;
  sibling?: SiblingRel;
};

type Union = {
  id: string;
  cls: "biological" | "legal" | "adoptive" | "step";
  kind: ParentChildRel["kind"];
  parents: string[]; // 配置順(左→右)
  children: string[];
  rels: ParentChildRel[];
  gen: number; // 親の世代
};

export function layoutFamilyTree(input: TreeInput, options: LayoutOptions = {}): LayoutResult {
  const cardW = options.cardW ?? DEFAULT_CARD_W;
  const cardH = options.cardH ?? DEFAULT_CARD_H;
  const model = resolveModel(input);
  const personById = new Map(input.persons.map((p) => [p.id, p]));

  // 枠ごとに分ける(閲覧者のいる枠が先頭)
  const frameOrder: number[] = [model.mainFrame];
  const frameSizes = new Map<number, number>();
  for (const p of input.persons) {
    const f = model.frameOf.get(p.id) as number;
    frameSizes.set(f, (frameSizes.get(f) ?? 0) + 1);
  }
  const others = [...frameSizes.keys()]
    .filter((f) => f !== model.mainFrame && f !== model.looseFrame)
    .sort((a, b) => (frameSizes.get(b) as number) - (frameSizes.get(a) as number) || a - b);
  frameOrder.push(...others);
  if (model.looseFrame !== null && frameSizes.has(model.looseFrame)) frameOrder.push(model.looseFrame);

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const bands: LayoutBand[] = [];
  let yCursor = MARGIN;
  let maxW = 0;

  frameOrder.forEach((frame, bandIndex) => {
    const persons = input.persons.filter((p) => model.frameOf.get(p.id) === frame);
    if (persons.length === 0) return;
    const idSet = new Set(persons.map((p) => p.id));
    const gen = isLooseGen(frame === model.looseFrame, persons, model.gen);
    const result = layoutBand({
      persons,
      parentChild: model.parentChild.filter((r) => idSet.has(r.parentId) && idSet.has(r.childId)),
      marriages: model.marriages.filter((r) => idSet.has(r.a) && idSet.has(r.b)),
      siblings: model.siblings.filter((r) => idSet.has(r.a) && idSet.has(r.b)),
      gen,
      viewerId: input.viewerId,
      cardW,
      cardH,
      previousX: options.previousX,
    });
    const isLoose = frame === model.looseFrame;
    const title =
      bandIndex === 0
        ? null
        : isLoose
          ? "続柄が未設定のご親族"
          : "つながりの確認が必要なご親族(世代が未確認)";
    const top = yCursor + (title ? BAND_TITLE_H : 0);
    for (const n of result.nodes) {
      nodes.push({ ...n, x: n.x + MARGIN, y: n.y + top, bandIndex });
    }
    for (const e of result.edges) {
      edges.push({
        ...e,
        bandIndex,
        segments: e.segments.map((s) => ({
          x1: s.x1 + MARGIN,
          y1: s.y1 + top,
          x2: s.x2 + MARGIN,
          y2: s.y2 + top,
        })),
        mark: e.mark ? { ...e.mark, x: e.mark.x + MARGIN, y: e.mark.y + top } : undefined,
      });
    }
    bands.push({
      index: bandIndex,
      title,
      x: MARGIN,
      y: yCursor,
      w: result.width,
      h: result.height + (title ? BAND_TITLE_H : 0),
    });
    yCursor = top + result.height + BAND_GAP;
    maxW = Math.max(maxW, result.width);
  });

  const height = Math.max(0, yCursor - BAND_GAP) + MARGIN;
  void personById;
  return {
    nodes,
    edges,
    bands,
    width: maxW + MARGIN * 2,
    height,
    issues: model.issues,
    accepted: {
      parentChild: model.parentChild,
      marriages: model.marriages,
      siblings: model.siblings,
    },
  };
}

// 続柄未設定の人たちは、1行に最大6人まで並べて折り返す。
const LOOSE_PER_ROW = 6;
function isLooseGen(
  isLoose: boolean,
  persons: TreePerson[],
  gen: Map<string, number>
): Map<string, number> {
  if (!isLoose) return gen;
  const out = new Map(gen);
  persons.forEach((p, i) => out.set(p.id, Math.floor(i / LOOSE_PER_ROW)));
  return out;
}

// ------------------------------------------------------------
// 1つの枠(つながった家族のまとまり)のレイアウト
// ------------------------------------------------------------

type BandArgs = {
  persons: TreePerson[];
  parentChild: ParentChildRel[];
  marriages: MarriageRel[];
  siblings: SiblingRel[];
  gen: Map<string, number>;
  viewerId?: string;
  cardW: number;
  cardH: number;
  previousX?: Record<string, number>;
};

type BandResult = { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number };

function layoutBand(args: BandArgs): BandResult {
  const { persons, cardW, cardH } = args;
  const personById = new Map(persons.map((p) => [p.id, p]));
  const gen = (id: string) => args.gen.get(id) as number;
  const maxGen = Math.max(...persons.map((p) => gen(p.id)));

  // ---------- 距離(閲覧者から)。同じ人の複数の親の家系から、本流を選ぶために使う ----------
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)?.add(b);
    adj.get(b)?.add(a);
  };
  for (const p of persons) adj.set(p.id, new Set());
  for (const r of args.parentChild) link(r.parentId, r.childId);
  for (const r of args.marriages) link(r.a, r.b);
  for (const r of args.siblings) link(r.a, r.b);
  const dist = new Map<string, number>();
  {
    const start =
      args.viewerId && personById.has(args.viewerId)
        ? args.viewerId
        : [...persons].sort((a, b) => (a.id < b.id ? -1 : 1))[0].id;
    dist.set(start, 0);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift() as string;
      for (const nb of adj.get(cur) ?? []) {
        if (!dist.has(nb)) {
          dist.set(nb, (dist.get(cur) as number) + 1);
          queue.push(nb);
        }
      }
    }
    for (const p of persons) if (!dist.has(p.id)) dist.set(p.id, 9999);
  }

  // ---------- 兄弟姉妹の並び順(左=年長) ----------
  const prevX = args.previousX ?? {};
  const comparePersons = (a: string, b: string): number => {
    const pa = personById.get(a) as TreePerson;
    const pb = personById.get(b) as TreePerson;
    if (pa.birthOrder !== undefined && pb.birthOrder !== undefined && pa.birthOrder !== pb.birthOrder) {
      return pa.birthOrder - pb.birthOrder;
    }
    const xa = prevX[a];
    const xb = prevX[b];
    if (xa !== undefined && xb !== undefined && xa !== xb) return xa - xb;
    if (pa.birthYear !== undefined && pb.birthYear !== undefined && pa.birthYear !== pb.birthYear) {
      return pa.birthYear - pb.birthYear;
    }
    const ra = pa.labelRank ?? 0;
    const rb = pb.labelRank ?? 0;
    if (ra !== rb) return ra - rb;
    const ca = pa.createdAt ?? 0;
    const cb = pb.createdAt ?? 0;
    if (ca !== cb) return ca - cb;
    return a < b ? -1 : a > b ? 1 : 0;
  };

  // ---------- 親の幹線(union) ----------
  const pcByChild = new Map<string, ParentChildRel[]>();
  for (const r of args.parentChild) {
    const list = pcByChild.get(r.childId) ?? [];
    list.push(r);
    pcByChild.set(r.childId, list);
  }
  const unions = new Map<string, Union>();
  // 継親子(連れ子):実の親と継親が婚姻している場合は、実の親の線に含めて1本で描く
  // (子は実の親の下に置く。継親との関係は線の元データとして実の親の線に含める)。
  const marriedPair = (a: string, b: string) =>
    args.marriages.some((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a));
  const absorbedStep = new Map<string, ParentChildRel[]>(); // 実の親のunion用: childId|parentId -> 継親の関係
  for (const [childId, rels] of pcByChild) {
    const keep: ParentChildRel[] = [];
    for (const r of rels) {
      if (r.kind === "step") {
        const bioParent = rels.find(
          (o) => o.kind !== "step" && marriedPair(o.parentId, r.parentId)
        );
        if (bioParent) {
          const key = `${childId}|${bioParent.parentId}`;
          const l = absorbedStep.get(key) ?? [];
          l.push(r);
          absorbedStep.set(key, l);
          continue;
        }
      }
      keep.push(r);
    }
    pcByChild.set(childId, keep);
  }
  for (const [childId, rels] of pcByChild) {
    const byClass = new Map<string, ParentChildRel[]>();
    for (const r of rels) {
      const cls = parentClassOf(r.kind);
      const l = byClass.get(cls) ?? [];
      l.push(r);
      byClass.set(cls, l);
    }
    for (const [cls, list] of byClass) {
      const parents = [...new Set(list.map((r) => r.parentId))].sort();
      const id = `u:${cls}:${parents.join(",")}`;
      let u = unions.get(id);
      if (!u) {
        const kind = list.some((r) => r.kind === "special_adoptive") ? "special_adoptive" : list[0].kind;
        u = {
          id,
          cls: cls as Union["cls"],
          kind,
          parents,
          children: [],
          rels: [],
          gen: gen(parents[0]),
        };
        unions.set(id, u);
      }
      u.children.push(childId);
      u.rels.push(...list);
    }
  }

  for (const u of unions.values()) {
    for (const childId of u.children) {
      for (const p of u.parents) {
        const extra = absorbedStep.get(`${childId}|${p}`);
        if (extra) u.rels.push(...extra);
      }
    }
  }

  // ---------- 配置単位(cluster):夫婦・再婚・親が同じ未婚の親同士・親不明の兄弟姉妹 ----------
  const partnerLinks: ClusterLink[] = [];
  const marriedPairs = new Set<string>();
  for (const m of args.marriages) {
    partnerLinks.push({ a: m.a, b: m.b, type: "marriage", marriage: m });
    marriedPairs.add([m.a, m.b].sort().join("|"));
  }
  for (const u of unions.values()) {
    if (u.parents.length === 2) {
      const key = [...u.parents].sort().join("|");
      if (!marriedPairs.has(key)) {
        marriedPairs.add(key);
        partnerLinks.push({ a: u.parents[0], b: u.parents[1], type: "coparent" });
      }
    }
  }
  const siblingLinks: ClusterLink[] = args.siblings.map((s) => ({
    a: s.a,
    b: s.b,
    type: "sibling",
    sibling: s,
  }));
  const allLinks = [...partnerLinks, ...siblingLinks];

  const linkAdj = new Map<string, ClusterLink[]>();
  for (const p of persons) linkAdj.set(p.id, []);
  for (const l of allLinks) {
    linkAdj.get(l.a)?.push(l);
    linkAdj.get(l.b)?.push(l);
  }

  const hasParents = (id: string) => (pcByChild.get(id) ?? []).length > 0;

  // 連結成分
  const compOf = new Map<string, number>();
  const comps: string[][] = [];
  for (const p of [...persons].sort((a, b) => comparePersons(a.id, b.id))) {
    if (compOf.has(p.id)) continue;
    const idx = comps.length;
    const members: string[] = [];
    const stack = [p.id];
    compOf.set(p.id, idx);
    while (stack.length) {
      const cur = stack.pop() as string;
      members.push(cur);
      for (const l of linkAdj.get(cur) ?? []) {
        const other = l.a === cur ? l.b : l.a;
        if (!compOf.has(other)) {
          compOf.set(other, idx);
          stack.push(other);
        }
      }
    }
    comps.push(members);
  }

  const clusters: Cluster[] = comps.map((members, i) => buildCluster(i, members));
  const clusterOf = new Map<string, Cluster>();
  for (const c of clusters) for (const m of c.members) clusterOf.set(m, c);

  function buildCluster(id: number, members: string[]): Cluster {
    const memberSet = new Set(members);
    const visited = new Set<string>();
    const degree = (p: string) => (linkAdj.get(p) ?? []).filter((l) => memberSet.has(l.a) && memberSet.has(l.b)).length;
    // 起点:親が分かっている人(家系の本流)で、つながりが最も多い人
    const sortedStart = [...members].sort((a, b) => {
      const ha = hasParents(a) ? 0 : 1;
      const hb = hasParents(b) ? 0 : 1;
      if (ha !== hb) return ha - hb;
      const da = degree(a);
      const db = degree(b);
      if (da !== db) return db - da;
      const di = (dist.get(a) as number) - (dist.get(b) as number);
      if (di !== 0) return di;
      return comparePersons(a, b);
    });
    const start = sortedStart[0];

    const spouseOrder = (l: ClusterLink): number => {
      if (l.marriage?.order !== undefined) return l.marriage.order;
      const st = l.marriage?.status;
      return st === "divorced" || st === "widowed" ? 0 : 1;
    };

    // p を中心に、左右に隣人を並べた順序を返す。side: p のどちら側に広げてよいか
    function emit(p: string, side: "both" | "left" | "right"): string[] {
      visited.add(p);
      const partners: { other: string; link: ClusterLink }[] = [];
      const sibs: { other: string; link: ClusterLink }[] = [];
      for (const l of linkAdj.get(p) ?? []) {
        const other = l.a === p ? l.b : l.a;
        if (!memberSet.has(other) || visited.has(other)) continue;
        if (partners.some((x) => x.other === other) || sibs.some((x) => x.other === other)) continue;
        if (l.type === "sibling") sibs.push({ other, link: l });
        else partners.push({ other, link: l });
      }
      partners.sort(
        (x, y) =>
          spouseOrder(x.link) - spouseOrder(y.link) ||
          comparePersons(x.other, y.other)
      );
      sibs.sort((x, y) => comparePersons(x.other, y.other));

      let leftSibs: typeof sibs = [];
      let rightSibs: typeof sibs = [];
      let leftPartners: typeof partners = [];
      let rightPartners: typeof partners = [];
      if (side === "left") {
        leftPartners = partners;
        leftSibs = sibs;
      } else if (side === "right") {
        rightPartners = partners;
        rightSibs = sibs;
      } else {
        for (const s of sibs) {
          // 自分より年長なら左、年少なら右
          if (comparePersons(s.other, p) < 0) leftSibs.push(s);
          else rightSibs.push(s);
        }
        const ended = partners.filter((x) => {
          const st = x.link.marriage?.status;
          return (st === "divorced" || st === "widowed") && partners.length > 1;
        });
        const current = partners.filter((x) => !ended.includes(x));
        if (partners.length === 1) {
          // 夫婦2人:夫を左、妻を右(性別が分からなければ起点を左)
          const only = partners[0];
          const me = personById.get(p)?.gender;
          const ot = personById.get(only.other)?.gender;
          if (me === "female" && ot === "male") leftPartners = [only];
          else rightPartners = [only];
        } else {
          leftPartners = ended;
          rightPartners = current;
          // どちらか一方に偏る場合は、両隣が配偶者になるよう1人を反対側へ(隣り合う線を増やす)
          if (partners.length >= 2 && leftPartners.length === 0) {
            leftPartners = [rightPartners[0]];
            rightPartners = rightPartners.slice(1);
          } else if (partners.length >= 2 && rightPartners.length === 0) {
            rightPartners = [leftPartners[leftPartners.length - 1]];
            leftPartners = leftPartners.slice(0, -1);
          }
        }
      }

      const out: string[] = [];
      // 左側(遠い方から):年長の兄弟 → 前の配偶者(古い順)
      for (const s of leftSibs) {
        if (visited.has(s.other)) continue;
        out.push(...emit(s.other, "left"));
      }
      for (const x of leftPartners) {
        if (visited.has(x.other)) continue;
        out.push(...emit(x.other, "left"));
      }
      out.push(p);
      for (const x of rightPartners) {
        if (visited.has(x.other)) continue;
        out.push(...emit(x.other, "right"));
      }
      for (const s of rightSibs) {
        if (visited.has(s.other)) continue;
        out.push(...emit(s.other, "right"));
      }
      return out;
    }

    const order = emit(start, "both");
    // 取りこぼし(念のため)を末尾に追加
    for (const m of members) if (!visited.has(m)) order.push(...emit(m, "right"));

    // 左側に広げた人は「内側が先頭の逆順」になるよう emit 内で整列済みだが、
    // 'left' で再帰した場合は [遠い…近い, 本人] の順で返ってくるので、そのままでよい。
    const links: ClusterLink[] = [];
    const offsets = new Map<string, number>();
    let x = 0;
    order.forEach((m, i) => {
      if (i > 0) {
        const prev = order[i - 1];
        const l = allLinks.find(
          (k) => memberSet.has(k.a) && ((k.a === prev && k.b === m) || (k.a === m && k.b === prev))
        );
        if (l) links.push(l);
        const partnered = l && l.type !== "sibling";
        x += partnered ? GAP_PARTNER : GAP_SIBLING;
      }
      offsets.set(m, x);
      x += cardW;
    });
    return { id, gen: gen(members[0]), members: order, links, offsets, width: x, x: 0 };
  }

  const centerOffset = (c: Cluster, pid: string) => (c.offsets.get(pid) as number) + cardW / 2;

  // 幹線の出発点(cluster内の相対x)
  const anchorOffset = (u: Union): number => {
    const c = clusterOf.get(u.parents[0]) as Cluster;
    if (u.parents.length === 1) return centerOffset(c, u.parents[0]);
    const xs = u.parents.map((p) => c.offsets.get(p) as number).sort((a, b) => a - b);
    const left = u.parents.find((p) => c.offsets.get(p) === xs[0]) as string;
    const right = u.parents.find((p) => c.offsets.get(p) === xs[xs.length - 1]) as string;
    const adjacentIdx = Math.abs(c.members.indexOf(left) - c.members.indexOf(right)) === 1;
    if (adjacentIdx) {
      const gapL = (c.offsets.get(left) as number) + cardW;
      const gapR = c.offsets.get(right) as number;
      return (gapL + gapR) / 2;
    }
    return ((c.offsets.get(left) as number) + (c.offsets.get(right) as number) + cardW) / 2;
  };
  const unionAdjacent = (u: Union): boolean => {
    if (u.parents.length === 1) return true;
    const c = clusterOf.get(u.parents[0]) as Cluster;
    const idx = u.parents.map((p) => c.members.indexOf(p)).sort((a, b) => a - b);
    return idx[idx.length - 1] - idx[0] === 1;
  };

  // 子の配置:各 cluster が持つ union(左から右の順)
  const unionsOfCluster = new Map<Cluster, Union[]>();
  for (const u of unions.values()) {
    const c = clusterOf.get(u.parents[0]) as Cluster;
    const list = unionsOfCluster.get(c) ?? [];
    list.push(u);
    unionsOfCluster.set(c, list);
  }
  for (const [c, list] of unionsOfCluster) {
    list.sort((a, b) => {
      const ax = anchorOffset(a);
      const bx = anchorOffset(b);
      if (ax !== bx) return ax - bx;
      return a.id < b.id ? -1 : 1;
    });
    void c;
  }

  // ---------- 各 cluster の「本流の親(primary)」 ----------
  type ParentLink = { union: Union; member: string; parent: Cluster };
  const parentLinksOf = new Map<Cluster, ParentLink[]>();
  for (const u of unions.values()) {
    const pc = clusterOf.get(u.parents[0]) as Cluster;
    for (const child of u.children) {
      const cc = clusterOf.get(child) as Cluster;
      const list = parentLinksOf.get(cc) ?? [];
      list.push({ union: u, member: child, parent: pc });
      parentLinksOf.set(cc, list);
    }
  }
  const clsRank: Record<Union["cls"], number> = { biological: 0, legal: 1, adoptive: 2, step: 3 };
  const primaryOf = new Map<Cluster, ParentLink>();
  for (const [cc, list] of parentLinksOf) {
    const best = [...list].sort((a, b) => {
      const da = dist.get(a.member) as number;
      const db = dist.get(b.member) as number;
      if (da !== db) return da - db;
      const ca = clsRank[a.union.cls];
      const cb = clsRank[b.union.cls];
      if (ca !== cb) return ca - cb;
      return a.union.id < b.union.id ? -1 : 1;
    })[0];
    primaryOf.set(cc, best);
  }

  // ---------- 並び順:本流の木を深さ優先でたどる ----------
  const childClustersOf = new Map<Cluster, { union: Union; clusters: Cluster[] }[]>();
  for (const c of clusters) {
    const out: { union: Union; clusters: Cluster[] }[] = [];
    for (const u of unionsOfCluster.get(c) ?? []) {
      const kids = [...u.children].sort(comparePersons);
      const seen = new Set<Cluster>();
      const list: Cluster[] = [];
      for (const k of kids) {
        const cc = clusterOf.get(k) as Cluster;
        if (seen.has(cc)) continue;
        seen.add(cc);
        // 本流の親がこの cluster の場合だけ、ここに並べる
        if (primaryOf.get(cc)?.union === u) list.push(cc);
      }
      out.push({ union: u, clusters: list });
    }
    childClustersOf.set(c, out);
  }

  const roots = clusters.filter((c) => !primaryOf.has(c));
  const treeRootOf = new Map<Cluster, Cluster>();
  const subtreeClusters = new Map<Cluster, Cluster[]>(); // root -> 深さ優先の並び
  const visitedC = new Set<Cluster>();
  const dfs = (c: Cluster, root: Cluster, out: Cluster[]) => {
    if (visitedC.has(c)) return;
    visitedC.add(c);
    treeRootOf.set(c, root);
    out.push(c);
    for (const g of childClustersOf.get(c) ?? []) {
      for (const cc of g.clusters) dfs(cc, root, out);
    }
  };
  // 根の並び:閲覧者のいる木 → 親に近い(世代が小さい)順の安定した順序を基準に、
  // 別の家系から来た配偶者の側の木を、つながる位置の左右に配置する
  const rootSort = (a: Cluster, b: Cluster) => {
    const da = Math.min(...a.members.map((m) => dist.get(m) as number));
    const db = Math.min(...b.members.map((m) => dist.get(m) as number));
    if (da !== db) return da - db;
    return comparePersons(a.members[0], b.members[0]);
  };
  // 木ごとの閲覧者からの最短距離を先に求める必要があるため、いったん全木を作る
  const rawRoots = [...roots].sort((a, b) => {
    // 世代が小さい(上にある)根を先に。同じなら距離。
    return a.gen - b.gen || rootSort(a, b);
  });
  for (const r of rawRoots) {
    const out: Cluster[] = [];
    dfs(r, r, out);
    subtreeClusters.set(r, out);
  }
  // 万一、木に入らなかった cluster(循環など)は単独の根にする
  for (const c of clusters) {
    if (!visitedC.has(c)) {
      const out: Cluster[] = [];
      dfs(c, c, out);
      subtreeClusters.set(c, out);
      rawRoots.push(c);
    }
  }

  // 木どうしの結びつき(本流でない親子の線の数)と、置く側(左右)
  const treeAffinity = new Map<Cluster, Map<Cluster, { weight: number; leftVotes: number; rightVotes: number }>>();
  const addAff = (a: Cluster, b: Cluster, side: -1 | 1) => {
    if (a === b) return;
    const m = treeAffinity.get(a) ?? new Map();
    const cur = m.get(b) ?? { weight: 0, leftVotes: 0, rightVotes: 0 };
    cur.weight += 1;
    if (side < 0) cur.leftVotes += 1;
    else cur.rightVotes += 1;
    m.set(b, cur);
    treeAffinity.set(a, m);
  };
  for (const [cc, list] of parentLinksOf) {
    const primary = primaryOf.get(cc);
    for (const l of list) {
      if (l === primary || (primary && l.union === primary.union && l.member === primary.member)) continue;
      const childRoot = treeRootOf.get(cc) as Cluster;
      const parentRoot = treeRootOf.get(l.parent) as Cluster;
      if (childRoot === parentRoot) continue;
      // 子の cluster の中で、その親の家系につながる人が左側にいるか右側にいるか
      const idx = cc.members.indexOf(l.member);
      const primIdx = primary ? cc.members.indexOf(primary.member) : idx;
      const side: -1 | 1 = idx < primIdx ? -1 : 1;
      // parentRoot の木は childRoot の木から見て side の側に置きたい
      addAff(childRoot, parentRoot, side);
      addAff(parentRoot, childRoot, side === -1 ? 1 : -1);
    }
  }

  // 木の並び(deque)を作る
  const treeSeq: Cluster[] = [];
  {
    const remaining = new Set(rawRoots);
    const first =
      rawRoots.find((r) => (subtreeClusters.get(r) as Cluster[]).some((c) => c.members.includes(args.viewerId ?? ""))) ??
      rawRoots[0];
    const pickNext = (): { root: Cluster; side: -1 | 1 } | null => {
      let best: { root: Cluster; side: -1 | 1; weight: number } | null = null;
      for (const r of remaining) {
        let weight = 0;
        let left = 0;
        let right = 0;
        for (const placed of treeSeq) {
          const a = treeAffinity.get(r)?.get(placed);
          if (a) {
            weight += a.weight;
            left += a.leftVotes;
            right += a.rightVotes;
          }
        }
        if (weight > 0 && (!best || weight > best.weight)) {
          // 候補 r から見て、すでに置いた木が左にあるなら r は右へ
          best = { root: r, side: left > right ? 1 : -1, weight };
        }
      }
      return best ? { root: best.root, side: best.side } : null;
    };
    treeSeq.push(first);
    remaining.delete(first);
    while (remaining.size > 0) {
      const next = pickNext();
      if (next) {
        remaining.delete(next.root);
        if (next.side < 0) treeSeq.unshift(next.root);
        else treeSeq.push(next.root);
      } else {
        // つながりのない木は、出現順に右へ
        const r = [...remaining][0];
        remaining.delete(r);
        treeSeq.push(r);
      }
    }
  }

  const rows: Cluster[][] = Array.from({ length: maxGen + 1 }, () => []);
  for (const root of treeSeq) {
    for (const c of subtreeClusters.get(root) as Cluster[]) rows[c.gen].push(c);
  }
  // 同じ行で「同じ木・同じ親から出た子」の並びを保つため、深さ優先の出現順がそのまま行の順序になる。
  // ただし、深さ優先は「行ごとに独立に」並べているので、行の中では木の順序で連結される。

  // ---------- 横位置:行ごとの重み付き最小二乗(PAV) ----------
  const rowGap = (a: Cluster, b: Cluster) => {
    const ta = treeRootOf.get(a);
    const tb = treeRootOf.get(b);
    const pa = primaryOf.get(a)?.parent;
    const pb = primaryOf.get(b)?.parent;
    const sameFamily = pa && pb && pa === pb;
    return GAP_CLUSTER + (ta === tb && sameFamily ? 0 : GAP_TREE_EXTRA);
  };

  // 初期配置:各行を左から詰める
  for (const row of rows) {
    let x = 0;
    row.forEach((c, i) => {
      if (i > 0) x += rowGap(row[i - 1], c);
      c.x = x;
      x += c.width;
    });
  }

  const childAttachX = (cc: Cluster, member: string) => cc.x + centerOffset(cc, member);

  const runPav = (row: Cluster[], desired: (number | null)[], weight: number[]) => {
    const n = row.length;
    if (n === 0) return;
    // x_i >= x_{i-1} + w_{i-1} + gap  →  y_i = x_i - c_i が単調非減少
    const cum: number[] = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) acc += row[i - 1].width + rowGap(row[i - 1], row[i]);
      cum.push(acc);
    }
    type Block = { sum: number; w: number; start: number; end: number };
    const blocks: Block[] = [];
    for (let i = 0; i < n; i++) {
      const target = (desired[i] ?? row[i].x) - cum[i];
      const w = desired[i] === null ? 0.02 : weight[i];
      blocks.push({ sum: target * w, w, start: i, end: i });
      while (blocks.length > 1) {
        const b = blocks[blocks.length - 1];
        const a = blocks[blocks.length - 2];
        if (a.sum / a.w <= b.sum / b.w) break;
        blocks.splice(blocks.length - 2, 2, {
          sum: a.sum + b.sum,
          w: a.w + b.w,
          start: a.start,
          end: b.end,
        });
      }
    }
    for (const b of blocks) {
      const y = b.sum / b.w;
      for (let i = b.start; i <= b.end; i++) row[i].x = y + cum[i];
    }
  };

  const downDesired = (c: Cluster): { desired: number | null; weight: number } => {
    const links = parentLinksOf.get(c);
    if (!links || links.length === 0) return { desired: null, weight: 0 };
    const primary = primaryOf.get(c) as ParentLink;
    let sum = 0;
    let wsum = 0;
    for (const l of links) {
      const isPrimary = l.union === primary.union && l.member === primary.member;
      const w = isPrimary ? 1 : 0.3;
      const ax = l.parent.x + anchorOffset(l.union);
      sum += (ax - centerOffset(c, l.member)) * w;
      wsum += w;
    }
    return { desired: sum / wsum, weight: wsum };
  };
  const upDesired = (c: Cluster): { desired: number | null; weight: number } => {
    const groups = unionsOfCluster.get(c);
    if (!groups || groups.length === 0) return { desired: null, weight: 0 };
    let sum = 0;
    let wsum = 0;
    for (const u of groups) {
      let cs = 0;
      let cw = 0;
      for (const child of u.children) {
        const cc = clusterOf.get(child) as Cluster;
        const isPrimary = primaryOf.get(cc)?.union === u && primaryOf.get(cc)?.member === child;
        const w = isPrimary ? 1 : 0.3;
        cs += childAttachX(cc, child) * w;
        cw += w;
      }
      if (cw === 0) continue;
      const targetAnchor = cs / cw;
      sum += (targetAnchor - anchorOffset(u)) * cw;
      wsum += cw;
    }
    if (wsum === 0) return { desired: null, weight: 0 };
    return { desired: sum / wsum, weight: wsum };
  };

  for (let iter = 0; iter < 16; iter++) {
    for (let g = 1; g <= maxGen; g++) {
      const row = rows[g];
      const d = row.map(downDesired);
      runPav(row, d.map((x) => x.desired), d.map((x) => Math.max(0.5, x.weight)));
    }
    for (let g = maxGen - 1; g >= 0; g--) {
      const row = rows[g];
      const d = row.map(upDesired);
      runPav(row, d.map((x) => x.desired), d.map((x) => Math.max(0.5, x.weight)));
    }
  }
  // 最後は「親を子の真上に」(上向き)で仕上げ、その後 左端を0に揃える
  let minX = Infinity;
  for (const c of clusters) minX = Math.min(minX, c.x);
  for (const c of clusters) c.x -= minX;

  // ---------- 縦位置と線 ----------
  // 行の間の隙間の高さは、幹線の段数で決まるので、まず線の段(level)を求める。
  type UnionGeom = {
    u: Union;
    anchorX: number;
    childXs: { child: string; x: number }[];
    minX: number;
    maxX: number;
    level: number;
  };
  // 子の上端に複数の線が着く時にずらす量(カードの上端中央から±)。
  // 左にある親の線ほど左側に着くようにして、線がねじれて交差しないようにする。
  const anchorXOf = new Map<string, number>();
  for (const u of unions.values()) {
    const c = clusterOf.get(u.parents[0]) as Cluster;
    anchorXOf.set(u.id, c.x + anchorOffset(u));
  }
  const incomingOffsets = new Map<string, Map<string, number>>(); // child -> unionId -> dx
  for (const childId of pcByChild.keys()) {
    const uids = [...unions.values()]
      .filter((u) => u.children.includes(childId))
      .sort((p, q) => (anchorXOf.get(p.id) as number) - (anchorXOf.get(q.id) as number) || (p.id < q.id ? -1 : 1))
      .map((u) => u.id);
    const m = new Map<string, number>();
    uids.forEach((id, i) => m.set(id, (i - (uids.length - 1) / 2) * 12));
    incomingOffsets.set(childId, m);
  }

  const geomByGap: UnionGeom[][] = Array.from({ length: maxGen + 1 }, () => []);
  for (const u of unions.values()) {
    const anchorX = anchorXOf.get(u.id) as number;
    const childXs = u.children.map((ch) => {
      const cc = clusterOf.get(ch) as Cluster;
      return { child: ch, x: cc.x + centerOffset(cc, ch) + (incomingOffsets.get(ch)?.get(u.id) ?? 0) };
    });
    const xs = [anchorX, ...childXs.map((k) => k.x)];
    geomByGap[u.gen].push({
      u,
      anchorX,
      childXs,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      level: 0,
    });
  }

  // 段の割り当て(区間彩色)と、交差を減らすための入れ替え
  const PAD = 6;
  const levelCounts: number[] = [];
  for (let g = 0; g <= maxGen; g++) {
    const list = geomByGap[g];
    list.sort((a, b) => a.minX - b.minX || a.maxX - b.maxX);
    const levels: UnionGeom[][] = [];
    for (const gm of list) {
      let placed = false;
      for (let li = 0; li < levels.length; li++) {
        const ok = levels[li].every((o) => gm.minX > o.maxX + PAD || gm.maxX < o.minX - PAD);
        if (ok) {
          levels[li].push(gm);
          gm.level = li;
          placed = true;
          break;
        }
      }
      if (!placed) {
        gm.level = levels.length;
        levels.push([gm]);
      }
    }
    // 段の入れ替えで交差を減らす
    const crossCost = (upper: UnionGeom, lower: UnionGeom) => {
      let c = 0;
      if (lower.anchorX > upper.minX && lower.anchorX < upper.maxX) c++;
      for (const k of upper.childXs) if (k.x > lower.minX && k.x < lower.maxX) c++;
      return c;
    };
    const total = () => {
      let t = 0;
      for (let i = 0; i < list.length; i++) {
        for (let j = 0; j < list.length; j++) {
          if (i === j) continue;
          const a = list[i];
          const b = list[j];
          if (a.level < b.level && !(a.maxX < b.minX - PAD || b.maxX < a.minX - PAD)) t += crossCost(a, b);
        }
      }
      return t;
    };
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 6) {
      improved = false;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (a.level === b.level) continue;
          const before = total();
          const la = a.level;
          const lb = b.level;
          // 入れ替え後も、それぞれの段で他と重ならないか確認
          const conflict = (gm: UnionGeom, newLevel: number, ignore: UnionGeom) =>
            list.some(
              (o) =>
                o !== gm &&
                o !== ignore &&
                o.level === newLevel &&
                !(gm.maxX < o.minX - PAD || o.maxX < gm.minX - PAD)
            );
          if (conflict(a, lb, b) || conflict(b, la, a)) continue;
          a.level = lb;
          b.level = la;
          if (total() < before) improved = true;
          else {
            a.level = la;
            b.level = lb;
          }
        }
      }
    }
    levelCounts.push(list.length === 0 ? 0 : Math.max(...list.map((x) => x.level)) + 1);
  }

  // 婚姻の弧(隣り合わない夫婦)の段数
  type Arc = { a: string; b: string; level: number; link: ClusterLink };
  const arcsByGen: Arc[][] = Array.from({ length: maxGen + 1 }, () => []);
  for (const c of clusters) {
    for (const l of partnerLinks) {
      if (clusterOf.get(l.a) !== c || !c.members.includes(l.b)) continue;
      const ia = c.members.indexOf(l.a);
      const ib = c.members.indexOf(l.b);
      if (Math.abs(ia - ib) === 1) continue;
      arcsByGen[c.gen].push({ a: l.a, b: l.b, level: arcsByGen[c.gen].length, link: l });
    }
  }

  // 行のy座標
  const rowY: number[] = [];
  let y = 0;
  for (let g = 0; g <= maxGen; g++) {
    rowY.push(y);
    const arcH = arcsByGen[g].length * ARC_STEP;
    const busH = levelCounts[g] > 0 ? levelCounts[g] * BUS_STEP + 14 : 14;
    y += cardH + LANE_BOTTOM + arcH + busH + LANE_TOP;
  }
  const bandHeight = y - (LANE_BOTTOM + LANE_TOP + 14) + 0;

  const nodes: LayoutNode[] = [];
  const nodeRect = new Map<string, { x: number; y: number }>();
  for (const c of clusters) {
    for (const m of c.members) {
      const px = c.x + (c.offsets.get(m) as number);
      const py = rowY[c.gen];
      nodeRect.set(m, { x: px, y: py });
      nodes.push({
        id: m,
        person: personById.get(m) as TreePerson,
        x: px,
        y: py,
        w: cardW,
        h: cardH,
        row: c.gen,
        bandIndex: 0,
      });
    }
  }

  const edges: LayoutEdge[] = [];
  const seg = (x1: number, y1: number, x2: number, y2: number): Segment => ({ x1, y1, x2, y2 });
  const marriageY = (g: number) => rowY[g] + AVATAR_CENTER_Y;

  // 婚姻・親同士・兄弟姉妹の線
  for (const l of allLinks) {
    const ca = clusterOf.get(l.a) as Cluster;
    if (clusterOf.get(l.b) !== ca) continue;
    const ia = ca.members.indexOf(l.a);
    const ib = ca.members.indexOf(l.b);
    const [left, right] = ia < ib ? [l.a, l.b] : [l.b, l.a];
    const adjacent = Math.abs(ia - ib) === 1;
    const g = ca.gen;
    const lx = (nodeRect.get(left) as { x: number }).x;
    const rx = (nodeRect.get(right) as { x: number }).x;
    if (l.type === "sibling") {
      // 親が分からない兄弟姉妹:カードの上にU字のリンク
      const topY = rowY[g];
      const laneY = topY - 14;
      edges.push({
        id: `e:sib:${l.sibling?.id ?? `${l.a}-${l.b}`}`,
        kind: "sibling",
        style: "sibling_unknown_parent",
        relIds: l.sibling ? [l.sibling.id] : [],
        fromIds: [left],
        toIds: [right],
        segments: [
          seg(lx + cardW * 0.72, topY, lx + cardW * 0.72, laneY),
          seg(lx + cardW * 0.72, laneY, rx + cardW * 0.28, laneY),
          seg(rx + cardW * 0.28, laneY, rx + cardW * 0.28, topY),
        ],
        bandIndex: 0,
      });
      continue;
    }
    const style: EdgeStyle =
      l.type === "coparent"
        ? "coparent"
        : l.marriage?.status === "divorced"
          ? "divorced"
          : l.marriage?.status === "widowed"
            ? "widowed"
            : l.marriage?.status === "common_law"
              ? "common_law"
              : "marriage";
    if (adjacent) {
      const yy = marriageY(g);
      const x1 = lx + cardW;
      const x2 = rx;
      const segments: Segment[] =
        style === "marriage"
          ? [seg(x1, yy - 3, x2, yy - 3), seg(x1, yy + 3, x2, yy + 3)]
          : [seg(x1, yy, x2, yy)];
      edges.push({
        id: `e:mar:${l.marriage?.id ?? `${l.a}-${l.b}`}`,
        kind: "marriage",
        style,
        relIds: l.marriage ? [l.marriage.id] : [],
        fromIds: [left],
        toIds: [right],
        segments,
        mark:
          style === "divorced"
            ? { x: (x1 + x2) / 2, y: yy, type: "slash" }
            : style === "widowed"
              ? { x: (x1 + x2) / 2, y: yy, type: "cross" }
              : undefined,
        bandIndex: 0,
      });
    } else {
      // 隣り合わない夫婦:カードの下を回る弧
      const arc = arcsByGen[g].find((a) => a.link === l);
      const level = arc ? arc.level : 0;
      const arcY = rowY[g] + cardH + LANE_BOTTOM - 8 + level * ARC_STEP;
      // 弧の脚は、カード中央の子への幹線と重ならないよう、内側に寄せる
      const cxl = lx + cardW / 2 + 22;
      const cxr = rx + cardW / 2 - 22;
      edges.push({
        id: `e:mar:${l.marriage?.id ?? `${l.a}-${l.b}`}`,
        kind: "marriage",
        style,
        relIds: l.marriage ? [l.marriage.id] : [],
        fromIds: [left],
        toIds: [right],
        segments: [
          seg(cxl, rowY[g] + cardH, cxl, arcY),
          seg(cxl, arcY, cxr, arcY),
          seg(cxr, arcY, cxr, rowY[g] + cardH),
        ],
        mark: style === "divorced" ? { x: (cxl + cxr) / 2, y: arcY, type: "slash" } : undefined,
        bandIndex: 0,
      });
    }
  }

  // 親子の線(union ごと)
  const unionStyle = (u: Union): EdgeStyle =>
    u.cls === "biological"
      ? "biological"
      : u.cls === "legal"
        ? "legal"
        : u.cls === "step"
          ? "step"
          : u.kind === "special_adoptive"
            ? "special_adoptive"
            : "adoptive";
  for (let g = 0; g <= maxGen; g++) {
    const arcDepth = arcsByGen[g].length * ARC_STEP;
    for (const gm of geomByGap[g]) {
      const u = gm.u;
      const c = clusterOf.get(u.parents[0]) as Cluster;
      const adjacent = unionAdjacent(u);
      // 出発点
      let startY: number;
      if (u.parents.length === 1) {
        startY = rowY[g] + cardH;
      } else if (adjacent) {
        startY = marriageY(g);
      } else {
        // 弧の中点から
        const arc = arcsByGen[g].find((a) => u.parents.includes(a.a) && u.parents.includes(a.b));
        startY = rowY[g] + cardH + LANE_BOTTOM - 8 + (arc ? arc.level : 0) * ARC_STEP;
      }
      const busY = rowY[g] + cardH + LANE_BOTTOM + arcDepth + 6 + gm.level * BUS_STEP;
      const segments: Segment[] = [];
      const xA = gm.anchorX;
      const childEnds = gm.childXs.map((k) => ({ child: k.child, x: k.x }));
      const xs = [xA, ...childEnds.map((k) => k.x)];
      const minBus = Math.min(...xs);
      const maxBus = Math.max(...xs);
      if (busY > startY) segments.push(seg(xA, startY, xA, busY));
      if (maxBus > minBus) segments.push(seg(minBus, busY, maxBus, busY));
      for (const k of childEnds) {
        const childTop = (nodeRect.get(k.child) as { y: number }).y;
        segments.push(seg(k.x, busY, k.x, childTop));
      }
      edges.push({
        id: `e:pc:${u.id}`,
        kind: "parentChild",
        style: unionStyle(u),
        relIds: u.rels.map((r) => r.id),
        fromIds: u.parents,
        toIds: [...u.children],
        segments,
        bandIndex: 0,
      });
      void c;
    }
  }

  let width = 0;
  for (const n of nodes) width = Math.max(width, n.x + n.w);
  return { nodes, edges, width, height: bandHeight };
}
