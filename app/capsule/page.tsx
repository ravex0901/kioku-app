import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { TimeCapsuleClient } from "@/components/TimeCapsuleClient";
import {
  getTimeCapsules,
  getReceivedTimeCapsules,
} from "@/app/actions/timeCapsule";
import type { FamilyMember } from "@/lib/types";

export default async function CapsulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [result, receivedResult, { data: familyData }] = await Promise.all([
    getTimeCapsules(),
    getReceivedTimeCapsules(),
    supabase
      .from("family_members")
      .select("*")
      .eq("user_id", user.id)
      .not("linked_user_id", "is", null)
      .order("created_at", { ascending: true }),
  ]);

  const linkedFamilyMembers = (familyData ?? []) as FamilyMember[];

  let audioMap: Record<string, string> = {};
  if (result.ok) {
    const paths = result.data.unlocked
      .map((c) => c.message_audio_path)
      .filter((p): p is string => Boolean(p));
    audioMap = await getSignedUrlMap(supabase, paths, "capsule-audio");
  }

  let receivedAudioMap: Record<string, string> = {};
  if (receivedResult.ok) {
    const paths = receivedResult.capsules
      .filter((c): c is typeof c & { unlocked: true } => c.unlocked)
      .map((c) => c.messageAudioPath)
      .filter((p): p is string => Boolean(p));
    receivedAudioMap = await getSignedUrlMap(supabase, paths, "capsule-audio");
  }

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <BackButton />
        <h1 className="mb-1 mt-4 font-serif-jp text-xl font-bold text-ink">
          タイムカプセル
        </h1>
        <p className="mb-6 text-sm text-ink/60">
          未来の家族に向けたメッセージを残せます。開封日(または成人・結婚などの条件)が来るまでは、だれにも開けられません。
        </p>

        {result.ok ? (
          <TimeCapsuleClient
            locked={result.data.locked}
            unlocked={result.data.unlocked}
            audioMap={audioMap}
            linkedFamilyMembers={linkedFamilyMembers}
            received={receivedResult.ok ? receivedResult.capsules : []}
            receivedAudioMap={receivedAudioMap}
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
