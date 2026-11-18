import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  /** つながっている相手の性別(続柄の選択肢をしぼるため。本人の設定画面以外には出さない) */
  linkedGenders: Record<string, string>;
  /** 離縁して、お互いに写真・日記などが見えない相手 */
  blockedIds: string[];
  /**
   * 直接つながっている相手(招待・申請の承認・本人の登録でつながった人)。
   * 家系図の自動追加だけでつながった人(双方の行とも招待トークンなし)は入らない。
   * 故人の「間接のご家族にも共有する」は、この人たちだけが変えられる(2026-11-18 オーナー決定)。
   */
  directIds: string[];
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

  // 性別は本人しか読めない表にあるため、サーバー側の管理用クライアントで読む(画面には続柄の選択肢としてだけ使う)
  const linkedGenders: Record<string, string> = {};
  // 自分の行に招待トークンがあれば直接。なければ相手の行(相手 → 自分)を見る
  const directIds = family.filter((m) => m.linked_user_id && m.invite_token).map((m) => m.linked_user_id as string);
  const admin = createAdminClient();
  if (admin && linkedUserIds.length > 0) {
    const ownerId = family[0]?.user_id;
    const [{ data }, { data: theirs }] = await Promise.all([
      admin.from("profile_details").select("user_id, gender").in("user_id", linkedUserIds),
      ownerId
        ? admin
            .from("family_members")
            .select("user_id, invite_token")
            .in("user_id", linkedUserIds)
            .eq("linked_user_id", ownerId)
        : Promise.resolve({ data: [] as { user_id: string; invite_token: string | null }[] }),
    ]);
    for (const d of data ?? []) {
      if (d.gender === "male" || d.gender === "female") linkedGenders[d.user_id] = d.gender;
    }
    for (const t of theirs ?? []) {
      if (t.invite_token && !directIds.includes(t.user_id)) directIds.push(t.user_id);
    }
  }

  // 離縁した相手(本人の行だけ読める)。表がまだないときは空のまま
  const { data: blocks } = await supabase.from("family_content_blocks").select("other_user_id");
  const blockedIds = (blocks ?? []).map((b) => b.other_user_id as string);

  return { familyShareSettings, deceasedStatus, legacyShareStatus, linkedGenders, blockedIds, directIds };
}
