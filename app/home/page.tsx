import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import { resolveLocationName } from "@/lib/format";
import { Header } from "@/components/Header";
import { DispositionBadge } from "@/components/DispositionBadge";
import { AiVoiceCard } from "@/components/AiVoiceCard";
import type { Disposition } from "@/lib/types";

type RecentItem = {
  id: string;
  name: string;
  photo_url: string | null;
  disposition: Disposition | null;
  location: { name: string } | { name: string }[] | null;
};

function ProgressRing({ percent }: { percent: number }) {
  const size = 64;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      role="img"
      aria-label={`完了 ${clamped}%`}
    >
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
        fontSize="15"
        fontWeight="700"
        fill="#2b2a24"
      >
        {clamped}%
      </text>
    </svg>
  );
}

function ProgressMiniBar({
  label,
  percent,
}: {
  label: string;
  percent: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs text-ink/60">{label}</span>
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

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [totalRes, locatedRes, dispositionRes, completedRes, recentRes] =
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
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .not("location_id", "is", null)
        .not("disposition", "is", null),
      supabase
        .from("items")
        .select("id, name, photo_url, disposition, location:locations(name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const total = totalRes.count ?? 0;
  const located = locatedRes.count ?? 0;
  const dispositionDecided = dispositionRes.count ?? 0;
  const completed = completedRes.count ?? 0;
  const recentItems = (recentRes.data ?? []) as RecentItem[];

  const photoMap = await getSignedUrlMap(
    supabase,
    recentItems.map((item) => item.photo_url)
  );

  const completionRatio = total > 0 ? completed / total : 0;
  const registeredPercent = total > 0 ? 100 : 0;
  const locatedPercent = total > 0 ? Math.round((located / total) * 100) : 0;
  const dispositionPercent =
    total > 0 ? Math.round((dispositionDecided / total) * 100) : 0;

  const rawName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : "";
  const displayName = rawName || user.email?.split("@")[0] || "ゲスト";

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
              HOME
            </p>
            <h1 className="mt-2 font-serif-jp text-2xl font-bold text-ink">
              おかえりなさい、{displayName}さん
            </h1>
            <p className="mt-1 text-sm text-ink/60">
              きょうも、ひとつだけ進めてみましょう
            </p>
          </div>
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-green-100 bg-white/70 text-green-700"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="M12 5a5 5 0 0 0-5 5v3.5L5 17h14l-2-3.5V10a5 5 0 0 0-5-5Z"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinejoin="round"
              />
              <path
                d="M10 20a2 2 0 0 0 4 0"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            </svg>
          </span>
        </div>

        <div className="relative overflow-hidden rounded-[1.75rem] bg-green-700 px-6 py-7 text-cream shadow-md">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/5"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute right-12 top-8 h-2 w-2 rounded-full bg-gold/70"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute right-20 top-16 h-1.5 w-1.5 rounded-full bg-cream/40"
          />

          <div className="relative flex items-start justify-between gap-3">
            <p className="text-xs tracking-widest text-cream/60">
              TODAY&apos;S ONE
            </p>
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-gold"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M12 3v4M12 17v4M4.2 12H8M16 12h3.8M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </div>

          <span className="relative mt-3 block font-serif-jp text-xl font-bold leading-snug">
            ものを、ひとつ
            <br />
            登録してみましょう
          </span>
          <p className="relative mt-2 text-sm text-cream/70">
            写真を選ぶだけで、AIがジャンルと保管の目安まで自動で入力します。
          </p>

          <div className="relative mt-4 flex flex-wrap items-center gap-2.5">
            <Link
              href="/items/new"
              className="inline-flex items-center gap-2 rounded-full bg-cream px-5 py-2.5 text-sm font-semibold text-green-800 shadow-sm transition hover:bg-white"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17V8.5Z"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth={1.6} />
              </svg>
              写真から登録する
            </Link>
            <Link
              href="/items/new"
              className="inline-flex items-center gap-2 rounded-full border border-cream/40 px-5 py-2.5 text-sm font-medium text-cream/90 transition hover:bg-white/10"
            >
              写真なしで登録する
            </Link>
          </div>
        </div>

        <AiVoiceCard />

        <Link
          href="/progress"
          className="rounded-[1.75rem] border border-green-100 bg-white/70 p-6 shadow-sm transition hover:shadow"
        >
          <div className="flex items-center gap-4">
            <ProgressRing percent={Math.round(completionRatio * 100)} />
            <div>
              <h2 className="text-lg font-bold text-ink">
                片付けの進捗マップ
              </h2>
              <p className="text-xs text-ink/60">部屋ごとの内訳とAI相談</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2.5">
            <ProgressMiniBar label="①登録" percent={registeredPercent} />
            <ProgressMiniBar label="②場所" percent={locatedPercent} />
            <ProgressMiniBar label="③方針" percent={dispositionPercent} />
          </div>
        </Link>

        {total > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">
                さいきん登録したもの
              </h2>
              <Link
                href="/items"
                className="text-sm text-green-700 underline underline-offset-2"
              >
                すべて見る
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              {recentItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/items/${item.id}`}
                  className="flex flex-col overflow-hidden rounded-2xl border border-green-100 bg-white/70 shadow-sm transition hover:shadow"
                >
                  <div className="aspect-square w-full bg-green-50">
                    {item.photo_url && photoMap[item.photo_url] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoMap[item.photo_url]}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-green-300">
                        写真なし
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <span className="truncate text-sm font-medium text-ink">
                      {item.name}
                    </span>
                    <span className="truncate text-xs text-ink/50">
                      {resolveLocationName(item.location)}
                    </span>
                    <DispositionBadge disposition={item.disposition} />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/items"
            className="rounded-[1.75rem] border border-green-100 bg-white/70 p-6 shadow-sm transition hover:shadow"
          >
            <h3 className="text-base font-bold text-ink">見る・探す</h3>
            <p className="mt-1 text-sm text-ink/60">
              登録したものを一覧で確認・検索できます。
            </p>
          </Link>
          <Link
            href="/locations"
            className="rounded-[1.75rem] border border-green-100 bg-white/70 p-6 shadow-sm transition hover:shadow"
          >
            <h3 className="text-base font-bold text-ink">場所を管理する</h3>
            <p className="mt-1 text-sm text-ink/60">
              建物・部屋・収納場所を整理できます。
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
