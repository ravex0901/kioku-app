"use client";

import { useEffect, useState, useTransition } from "react";
import { familyRelationLabel } from "@/lib/constants";
import {
  previewUnlink,
  removeFamilyMember,
  separateFamilyMember,
  type UnlinkPreview,
} from "@/app/actions/familyUnlink";
import type { FamilyMember } from "@/lib/types";

// 「紐づけを解除」を押した先の画面。
//   ① 離別か削除かを選ぶ
//   ② 削除のとき、その先でつながっている方(一緒に家系図から消える方)を、ひとりずつ「残す/残さない」
//   ③ 結果
// データベースの準備がまだのとき(お試し)は、実際には何も解除せず、どうなるかだけを表示する。

type Props = {
  member: FamilyMember;
  onClose: () => void;
  /** 実際に解除できたとき:元の行を消し、新しく加わった行(元配偶者・残した方)を足す */
  onDone: (removedMemberId: string, added: FamilyMember[]) => void;
};

type Step =
  | { kind: "loading" }
  | { kind: "error"; text: string }
  | { kind: "choose"; p: UnlinkPreview }
  | { kind: "keep"; p: UnlinkPreview }
  | { kind: "confirmDelete"; p: UnlinkPreview }
  | { kind: "done"; text: string; dryRun: boolean };

