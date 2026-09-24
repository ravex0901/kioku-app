import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

// 運営(管理者)だけが入れるダッシュボードの入口。
// ログインしていない、またはADMIN_EMAILSに含まれないメールアドレスの場合は
// ホーユ画面に戻す(顧客情報を含むため、一般ユーザーには一切見せない)。
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    redirect("/home");
  }

  return <div className="min-h-screen bg-cream">{children}</div>;
}
