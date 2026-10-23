"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { familyRelationLabel } from "@/lib/constants";
import type { FamilyMember, FamilyRelation } from "@/lib/types";
import type { FamilyTreeEdge, FamilyTreeNode } from "@/app/actions/familyTree";
import styles from "./FamilyTree.module.css";

// アバターの配色。名前の文字コードから決定的に選ぶことで、
// 同じ人には毎回同じ色が付くようにする。
const AVATAR_PALETTE = [
  "bg-green-100 text-green-700",
  "bg-gold/25 text-green-800",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-teal-100 text-teal-700",
  "bg-lime-100 text-lime-700",
];

function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % 997;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

type PersonCardData = {
  name: string;
  subtitle?: string;
  isRoot?: boolean;
  linkedHref?: string;
  // 家系図グラフ上でその人を一意に識別するためのID(アカウントがつながっている人のみ)。
  // 名前の一致では決して同一人物とみなさないよう、必ずこのIDで照合する。
  userId?: string;
};

function PersonCard({
  name,
  subtitle,
  isRoot = false,
  linkedHref,
}: PersonCardData) {
  const initial = name.trim().slice(0, 1) || "?";
  const content = (
    <div className="flex w-20 shrink-0 flex-col items-center gap-1 sm:w-24">
      <span
        className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-serif-jp text-lg font-bold shadow-sm sm:h-16 sm:w-16 sm:text-xl ${
          isRoot ? "bg-green-700 text-cream" : colorFor(name)
        } ${linkedHref ? "ring-2 ring-green-500 ring-offset-2" : ""}`}
      >
        {initial}
        {linkedHref && (
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-[10px] text-white shadow"
          >
            ✓
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-xs font-semibold text-ink sm:text-sm">
        {name}
      </span>
      {subtitle && (
        <span className="whitespace-nowrap rounded-full bg-black/5 px-2 py-0.5 text-center text-[10px] text-ink/50">
          {subtitle}
        </span>
      )}
      {linkedHref && (
        <span className="whitespace-nowrap text-center text-[10px] font-semibold text-green-700">
          日記を見る →
        </span>
      )}
    </div>
  );

  if (linkedHref) {
    return (
      <Link href={linkedHref} className="rounded-xl transition hover:opacity-80">
        {content}
      </Link>
    );
  }
  return content;
}

// 夫婦(1人の場合もある)を横並びにし、2人いる場合だけ間を小さな線でつなぐ。
function CoupleGroup({ cards }: { cards: PersonCardData[] }) {
  if (cards.length === 2) {
    return (
      <div className={styles.coupleGroup}>
        <PersonCard {...cards[0]} />
        <span aria-hidden className={styles.coupleLine} />
        <PersonCard {...cards[1]} />
      </div>
    );
  }
  return <PersonCard {...cards[0]} />;
}

function MemberCard({ member }: { member: FamilyMember }) {
  return (
    <PersonCard
      name={member.name}
      subtitle={familyRelationLabel(member.relation)}
      linkedHref={
        member.linked_user_id
          ? `/journal/view/${member.linked_user_id}`
          : undefined
      }
    />
  );
}

function cardFromMember(member: FamilyMember): PersonCardData {
  return {
    name: member.name,
    subtitle: familyRelationLabel(member.relation),
    userId: member.linked_user_id ?? undefined,
    linkedHref: member.linked_user_id
      ? `/journal/view/${member.linked_user_id}`
      : undefined,
  };
}

// 間接につながった家族ネットワークの人物は、「本人(閲覧者)から見た続柄」が
// 定まっていない(直接の申請・承認でつながった相手ではない)ため、
// 推測で続柄を決めるのではなく「続柄未設定」と表示する。
// 家系図の線(親子・夫婦)自体は、実際に登録された続柄データのみを使って描く。
function cardFromNode(node: FamilyTreeNode): PersonCardData {
  return {
    name: node.name,
    subtitle: node.isDeceased ? "続柄未設定(故人)" : "続柄未設定",
    userId: node.userId,
    linkedHref: node.canViewJournal ? `/journal/view/${node.userId}` : undefined,
  };
}

function compact<T>(values: (T | undefined | null | false)[]): T[] {
  return values.filter(Boolean) as T[];
}

// 家系図の1つの「枠」。夫婦(または単身)のカード1組と、その子供にあたる枠の並び。
// 「続柄の文字列を並べる」のではなく、夫婦の中心から子へ1本の線が伸びる、という
// 家系図として自然な構造を、今あるデータ(本人から見た続柄)から組み立てる。
type TreeBranch = {
  id: string;
  cards: PersonCardData[];
  children: TreeBranch[];
};

function leafBranch(member: FamilyMember): TreeBranch {
  return { id: `f-${member.id}`, cards: [cardFromMember(member)], children: [] };
}

function TreeLevel({ branches }: { branches: TreeBranch[] }) {
  return (
    <ul className={styles.level}>
      {branches.map((branch) => (
        <li key={branch.id} className={styles.node}>
          <CoupleGroup cards={branch.cards} />
          {branch.children.length > 0 && <TreeLevel branches={branch.children} />}
        </li>
      ))}
    </ul>
  );
}

// ============================================================
// 家系図グラフ(get_family_tree_graph)から、直接の家族の枠(Step A)に
// 連なる本物の親子・夫婦関係だけを使って、さらに枝を伸ばす(Step B)。
//
// 重要な制約:
// - ここで使う「子」の関係は、family_members に実際に登録されている
//   relation(son/daughter/eldest_son/eldest_daughter)だけ。
//   孫・ひ孫のような「飛び級」の続柄は、間に誰がいるか分からないので、
//   親子の線には使わない(実際の親の下に、その親の子として入る)。
// - 「つながり申請で紐づいた」という事実だけから、親子関係を新たに作り出すことは絶対にしない
//   (例:B・Iが兄弟として紐づいても、M・NをBの親として扱うようなことはしない)。
// - 推測で続柄を決めない:ここで新たに枠に入る人は、閲覧者本人から見た続柄が
//   確定しないため、カードの続柄表示は常に「続柄未設定」にする
//   (ツリーの線の形=誰が誰の親・配偶者か、は実データのみを根拠に描く)。
// ============================================================

const CHILD_RELATIONS = new Set<FamilyRelation>([
  "son",
  "daughter",
  "eldest_son",
  "eldest_daughter",
]);

type ChildEdge = { childId: string; relation: FamilyRelation };

function buildParentToChildren(edges: FamilyTreeEdge[]): Map<string, ChildEdge[]> {
  const map = new Map<string, ChildEdge[]>();
  for (const edge of edges) {
    if (CHILD_RELATIONS.has(edge.relation)) {
      const list = map.get(edge.fromUserId) ?? [];
      list.push({ childId: edge.toUserId, relation: edge.relation });
      map.set(edge.fromUserId, list);
    }
  }
  return map;
}

function buildSpouseOf(edges: FamilyTreeEdge[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const edge of edges) {
    if (edge.relation === "spouse") {
      map.set(edge.fromUserId, edge.toUserId);
    }
  }
  return map;
}

// 既にツリーに置かれている人(Step Aの本人・父母・祖父母・配偶者・子など)を起点に、
// その人からさらに実際の親子関係でつながる人を、本来あるべき枠の下にそのまま追加していく。
// (例:本人が父母しか登録していなくても、父母がさらに別の子=本人の兄弟を登録していれば、
//  その兄弟は父母の枠の下に正しく表示される)
function extendTreeWithGraph(
  roots: TreeBranch[],
  nodeMap: Map<string, FamilyTreeNode>,
  parentToChildren: Map<string, ChildEdge[]>,
  spouseOf: Map<string, string>,
  placedIds: Set<string>
): Map<string, TreeBranch> {
  const branchByUserId = new Map<string, TreeBranch>();
  function collect(branches: TreeBranch[]) {
    for (const branch of branches) {
      for (const card of branch.cards) {
        if (card.userId) branchByUserId.set(card.userId, branch);
      }
      if (branch.children.length > 0) collect(branch.children);
    }
  }
  collect(roots);

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const parentId of [...placedIds]) {
      const branch = branchByUserId.get(parentId);
      if (!branch) continue;
      // 1人分しか置かれていない人に、登録済みの配偶者がいれば、同じ枠に並べる。
      const mateId = spouseOf.get(parentId);
      if (
        mateId &&
        branch.cards.length === 1 &&
        !placedIds.has(mateId) &&
        nodeMap.has(mateId)
      ) {
        branch.cards.push(cardFromNode(nodeMap.get(mateId) as FamilyTreeNode));
        placedIds.add(mateId);
        branchByUserId.set(mateId, branch);
        progressed = true;
      }
      const kids = parentToChildren.get(parentId) ?? [];
      for (const kid of kids) {
        if (placedIds.has(kid.childId)) continue;
        const childNode = nodeMap.get(kid.childId);
        if (!childNode) continue;
        const spouseId = spouseOf.get(kid.childId);
        const spouseNode =
          spouseId && !placedIds.has(spouseId) ? nodeMap.get(spouseId) : undefined;

        const newBranch: TreeBranch = {
          id: `g-${kid.childId}`,
          cards: compact([cardFromNode(childNode), spouseNode && cardFromNode(spouseNode)]),
          children: [],
        };
        branch.children.push(newBranch);
        placedIds.add(kid.childId);
        branchByUserId.set(kid.childId, newBranch);
        if (spouseNode && spouseId) {
          placedIds.add(spouseId);
          branchByUserId.set(spouseId, newBranch);
        }
        progressed = true;
      }
    }
  }
  return branchByUserId;
}

// Step Aの枠に(実際のデータ上)どうしても連ならない、残りの間接の家族ネットワークを、
// 血縁・婚姻でつながるグループごとに、それぞれ独立した家系図の「木」として組み立てる。
// (例:兄弟として紐づいただけのIさん側の家族は、Bさんの子として描くのではなく、
//  Iさんの家族として別の木にする。ページ全体では同じ家系図の中に並んで表示されるので、
//  「16人全員がつながって見える」という要件は満たしつつ、ありえない親子関係は作らない)
function buildIndependentComponents(
  nodeMap: Map<string, FamilyTreeNode>,
  parentToChildren: Map<string, ChildEdge[]>,
  spouseOf: Map<string, string>,
  placedIds: Set<string>,
  roots: TreeBranch[],
  branchByUserId: Map<string, TreeBranch>
): TreeBranch[] {
  const remaining = [...nodeMap.keys()].filter((id) => !placedIds.has(id));
  if (remaining.length === 0) return [];
  const remainingSet = new Set(remaining);

  const parent = new Map<string, string>();
  for (const id of remaining) parent.set(id, id);
  function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) {
      root = parent.get(root) as string;
    }
    parent.set(x, root);
    return root;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  for (const [p, kids] of parentToChildren) {
    if (!remainingSet.has(p)) continue;
    for (const kid of kids) {
      if (remainingSet.has(kid.childId)) union(p, kid.childId);
    }
  }
  for (const [a, b] of spouseOf) {
    if (remainingSet.has(a) && remainingSet.has(b)) union(a, b);
  }

  const groups = new Map<string, string[]>();
  for (const id of remaining) {
    const r = find(id);
    const list = groups.get(r) ?? [];
    list.push(id);
    groups.set(r, list);
  }

  const result: TreeBranch[] = [];
  for (const members of groups.values()) {
    const memberSet = new Set(members);
    const handled = new Set<string>();

    const isChildWithin = (id: string) =>
      [...parentToChildren.entries()].some(
        ([p, kids]) => memberSet.has(p) && kids.some((k) => k.childId === id)
      );

    const rootUnits: string[][] = [];
    for (const id of members) {
      if (handled.has(id)) continue;
      const spouseId = spouseOf.get(id);
      const unit = spouseId && memberSet.has(spouseId) ? [id, spouseId] : [id];
      // 夫婦のどちらかが誰かの子なら、その夫婦は親の枠の下に入るので根にしない。
      if (unit.some(isChildWithin)) continue;
      unit.forEach((m) => handled.add(m));
      rootUnits.push(unit);
    }
    if (rootUnits.length === 0 && members.length > 0) {
      rootUnits.push([members[0]]);
      handled.add(members[0]);
    }

    function buildUnitBranch(unit: string[]): TreeBranch {
      const cards = compact(
        unit.map((id) => {
          const node = nodeMap.get(id);
          return node ? cardFromNode(node) : undefined;
        })
      );
      const childIds = new Set<string>();
      for (const id of unit) {
        for (const kid of parentToChildren.get(id) ?? []) {
          if (memberSet.has(kid.childId)) childIds.add(kid.childId);
        }
      }
      const childBranches: TreeBranch[] = [];
      for (const childId of childIds) {
        if (handled.has(childId)) continue;
        const spouseId = spouseOf.get(childId);
        const childUnit = spouseId && memberSet.has(spouseId) ? [childId, spouseId] : [childId];
        childUnit.forEach((m) => handled.add(m));
        childBranches.push(buildUnitBranch(childUnit));
      }
      // すでに置かれている(独立した木の根になっている)子がいれば、その木ごとこの親の下に移す。
      for (const id of unit) {
        for (const kid of parentToChildren.get(id) ?? []) {
          if (!placedIds.has(kid.childId)) continue;
          const placedBranch = branchByUserId.get(kid.childId);
          const idx = placedBranch ? roots.indexOf(placedBranch) : -1;
          if (placedBranch && idx >= 0) {
            roots.splice(idx, 1);
            childBranches.push(placedBranch);
          }
        }
      }
      return { id: `gc-${unit.join("-")}`, cards, children: childBranches };
    }

    for (const unit of rootUnits) {
      result.push(buildUnitBranch(unit));
    }
  }
  return result;
}

// 家系図の表示領域をピンチズーム・ドラッグでパンできるようにする(スマホでの操作に対応)。
// アプリ全体はレイアウト崩れ防止のためページ全体の拡大縮小を禁止しているため、
// この家系図の中だけ、独自にジェスチャーを処理して拡大縮小・移動できるようにする。
function useForestZoomPan() {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{
    distance: number;
    scale: number;
  } | null>(null);
  const panStart = useRef<{ x: number; y: number; originX: number; originY: number } | null>(
    null
  );

  const clampScale = (s: number) => Math.min(3, Math.max(1, s));

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) {
        const pts = [...pointers.current.values()];
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        pinchStart.current = { distance: Math.hypot(dx, dy), scale: transform.scale };
        panStart.current = null;
      } else if (pointers.current.size === 1) {
        panStart.current = {
          x: e.clientX,
          y: e.clientY,
          originX: transform.x,
          originY: transform.y,
        };
      }
    },
    [transform]
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = [...pointers.current.values()];
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const distance = Math.hypot(dx, dy);
      const nextScale = clampScale(
        pinchStart.current.scale * (distance / Math.max(1, pinchStart.current.distance))
      );
      setTransform((prev) => ({ ...prev, scale: nextScale }));
    } else if (pointers.current.size === 1 && panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setTransform((prev) => ({
        ...prev,
        x: panStart.current!.originX + dx,
        y: panStart.current!.originY + dy,
      }));
    }
  }, []);

  const endPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    pinchStart.current = null;
    panStart.current = null;
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setTransform((prev) => ({ ...prev, scale: clampScale(prev.scale * factor) }));
  }, []);

  const reset = useCallback(() => setTransform({ scale: 1, x: 0, y: 0 }), []);

  return { transform, onPointerDown, onPointerMove, endPointer, zoomBy, reset };
}

export function FamilyTreeClient({
  displayName,
  family,
  graph,
}: {
  displayName: string;
  family: FamilyMember[];
  graph?: { selfUserId: string; nodes: FamilyTreeNode[]; edges: FamilyTreeEdge[] };
}) {
  const { transform, onPointerDown, onPointerMove, endPointer, zoomBy, reset } =
    useForestZoomPan();

  // 「その他」は世代・関係が定まらないため、従来通り家系図の下に別枠で表示する。
  const others = family.filter((f) => f.relation === "other");
  const placed = family.filter((f) => f.relation !== "other");

  const findAll = (...rels: FamilyRelation[]) =>
    placed.filter((f) => rels.includes(f.relation));

  const usedIds = new Set<string>();
  const take = (rels: FamilyRelation[]) => {
    const members = findAll(...rels);
    members.forEach((m) => usedIds.add(m.id));
    return members;
  };

  const father = take(["father"])[0];
  const mother = take(["mother"])[0];
  const grandfather = take(["grandfather"])[0];
  const grandmother = take(["grandmother"])[0];
  const greatGrandfather = take(["great_grandfather"])[0];
  const greatGrandmother = take(["great_grandmother"])[0];
  const uncleAunt = take(["uncle", "aunt"]);
  const siblings = take([
    "older_brother",
    "older_sister",
    "younger_brother",
    "younger_sister",
  ]);
  const spouse = take(["spouse"])[0];
  const children = take(["son", "daughter", "eldest_son", "eldest_daughter"]);

  // 本人(+配偶者)の枠。子供がいれば、その枠の下に子供たちが並ぶ。
  const selfBranch: TreeBranch = {
    id: "self",
    cards: compact([
      { name: displayName, subtitle: "本人", isRoot: true },
      spouse && cardFromMember(spouse),
    ]),
    children: children.map(leafBranch),
  };

  const siblingBranches = siblings.map(leafBranch);
  const uncleAuntBranches = uncleAunt.map(leafBranch);

  // 父母がいれば、その枠の子として「本人+兄弟姉妹」を並べる(同じ親から生まれた、という構造)。
  const parentsBranch: TreeBranch | null =
    father || mother
      ? {
          id: "parents",
          cards: compact([father && cardFromMember(father), mother && cardFromMember(mother)]),
          children: [selfBranch, ...siblingBranches],
        }
      : null;

  // 祖父母がいれば、その枠の子として「父母(+おじ・おば)」を並べる。
  const roots: TreeBranch[] = [];
  if (grandfather || grandmother) {
    const gpChildren = compact([parentsBranch, ...uncleAuntBranches]);
    roots.push({
      id: "grandparents",
      cards: compact([grandfather && cardFromMember(grandfather), grandmother && cardFromMember(grandmother)]),
      children: gpChildren,
    });
    if (!parentsBranch) {
      // 父母の登録がないまま祖父母だけ登録されている場合、本人側は別の枠として表示する。
      roots.push(selfBranch, ...siblingBranches);
    }
  } else {
    if (parentsBranch) {
      roots.push(parentsBranch);
    } else {
      roots.push(selfBranch, ...siblingBranches);
    }
    roots.push(...uncleAuntBranches);
  }

  // 曾祖父母がいれば、いちばん上の枠(祖父母または父母)の親として載せる。
  if (greatGrandfather || greatGrandmother) {
    const ggCards = compact([
      greatGrandfather && cardFromMember(greatGrandfather),
      greatGrandmother && cardFromMember(greatGrandmother),
    ]);
    if (roots.length > 0 && (roots[0].id === "grandparents" || roots[0].id === "parents")) {
      roots[0] = { id: "great-grandparents", cards: ggCards, children: [roots[0]] };
    } else {
      roots.push({ id: "great-grandparents", cards: ggCards, children: [] });
    }
  }

  // 枠に組み込めていない直接のご家族(孫・ひ孫など。どの子の子かは登録から分からない)。
  // 下のグラフで、実際の親が分かればその親の下に入る。分からなければ、単独の枠として載せる。
  const leftoverPlaced = placed.filter((f) => !usedIds.has(f.id));

  // ============================================================
  // ここから、承認済みのつながりをたどって合流した、間接の家族ネットワーク全体
  // (get_family_tree_graph)を、実際のデータに基づいて家系図に組み込む。
  // ============================================================
  if (graph && graph.nodes.length > 0) {
    const nodeMap = new Map(graph.nodes.map((n) => [n.userId, n]));
    const parentToChildren = buildParentToChildren(graph.edges);
    const spouseOf = buildSpouseOf(graph.edges);

    // Step Aで既に枠に置かれている人(本人+直接の家族)のIDを集める。
    const placedIds = new Set<string>();
    if (graph.selfUserId) placedIds.add(graph.selfUserId);
    const leftoverIds = new Set(leftoverPlaced.map((m) => m.id));
    for (const member of family) {
      // 孫・ひ孫など枠に入っていない人は、まだ「置かれていない」扱いにして、
      // 実際の親の下に入れる。
      if (member.linked_user_id && !leftoverIds.has(member.id)) {
        placedIds.add(member.linked_user_id);
      }
    }

    // Step B-1: 既存の枠から、実際の親子関係でさらにつながる人を、本来の枠の下に伸ばす。
    const branchByUserId = extendTreeWithGraph(
      roots,
      nodeMap,
      parentToChildren,
      spouseOf,
      placedIds
    );

    // Step B-2: それでも既存の枠につながらない人たちを、血縁・婚姻のグループごとに
    // 別の「木」として組み立て、同じ家系図の中に並べて表示する。
    const independentRoots = buildIndependentComponents(
      nodeMap,
      parentToChildren,
      spouseOf,
      placedIds,
      roots,
      branchByUserId
    );
    roots.push(...independentRoots);
  }

  // 自分が登録した直接のご家族には、グラフの中でも、自分が付けた続柄の名前を表示する。
  const relationByUserId = new Map<string, string>();
  for (const member of family) {
    if (member.linked_user_id) {
      relationByUserId.set(member.linked_user_id, familyRelationLabel(member.relation));
    }
  }
  const idsInTree = new Set<string>();
  (function relabel(branches: TreeBranch[]) {
    for (const branch of branches) {
      for (const card of branch.cards) {
        if (card.userId) {
          idsInTree.add(card.userId);
          const own = relationByUserId.get(card.userId);
          if (own && card.subtitle?.startsWith("続柄未設定")) card.subtitle = own;
        }
      }
      relabel(branch.children);
    }
  })(roots);

  // どの親の子かも分からない孫・ひ孫などは、単独の枠として最後に載せる(必ずどこかに表示する)。
  for (const member of leftoverPlaced) {
    if (!member.linked_user_id || !idsInTree.has(member.linked_user_id)) {
      roots.push(leafBranch(member));
    }
  }

  if (family.length === 0 && (!graph || graph.nodes.length <= 1)) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[1.75rem] border border-green-100 bg-white/70 px-6 py-10 text-center shadow-sm">
        <PersonCard name={displayName} subtitle="本人" isRoot />
        <p className="max-w-xs text-sm text-ink/60">
          まだご家族が登録されていません。設定画面からご家族を登録すると、ここに家系図として表示されます。
        </p>
        <Link
          href="/settings#family"
          className="inline-flex min-h-[50px] items-center justify-center rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800"
        >
          家族を登録する
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="relative rounded-[1.75rem] border border-green-100 bg-white/70 px-4 py-8 shadow-sm sm:px-8">
        <div className="mb-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => zoomBy(1.25)}
            aria-label="家系図を拡大"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-green-200 bg-white text-lg font-bold text-green-700 shadow-sm"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={() => zoomBy(0.8)}
            aria-label="家系図を縮小"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-green-200 bg-white text-lg font-bold text-green-700 shadow-sm"
          >
            −
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-green-200 bg-white px-3 text-xs font-semibold text-green-700 shadow-sm"
          >
            リセット
          </button>
        </div>
        <div
          className="touch-none select-none overflow-hidden"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={endPointer}
        >
          <div
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: "0 0",
              width: "max-content",
            }}
          >
            <div className={styles.forest}>
              {roots.map((root) => (
                <div key={root.id} className={styles.tree}>
                  <TreeLevel branches={[root]} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] text-ink/40">
          2本の指でつまんで拡大縮小、1本の指でドラッグして移動できます。
        </p>
      </div>

      {others.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink">その他のご家族</h2>
          <div className="flex gap-4 overflow-x-auto pb-1">
            {others.map((member) => (
              <MemberCard key={member.id} member={member} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Link
          href="/settings#family"
          className="self-start text-sm text-green-700 underline underline-offset-2"
        >
          家族を追加・編集する
        </Link>
        {family.some((f) => f.linked_user_id) && (
          <Link
            href="/family/voice-checkin"
            className="self-start text-sm text-green-700 underline underline-offset-2"
          >
            家族へボイスメッセージを送る
          </Link>
        )}
      </div>
    </div>
  );
}