export function UnlinkFamilyDialog({ member, onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();
  const linkedUserId = member.linked_user_id as string;

  useEffect(() => {
    let alive = true;
    previewUnlink(linkedUserId).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setStep({ kind: "error", text: r.error });
        return;
      }
      // 初めは「残さない」(相手側の家族はまとめて家系図から外す。残したい方だけ選ぶ)
      setKeep(Object.fromEntries(r.dependents.map((d) => [d.userId, false])));
      setStep({ kind: "choose", p: r });
    });
    return () => {
      alive = false;
    };
  }, [linkedUserId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const name = member.name;

  function doSeparate(p: UnlinkPreview) {
    startTransition(async () => {
      const r = await separateFamilyMember(linkedUserId);
      if (!r.ok) {
        setStep({ kind: "error", text: r.error });
        return;
      }
      const did = r.dryRun ? "解除します" : "解除しました";
      const text = p.removedStillConnected
        ? `${name}さんとのつながりを${did}。家系図では、${name}さんとの間が点々線(離別)になります。`
        : `${name}さんとのつながりを${did}。家系図には「元配偶者」として残り、点々線(離別)でつながります。`;
      if (!r.dryRun) onDone(member.id, r.added);
      setStep({ kind: "done", dryRun: r.dryRun, text });
    });
  }

  function doDelete(p: UnlinkPreview) {
    const kept = p.dependents.filter((d) => keep[d.userId]);
    const gone = p.dependents.filter((d) => !keep[d.userId]);
    const names = (list: { name: string }[]) => list.map((d) => `${d.name}さん`).join("・");
    startTransition(async () => {
      const r = await removeFamilyMember(
        linkedUserId,
        kept.map((d) => d.userId)
      );
      if (!r.ok) {
        setStep({ kind: "error", text: r.error });
        return;
      }
      const past = !r.dryRun;
      const parts = [
        p.removedStillConnected
          ? `${name}さんとのつながりを${past ? "解除しました" : "解除します"}(${name}さんは、${names(p.via)}を通じて家系図に残ります)。`
          : `${name}さんを家系図から${past ? "削除しました" : "削除します"}。`,
        kept.length ? `${names(kept)}は家系図に${past ? "残しました" : "残します"}。` : "",
        gone.length ? `${names(gone)}は家系図から${past ? "消えました" : "消えます"}。` : "",
      ].filter(Boolean);
      if (!r.dryRun) onDone(member.id, r.added);
      setStep({ kind: "done", dryRun: r.dryRun, text: parts.join("") });
    });
  }

  const bigBtn =
    "flex min-h-[64px] w-full flex-col items-start justify-center rounded-2xl border-2 px-5 py-3 text-left transition disabled:opacity-60";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlink-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] bg-cream p-5 shadow-xl sm:rounded-[1.75rem] sm:p-7">
        <h2 id="unlink-title" className="font-serif-jp text-2xl font-bold text-ink">
          {name}さんとのつながり
        </h2>

        {step.kind !== "loading" && step.kind !== "error" && step.kind !== "done" && !step.p.available && (
          <div className="mt-3 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3 text-sm leading-relaxed text-ink">
            <span className="font-semibold">いまは「お試し」です。</span>
            押しても実際には解除せず、どうなるかだけを表示します。
          </div>
        )}

        {step.kind === "loading" && <p className="mt-4 text-base text-ink/70">確認しています…</p>}

        {step.kind === "error" && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-base text-red-700">
            {step.text}
          </p>
        )}

        {step.kind === "choose" && (
          <>
            <p className="mt-3 text-base leading-relaxed text-ink/80">
              つながりを解除すると、{name}さんは、あなたの日記や持ち物などを見られなくなります。家系図をどうするか選んでください。
            </p>
            {step.p.removedStillConnected && (
              <p className="mt-3 rounded-xl bg-white px-4 py-3 text-sm leading-relaxed text-ink/80">
                ※{name}さんは、{step.p.via.map((v) => `${v.name}さん`).join("・")}を通じてもつながっているため、どちらを選んでも家系図には表示されます。
              </p>
            )}
            <div className="mt-5 flex flex-col gap-3">
              {step.p.canSeparate && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => doSeparate(step.p)}
                  className={`${bigBtn} border-green-700 bg-white hover:bg-green-50`}
                >
                  <span className="text-lg font-bold text-green-800">離別(離婚など)</span>
                  <span className="mt-0.5 text-sm text-ink/70">家系図に残し、点々線でつなぎます</span>
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  setStep(step.p.dependents.length > 0 ? { kind: "keep", p: step.p } : { kind: "confirmDelete", p: step.p })
                }
                className={`${bigBtn} border-red-300 bg-white hover:bg-red-50`}
              >
                <span className="text-lg font-bold text-red-700">削除</span>
                <span className="mt-0.5 text-sm text-ink/70">家系図から消します</span>
              </button>
            </div>
          </>
        )}

        {step.kind === "keep" && (
          <>
            <p className="mt-3 text-base leading-relaxed text-ink/80">
              {name}さんを削除すると、{name}さんを通じてつながっている次の方も、家系図から消え、あなたとのアカウントのつながりも解除されます。残したい方だけ「残す」を選んでください(アカウントのつながりのない家族として、名前だけ残ります)。
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {step.p.dependents.map((d) => (
                <li key={d.userId} className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-lg font-semibold text-ink">{d.name}さん</p>
                  <p className="text-sm text-ink/60">
                    {d.relationToRemoved
                      ? `${name}さんの${familyRelationLabel(d.relationToRemoved)}`
                      : `${name}さんのご家族`}
                    {keep[d.userId] && `/残すと、あなたの「${familyRelationLabel(d.suggestedRelation)}」として登録します`}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={`${d.name}さんを残すか`}>
                    {(
                      [
                        [true, "残す"],
                        [false, "残さない"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={keep[d.userId] === v}
                        onClick={() => setKeep((k) => ({ ...k, [d.userId]: v }))}
                        className={`min-h-[52px] rounded-xl border-2 text-base font-semibold transition ${
                          keep[d.userId] === v
                            ? "border-green-700 bg-green-700 text-white"
                            : "border-black/10 bg-white text-ink"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-ink/60">続柄は、あとから家系図の下の「家族」の欄で直せます。</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStep({ kind: "choose", p: step.p })}
                className="min-h-[52px] rounded-full border border-black/15 bg-white text-base text-ink"
              >
                戻る
              </button>
              <button
                type="button"
                onClick={() => setStep({ kind: "confirmDelete", p: step.p })}
                className="min-h-[52px] rounded-full bg-red-600 text-base font-semibold text-white"
              >
                次へ
              </button>
            </div>
          </>
        )}

        {step.kind === "confirmDelete" && (
          <>
            <p className="mt-3 text-base leading-relaxed text-ink">
              {name}さんを削除します。<span className="font-semibold">この操作は取り消せません。</span>
            </p>
            {step.p.dependents.length > 0 && (
              <ul className="mt-3 rounded-xl bg-white px-4 py-3 text-base text-ink/80">
                {step.p.dependents.map((d) => (
                  <li key={d.userId}>
                    {d.name}さん:{keep[d.userId] ? "残す" : "残さない(消えます)"}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  setStep(step.p.dependents.length > 0 ? { kind: "keep", p: step.p } : { kind: "choose", p: step.p })
                }
                className="min-h-[52px] rounded-full border border-black/15 bg-white text-base text-ink"
              >
                戻る
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => doDelete(step.p)}
                className="min-h-[52px] rounded-full bg-red-600 text-base font-semibold text-white disabled:opacity-60"
              >
                {pending ? "削除しています…" : "削除する"}
              </button>
            </div>
          </>
        )}

        {step.kind === "done" && (
          <p
            role="status"
            className={`mt-4 rounded-xl px-4 py-3 text-base leading-relaxed ${
              step.dryRun ? "bg-gold/10 text-ink" : "bg-green-50 text-green-800"
            }`}
          >
            {step.dryRun && (
              <span className="mb-1 block font-semibold">お試しのため、実際には解除していません。本番では、こうなります:</span>
            )}
            {step.text}
          </p>
        )}

        {(step.kind === "done" || step.kind === "error" || step.kind === "choose" || step.kind === "loading") && (
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="mt-5 min-h-[52px] w-full rounded-full border border-black/15 bg-white text-base text-ink disabled:opacity-60"
          >
            {step.kind === "done" ? "閉じる" : "やめる"}
          </button>
        )}
      </div>
    </div>
  );
}
