import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeUnlink } from "../unlinkImpact";

// 「紐づけを解除」したときに、家系図から一緒に消えてしまう人(その先でつながっている人)を割り出すテスト。
// edges は家系図ネットワーク(get_family_tree_graph)と同じ形:from から見た to の続柄。

const E = (fromUserId: string, toUserId: string, relation: string) => ({ fromUserId, toUserId, relation });
const N = (userId: string, name = userId) => ({ userId, name });

describe("紐づけ解除の影響", () => {
  // 本人(me)と元妻(ex)。元妻の母(exMom)と、元妻とだけつながっている子(kid)がいる。
  const nodes = [N("me", "本人"), N("ex", "花子"), N("exMom", "花子の母"), N("kid", "太郎")];
  const edges = [
    E("me", "ex", "spouse"),
    E("ex", "me", "other"),
    E("ex", "exMom", "mother"),
    E("exMom", "ex", "daughter"),
    E("ex", "kid", "son"),
    E("kid", "ex", "mother"),
  ];

  it("相手を通じてだけつながっている人は、一緒に消える人として出る", () => {
    const r = analyzeUnlink({ viewerId: "me", removedId: "ex", removedRelation: "spouse", nodes, edges });
    assert.equal(r.removedStillConnected, false);
    assert.deepEqual(r.dependents.map((d) => d.userId).sort(), ["exMom", "kid"]);
  });

  it("残すときの続柄:配偶者の息子 → 本人の息子、配偶者の母 → その他", () => {
    const r = analyzeUnlink({ viewerId: "me", removedId: "ex", removedRelation: "spouse", nodes, edges });
    const rel = Object.fromEntries(r.dependents.map((d) => [d.userId, d.suggestedRelation]));
    assert.equal(rel.kid, "son");
    assert.equal(rel.exMom, "other");
  });

  it("子が本人とも直接つながっていれば、子は消えない。相手も子を通じて残る", () => {
    const r = analyzeUnlink({
      viewerId: "me",
      removedId: "ex",
      removedRelation: "spouse",
      nodes,
      edges: [...edges, E("me", "kid", "son"), E("kid", "me", "father")],
    });
    assert.equal(r.removedStillConnected, true);
    assert.deepEqual(r.via.map((v) => v.userId), ["kid"]);
    // 相手が子を通じて残るので、相手の母も残る(消える人はいない)
    assert.deepEqual(r.dependents, []);
  });

  it("息子を解除すると、息子の子は「孫」として残せる", () => {
    const r = analyzeUnlink({
      viewerId: "me",
      removedId: "son1",
      removedRelation: "son",
      nodes: [N("me"), N("son1"), N("gk", "孫")],
      edges: [E("me", "son1", "son"), E("son1", "gk", "daughter")],
    });
    assert.equal(r.dependents[0].suggestedRelation, "granddaughter");
  });

  it("父を解除すると、父の父は「祖父」、父の兄弟は「おじ」として残せる", () => {
    const r = analyzeUnlink({
      viewerId: "me",
      removedId: "dad",
      removedRelation: "father",
      nodes: [N("me"), N("dad"), N("gpa"), N("unc")],
      edges: [E("me", "dad", "father"), E("dad", "gpa", "father"), E("dad", "unc", "younger_brother")],
    });
    const rel = Object.fromEntries(r.dependents.map((d) => [d.userId, d.suggestedRelation]));
    assert.equal(rel.gpa, "grandfather");
    assert.equal(rel.unc, "uncle");
  });

  it("相手から見た続柄が分からないとき(逆向きの行しかない)は「その他」", () => {
    const r = analyzeUnlink({
      viewerId: "me",
      removedId: "ex",
      removedRelation: "spouse",
      nodes: [N("me"), N("ex"), N("kid")],
      edges: [E("me", "ex", "spouse"), E("kid", "ex", "mother")],
    });
    assert.equal(r.dependents[0].suggestedRelation, "other");
  });

  it("2段先の人(相手の孫など)も一緒に消える人に入る", () => {
    const r = analyzeUnlink({
      viewerId: "me",
      removedId: "ex",
      removedRelation: "spouse",
      nodes: [N("me"), N("ex"), N("kid"), N("gkid")],
      edges: [E("me", "ex", "spouse"), E("ex", "kid", "son"), E("kid", "gkid", "son")],
    });
    assert.deepEqual(r.dependents.map((d) => d.userId).sort(), ["gkid", "kid"]);
    assert.equal(r.dependents.find((d) => d.userId === "gkid")?.suggestedRelation, "other");
  });
});

describe("削除で一緒に外す人(2026-11-11)", () => {
  it("解除の前から本人とつながっていなかった人は、一緒に消える人に入れない", () => {
    const nodes = [N("me"), N("sp"), N("spDad"), N("lonely")];
    const edges = [E("me", "sp", "spouse"), E("sp", "me", "spouse"), E("sp", "spDad", "father"), E("spDad", "sp", "son")];
    const r = analyzeUnlink({ viewerId: "me", removedId: "sp", removedRelation: "spouse", nodes, edges });
    assert.deepEqual(r.dependents.map((d) => d.userId), ["spDad"]);
  });

  it("自動追加の線を除いて渡せば、自動で本人とつながった相手の親も一緒に消える人になる", () => {
    // me と spDad の自動追加の線は、呼び出し側(familyUnlink)で取り除いてから渡す
    const nodes = [N("me"), N("sp"), N("spDad")];
    const manual = [E("me", "sp", "spouse"), E("sp", "me", "spouse"), E("sp", "spDad", "father"), E("spDad", "sp", "son")];
    const r = analyzeUnlink({ viewerId: "me", removedId: "sp", removedRelation: "spouse", nodes, edges: manual });
    assert.deepEqual(r.dependents.map((d) => d.userId), ["spDad"]);
    // 取り除かずに渡すと、自動追加の線で本人とつながっているので消える人に入らない(=以前の不具合)
    const withAuto = [...manual, E("me", "spDad", "father_in_law"), E("spDad", "me", "son_in_law")];
    const r2 = analyzeUnlink({ viewerId: "me", removedId: "sp", removedRelation: "spouse", nodes, edges: withAuto });
    assert.deepEqual(r2.dependents, []);
    // 解除前の判定には自動追加の線も含めて渡す(もとのつながりが先に消えていた人も外せる)
    const orphan = [...manual, E("me", "spDad", "father_in_law"), E("spDad", "me", "son_in_law")];
    const manualOnly = manual.filter((e) => e.fromUserId !== "sp" || e.toUserId !== "spDad").filter((e) => e.fromUserId !== "spDad");
    const r3 = analyzeUnlink({ viewerId: "me", removedId: "sp", removedRelation: "spouse", nodes, edges: manualOnly, beforeEdges: orphan });
    assert.deepEqual(r3.dependents.map((d) => d.userId), ["spDad"]);
  });
});
