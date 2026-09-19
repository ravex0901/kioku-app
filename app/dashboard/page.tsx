import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { InheritanceTaxCalculator } from "@/components/InheritanceTaxCalculator";

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

  const [totalRes, locatedRes, dispositionRes, locationsRes, digitalRes] =
    await Promise.all([
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
  const endingNotePercent = 0;
  const willVideoPercent = 0;

  const overallScore = Math.round(
    (registeredPercent +
      locatedPercent +
      dispositionPercent +
      digitalPercent +
      endingNotePercent +
      willVideoPercent) /
      6
  );

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
            <ScoreBar label="エンディングノート" percent={endingNotePercent} />
            <ScoreBar label="遺言動画" percent={willVideoPercent} />
          </div>
          {locationsCount === 0 && (
            <p className="mt-3 text-xs text-ink/40">
              まだ場所が登録されていません。場所を管理するから登録できます。
            </p>
          )}
        </div>

        <div className="rounded-[1.75rem] border border-gold/40 bg-gold/10 p-5 shadow-sm sm:p-6">
          <h2 className="mb-3 text-sm font-bold text-ink">
            手続きチェックリスト(ご家族と共有)
          </h2>
          <div className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 shrink-0 text-gold">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth={1.6} />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth={1.6} />
              </svg>
            </span>
            <p className="text-sm text-ink/70">
              ご家族が開示承認を行うと、期限付きの手続きチェックリストが自動生成され、家族全員で進み具合を共有できるようになります。設定タブの「もしもの時」から、開示承認後の状態を設定できます。
            </p>
          </div>
        </div>

        <InheritanceTaxCalculator />
      </main>
    </div>
  );
}

