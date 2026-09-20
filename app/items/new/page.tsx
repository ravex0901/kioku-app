import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultLocations } from "@/lib/defaultLocations";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { ItemForm } from "@/components/ItemForm";
import { ItemRegisterTabs } from "@/components/ItemRegisterTabs";

export default async function NewItemPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: locationsData } = await supabase
    .from("locations")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true });

  const locations = await ensureDefaultLocations(
    supabase,
    user.id,
    locationsData ?? []
  );

  return (
    <div className="min-h-screen bg-cream">
      <Header />
              <BackButton fallbackHref="/items" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="mb-4 text-xl font-bold text-ink">ものを登録する</h1>
        <ItemRegisterTabs active="single" />
        <ItemForm userId={user.id} initialLocations={locations} />
      </main>
    </div>
  );
}
