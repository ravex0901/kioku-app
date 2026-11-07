import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTreeInput } from "../fromRows";
import type { AccountNode, FamilyRow } from "../fromRows";
import { layoutFamilyTree } from "../layout";
import { isClean, verifyLayout } from "../verify";
import type { LayoutResult } from "../types";

// アカウント連携・同一人物の判定・権限・矛盾データのテスト(データベースの行 → 家系図)。

let rowSeq = 0;
function row(
  ownerId: string,
  relation: string,
  target: { linked?: string; name?: string },
  extra: Partial<FamilyRow> = {}
): FamilyRow {
  rowSeq += 1;
  return {
    id: `row${String(rowSeq).padStart(3, "0")}`,
    ownerId,
    name: target.name ?? target.linked ?? "?",
    relation,
    linkedUserId: target.linked ?? null,
    createdAt: 1000 + rowSeq,
    ...extra,
  };
}
const acc = (userId: string, name = userId, extra: Partial<AccountNode> = {}): AccountNode => ({
  userId,
  name,
  ...extra,
});

function build(viewerId: string, rows: FamilyRow[], accounts: AccountNode[]) {
  return buildTreeInput({ viewerId, viewerName: accounts.find((a) => a.userId === viewerId)?.name ?? viewerId, rows, accounts });
}
function layoutOk(input: ReturnType<typeof build>, allowCrossings = 0): LayoutResult {
  const L = layoutFamilyTree(input);
  const r = verifyLayout(input, L);
  assert.ok(isClean(r, allowCrossings), JSON.stringify(r).slice(0, 500));
  return L;
}
const pid = (u: string) => `a:${u}`;
const hasEdge = (L: LayoutResult, parent: string, child: string) =>
  L.edges.some((e) => e.kind === "parentChild" && e.fromIds.includes(pid(parent)) && e.toIds.includes(pid(child)));

describe("11. アカウント連携による家系図の統合", () => {
  // A-B(親子)、C-D(親子)がそれぞれ連携済み。A と C が新たに連携する。
  const base = [
    row("A", "son", { linked: "B" }),
    row("B", "father", { linked: "A" }),
    row("C", "daughter", { linked: "D" }),
    row("D", "mother", { linked: "C" }),
  ];
  const accounts = [acc("A"), acc("B"), acc("C"), acc("D")];

  it("連携前:Aから見えるのは A と B だけ", () => {
    const input = build("A", base.slice(0, 2), [acc("A"), acc("B")]);
    assert.equal(input.persons.length, 2);
    const L = layoutOk(input);
    assert.ok(hasEdge(L, "A", "B"));
  });

  it("AとCが兄弟として連携:A・B・C・Dが全員表示され、親子の線は実際の関係だけ。BとDを関連づけない", () => {
    const rows = [
      ...base,
      row("A", "older_sister", { linked: "C" }),
      row("C", "younger_brother", { linked: "A" }),
    ];
    const input = build("A", rows, accounts);
    assert.equal(input.persons.length, 4);
    const L = layoutOk(input);
    assert.ok(hasEdge(L, "A", "B"));
    assert.ok(hasEdge(L, "C", "D"));
    assert.ok(!hasEdge(L, "A", "D") && !hasEdge(L, "C", "B"));
    assert.ok(L.edges.some((e) => e.style === "sibling_unknown_parent"));
    assert.equal(new Set(L.nodes.map((n) => n.id)).size, 4);
  });

  it("続柄が「その他」のつながりでは、親子・兄弟・夫婦を推定しない(別枠で表示)", () => {
    const rows = [...base, row("A", "other", { linked: "C" }), row("C", "other", { linked: "A" })];
    const input = build("A", rows, accounts);
    assert.equal(input.persons.length, 4);
    assert.equal(input.parentChild.length, 2); // A→B と C→D だけ
    assert.equal(input.marriages.length, 0);
    assert.equal(input.siblings.length, 0);
    const L = layoutOk(input);
    assert.ok(L.bands.length >= 2, "つながりが未確認の家族は別枠");
    assert.ok(!L.edges.some((e) => e.fromIds.includes(pid("A")) && e.toIds.includes(pid("C"))));
  });

  it("12. 統合後に E・F を追加(B が E と夫婦、E の父が F):全員が正しく表示される", () => {
    const rows = [
      ...base,
      row("A", "older_sister", { linked: "C" }),
      row("C", "younger_brother", { linked: "A" }),
      row("B", "spouse", { linked: "E" }),
      row("E", "spouse", { linked: "B" }),
      row("E", "father", { linked: "F" }),
      row("F", "daughter", { linked: "E" }),
    ];
    const input = build("A", rows, [...accounts, acc("E"), acc("F")]);
    assert.equal(input.persons.length, 6);
    const L = layoutOk(input);
    assert.ok(hasEdge(L, "F", "E"));
    assert.ok(hasEdge(L, "A", "B"));
    const b = L.nodes.find((n) => n.id === pid("B"));
    const e = L.nodes.find((n) => n.id === pid("E"));
    assert.equal(b?.y, e?.y, "夫婦は同じ高さ");
    assert.ok(L.edges.some((x) => x.kind === "marriage" && x.fromIds.concat(x.toIds).includes(pid("E"))));
  });
});

