import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import { resolveLocationName } from "@/lib/format";
import { Header } from "@/components/Header";
import { DispositionBadge } from "@/components/DispositionBadge";
import { ItemsFilterBar } from "@/components/ItemsFilterBar";
import { CATEGORY_OPTIONS, labelFor } from "@/lib/constants";
import type { CategoryMajor, Disposition } from "@/lib/types";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ItemsPage({
  searchParams,
}: PageProps<"/items">) {
  const params = await searchParams;
  const category = first(params.category) ?? "";
  const locationId = first(params.location) ?? "";
  const disposition = first(params.disposition) ?? "";
  const keyword = first(params.q) ?? "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: locations } = await supabase
    .from("locations")
    .select("*")
    .eq("user_id", user.id);

  let query = supabase
    .from("items")
    .select(
      "id, name, photo_url, category_major, disposition, location:locations(name)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (category) query = query.eq("category_major", category as CategoryMajor);
  if (locationId) query = query.eq("location_id", locationId);
  if (disposition) query = query.eq("disposition", disposition as Disposition);
  if (keyword) query = query.ilike("name", `%${keyword}%`);

  const { data: items } = await query;
  const list = items ?? [];

  const photoMap = await getSignedUrlMap(
    supabase,
    list.map((item) => item.photo_url)
  );

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-xl font-bold text-ink">見る・探す</h1>

        <ItemsFilterBar
          locations={locations ?? []}
          defaultValues={{
            category,
            location: locationId,
            disposition,
            q: keyword,
          }}
        />

        {list.length === 0 ? (
          <p className="mt-6 rounded-xl border border-green-100 bg-white/70 p-8 text-center text-sm text-ink/60">
            条件に一致するものが見つかりませんでした。
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {list.map((item) => (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                className="flex flex-col overflow-hidden rounded-xl border border-green-100 bg-white/70 shadow-sm transition hover:shadow"
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
                    {labelFor(CATEGORY_OPTIONS, item.category_major)} ・{" "}
                    {resolveLocationName(item.location)}
                  </span>
                  <DispositionBadge disposition={item.disposition} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
