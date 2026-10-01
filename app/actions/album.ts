"use server";

import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import type { AlbumPhoto } from "@/lib/types";

// アルバム機能: スマホの写真を選んでアップロードし、このシステム内にも保存しておける機能。
// 「もしもの時」共有ページでも家族に見せられるよう、アップロード時に長期有効の
// 署名付きURL(10年)もあわせて発行して保存する(RecipientWillEditorの動画と同じ考え方)。

const ALBUM_BUCKET = "album-photos";
const MAX_PHOTO_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_PHOTOS_PER_UPLOAD = 20;
const LONG_LIVED_URL_EXPIRES_IN = 60 * 60 * 24 * 365 * 10; // 10年

export type AlbumPhotoWithUrl = AlbumPhoto & { url: string | null };

export type AlbumListResult =
    | { ok: true; photos: AlbumPhotoWithUrl[] }
  | { ok: false; error: string };

/**
 * 自分のアルバム写真を新しい順で取得する(表示用の署名付きURL付き)。
 */
export async function listAlbumPhotos(): Promise<AlbumListResult> {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const { data, error } = await supabase
      .from("album_photos")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

  if (error) {
        console.error("listAlbumPhotos error", error);
        return { ok: false, error: "アルバムの取得に失敗しました。" };
  }

  const photos = (data ?? []) as AlbumPhoto[];
    const urlMap = await getSignedUrlMap(
          supabase,
          photos.map((p) => p.storage_path),
          ALBUM_BUCKET
        );

  return {
        ok: true,
        photos: photos.map((p) => ({ ...p, url: urlMap[p.storage_path] ?? null })),
  };
}

export type UploadPhotosResult =
    | { ok: true; uploadedCount: number; failedCount: number }
  | { ok: false; error: string };

/**
 * スマホから選んだ写真(複数可)をアルバムに保存する。
 * FormDataの"photos"フィールドに複数ファイルが入る。
 */
export async function uploadAlbumPhotos(formData: FormData): Promise<UploadPhotosResult> {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const files = formData.getAll("photos").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
          return { ok: false, error: "写真が選ばれていません。" };
    }
    if (files.length > MAX_PHOTOS_PER_UPLOAD) {
          return {
                  ok: false,
                  error: `一度にアップロードできるのは${MAX_PHOTOS_PER_UPLOAD}枚までです。`,
          };
    }

  let uploadedCount = 0;
    let failedCount = 0;

  for (const file of files) {
        if (file.size === 0 || file.size > MAX_PHOTO_BYTES) {
                failedCount++;
                continue;
        }

      try {
              const arrayBuffer = await file.arrayBuffer();
              const contentType = file.type || "image/jpeg";
              const ext = contentType.includes("png")
                ? "png"
                        : contentType.includes("webp")
                  ? "webp"
                          : contentType.includes("heic")
                    ? "heic"
                            : "jpg";
              const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

          const { error: uploadError } = await supabase.storage
                .from(ALBUM_BUCKET)
                .upload(storagePath, arrayBuffer, { contentType });

          if (uploadError) {
                    console.error("uploadAlbumPhotos storage error", uploadError);
                    failedCount++;
                    continue;
          }

          const { data: signedData } = await supabase.storage
                .from(ALBUM_BUCKET)
                .createSignedUrl(storagePath, LONG_LIVED_URL_EXPIRES_IN);

          const { error: insertError } = await supabase.from("album_photos").insert({
                    user_id: user.id,
                    storage_path: storagePath,
                    long_lived_url: signedData?.signedUrl ?? null,
          });

          if (insertError) {
                    console.error("uploadAlbumPhotos insert error", insertError);
                    failedCount++;
                    continue;
          }

          uploadedCount++;
      } catch (err) {
              console.error("uploadAlbumPhotos unexpected error", err);
              failedCount++;
      }
  }

  if (uploadedCount === 0) {
        return { ok: false, error: "アップロードに失敗しました。もう一度お試しください。" };
  }

  return { ok: true, uploadedCount, failedCount };
}

export type SimpleResult = { ok: true } | { ok: false; error: string };

/**
 * アルバム写真を1枚削除する。
 */
export async function deleteAlbumPhoto(id: string): Promise<SimpleResult> {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "ログインが必要です。" };

  const { data: photo } = await supabase
      .from("album_photos")
      .select("storage_path")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

  if (photo?.storage_path) {
        await supabase.storage.from(ALBUM_BUCKET).remove([photo.storage_path]);
  }

  const { error } = await supabase
      .from("album_photos")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

  if (error) {
        console.error("deleteAlbumPhoto error", error);
        return { ok: false, error: "削除に失敗しました。" };
  }

  return { ok: true };
}