describe("14. 同一人物の判定(アカウントIDのみ)", () => {
  it("同じアカウントが複数の行から参照されても1人として表示する", () => {
    const rows = [
      row("A", "son", { linked: "B" }),
      row("B", "father", { linked: "A" }),
      row("C", "daughter", { linked: "B" }), // CもBを子として登録
    ];
    const input = build("A", rows, [acc("A"), acc("B"), acc("C")]);
    assert.equal(input.persons.filter((p) => p.accountId === "B").length, 1);
  });

  it("同姓同名でも、アカウントが違えば別人。未紐づけの同名の人も自動統合しない", () => {
    const rows = [
      row("A", "son", { linked: "B" }),
      row("A", "son", { name: "山田 太郎" }), // 未紐づけ
    ];
    const input = build("A", rows, [acc("A"), acc("B", "山田 太郎")]);
    assert.equal(input.persons.length, 3);
    assert.equal(input.persons.filter((p) => p.name === "山田 太郎").length, 2);
    const L = layoutOk(input);
    assert.equal(L.nodes.filter((n) => n.person.name === "山田 太郎").length, 2);
  });

  it("未紐づけの人(同じ家族リストの2人)は、名前が同じでも2人のまま", () => {
    const rows = [row("A", "son", { name: "太郎" }), row("A", "son", { name: "太郎" })];
    const input = build("A", rows, [acc("A")]);
    assert.equal(input.persons.filter((p) => p.name === "太郎").length, 2);
  });
});

describe("18. 権限のないユーザー・情報の扱い", () => {
  it("閲覧できないアカウントは、名前も関係も結果に含まれない", () => {
    const rows = [
      row("A", "son", { linked: "B" }),
      row("B", "son", { linked: "SECRET" }), // Bの子:Aには見えない人
      row("SECRET", "father", { linked: "B" }),
    ];
    const input = build("A", rows, [acc("A"), acc("B")]); // SECRET は権限なし
    assert.ok(!JSON.stringify(input).includes("SECRET"));
    const L = layoutOk(input);
    assert.equal(L.nodes.length, 2);
  });

  it("他の人が登録した未紐づけの家族は表示しない(閲覧者自身が登録した人だけ)", () => {
    const rows = [
      row("A", "son", { linked: "B" }),
      row("B", "son", { name: "Bの非公開の子" }), // 未紐づけ(Bだけが知る情報)
    ];
    const input = build("A", rows, [acc("A"), acc("B")]);
    assert.ok(!input.persons.some((p) => p.name.includes("非公開")));
  });

  it("日記へのリンクは、閲覧権限(canViewJournal)がある人にだけ付く", () => {
    const rows = [row("A", "son", { linked: "B" }), row("A", "daughter", { linked: "C" })];
    const input = build("A", rows, [acc("A"), acc("B", "B", { canViewJournal: true }), acc("C", "C", { canViewJournal: false })]);
    assert.equal(input.persons.find((p) => p.id === pid("B"))?.href, "/journal/view/B");
    assert.equal(input.persons.find((p) => p.id === pid("C"))?.href, undefined);
  });
});

