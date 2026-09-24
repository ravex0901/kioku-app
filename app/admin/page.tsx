import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 運営だけが入れる管理ダッシュボード。
 * 顧客情報(登録者一覧・登録日・最終利用日)とマーケティング向けの簡易指標
 * (総ユーザー数・アクティブユーザー数・日別新規登録数)を表示する。
 * 決済履歴は現時点で決済機能自体が未実装のため対象外(将来Stripe等を
 * 導入した際に追加する)。
 */
export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    redirect("/home");
  }

  const adminClient = createAdminClient();

  if (!adminClient) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="font-serif-jp text-2xl font-bold text-ink">
          運営ダッシュボード
        </h1>
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          管理ダッシュボードの設定が完了していません(SUPABASE_SERVICE_ROLE_KEY
          が未設定です)。管理者にお問い合わせください。
        </p>
      </main>
    );
  }

  const [{ data: profilesData }, { data: itemsData }] = await Promise.all([
    adminClient
      .from("profiles")
      .select("id, name, purpose, created_at, last_active_at")
      .order("created_at", { ascending: false })
      .limit(500),
    adminClient.from("items").select("user_id"),
  ]);

  const profiles = profilesData ?? [];
  const now = Date.now();

  const totalUsers = profiles.length;
  const activeUsers30d = profiles.filter(
    (p) =>
      p.last_active_at && now - new Date(p.last_active_at).getTime() < 30 * DAY_MS
  ).length;
  const newUsers7d = profiles.filter(
    (p) => now - new Date(p.created_at).getTime() < 7 * DAY_MS
  ).length;

  const itemCountByUser = new Map<string, number>();
  for (const row of itemsData ?? []) {
    itemCountByUser.set(row.user_id, (itemCountByUser.get(row.user_id) ?? 0) + 1);
  }

  // 直近14日間の日別新規登録数(マーケティング画面向けの簡易グラフ)
  const dailyCounts: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    const count = profiles.filter((p) => p.created_at.slice(0, 10) === key).length;
    dailyCounts.push({ date: key, count });
  }
  const maxDaily = Math.max(1, ...dailyCounts.map((d) => d.count));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">ADMIN</p>
        <h1 className="mt-2 font-serif-jp text-2xl font-bold text-ink">
          運営ダッシュボード
        </h1>
        <p className="mt-1 text-xs text-ink/50">{user.email} でログイン中</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="総ユーザー数" value={totalUsers.toLocaleString()} />
        <StatCard
          label="直近30日アクティブ"
          value={activeUsers30d.toLocaleString()}
        />
        <StatCard label="直近7日の新規登録" value={newUsers7d.toLocaleString()} />
      </div>

      <section className="mb-8 rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-gold">
          新規登録数(直近14日)
        </h2>
        <div className="flex items-end gap-1.5" style={{ height: 100 }}>
          {dailyCounts.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-green-600"
                style={{ height: `${Math.max(4, (d.count / maxDaily) * 80)}px` }}
                title={`${d.date}: ${d.count}人`}
              />
              <span className="text-[9px] text-ink/40">{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-gold">
          顧客一覧
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs text-ink/50">
                <th className="py-2 pr-4">名前</th>
                <th className="py-2 pr-4">目的</th>
                <th className="py-2 pr-4">登録日</th>
                <th className="py-2 pr-4">最終利用</th>
                <th className="py-2 pr-4">登録済みの持ち物数</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-black/5">
                  <td className="py-2 pr-4">{p.name || "(未設定)"}</td>
                  <td className="py-2 pr-4">{p.purpose || "-"}</td>
                  <td className="py-2 pr-4 text-ink/60">
                    {new Date(p.created_at).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="py-2 pr-4 text-ink/60">
                    {p.last_active_at
                      ? new Date(p.last_active_at).toLocaleDateString("ja-JP")
                      : "-"}
                  </td>
                  <td className="py-2 pr-4 text-ink/60">
                    {itemCountByUser.get(p.id) ?? 0}
                  </td>
                </tr>
              ))}
              {profiles.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-ink/40">
                    データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm">
      <p className="text-xs text-ink/50">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}
