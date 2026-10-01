import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { FamilyVoiceCheckinClient } from "@/components/FamilyVoiceCheckinClient";
import { getVoiceCheckinTargets } from "@/app/actions/voiceCheckins";

export default async function FamilyVoiceCheckinPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const result = await getVoiceCheckinTargets();

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <BackButton />
        <h1 className="mb-1 mt-4 font-serif-jp text-xl font-bold text-ink">
          家族へボイスメッセージを送る
        </h1>
        <p className="mb-6 text-sm text-ink/60">
          紐付けられたご本人へ、お昼・夕方・夜に届くボイスメッセージを、ご自身のアカウントから録音して送れます。
        </p>

        {result.ok ? (
          <FamilyVoiceCheckinClient targets={result.targets} />
        ) : (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {result.error}
          </p>
        )}
      </main>
    </div>
  );
}
