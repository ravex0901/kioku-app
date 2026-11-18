"use client";

import { useEffect, useState, useTransition } from "react";
import { previewRien, rienFamilyMember, type RienPreview } from "@/app/actions/familyUnlink";
import type { FamilyMember } from "@/lib/types";

// 「離縁」の確認画面(2026-11-18 オーナー決定)。
// 家系図には残したまま、相手と「相手だけにつながっている方」と、お互いの写真・日記などを見えなくする。

type Props = {
  member: FamilyMember;
  onClose: () => void;
  onDone: (linkedUserId: string) => void;
};

type Step =
  | { kind: "loading" }
  | { kind: "error"; text: string }
  | { kind: "confirm"; p: Extract<RienPreview, { ok: true }> }
  | { kind: "done"; name: string };

export function RienDialog({ member, onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [pending, startTransition] = useTransition();
  const linkedUserId = member.linked_user_id as string;

  useEffect(() => {
    let alive = true;
    previewRien(linkedUserId).then((r) => {
      if (!alive) return;
      setStep(r.ok ? { kind: "confirm", p: r } : { kind: "error", text: r.error });
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

  function run(p: Extract<RienPreview, { ok: true }>) {
    startTransition(async () => {
      const r = await rienFamilyMember(linkedUserId);
      if (!r.ok) {
        setStep({ kind: "error", text: r.error });
        return;
      }
      onDone(linkedUserId);
      setStep({ kind: "done", name: p.name });
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rien-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-cream p-6 shadow-xl">
        <h2 id="rien-title" className="font-serif-jp text-2xl font-bold text-ink">
          離縁
        </h2>

        {step.kind === "loading" && <p className="mt-4 text-base text-ink/70">確認しています…</p>}

        {step.kind === "error" && (
          <>
            <p className="mt-4 text-base text-red-700">{step.text}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 min-h-[52px] w-full rounded-full border border-black/15 bg-white text-base text-ink"
            >
              閉じる
            </button>
          </>
        )}

        {step.kind === "confirm" && (
          <>
            <p className="mt-3 text-base leading-relaxed text-ink/80">
              {step.p.name}さんと離縁します。家系図にはこのまま残りますが、
              {step.p.others.length > 0 ? `${step.p.name}さんと次の方とは` : `${step.p.name}さんとは`}
              、お互いに写真・持ち物・日記・ボイスメッセージ・タイムカプセル・お知らせが見えなくなります。
            </p>
            {step.p.others.length > 0 && (
              <ul className="mt-3 rounded-xl bg-white px-4 py-3 text-base text-ink/80">
                {step.p.others.map((o) => (
                  <li key={o.userId}>{o.name}さん({step.p.name}さんを通じてつながっている方)</li>
                ))}
              </ul>
            )}
            {step.p.isSpouse && (
              <p className="mt-3 text-sm text-ink/70">家系図の線は、離婚の点々線になります。</p>
            )}
            <p className="mt-3 text-sm text-ink/70">
              離縁した方は家族欄から外れます。家系図には残り、家系図でその方をタップすると「復縁する」で元に戻せます。
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={onClose}
                className="min-h-[52px] rounded-full border border-black/15 bg-white text-base text-ink"
              >
                やめる
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(step.p)}
                className="min-h-[52px] rounded-full bg-red-600 text-base font-semibold text-white disabled:opacity-60"
              >
                {pending ? "手続き中…" : "離縁する"}
              </button>
            </div>
          </>
        )}

        {step.kind === "done" && (
          <>
            <p className="mt-4 text-base leading-relaxed text-ink">
              {step.name}さんと離縁しました。お互いの写真・日記などは見えなくなりました。元に戻すときは、家系図で{step.name}さんをタップして「復縁する」を押してください。
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 min-h-[52px] w-full rounded-full bg-green-700 text-base font-semibold text-white"
            >
              閉じる
            </button>
          </>
        )}
      </div>
    </div>
  );
}
