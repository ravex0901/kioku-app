"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
        setChecking(false);
      }
    });

    // メールのリンクを開いた時点ですでにリカバリーセッションが
    // 確立されている場合にも対応する。
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
      }
      setChecking(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください。");
      return;
    }
    if (password !== passwordConfirm) {
      setError("パスワード(確認)が一致しません。");
      return;
    }

    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setSubmitting(false);

    if (updateError) {
      setError("パスワードの更新に失敗しました。もう一度リンクからやり直してください。");
      return;
    }

    setDone(true);
    setTimeout(() => router.push("/home"), 1500);
  }

  if (done) {
    return (
      <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
        パスワードを更新しました。まもなくホームに移動します…
      </p>
    );
  }

  if (checking) {
    return (
      <p className="rounded-lg bg-black/5 px-4 py-3 text-sm text-ink/60">
        リンクを確認しています…
      </p>
    );
  }

  if (!ready) {
    return (
      <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
        リンクが無効か、有効期限が切れています。もう一度パスワード再設定メールをお送りください。
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink/80">
          新しいパスワード
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="passwordConfirm"
          className="text-sm font-medium text-ink/80"
        >
          新しいパスワード(確認)
        </label>
        <input
          id="passwordConfirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 rounded-full bg-green-700 px-6 py-3 font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
      >
        {submitting ? "更新中…" : "パスワードを更新する"}
      </button>
    </form>
  );
}

