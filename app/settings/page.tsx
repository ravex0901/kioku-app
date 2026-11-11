import { redirect } from "next/navigation";
import { syncAutoFamily } from "@/app/actions/familyAutoLink";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { SettingsClient } from "@/components/SettingsClient";
import type {
  FamilyMember,
  HandoverRecipient,
  HandoverSettings,
  Will,
} from "@/lib/types";

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const params = await searchParams;
  // 「もしもの時」から開いたときは、引き継ぎに関する項目だけを表示する。
  const handoverOnly = params.view === "handover";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 家系図の範囲内の人を、家族欄に自動で加えてから読み込む(「もしもの時」の承認者・引き継ぎ先の選択に使う。失敗しても設定画面は表示する)
  const sync = await syncAutoFamily();
  if (!sync.ok) console.error("syncAutoFamily failed", sync.error);

  const [
    { data: profile },
    { data: familyData },
    { data: willData },
    { data: handoverData },
    { data: recipientsData },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("family_members")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("wills").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("handover_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("handover_recipients")
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
              <BackButton fallbackHref="/home" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
            SETTINGS
          </p>
          <h1 className="mt-2 font-serif-jp text-3xl font-bold text-ink">
            アカウント・設定
          </h1>
        </div>
        <SettingsClient
          userId={user.id}
          displayName={displayName}
          purpose={profile?.purpose ?? null}
          initialFamily={family}
          initialWill={(willData as Will | null) ?? null}
          initialHandover={(handoverData as HandoverSettings | null) ?? null}
          initialRecipients={(recipientsData as HandoverRecipient[]) ?? []}
          handoverOnly={handoverOnly}
        />
      </main>
    </div>
  );
}
