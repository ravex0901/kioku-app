import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import { Header } from "@/components/Header";
import { ItemsFilterBar } from "@/components/ItemsFilterBar";
import { ItemsBulkGrid } from "@/components/ItemsBulkGrid";
import { AiSearchPanel } from "@/components/AiSearchPanel";
import { LEGACY_DISPOSITION_VALUES } from "@/lib/constants";
import type { CategoryMajor, Disposition, ItemStatus } from "@/lib/types";

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
  const status = first(params.status) ?? "";
  const keyword = first(params.q) ?? "";
  const bulkAdded = first(params.bulkAdded);

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
    .select("*, location:locations(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (category) query = query.eq("category_major", category as CategoryMajor);
  if (locationId) query = query.eq("location_id", locationId);
  if (disposition) {
    const legacyValues = LEGACY_DISPOSITION_VALUES[disposition as Disposition] ?? [];
    query = query.in(
      "disposition",
      [disposition, ...legacyValues] as Disposition[]
    );
  }
  if (status) query = query.eq("status", status as ItemStatus);
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

        {bulkAdded && (
          <p className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {bulkAdded}件を仮登録しました。場所や整理方針は後で確認してください。
          </p>
        )}

        <AiSearchPanel />

        <ItemsFilterBar
          locations={locations ?? []}
          defaultValues={{
            category,
            location: locationId,
            disposition,
            status,
            q: keyword,
          }}
        />

        <div className="mt-6">
          <ItemsBulkGrid
            userId={user.id}
            items={list}
            photoMap={photoMap}
          />
        </div>
      </main>
    </div>
  );
}
