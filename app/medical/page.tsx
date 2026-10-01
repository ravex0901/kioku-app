import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { MedicalInfoForm } from "@/components/MedicalInfoForm";
import { getMedicalInfo } from "@/app/actions/medical";

export default async function MedicalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const result = await getMedicalInfo();

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <BackButton />
        <h1 className="mb-1 mt-4 font-serif-jp text-xl font-bold text-ink">
          医療情報
        </h1>
        <p className="mb-6 text-sm text-ink/60">
          かかりつけ医・持病・今飲んでいる薬を登録しておくと、もしもの時や救急の場で役立ちます。
        </p>

        {result.ok ? (
          <MedicalInfoForm initialInfo={result.info} />
        ) : (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {result.error}
          </p>
        )}
      </main>
    </div>
  );
}
