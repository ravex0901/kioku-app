import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { NotificationsList } from "@/components/NotificationsList";
import { getMyFamilyNotifications } from "@/app/actions/familyNotifications";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const notifications = await getMyFamilyNotifications();

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <BackButton fallbackHref="/home" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-ink/40">
            NOTIFICATIONS
          </p>
          <h1 className="mt-2 font-serif-jp text-3xl font-bold text-ink">
            ご家族からのお知らせ
          </h1>
        </div>
        <NotificationsList initialNotifications={notifications} />
      </main>
    </div>
  );
}
