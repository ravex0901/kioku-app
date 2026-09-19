"use client";

import { useState } from "react";
import { LocationCreateForm } from "@/components/LocationCreateForm";
import { flattenLocationTree } from "@/lib/locationTree";
import { LOCATION_TYPE_OPTIONS, labelFor } from "@/lib/constants";
import type { Location } from "@/lib/types";

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
            <li
              key={location.id}
              style={{ marginLeft: `${depth * 1.5}rem` }}
              className="flex items-center justify-between rounded-2xl border border-green-100 bg-white/70 px-4 py-3 shadow-sm"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    {labelFor(LOCATION_TYPE_OPTIONS, location.location_type)}
                  </span>
                  <span className="font-medium text-ink">{location.name}</span>
                </div>
                {breadcrumb.length > 0 && (
                  <p className="mt-0.5 text-xs text-ink/40">
                    {breadcrumb.join(" > ")}
                  </p>
                )}
              </div>
              <span className="text-sm text-ink/60">
                {itemCounts[location.id] ?? 0} 件
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
