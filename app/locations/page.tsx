import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { LocationsClient } from "@/components/LocationsClient";

export default async function LocationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: locations }, { data: items }] = await Promise.all([
    supabase.from("locations").select("*").eq("user_id", user.id),
    supabase.from("items").select("location_id").eq("user_id", user.id),
  ]);

  const counts: Record<string, number> = {};
  for (const item of items ?? []) {
    if (!item.location_id) continue;
    counts[item.location_id] = (counts[item.location_id] ?? 0) + 1;
  }

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-xl font-bold text-ink">場所を管理する</h1>
        <LocationsClient
          userId={user.id}
          initialLocations={locations ?? []}
          itemCounts={counts}
        />
      </main>
    </div>
  );
}
