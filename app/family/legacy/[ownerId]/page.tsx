import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { HandoverView, type HandoverStatus } from "@/components/HandoverView";

// 運営が死亡届を確認して開示を承認した後、つながっているご家族がアカウント内で
// 「もしもの時」の内容(遺言・動画など)を見るためのページ。
export default async function FamilyLegacyPage({
  params,
}: PageProps<"/family/legacy/[ownerId]">) {
  const { ownerId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let status: HandoverStatus = { found: false };
  let message: string | null = null;

  const admin = createAdminClient();
  if (!admin) {
    message = "現在この機能はご利用いただけません。";
  } else {
    const { data: link } = await admin
      .from("family_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("linked_user_id", ownerId)
      .limit(1)
      .maybeSingle();
    const { data: settings } = await admin
      .from("handover_settings")
      .select("share_token, disclosure_status")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (!link) {
      message = "つながっているご家族の内容のみ表示できます。";
    } else if (!settings || settings.disclosure_status !== "approved") {
      message = "運営による確認が完了していないため、まだ表示できません。";
    } else {
      const { data } = await admin.rpc("get_handover_status", {
        p_token: settings.share_token,
      });
      status = (data as unknown as HandoverStatus) ?? { found: false };
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <BackButton fallbackHref="/home" />
      {message ? (
        <p className="mx-auto max-w-2xl px-4 py-12 text-sm text-ink/70">
          {message}
        </p>
      ) : (
        <HandoverView token="" initialStatus={status} />
      )}
    </div>
  );
}
