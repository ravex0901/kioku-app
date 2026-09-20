import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { InheritanceTaxCalculator } from "@/components/InheritanceTaxCalculator";
import { InheritanceChecklist } from "@/components/InheritanceChecklist";
import {
  buildFamilyBurdenTasks,
  summarizeBurdenTasks,
} from "@/lib/familyBurdenTasks";
import { estimateMaxYen, isSellCandidate, formatPriceDisplay } from "@/lib/priceRange";
import type {
  CategoryMajor,
  Disposition,
  DigitalItemStatus,
  DigitalItemType,
  ItemStatus,
} from "@/lib/types";

function ScoreRing({ percent }: { percent: number }) {
  const size = 88;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        style={{ stroke: "rgba(43,42,36,0.08)" }}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ stroke: "#213c28" }}
      />
      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="20"
        fontWeight="700"
        fill="#2b2a24"
      >
        {clamped}
      </text>
    </svg>
  );
}

function ScoreBar({ label, percent }: { label: string; percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-ink/60">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
        <div
          className="h-full rounded-full bg-green-500 transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-xs text-ink/60">
        {clamped}%
      </span>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 最終アクティブ日時を更新(「もしもの時」の非アクティブ判定の基準になる)
  await supabase
    .from("profiles")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", user.id);

  const [
    totalRes,
    locatedRes,
    dispositionRes,
    locationsRes,
    digitalRes,
    itemsForChecklistRes,
    digitalItemsForChecklistRes,
    willRes,
    checklistProgressRes,
    itemsForBurdenRes,
    digitalItemsForBurdenRes,
    sellCandidateItemsRes,
  ] = await Promise.all([
    supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("location_id", "is", null),
    supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("disposition", "is", null),
    supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("digital_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase.from("items").select("category_major").eq("user_id", user.id),
    supabase
      .from("digital_items")
      .select("item_type")
      .eq("user_id", user.id),
    supabase
      .from("wills")
      .select("message, video_url")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("inheritance_checklist_progress")
      .select("procedure_key, done")
      .eq("user_id", user.id),
    supabase
      .from("items")
      .select("id, name, status, disposition")
      .eq("user_id", user.id),
    supabase
      .from("digital_items")
      .select("id, title, item_type, status")
      .eq("user_id", user.id),
    supabase
      .from("items")
      .select("id, name, estimated_price_range, professional_appraisal, disposition")
      .eq("user_id", user.id),
  ]);

  const total = totalRes.count ?? 0;
  const located = locatedRes.count ?? 0;
  const dispositionDecided = dispositionRes.count ?? 0;
  const locationsCount = locationsRes.count ?? 0;
  const digitalCount = digitalRes.count ?? 0;

  const registeredPercent = total > 0 ? 100 : 0;
  const locatedPercent = total > 0 ? Math.round((located / total) * 100) : 0;
  const dispositionPercent =
    total > 0 ? Math.round((dispositionDecided / total) * 100) : 0;
  const digitalPercent = digitalCount > 0 ? 100 : 0;
  const endingNotePercent = willRes.data?.message ? 100 : 0;
  const willVideoPercent = willRes.data?.video_url ? 100 : 0;

  const overallScore = Math.round(
    (registeredPercent +
      locatedPercent +
      dispositionPercent +
      digitalPercent +
      endingNotePercent +
      willVideoPercent) /
      6
  );

  const checklistItems = (itemsForChecklistRes.data ?? []) as {
    category_major: CategoryMajor | null;
  }[];
  const checklistDigitalItems = (digitalItemsForChecklistRes.data ?? []) as {
    item_type: DigitalItemType;
  }[];
  const checklistProgress: Record<string, boolean> = {};
  for (const row of checklistProgressRes.data ?? []) {
    checklistProgress[row.procedure_key] = row.done;
  }

  // 家族負担・残作業量(請求項6)
  const burdenItems = (itemsForBurdenRes.data ?? []) as {
    id: string;
    name: string;
    status: ItemStatus | null;
    disposition: Disposition | null;
  }[];
  const burdenDigitalItems = (digitalItemsForBurdenRes.data ?? []) as {
    id: string;
    title: string;
    item_type: DigitalItemType;
    status: DigitalItemStatus | null;
  }[];
  const burdenTasks = buildFamilyBurdenTasks(burdenItems, burdenDigitalItems);
  const burdenSummary = summarizeBurdenTasks(burdenTasks);
  const totalRemainingHours = burdenSummary.reduce((sum, s) => sum + s.hours, 0);
  const totalWorkUnits = burdenItems.length + burdenDigitalItems.length;
  const remainingWorkUnits = burdenTasks.length;
  const burdenProgressRatio =
    totalWorkUnits > 0
      ? Math.round(((totalWorkUnits - remainingWorkUnits) / totalWorkUnits) * 100)
      : 100;

  // 資産価格・売却候補(請求項4、スコープを縮小した簡易版)
  const priceItems = (sellCandidateItemsRes.data ?? []) as {
    id: string;
    name: string;
    estimated_price_range: string | null;
    professional_appraisal: string | null;
    disposition: Disposition | null;
  }[];
  const sellCandidates = priceItems
    .filter(
      (i) => i.disposition !== "discard" && isSellCandidate(i.estimated_price_range)
    )
    .sort(
      (a, b) =>
        (estimateMaxYen(b.estimated_price_range) ?? 0) -
        (estimateMaxYen(a.estimated_price_range) ?? 0)
    )
    .slice(0, 10);

  return (
    <div className="min-h-screen bg-cream">
      <Header />
              <BackButton fallbackHref="/home" />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
            DASHBOARD
          </p>
          <h1 className="mt-2 font-serif-jp text-2xl font-bold text-ink">
            統合ダッシュボード
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            準備度スコア・手続きチェックリスト・相続税シミュレーション
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-4">
            <ScoreRing percent={overallScore} />
            <p className="text-sm text-ink/60">準備度スコア(0〜100)</p>
          </div>
          <div className="mt-5 flex flex-col gap-2.5">
            <ScoreBar label="登録" percent={registeredPercent} />
            <ScoreBar label="場所" percent={locatedPercent} />
            <ScoreBar label="処分方針" percent={dispositionPercent} />
            <ScoreBar label="デジタル資産" percent={digitalPercent} />
            <ScoreBar label="遺言書(意思伝達)" percent={endingNotePercent} />
            <ScoreBar label="遺言動画" percent={willVideoPercent} />
          </div>
          {locationsCount === 0 && (
            <p className="mt-3 text-xs text-ink/40">
              まだ場所が登録されていません。場所を管理するから登録できます。
            </p>
          )}
        </div>

        <InheritanceChecklist
          userId={user.id}
          items={checklistItems}
          digitalItems={checklistDigitalItems}
          initialProgress={checklistProgress}
        />

        {/* SCR-08 家族負担(請求項6): 残作業量をカテゴリ別に表示 */}
        <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm sm:p-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">家族負担・残作業量</h2>
            <span className="text-xs font-medium text-ink/50">
              進捗 {burdenProgressRatio}%
            </span>
          </div>
          <p className="mb-4 text-xs text-ink/60">
            登録済みの「もの」「デジタル情報」の現在の状態から、残っている作業をカテゴリ別に自動集計しています。想定工数の合計は目安です。
          </p>
          {burdenSummary.length === 0 ? (
            <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
              現時点で残っている作業はありません。
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {burdenSummary.map((s) => (
                  <div key={s.category} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs font-medium text-ink/60">
                      {s.label}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round((s.count / Math.max(1, remainingWorkUnits)) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs font-semibold text-ink/70">
                      {s.count}件・約{s.hours}h
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink/50">
                残作業合計:{remainingWorkUnits}件 / 推定残時間:約{Math.round(totalRemainingHours * 10) / 10}時間
              </p>
            </>
          )}
        </div>

        {/* SCR-06 資産価格(請求項4、簡易版): 一定額以上の推定価格の遺品を売却候補として表示 */}
        <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm sm:p-6">
          <h2 className="mb-1 text-sm font-bold text-ink">資産価格・売却候補</h2>
          <p className="mb-4 text-xs text-ink/60">
            AIが推定した価格帯をもとに、一定額以上の値がつきそうなものを売却候補として抽出しています。あくまで目安であり、確定査定ではありません。専門査定の結果は各遺品の詳細画面から登録できます。
          </p>
          {sellCandidates.length === 0 ? (
            <p className="rounded-xl bg-black/[0.03] px-4 py-3 text-sm text-ink/60">
              現時点で売却候補に該当するものはありません。
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sellCandidates.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/items/${item.id}`}
                    className="flex items-center justify-between rounded-xl bg-gold/10 px-3 py-2.5 text-sm transition hover:bg-gold/20"
                  >
                    <span className="font-medium text-ink">{item.name}</span>
                    <span className="text-xs font-semibold text-green-800">
                      {item.professional_appraisal ??
                        formatPriceDisplay(item.estimated_price_range)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <InheritanceTaxCalculator />
      </main>
    </div>
  );
}
