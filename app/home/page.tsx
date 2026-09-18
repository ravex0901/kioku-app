import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import { resolveLocationName } from "@/lib/format";
import { Header } from "@/components/Header";
import { DispositionBadge } from "@/components/DispositionBadge";
import { ProgressBar } from "@/components/ProgressBar";
import type { Disposition } from "@/lib/types";

type RecentItem = {
  id: string;
  name: string;
  photo_url: string | null;
  disposition: Disposition | null;
  location: { name: string } | { name: string }[] | null;
};

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

  if (total === 0) {
    return (
      <div className="min-h-screen bg-cream">
        <Header />
        <main className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6">
          <p className="text-lg text-ink/70">
            まだ何も登録されていません
          </p>
          <Link
            href="/items/new"
            className="rounded-full bg-green-700 px-8 py-4 text-lg font-semibold text-cream shadow-sm transition hover:bg-green-800"
          >
            はじめての1品を登録する
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
        <Link
          href="/items/new"
          className="flex items-center justify-between rounded-[1.75rem] bg-green-700 px-6 py-7 text-cream shadow-md transition hover:bg-green-800"
        >
          <div>
            <p className="text-xs tracking-widest text-cream/60">
              TODAY&apos;S ONE
            </p>
            <span className="mt-1 block font-serif-jp text-xl font-bold leading-snug">
              ものを、ひとつ
              <br />
              登録してみましょう
            </span>
          </div>
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream/15 text-2xl"
          >
            +
          </span>
        </Link>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">さいきん登録したもの</h2>
            <Link href="/items" className="text-sm text-green-700 underline underline-offset-2">
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

        <Link
          href="/progress"
          className="rounded-[1.75rem] border border-green-100 bg-white/70 p-6 shadow-sm transition hover:shadow"
        >
          <h2 className="text-lg font-bold text-ink">片付けの進捗</h2>
          <div className="mt-4">
            <ProgressBar ratio={completionRatio} />
            <p className="mt-2 text-sm text-ink/60">
              全体の完了度 {Math.round(completionRatio * 100)}%
            </p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-green-700">{total}</p>
              <p className="text-xs text-ink/60">登録件数</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">{located}</p>
              <p className="text-xs text-ink/60">場所が確定</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">
                {dispositionDecided}
              </p>
              <p className="text-xs text-ink/60">方針が決定</p>
            </div>
          </div>
        </Link>

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
