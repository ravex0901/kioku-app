import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutFamilyTree } from "../layout";
import { isClean, verifyLayout } from "../verify";
import { TreeBuilder, balancedTree } from "../fixtures";
import { SCENARIOS } from "./scenarios";
import type { LayoutResult, TreeInput } from "../types";

// 実行方法(ネットワーク不要):
//   tsx --test lib/familyTree/__tests__/*.test.ts
// すべてのシナリオで、少なくとも次を確認する:
//  - 正しい人物同士に線が引かれる(線は関係データから生成・欠落なし)
//  - 人物が重ならない/欠落しない/重複して表示されない
//  - 線がカードを貫通しない・同世代は同じ高さ・夫婦は隣り合う
//  - 線の交差がない

function posOf(layout: LayoutResult, id: string) {
  const n = layout.nodes.find((x) => x.id === id);
  assert.ok(n, `${id} が配置されていません`);
  return n;
}

describe("家系図レイアウト:基本の健全性(全シナリオ)", () => {
  for (const s of SCENARIOS) {
    it(s.title, () => {
      const layout = layoutFamilyTree(s.input);
      const report = verifyLayout(s.input, layout);
      assert.ok(
        isClean(report, s.allowCrossings ?? 0),
        `${s.title}: ${JSON.stringify(report).slice(0, 600)}`
      );
      // 保存済みの人物が欠落しない
      assert.equal(layout.nodes.length, s.input.persons.length);
      if (s.expectIssues) {
        const codes = new Set(layout.issues.map((i) => i.code));
        for (const c of s.expectIssues) assert.ok(codes.has(c as never), `${c} が検出されるはず`);
      }
    });
  }
});

describe("家系図レイアウト:世代と並び", () => {
  it("祖父母は上、父母はその下、子はさらに下、孫は最下段", () => {
    const s = SCENARIOS.find((x) => x.key === "t02") as (typeof SCENARIOS)[number];
    const L = layoutFamilyTree(s.input);
    const y = (id: string) => posOf(L, id).y;
    assert.ok(y("gf") < y("f"));
    assert.equal(y("f"), y("u"));
    assert.ok(y("f") < y("me"));
    assert.equal(y("me"), y("br"));
    assert.ok(y("me") < y("gc1"));
    assert.equal(y("gc1"), y("gc2"));
  });

  it("夫婦は隣接し、夫が左・妻が右(性別が分かる場合)", () => {
    const s = SCENARIOS.find((x) => x.key === "t01") as (typeof SCENARIOS)[number];
    const L = layoutFamilyTree(s.input);
    const f = posOf(L, "f");
    const m = posOf(L, "m");
    assert.ok(f.x < m.x);
    assert.equal(f.y, m.y);
  });

  it("子は親(夫婦)の真下付近に、親は子の中央に", () => {
    const s = SCENARIOS.find((x) => x.key === "t01") as (typeof SCENARIOS)[number];
    const L = layoutFamilyTree(s.input);
    const f = posOf(L, "f");
    const m = posOf(L, "m");
    const c = posOf(L, "c");
    const coupleCenter = (f.x + m.x + m.w) / 2;
    assert.ok(Math.abs(c.x + c.w / 2 - coupleCenter) < 1);
  });

  it("兄弟姉妹5人は左から出生順(続柄の順序)", () => {
    const s = SCENARIOS.find((x) => x.key === "t03") as (typeof SCENARIOS)[number];
    const L = layoutFamilyTree(s.input);
    const xs = [0, 1, 2, 3, 4].map((i) => posOf(L, `k${i}`).x);
    assert.deepEqual([...xs].sort((a, b) => a - b), xs);
    // 5人は親の下に横並び(同じ高さ)
    assert.equal(new Set([0, 1, 2, 3, 4].map((i) => posOf(L, `k${i}`).y)).size, 1);
  });

  it("birthOrder を指定すると並び順を変更できる", () => {
    const b = new TreeBuilder().person("f", "父").person("m", "母");
    b.person("a", "A", { birthOrder: 2 }).person("b", "B", { birthOrder: 1 }).person("c", "C", { birthOrder: 3 });
    b.family("f", "m", ["a", "b", "c"]);
    const L = layoutFamilyTree(b.build());
    assert.ok(posOf(L, "b").x < posOf(L, "a").x && posOf(L, "a").x < posOf(L, "c").x);
  });

  it("配偶者の実家(別の家系)が、配偶者の側に配置され交差しない", () => {
    const s = SCENARIOS.find((x) => x.key === "t99") as (typeof SCENARIOS)[number];
    const L = layoutFamilyTree(s.input);
    const sp = posOf(L, "sp");
    const spf = posOf(L, "spf");
    const me = posOf(L, "me");
    // 配偶者の父母の枠は、配偶者がいる側(本人から見て配偶者の側)にある
    assert.equal(Math.sign(spf.x - me.x), Math.sign(sp.x - me.x));
  });
});

