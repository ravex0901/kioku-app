"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";

export function LoginForm({ infoMessage }: { infoMessage?: string }) {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {infoMessage && (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {infoMessage}
        </p>
      )}
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
          autoComplete="current-password"
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
        <Link
          href="/forgot-password"
          className="self-end text-xs text-green-700 underline underline-offset-2"
        >
          パスワードをお忘れですか?
        </Link>
      </div>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-green-700 px-6 py-3 font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
      >
        {pending ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}
