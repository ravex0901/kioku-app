/**
 * 写真ファイルをブラウザ上でリサイズ・圧縮する。
 * スマートフォンで撮影した写真はそのままだと数MB〜十数MBになることがあり、
 * AI判定やアップロードが遅くなる主な原因になっている。
 * 長辺を MAX_DIMENSION に収め、JPEGで再圧縮することで
 * 見た目の画質をほぼ保ったまま送信サイズを大幅に減らす。
 */

const MAX_DIMENSION = 1440;
const JPEG_QUALITY = 0.82;

export async function resizeImageFile(file: File): Promise<File> {
  // 画像以外(動画など)はそのまま返す
  if (!file.type.startsWith("image/")) {
    return file;
  }

  // すでに十分小さいファイルはリサイズ処理自体のコストを避ける
  const SKIP_THRESHOLD_BYTES = 700 * 1024; // 700KB
  if (file.size <= SKIP_THRESHOLD_BYTES) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));

    // すでに十分小さい解像度なら何もしない
    if (scale >= 1) {
      bitmap.close?.();
      return file;
    }

    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );

    if (!blob) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    // リサイズに失敗した場合は元のファイルをそのまま使う
    return file;
  }
}
