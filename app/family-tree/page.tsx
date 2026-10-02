import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { FamilyTreeClient } from "@/components/FamilyTreeClient";
import { getExtendedFamilyNetwork } from "@/app/actions/familyNetwork";
import type { FamilyMember } from "@/lib/types";

export default async function FamilyTreePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: familyData }, extendedNetworkResult] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      // 「アカウントIDで申請する」等でまだ相手が許可していないつながりは、
      // linked_user_id が入るまで家系図に表示しない。
      supabase
        .from("family_members")
        .select("*")
        .eq("user_id", user.id)
        .not("linked_user_id", "is", null)
        .order("created_at", { ascending: true }),
      getExtendedFamilyNetwork(),
    ]);

  const rawName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : "";
  const displayName =
    profile?.name || rawName || user.email?.split("@")[0] || "ご本人";
  const family = (familyData ?? []) as FamilyMember[];
  // 間接の家族(2ホップ以上先)。本人同士が代々つながっていくほど、ここに増えていく。
  const extendedNetwork = extendedNetworkResult.ok
    ? extendedNetworkResult.network
    : [];

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <BackButton />
        <h1 className="mb-1 mt-4 font-serif-jp text-xl font-bold text-ink">
          家系図
        </h1>
        <p className="mb-6 text-sm text-ink/60">
          登録されたご家族の情報から、家系図を自動でつくります。ご家族がさらに別の方とつながると、ここにも代々広がっていきます。
        </p>
        <FamilyTreeClient
          displayName={displayName}
          family={family}
          extendedNetwork={extendedNetwork}
        />
      </main>
    </div>
  );
}
