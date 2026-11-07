import { TreeBuilder, balancedTree } from "../fixtures";
import type { TreeInput } from "../types";

// 20項目のテストで使う家系図データ(シナリオ)。

export type Scenario = {
  key: string;
  title: string;
  input: TreeInput;
  /** 許容する線の交差数(複雑な家系でゼロにできないもの) */
  allowCrossings?: number;
  expectIssues?: string[];
};

function threeMembers(): TreeInput {
  return new TreeBuilder()
    .person("f", "父", { gender: "male" })
    .person("m", "母", { gender: "female" })
    .person("c", "子")
    .family("f", "m", ["c"])
    .viewer("c")
    .build();
}

function threeGenerations(): TreeInput {
  const b = new TreeBuilder();
  b.person("gf", "祖父", { gender: "male" }).person("gm", "祖母", { gender: "female" });
  b.person("f", "父", { gender: "male" }).person("m", "母", { gender: "female" });
  b.person("u", "叔父", { gender: "male" }).person("uw", "叔母", { gender: "female" });
  b.person("me", "本人").person("br", "弟");
  b.person("gc1", "孫1").person("gc2", "孫2").person("cw", "妻");
  b.family("gf", "gm", ["f", "u"]);
  b.marry("f", "m").child(["f", "m"], "me").child(["f", "m"], "br");
  b.marry("u", "uw");
  b.marry("me", "cw").child(["me", "cw"], "gc1").child(["me", "cw"], "gc2");
  b.viewer("me");
  return b.build();
}

function fiveSiblings(): TreeInput {
  const b = new TreeBuilder().person("f", "父").person("m", "母");
  const kids = ["長男", "次男", "長女", "三男", "次女"];
  kids.forEach((k, i) => b.person(`k${i}`, k, { labelRank: i }));
  b.family("f", "m", kids.map((_, i) => `k${i}`));
  b.viewer("k2");
  return b.build();
}

function gen4Twenty(): TreeInput {
  return balancedTree(4, 3).build(); // 夫婦+子3人 の4世代
}

function gen5Fifty(): TreeInput {
  const b = balancedTree(5, 3);
  return b.build();
}

function large120(): TreeInput {
  // 6世代・約120人
  const b = balancedTree(6, 3);
  return b.build();
}

function remarriageStepChild(): TreeInput {
  // 父(P)は前妻(X)と離婚(子 a)、後妻(Y)と再婚(子 b)。Yには連れ子(z)がいる(Pの継子)
  const b = new TreeBuilder();
  b.person("P", "父", { gender: "male" }).person("X", "前妻", { gender: "female" }).person("Y", "後妻", { gender: "female" });
  b.person("a", "前妻の子").person("b", "後妻の子").person("z", "連れ子");
  b.person("gp", "祖父").person("gq", "祖母");
  b.marry("P", "X", "divorced", 1).marry("P", "Y", "married", 2);
  b.child(["P", "X"], "a").child(["P", "Y"], "b").child("Y", "z");
  b.child("P", "z", "step"); // 継親子
  b.family("gp", "gq", ["P"]);
  b.viewer("b");
  return b.build();
}

function halfSiblings(): TreeInput {
  // 母(M)は夫H1との間に a、夫H2との間に b(異父兄弟)。父H2は前妻W との間に c(異母兄弟)
  const b = new TreeBuilder();
  b.person("M", "母", { gender: "female" }).person("H1", "前夫", { gender: "male" }).person("H2", "夫", { gender: "male" });
  b.person("W", "夫の前妻", { gender: "female" });
  b.person("a", "異父の姉").person("b", "本人").person("c", "異母の兄");
  b.marry("M", "H1", "divorced", 1).marry("M", "H2", "married", 2).marry("H2", "W", "divorced", 1);
  b.child(["M", "H1"], "a").child(["M", "H2"], "b").child(["H2", "W"], "c");
  b.viewer("b");
  return b.build();
}

function adoption(): TreeInput {
  const b = new TreeBuilder();
  b.person("bf", "実父", { gender: "male" }).person("bm", "実母", { gender: "female" });
  b.person("af", "養父", { gender: "male" }).person("am", "養母", { gender: "female" });
  b.person("c", "養子");
  b.person("ac", "養家の実子");
  b.marry("bf", "bm").marry("af", "am");
  b.child(["bf", "bm"], "c").child(["af", "am"], "c", "adoptive").child(["af", "am"], "ac");
  b.viewer("c");
  return b.build();
}

