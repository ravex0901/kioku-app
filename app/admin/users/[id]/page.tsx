import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedUrlMap } from "@/lib/storage";
import { AdminAccountForm } from "@/components/AdminAccountForm";
import {
  CATEGORY_OPTIONS,
  ITEM_STATUS_OPTIONS,
  dispositionLabel,
  labelFor,
} from "@/lib/constants";

// 管理ダッシュボードから、特定の利用者が登録した持ち物を一覧で確認するページ。
// 認証・管理者チェックは app/admin/layout.tsx で行われているため、ここでは行わない。
export default async function AdminUserItemsPage({
  params,
}: PageProps<"/admin/users/[id]">) {
  const { id } = await params;

  const adminClient = createAdminClient();

  if (!adminClient) {
    redirect("/admin");
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, name, purpose, birth_date, created_at, last_active_at")
    .eq("id", id)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  const [{ data: details }, { data: authUserData }] = await Promise.all([
    adminClient
      .from("profile_details")
      .select("gender, address, phone, contact_email")
      .eq("user_id", id)
      .maybeSingle(),
    adminClient.auth.admin.getUserById(id),
  ]);

  const { data: itemsData } = await adminClient
    .from("items")
    .select("*, location:locations(name)")
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  const items = itemsData ?? [];

  const photoMap = await getSignedUrlMap(
    adminClient,
    items.map((item) => item.photo_url)
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-xs text-ink/50 hover:underline">
        ← 運営ダッシュボードに戻る
      </Link>

      <div className="mt-2 mb-6">
        <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
          ADMIN
        </p>
        <h1 className="mt-2 font-serif-jp text-3xl font-bold text-ink">
          {profile.name || "(未設定)"} さん
        </h1>
        <p className="mt-1 text-xs text-ink/50">
          登録日:{" "}
          {new Date(profile.created_at).toLocaleDateString("ja-JP")}
          {" ・ "}
          最終利用:{" "}
          {profile.last_active_at
            ? new Date(profile.last_active_at).toLocaleDateString("ja-JP")
            : "-"}
          {" ・ "}
          登録件数: {items.length}件
        </p>
      </div>

      <section className="mb-8 rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm">
        <h2 className="mb-1 text-xs font-semibold tracking-[0.15em] text-gold">
          アカウント情報
        </h2>
        <p className="mb-3 text-xs text-ink/50">
          ログイン用メールアドレス: {authUserData?.user?.email ?? "-"}
          {" ・ "}
          <Link href="/admin/capsules" className="underline">タイムカプセル一覧</Link>
          {" ・ "}
          <Link href="/admin/handover" className="underline">「もしもの時」一覧</Link>
        </p>
        <AdminAccountForm
          userId={id}
          initial={{
            name: profile.name ?? "",
            birthDate: profile.birth_date ?? "",
            gender: details?.gender ?? "",
            address: details?.address ?? "",
            phone: details?.phone ?? "",
            contactEmail: details?.contact_email ?? "",
          }}
        />
      </section>

      {items.length === 0 ? (
        <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-8 text-center text-sm text-ink/40 shadow-sm">
          まだ持ち物が登録されていません。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const photoUrl = item.photo_url ? photoMap[item.photo_url] : null;
            const locationName =
              (item as { location?: { name: string } | null }).location
                ?.name ?? null;
            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-[1.5rem] border border-green-100 bg-white/70 shadow-sm"
              >
                <div className="aspect-square w-full bg-black/5">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-ink/30">
                      画像なし
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-bold text-ink">
                    {item.name}
                  </p>
                  <p className="mt-1 text-xs text-ink/50">
                    {labelFor(CATEGORY_OPTIONS, item.category_major)}
                    {item.category_minor ? ` / ${item.category_minor}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-ink/50">
                    {locationName ?? "場所未設定"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-ink/60">
                      {labelFor(ITEM_STATUS_OPTIONS, item.status)}
                    </span>
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-ink/60">
                      {dispositionLabel(item.disposition)}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] text-ink/40">
                    登録日:{" "}
                    {new Date(item.created_at).toLocaleDateString("ja-JP")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
