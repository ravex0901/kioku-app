import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_BUCKET = "item-media";
const SIGNED_URL_EXPIRES_IN = 60 * 60; // 1時間

/**
 * 非公開バケットのパス配列から署名付きURLのマップを作る。
 * キーはStorage上のパス、値は表示用の署名付きURL。
 * bucketを省略するとitem-mediaバケットを使う(既存呼び出し互換)。
 */
export async function getSignedUrlMap(
  supabase: SupabaseClient,
  paths: (string | null | undefined)[],
  bucket: string = DEFAULT_BUCKET
): Promise<Record<string, string>> {
  const uniquePaths = Array.from(
    new Set(paths.filter((p): p is string => Boolean(p)))
  );

  if (uniquePaths.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(uniquePaths, SIGNED_URL_EXPIRES_IN);

  if (error || !data) return {};

  const map: Record<string, string> = {};
  for (const item of data) {
    if (item.path && item.signedUrl) {
      map[item.path] = item.signedUrl;
    }
  }
  return map;
}

export async function getSignedUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
  bucket: string = DEFAULT_BUCKET
): Promise<string | null> {
  if (!path) return null;
  const map = await getSignedUrlMap(supabase, [path], bucket);
  return map[path] ?? null;
}
