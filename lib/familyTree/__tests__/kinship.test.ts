import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeKinship, forwardRelation, inverseRelation, inferGender, planAutoLinks, type KinEdge } from "../kinship";

// 家系図に出す範囲と、自動で家族に加えるときの続柄のテスト。
// edges は「from から見た to の続柄」。実際のデータと同じく、つながりは双方向に行がある。

const E = (fromUserId: string, toUserId: string, relation: string): KinEdge => ({ fromUserId, toUserId, relation });
// 双方向の 2 行をまとめて作る
const both = (a: string, b: string, aSeesB: string, bSeesA: string) => [E(a, b, aSeesB), E(b, a, bSeesA)];
const kinOf = (edges: KinEdge[], who: string, viewer = "me") => computeKinship(viewer, edges).get(who)?.kin;

describe("本人の家系:曽祖父から曾孫まで", () => {
  const edges = [
    ...both("me", "dad", "father", "son"),
    ...both("dad", "gpa", "father", "son"),
    ...both("gpa", "ggpa", "father", "son"),
    ...both("ggpa", "gggpa", "father", "son"),
    ...both("me", "kid", "son", "father"),
    ...both("kid", "gkid", "daughter", "father"),
    ...both("gkid", "ggkid", "son", "mother"),
    ...both("ggkid", "gggkid", "son", "father"),
  ];
  it("父・祖父・曽祖父は出る", () => {
    assert.equal(kinOf(edges, "dad"), "parent");
    assert.equal(kinOf(edges, "gpa"), "grandparent");
    assert.equal(kinOf(edges, "ggpa"), "great_grandparent");
  });
  it("曽祖父の親は出ない", () => assert.equal(kinOf(edges, "gggpa"), undefined));
  it("子・孫・曾孫は出る", () => {
    assert.equal(kinOf(edges, "kid"), "child");
    assert.equal(kinOf(edges, "gkid"), "grandchild");
    assert.equal(kinOf(edges, "ggkid"), "great_grandchild");
  });
  it("曾孫の子は出ない", () => assert.equal(kinOf(edges, "gggkid"), undefined));
});

describe("兄弟姉妹:本人と配偶者まで(配偶者の家族は出さない)", () => {
  const edges = [
    ...both("me", "dad", "father", "son"),
    ...both("dad", "bro", "son", "father"),
    ...both("bro", "broWife", "spouse", "spouse"),
    ...both("broWife", "bwDad", "father", "daughter"),
    ...both("broWife", "bwSis", "younger_sister", "older_sister"),
    ...both("bwDad", "bwGpa", "father", "son"),
  ];
  it("親を通じた兄弟は「兄弟姉妹」", () => assert.equal(kinOf(edges, "bro"), "sibling"));
  it("兄弟の配偶者は出る", () => assert.equal(kinOf(edges, "broWife"), "sibling_spouse"));
  it("兄弟の配偶者の親・兄弟・祖父母は出ない", () => {
    assert.equal(kinOf(edges, "bwDad"), undefined);
    assert.equal(kinOf(edges, "bwSis"), undefined);
    assert.equal(kinOf(edges, "bwGpa"), undefined);
  });
});

describe("配偶者の家系:親・兄弟姉妹・祖父母まで", () => {
  const edges = [
    ...both("me", "wife", "spouse", "spouse"),
    ...both("wife", "wDad", "father", "daughter"),
    ...both("wife", "wBro", "older_brother", "younger_sister"),
    ...both("wDad", "wGpa", "father", "son"),
    ...both("wGpa", "wGgpa", "father", "son"),
    ...both("wBro", "wBroWife", "spouse", "spouse"),
    ...both("wBro", "wBroKid", "son", "father"),
    ...both("wDad", "wUncle", "younger_brother", "older_brother"),
  ];
  it("配偶者の親・兄弟・祖父母は出る", () => {
    assert.equal(kinOf(edges, "wife"), "spouse");
    assert.equal(kinOf(edges, "wDad"), "spouse_parent");
    assert.equal(kinOf(edges, "wBro"), "spouse_sibling");
    assert.equal(kinOf(edges, "wGpa"), "spouse_grandparent");
  });
  it("配偶者の曽祖父・兄弟の配偶者・兄弟の子・おじは出ない", () => {
    assert.equal(kinOf(edges, "wGgpa"), undefined);
    assert.equal(kinOf(edges, "wBroWife"), undefined);
    assert.equal(kinOf(edges, "wBroKid"), undefined);
    assert.equal(kinOf(edges, "wUncle"), undefined);
  });
});