describe("家系図特有の構造", () => {
  it("再婚:前妻(離婚)・父・後妻が一列に並び、離婚は斜線の線で区別される", () => {
    const s = SCENARIOS.find((x) => x.key === "t07") as (typeof SCENARIOS)[number];
    const L = layoutFamilyTree(s.input);
    const ids = ["X", "P", "Y"];
    const xs = ids.map((id) => posOf(L, id).x);
    assert.ok(xs[0] < xs[1] && xs[1] < xs[2]);
    const divorced = L.edges.find((e) => e.kind === "marriage" && e.style === "divorced");
    assert.ok(divorced, "離婚の線がある");
    assert.ok(divorced?.mark?.type === "slash");
    const married = L.edges.find((e) => e.kind === "marriage" && e.style === "marriage");
    assert.ok(married && married.segments.length === 2, "婚姻中は二重線");
    // 前妻の子は前妻との union から、後妻の子は後妻との union から出ている
    const edgeOfA = L.edges.find((e) => e.kind === "parentChild" && e.toIds.includes("a"));
    assert.deepEqual([...(edgeOfA?.fromIds ?? [])].sort(), ["P", "X"]);
    const edgeOfB = L.edges.find((e) => e.kind === "parentChild" && e.toIds.includes("b"));
    assert.deepEqual([...(edgeOfB?.fromIds ?? [])].sort(), ["P", "Y"]);
  });

  it("連れ子:後妻の子として後妻の下に置かれ、先妻の子とは別の親から出る", () => {
    const s = SCENARIOS.find((x) => x.key === "t07") as (typeof SCENARIOS)[number];
    const L = layoutFamilyTree(s.input);
    const e = L.edges.find((x) => x.kind === "parentChild" && x.toIds.includes("z"));
    assert.deepEqual(e?.fromIds, ["Y"]);
  });

  it("異父・異母兄弟:共通の親(母)の婚姻ごとに子が別の幹線から出る", () => {
    const s = SCENARIOS.find((x) => x.key === "t08") as (typeof SCENARIOS)[number];
    const L = layoutFamilyTree(s.input);
    const parentsOf = (child: string) =>
      [...(L.edges.find((e) => e.kind === "parentChild" && e.toIds.includes(child))?.fromIds ?? [])].sort();
    assert.deepEqual(parentsOf("a"), ["H1", "M"]);
    assert.deepEqual(parentsOf("b"), ["H2", "M"]);
    assert.deepEqual(parentsOf("c"), ["H2", "W"]);
  });

  it("養子縁組:実親と養親の両方から線が出る。養親の線は破線スタイル", () => {
    const s = SCENARIOS.find((x) => x.key === "t09") as (typeof SCENARIOS)[number];
    const L = layoutFamilyTree(s.input);
    const toChild = L.edges.filter((e) => e.kind === "parentChild" && e.toIds.includes("c"));
    assert.equal(toChild.length, 2);
    assert.ok(toChild.some((e) => e.style === "biological"));
    assert.ok(toChild.some((e) => e.style === "adoptive"));
    const sp = layoutFamilyTree(SCENARIOS.find((x) => x.key === "t09b")?.input as TreeInput);
    assert.ok(sp.edges.some((e) => e.style === "special_adoptive"));
  });

  it("親の片方が不明:判明している親1人から線が出る(不明な親を推測して作らない)", () => {
    const s = SCENARIOS.find((x) => x.key === "t10") as (typeof SCENARIOS)[number];
    const L = layoutFamilyTree(s.input);
    assert.equal(L.nodes.length, 4);
    const e = L.edges.find((x) => x.kind === "parentChild");
    assert.deepEqual(e?.fromIds, ["f"]);
    assert.equal(e?.toIds.length, 3);
  });

  it("親が不明の兄弟姉妹:同じ高さに並び、親を推測せず専用の線(親は未登録)で結ばれる", () => {
    const s = SCENARIOS.find((x) => x.key === "t10b") as (typeof SCENARIOS)[number];
    const L = layoutFamilyTree(s.input);
    assert.equal(L.edges.filter((e) => e.kind === "parentChild").length, 0);
    assert.ok(L.edges.some((e) => e.style === "sibling_unknown_parent"));
    const xs = ["br", "me", "sis"].map((id) => posOf(L, id).x);
    assert.deepEqual([...xs].sort((a, b) => a - b), xs, "兄・本人・妹の順(続柄の順)");
  });

  it("同姓同名の別人は、別人として2人表示する(名前で統合しない)", () => {
    const s = SCENARIOS.find((x) => x.key === "t13") as (typeof SCENARIOS)[number];
    const L = layoutFamilyTree(s.input);
    assert.equal(L.nodes.filter((n) => n.person.name === "山田 太郎").length, 2);
  });

  it("矛盾した関係は表示から除外して確認事項に出し、他の人は欠落しない", () => {
    const s = SCENARIOS.find((x) => x.key === "t19") as (typeof SCENARIOS)[number];
    const L = layoutFamilyTree(s.input);
    assert.equal(L.nodes.length, 5);
    const codes = L.issues.map((i) => i.code);
    assert.ok(codes.includes("parent_cycle"));
    assert.ok(codes.includes("too_many_parents"));
    assert.ok(codes.includes("self_relation"));
    // 元データ(入力)は変更されない
    assert.equal(s.input.parentChild.length, 6);
  });

  it("親子なのに婚姻として登録(世代が違う婚姻)は線を引かず確認事項にする", () => {
    const s = SCENARIOS.find((x) => x.key === "t14") as (typeof SCENARIOS)[number];
    const L = layoutFamilyTree(s.input);
    assert.ok(L.issues.some((i) => i.code === "marriage_generation_gap"));
    assert.ok(!L.edges.some((e) => e.kind === "marriage"));
  });
});

