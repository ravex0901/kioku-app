"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildInheritanceChecklist } from "@/lib/inheritanceProcedures";
import { submitDeathCertificate } from "@/app/actions/deathCertificate";
import { toggleFamilyChecklist } from "@/app/actions/familyChecklist";
import {
  buildFamilyBurdenTasks,
  summarizeBurdenTasks,
} from "@/lib/familyBurdenTasks";
import {
  estimateMaxYen,
  isSellCandidate,
  formatPriceDisplay,
} from "@/lib/priceRange";
import { isKeepDisposition } from "@/lib/constants";
import { InheritanceTaxCalculator } from "@/components/InheritanceTaxCalculator";
import { PreparationScoreCard } from "@/components/PreparationScoreCard";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import type {
  CategoryMajor,
  DigitalItemStatus,
  DigitalItemType,
  Disposition,
  HandoverDisclosureStatus,
  ItemStatus,
} from "@/lib/types";

type ItemRow = {
  name: string;
  category_major: CategoryMajor | null;
  disposition: Disposition | null;
  status?: ItemStatus | null;
  estimated_price_range?: string | null;
  professional_appraisal?: string | null;
  located?: boolean;
};
type DigitalItemRow = {
  title: string;
  item_type: DigitalItemType;
  status?: DigitalItemStatus | null;
};
type BucketListRow = { title: string; done: boolean };
type MedicalInfoShared = {
  doctor_name: string | null;
  hospital_name: string | null;
  doctor_phone: string | null;
  conditions: string | null;
  medications: string | null;
} | null;
type AlbumPhotoShared = { url: string | null; caption: string | null };
type AlbumShared = { name: string; photos: AlbumPhotoShared[] };
type MoodRecentShared = { mood: "good" | "normal" | "bad"; log_date: string } | null;

const MOOD_EMOJI: Record<"good" | "normal" | "bad", string> = {
  good: "😊",
  normal: "😐",
  bad: "😟",
};

export type HandoverStatus =
  | { found: false }
  | {
      found: true;
      unlocked: false;
      conditionMet: boolean;
      requiresApproval: boolean;
      disclosureStatus: HandoverDisclosureStatus;
      inactiveDays: number;
      thresholdDays: number;
      recipientName?: string | null;
      ownerUserId?: string;
      // 開示承認済み。内容は共有リンクではなく、指定されたアカウント内でのみ表示する。
      accountOnly?: boolean;
    }
  | {
      found: true;
      unlocked: true;
      conditionMet: boolean;
      requiresApproval: boolean;
      inactiveDays: number;
      thresholdDays: number;
      recipientName?: string | null;
      will: {
        message: string | null;
        video_url: string | null;
        legal_will_note: string | null;
        legal_disclaimer_acknowledged_at: string | null;
      } | null;
      items: ItemRow[];
      digitalItems: DigitalItemRow[];
      checklistProgress: Record<string, boolean>;
      bucketList: BucketListRow[];
      medical: MedicalInfoShared;
      album: AlbumPhotoShared[];
      albums?: AlbumShared[];
      moodRecent: MoodRecentShared;
    };

// 「なし」設定時のしきい値(SettingsClientの NONE_INACTIVE_DAYS と対応)。
// この値以上の場合は「自動開示は設定されていません」の案内に切り替える。
const DISABLED_THRESHOLD_DAYS = 36500;

