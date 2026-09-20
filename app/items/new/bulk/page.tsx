import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { ItemRegisterTabs } from "@/components/ItemRegisterTabs";
import { BulkItemForm } from "@/components/BulkItemForm";

export default async function BulkNewItemPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-cream">
      <Header />
              <BackButton fallbackHref="/items" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="mb-4 text-xl font-bold text-ink">ものを登録する</h1>
        <ItemRegisterTabs active="bulk" />
        <BulkItemForm userId={user.id} />
      </main>
    </div>
  );
}
