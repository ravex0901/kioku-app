import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { FamilyTreeClient } from "@/components/FamilyTreeClient";
import type { FamilyMember } from "@/lib/types";

export default async function FamilyTreePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: familyData }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("family_members")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  const rawName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : "";
  const displayName =
    profile?.name || rawName || user.email?.split("@")[0] || "ご本人";
  const family = (familyData ?? []) as FamilyMember[];

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <BackButton />
        <h1 className="mb-1 mt-4 font-serif-jp text-xl font-bold text-ink">
          家系図
        </h1>
        <p className="mb-6 text-sm text-ink/60">
          登録されたご家族の情報から、家系図を自動でつくります。
        </p>
        <FamilyTreeClient displayName={displayName} family={family} />
      </main>
    </div>
  );
}
