"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LocationCreateForm } from "@/components/LocationCreateForm";
import { flattenLocationTree } from "@/lib/locationTree";
import { LOCATION_TYPE_OPTIONS, labelFor } from "@/lib/constants";
import type { Location, LocationType } from "@/lib/types";

const LOCATION_TYPE_STYLE: Record<
  LocationType,
  { bg: string; text: string }
> = {
  building: { bg: "bg-sky-100", text: "text-sky-700" },
  floor: { bg: "bg-amber-100", text: "text-amber-700" },
  room: { bg: "bg-green-100", text: "text-green-700" },
  storage: { bg: "bg-orange-100", text: "text-orange-700" },
};

function LocationTypeIcon({ type }: { type: LocationType }) {
  switch (type) {
    case "building":
      return (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M5 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16M13 21v-8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v8"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
          <path
            d="M8 8h0M8 12h0M8 16h0"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      );
    case "floor":
      return (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="m4 8 8-4 8 4-8 4-8-4Z"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
          <path
            d="m4 12 8 4 8-4M4 16l8 4 8-4"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
        </svg>
      );
    case "storage":
      return (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M4 8.5 12 5l8 3.5V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8.5Z"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
          <path
            d="M4 8.5 12 12l8-3.5M12 12v6"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
        </svg>
      );
    case "room":
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M6 21V4.6a1 1 0 0 1 .82-.98l9-1.64A1 1 0 0 1 17 3v18"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
          <path d="M6 21h13M13.2 13h0" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>
      );
  }
}

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

  const style = LOCATION_TYPE_STYLE[location.location_type];

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
      .eq("user_id", location.user_id)
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
      .eq("id", location.id)
      .eq("user_id", location.user_id);

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
        className="rounded-[1.5rem] border border-green-200 bg-green-50/60 p-4 shadow-sm"
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
      className="flex flex-col gap-3 rounded-[1.5rem] border border-green-100 bg-white/70 px-4 py-3.5 shadow-sm transition hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${style.bg} ${style.text}`}
        >
          <LocationTypeIcon type={location.location_type} />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{location.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${style.bg} ${style.text}`}
            >
              {labelFor(LOCATION_TYPE_OPTIONS, location.location_type)}
            </span>
          </div>
          {breadcrumb.length > 0 && (
            <p className="mt-0.5 text-xs text-ink/40">
              {breadcrumb.join(" > ")}
            </p>
          )}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[3.25rem] sm:flex-nowrap sm:pl-0">
        <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-ink/60">
          {itemCount} 件
        </span>
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
          className="inline-flex items-center gap-1.5 rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth={2.25}
              strokeLinecap="round"
            />
          </svg>
          場所を追加
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
        <div className="flex flex-col items-center gap-2 rounded-[1.75rem] border border-dashed border-green-200 bg-white/50 p-10 text-center">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-400"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
              <circle cx="12" cy="9.5" r="2.25" stroke="currentColor" strokeWidth={1.5} />
            </svg>
          </span>
          <p className="text-sm text-ink/60">
            まだ場所が登録されていません。
            <br />
            リビングや寝室など、片付けたい場所を追加してみましょう。
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
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