function specialAdoption(): TreeInput {
  const b = new TreeBuilder();
  b.person("af", "養父").person("am", "養母").person("c", "特別養子");
  b.marry("af", "am").child(["af", "am"], "c", "special_adoptive");
  b.viewer("c");
  return b.build();
}

function oneParentUnknown(): TreeInput {
  const b = new TreeBuilder();
  b.person("f", "父").person("c", "子").person("d", "子の妹").person("e", "母不明の子");
  b.child("f", "c").child("f", "d").child("f", "e");
  b.viewer("c");
  return b.build();
}

function siblingsParentsUnknown(): TreeInput {
  const b = new TreeBuilder();
  b.person("me", "本人").person("br", "兄", { labelRank: -1 }).person("sis", "妹", { labelRank: 1 });
  b.person("w", "妻");
  b.sibling("me", "br").sibling("me", "sis").marry("me", "w");
  b.viewer("me");
  return b.build();
}

function sameNameDifferent(): TreeInput {
  const b = new TreeBuilder();
  b.person("a:1", "山田 太郎", { accountId: "1" }).person("a:2", "山田 太郎", { accountId: "2" });
  b.person("p", "親");
  b.child("p", "a:1").child("p", "a:2");
  b.viewer("a:1");
  return b.build();
}

function duplicateRegistration(): TreeInput {
  // 同じ行を2回登録(idが同じ関係が重複)
  const b = new TreeBuilder();
  b.person("f", "父").person("c", "子");
  b.child("f", "c").child("f", "c");
  b.marry("f", "c"); // 親子なのに婚姻(矛盾)
  b.viewer("c");
  return b.build();
}

function contradictions(): TreeInput {
  // A が B の親かつ B が A の親(循環)、3人の親、自分自身との関係
  const b = new TreeBuilder();
  b.person("A", "A").person("B", "B").person("C", "C").person("D", "D").person("E", "E");
  b.child("A", "B").child("B", "A");
  b.child("A", "C").child("B", "C").child("D", "C"); // Cに親が3人
  b.child("E", "E");
  b.viewer("B");
  return b.build();
}

function fourGenerationsWithInlawTrees(): TreeInput {
  // 配偶者の実家(別の家系)が両側にある家系
  const b = new TreeBuilder();
  b.person("g1m", "祖父A").person("g1f", "祖母A");
  b.person("g1m2", "祖父B").person("g1f2", "祖母B");
  b.person("p1", "父").person("p2", "母");
  b.person("me", "本人").person("sp", "配偶者").person("spf", "配偶者の父").person("spm", "配偶者の母");
  b.person("k1", "子1").person("k2", "子2");
  b.family("g1m", "g1f", ["p1"]);
  b.family("g1m2", "g1f2", ["p2"]);
  b.marry("p1", "p2").child(["p1", "p2"], "me");
  b.family("spf", "spm", ["sp"]);
  b.marry("me", "sp").child(["me", "sp"], "k1").child(["me", "sp"], "k2");
  b.viewer("me");
  return b.build();
}

export const SCENARIOS: Scenario[] = [
  { key: "t01", title: "1. 父・母・子の3人", input: threeMembers() },
  { key: "t02", title: "2. 祖父母から孫までの3世代", input: threeGenerations() },
  { key: "t03", title: "3. 兄弟姉妹が5人", input: fiveSiblings() },
  { key: "t04", title: "4. 4世代・約20人", input: gen4Twenty() },
  { key: "t05", title: "5. 5世代・約50人", input: gen5Fifty() },
  { key: "t06", title: "6. 100人以上の大規模家系図", input: large120() },
  { key: "t07", title: "7. 再婚と連れ子", input: remarriageStepChild() },
  { key: "t08", title: "8. 異父兄弟・異母兄弟", input: halfSiblings() },
  { key: "t09", title: "9. 養子縁組(実親と養親)", input: adoption() },
  { key: "t09b", title: "9b. 特別養子縁組", input: specialAdoption() },
  { key: "t10", title: "10. 親の片方が不明", input: oneParentUnknown() },
  { key: "t10b", title: "10b. 親が不明の兄弟姉妹", input: siblingsParentsUnknown() },
  { key: "t13", title: "13. 同姓同名の別人", input: sameNameDifferent() },
  { key: "t19", title: "19. 関係データの矛盾", input: contradictions(), expectIssues: ["parent_cycle", "too_many_parents", "self_relation"] },
  { key: "t99", title: "配偶者の実家が両側にある家系", input: fourGenerationsWithInlawTrees() },
  { key: "t14", title: "14. 重複登録と矛盾した婚姻", input: duplicateRegistration() },
];