describe("規模と性能", () => {
  it("125人・6世代でも 1秒未満で配置でき、重ならず交差もしない", () => {
    const input = balancedTree(6, 3).build();
    const t = performance.now();
    const L = layoutFamilyTree(input);
    const ms = performance.now() - t;
    assert.ok(ms < 1000, `${ms}ms`);
    assert.ok(input.persons.length >= 100);
    assert.ok(isClean(verifyLayout(input, L)));
  });

  it("200人規模(3人きょうだいを多く含む)でも破綻しない", () => {
    const input = balancedTree(7, 3).build();
    const t = performance.now();
    const L = layoutFamilyTree(input);
    assert.ok(performance.now() - t < 3000);
    assert.ok(input.persons.length >= 200);
    assert.ok(isClean(verifyLayout(input, L), 0));
  });
});

describe("更新・再描画の安定性", () => {
  it("同じ入力なら毎回同じ配置(ページ更新後の配置が変わらない)", () => {
    const input = balancedTree(4, 3).build();
    const a = layoutFamilyTree(input);
    const b = layoutFamilyTree(JSON.parse(JSON.stringify(input)));
    assert.deepEqual(
      a.nodes.map((n) => [n.id, n.x, n.y]),
      b.nodes.map((n) => [n.id, n.x, n.y])
    );
  });

  it("データの並び順(読み込み順)が違っても、同じ配置になる(同時編集・再取得でぶれない)", () => {
    const input = balancedTree(4, 3).build();
    const shuffled: TreeInput = {
      ...input,
      persons: [...input.persons].reverse(),
      parentChild: [...input.parentChild].reverse(),
      marriages: [...input.marriages].reverse(),
    };
    const a = layoutFamilyTree(input);
    const b = layoutFamilyTree(shuffled);
    const mapA = new Map(a.nodes.map((n) => [n.id, `${n.x},${n.y}`]));
    for (const n of b.nodes) assert.equal(`${n.x},${n.y}`, mapA.get(n.id), n.id);
  });

  it("人物を追加しても、無関係な人物の左右の並び順は変わらない", () => {
    const base = new TreeBuilder();
    base.person("f", "父").person("m", "母").person("a", "A").person("b", "B").person("c", "C");
    base.family("f", "m", ["a", "b", "c"]);
    base.person("x", "別家族の人").person("y", "別家族の配偶者").marry("x", "y");
    base.viewer("a");
    const before = layoutFamilyTree(base.build());
    const prevX: Record<string, number> = {};
    for (const n of before.nodes) prevX[n.id] = n.x;

    // 新しい子を追加
    base.person("d", "D").child(["f", "m"], "d");
    const after = layoutFamilyTree(base.build(), { previousX: prevX });
    const order = (L: LayoutResult, ids: string[]) =>
      [...ids].sort((p, q) => posOf(L, p).x - posOf(L, q).x);
    const ids = ["a", "b", "c"];
    assert.deepEqual(order(after, ids), order(before, ids));
    // 追加した人物以外の同じ家族の高さは変わらない
    for (const id of ["f", "m", "a", "b", "c", "x", "y"]) assert.equal(posOf(after, id).y, posOf(before, id).y);
    assert.ok(isClean(verifyLayout(base.build(), after)));
  });

  it("削除後も整合する(人物と関係を消しても、残りの家系図が壊れない)", () => {
    const b = balancedTree(4, 3).build();
    const removed = b.persons[5].id;
    const input: TreeInput = {
      ...b,
      persons: b.persons.filter((p) => p.id !== removed),
      parentChild: b.parentChild.filter((r) => r.parentId !== removed && r.childId !== removed),
      marriages: b.marriages.filter((r) => r.a !== removed && r.b !== removed),
    };
    const L = layoutFamilyTree(input);
    assert.ok(isClean(verifyLayout(input, L)));
    assert.equal(L.nodes.length, input.persons.length);
  });

  it("関係が存在しない人物を指す関係は、描画から除外して確認事項にする(他は崩れない)", () => {
    const b = new TreeBuilder().person("f", "父").person("c", "子").family("f", "ghost", ["c"]);
    const L = layoutFamilyTree(b.build());
    assert.ok(L.issues.some((i) => i.code === "unknown_person"));
    assert.equal(L.nodes.length, 2);
  });
});

describe("世代の目安(線は引かない)", () => {
  it("祖父母だけを登録しても、親が分からないので線は引かず、世代の行だけ揃う", () => {
    const b = new TreeBuilder().person("me", "本人").person("gf", "祖父").person("c", "子");
    b.child("me", "c").hint("me", "gf", -2).viewer("me");
    const L = layoutFamilyTree(b.build());
    assert.ok(posOf(L, "gf").y < posOf(L, "me").y);
    assert.ok(posOf(L, "me").y < posOf(L, "c").y);
    assert.equal(L.edges.filter((e) => e.fromIds.includes("gf")).length, 0);
  });

  it("世代の目安が親子関係と食い違う場合は、矛盾として報告し、関係データを優先する", () => {
    const b = new TreeBuilder().person("a", "A").person("b", "B");
    b.child("a", "b").hint("b", "a", -5).viewer("b");
    const L = layoutFamilyTree(b.build());
    assert.ok(L.issues.some((i) => i.code === "relation_label_conflict"));
    assert.ok(posOf(L, "a").y < posOf(L, "b").y);
  });
});
