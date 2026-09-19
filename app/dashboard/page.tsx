import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { InheritanceTaxCalculator } from "@/components/InheritanceTaxCalculator";
import { InheritanceChecklist } from "@/components/InheritanceChecklist";
import type { CategoryMajor, DigitalItemType } from "@/lib/types";

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

  return (
    <div className="min-h-screen bg-cream">
      <Header />
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

        <InheritanceTaxCalculator />
      </main>
    </div>
  );
}
