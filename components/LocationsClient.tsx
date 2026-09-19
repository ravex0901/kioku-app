"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LocationCreateForm } from "@/components/LocationCreateForm";
import { flattenLocationTree } from "@/lib/locationTree";
import { LOCATION_TYPE_OPTIONS, labelFor } from "@/lib/constants";
import type { Location, LocationType } from "@/lib/types";

function LocationListItem({
  location,
  depth,
  breadcrumb,
  itemCount,
  onUpdated,
  onDeleted,
}: {
  location: Location;
  depth: number;
  breadcrumb: string[];
  itemCount: number;
  onUpdated: (location: Location) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(location.name);
  const [locationType, setLocationType] = useState<LocationType>(
    location.location_type
  );
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("場所の名前を入力してください。");
      return;
    }

    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("locations")
      .update({ name: trimmed, location_type: locationType })
      .eq("id", location.id)
      .select()
      .single();

    setSubmitting(false);

    if (updateError || !data) {
      setError("更新に失敗しました。もう一度お試しください。");
      return;
    }

    onUpdated(data);
    setEditing(false);
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `「${location.name}」を削除します。この場所を使っているものがある場合は削除できません。よろしいですか?`
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("locations")
      .delete()
      .eq("id", location.id);

    if (deleteError) {
      setDeleting(false);
      setError(
        "削除に失敗しました。この場所を使っているものや、下位の場所が残っている可能性があります。"
      );
      return;
    }

    onDeleted(location.id);
  }

  if (editing) {
    return (
      <li
        style={{ marginLeft: `${depth * 1.5}rem` }}
        className="rounded-2xl border border-green-200 bg-green-50/60 p-4"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">
              場所の名前
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">種別</label>
            <select
              value={locationType}
              onChange={(e) =>
                setLocationType(e.target.value as LocationType)
              }
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            >
              {LOCATION_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
            >
              {submitting ? "保存中…" : "保存する"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(location.name);
                setLocationType(location.location_type);
                setError(null);
              }}
              className="rounded-full px-4 py-2 text-sm font-medium text-ink/60 hover:bg-black/5"
            >
              キャンセル
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      style={{ marginLeft: `${depth * 1.5}rem` }}
      className="flex flex-col gap-2 rounded-2xl border border-green-100 bg-white/70 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            {labelFor(LOCATION_TYPE_OPTIONS, location.location_type)}
          </span>
          <span className="font-medium text-ink">{location.name}</span>
        </div>
        {breadcrumb.length > 0 && (
          <p className="mt-0.5 text-xs text-ink/40">{breadcrumb.join(" > ")}</p>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm text-ink/60">{itemCount} 件</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full border border-green-200 px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-50"
        >
          編集
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        >
          {deleting ? "削除中…" : "削除"}
        </button>
      </div>
    </li>
  );
}

export function LocationsClient({
  userId,
  initialLocations,
  itemCounts,
}: {
  userId: string;
  initialLocations: Location[];
  itemCounts: Record<string, number>;
}) {
  const [locations, setLocations] = useState(initialLocations);
  const [showForm, setShowForm] = useState(false);

  const nodes = flattenLocationTree(locations);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800"
        >
          + 場所を追加
        </button>
      </div>

      {showForm && (
        <LocationCreateForm
          userId={userId}
          onCreated={(loc) => {
            setLocations((prev) => [...prev, loc]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {nodes.length === 0 ? (
        <p className="rounded-2xl border border-green-100 bg-white/70 p-6 text-center text-sm text-ink/60">
          まだ場所が登録されていません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {nodes.map(({ location, depth, breadcrumb }) => (
            <LocationListItem
              key={location.id}
              location={location}
              depth={depth}
              breadcrumb={breadcrumb}
              itemCount={itemCounts[location.id] ?? 0}
              onUpdated={(updated) => {
                setLocations((prev) =>
                  prev.map((l) => (l.id === updated.id ? updated : l))
                );
              }}
              onDeleted={(id) => {
                setLocations((prev) => prev.filter((l) => l.id !== id));
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
