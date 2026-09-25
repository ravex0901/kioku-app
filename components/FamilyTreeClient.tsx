"use client";

import Link from "next/link";
import { FAMILY_RELATION_OPTIONS, labelFor } from "@/lib/constants";
import type { FamilyMember, FamilyRelation } from "@/lib/types";

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

function relationLabel(relation: FamilyRelation) {
  return labelFor(FAMILY_RELATION_OPTIONS, relation);
}

function PersonCard({
  name,
  subtitle,
  isRoot = false,
}: {
  name: string;
  subtitle?: string;
  isRoot?: boolean;
}) {
  const initial = name.trim().slice(0, 1) || "?";
  return (
    <div className="flex w-20 shrink-0 flex-col items-center gap-1 sm:w-24">
      <span
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-serif-jp text-lg font-bold shadow-sm sm:h-16 sm:w-16 sm:text-xl ${
          isRoot ? "bg-green-700 text-cream" : colorFor(name)
        }`}
      >
        {initial}
      </span>
      <span className="w-full truncate text-center text-xs font-semibold text-ink sm:text-sm">
        {name}
      </span>
      {subtitle && (
        <span className="whitespace-nowrap rounded-full bg-black/5 px-2 py-0.5 text-center text-[10px] text-ink/50">
          {subtitle}
        </span>
      )}
    </div>
  );
}

export function FamilyTreeClient({
  displayName,
  family,
}: {
  displayName: string;
  family: FamilyMember[];
}) {
  const spouse = family.find((f) => f.relation === "spouse") ?? null;
  const CHILD_RELATIONS: FamilyRelation[] = [
    "eldest_son",
    "eldest_daughter",
    "son",
    "daughter",
  ];
  const children = family.filter((f) => CHILD_RELATIONS.includes(f.relation));
  const others = family.filter((f) => f.relation === "other");

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
          <div className="flex min-w-fit flex-col items-center px-2">
            {/* 本人 + 配偶者 */}
            <div className="flex items-center">
              <PersonCard name={displayName} subtitle="本人" isRoot />
              {spouse && (
                <>
                  <span className="mx-1 h-0.5 w-6 shrink-0 bg-green-300 sm:w-8" />
                  <PersonCard
                    name={spouse.name}
                    subtitle={relationLabel(spouse.relation)}
                  />
                </>
              )}
            </div>

            {/* 子どもたちへの連結線 */}
            {children.length > 0 && (
              <>
                <span className="h-6 w-0.5 shrink-0 bg-green-300" />
                <div className="flex">
                  {children.map((child, i) => {
                    const isFirst = i === 0;
                    const isLast = i === children.length - 1;
                    return (
                      <div
                        key={child.id}
                        className="relative flex flex-col items-center px-3 pt-5 sm:px-4"
                      >
                        <span
                          aria-hidden
                          className="absolute top-0 h-0.5 bg-green-300"
                          style={{
                            left: isFirst ? "50%" : 0,
                            right: isLast ? "50%" : 0,
                          }}
                        />
                        <span
                          aria-hidden
                          className="absolute top-0 left-1/2 h-5 w-0.5 -translate-x-1/2 bg-green-300"
                        />
                        <PersonCard
                          name={child.name}
                          subtitle={relationLabel(child.relation)}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {others.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink">その他のご家族</h2>
          <div className="flex gap-4 overflow-x-auto pb-1">
            {others.map((member) => (
              <PersonCard
                key={member.id}
                name={member.name}
                subtitle={relationLabel(member.relation)}
              />
            ))}
          </div>
        </div>
      )}

      <Link
        href="/settings#family"
        className="self-start text-sm text-green-700 underline underline-offset-2"
      >
        家族を追加・編集する
      </Link>
    </div>
  );
}
