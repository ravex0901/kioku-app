// family_relationships テーブルまわりの、サーバー側だけで使う小さな部品。
// ("use server" のファイルからは async 関数しか公開できないため、ここに分けている)

import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export function isMissingRelationshipsTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (/family_relationships/.test(error.message ?? "") &&
      /(does not exist|schema cache)/.test(error.message ?? ""))
  );
}

/**
 * 保存先テーブルがあるか(= データベースの準備が済んでいるか)。
 * まだのときは、家系図のつながりの登録・離別・削除を「お試し(何も書き込まない)」で動かす。
 */
export async function relationshipsTableAvailable(supabase: ServerClient): Promise<boolean> {
  const { error } = await supabase.from("family_relationships").select("id").limit(1);
  if (!error) return true;
  if (isMissingRelationshipsTable(error)) return false;
  // 予期しないエラーのときは、安全のため「お試し」にする(書き込みをしない)
  console.error("relationshipsTableAvailable error", error);
  return false;
}
