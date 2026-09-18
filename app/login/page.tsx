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
      <div className="w-full max-w-sm rounded-2xl border border-green-100 bg-white/60 p-8 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-green-700">
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
