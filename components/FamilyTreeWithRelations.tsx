"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reconcileFamilyMember } from "@/app/actions/familyUnlink";
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
  /** 離縁している方(アカウントID)。家系図でタップすると復縁できる */
  blockedIds?: string[];
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
  blockedIds = [],
}: Props) {
  const router = useRouter();
  const [reconcile, setReconcile] = useState<{ id: string; name: string } | null>(null);
  const [reconcileMsg, setReconcileMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
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

  function runReconcile(target: { id: string; name: string }) {
    startTransition(async () => {
      const r = await reconcileFamilyMember(target.id);
      if (!r.ok) {
        setReconcileMsg(r.error);
        return;
      }
      setReconcile(null);
      setReconcileMsg(`${target.name}さんと復縁しました。写真・日記などがまた見られるようになりました。`);
      router.refresh();
    });
  }

  if (!input) {
    return <p className="rounded-2xl bg-card p-5 text-base text-ink/70">家系図を作れませんでした。</p>;
  }
  return (
    <>
      <FamilyTreeView
        input={input}
        reconcilableIds={blockedIds}
        onReconcile={(id, name) => {
          setReconcileMsg(null);
          setReconcile({ id, name });
        }}
      />
      {reconcileMsg && !reconcile && (
        <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-base text-green-800" role="status">
          {reconcileMsg}
        </p>
      )}
      {reconcile && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reconcile-title"
        >
          <div className="w-full max-w-md rounded-[1.75rem] bg-cream p-6 shadow-xl">
            <h2 id="reconcile-title" className="font-serif-jp text-2xl font-bold text-ink">
              復縁
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink/80">
              {reconcile.name}さんとの離縁を取り消します。離縁したときに一緒に見えなくなった方も含めて、
              お互いの写真・持ち物・日記などがまた見られるようになり、家族欄にも戻ります。
            </p>
            {reconcileMsg && <p className="mt-3 text-sm text-red-700">{reconcileMsg}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setReconcile(null)}
                className="min-h-[52px] rounded-full border border-black/15 bg-white text-base text-ink"
              >
                やめる
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => runReconcile(reconcile)}
                className="min-h-[52px] rounded-full bg-green-700 text-base font-semibold text-white disabled:opacity-60"
              >
                {pending ? "手続き中…" : "復縁する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
