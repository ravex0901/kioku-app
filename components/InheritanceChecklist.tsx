"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  buildInheritanceChecklist,
  type ProcedureItem,
} from "@/lib/inheritanceProcedures";
import type { CategoryMajor, DigitalItemType } from "@/lib/types";

type Props = {
  userId: string;
  items: { category_major: CategoryMajor | null }[];
  digitalItems: { item_type: DigitalItemType }[];
  initialProgress: Record<string, boolean>;
};

export function InheritanceChecklist({
  userId,
  items,
  digitalItems,
  initialProgress,
}: Props) {
  const procedures = buildInheritanceChecklist(items, digitalItems);
  const [progress, setProgress] =
    useState<Record<string, boolean>>(initialProgress);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const doneCount = procedures.filter((p) => progress[p.key]).length;

  async function toggle(procedure: ProcedureItem) {
    const next = !progress[procedure.key];
    setProgress((prev) => ({ ...prev, [procedure.key]: next }));
    setSaving(procedure.key);
    const supabase = createClient();
    await supabase.from("inheritance_checklist_progress").upsert(
      {
        user_id: userId,
        procedure_key: procedure.key,
        done: next,
      },
      { onConflict: "user_id,procedure_key" }
    );
    setSaving(null);
  }

  return (
    <div className="rounded-[1.75rem] border border-gold/40 bg-gold/10 p-5 shadow-sm sm:p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">
          相続手続きチェックリスト
        </h2>
        <span className="text-xs font-medium text-ink/50">
          {doneCount} / {procedures.length} 完了
        </span>
      </div>
      <p className="mb-4 text-xs text-ink/60">
        登録済みの「もの」「デジタル情報」の内容から、必要になりそうな手続き・期限・必要書類をAIが自動判定しています。ご家族が開示承認を行うと、このチェックリストを含む内容が共有されます。
      </p>
      <div className="flex flex-col gap-2">
        {procedures.map((procedure) => {
          const isOpen = openKey === procedure.key;
          const isDone = !!progress[procedure.key];
          return (
            <div
              key={procedure.key}
              className={`rounded-xl border bg-white/80 transition ${
                isDone ? "border-green-200" : "border-black/5"
              }`}
            >
              <div className="flex items-start gap-3 p-3">
                <button
                  type="button"
                  onClick={() => toggle(procedure)}
                  disabled={saving === procedure.key}
                  aria-label={isDone ? "完了を解除する" : "完了にする"}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition ${
                    isDone
                      ? "border-green-600 bg-green-600 text-white"
                      : "border-black/20 text-transparent"
                  }`}
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setOpenKey(isOpen ? null : procedure.key)
                  }
                  className="flex-1 text-left"
                >
                  <p
                    className={`text-sm font-semibold ${
                      isDone ? "text-ink/40 line-through" : "text-ink"
                    }`}
                  >
                    {procedure.title}
                  </p>
                  <p className="mt-0.5 text-xs text-ink/50">
                    期限:{procedure.deadline}
                  </p>
                </button>
                <span aria-hidden className="mt-1 text-xs text-ink/30">
                  {isOpen ? "▲" : "▼"}
                </span>
              </div>
              {isOpen && (
                <div className="border-t border-black/5 px-3 pb-3 pt-2">
                  <p className="mb-1.5 text-xs font-semibold text-ink/70">
                    必要書類(不足がないかご確認ください)
                  </p>
                  <ul className="mb-2 list-disc pl-4 text-xs text-ink/60">
                    {procedure.documents.map((doc) => (
                      <li key={doc}>{doc}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-ink/40">
                    判定理由:{procedure.reasons.join(" / ")}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
