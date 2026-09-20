"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { askAboutInheritanceProcedure } from "@/app/actions/ai";
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

  // 「やり方がわからない」人向けのAI質問サポート(手続きごとに1つの質問文・回答を保持)
  const [aiQuestions, setAiQuestions] = useState<Record<string, string>>({});
  const [aiAnswers, setAiAnswers] = useState<Record<string, string>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});
  const [aiLoadingKey, setAiLoadingKey] = useState<string | null>(null);

  const doneCount = procedures.filter((p) => progress[p.key]).length;

  async function handleAskAi(procedure: ProcedureItem) {
    const question = (aiQuestions[procedure.key] ?? "").trim();
    if (!question) return;

    setAiLoadingKey(procedure.key);
    setAiErrors((prev) => ({ ...prev, [procedure.key]: "" }));
    setAiAnswers((prev) => ({ ...prev, [procedure.key]: "" }));

    try {
      const result = await askAboutInheritanceProcedure(
        {
          title: procedure.title,
          deadline: procedure.deadline,
          documents: procedure.documents,
        },
        question
      );
      if (result.ok) {
        setAiAnswers((prev) => ({ ...prev, [procedure.key]: result.answer }));
      } else {
        setAiErrors((prev) => ({ ...prev, [procedure.key]: result.error }));
      }
    } catch {
      setAiErrors((prev) => ({
        ...prev,
        [procedure.key]: "回答の取得に失敗しました。もう一度お試しください。",
      }));
    } finally {
      setAiLoadingKey(null);
    }
  }

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

                  <div className="mt-3 border-t border-black/5 pt-3">
                    <p className="mb-1.5 text-xs font-semibold text-ink/70">
                      やり方がわからないときは、AIに質問できます
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={aiQuestions[procedure.key] ?? ""}
                        onChange={(e) =>
                          setAiQuestions((prev) => ({
                            ...prev,
                            [procedure.key]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAskAi(procedure);
                          }
                        }}
                        placeholder="例:戸籍謄本はどこで取れますか?"
                        className="flex-1 rounded-full border border-black/10 bg-white px-4 py-2 text-xs text-ink outline-none focus:border-green-400"
                      />
                      <button
                        type="button"
                        onClick={() => handleAskAi(procedure)}
                        disabled={
                          aiLoadingKey === procedure.key ||
                          !(aiQuestions[procedure.key] ?? "").trim()
                        }
                        className="shrink-0 rounded-full bg-green-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-800 disabled:opacity-40"
                      >
                        {aiLoadingKey === procedure.key
                          ? "考え中…"
                          : "AIに質問する"}
                      </button>
                    </div>

                    {aiLoadingKey === procedure.key && (
                      <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-[11px] text-green-700">
                        考えています…
                      </p>
                    )}
                    {aiAnswers[procedure.key] && aiLoadingKey !== procedure.key && (
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
                        {aiAnswers[procedure.key]}
                      </p>
                    )}
                    {aiErrors[procedure.key] && aiLoadingKey !== procedure.key && (
                      <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-600">
                        {aiErrors[procedure.key]}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 border-t border-black/5 pt-3 text-[11px] leading-relaxed text-ink/40">
        ※このチェックリストは、登録済みの情報をもとにルールエンジンが機械的に判定した目安であり、法的判断の確定結果はありません。実際の手続きにあたっては、税理士・弁護士・司法書士などの専門家や、各窓口に必ずご確認ください。
      </p>
    </div>
  );
}
