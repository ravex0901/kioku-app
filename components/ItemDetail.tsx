"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LocationCreateForm } from "@/components/LocationCreateForm";
import { DispositionBadge } from "@/components/DispositionBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  CATEGORY_MEMO_HINTS,
  CATEGORY_OPTIONS,
  DISPOSITION_OPTIONS,
  DISPOSITION_TAG_OPTIONS,
  ITEM_STATUS_BADGE_STYLE,
  ITEM_STATUS_OPTIONS,
  labelFor,
} from "@/lib/constants";
import { resizeImageFile } from "@/lib/resizeImage";
import { formatPriceDisplay } from "@/lib/priceRange";
import type {
  CategoryMajor,
  Disposition,
  DispositionTag,
  Item,
  ItemStatus,
  Location,
} from "@/lib/types";

const NEW_LOCATION_VALUE = "__new__";

export function ItemDetail({
  item,
  initialLocations,
  signedPhotoUrl,
  locationName,
}: {
  item: Item;
  initialLocations: Location[];
  signedPhotoUrl: string | null;
  locationName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [locations, setLocations] = useState(initialLocations);
  const [showLocationForm, setShowLocationForm] = useState(false);

  const [name, setName] = useState(item.name);
  const [categoryMajor, setCategoryMajor] = useState<CategoryMajor | "">(
    item.category_major ?? ""
  );
  const [categoryOther, setCategoryOther] = useState(
    item.category_major === "other" ? item.category_minor ?? "" : ""
  );
  const [locationId, setLocationId] = useState(item.location_id ?? "");
  const [disposition, setDisposition] = useState<Disposition | "">(
    item.disposition ?? ""
  );
  const [dispositionTags, setDispositionTags] = useState<DispositionTag[]>(
    item.disposition_tags ?? []
  );
  const [memo, setMemo] = useState(item.memo ?? "");
  const [estimatedPriceRange, setEstimatedPriceRange] = useState(
    item.estimated_price_range ?? ""
  );
  const [professionalAppraisal, setProfessionalAppraisal] = useState(
    item.professional_appraisal ?? ""
  );
  const [status, setStatus] = useState<ItemStatus>(
    item.status ?? "photo_registered"
  );
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    signedPhotoUrl
  );
  const [photoProcessing, setPhotoProcessing] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showTags = disposition === "keep" || disposition === "keepsake";

  function toggleTag(tag: DispositionTag) {
    setDispositionTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setPhotoProcessing(true);
    try {
      const resized = await resizeImageFile(file);
      setPhotoFile(resized);
      setPhotoPreview(URL.createObjectURL(resized));
    } finally {
      setPhotoProcessing(false);
    }
  }

  function handleLocationSelect(value: string) {
    if (value === NEW_LOCATION_VALUE) {
      setShowLocationForm(true);
      return;
    }
    setLocationId(value);
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("品名を入力してください。");
      return;
    }

    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    let photoPath = item.photo_url;
    let mediaType = item.media_type;

    try {
      if (photoFile) {
        mediaType = photoFile.type.startsWith("video/") ? "video" : "image";
        const ext = photoFile.name.split(".").pop() ?? "bin";
        const fileName = `${crypto.randomUUID()}.${ext}`;
        const path = `${item.user_id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("item-media")
          .upload(path, photoFile);

        if (uploadError) {
          throw new Error("写真のアップロードに失敗しました。");
        }

        if (item.photo_url) {
          await supabase.storage.from("item-media").remove([item.photo_url]);
        }

        photoPath = path;
      }

      const baseUpdate = {
        name: name.trim(),
        category_major: categoryMajor || null,
        category_minor:
          categoryMajor === "other" ? categoryOther.trim() || null : null,
        location_id: locationId || null,
        disposition: disposition || null,
        disposition_tags: showTags ? dispositionTags : null,
        memo: memo.trim() || null,
        photo_url: photoPath,
        media_type: mediaType,
      };

      let { error: updateError } = await supabase
        .from("items")
        .update({
          ...baseUpdate,
          estimated_price_range: estimatedPriceRange.trim() || null,
          professional_appraisal: professionalAppraisal.trim() || null,
        })
        .eq("id", item.id)
        .eq("user_id", item.user_id);

      // estimated_price_range 列がまだ存在しない環境向けのフォールバック
      if (updateError?.message?.includes("estimated_price_range")) {
        ({ error: updateError } = await supabase
          .from("items")
          .update(baseUpdate)
          .eq("id", item.id)
          .eq("user_id", item.user_id));
      }

      if (updateError) {
        throw new Error("更新に失敗しました。もう一度お試しください。");
      }

      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  // 整理進捗ステータスの変更(請求項7の標準ワークフロー・ステータス履歴に対応)。
  // 変更前・変更後・変更者・日時を item_status_history に記録する。
  async function handleStatusChange(next: ItemStatus) {
    if (next === status) return;
    setStatusUpdating(true);
    setStatusError(null);
    const supabase = createClient();

    const { error: updateError } = await supabase
      .from("items")
      .update({ status: next })
      .eq("id", item.id)
      .eq("user_id", item.user_id);

    if (updateError) {
      setStatusUpdating(false);
      setStatusError("状態の更新に失敗しました。もう一度お試しください。");
      return;
    }

    await supabase.from("item_status_history").insert({
      item_id: item.id,
      user_id: item.user_id,
      from_status: status,
      to_status: next,
      changed_by: item.user_id,
    });

    setStatus(next);
    setStatusUpdating(false);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const supabase = createClient();

    try {
      if (item.photo_url) {
        await supabase.storage.from("item-media").remove([item.photo_url]);
      }
      const { error: deleteError } = await supabase
        .from("items")
        .delete()
        .eq("id", item.id)
        .eq("user_id", item.user_id);

      if (deleteError) {
        throw new Error("削除に失敗しました。");
      }

      router.push("/items");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました。");
      setDeleting(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-6 rounded-[1.75rem] border border-green-100 bg-white/70 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl bg-green-50">
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoPreview}
                alt={item.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-green-300">
                写真なし
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <h1 className="text-2xl font-bold text-ink">{item.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <DispositionBadge disposition={item.disposition} />
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${ITEM_STATUS_BADGE_STYLE[status]}`}
              >
                {labelFor(ITEM_STATUS_OPTIONS, status)}
              </span>
              {item.estimated_price_range && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-3 py-1 text-xs font-semibold text-green-800">
                  推定売却額 {formatPriceDisplay(item.estimated_price_range)}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink/50">
                整理の進捗ステータス
              </label>
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value as ItemStatus)}
                disabled={statusUpdating}
                className="w-fit rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 disabled:opacity-60"
              >
                {ITEM_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {statusError && (
                <p className="text-xs text-red-600">{statusError}</p>
              )}
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink/50">ジャンル</dt>
              <dd className="text-ink">
                {labelFor(CATEGORY_OPTIONS, item.category_major)}
                {item.category_major === "other" && item.category_minor
                  ? `(${item.category_minor})`
                  : ""}
              </dd>
              <dt className="text-ink/50">保管場所</dt>
              <dd className="text-ink">{locationName}</dd>
              <dt className="text-ink/50">売却額の目安</dt>
              <dd className="text-ink">
                {formatPriceDisplay(item.estimated_price_range) || "―"}
              </dd>
              <dt className="text-ink/50">専門査定結果</dt>
              <dd className="text-ink">{item.professional_appraisal || "―"}</dd>
              {showTags && dispositionTags.length > 0 && (
                <>
                  <dt className="text-ink/50">理由タグ</dt>
                  <dd className="text-ink">
                    {dispositionTags
                      .map(
                        (t) =>
                          DISPOSITION_TAG_OPTIONS.find((o) => o.value === t)
                            ?.label ?? t
                      )
                      .join("、")}
                  </dd>
                </>
              )}
              <dt className="text-ink/50">家族へのメモ</dt>
              <dd className="whitespace-pre-wrap text-ink">
                {item.memo || "―"}
              </dd>
            </dl>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800"
          >
            編集する
          </button>
          <button
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={deleting}
            className="rounded-full border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
          >
            {deleting ? "削除中…" : "削除する"}
          </button>
        </div>
        <ConfirmDialog
          open={deleteConfirmOpen}
          title="この持ち物を削除しますか?"
          description={`「${item.name}」を削除します。この操作は取り消せません。`}
          onConfirm={() => {
            setDeleteConfirmOpen(false);
            handleDelete();
          }}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded-[1.75rem] border border-green-100 bg-white/70 p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink/80">写真</label>
        {photoPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoPreview}
            alt="プレビュー"
            className="mb-2 h-40 w-40 rounded-2xl object-cover"
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handlePhotoChange}
          disabled={photoProcessing}
          className="text-sm text-ink/70 file:mr-4 file:rounded-full file:border-0 file:bg-green-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-green-700 hover:file:bg-green-200 disabled:opacity-60"
        />
        {photoProcessing && (
          <p className="text-xs text-ink/50">写真を軽量化しています…</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink/80">
          品名 <span className="text-red-500">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink/80">ジャンル</label>
        <select
          value={categoryMajor}
          onChange={(e) => setCategoryMajor(e.target.value as CategoryMajor)}
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        >
          <option value="">選択してください</option>
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {categoryMajor === "other" && (
          <input
            value={categoryOther}
            onChange={(e) => setCategoryOther(e.target.value)}
            placeholder="ジャンルを入力してください"
            className="mt-2 rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink/80">保管場所</label>
        <select
          value={showLocationForm ? NEW_LOCATION_VALUE : locationId}
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
            <LocationCreateForm
              userId={item.user_id}
              existingLocations={locations}
              onCreated={(loc) => {
                setLocations((prev) => [...prev, loc]);
                setLocationId(loc.id);
                setShowLocationForm(false);
              }}
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
              name="disposition-edit"
              value={opt.value}
              checked={disposition === opt.value}
              onChange={() => setDisposition(opt.value)}
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
              const selected = dispositionTags.includes(tag.value);
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
        <label className="text-sm font-medium text-ink/80">
          売却額の目安
        </label>
        <input
          value={estimatedPriceRange}
          onChange={(e) => setEstimatedPriceRange(e.target.value)}
          placeholder="例:〜10,000円 / 値段がつきにくい"
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
        <p className="text-xs text-ink/40">
          AIによる推定価格です。確定した査定結果ではありません。
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink/80">
          専門査定結果(任意)
        </label>
        <input
          value={professionalAppraisal}
          onChange={(e) => setProfessionalAppraisal(e.target.value)}
          placeholder="例:〇〇買取店にて15,000円で査定(2026/9/1)"
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink/80">
          家族へのメモ
        </label>
        <textarea
          rows={4}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder={CATEGORY_MEMO_HINTS[categoryMajor || "other"]}
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting || photoProcessing}
          className="rounded-full bg-green-700 px-6 py-3 font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
        >
          {submitting ? "保存中…" : "保存する"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-full border border-black/10 px-6 py-3 font-semibold text-ink/60 transition hover:bg-black/5"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