describe("追加で選んだ範囲:子や孫の配偶者・おじおば・甥姪・いとこ", () => {
  const edges = [
    ...both("me", "dad", "father", "son"),
    ...both("dad", "uncle", "older_brother", "younger_brother"),
    ...both("uncle", "cousin", "daughter", "father"),
    ...both("cousin", "cousinKid", "son", "mother"),
    ...both("me", "sis", "younger_sister", "older_brother"),
    ...both("sis", "niece", "daughter", "mother"),
    ...both("niece", "nieceKid", "son", "mother"),
    ...both("me", "kid", "son", "father"),
    ...both("kid", "kidWife", "spouse", "spouse"),
    ...both("kidWife", "kwDad", "father", "daughter"),
    ...both("kid", "gkid", "son", "father"),
    ...both("gkid", "gkidWife", "spouse", "spouse"),
  ];
  it("おじ・いとこ・甥姪は出る", () => {
    assert.equal(kinOf(edges, "uncle"), "uncle_aunt");
    assert.equal(kinOf(edges, "cousin"), "cousin");
    assert.equal(kinOf(edges, "niece"), "nephew_niece");
  });
  it("子の配偶者・孫の配偶者は出る。子の配偶者の親は出ない", () => {
    assert.equal(kinOf(edges, "kidWife"), "child_spouse");
    assert.equal(kinOf(edges, "gkidWife"), "grandchild_spouse");
    assert.equal(kinOf(edges, "kwDad"), undefined);
  });
  it("いとこの子・甥姪の子は出ない", () => {
    assert.equal(kinOf(edges, "cousinKid"), undefined);
    assert.equal(kinOf(edges, "nieceKid"), undefined);
  });
});

describe("同じ人は1人分だけ(複数の道があっても重ならない)", () => {
  it("父経由でも母経由でも、兄弟は1人・同じ立場", () => {
    const edges = [
      ...both("me", "dad", "father", "son"),
      ...both("me", "mom", "mother", "son"),
      ...both("dad", "mom", "spouse", "spouse"),
      ...both("dad", "bro", "son", "father"),
      ...both("mom", "bro", "son", "mother"),
    ];
    const k = computeKinship("me", edges);
    assert.equal(k.get("bro")?.kin, "sibling");
    assert.equal(k.get("mom")?.kin, "parent");
    assert.equal([...k.keys()].filter((x) => x === "bro").length, 1);
  });

  it("近い道を優先する(本人が直接「父」と登録していれば、配偶者の親ではなく父)", () => {
    const edges = [...both("me", "x", "father", "son"), ...both("me", "w", "spouse", "spouse"), ...both("w", "x", "father", "daughter")];
    assert.equal(kinOf(edges, "x"), "parent");
  });

  it("片側だけの行(相手が認めていない)はたどらない", () => {
    const edges = [E("me", "stranger", "son"), ...both("stranger", "sKid", "son", "father")];
    assert.equal(kinOf(edges, "stranger"), undefined);
    assert.equal(kinOf(edges, "sKid"), undefined);
  });

  it("元配偶者・その他の続柄からは先をたどらない", () => {
    const edges = [...both("me", "ex", "ex_spouse", "ex_spouse"), ...both("ex", "exDad", "father", "daughter"), ...both("me", "o", "other", "other"), ...both("o", "oKid", "son", "father")];
    assert.equal(kinOf(edges, "exDad"), undefined);
    assert.equal(kinOf(edges, "oKid"), undefined);
  });
});

