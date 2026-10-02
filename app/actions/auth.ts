"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = { error?: string } | undefined;

export type ForgotPasswordState =
  | { error?: string; success?: boolean }
  | undefined;

export async function login(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "").trim();

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

  // next が自サイト内の相対パス(例: 家族招待リンク /invite/xxxx)の場合のみ、そこへ戻す
  redirect(next.startsWith("/") ? next : "/home");
}

export async function signup(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const birthDate = String(formData.get("birthDate") ?? "").trim();

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

  if (birthDate && data.user) {
    await supabase.from("profiles").update({ birth_date: birthDate }).eq("id", data.user.id);
  }

  redirect("/onboarding/purpose");
}

export type InviteSignupState = { error?: string } | undefined;

/**
 * 家族招待リンクからの新規登録。通常のsignup()と異なり、サインアップ直後に
 * accept_family_invite RPC を呼んで招待者のアカウントと紐付け、/home へ遷移する
 * (「設定の目的」選択などのオンボーディングは省略し、招待の文脈をそのまま活かす)。
 */
export async function signupAndAcceptInvite(
  _prevState: InviteSignupState,
  formData: FormData
): Promise<InviteSignupState> {
  const token = String(formData.get("token") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const birthDate = String(formData.get("birthDate") ?? "").trim();
  const myRelation = String(formData.get("myRelation") ?? "other").trim();

  if (!token) {
    return { error: "招待リンクが正しくありません。" };
  }
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

  // メール確認が必要な設定の場合、確認メール内のリンクはここで指定した
  // emailRedirectTo に(クエリパラメータも含めて)戻ってくる。招待トークンと
  // 選択した続柄をクエリに乗せておくことで、メール確認後に招待受け入れの
  // 文脈(どの招待か・続柄は何か)が失われないようにする。
  const headersList = await headers();
  const host = headersList.get("host") ?? "kioku-app-rho.vercel.app";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  const relationParam = encodeURIComponent(myRelation);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: `${origin}/invite/${token}?relation=${relationParam}`,
    },
  });

  if (error) {
    console.error("signupAndAcceptInvite signup error", error);
    return {
      error:
        "登録に失敗しました。すでに登録済みのメールアドレスの可能性があります。",
    };
  }

  if (!data.session || !data.user) {
    // メール確認が必要な設定の場合はここに来る。実際の招待受け入れは、
    // メール確認後にユーザーが戻ってくる /invite/[token] ページ
    // (InviteAcceptClient)側で、ログイン検知後に自動的に行う。
    redirect(`/invite/${token}?confirmEmail=1&relation=${relationParam}`);
  }

  if (birthDate) {
    await supabase.from("profiles").update({ birth_date: birthDate }).eq("id", data.user.id);
  }

  const { data: acceptData, error: acceptError } = await supabase.rpc(
    "accept_family_invite",
    { p_token: token, p_inviter_relation_to_me: myRelation }
  );

  if (acceptError || !acceptData || !(acceptData as { ok?: boolean }).ok) {
    console.error("accept_family_invite error", acceptError, acceptData);
    // アカウント自体は作成できているので、ホームへは進める
    redirect("/home?inviteError=1");
  }

  redirect("/home?invited=1");
}

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "メールアドレスを入力してください。" };
  }

  const supabase = await createClient();
  const headersList = await headers();
  const host = headersList.get("host") ?? "kioku-app-rho.vercel.app";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const redirectTo = `${protocol}://${host}/reset-password`;

  await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  // メールアドレスの存在有無を推測されないよう、成否に関わらず同じ成功メッセージを返す
  return { success: true };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
