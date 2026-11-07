// 「紐づけを解除」したときの家系図への影響を割り出す(画面・サーバーのどちらからも使える純粋な関数)。
//
// 家系図は、アカウントどうしのつながり(family_members の linked_user_id)をたどって作られる。
// 本人(viewer)と相手(removed)の間のつながりを切ると、
//  - 相手を通じてだけつながっていた人(相手の親・相手とだけつながっている子 など)は家系図から消える
//  - ただし、相手が別の人(例:両方とつながっている子)を通じてつながっていれば、相手も周りの人も残る
// ここでは、どの人が消えるかと、その人を「残す」ときに本人から見た続柄の候補を返す。

export type ImpactNode = { userId: string; name: string };
/** from から見た to の続柄(get_family_tree_graph の edges と同じ形) */
export type ImpactEdge = { fromUserId: string; toUserId: string; relation: string };

export type Dependent = {
  userId: string;
  name: string;
  /** 解除する相手から見たこの人の続柄(分からなければ null) */
  relationToRemoved: string | null;
  /** 残すときに使う、本人から見た続柄の候補(分からなければ "other") */
  suggestedRelation: string;
};

export type UnlinkImpact = {
  /** 解除したあとも、相手が別の人を通じて家系図に残るか */
  removedStillConnected: boolean;
  /** 相手が残るとき、本人とも相手とも直接つながっている人(例:お子さん) */
  via: ImpactNode[];
  /** 解除すると家系図から一緒に消える人 */
  dependents: Dependent[];
};

const CHILD = new Set(["son", "daughter", "eldest_son", "eldest_daughter"]);
const PARENT = new Set(["father", "mother"]);
const SIBLING = new Set(["older_brother", "older_sister", "younger_brother", "younger_sister"]);
const SPOUSE = new Set(["spouse", "ex_spouse"]);
const MALE = new Set(["son", "eldest_son", "father", "older_brother", "younger_brother", "grandfather", "grandson"]);
const FEMALE = new Set(["daughter", "eldest_daughter", "mother", "older_sister", "younger_sister", "grandmother", "granddaughter"]);

function gendered(rel: string, male: string, female: string): string {
  if (MALE.has(rel)) return male;
  if (FEMALE.has(rel)) return female;
  return "other";
}

/** 本人から見た相手の続柄(viaRel)と、相手から見たこの人の続柄(rel)から、本人から見た続柄を推定する */
export function composeRelation(viaRel: string, rel: string | null): string {
  if (!rel) return "other";
  // 配偶者のお子さん → 本人のお子さん(連れ子の場合は、あとで続柄を直してもらう)
  if (SPOUSE.has(viaRel) && CHILD.has(rel)) return gendered(rel, "son", "daughter");
  // 子の子 → 孫
  if (CHILD.has(viaRel) && CHILD.has(rel)) return gendered(rel, "grandson", "granddaughter");
  // 孫の子 → ひ孫
  if ((viaRel === "grandson" || viaRel === "granddaughter") && CHILD.has(rel)) {
    return gendered(rel, "great_grandson", "great_granddaughter");
  }
  // 親の親 → 祖父母
  if (PARENT.has(viaRel) && PARENT.has(rel)) return gendered(rel, "grandfather", "grandmother");
  // 祖父母の親 → 曾祖父母
  if ((viaRel === "grandfather" || viaRel === "grandmother") && PARENT.has(rel)) {
    return gendered(rel, "great_grandfather", "great_grandmother");
  }
  // 親のきょうだい → おじ・おば
  if (PARENT.has(viaRel) && SIBLING.has(rel)) return gendered(rel, "uncle", "aunt");
  return "other";
}

export function analyzeUnlink(args: {
  viewerId: string;
  removedId: string;
  /** 本人から見た相手の続柄 */
  removedRelation: string;
  nodes: ImpactNode[];
  edges: ImpactEdge[];
}): UnlinkImpact {
  const { viewerId, removedId } = args;
  const isCut = (a: string, b: string) =>
    (a === viewerId && b === removedId) || (a === removedId && b === viewerId);

  // 解除後のつながり(向きは関係なく、つながっていれば同じ家系図に入る)
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const e of args.edges) {
    if (e.fromUserId === e.toUserId || isCut(e.fromUserId, e.toUserId)) continue;
    link(e.fromUserId, e.toUserId);
    link(e.toUserId, e.fromUserId);
  }

  const reached = new Set<string>([viewerId]);
  const queue = [viewerId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nx of adj.get(cur) ?? []) {
      if (!reached.has(nx)) {
        reached.add(nx);
        queue.push(nx);
      }
    }
  }

  const nameOf = new Map(args.nodes.map((n) => [n.userId, n.name]));
  const removedStillConnected = reached.has(removedId);

  // 相手が残るとき:本人とも相手とも直接つながっている人(相手が残る理由)
  const via: ImpactNode[] = [];
  if (removedStillConnected) {
    const mine = adj.get(viewerId) ?? new Set<string>();
    for (const u of adj.get(removedId) ?? []) {
      if (u !== viewerId && mine.has(u)) via.push({ userId: u, name: nameOf.get(u) ?? "ご家族" });
    }
    via.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }

  // 相手から見た続柄(相手 → この人 の行があればそれを使う)
  const relFromRemoved = new Map<string, string>();
  for (const e of args.edges) {
    if (e.fromUserId === removedId) relFromRemoved.set(e.toUserId, e.relation);
  }

  const dependents: Dependent[] = args.nodes
    .filter((n) => n.userId !== viewerId && n.userId !== removedId && !reached.has(n.userId))
    .map((n) => {
      const rel = relFromRemoved.get(n.userId) ?? null;
      return {
        userId: n.userId,
        name: n.name,
        relationToRemoved: rel,
        suggestedRelation: composeRelation(args.removedRelation, rel),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return { removedStillConnected, via, dependents };
}
