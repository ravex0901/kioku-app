"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildInheritanceChecklist } from "@/lib/inheritanceProcedures";
import type { CategoryMajor, DigitalItemType, Disposition } from "@/lib/types";

type ItemRow = {
  name: string;
  category_major: CategoryMajor | null;
  disposition: Disposition | null;
};
type DigitalItemRow = { title: string; item_type: DigitalItemType };

export type HandoverStatus =
  | { found: false }
  | {
      found: true;
      unlocked: false;
      conditionMet: boolean;
      requiresApproval: boolean;
      inactiveDays: number;
      thresholdDays: number;
    }
  | {
      found: true;
      unlocked: true;
      conditionMet: boolean;
      requiresApproval: boolean;
      inactiveDays: number;
      thresholdDays: number;
      will: {
        message: string | null;
        video_url: string | null;
        legal_will_note: string | null;
        legal_disclaimer_acknowledged_at: string | null;
      } | null;
      items: ItemRow[];
      digitalItems: DigitalItemRow[];
      checklistProgress: Record<string, boolean>;
    };

// 「なし」設定時のしきい値(SettingsClientの NONE_INACTIVE_DAYS と対応)。
// この値以上の場合は「自動開示は設定されていません」の案内に切り替える。
const DISABLED_THRESHOLD_DAYS = 36500;

export function HandoverView({
  token,
  initialStatus,
}: {
  token: string;
  initialStatus: HandoverStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  async function refresh() {
    const supabase = createClient();
    const { data } = await supabase.rpc("get_handover_status", {
      p_token: token,
    });
    if (data) setStatus(data as unknown as HandoverStatus);
  }

  async function handleApprove() {
    setApproving(true);
    setApproveError(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("approve_handover", {
      p_token: token,
    });
    setApproving(false);
    if (error || !data) {
      setApproveError(
        "承認できませんでした。条件を満たしていない可能性があります。"
      );
      return;
    }
    await refresh();
  }

  if (!status.found) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-ink/60">
          このリンクは無効です。URLをご確認ください。
        </p>
      </div>
    );
  }

  if (!status.unlocked) {
    if (status.thresholdDays >= DISABLED_THRESHOLD_DAYS) {
      return (
        <div className="mx-auto max-w-md px-4 py-16">
          <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
            もしもの時
          </p>
          <h1 className="mt-2 font-serif-jp text-xl font-bold text-ink">
            自動開示は設定されていません
          </h1>
          <div className="mt-6 rounded-2xl border border-gold/40 bg-gold/10 p-5">
            <p className="text-sm text-ink/70">
              本人は「非アクティブと判定するまでの日数」を「なし」に設定しているため、このリンクからの自動開示は行われません。
            </p>
          </div>
        </div>
      );
    }

    const progressPercent = Math.min(
      100,
      Math.round((status.inactiveDays / Math.max(1, status.thresholdDays)) * 100)
    );
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
          もしもの時
        </p>
        <h1 className="mt-2 font-serif-jp text-xl font-bold text-ink">
          開示条件を確認中です
        </h1>
        <div className="mt-6 rounded-2xl border border-gold/40 bg-gold/10 p-5">
          <p className="text-sm text-ink/70">
            本人の最終利用から
            <span className="font-bold text-ink">
              {status.inactiveDays}日
            </span>
            が経過しています(開示条件:{status.thresholdDays}日間の非アクティブ)
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/5">
            <div
              className="h-full rounded-full bg-gold"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {!status.conditionMet && (
          <p className="mt-4 text-xs text-ink/50">
            条件を満たしていないため、まだ内容を開示できません。しばらくしてから再度このページをご確認ください。
          </p>
        )}

        {status.conditionMet && status.requiresApproval && (
          <div className="mt-4 rounded-2xl border border-black/10 bg-white/70 p-4">
            <p className="mb-3 text-sm text-ink/70">
              非アクティブ条件を満たしています。承認者として開示を承認しますか?
            </p>
            {approveError && (
              <p className="mb-2 text-xs text-red-600">{approveError}</p>
            )}
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-60"
            >
              {approving ? "処理中…" : "開示を承認する"}
            </button>
          </div>
        )}
      </div>
    );
  }

  const checklist = buildInheritanceChecklist(status.items, status.digitalItems);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
        もしもの時
      </p>
      <h1 className="mt-2 font-serif-jp text-2xl font-bold text-ink">
        ご本人からのメッセージ
      </h1>

      <div className="mt-6 rounded-[1.75rem] border border-gold/40 bg-gold/10 p-5 sm:p-6">
        {status.will?.message ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
            {status.will.message}
          </p>
        ) : (
          <p className="text-sm text-ink/50">
            メッセージは登録されていません。
          </p>
        )}
        {status.will?.video_url && (
          <a
            href={status.will.video_url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-green-600 px-5 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-50"
          >
            メッセージ動画を見る
          </a>
        )}
      </div>

      {status.will?.legal_will_note && (
        <div className="mt-4 rounded-[1.75rem] border border-red-200 bg-red-50/40 p-5 sm:p-6">
          <h2 className="text-sm font-bold text-ink">
            法的な遺言事項に関する記録(財産の分け方など)
          </h2>
          <div className="mt-2 rounded-lg border border-red-200 bg-white/80 p-3">
            <p className="text-[11px] leading-relaxed text-red-700">
              ※これは正式な遺言書ではありません。民法で定める方式(自筆証書遺言・公正証書遺言など)を満たしていないため、法的な効力はありません。実際の相続手続きにあたっては、必ず税理士・弁護士・司法書士などの専門家にご確認ください。ここに書かれている内容は、ご本人の意向を把握するための参考情報です。
            </p>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
            {status.will.legal_will_note}
          </p>
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-3 text-lg font-bold text-ink">
          登録されている「もの」
        </h2>
        {status.items.length === 0 ? (
          <p className="text-sm text-ink/50">登録がありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {status.items.map((item, i) => (
              <li
                key={i}
                className="rounded-xl border border-green-100 bg-white/70 px-4 py-2.5 text-sm text-ink"
              >
                {item.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <h2 className="mb-1 text-lg font-bold text-ink">
          相続手続きチェックリスト
        </h2>
        <p className="mb-3 text-xs text-ink/50">
          登録された遺品・デジタル情報をもとに判定された、必要な手続き・期限・必要書類です。
        </p>
        <div className="flex flex-col gap-2">
          {checklist.map((procedure) => {
            const done = !!status.checklistProgress[procedure.key];
            return (
              <div
                key={procedure.key}
                className="rounded-xl border border-black/5 bg-white/80 p-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                      done
                        ? "border-green-600 bg-green-600 text-white"
                        : "border-black/20 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <p
                    className={`text-sm font-semibold ${done ? "text-ink/40 line-through" : "text-ink"}`}
                  >
                    {procedure.title}
                  </p>
                </div>
                <p className="mt-1 pl-7 text-xs text-ink/50">
                  期限:{procedure.deadline}
                </p>
                <ul className="mt-1 list-disc pl-11 text-xs text-ink/50">
                  {procedure.documents.map((doc) => (
                    <li key={doc}>{doc}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

