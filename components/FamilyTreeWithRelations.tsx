"use client";

import { useMemo } from "react";
import { FamilyTreeView } from "@/components/FamilyTreeView";
import { familyRelationLabel } from "@/lib/constants";
import { buildTreeInput, type AccountNode, type ExplicitRelRow, type FamilyRow } from "@/lib/familyTree/fromRows";

// 家系図の表示。
// 離婚・死別などのつながり(family_relationships)は、「紐づけを解除」の離別などで登録されたものを線に反映する。
// 「ご家族のつながりを教えてください」の入力欄は 2026-11-11 オーナー決定で外した
// (続柄から自動で線を引き、離別は「紐づけを解除」から選ぶ)。

type Props = {
  viewerId: string;
  viewerName: string;
  viewerDeceased?: boolean;
  rows: FamilyRow[];
  accounts: AccountNode[];
  /** ご本人が登録した家族のうち、アカウントのない人 */
  memberRows: FamilyRow[];
  /** アカウントのない家族のうち、家系図にいつも出す方(招待リンクのない方:前の配偶者・残した方) */
  alwaysShowMemberIds?: string[];
  saved: ExplicitRelRow[];
};

export function FamilyTreeWithRelations({
  viewerId,
  viewerName,
  viewerDeceased,
  rows,
  accounts,
  memberRows,
  alwaysShowMemberIds,
  saved,
}: Props) {
  // ---- 家系図(登録内容をその場で反映) ----
  const input = useMemo(() => {
    const used = new Set<string>();
    for (const e of saved) {
      if (e.a.memberId) used.add(e.a.memberId);
      if (e.b.memberId) used.add(e.b.memberId);
    }
    const have = new Set(rows.map((r) => r.id));
    const always = new Set(alwaysShowMemberIds ?? []);
    // アカウントのない家族は、「元配偶者」・家系図に残すために登録した方・つながりを登録した方だけ家系図に出す
    // (招待リンクを送って、まだ参加していない方は出さない)
    const extra = memberRows.filter(
      (r) => !have.has(r.id) && (used.has(r.id) || always.has(r.id) || r.relation === "ex_spouse")
    );
    try {
      return buildTreeInput({
        viewerId,
        viewerName,
        viewerDeceased,
        rows: [...rows, ...extra],
        accounts,
        explicit: saved,
        relationLabel: familyRelationLabel,
      });
    } catch (e) {
      console.error("buildTreeInput failed", e);
      return null;
    }
  }, [saved, rows, memberRows, alwaysShowMemberIds, accounts, viewerId, viewerName, viewerDeceased]);

  return input ? (
    <FamilyTreeView input={input} />
  ) : (
    <p className="rounded-2xl bg-card p-5 text-base text-ink/70">家系図を作れませんでした。</p>
  );
}
