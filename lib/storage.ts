import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "item-media";
const SIGNED_URL_EXPIRES_IN = 60 * 60; // 1時間

/**
 * item-media バケット(非公開)のパス配列から署名付きURLのマップを作る。
 * キーはStorage上のパス、値は表示用の署名付きURL。
 */
export async function getSignedUrlMap(
  supabase: SupabaseClient,
  paths: (string | null | undefined)[]
): Promise<Record<string, string>> {
  const uniquePaths = Array.from(
    new Set(paths.filter((p): p is string => Boolean(p)))
  );

  if (uniquePaths.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(BUCKET)
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
  path: string | null | undefined
): Promise<string | null> {
  if (!path) return null;
  const map = await getSignedUrlMap(supabase, [path]);
  return map[path] ?? null;
}
