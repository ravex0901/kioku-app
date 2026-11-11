import type { createClient } from "@/lib/supabase/server";
import {
  getFamilyShareSettings,
  getFamilyLegacyShare,
  type FamilyShareSettings,
} from "@/app/actions/familyNetwork";
import type { FamilyMember } from "@/lib/types";

// 家族の欄(components/FamilySection.tsx)に渡す材料を読む。
// もとは設定画面で読んでいたもの。2026-11-11 から家系図の画面で使う。

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type FamilySectionData = {
  familyShareSettings: FamilyShareSettings;
  /** アカウントでつながっている相手が故人として設定されているか */
  deceasedStatus: Record<string, boolean>;
  /** 故人の方の日記・持ち物を、間接の家族にも共有しているか */
  legacyShareStatus: Record<string, boolean>;
};

export async function loadFamilySectionData(
  supabase: ServerClient,
  family: FamilyMember[]
): Promise<FamilySectionData> {
  const linkedUserIds = family
    .map((m) => m.linked_user_id)
    .filter((id): id is string => Boolean(id));

  const [familyShareSettings, linkedProfiles] = await Promise.all([
    getFamilyShareSettings(),
    linkedUserIds.length > 0
      ? supabase.from("profiles").select("id, is_deceased").in("id", linkedUserIds)
      : Promise.resolve({ data: [] as { id: string; is_deceased: boolean | null }[] }),
  ]);

  const deceasedStatus: Record<string, boolean> = {};
  for (const p of linkedProfiles.data ?? []) {
    deceasedStatus[p.id as string] = Boolean((p as { is_deceased?: boolean | null }).is_deceased);
  }

  const deceasedLinkedIds = linkedUserIds.filter((id) => deceasedStatus[id]);
  const legacyShareStatus: Record<string, boolean> = {};
  if (deceasedLinkedIds.length > 0) {
    const results = await Promise.all(deceasedLinkedIds.map((id) => getFamilyLegacyShare(id)));
    deceasedLinkedIds.forEach((id, i) => {
      legacyShareStatus[id] = results[i];
    });
  }

  return { familyShareSettings, deceasedStatus, legacyShareStatus };
}
