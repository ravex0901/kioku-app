import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTreeInput } from "../fromRows";
import type { ExplicitRelRow, FamilyRow } from "../fromRows";
import { layoutFamilyTree } from "../layout";
import { isClean, verifyLayout } from "../verify";

// 明示的な親族関係(family_relationships)のテスト。
// 離婚・再婚・「どの配偶者との子か」を、家族の登録画面から入れたときの描画を確かめる。

const V = "viewer";
const self = { accountId: V };
const mem = (memberId: string) => ({ memberId });

function row(id: string, relation: string, name: string, linked: string | null = null): FamilyRow {
  return { id, ownerId: V, name, relation, linkedUserId: linked, createdAt: id.charCodeAt(id.length - 1) };
}

function build(rows: FamilyRow[], explicit: ExplicitRelRow[]) {
  return buildTreeInput({ viewerId: V, viewerName: "本人", rows, accounts: [], explicit });
}

describe("明示的な親族関係:離婚した相手との間の子", () => {
  // 本人は前の妻(X)と離婚し、今の妻(Y)と再婚。X との子 a、Y との子 b がいる。
  const rows = [
    row("mX", "other", "前の妻"),
    row("mY", "spouse", "今の妻"),
    row("ma", "son", "前の妻との息子"),
    row("mb", "daughter", "今の妻との娘"),
  ];
  const explicit: ExplicitRelRow[] = [
    { id: "r1", type: "marriage", a: self, b: mem("mX"), marriageStatus: "divorced", marriageOrder: 1 },
    { id: "r2", type: "marriage", a: self, b: mem("mY"), marriageStatus: "married", marriageOrder: 2 },
    { id: "r3", type: "parent_child", a: mem("mX"), b: mem("ma"), parentKind: "biological" },
    { id: "r4", type: "parent_child", a: mem("mY"), b: mem("mb"), parentKind: "biological" },
  ];
  const input = build(rows, explicit);
  const L = layoutFamilyTree(input);

  it("きれいに描ける(線の重なり・はみ出しがない)", () => {
    const r = verifyLayout(input, L);
    assert.ok(isClean(r), JSON.stringify(r).slice(0, 500));
  });

  it("前の妻との線は「離婚」、今の妻との線は「婚姻中」になる", () => {
    // 夫婦の線は、2人を fromIds / toIds に1人ずつ持つ
    const styleWith = (other: string) =>
      L.edges.find((e) => {
        const ids = [...e.fromIds, ...e.toIds];
        return e.kind === "marriage" && ids.includes(`a:${V}`) && ids.includes(`m:${other}`);
      })?.style;
    assert.equal(styleWith("mX"), "divorced");
    assert.equal(styleWith("mY"), "marriage");
  });

  it("前の妻との子は、本人と前の妻の2人の下にぶら下がる", () => {
    const e = L.edges.find((x) => x.kind === "parentChild" && x.toIds.includes("m:ma"));
    assert.ok(e, "前の妻との子の線がない");
    assert.deepEqual([...e.fromIds].sort(), [`a:${V}`, "m:mX"].sort());
  });

  it("今の妻との子は、本人と今の妻の2人の下にぶら下がる", () => {
    const e = L.edges.find((x) => x.kind === "parentChild" && x.toIds.includes("m:mb"));
    assert.ok(e, "今の妻との子の線がない");
    assert.deepEqual([...e.fromIds].sort(), [`a:${V}`, "m:mY"].sort());
  });

  it("前の妻は本人の左、今の妻は右に並ぶ", () => {
    const x = (id: string) => L.nodes.find((n) => n.id === id)?.x ?? NaN;
    assert.ok(x("m:mX") < x(`a:${V}`), "前の妻が本人の左にない");
    assert.ok(x(`a:${V}`) < x("m:mY"), "今の妻が本人の右にない");
  });
});

describe("明示的な親族関係:続柄の登録より優先される", () => {
  it("「配偶者」で登録した人を「離婚」にすると、婚姻中の線は残らない", () => {
    const input = build(
      [row("mX", "spouse", "元の夫")],
      [{ id: "r1", type: "marriage", a: self, b: mem("mX"), marriageStatus: "divorced" }]
    );
    const pair = input.marriages.filter((m) => [m.a, m.b].includes("m:mX"));
    assert.equal(pair.length, 1);
    assert.equal(pair[0].status, "divorced");
  });

  it("登録されていない家族(行がない人)を指す関係は、無視される", () => {
    const input = build(
      [row("mX", "other", "前の妻")],
      [{ id: "r1", type: "parent_child", a: mem("mX"), b: mem("unknown"), parentKind: "biological" }]
    );
    assert.equal(input.parentChild.length, 0);
    assert.equal(input.persons.length, 2);
  });
});