describe("自動で家族に加えるときの続柄", () => {
  it("性別は、ほかの人が登録した続柄から分かる", () => {
    const edges = [...both("me", "wife", "spouse", "spouse"), ...both("wife", "wDad", "father", "daughter")];
    assert.equal(inferGender("wDad", edges), "male");
    assert.equal(inferGender("wife", edges), "female");
    // 本人の続柄はだれも登録していないが、配偶者が女性なので男性とみなす
    assert.equal(inferGender("me", edges), "male");
    assert.equal(inferGender("x", edges), undefined);
  });

  it("配偶者の父 → 本人側は「義父」、相手側は本人の性別で「娘の夫」", () => {
    const edges = [...both("me", "wife", "spouse", "spouse"), ...both("wife", "wDad", "father", "daughter"), ...both("me", "dad", "father", "son")];
    const info = computeKinship("me", edges).get("wDad")!;
    assert.equal(forwardRelation(info), "father_in_law");
    assert.equal(inverseRelation(info, inferGender("me", edges)), "son_in_law");
  });

  it("兄弟の年上・年下は、相手が本人をどう登録しているかで決める", () => {
    const edges = [...both("me", "dad", "father", "son"), ...both("dad", "bro", "son", "father"), E("bro", "me", "younger_brother")];
    const info = computeKinship("me", [...edges, E("me", "bro", "older_brother")]).get("bro")!;
    // 上の E("me","bro") は双方向判定のためだけ。年齢は bro→me の「弟」から
    assert.equal(forwardRelation(info), "older_brother");
    assert.equal(inverseRelation(info, "male"), "younger_brother");
  });

  it("年齢が分からない兄弟は「兄弟」/「姉妹」、性別も分からなければ「その他」", () => {
    const edges = [...both("me", "dad", "father", "son"), ...both("dad", "s1", "son", "father"), ...both("dad", "s2", "other", "other")];
    const k = computeKinship("me", [...edges, ...both("mom", "s2", "daughter", "mother"), ...both("me", "mom", "mother", "son")]);
    assert.equal(forwardRelation(k.get("s1")!), "brother");
    assert.equal(forwardRelation(k.get("s2")!), "sister");
    const k2 = computeKinship("me", [...both("me", "dad", "father", "son"), ...both("dad", "s3", "son", "father")]);
    assert.equal(inverseRelation(k2.get("s3")!, undefined), "other");
  });

  it("祖父母・孫・甥姪・いとこ・子の配偶者の名前", () => {
    const edges = [
      ...both("me", "dad", "father", "son"),
      ...both("dad", "gma", "mother", "son"),
      ...both("dad", "aunt", "older_sister", "younger_brother"),
      ...both("aunt", "cz", "son", "mother"),
      ...both("me", "kid", "daughter", "father"),
      ...both("kid", "kidHus", "spouse", "spouse"),
      ...both("kidHus", "x", "son", "father"),
    ];
    const k = computeKinship("me", edges);
    assert.equal(forwardRelation(k.get("gma")!), "grandmother");
    assert.equal(inverseRelation(k.get("gma")!, "male"), "grandson");
    assert.equal(forwardRelation(k.get("aunt")!), "aunt");
    assert.equal(inverseRelation(k.get("aunt")!, "male"), "nephew");
    assert.equal(forwardRelation(k.get("cz")!), "cousin");
    assert.equal(forwardRelation(k.get("kidHus")!), "son_in_law");
    assert.equal(inverseRelation(k.get("kidHus")!, "male"), "father_in_law");
  });
});

describe("配偶者の兄弟が、配偶者の親とだけつながっている場合", () => {
  it("配偶者の親の子(配偶者以外)は「配偶者の兄弟姉妹」", () => {
    const edges = [...both("me", "wife", "spouse", "spouse"), ...both("wife", "wDad", "father", "daughter"), ...both("wDad", "wSis", "daughter", "father")];
    assert.equal(kinOf(edges, "wSis"), "spouse_sibling");
    assert.equal(kinOf(edges, "wife"), "spouse");
  });
});

