import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultLocations } from "@/lib/defaultLocations";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { LocationsClient } from "@/components/LocationsClient";

export default async function LocationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: locationsData }, { data: items }] = await Promise.all([
    supabase.from("locations").select("*").eq("user_id", user.id),
    supabase.from("items").select("location_id").eq("user_id", user.id),
  ]);

  const locations = await ensureDefaultLocations(
    supabase,
    user.id,
    locationsData ?? []
  );

  const counts: Record<string, number> = {};
  for (const item of items ?? []) {
    if (!item.location_id) continue;
    counts[item.location_id] = (counts[item.location_id] ?? 0) + 1;
  }

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <BackButton fallbackHref="/home" />
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
            LOCATIONS
          </p>
          <h1 className="mt-2 font-serif-jp text-2xl font-bold text-ink">
            場所を管理する
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            部屋や収納をわかりやすく整理しましょう
          </p>
        </div>
        <LocationsClient
          userId={user.id}
          initialLocations={locations}
          itemCounts={counts}
        />
      </main>
    </div>
  );
}
