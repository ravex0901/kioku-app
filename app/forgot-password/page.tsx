import Link from "next/link";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-sm rounded-[1.75rem] border border-green-100 bg-white/70 p-8 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-green-700">
          パスワードを再設定
        </h1>
        <p className="mt-1 text-center text-sm text-ink/60">
          登録済みのメールアドレスに再設定用のリンクをお送りします。
        </p>

        <div className="mt-8">
          <ForgotPasswordForm />
        </div>

        <p className="mt-6 text-center text-sm text-ink/60">
          <Link
            href="/login"
            className="font-medium text-green-700 underline underline-offset-2"
          >
            ログイン画面に戻る
          </Link>
        </p>
      </div>
    </main>
  );
}

