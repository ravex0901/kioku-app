"use client";

import { usePathname, useRouter } from "next/navigation";
import { CATEGORY_OPTIONS, DISPOSITION_OPTIONS } from "@/lib/constants";
import type { Location } from "@/lib/types";

export function ItemsFilterBar({
  locations,
  defaultValues,
}: {
  locations: Location[];
  defaultValues: {
    category: string;
    location: string;
    disposition: string;
    q: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-wrap gap-3 rounded-2xl border border-green-100 bg-white/70 p-4 shadow-sm">
      <select
        defaultValue={defaultValues.category}
        onChange={(e) => updateParam("category", e.target.value)}
        className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
      >
        <option value="">ジャンル(すべて)</option>
        {CATEGORY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        defaultValue={defaultValues.location}
        onChange={(e) => updateParam("location", e.target.value)}
        className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
      >
        <option value="">場所(すべて)</option>
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.name}
          </option>
        ))}
      </select>

      <select
        defaultValue={defaultValues.disposition}
        onChange={(e) => updateParam("disposition", e.target.value)}
        className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
      >
        <option value="">処分方針(すべて)</option>
        {DISPOSITION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <input
        type="search"
        defaultValue={defaultValues.q}
        placeholder="品名で検索してEnter"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            updateParam("q", (e.target as HTMLInputElement).value);
          }
        }}
        className="min-w-[10rem] flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
      />
    </div>
  );
}
