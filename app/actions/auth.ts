"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = { error?: string } | undefined;

export async function login(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "メールアドレスまたはパスワードが正しくありません。" };
  }

  redirect("/home");
}

export async function signup(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (!name) {
    return { error: "お名前を入力してください。" };
  }
  if (!email) {
    return { error: "メールアドレスを入力してください。" };
  }
  if (password.length < 8) {
    return { error: "パスワードは8文字以上で入力してください。" };
  }
  if (password !== passwordConfirm) {
    return { error: "パスワード(確認)が一致しません。" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    console.error("signup error", error);
    return {
      error:
        "登録に失敗しました。すでに登録済みのメールアドレスの可能性があります。",
    };
  }

  if (!data.session) {
    // メール確認が必要な設定の場合はログイン画面へ案内する
    redirect("/login?message=confirm-email");
  }

  redirect("/onboarding/purpose");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
