import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { FamilyJournalViewClient } from "@/components/FamilyJournalViewClient";
import { getFamilyJournalHistory } from "@/app/actions/journal";
import { getFamilyConversationHistory } from "@/app/actions/conversationLog";

export default async function FamilyJournalViewPage({
  params,
}: PageProps<"/journal/view/[ownerId]">) {
  const { ownerId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (ownerId === user.id) {
    redirect("/journal");
  }

  const [result, conversationLogs] = await Promise.all([
    getFamilyJournalHistory(ownerId),
    getFamilyConversationHistory(ownerId),
  ]);

  let audioMap: Record<string, string> = {};
  if (result.ok) {
    const paths = result.history
      .map((h) => h.answer_audio_path)
      .filter((p): p is string => Boolean(p));
    audioMap = await getSignedUrlMap(supabase, paths, "journal-audio");
  }

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <BackButton />
        {result.ok ? (
          <>
            <h1 className="mb-1 mt-4 font-serif-jp text-xl font-bold text-ink">
              {result.ownerName}さんのAI日記
            </h1>
            <p className="mb-6 text-sm text-ink/60">
              家族アカウントとして紐付けられているため、閲覧できます(回答はできません)。
            </p>
            <FamilyJournalViewClient
              ownerName={result.ownerName}
              history={result.history}
              audioMap={audioMap}
              conversationLogs={conversationLogs}
            />
          </>
        ) : (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {result.error || "この方の日記を見る権限がありません。"}
          </p>
        )}
      </main>
    </div>
  );
}
