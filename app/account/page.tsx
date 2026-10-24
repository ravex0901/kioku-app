import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { AccountSettingsForm } from "@/components/AccountSettingsForm";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: details }] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, birth_date, account_code")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("profile_details")
      .select("account_name, gender, address, phone, contact_email")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <BackButton fallbackHref="/home" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
            ACCOUNT
          </p>
          <h1 className="mt-2 font-serif-jp text-3xl font-bold text-ink">
            アカウント設定
          </h1>
          <p className="mt-2 text-sm text-ink/60">
            ここに入力した情報は、あなただけが見られます(ご家族には表示されません)。
          </p>
        </div>
        <AccountSettingsForm
          initial={{
            accountName: details?.account_name ?? "",
            name: profile?.name ?? "",
            birthDate: profile?.birth_date ?? "",
            gender: details?.gender ?? "",
            address: details?.address ?? "",
            phone: details?.phone ?? "",
            contactEmail: details?.contact_email ?? "",
          }}
          loginEmail={user.email ?? ""}
        />
      </main>
    </div>
  );
}
