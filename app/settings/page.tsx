import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { SettingsClient } from "@/components/SettingsClient";
import {
  getFamilyShareSettings,
  getFamilyLegacyShare,
} from "@/app/actions/familyNetwork";
import type {
  FamilyMember,
  HandoverRecipient,
  HandoverSettings,
  Will,
} from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: profile },
    { data: familyData },
    { data: willData },
    { data: handoverData },
    { data: recipientsData },
    familyShareSettings,
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
    getFamilyShareSettings(),
  ]);

  const rawName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : "";
  const displayName = profile?.name || rawName || user.email?.split("@")[0] || "ゲスト";
  const family = (familyData ?? []) as FamilyMember[];

  // つながっている家族のうち、既にアカウントと紐付いている相手の「故人」フラグと、
  // (故人の場合の)間接の家族への共有可否を取得しておく。
  const linkedUserIds = family
    .map((m) => m.linked_user_id)
    .filter((id): id is string => Boolean(id));

  const deceasedStatus: Record<string, boolean> = {};
  if (linkedUserIds.length > 0) {
    const { data: linkedProfiles } = await supabase
      .from("profiles")
      .select("id, is_deceased")
      .in("id", linkedUserIds);
    for (const p of linkedProfiles ?? []) {
      deceasedStatus[p.id as string] = Boolean(
        (p as { is_deceased?: boolean }).is_deceased
      );
    }
  }

  const deceasedLinkedIds = linkedUserIds.filter((id) => deceasedStatus[id]);
  const legacyShareStatus: Record<string, boolean> = {};
  if (deceasedLinkedIds.length > 0) {
    const results = await Promise.all(
      deceasedLinkedIds.map((id) => getFamilyLegacyShare(id))
    );
    deceasedLinkedIds.forEach((id, i) => {
      legacyShareStatus[id] = results[i];
    });
  }

  return (
    <div className="min-h-screen bg-cream">
      <Header />
              <BackButton fallbackHref="/home" />
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
          accountCode={profile?.account_code ?? null}
          initialFamily={family}
          initialWill={(willData as Will | null) ?? null}
          initialHandover={(handoverData as HandoverSettings | null) ?? null}
          initialRecipients={(recipientsData as HandoverRecipient[]) ?? []}
          initialFamilyShareSettings={familyShareSettings}
          initialDeceasedStatus={deceasedStatus}
          initialLegacyShareStatus={legacyShareStatus}
        />
      </main>
    </div>
  );
}
