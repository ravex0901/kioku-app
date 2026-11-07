import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { FamilyTreeClient } from "@/components/FamilyTreeClient";
import { FamilyTreeWithRelations, type PersonOption } from "@/components/FamilyTreeWithRelations";
import { familyRelationLabel } from "@/lib/constants";
import { buildTreeInput, type FamilyRow } from "@/lib/familyTree/fromRows";
import { getFamilyTreeGraph } from "@/app/actions/familyTree";
import { listFamilyRelationships } from "@/app/actions/familyRelationships";
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
  const family = allFamily.filter((f) => f.linked_user_id);
  // 承認済みのつながりをたどって合流した家族ネットワーク全体(本人を含む)。
  // 本人同士が代々つながっていくほど、ここに増えていく。どこで紐づけが起きても、
  // このネットワークに入っている全員に(本人が何もしなくても)自動的に反映される。
  const graph = graphResult.ok
    ? {
        selfUserId: graphResult.selfUserId,
        nodes: graphResult.nodes,
        edges: graphResult.edges,
      }
    : undefined;

  // 新しい家系図(関係データから線を引く日本式の縦型)。
  // 取得できたつながり(承認済みのもののみ)を、家系図エンジンの入力に変換する。
  let treeProps: {
    rows: FamilyRow[];
    accounts: { userId: string; name: string; isDeceased?: boolean; canViewJournal?: boolean }[];
    memberRows: FamilyRow[];
    people: PersonOption[];
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

      // 関係の登録で選べる人:ご本人・家系図に出ているアカウントの方・ご本人が登録した家族
      const relationByAccount = new Map(
        family.map((f) => [f.linked_user_id as string, familyRelationLabel(f.relation)])
      );
      const people: PersonOption[] = [
        { key: `a:${user.id}`, ref: { accountId: user.id }, label: `${displayName}(ご本人)` },
        ...accounts
          .filter((a) => a.userId !== user.id)
          .map((a) => {
            const rel = relationByAccount.get(a.userId);
            return {
              key: `a:${a.userId}`,
              ref: { accountId: a.userId },
              label: rel ? `${a.name}(${rel})` : a.name,
            };
          }),
        ...memberRows.map((r) => ({
          key: `m:${r.id}`,
          ref: { memberId: r.id },
          label: `${r.name}(${familyRelationLabel(r.relation)}・アプリ未利用)`,
        })),
      ];

      treeProps = { rows, accounts, memberRows, people };
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
            people={treeProps.people}
            saved={relResult && relResult.ok ? relResult.relationships : []}
            available={Boolean(relResult && relResult.ok && relResult.available)}
            editHref="/settings#family"
          />
        ) : (
          <FamilyTreeClient
            displayName={displayName}
            family={family}
            graph={graph}
          />
        )}
      </main>
    </div>
  );
}
