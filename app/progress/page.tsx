import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { ProgressBar } from "@/components/ProgressBar";
import { getDescendantIds } from "@/lib/locationTree";
import { ITEM_STATUS_OPTIONS } from "@/lib/constants";
import type { ItemStatus } from "@/lib/types";

function statusOf(roomTotal: number, ratio: number) {
  if (roomTotal === 0) {
    return { label: "未着手", bar: "bg-black/10", text: "text-ink/40" };
  }
  if (ratio >= 1) {
    return { label: "完了", bar: "bg-green-500", text: "text-green-700" };
  }
  if (ratio > 0) {
    return { label: "進行中", bar: "bg-amber-400", text: "text-amber-600" };
  }
  return { label: "未着手", bar: "bg-black/20", text: "text-ink/50" };
}

export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: locations }, { data: items }] = await Promise.all([
    supabase.from("locations").select("*").eq("user_id", user.id),
    supabase
      .from("items")
      .select("id, location_id, disposition, status")
      .eq("user_id", user.id),
  ]);

  const allLocations = locations ?? [];
  const allItems = items ?? [];

  const total = allItems.length;
  const located = allItems.filter((i) => i.location_id !== null).length;
  const dispositionDecided = allItems.filter(
    (i) => i.disposition !== null
  ).length;
  const completed = allItems.filter(
    (i) => i.location_id !== null && i.disposition !== null
  ).length;
  const overallRatio = total > 0 ? completed / total : 0;

  // 整理進捗ワークフロー(請求項7)のステージ別件数集計
  const statusCounts = ITEM_STATUS_OPTIONS.map((opt) => ({
    ...opt,
    count: allItems.filter(
      (i) => (i.status ?? "photo_registered") === (opt.value as ItemStatus)
    ).length,
  }));

  const roomLocations = allLocations.filter(
    (l) => l.location_type === "room" || l.location_type === "storage"
  );

  const roomStats = roomLocations.map((room) => {
    const descendantIds = new Set(getDescendantIds(allLocations, room.id));
    const roomItems = allItems.filter(
      (i) => i.location_id && descendantIds.has(i.location_id)
    );
    const roomTotal = roomItems.length;
    const roomDecided = roomItems.filter(
      (i) => i.disposition !== null
    ).length;
    const ratio = roomTotal > 0 ? roomDecided / roomTotal : 0;
    return { room, roomTotal, roomDecided, ratio };
  });

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-xl font-bold text-ink">片付けの進捗マップ</h1>

        <section className="mb-8 rounded-[1.75rem] border border-green-100 bg-white/70 p-6 shadow-sm">
          <ProgressBar ratio={overallRatio} />
          <p className="mt-2 text-sm text-ink/60">
            全体の完了度 {Math.round(overallRatio * 100)}%
          </p>
          <div className="mt-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-green-700">{total}</p>
              <p className="text-xs text-ink/60">①登録件数</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">{located}</p>
              <p className="text-xs text-ink/60">②場所が確定</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">
                {dispositionDecided}
              </p>
              <p className="text-xs text-ink/60">③方針が決定</p>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-ink">
            整理ステータス別の件数
          </h2>
          <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm">
            <ul className="flex flex-col gap-2">
              {statusCounts.map((s) => (
                <li key={s.value} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs font-medium text-ink/60">
                    {s.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                    <div
                      className="h-full rounded-full bg-green-500"
                      style={{
                        width:
                          total > 0
                            ? `${Math.round((s.count / total) * 100)}%`
                            : "0%",
                      }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs font-semibold text-ink/70">
                    {s.count}件
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-ink">部屋ごとの進捗</h2>
          {roomStats.length === 0 ? (
            <p className="rounded-2xl border border-green-100 bg-white/70 p-6 text-center text-sm text-ink/60">
              部屋・収納の場所が登録されていません。
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {roomStats.map(({ room, roomTotal, roomDecided, ratio }) => {
                const status = statusOf(roomTotal, ratio);
                return (
                  <li
                    key={room.id}
                    className="rounded-2xl border border-green-100 bg-white/70 p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-ink">
                        {room.name}
                      </span>
                      <span className={`text-xs font-semibold ${status.text}`}>
                        {status.label}
                      </span>
                    </div>
                    <div className="mt-2">
                      <ProgressBar ratio={ratio} colorClassName={status.bar} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-ink/60">
                      <span>
                        {roomDecided} / {roomTotal} 件 方針決定
                      </span>
                      {roomTotal > 0 && ratio < 1 && (
                        <Link
                          href={`/items?location=${room.id}`}
                          className="font-medium text-green-700 underline underline-offset-2"
                        >
                          {room.name}を片付ける
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
