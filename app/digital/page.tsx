import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { DigitalItemsClient } from "@/components/DigitalItemsClient";
import type { DigitalItem } from "@/lib/types";

export default async function DigitalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("digital_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const items = (data ?? []) as DigitalItem[];

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
            DIGITAL
          </p>
          <h1 className="mt-2 font-serif-jp text-2xl font-bold text-ink">
            契約・情報のしおり
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            契約やアカウントの所在を、家族にわかる形で残せます
          </p>
        </div>
        <DigitalItemsClient userId={user.id} initialItems={items} />
      </main>
    </div>
  );
}

