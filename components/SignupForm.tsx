"use client";

import { useActionState } from "react";
import { signup } from "@/app/actions/auth";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-ink/80">
          お名前
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ink/80">
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink/80">
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="passwordConfirm"
          className="text-sm font-medium text-ink/80"
        >
          パスワード(確認)
        </label>
        <input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
      >
        {pending ? "登録中…" : "新規登録"}
      </button>
    </form>
  );
}
