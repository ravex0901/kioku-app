"use server";

import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import type { CategoryMajor, Disposition } from "@/lib/types";

// ご家族(アカウントでつながっている相手)の持ち物を、読み取り専用で取得する。
// 見られるかどうかは、データベース側の can_view_family_items(持ち主がチェックを入れているか等)が決める。
// この関数はその結果をそのまま使うだけで、独自に権限を広げることはしない。

export type FamilyItemView = {
  id: string;
  name: string;
  categoryMajor: CategoryMajor | null;
  disposition: Disposition | null;
  memo: string | null;
  photoUrl: string | null;
};

export type FamilyItemsResult =
  | { ok: true; canView: false }
  | { ok: true; canView: true; items: FamilyItemView[] }
  | { ok: false; error: string };

export async function getFamilyMemberItems(
  ownerId: string
): Promise<FamilyItemsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインが必要です。" };

  const { data: allowed, error: allowedError } = await supabase.rpc(
    "can_view_family_items",
    { p_owner_id: ownerId, p_viewer_id: user.id }
  );
  if (allowedError) {
    console.error("can_view_family_items error", allowedError);
    return { ok: false, error: "持ち物の確認に失敗しました。" };
  }
  if (!allowed) return { ok: true, canView: false };

  const { data, error } = await supabase
    .from("items")
    .select("id, name, category_major, disposition, memo, photo_url, created_at")
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false });
  if (error || !data) {
    console.error("getFamilyMemberItems error", error);
    return { ok: false, error: "持ち物の取得に失敗しました。" };
  }

  const photoMap = await getSignedUrlMap(
    supabase,
    data.map((i) => i.photo_url as string | null)
  );

  return {
    ok: true,
    canView: true,
    items: data.map((i) => ({
      id: i.id as string,
      name: i.name as string,
      categoryMajor: (i.category_major as CategoryMajor | null) ?? null,
      disposition: (i.disposition as Disposition | null) ?? null,
      memo: (i.memo as string | null) ?? null,
      photoUrl: i.photo_url ? (photoMap[i.photo_url as string] ?? null) : null,
    })),
  };
}
