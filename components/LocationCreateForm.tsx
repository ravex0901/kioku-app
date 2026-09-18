"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LOCATION_TYPE_OPTIONS } from "@/lib/constants";
import type { Location, LocationType } from "@/lib/types";

export function LocationCreateForm({
  userId,
  locations,
  onCreated,
  onCancel,
}: {
  userId: string;
  locations: Location[];
  onCreated: (location: Location) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [locationType, setLocationType] = useState<LocationType>("room");
  const [parentId, setParentId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("場所の名前を入力してください。");
      return;
    }
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("locations")
      .insert({
        user_id: userId,
        name: name.trim(),
        location_type: locationType,
        parent_location_id: parentId || null,
      })
      .select()
      .single();

    setSubmitting(false);

    if (insertError || !data) {
      setError("場所の追加に失敗しました。もう一度お試しください。");
      return;
    }

    onCreated(data);
    setName("");
    setParentId("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-green-200 bg-green-50/60 p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink/80">場所の名前</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例:2階 寝室のクローゼット"
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink/80">種別</label>
        <select
          value={locationType}
          onChange={(e) => setLocationType(e.target.value as LocationType)}
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        >
          {LOCATION_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink/80">
          親の場所(任意)
        </label>
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        >
          <option value="">なし</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
        >
          {submitting ? "追加中…" : "追加する"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm font-medium text-ink/60 hover:bg-black/5"
          >
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}
