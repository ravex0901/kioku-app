import { createClient } from "@/lib/supabase/server";
import { getFamilyInviteInfo } from "@/app/actions/familyInvite";
import { InviteAcceptClient } from "@/components/InviteAcceptClient";

// 家族招待リンク。息子・孫など、ご家族がご自身のアカウントでこのリンクから
// サインアップ(またはログイン)すると、招待してくれた方の家系図・タイムカプセルの
// 受取人・AI日記の閲覧などに「本当につながった状態」で参加できる。
// アカウントを作らない場合でも、これまで通り「もしもの時」の共有リンクは別途使える。
export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const info = await getFamilyInviteInfo(token);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-sm rounded-[1.75rem] border border-green-100 bg-white/70 p-8 shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-700 text-cream">
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
            <path
              d="M12 21s-7-4.35-9.5-8.8C.8 8.6 2.3 5 6 5c2 0 3.3 1 4 2 .7-1 2-2 4-2 3.7 0 5.2 3.6 3.5 7.2C19 16.65 12 21 12 21Z"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="mt-4 text-center text-2xl font-bold text-green-700">
          家族からの招待
        </h1>

        <div className="mt-8">
          <InviteAcceptClient
            token={token}
            info={info}
            isLoggedIn={!!user}
          />
        </div>
      </div>
    </main>
  );
}
