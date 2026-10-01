"use server";

import { createClient } from "@/lib/supabase/server";
import type { MedicalInfo } from "@/lib/types";

// 医療情報: かかりつけ医・持病・今飲んでいる薬の登録。
// もしもの時に家族や救急の場で役立つよう、1人につき1件のシンプルな記録として保持する。

export type MedicalInfoResult =
    | { ok: true; info: MedicalInfo | null }
  | { ok: false; error: string };

/**
 * 自分の医療情報を取得する(未登録ならinfo: null)。
 */
export async function getMedicalInfo(): Promise<MedicalInfoResult> {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const { data, error } = await supabase
      .from("medical_info")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

  if (error) {
        console.error("getMedicalInfo error", error);
        return { ok: false, error: "医療情報の取得に失敗しました。" };
  }

  return { ok: true, info: (data as MedicalInfo | null) ?? null };
}

export type SaveMedicalInfoResult = { ok: true } | { ok: false; error: string };

/**
 * 医療情報を保存する(新規登録・上書き更新どちらも対応)。
 */
export async function saveMedicalInfo(formData: FormData): Promise<SaveMedicalInfoResult> {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const doctorName = String(formData.get("doctorName") ?? "").trim();
    const hospitalName = String(formData.get("hospitalName") ?? "").trim();
    const doctorPhone = String(formData.get("doctorPhone") ?? "").trim();
    const conditions = String(formData.get("conditions") ?? "").trim();
    const medications = String(formData.get("medications") ?? "").trim();

  const { error } = await supabase.from("medical_info").upsert(
    {
            user_id: user.id,
            doctor_name: doctorName || null,
            hospital_name: hospitalName || null,
            doctor_phone: doctorPhone || null,
            conditions: conditions || null,
            medications: medications || null,
            updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
      );

  if (error) {
        console.error("saveMedicalInfo error", error);
        return { ok: false, error: "保存に失敗しました。もう一度お試しください。" };
  }

  return { ok: true };
}
