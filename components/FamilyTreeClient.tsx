"use client";

import Link from "next/link";
import {
  familyGenerationDelta,
  familyNetworkGenerationLabel,
  familyRelationLabel,
} from "@/lib/constants";
import type { FamilyMember } from "@/lib/types";
import type { ExtendedFamilyNetworkMember } from "@/app/actions/familyNetwork";

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
const TIER_LABELS: Record<number, string> = {
  "-2": "祖父母の世代",
  "-1": "親の世代",
  1: "子の世代",
  2: "孫の世代",
};

function PersonCard({
  name,
  subtitle,
  isRoot = false,
  linkedHref,
}: {
  name: string;
  subtitle?: string;
  isRoot?: boolean;
  linkedHref?: string;
}) {
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

// 「間接の家族」(2ホップ以上先でつながっている家族)用のカード。
// 既定では名前+続柄(世代差)のみ表示し、本人(または故人の場合は直接の家族)が
// 共有をONにしている場合のみ「日記を見る」リンクが付く。
function NetworkMemberCard({
  member,
}: {
  member: ExtendedFamilyNetworkMember;
}) {
  return (
    <PersonCard
      name={member.name ?? "ご家族"}
      subtitle={
        (member.isDeceased ? "故人・" : "") +
        familyNetworkGenerationLabel(member.generationDelta)
      }
      linkedHref={
        member.canViewJournal ? `/journal/view/${member.userId}` : undefined
      }
    />
  );
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
  // 「その他」は世代が定まらないため、従来通り家系図の下に別枠で表示する。
  const others = family.filter((f) => f.relation === "other");
  const placed = family.filter((f) => f.relation !== "other");

  // 続柄(relation)から世代差を求め、同じ世代差ごとにグループ化する。
  // delta が小さいほど年上の世代(家系図の上側)に表示する。
  const tiers = new Map<number, FamilyMember[]>();
  for (const member of placed) {
    const delta = familyGenerationDelta(member.relation);
    const list = tiers.get(delta) ?? [];
    list.push(member);
    tiers.set(delta, list);
  }
  const ascendingTiers = [...tiers.keys()]
    .filter((d) => d < 0)
    .sort((a, b) => a - b);
  const descendingTiers = [...tiers.keys()]
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  const sameTier = tiers.get(0) ?? [];

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
          <div className="flex min-w-fit flex-col items-center gap-5 px-2">
            {/* 年上の世代(祖父母・親など)を上から順に表示 */}
            {ascendingTiers.map((delta) => (
              <div key={delta} className="flex flex-col items-center gap-2">
                <span className="text-[10px] font-semibold tracking-wider text-ink/40">
                  {TIER_LABELS[delta] ?? ""}
                </span>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  {(tiers.get(delta) ?? []).map((member) => (
                    <MemberCard key={member.id} member={member} />
                  ))}
                </div>
                <span aria-hidden className="h-5 w-0.5 bg-green-300" />
              </div>
            ))}

            {/* 本人 + 同世代(配偶者・兄弟姉妹) */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex flex-wrap items-center justify-center gap-4">
                <PersonCard name={displayName} subtitle="本人" isRoot />
                {sameTier.map((member) => (
                  <MemberCard key={member.id} member={member} />
                ))}
              </div>
            </div>

            {/* 年下の世代(子・孫など)を上から順に表示 */}
            {descendingTiers.map((delta) => (
              <div key={delta} className="flex flex-col items-center gap-2">
                <span aria-hidden className="h-5 w-0.5 bg-green-300" />
                <span className="text-[10px] font-semibold tracking-wider text-ink/40">
                  {TIER_LABELS[delta] ?? ""}
                </span>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  {(tiers.get(delta) ?? []).map((member) => (
                    <MemberCard key={member.id} member={member} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
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

      {extendedNetwork.length > 0 && (
        <div>
          <h2 className="mb-1 text-lg font-bold text-ink">間接のご家族</h2>
          <p className="mb-3 text-xs text-ink/50">
            ご家族がさらにつながっているご親戚です。名前は表示されますが、日記などの詳細は、ご本人(故人の場合は直接のご家族)が共有をONにした方のみ見られます。
          </p>
          <div className="flex flex-wrap gap-4 overflow-x-auto pb-1">
            {extendedNetwork.map((member) => (
              <NetworkMemberCard key={member.userId} member={member} />
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
