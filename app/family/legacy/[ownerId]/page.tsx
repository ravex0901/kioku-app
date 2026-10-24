import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { HandoverView, type HandoverStatus } from "@/components/HandoverView";

// 運営が死亡届を確認して開示を承認した後、ご本人から指定されたアカウントだけが
// 「もしもの時」の内容(遺言・動画など)を見るためのページ。共有リンクでは表示されない。
// 相手ごとの内容(handover_recipients)が登録されている場合は、そのアカウント宛の内容だけを表示する。
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
    const { data: settings } = await admin
      .from("handover_settings")
      .select("share_token, disclosure_status")
      .eq("user_id", ownerId)
      .maybeSingle();
    const { data: recipients } = await admin
      .from("handover_recipients")
      .select("share_token, family_member_id")
      .eq("user_id", ownerId);

    if (!settings || settings.disclosure_status !== "approved") {
      message = "運営による確認が完了していないため、まだ表示できません。";
    } else {
      let token: string | null = null;
      if (recipients && recipients.length > 0) {
        // 相手ごとの設定がある場合は、指定されたアカウント宛の内容だけを表示する。
        const memberIds = recipients
          .map((r) => r.family_member_id)
          .filter((id): id is string => Boolean(id));
        const { data: members } = memberIds.length
          ? await admin
              .from("family_members")
              .select("id, linked_user_id")
              .in("id", memberIds)
          : { data: [] as { id: string; linked_user_id: string | null }[] };
        const mine = recipients.find((r) =>
          (members ?? []).some(
            (m) => m.id === r.family_member_id && m.linked_user_id === user.id
          )
        );
        if (mine) token = mine.share_token;
        else message = "このアカウント宛に指定された内容はありません。";
      } else {
        // 相手ごとの設定がない場合は、つながっているご家族に全体の内容を表示する。
        const { data: link } = await admin
          .from("family_members")
          .select("id")
          .eq("user_id", user.id)
          .eq("linked_user_id", ownerId)
          .limit(1)
          .maybeSingle();
        if (link) token = settings.share_token;
        else message = "つながっているご家族の内容のみ表示できます。";
      }

      if (token) {
        const { data } = await admin.rpc("get_handover_status_internal", {
          p_token: token,
        });
        status = (data as unknown as HandoverStatus) ?? { found: false };
      }
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
        <HandoverView
          token=""
          initialStatus={status}
          checklistOwnerId={ownerId}
        />
      )}
    </div>
  );
}