export function HandoverView({
  token,
  initialStatus,
  checklistOwnerId,
}: {
  token: string;
  initialStatus: HandoverStatus;
  // 指定すると、相続手続きチェックリストにチェックを付けられる(アカウント内の表示のみ)
  checklistOwnerId?: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [openAlbumIndex, setOpenAlbumIndex] = useState<number | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  async function handleToggleChecklist(key: string, next: boolean) {
    if (!checklistOwnerId || !status.found || !status.unlocked) return;
    setCheckError(null);
    const prev = status.checklistProgress;
    setStatus({ ...status, checklistProgress: { ...prev, [key]: next } });
    const result = await toggleFamilyChecklist(checklistOwnerId, key, next);
    if (!result.ok) {
      setStatus((cur) =>
        cur.found && cur.unlocked ? { ...cur, checklistProgress: prev } : cur
      );
      setCheckError(result.error ?? "保存に失敗しました。");
    }
  }
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

  if (!status.unlocked && status.accountOnly) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
          もしもの時
        </p>
        <h1 className="mt-2 font-serif-jp text-3xl font-bold text-ink">
          アカウントにログインしてご覧ください
        </h1>
        <div className="mt-6 rounded-2xl border border-gold/40 bg-gold/10 p-5">
          <p className="text-sm text-ink/70">
            開示が承認されています。安全のため、遺言書・遺言動画などの内容は共有リンクでは表示されません。ご本人から指定されたアカウントでログインし、設定の「その他の管理」にある「もしもの書類提出」から「『もしもの時』の内容を見る」を開いてください。
          </p>
          <a
            href="/login"
            className="mt-4 inline-flex min-h-[50px] items-center justify-center rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800"
          >
            ログインする
          </a>
        </div>
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
          <h1 className="mt-2 font-serif-jp text-3xl font-bold text-ink">
            ご本人の内容を確認する
          </h1>
          <div className="mt-6 rounded-2xl border border-gold/40 bg-gold/10 p-5">
            <p className="text-sm text-ink/70">
              ご本人は自動開示(非アクティブ検知)を設定していません。死亡診断書などの画像を提出し、運営が内容を確認・承認すると、この画面で内容をご覧いただけます。
            </p>
          </div>
          <DeathCertificateStage
            token={token}
            disclosureStatus={status.disclosureStatus}
            onSubmitted={refresh}
          />
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
        <h1 className="mt-2 font-serif-jp text-3xl font-bold text-ink">
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
              className="inline-flex min-h-[50px] items-center justify-center rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-60"
            >
              {approving ? "処理中…" : "開示を承認する"}
            </button>
          </div>
        )}

        {status.conditionMet && !status.requiresApproval && (
          <DeathCertificateStage
            token={token}
            disclosureStatus={status.disclosureStatus}
            onSubmitted={refresh}
          />
        )}
      </div>
    );
  }

  const checklist = buildInheritanceChecklist(status.items, status.digitalItems);

  // ダッシュボードと同じ内容(家族に残る作業・売却候補)をご家族向けにも表示する
  const burdenTasks = buildFamilyBurdenTasks(
    status.items.map((i, idx) => ({
      id: String(idx),
      name: i.name,
      status: i.status ?? null,
      disposition: i.disposition,
      category_major: i.category_major,
    })),
    status.digitalItems.map((d, idx) => ({
      id: String(idx),
      title: d.title,
      item_type: d.item_type,
      status: d.status ?? null,
    }))
  );
  const burdenSummary = summarizeBurdenTasks(burdenTasks);
  const totalRemainingHours = burdenSummary.reduce((sum, x) => sum + x.hours, 0);
  const totalWorkUnits = status.items.length + status.digitalItems.length;
  const remainingWorkUnits = burdenTasks.length;
  const burdenProgressRatio =
    totalWorkUnits > 0
      ? Math.round(((totalWorkUnits - remainingWorkUnits) / totalWorkUnits) * 100)
      : 100;
  const sellCandidates = status.items
    .filter(
      (i) =>
        !isKeepDisposition(i.disposition) &&
        isSellCandidate(i.estimated_price_range ?? null)
    )
    .sort(
      (a, b) =>
        (estimateMaxYen(b.estimated_price_range ?? null) ?? 0) -
        (estimateMaxYen(a.estimated_price_range ?? null) ?? 0)
    )
    .slice(0, 10);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
        もしもの時
      </p>
      <h1 className="mt-2 font-serif-jp text-3xl font-bold text-ink">
        {status.recipientName
          ? `ご本人から${status.recipientName}様へのメッセージ`
          : "ご本人からのメッセージ"}
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
          <h2 className="text-lg font-bold text-ink">
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
        <PreparationScoreCard
          total={status.items.length}
          located={status.items.filter((i) => i.located).length}
          dispositionDecided={
            status.items.filter(
              (i) =>
                !!i.disposition &&
                (i.disposition as string) !== "unsure" &&
                (i.disposition as string) !== "undecided"
            ).length
          }
          digitalCount={status.digitalItems.length}
          hasMessage={!!status.will?.message}
          hasVideo={!!status.will?.video_url}
        />
      </div>

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
        {checkError && <p className="mb-2 text-xs text-red-600">{checkError}</p>}
        <div className="flex flex-col gap-2">
          {checklist.map((procedure) => {
            const done = !!status.checklistProgress[procedure.key];
            return (
              <div
                key={procedure.key}
                className="rounded-xl border border-black/5 bg-white/80 p-3"
              >
                <div className="flex items-center gap-2">
                  {checklistOwnerId ? (
                    <button
                      type="button"
                      onClick={() => handleToggleChecklist(procedure.key, !done)}
                      aria-label={done ? "完了を解除する" : "完了にする"}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition ${
                        done
                          ? "border-green-600 bg-green-600 text-white"
                          : "border-black/30 text-transparent hover:border-green-600"
                      }`}
                    >
                      ✓
                    </button>
                  ) : (
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                        done
                          ? "border-green-600 bg-green-600 text-white"
                          : "border-black/20 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  )}
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

      <div className="mt-6 rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm sm:p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">ご家族に残る作業</h2>
          <span className="text-xs font-medium text-ink/50">
            進捗 {burdenProgressRatio}%
          </span>
        </div>
        <p className="mb-4 text-xs text-ink/60">
          登録された「モノ」や「デジタルの情報」をもとに、まだ残っている作業を種類ごとに自動で計算しています。かかる時間はあくまで目安です。
        </p>
        {burdenSummary.length === 0 ? (
          <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
            今のところ、残っている作業はありません。
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {burdenSummary.map((x) => (
                <div key={x.category} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs font-medium text-ink/60">
                    {x.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((x.count / Math.max(1, remainingWorkUnits)) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs font-semibold text-ink/70">
                    {x.count}件・約{x.hours}h
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink/50">
              残っている作業:合計{remainingWorkUnits}件・かかる時間の目安:約
              {Math.round(totalRemainingHours * 10) / 10}時間
            </p>
          </>
        )}
      </div>

      <div className="mt-6 rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm sm:p-6">
        <h2 className="mb-1 text-lg font-bold text-ink">売れるかもしれないモノ</h2>
        <p className="mb-4 text-xs text-ink/60">
          AIが見積もった価格をもとに、一定額以上で売れそうなモノをリストアップしています。あくまで目安の金額です。
        </p>
        {sellCandidates.length === 0 ? (
          <p className="rounded-xl bg-black/[0.03] px-4 py-3 text-sm text-ink/60">
            今のところ、売却候補になるものはありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sellCandidates.map((item, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-xl bg-gold/10 px-3 py-2.5 text-sm"
              >
                <span className="font-medium text-ink">{item.name}</span>
                <span className="text-xs font-semibold text-green-800">
                  {item.professional_appraisal ??
                    formatPriceDisplay(item.estimated_price_range ?? null)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <InheritanceTaxCalculator />
      </div>

      {status.bucketList.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-bold text-ink">
            やりたいことリスト
          </h2>
          <ul className="flex flex-col gap-2">
            {status.bucketList.map((b, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-xl border border-green-100 bg-white/70 px-4 py-2.5 text-sm text-ink"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                    b.done
                      ? "border-green-600 bg-green-600 text-white"
                      : "border-black/20 text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className={b.done ? "text-ink/40 line-through" : ""}>
                  {b.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {status.medical && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-bold text-ink">
            医療情報
          </h2>
          <div className="flex flex-col gap-1.5 rounded-xl border border-black/5 bg-white/80 p-4 text-sm text-ink/80">
            {status.medical.hospital_name && (
              <p>病院名:{status.medical.hospital_name}</p>
            )}
            {status.medical.doctor_name && (
              <p>かかりつけ医:{status.medical.doctor_name}</p>
            )}
            {status.medical.doctor_phone && (
              <p>電話番号:{status.medical.doctor_phone}</p>
            )}
            {status.medical.conditions && (
              <div>
                <p className="font-semibold text-ink">持病</p>
                <p className="whitespace-pre-wrap text-ink/70">
                  {status.medical.conditions}
                </p>
              </div>
            )}
            {status.medical.medications && (
              <div>
                <p className="font-semibold text-ink">今飲んでいる薬</p>
                <p className="whitespace-pre-wrap text-ink/70">
                  {status.medical.medications}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {(status.albums ?? []).length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-bold text-ink">アルバム</h2>
          {openAlbumIndex !== null && (status.albums ?? [])[openAlbumIndex] ? (
            <div>
              <button
                type="button"
                onClick={() => setOpenAlbumIndex(null)}
                className="mb-3 rounded-full border border-green-200 bg-white/70 px-4 py-2 text-xs font-semibold text-green-800 transition hover:bg-green-50"
              >
                ← アルバム一覧へ
              </button>
              <p className="mb-3 text-sm font-semibold text-ink">
                {(status.albums ?? [])[openAlbumIndex].name}
              </p>
              {(status.albums ?? [])[openAlbumIndex].photos.length === 0 ? (
                <p className="text-sm text-ink/50">写真がありません。</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(status.albums ?? [])[openAlbumIndex].photos.map((photo, i) =>
                    photo.url ? (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setZoomUrl(photo.url)}
                        aria-label="写真を拡大する"
                        className="aspect-square overflow-hidden rounded-xl border border-black/5 bg-white/60"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt={photo.caption ?? ""}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : null
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(status.albums ?? []).map((album, i) => {
                const cover = album.photos.find((ph) => ph.url)?.url ?? null;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setOpenAlbumIndex(i)}
                    className="overflow-hidden rounded-2xl border border-black/5 bg-white/80 text-left transition hover:border-green-300"
                  >
                    <div className="aspect-square bg-green-50">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-green-300">
                          写真なし
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="truncate text-sm font-semibold text-ink">
                        {album.name}
                      </p>
                      <p className="text-[11px] text-ink/50">{album.photos.length}枚</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <PhotoLightbox url={zoomUrl} onClose={() => setZoomUrl(null)} />

      {status.moodRecent && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-bold text-ink">今日の調子</h2>
          <div className="flex items-center gap-3 rounded-xl border border-black/5 bg-white/80 p-4">
            <span className="text-3xl">{MOOD_EMOJI[status.moodRecent.mood]}</span>
            <span className="text-sm text-ink/60">
              {status.moodRecent.log_date}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// 非アクティブ検知の条件を満たした後、本当に「もしもの時」かどうかを確認するための
// 死亡届(または除籍謄本等)の画像提出〜運営確認の段階を表示する。
function DeathCertificateStage({
  token,
  disclosureStatus,
  onSubmitted,
}: {
  token: string;
  disclosureStatus: HandoverDisclosureStatus;
  onSubmitted: () => void;
}) {
  const [submittedByName, setSubmittedByName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (disclosureStatus === "certificate_submitted") {
    return (
      <div className="mt-4 rounded-2xl border border-black/10 bg-white/70 p-4">
        <p className="text-sm text-ink/70">
         死亡診断書(死体検案書)・死亡届記載事項証明書・除籍謄本(戸籍)等の画像を受け付けました。運営が内容を確認しています。確認が完了するまで、今しばらくお待ちください。
          </p>
      </div>
    );
  }

  async function handleSubmit() {
    setError(null);
    if (!submittedByName.trim()) {
      setError("お名前を入力してください。");
      return;
    }
    if (!file) {
      setError("画像を選択してください。");
      return;
    }
    setSubmitting(true);
    const formData = new FormData();
    formData.set("submittedByName", submittedByName.trim());
    formData.set("image", file);
    const result = await submitDeathCertificate(token, formData);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSubmitted();
  }

  return (
    <div className="mt-4 rounded-2xl border border-black/10 bg-white/70 p-4">
      <p className="mb-3 text-sm text-ink/70">
       ご本人と長期間連絡が取れない状態が続いています。大変お手数ですが、本当に「もしもの時」であることを確認するため、次のいずれかの画像を提出してください:「死亡診断書(死体検案書)」「除籍謄本(戸籍)」「死亡届記載事項証明書」、または死亡届そのものなど、死亡の事実が確認できる書類。運営が内容を確認したうえで、内容を開示します。
      </p>
      {disclosureStatus === "rejected" && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          前回の提出内容は確認できませんでした。お手数ですが、別の書類や、より鮮明な画像で再度提出してください。
        </p>
      )}
      <div className="mb-3 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-ink/70">あなたのお名前</label>
        <input
          value={submittedByName}
          onChange={(e) => setSubmittedByName(e.target.value)}
          placeholder="例:田中 花子"
          className="min-h-[50px] rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>
      <div className="mb-3 flex flex-col gap-1.5">
        <label className="text-xs font-medium text-ink/70">
          死亡診断書(死体検案書)・除籍謄本(戸籍)・死亡届記載事項証明書等の画像
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="inline-flex min-h-[50px] items-center justify-center rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-60"
      >
        {submitting ? "送信中…" : "画像を提出する"}
      </button>
    </div>
  );
}
