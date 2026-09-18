import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const message = params.message;
  const infoMessage =
    message === "confirm-email"
      ? "確認メールを送信しました。メール内のリンクから認証を完了してください。"
      : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-sm rounded-[1.75rem] border border-green-100 bg-white/70 p-8 shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-700 text-cream">
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
            <path
              d="M7 4h10v16l-5-3-5 3V4Z"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="mt-4 text-center text-2xl font-bold text-green-700">
          きおく
        </h1>
        <p className="mt-1 text-center text-sm text-ink/60">
          ものと向き合う時間を、そっと支えます。
        </p>

        <div className="mt-8">
          <LoginForm infoMessage={infoMessage} />
        </div>

        <p className="mt-6 text-center text-sm text-ink/60">
          アカウントをお持ちでない方は{" "}
          <Link href="/signup" className="font-medium text-green-700 underline underline-offset-2">
            新規登録
          </Link>
        </p>
      </div>
    </main>
  );
}
