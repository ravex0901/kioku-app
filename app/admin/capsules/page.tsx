import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminMarriageApprove } from "@/components/AdminMarriageApprove";
import type { TimeCapsule } from "@/lib/types";

const CONDITION_LABEL: Record<string, string> = {
  date: "開封日",
  adulthood: "成人になったら",
  marriage: "結婚したら",
  same_age_as_sender: "送った本人と同じ歳になったら",
};

// 運営が、全アカウントのタイムカプセルを(内容・音声・結婚書類まで)確認するページ。
// 管理者チェックは app/admin/layout.tsx で行われている。
export default async function AdminCapsulesPage() {
  const adminClient = createAdminClient();
  if (!adminClient) redirect("/admin");

  const [{ data: capsulesData }, { data: profilesData }] = await Promise.all([
    adminClient
      .from("time_capsules")
      .select("*")
      .order("created_at", { ascending: false }),
    adminClient.from("profiles").select("id, name"),
  ]);
  const capsules = (capsulesData ?? []) as TimeCapsule[];
  const nameById = new Map<string, string>();
  for (const p of profilesData ?? []) nameById.set(p.id, p.name || "(名前未設定)");

  const audioPaths = capsules.map((c) => c.message_audio_path).filter((p): p is string => !!p);
  const certPaths = capsules.map((c) => c.marriage_certificate_path).filter((p): p is string => !!p);
  const audioUrls = new Map<string, string>();
  const certUrls = new Map<string, string>();
  if (audioPaths.length > 0) {
    const { data } = await adminClient.storage.from("capsule-audio").createSignedUrls(audioPaths, 600);
    for (const d of data ?? []) if (d.path && d.signedUrl) audioUrls.set(d.path, d.signedUrl);
  }
  if (certPaths.length > 0) {
    const { data } = await adminClient.storage.from("marriage-certificates").createSignedUrls(certPaths, 600);
    for (const d of data ?? []) if (d.path && d.signedUrl) certUrls.set(d.path, d.signedUrl);
  }

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
          タイムカプセル一覧
        </h1>
        <p className="mt-1 text-xs text-ink/50">全{capsules.length}件</p>
      </div>

      <div className="flex flex-col gap-4">
        {capsules.map((c) => {
          const recipient = c.recipient_user_id
            ? nameById.get(c.recipient_user_id) ?? "(名前未設定)"
            : c.recipient_name ?? "(宛先未設定)";
          const audioUrl = c.message_audio_path ? audioUrls.get(c.message_audio_path) : null;
          const certUrl = c.marriage_certificate_path ? certUrls.get(c.marriage_certificate_path) : null;
          return (
            <section key={c.id} className="rounded-[1.5rem] border border-green-100 bg-white/70 p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif-jp text-lg font-bold text-ink">{c.title}</h2>
                <span className="text-xs text-ink/50">作成: {fmt(c.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-ink/70">
                <Link href={`/admin/users/${c.user_id}`} className="underline">
                  {nameById.get(c.user_id) ?? "(名前未設定)"}
                </Link>{" "}
                さん → {recipient} さん{c.recipient_user_id ? "(アカウント連携済み)" : "(アカウント未連携)"}
              </p>
              <p className="mt-1 text-xs text-ink/50">
                開封条件: {CONDITION_LABEL[c.unlock_condition_type] ?? c.unlock_condition_type}
                {c.unlock_condition_type === "date" && ` ・ 開封日: ${fmt(c.open_at)}`}
                {c.unlock_condition_type === "marriage" &&
                  (c.marriage_verified_at ? ` ・ 結婚承認済み(${fmt(c.marriage_verified_at)})` : " ・ 結婚の承認待ち")}
              </p>
              {c.message_text && (
                <p className="mt-3 whitespace-pre-wrap rounded-xl bg-cream/70 p-3 text-sm text-ink">
                  {c.message_text}
                </p>
              )}
              {audioUrl && (
                <audio controls src={audioUrl} className="mt-3 w-full" />
              )}
              {c.unlock_condition_type === "marriage" && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {certUrl ? (
                    <a href={certUrl} target="_blank" rel="noreferrer" className="text-xs text-green-700 underline">
                      提出された書類を見る
                    </a>
                  ) : (
                    <span className="text-xs text-ink/40">書類は未提出です</span>
                  )}
                  {!c.marriage_verified_at && <AdminMarriageApprove capsuleId={c.id} />}
                  {c.marriage_review_note && (
                    <span className="text-xs text-ink/50">メモ: {c.marriage_review_note}</span>
                  )}
                </div>
              )}
            </section>
          );
        })}
        {capsules.length === 0 && (
          <p className="rounded-xl bg-black/5 px-4 py-6 text-center text-sm text-ink/40">
            タイムカプセルはまだありません。
          </p>
        )}
      </div>
    </main>
  );
}
