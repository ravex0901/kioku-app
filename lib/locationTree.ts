import type { Location } from "@/lib/types";

export interface LocationNode {
  location: Location;
  depth: number;
  breadcrumb: string[];
}

export function buildChildrenMap(locations: Location[]) {
  const map = new Map<string | null, Location[]>();
  for (const loc of locations) {
    const key = loc.parent_location_id;
    const list = map.get(key) ?? [];
    list.push(loc);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.name.localeCompare(b.name, "ja")
    );
  }
  return map;
}

export function flattenLocationTree(locations: Location[]): LocationNode[] {
  const childrenMap = buildChildrenMap(locations);
  const result: LocationNode[] = [];

  function walk(parentId: string | null, depth: number, breadcrumb: string[]) {
    const children = childrenMap.get(parentId) ?? [];
    for (const child of children) {
      result.push({ location: child, depth, breadcrumb });
      walk(child.id, depth + 1, [...breadcrumb, child.name]);
    }
  }

  walk(null, 0, []);
  return result;
}

export function getDescendantIds(
  locations: Location[],
  rootId: string
): string[] {
  const childrenMap = buildChildrenMap(locations);
  const result: string[] = [rootId];

  function walk(id: string) {
    const children = childrenMap.get(id) ?? [];
    for (const child of children) {
      result.push(child.id);
      walk(child.id);
    }
  }

  walk(rootId);
  return result;
}
