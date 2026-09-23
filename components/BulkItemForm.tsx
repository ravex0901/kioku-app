"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { analyzeItemPhoto } from "@/app/actions/ai";
import { fileToBase64 } from "@/lib/fileToBase64";
import { resizeImageFile } from "@/lib/resizeImage";
import { formatPriceDisplay } from "@/lib/priceRange";
import { CATEGORY_OPTIONS } from "@/lib/constants";
import type { CategoryMajor } from "@/lib/types";

// 一括登録の各写真の下書き(AI解析後、ユーザーが確認・修正できる状態)。
// 特許請求項1「ユーザー確認後、個人別遺品DBへ登録する。自動確定ではなく修正可能とする」に対応するため、
// 解析結果を即保存せず、必ずこの下書き状態を経由してユーザーが確認・修正してから保存する。
type Draft = {
  id: string;
  file: File;
  preview: string;
  name: string;
  categoryMajor: CategoryMajor | "";
  estimatedPriceRange: string | null;
  analyzing: boolean;
  analyzeFailed: boolean;
  excluded: boolean;
};

type Step = "select" | "review" | "saving" | "done";

export function BulkItemForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("select");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });

  // カメラで連続撮影する機能(まとめて登録の際、都度カメラアプリを開き直さずに
  // 何枚も続けて撮影できるようにする)。
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraShotCount, setCameraShotCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 画面遷移・アンマウント時にカメラを確実に停止する(つけっぱなし防止)
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function draftFromFile(file: File): Draft {
    return {
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      name: "",
      categoryMajor: "",
      estimatedPriceRange: null,
      analyzing: false,
      analyzeFailed: false,
      excluded: false,
    };
  }

  function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setDrafts((prev) => [...prev, ...files.map(draftFromFile)]);
    setError(null);
    e.target.value = "";
  }

  async function openCamera() {
    setCameraError(null);
    setCameraShotCount(0);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "このブラウザではカメラを利用できません。写真を選択してください。"
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setCameraError(
        "カメラを起動できませんでした。ブラウザのカメラ権限をご確認ください。"
      );
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  // カメラ映像の紐づけ。videoタグはcameraOpenがtrueになってからDOMに現れるため、
  // stateの反映を待つuseEffectで確実に紐づける(setTimeoutによる決め打ちは
  // タイミング次第で失敗し、映像が真っ黒のまま撮影できなくなることがあった)。
  useEffect(() => {
    if (!cameraOpen) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    // autoplayポリシー対策として、JSXの属性指定だけでなくプロパティとして明示的に設定する
    video.muted = true;
    video.playsInline = true;
    video.play().catch(() => {
      setCameraError(
        "カメラ映像の再生に失敗しました。ページを再読み込みしてもう一度お試しください。"
      );
    });
  }, [cameraOpen]);

  function captureShot() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setCameraError(
        "カメラ映像の準備ができていません。少し待ってからもう一度お試しください。"
      );
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        setDrafts((prev) => [...prev, draftFromFile(file)]);
        setCameraShotCount((c) => c + 1);
      },
      "image/jpeg",
      0.9
    );
  }

  // ステップ1→2: 全ての写真をAI解析し、確認・修正画面へ進む
  async function handleAnalyzeAll() {
    if (drafts.length === 0) {
      setError("写真を選択してください。");
      return;
    }
    // カメラを開いたまま次の画面に進むと、カメラが起動しっぱなしになってしまうため閉じる
    if (cameraOpen) closeCamera();
    setError(null);
    setStep("review");
    setDrafts((prev) => prev.map((d) => ({ ...d, analyzing: true })));

    const results = await Promise.all(
      drafts.map(async (draft) => {
        try {
          const resized = await resizeImageFile(draft.file);
          const mediaType = resized.type || "image/jpeg";
          const base64 = await fileToBase64(resized);
          const analysis = await analyzeItemPhoto(base64, mediaType);
          if (analysis.ok) {
            return {
              ...draft,
              file: resized,
              name: analysis.suggestion.name,
              categoryMajor: analysis.suggestion.categoryMajor,
              estimatedPriceRange: analysis.suggestion.estimatedPriceRange,
              analyzing: false,
              analyzeFailed: false,
            };
          }
          return {
            ...draft,
            file: resized,
            name: "",
            analyzing: false,
            analyzeFailed: true,
          };
        } catch {
          return { ...draft, analyzing: false, analyzeFailed: true };
        }
      })
    );

    setDrafts(results);
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  // ステップ2→3: ユーザーが確認・修正した内容で確定保存する
  async function handleConfirmSave() {
    const targets = drafts.filter((d) => !d.excluded);
    if (targets.length === 0) {
      setError("登録する写真がありません。");
      return;
    }
    const missingName = targets.find((d) => !d.name.trim());
    if (missingName) {
      setError("すべての品名を入力してください(空欄のものがあります)。");
      return;
    }

    setStep("saving");
    setError(null);
    setSaveProgress({ done: 0, total: targets.length });

    const supabase = createClient();
    let successCount = 0;

    for (let i = 0; i < targets.length; i++) {
      const draft = targets[i];
      try {
        const ext = draft.file.name.split(".").pop() ?? "jpg";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("item-media")
          .upload(path, draft.file);

        if (uploadError) continue;

        const baseInsert = {
          user_id: userId,
          recorded_by_user_id: userId,
          name: draft.name.trim(),
          category_major: draft.categoryMajor || null,
          category_minor: null,
          location_id: null,
          disposition: "unsure" as const,
          disposition_tags: null,
          memo: null,
          photo_url: path,
          media_type: "image" as const,
        };

        let { error: insertError } = await supabase
          .from("items")
          .insert({
            ...baseInsert,
            estimated_price_range: draft.estimatedPriceRange,
          });

        // estimated_price_range 列がまだ存在しない環境向けのフォールバック
        if (insertError?.message?.includes("estimated_price_range")) {
          ({ error: insertError } = await supabase
            .from("items")
            .insert(baseInsert));
        }

        if (!insertError) successCount += 1;
      } catch {
        // 1件失敗しても残りの処理は続行する
      } finally {
        setSaveProgress({ done: i + 1, total: targets.length });
      }
    }

    router.push(`/items?bulkAdded=${successCount}`);
  }

  const activeCount = useMemo(
    () => drafts.filter((d) => !d.excluded).length,
    [drafts]
  );

  if (step === "select") {
    return (
      <div className="flex flex-col gap-6 rounded-[1.75rem] border border-green-100 bg-white/70 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink/80">
            写真をまとめて選択
          </label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesChange}
            className="text-sm text-ink/70 file:mr-4 file:rounded-full file:border-0 file:bg-green-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-green-700 hover:file:bg-green-200"
          />
          <button
            type="button"
            onClick={openCamera}
            className="mt-1 self-start rounded-full border border-green-600 px-4 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-50"
          >
            カメラで連続撮影する
          </button>
          {cameraError && (
            <p className="text-xs text-red-600">{cameraError}</p>
          )}
          <p className="text-xs text-ink/40">
            各写真をAIが自動判定します。次の画面で品名・ジャンルを確認・修正してから登録します。
            カメラで連続撮影すると、シャッターを押した分だけ何枚でも追加できます。
        </p>
        </div>

        {drafts.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {drafts.map((d) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={d.id}
                src={d.preview}
                alt="選択した写真"
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleAnalyzeAll}
          disabled={drafts.length === 0}
          className="rounded-full bg-green-700 px-6 py-3 font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
        >
          {`AIで判定する(${drafts.length}件)`}
        </button>

        {cameraOpen && (
          <div className="fixed inset-0 z-30 flex flex-col bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="flex-1 w-full object-cover"
            />
            {cameraError && (
              <p className="bg-red-600/90 px-4 py-2 text-center text-xs text-white">
                {cameraError}
              </p>
            )}
            <div className="flex items-center justify-center gap-6 bg-black/80 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
              <button
                type="button"
                onClick={closeCamera}
                className="rounded-full border border-white/40 px-4 py-2 text-sm font-medium text-white"
              >
                終了する({cameraShotCount}枚撮影)
              </button>
              <button
                type="button"
                onClick={captureShot}
                aria-label="シャッター"
                className="h-16 w-16 rounded-full border-4 border-white bg-white/20"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === "review") {
    const stillAnalyzing = drafts.some((d) => d.analyzing);
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-[1.5rem] border border-gold/40 bg-gold/10 p-4 text-sm text-ink/80">
          AIの判定結果です。品名やジャンルが違う場合はここで修正してください。登録しない写真は「除外」できます。
        </div>

        {stillAnalyzing && (
          <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
            AIが判定中です…
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {drafts.map((d) => (
            <li
              key={d.id}
              className={`flex gap-3 rounded-[1.5rem] border p-4 shadow-sm transition ${
                d.excluded
                  ? "border-black/5 bg-black/5 opacity-50"
                  : "border-green-100 bg-white/70"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={d.preview}
                alt="写真"
                className="h-20 w-20 shrink-0 rounded-lg object-cover"
              />
              <div className="flex flex-1 flex-col gap-2">
                {d.analyzing ? (
                  <p className="text-sm text-ink/50">判定中…</p>
                ) : (
                  <>
                    {d.analyzeFailed && (
                      <p className="text-xs text-orange-600">
                        AI判定に失敗しました。品名を手動で入力してください。
                      </p>
                    )}
                    <input
                      value={d.name}
                      onChange={(e) => updateDraft(d.id, { name: e.target.value })}
                      placeholder="品名を入力"
                      disabled={d.excluded}
                      className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 disabled:opacity-50"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={d.categoryMajor}
                        onChange={(e) =>
                          updateDraft(d.id, {
                            categoryMajor: e.target.value as CategoryMajor | "",
                          })
                        }
                        disabled={d.excluded}
                        className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 disabled:opacity-50"
                      >
                        <option value="">ジャンル未設定</option>
                        {CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {d.estimatedPriceRange && (
                        <span className="text-xs text-ink/50">
                          推定価格:{formatPriceDisplay(d.estimatedPriceRange)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => updateDraft(d.id, { excluded: !d.excluded })}
                        className="ml-auto rounded-full px-3 py-1 text-xs font-medium text-ink/50 hover:bg-black/5"
                      >
                        {d.excluded ? "除外を取り消す" : "除外する"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStep("select")}
            className="rounded-full border border-black/10 px-5 py-3 text-sm font-medium text-ink/70"
          >
            写真を選び直す
          </button>
          <button
            type="button"
            onClick={handleConfirmSave}
            disabled={stillAnalyzing || activeCount === 0}
            className="flex-1 rounded-full bg-green-700 px-6 py-3 font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
          >
            {`この内容で登録する(${activeCount}件)`}
          </button>
        </div>
      </div>
    );
  }

  // saving
  return (
    <div className="flex flex-col gap-4 rounded-[1.75rem] border border-green-100 bg-white/70 p-6 shadow-sm sm:p-8">
      <p className="text-sm text-green-700">
        登録しています({saveProgress.done}/{saveProgress.total}件)
      </p>
    </div>
  );
}

