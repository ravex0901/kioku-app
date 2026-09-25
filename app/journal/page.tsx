import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { JournalClient } from "@/components/JournalClient";
import { getJournalState } from "@/app/actions/journal";

export default async function JournalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const result = await getJournalState();

  let audioMap: Record<string, string> = {};
  if (result.ok) {
    const paths = result.data.history
      .map((h) => h.answer_audio_path)
      .filter((p): p is string => Boolean(p));
    audioMap = await getSignedUrlMap(supabase, paths, "journal-audio");
  }

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <BackButton />
        <h1 className="mb-1 mt-4 font-serif-jp text-xl font-bold text-ink">
          AIと日記
        </h1>
        <p className="mb-6 text-sm text-ink/60">
          週にひとつの質問に答えるだけで、あなたの思い出が少しずつ記録されていきます。
        </p>

        {result.ok ? (
          <JournalClient
            currentEntry={result.data.currentEntry}
            history={result.data.history}
            audioMap={audioMap}
          />
        ) : (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {result.error}
          </p>
        )}
      </main>
    </div>
  );
}
