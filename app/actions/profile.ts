"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setPurpose(purpose: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await supabase.from("profiles").update({ purpose }).eq("id", user.id);

  redirect("/home");
}

export type AccountSettingsState = { ok?: boolean; error?: string } | undefined;

const GENDERS = ["male", "female", "other", "no_answer"] as const;

/** アカウント設定(アカウントネーム・名前・生年月日・性別・住所・電話番号・メール)を保存する。 */
export async function saveAccountSettings(
  _prev: AccountSettingsState,
  formData: FormData
): Promise<AccountSettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const accountName = String(formData.get("account_name") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const birthDate = String(formData.get("birth_date") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();

  if (!/^[A-Za-z0-9_.\-ぁ-んァ-ヶ一-龠ー]{2,30}$/.test(accountName)) {
    return {
      error:
        "アカウントネームは2〜30文字で、記号は「_」「.」「-」のみ使えます(空白は使えません)。",
    };
  }
  if (!name) return { error: "名前を入力してください。" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(birthDate))) {
    return { error: "生年月日を正しく入力してください。" };
  }
  if (birthDate > new Date().toISOString().slice(0, 10)) {
    return { error: "生年月日が未来の日付になっています。" };
  }
  if (!(GENDERS as readonly string[]).includes(gender)) {
    return { error: "性別を選んでください。" };
  }
  if (!address) return { error: "住所を入力してください。" };
  if (phone && !/^[0-9+\-() ]{8,20}$/.test(phone)) {
    return { error: "電話番号は数字とハイフンで入力してください。" };
  }
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { error: "メールアドレスの形式が正しくありません。" };
  }

  const { error: detailsError } = await supabase.from("profile_details").upsert(
    {
      user_id: user.id,
      account_name: accountName,
      gender: gender as (typeof GENDERS)[number],
      address,
      phone: phone || null,
      contact_email: contactEmail || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (detailsError) {
    if (detailsError.code === "23505") {
      return { error: "そのアカウントネームはすでに使われています。別の名前にしてください。" };
    }
    console.error("saveAccountSettings details error", detailsError);
    return { error: "保存に失敗しました。時間をおいてもう一度お試しください。" };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ name, birth_date: birthDate })
    .eq("id", user.id);
  if (profileError) {
    console.error("saveAccountSettings profile error", profileError);
    return { error: "名前・生年月日の保存に失敗しました。" };
  }

  revalidatePath("/account");
  revalidatePath("/home");
  return { ok: true };
}
