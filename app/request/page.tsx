import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { RequestClient } from "@/components/RequestClient";

export default async function RequestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("items")
    .select("id, name")
    .eq("user_id", user.id)
    // "organize"が新しい値、"discard"/"sell"は旧5択時代のデータとの互換のため
    .in("disposition", ["organize", "discard", "sell"] as unknown as string[])
    .order("created_at", { ascending: false });

  const targetItems = (data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
  }));

  return (
    <div className="min-h-screen bg-cream">
      <Header />
              <BackButton fallbackHref="/home" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
            REQUEST
          </p>
          <h1 className="mt-2 font-serif-jp text-2xl font-bold text-ink">
            ご依頼はこちら
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            出張買取・不用品回収・遺品整理・生前整理。迷ったら「丸投げ依頼」へ
          </p>
        </div>
        <RequestClient userId={user.id} targetItems={targetItems} />
      </main>
    </div>
  );
}

