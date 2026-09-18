import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { ItemForm } from "@/components/ItemForm";

export default async function NewItemPage() {
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
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true });

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-xl font-bold text-ink">ものを登録する</h1>
        <ItemForm userId={user.id} initialLocations={locations ?? []} />
      </main>
    </div>
  );
}
