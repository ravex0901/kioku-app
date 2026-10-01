"use server";

import { createClient } from "@/lib/supabase/server";
import type { BucketListItem } from "@/lib/types";

// やりたいことリスト(チェックボックス式)。
// シンプルなタイトルの一覧を登録し、やり終えたらチェックを入れるだけの機能。

export type BucketListResult =
    | { ok: true; items: BucketListItem[] }
  | { ok: false; error: string };

/**
 * 自分のやりたいことリストを取得する(未完了→完了の順、各グループは新しい順)。
 */
export async function getBucketList(): Promise<BucketListResult> {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const { data, error } = await supabase
      .from("bucket_list_items")
      .select("*")
      .eq("user_id", user.id)
      .order("done", { ascending: true })
      .order("created_at", { ascending: false });

  if (error) {
        console.error("getBucketList error", error);
        return { ok: false, error: "やりたいことリストの取得に失敗しました。" };
  }

  return { ok: true, items: (data ?? []) as BucketListItem[] };
}

export type AddBucketItemResult =
    | { ok: true; item: BucketListItem }
  | { ok: false; error: string };

/**
 * やりたいことを1件追加する。
 */
export async function addBucketItem(title: string): Promise<AddBucketItemResult> {
    const trimmed = title.trim();
    if (!trimmed) return { ok: false, error: "内容を入力してください。" };
    if (trimmed.length > 200) {
          return { ok: false, error: "内容が長すぎます。200文字以内でお願いします。" };
    }

  const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const { data, error } = await supabase
      .from("bucket_list_items")
      .insert({ user_id: user.id, title: trimmed })
      .select("*")
      .single();

  if (error || !data) {
        console.error("addBucketItem error", error);
        return { ok: false, error: "追加に失敗しました。もう一度お試しください。" };
  }

  return { ok: true, item: data as BucketListItem };
}

export type SimpleResult = { ok: true } | { ok: false; error: string };

/**
 * チェックボックスの状態(完了/未完了)を切り替える。
 */
export async function toggleBucketItem(
    id: string,
    done: boolean
  ): Promise<SimpleResult> {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const { error } = await supabase
      .from("bucket_list_items")
      .update({ done, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

  if (error) {
        console.error("toggleBucketItem error", error);
        return { ok: false, error: "更新に失敗しました。" };
  }

  return { ok: true };
}

/**
 * やりたいことを1件削除する。
 */
export async function deleteBucketItem(id: string): Promise<SimpleResult> {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const { error } = await supabase
      .from("bucket_list_items")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

  if (error) {
        console.error("deleteBucketItem error", error);
        return { ok: false, error: "削除に失敗しました。" };
  }

  return { ok: true };
}
