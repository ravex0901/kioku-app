"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { QuickLocationAdd } from "@/components/QuickLocationAdd";
import {
  analyzeItemPhoto,
  CONDITION_LABELS,
  type ItemCondition,
} from "@/app/actions/ai";
import {
  CATEGORY_OPTIONS,
  DISPOSITION_OPTIONS,
  DISPOSITION_TAG_OPTIONS,
} from "@/lib/constants";
import { fileToBase64 } from "@/lib/fileToBase64";
import type {
  CategoryMajor,
  Disposition,
  DispositionTag,
  Location,
} from "@/lib/types";

const NEW_LOCATION_VALUE = "__new__";

const initialFormState = {
  name: "",
  categoryMajor: "" as CategoryMajor | "",
  categoryOther: "",
  locationId: "",
  disposition: "" as Disposition | "",
  dispositionTags: [] as DispositionTag[],
  memo: "",
};

export function ItemForm({
  userId,
  initialLocations,
}: {
  userId: string;
  initialLocations: Location[];
}) {
  const [locations, setLocations] = useState(initialLocations);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [form, setForm] = useState(initialFormState);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredName, setRegisteredName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCondition, setAiCondition] = useState<ItemCondition | null>(null);

  const showTags =
    form.disposition === "keep" || form.disposition === "keepsake";

  function resetForm() {
    setForm(initialFormState);
    setPhotoFile(null);
    setPhotoPreview(null);
    setShowLocationForm(false);
    setAiError(null);
    setAiCondition(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
    setAiError(null);
    setAiCondition(null);
  }

  async function handleAiAssist() {
    if (!photoFile) return;

    setAiLoading(true);
    setAiError(null);
    setAiCondition(null);

    try {
      const base64 = await fileToBase64(photoFile);
      const mediaType = photoFile.type || "image/jpeg";
      const result = await analyzeItemPhoto(base64, mediaType);

      if (!result.ok) {
        setAiError(result.error);
        return;
      }

      const { suggestion } = result;
      setForm((prev) => ({
        ...prev,
        name: suggestion.name,
        categoryMajor: suggestion.categoryMajor,
        categoryOther:
          suggestion.categoryMajor === "other"
            ? suggestion.categoryOther ?? prev.categoryOther
            : "",
        memo:
          prev.memo.trim().length === 0
            ? `(AI推定)状態:${CONDITION_LABELS[suggestion.condition]}`
            : prev.memo,
      }));
      setAiCondition(suggestion.condition);
    } catch {
      setAiError("判定に失敗しました。手動で入力してください。");
    } finally {
      setAiLoading(false);
    }
  }

  function toggleTag(tag: DispositionTag) {
    setForm((prev) => ({
      ...prev,
      dispositionTags: prev.dispositionTags.includes(tag)
        ? prev.dispositionTags.filter((t) => t !== tag)
        : [...prev.dispositionTags, tag],
    }));
  }

  function handleLocationSelect(value: string) {
    if (value === NEW_LOCATION_VALUE) {
      setShowLocationForm(true);
      return;
    }
    setForm((prev) => ({ ...prev, locationId: value }));
  }

  function handleLocationCreated(location: Location) {
    setLocations((prev) => [...prev, location]);
    setForm((prev) => ({ ...prev, locationId: location.id }));
    setShowLocationForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("品名を入力してください。");
      return;
    }

    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    let photoPath: string | null = null;
    let mediaType: "image" | "video" | null = null;

    try {
      if (photoFile) {
        mediaType = photoFile.type.startsWith("video/") ? "video" : "image";
        const ext = photoFile.name.split(".").pop() ?? "bin";
        const fileName = `${crypto.randomUUID()}.${ext}`;
        const path = `${userId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("item-media")
          .upload(path, photoFile);

        if (uploadError) {
          throw new Error("写真のアップロードに失敗しました。");
        }
        photoPath = path;
      }

      const { data, error: insertError } = await supabase
        .from("items")
        .insert({
          user_id: userId,
          recorded_by_user_id: userId,
          name: form.name.trim(),
          category_major: form.categoryMajor || null,
          category_minor:
            form.categoryMajor === "other" ? form.categoryOther.trim() || null : null,
          location_id: form.locationId || null,
          disposition: form.disposition || null,
          disposition_tags: showTags ? form.dispositionTags : null,
          memo: form.memo.trim() || null,
          photo_url: photoPath,
          media_type: mediaType,
        })
        .select("name")
        .single();

      if (insertError || !data) {
        throw new Error("登録に失敗しました。もう一度お試しください。");
      }

      setRegisteredName(data.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  if (registeredName) {
    return (
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-green-100 bg-white/70 p-10 text-center shadow-sm">
        <p className="text-2xl font-bold text-green-700">
          登録が完了しました
        </p>
        <p className="text-ink/70">
          「{registeredName}」を登録しました。
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              resetForm();
              setRegisteredName(null);
            }}
            className="rounded-full bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-700"
          >
            続けて登録する
          </button>
          <Link
            href="/home"
            className="rounded-full border border-green-200 px-6 py-3 font-semibold text-green-700 transition hover:bg-green-50"
          >
            ホームに戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-6 rounded-2xl border border-green-100 bg-white/70 p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink/80">写真(任意)</label>
        {photoPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoPreview}
            alt="プレビュー"
            className="mb-2 h-48 w-48 rounded-xl object-cover"
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handlePhotoChange}
          className="text-sm text-ink/70 file:mr-4 file:rounded-full file:border-0 file:bg-green-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-green-700 hover:file:bg-green-200"
        />

        {photoFile && (
          <div className="mt-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleAiAssist}
              disabled={aiLoading}
              className="self-start rounded-full border border-green-300 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-100 disabled:opacity-60"
            >
              {aiLoading ? "AIが写真を見ています…" : "✨ AIにおまかせ入力"}
            </button>

            {aiError && (
              <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
                {aiError}
              </p>
            )}

            {aiCondition && !aiError && (
              <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
                <p>
                  推定される状態:{" "}
                  <span className="font-semibold">
                    {CONDITION_LABELS[aiCondition]}
                  </span>
                </p>
                <p className="mt-1 text-xs text-green-700/70">
                  AIによる推定です。内容を確認・修正してください。
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-ink/80">
          品名 <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          required
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink/80">ジャンル</label>
        <select
          value={form.categoryMajor}
          onChange={(e) =>
            setForm((p) => ({
              ...p,
              categoryMajor: e.target.value as CategoryMajor,
            }))
          }
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        >
          <option value="">選択してください</option>
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {form.categoryMajor === "other" && (
          <input
            value={form.categoryOther}
            onChange={(e) =>
              setForm((p) => ({ ...p, categoryOther: e.target.value }))
            }
            placeholder="ジャンルを入力してください"
            className="mt-2 rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink/80">保管場所</label>
        <select
          value={showLocationForm ? NEW_LOCATION_VALUE : form.locationId}
          onChange={(e) => handleLocationSelect(e.target.value)}
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        >
          <option value="">選択してください</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
          <option value={NEW_LOCATION_VALUE}>+ 新しい場所を追加</option>
        </select>
        {showLocationForm && (
          <div className="mt-2">
            <QuickLocationAdd
              userId={userId}
              onCreated={handleLocationCreated}
              onCancel={() => setShowLocationForm(false)}
            />
          </div>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink/80">
          処分の方針
        </legend>
        {DISPOSITION_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-2 text-sm text-ink/80"
          >
            <input
              type="radio"
              name="disposition"
              value={opt.value}
              checked={form.disposition === opt.value}
              onChange={() =>
                setForm((p) => ({ ...p, disposition: opt.value }))
              }
              className="h-4 w-4 accent-green-600"
            />
            {opt.label}
          </label>
        ))}
      </fieldset>

      {showTags && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink/80">
            理由タグ(複数選択可)
          </span>
          <div className="flex flex-wrap gap-2">
            {DISPOSITION_TAG_OPTIONS.map((tag) => {
              const selected = form.dispositionTags.includes(tag.value);
              return (
                <button
                  type="button"
                  key={tag.value}
                  onClick={() => toggleTag(tag.value)}
                  className={`rounded-full border px-4 py-1.5 text-sm transition ${
                    selected
                      ? "border-green-500 bg-green-100 text-green-700"
                      : "border-black/10 bg-white text-ink/60 hover:border-green-300"
                  }`}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="memo" className="text-sm font-medium text-ink/80">
          家族へのメモ(任意)
        </label>
        <textarea
          id="memo"
          rows={4}
          value={form.memo}
          onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
      >
        {submitting ? "登録中…" : "登録する"}
      </button>
    </form>
  );
}
