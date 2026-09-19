import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-sm rounded-[1.75rem] border border-green-100 bg-white/70 p-8 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-green-700">
          新しいパスワードを設定
        </h1>
        <p className="mt-1 text-center text-sm text-ink/60">
          新しいパスワードを入力してください。
        </p>

        <div className="mt-8">
          <ResetPasswordForm />
        </div>
      </div>
    </main>
  );
}

