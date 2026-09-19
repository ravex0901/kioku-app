import type { SupabaseClient } from "@supabase/supabase-js";
import type { Location } from "@/lib/types";

/**
 * 新規ユーザーが最初に場所を開いたときのための初期セット。
 * よくある場所をあらかじめ用意しておき、ゼロから入力する手間を減らす。
 */
const DEFAULT_LOCATIONS: {
  name: string;
  location_type: Location["location_type"];
  sort_order: number;
}[] = [
  { name: "リビング", location_type: "room", sort_order: 1 },
  { name: "寝室", location_type: "room", sort_order: 2 },
  { name: "倉庫", location_type: "storage", sort_order: 3 },
];

/**
 * ユーザーの場所が1件もない場合に、初期セット(リビング・寝室・倉庫)を作成する。
 * 既に場所がある場合は何もせず、そのまま既存の一覧を返す。
 */
export async function ensureDefaultLocations(
  supabase: SupabaseClient,
  userId: string,
  existingLocations: Location[]
): Promise<Location[]> {
  if (existingLocations.length > 0) {
    return existingLocations;
  }

  const { data, error } = await supabase
    .from("locations")
    .insert(
      DEFAULT_LOCATIONS.map((loc) => ({
        user_id: userId,
        name: loc.name,
        location_type: loc.location_type,
        sort_order: loc.sort_order,
        parent_location_id: null,
      }))
    )
    .select();

  if (error || !data) {
    return existingLocations;
  }

  return data as Location[];
}

