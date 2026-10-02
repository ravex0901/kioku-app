"use client";

import Link from "next/link";
import {
  familyGenerationDelta,
  familyRelationLabel,
} from "@/lib/constants";
import type { FamilyMember, FamilyRelation } from "@/lib/types";
import type { ExtendedFamilyNetworkMember } from "@/app/actions/familyNetwork";
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

// 世代差ごとの見出しラベル(本人の世代には見出しを付けない)。
// 間接の家族や孫世代が合流することで ±2 を超える世代も出てくるため、それより外側は汎用の表現にする。
function tierHeaderLabel(delta: number): string {
  if (delta <= -3) return `${-delta}世代上の世代`;
  if (delta === -2) return "祖父母の世代";
  if (delta === -1) return "親の世代";
  if (delta === 1) return "子の世代";
  if (delta === 2) return "孫の世代";
  return `${delta}世代下の世代`;
}

type PersonCardData = {
  name: string;
  subtitle?: string;
  isRoot?: boolean;
  linkedHref?: string;
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
    linkedHref: member.linked_user_id
      ? `/journal/view/${member.linked_user_id}`
      : undefined,
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

// 間接の家族・孫世代など、まだ「誰の夫婦の子か」までは分からない人を
// 補助的に世代ごとへ並べて表示するための、従来からの(枠に頼らない)表示。
type FlatNode = {
  id: string;
  name: string;
  subtitle: string;
  linkedHref?: string;
};

function FlatNodeCard({ node }: { node: FlatNode }) {
  return <PersonCard name={node.name} subtitle={node.subtitle} linkedHref={node.linkedHref} />;
}

export function FamilyTreeClient({
  displayName,
  family,
  extendedNetwork = [],
}: {
  displayName: string;
  family: FamilyMember[];
  extendedNetwork?: ExtendedFamilyNetworkMember[];
}) {
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

  // まだ枠の中に組み込めていない人(孫世代など)と、間接のご家族を、
  // 従来通り世代ごとにまとめて家系図の下に補助表示する。
  const leftoverPlaced = placed.filter((f) => !usedIds.has(f.id));
  const tiers = new Map<number, FlatNode[]>();
  function pushTier(delta: number, node: FlatNode) {
    const list = tiers.get(delta) ?? [];
    list.push(node);
    tiers.set(delta, list);
  }
  for (const member of leftoverPlaced) {
    pushTier(familyGenerationDelta(member.relation), {
      id: `f-${member.id}`,
      name: member.name,
      subtitle: familyRelationLabel(member.relation),
      linkedHref: member.linked_user_id ? `/journal/view/${member.linked_user_id}` : undefined,
    });
  }
  for (const member of extendedNetwork) {
    pushTier(member.generationDelta, {
      id: `n-${member.userId}`,
      name: member.name ?? "ご家族",
      subtitle: member.isDeceased ? "故人のご親戚" : "ご親戚",
      linkedHref: member.canViewJournal ? `/journal/view/${member.userId}` : undefined,
    });
  }
  const tierDeltas = [...tiers.keys()].sort((a, b) => a - b);

  if (family.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[1.75rem] border border-green-100 bg-white/70 px-6 py-10 text-center shadow-sm">
        <PersonCard name={displayName} subtitle="本人" isRoot />
        <p className="max-w-xs text-sm text-ink/60">
          まだご家族が登録されていません。設定画面からご家族を登録すると、ここに家系図として表示されます。
        </p>
        <Link
          href="/settings#family"
          className="rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800"
        >
          家族を登録する
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-[1.75rem] border border-green-100 bg-white/70 px-4 py-8 shadow-sm sm:px-8">
        <div className="overflow-x-auto">
          <div className={styles.forest}>
            {roots.map((root) => (
              <div key={root.id} className={styles.tree}>
                <TreeLevel branches={[root]} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {tierDeltas.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink">そのほかのつながり</h2>
          <div className="flex flex-col gap-4">
            {tierDeltas.map((delta) => (
              <div key={delta}>
                <span className="mb-2 block text-[10px] font-semibold tracking-wider text-ink/40">
                  {tierHeaderLabel(delta)}
                </span>
                <div className="flex flex-wrap items-center gap-4">
                  {(tiers.get(delta) ?? []).map((node) => (
                    <FlatNodeCard key={node.id} node={node} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
