import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminDeathCertReview } from "@/components/AdminDeathCertReview";
import { AdminHandoverActions } from "@/components/AdminHandoverActions";
import type {
  DeathCertificateSubmission,
  HandoverRecipient,
  HandoverSettings,
  Will,
} from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  pending: "条件待ち",
  awaiting_certificate: "死亡届の提出待ち",
  certificate_submitted: "書類の確認待ち",
  approved: "開示済み",
  rejected: "却下",
};

const DAY_MS = 24 * 60 * 60 * 1000;

// 運営が、全アカウントの「もしもの時」(開示条件・共有相手・遺言・提出書類)を確認し、承認するページ。
export default async function AdminHandoverPage() {
  const adminClient = createAdminClient();
  if (!adminClient) redirect("/admin");

  const [
    { data: settingsData },
    { data: profilesData },
    { data: recipientsData },
    { data: willsData },
    { data: certsData },
  ] = await Promise.all([
    adminClient.from("handover_settings").select("*").order("updated_at", { ascending: false }),
    adminClient.from("profiles").select("id, name, last_active_at"),
    adminClient.from("handover_recipients").select("*"),
    adminClient.from("wills").select("*"),
    adminClient
      .from("death_certificate_submissions")
      .select("*")
      .order("submitted_at", { ascending: false }),
  ]);

  const settings = (settingsData ?? []) as HandoverSettings[];
  const recipients = (recipientsData ?? []) as HandoverRecipient[];
  const wills = (willsData ?? []) as Will[];
  const certs = (certsData ?? []) as DeathCertificateSubmission[];
  const profileById = new Map((profilesData ?? []).map((p) => [p.id, p] as const));

  const certUrlByPath = new Map<string, string>();
  if (certs.length > 0) {
    const { data } = await adminClient.storage
      .from("death-certificates")
      .createSignedUrls(certs.map((c) => c.image_path), 600);
    for (const d of data ?? []) if (d.path && d.signedUrl) certUrlByPath.set(d.path, d.signedUrl);
  }

  const now = Date.now();
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-xs text-ink/50 hover:underline">
        ← 運営ダッシュボードに戻る
      </Link>
      <div className="mt-2 mb-6">
        <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">ADMIN</p>
        <h1 className="mt-2 font-serif-jp text-3xl font-bold text-ink">
          「もしもの時」一覧
        </h1>
        <p className="mt-1 text-xs text-ink/50">全{settings.length}件</p>
      </div>

      <div className="flex flex-col gap-4">
        {settings.map((s) => {
          const owner = profileById.get(s.user_id);
          const lastActive = owner?.last_active_at ?? s.updated_at;
          const inactiveDays = Math.floor((now - new Date(lastActive).getTime()) / DAY_MS);
          const myRecipients = recipients.filter((r) => r.user_id === s.user_id);
          const will = wills.find((w) => w.user_id === s.user_id);
          const myCerts = certs.filter((c) => c.user_id === s.user_id);
          const pendingCerts = myCerts
            .filter((c) => c.status === "pending")
            .map((c) => ({
              submission: c,
              ownerName: owner?.name || "(名前未設定)",
              imageUrl: certUrlByPath.get(c.image_path) ?? null,
            }));
          return (
            <section key={s.user_id} className="rounded-[1.5rem] border border-green-100 bg-white/70 p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif-jp text-lg font-bold text-ink">
                  <Link href={`/admin/users/${s.user_id}`} className="underline">
                    {owner?.name || "(名前未設定)"}
                  </Link>{" "}
                  さん
                </h2>
                <span className="rounded-full bg-black/5 px-3 py-1 text-xs text-ink/70">
                  {STATUS_LABEL[s.disclosure_status] ?? s.disclosure_status}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink/50">
                未利用 {inactiveDays}日 /{" "}
                {s.inactive_days >= 36500
                  ? "アクティブ検知なし(死亡届+運営承認で開示)"
                  : `開示条件 ${s.inactive_days}日${inactiveDays >= s.inactive_days ? "(条件を満たしています)" : ""}`}
                {" ・ "}最終利用: {fmt(lastActive)}
              </p>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-cream/70 p-3 text-sm">
                  <p className="mb-1 text-xs font-semibold text-ink/50">共有相手({myRecipients.length}人)</p>
                  {myRecipients.length === 0 && <p className="text-xs text-ink/40">未設定</p>}
                  <ul className="flex flex-col gap-2">
                    {myRecipients.map((r) => (
                      <li key={r.id}>
                        <p className="font-medium text-ink">{r.name}</p>
                        {r.message && <p className="whitespace-pre-wrap text-xs text-ink/70">{r.message}</p>}
                        {r.legal_will_note && (
                          <p className="whitespace-pre-wrap text-xs text-ink/50">遺言メモ: {r.legal_will_note}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl bg-cream/70 p-3 text-sm">
                  <p className="mb-1 text-xs font-semibold text-ink/50">共通のメッセージ・遺言</p>
                  {will?.message || will?.legal_will_note ? (
                    <>
                      {will.message && <p className="whitespace-pre-wrap text-xs text-ink/70">{will.message}</p>}
                      {will.legal_will_note && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-ink/50">遺言メモ: {will.legal_will_note}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-ink/40">未設定</p>
                  )}
                </div>
              </div>

              {myCerts.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-semibold text-ink/50">提出された書類</p>
                  <ul className="flex flex-col gap-1 text-xs text-ink/70">
                    {myCerts.map((c) => (
                      <li key={c.id}>
                        {fmt(c.submitted_at)} ・ 提出者: {c.recipient_name || "-"} ・{" "}
                        {c.status === "pending" ? "確認待ち" : c.status === "approved" ? "承認済み" : "却下"}
                        {certUrlByPath.get(c.image_path) && (
                          <>
                            {" ・ "}
                            <a href={certUrlByPath.get(c.image_path)} target="_blank" rel="noreferrer" className="text-green-700 underline">
                              画像を見る
                            </a>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {pendingCerts.length > 0 && (
                <div className="mt-3">
                  <AdminDeathCertReview items={pendingCerts} />
                </div>
              )}

              <div className="mt-4">
                <AdminHandoverActions ownerId={s.user_id} approved={s.disclosure_status === "approved"} />
              </div>
            </section>
          );
        })}
        {settings.length === 0 && (
          <p className="rounded-xl bg-black/5 px-4 py-6 text-center text-sm text-ink/40">
            「もしもの時」の設定はまだありません。
          </p>
        )}
      </div>
    </main>
  );
}