describe("自動追加で行う書き込み(planAutoLinks)", () => {
  const names = new Map([["me", "本人"], ["wife", "花子"], ["wDad", "一郎"], ["dad", "父さん"], ["far", "遠い人"]]);
  const row = (id: string, user_id: string, name: string, relation: string, linked_user_id: string | null) => ({ id, user_id, name, relation, linked_user_id });

  it("配偶者の父を、本人は「義父」、相手は「娘の夫」で双方に追加する", () => {
    const edges = [...both("me", "wife", "spouse", "spouse"), ...both("wife", "wDad", "father", "daughter"), ...both("me", "dad", "father", "son")];
    const rows = [row("r1", "me", "花子", "spouse", "wife"), row("r2", "wife", "本人", "spouse", "me"), row("r3", "wife", "一郎", "father", "wDad"), row("r4", "wDad", "花子", "daughter", "wife"), row("r5", "me", "父さん", "father", "dad"), row("r6", "dad", "本人", "son", "me")];
    const ops = planAutoLinks({ viewerId: "me", edges, rows, excluded: new Set(), names });
    assert.deepEqual(ops, [
      { kind: "insert", owner: "me", other: "wDad", relation: "father_in_law", name: "一郎" },
      { kind: "insert", owner: "wDad", other: "me", relation: "son_in_law", name: "本人" },
    ]);
  });

  it("すでに双方向でつながっている人には何もしない", () => {
    const edges = both("me", "dad", "father", "son");
    const rows = [row("r1", "me", "父さん", "father", "dad"), row("r2", "dad", "本人", "son", "me")];
    assert.deepEqual(planAutoLinks({ viewerId: "me", edges, rows, excluded: new Set(), names }), []);
  });

  it("名前だけの「父」がいれば、新しく作らずにその行をつなぐ(同じ人は1人)", () => {
    const edges = [...both("me", "bro", "younger_brother", "older_brother"), ...both("bro", "dad", "father", "son")];
    const rows = [row("r1", "me", "弟", "younger_brother", "bro"), row("r2", "bro", "本人", "older_brother", "me"), row("r3", "bro", "父さん", "father", "dad"), row("r4", "dad", "弟", "son", "bro"), row("mine", "me", "おやじ", "father", null)];
    const ops = planAutoLinks({ viewerId: "me", edges, rows, excluded: new Set(), names });
    assert.deepEqual(ops[0], { kind: "link_existing", rowId: "mine", owner: "me", other: "dad", relation: "father" });
    assert.equal(ops.filter((o) => o.owner === "me" && o.other === "dad").length, 1);
  });

  it("「紐づけを解除」した相手は加えない", () => {
    const edges = [...both("me", "wife", "spouse", "spouse"), ...both("wife", "wDad", "father", "daughter")];
    const rows = [row("r1", "me", "花子", "spouse", "wife"), row("r2", "wife", "本人", "spouse", "me"), row("r3", "wife", "一郎", "father", "wDad"), row("r4", "wDad", "花子", "daughter", "wife")];
    assert.deepEqual(planAutoLinks({ viewerId: "me", edges, rows, excluded: new Set(["wDad"]), names }), []);
  });

  it("範囲外の人は加えない", () => {
    const edges = [...both("me", "bro", "younger_brother", "older_brother"), ...both("bro", "bw", "spouse", "spouse"), ...both("bw", "far", "father", "daughter")];
    const rows = [row("r1", "me", "弟", "younger_brother", "bro"), row("r2", "bro", "本人", "older_brother", "me")];
    const ops = planAutoLinks({ viewerId: "me", edges, rows, excluded: new Set(), names });
    assert.ok(ops.every((o) => o.other !== "far" && o.owner !== "far"));
    assert.ok(ops.some((o) => o.owner === "me" && o.other === "bw" && o.relation === "sibling_in_law"));
  });
});
