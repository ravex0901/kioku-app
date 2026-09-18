"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { analyzeItemPhoto } from "@/app/actions/ai";
import { fileToBase64 } from "@/lib/fileToBase64";

export function BulkItemForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const previews = useMemo(
    () => files.map((file) => URL.createObjectURL(file)),
    [files]
  );

  function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
    setError(null);
  }

  async function handleBulkRegister() {
    if (files.length === 0) {
      setError("写真を選択してください。");
      return;
    }

    setProcessing(true);
    setError(null);
    setProgress({ done: 0, total: files.length });

    const supabase = createClient();
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        const mediaType = file.type || "image/jpeg";
        const base64 = await fileToBase64(file);
        const analysis = await analyzeItemPhoto(base64, mediaType);

        const name = analysis.ok
          ? analysis.suggestion.name
          : `写真${i + 1}(要確認)`;
        const categoryMajor = analysis.ok
          ? analysis.suggestion.categoryMajor
          : null;
        const categoryMinor =
          analysis.ok && analysis.suggestion.categoryMajor === "other"
            ? analysis.suggestion.categoryOther
            : null;

        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("item-media")
          .upload(path, file);

        if (uploadError) {
          continue;
        }

        const { error: insertError } = await supabase.from("items").insert({
          user_id: userId,
          recorded_by_user_id: userId,
          name,
          category_major: categoryMajor,
          category_minor: categoryMinor,
          location_id: null,
          disposition: "undecided",
          disposition_tags: null,
          memo: null,
          photo_url: path,
          media_type: "image",
        });

        if (!insertError) {
          successCount += 1;
        }
      } catch {
        // 1件失敗しても残りの処理は続行する
      } finally {
        setProgress({ done: i + 1, total: files.length });
      }
    }

    setProcessing(false);
    router.push(`/items?bulkAdded=${successCount}`);
  }

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-green-100 bg-white/70 p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink/80">
          写真をまとめて選択
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFilesChange}
          disabled={processing}
          className="text-sm text-ink/70 file:mr-4 file:rounded-full file:border-0 file:bg-green-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-green-700 hover:file:bg-green-200"
        />
        <p className="text-xs text-ink/40">
          各写真をAIが自動判定し、品名・ジャンルを仮登録します。場所や処分方針は後から設定してください。
        </p>
      </div>

      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {previews.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt={`選択した写真${i + 1}`}
              className="aspect-square w-full rounded-lg object-cover"
            />
          ))}
        </div>
      )}

      {processing && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          AIが分類中です({progress.done}/{progress.total}件)
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleBulkRegister}
        disabled={processing || files.length === 0}
        className="rounded-full bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
      >
        {processing ? "登録中…" : `まとめて登録する(${files.length}件)`}
      </button>
    </div>
  );
}
