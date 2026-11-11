import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { FamilyTreeClient } from "@/components/FamilyTreeClient";
import { FamilyTreeWithRelations } from "@/components/FamilyTreeWithRelations";
import { familyRelationLabel } from "@/lib/constants";
import { buildTreeInput, type FamilyRow } from "@/lib/familyTree/fromRows";
import { getFamilyTreeGraph } from "@/app/actions/familyTree";
import { listFamilyRelationships } from "@/app/actions/familyRelationships";
import { syncAutoFamily } from "@/app/actions/familyAutoLink";
import { computeKinship } from "@/lib/familyTree/kinship";
import { FamilySection } from "@/components/FamilySection";
import { loadFamilySectionData } from "@/lib/familySectionData";
import type { FamilyMember } from "@/lib/types";

export default async function FamilyTreePage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // ?legacy=1 で、従来の表示に戻せる(切り替え直後の安全策)
  const sp = (await searchParams) ?? {};
  const legacy = sp.legacy === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 家系図の範囲内で、まだ家族欄にいない人を自動で加える(双方の家族欄に入る)。
  // 失敗しても家系図は表示する。
  if (!legacy) {
    const sync = await syncAutoFamily();
    if (!sync.ok) console.error("syncAutoFamily failed", sync.error);
  }

  const [{ data: profile }, { data: familyData }, graphResult, relResult] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      // 本人が登録した家族(アカウントのない人も含む)。
      // 「アカウントIDで申請する」等でまだ相手が許可していないつながりは、
      // linked_user_id が入るまで、続柄だけでは家系図に表示しない(下の linkedFamily)。
      supabase
        .from("family_members")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      getFamilyTreeGraph(),
      legacy ? Promise.resolve(null) : listFamilyRelationships(),
    ]);

  const rawName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : "";
  const displayName =
    profile?.name || rawName || user.email?.split("@")[0] || "ご本人";
  const allFamily = (familyData ?? []) as FamilyMember[];
  // 図の下の「家族」の欄(もとは設定画面にあったもの)。新しく登録した人から並べる。
  const sectionData = await loadFamilySectionData(supabase, allFamily);
  const family = allFamily.filter((f) => f.linked_user_id);
  // 承認済みのつながりをたどって合流した家族ネットワーク全体(本人を含む)。
  // 本人同士が代々つながっていくほど、ここに増えていく。どこで紐づけが起きても、
  // このネットワークに入っている全員に(本人が何もしなくても)自動的に反映される。
  // 家系図に出すのは範囲内の人だけ(lib/familyTree/kinship.ts):
  // 本人の曽祖父母〜曾孫(子や孫の配偶者)、おじおば・いとこ・甥姪、兄弟とその配偶者、配偶者の親・兄弟・祖父母。
  // ただし、本人が「離婚・どの方との子か」などを登録したアカウントの人は、範囲外でも出す。
  const explicitAccounts = new Set<string>();
  if (relResult && relResult.ok) {
    for (const r of relResult.relationships) {
      if (r.a.accountId) explicitAccounts.add(r.a.accountId);
      if (r.b.accountId) explicitAccounts.add(r.b.accountId);
    }
  }
  const graph = graphResult.ok
    ? (() => {
        const kin = computeKinship(user.id, graphResult.edges);
        // 本人が直接つながっている人は、続柄が「その他」でも必ず出す
        const direct = family.map((f) => f.linked_user_id as string);
        const keep = new Set([...kin.keys(), ...explicitAccounts, ...direct, user.id]);
        return {
          selfUserId: graphResult.selfUserId,
          nodes: graphResult.nodes.filter((n) => keep.has(n.userId)),
          edges: graphResult.edges.filter((e) => keep.has(e.fromUserId) && keep.has(e.toUserId)),
        };
      })()
    : undefined;

  // 新しい家系図(関係データから線を引く日本式の縦型)。
  // 取得できたつながり(承認済みのもののみ)を、家系図エンジンの入力に変換する。
  let treeProps: {
    rows: FamilyRow[];
    accounts: { userId: string; name: string; isDeceased?: boolean; canViewJournal?: boolean }[];
    memberRows: FamilyRow[];
    alwaysShowMemberIds: string[];
  } | null = null;
  if (!legacy) {
    try {
      const rows: FamilyRow[] = graph
        ? graph.edges.map((e) => ({
            id: `e:${e.fromUserId}:${e.toUserId}`,
            ownerId: e.fromUserId,
            name: "",
            relation: e.relation,
            linkedUserId: e.toUserId,
          }))
        : family.map((f) => ({
            id: f.id,
            ownerId: user.id,
            name: f.name,
            relation: f.relation,
            linkedUserId: f.linked_user_id ?? null,
            createdAt: f.created_at,
          }));
      const accounts = graph
        ? graph.nodes.map((n) => ({
            userId: n.userId,
            name: n.name,
            isDeceased: n.isDeceased,
            canViewJournal: n.canViewJournal,
          }))
        : family
            .filter((f) => f.linked_user_id)
            .map((f) => ({ userId: f.linked_user_id as string, name: f.name }));
      // ここで一度作ってみて、失敗したら従来の表示に切り替える(画面側でも同じ材料から作り直す)
      buildTreeInput({
        viewerId: user.id,
        viewerName: displayName,
        rows,
        accounts,
        relationLabel: familyRelationLabel,
      });

      // アカウントのない家族:関係(離婚・どの方との子か等)を登録したときだけ家系図に出す
      const memberRows: FamilyRow[] = allFamily
        .filter((f) => !f.linked_user_id)
        .map((f) => ({
          id: f.id,
          ownerId: user.id,
          name: f.name,
          relation: f.relation,
          linkedUserId: null,
          createdAt: f.created_at,
        }));

      // 招待リンクのない、アカウントのない家族 = 家系図に残すために登録した方
      // (前の配偶者・「紐づけを解除」で削除したときに残した方)。家系図にいつも出す。
      const alwaysShowMemberIds = allFamily
        .filter((f) => !f.linked_user_id && !f.invite_token)
        .map((f) => f.id);

      treeProps = { rows, accounts, memberRows, alwaysShowMemberIds };
    } catch (e) {
      // 新しい家系図の作成に失敗しても、従来の表示で見られるようにする
      console.error("buildTreeInput failed", e);
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <BackButton />
        <h1 className="mb-1 mt-4 font-serif-jp text-3xl font-bold text-ink">
          家系図
        </h1>
        <p className="mb-6 text-lg text-ink/60">
          登録されたご家族の情報から、家系図を自動でつくります。ご家族がさらに別の方とつながると、ここにも代々広がっていきます。
        </p>
        {treeProps ? (
          <FamilyTreeWithRelations
            viewerId={user.id}
            viewerName={displayName}
            rows={treeProps.rows}
            accounts={treeProps.accounts}
            memberRows={treeProps.memberRows}
            alwaysShowMemberIds={treeProps.alwaysShowMemberIds}
            saved={relResult && relResult.ok ? relResult.relationships : []}
          />
        ) : (
          <FamilyTreeClient
            displayName={displayName}
            family={family}
            graph={graph}
          />
        )}

        <div className="mt-8">
          <FamilySection
            userId={user.id}
            accountCode={profile?.account_code ?? null}
            initialFamily={[...allFamily].reverse()}
            initialFamilyShareSettings={sectionData.familyShareSettings}
            initialDeceasedStatus={sectionData.deceasedStatus}
            initialLegacyShareStatus={sectionData.legacyShareStatus}
            linkedGenders={sectionData.linkedGenders}
          />
        </div>
      </main>
    </div>
  );
}
