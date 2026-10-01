import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { VoiceCheckinsClient } from "@/components/VoiceCheckinsClient";
import { listVoiceCheckins } from "@/app/actions/voiceCheckins";
import type { FamilyMember } from "@/lib/types";

export default async function VoiceCheckinsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: familyData }, result] = await Promise.all([
    supabase
      .from("family_members")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    listVoiceCheckins(),
  ]);

  const family = (familyData ?? []) as FamilyMember[];

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <BackButton />
        <h1 className="mb-1 mt-4 font-serif-jp text-xl font-bold text-ink">
          家族ボイスメッセージ
        </h1>
        <p className="mb-6 text-sm text-ink/60">
          お孫さんなど、ご家族の声でお昼・夕方・夜に声をかけてあげられます。録音した声がそのままホーム画面で再生されます。
        </p>

        {result.ok ? (
          <VoiceCheckinsClient family={family} initialCheckins={result.checkins} />
        ) : (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {result.error}
          </p>
        )}
      </main>
    </div>
  );
}