describe("20. 登録・削除・再連携後の整合性", () => {
  it("連携を解除すると家系図から外れ、再連携すると同じ配置に戻る", () => {
    const linked = [
      row("A", "son", { linked: "B" }),
      row("B", "father", { linked: "A" }),
      row("A", "spouse", { linked: "S" }),
      row("S", "spouse", { linked: "A" }),
    ];
    const accounts = [acc("A"), acc("B"), acc("S")];
    const before = layoutOk(build("A", linked, accounts));
    const unlinked = layoutOk(build("A", linked.slice(0, 2), [acc("A"), acc("B")]));
    assert.equal(unlinked.nodes.length, 2);
    const after = layoutOk(build("A", linked, accounts));
    assert.deepEqual(
      after.nodes.map((n) => [n.id, n.x, n.y]),
      before.nodes.map((n) => [n.id, n.x, n.y])
    );
  });

  it("同じ人物が配偶者としても子としても登録される矛盾は、確認事項になり、描画は崩れない", () => {
    const rows = [row("A", "spouse", { linked: "B" }), row("A", "son", { linked: "B" })];
    const input = build("A", rows, [acc("A"), acc("B")]);
    const L = layoutFamilyTree(input);
    assert.ok(L.issues.length >= 1);
    assert.equal(L.nodes.length, 2);
    assert.ok(isClean(verifyLayout(input, L)));
  });
});

describe("実データの構造(匿名化)に対する検証:矛盾を含む本番相当のデータ", () => {
  // 本番DBにある、互いに矛盾する登録(AがBの息子かつBがAの息子、続柄の食い違い など)を
  // 匿名化して再現したもの。壊れず、矛盾は確認事項に出し、全員が表示されること。
  const U = { t: "u-test", p: "u-parent", mo: "u-mother", gp: "u-gp", k1: "u-kid1", k2: "u-kid2" };
  const rows: FamilyRow[] = [
    row(U.t, "daughter", { name: "未登録の娘" }),
    row(U.gp, "eldest_son", { linked: U.t }),
    row(U.gp, "eldest_son", { name: "未登録の長男" }),
    row(U.t, "father", { linked: U.p }),
    row(U.t, "grandfather", { name: "未登録の祖父" }),
    row(U.t, "grandmother", { name: "未登録の祖母" }),
    row(U.t, "great_grandfather", { linked: U.gp }),
    row(U.gp, "son", { linked: U.k1 }),
    row(U.gp, "son", { linked: U.k2 }),
    row(U.t, "son", { name: "未登録の息子A" }),
    row(U.t, "son", { name: "未登録の息子B" }),
    row(U.t, "spouse", { name: "未登録の配偶者" }),
    row(U.k2, "son", { linked: U.gp }),
    row(U.mo, "other", { linked: U.p }),
    row(U.k1, "uncle", { linked: U.gp }),
    row(U.p, "other", { linked: U.t }),
    row(U.p, "spouse", { linked: U.mo }),
  ];
  const accounts = [U.t, U.p, U.mo, U.gp, U.k1, U.k2].map((u) => acc(u));

  it("全員が表示され、矛盾(循環・続柄の食い違い)は確認事項として報告される", () => {
    const input = build(U.t, rows, accounts);
    const L = layoutFamilyTree(input);
    const r = verifyLayout(input, L);
    assert.ok(isClean(r, 0), JSON.stringify(r).slice(0, 400));
    const codes = new Set(L.issues.map((i) => i.code));
    assert.ok(codes.has("parent_cycle"), "AがBの親かつ子 → 循環");
    assert.ok(codes.has("relation_label_conflict") || codes.has("generation_conflict"), "続柄の食い違い");
    assert.equal(L.nodes.length, input.persons.length);
    // 閲覧者本人が先頭の枠に表示される
    assert.equal(L.nodes.find((n) => n.id === pid(U.t))?.bandIndex, 0);
  });
});
