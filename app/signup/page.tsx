import Link from "next/link";
import { SignupForm } from "@/components/SignupForm";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-green-100 bg-white/60 p-8 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-green-700">
          新規登録
        </h1>
        <p className="mt-1 text-center text-sm text-ink/60">
          「きおく」をはじめましょう。
        </p>

        <div className="mt-8">
          <SignupForm />
        </div>

        <p className="mt-6 text-center text-sm text-ink/60">
          すでにアカウントをお持ちの方は{" "}
          <Link
            href="/login"
            className="font-medium text-green-700 underline underline-offset-2"
          >
            ログイン
          </Link>
        </p>
      </div>
    </main>
  );
}
