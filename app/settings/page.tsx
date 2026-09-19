import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { SettingsClient } from "@/components/SettingsClient";
import type { FamilyMember } from "@/lib/types";

export default async function SettingsPage() {
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
      .order("created_at", { ascending: false }),
  ]);

  const rawName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : "";
  const displayName = profile?.name || rawName || user.email?.split("@")[0] || "ゲスト";
  const family = (familyData ?? []) as FamilyMember[];

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
            SETTINGS
          </p>
          <h1 className="mt-2 font-serif-jp text-2xl font-bold text-ink">
            アカウント・設定
          </h1>
        </div>
        <SettingsClient
          userId={user.id}
          displayName={displayName}
          purpose={profile?.purpose ?? null}
          initialFamily={family}
        />
      </main>
    </div>
  );
}

