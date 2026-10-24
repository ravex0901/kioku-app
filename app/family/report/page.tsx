import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { FamilyDeathReportClient } from "@/components/FamilyDeathReportClient";
import { getFamilyDeathReportTargets } from "@/app/actions/deathCertificate";

// アカウントでつながっているご家族の死亡届(または除籍謄本等)を、アプリ内から提出するページ。
export default async function FamilyReportPage({
  searchParams,
}: PageProps<"/family/report">) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const targets = await getFamilyDeathReportTargets();
  const owner = typeof params.owner === "string" ? params.owner : null;

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <BackButton fallbackHref="/settings" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
            REPORT
          </p>
          <h1 className="mt-2 font-serif-jp text-3xl font-bold text-ink">
            もしもの書類提出
          </h1>
          <p className="mt-2 text-sm text-ink/60">
            つながっているご家族が亡くなられた場合に、死亡診断書(死体検案書)・除籍謄本・死亡届記載事項証明書・死亡届などの画像を提出できます。運営が内容を確認し、承認されると「もしもの時」の内容が開示されます。
          </p>
        </div>
        <FamilyDeathReportClient targets={targets} initialOwnerId={owner} />
      </main>
    </div>
  );
}
