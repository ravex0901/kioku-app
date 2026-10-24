import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TreeBuilder } from "../fixtures";
import { layoutFamilyTree } from "../layout";
import { applyPrivacy, inferenceWarnings, type PrivacyConfig } from "../privacy";
import { isClean, verifyLayout } from "../verify";

// 父(f)・現在の妻(w)・息子(s)・前妻(x)・前妻との子(h)
function family() {
  const b = new TreeBuilder();
  b.person("f", "父", { gender: "male", accountId: "A_f" });
  b.person("w", "妻", { gender: "female", accountId: "A_w" });
  b.person("s", "息子", { accountId: "A_s" });
  b.person("x", "前妻", { gender: "female" });
  b.person("h", "異母姉");
  b.marry("f", "w").child(["f", "w"], "s");
  b.marry("f", "x", "divorced").child(["f", "x"], "h");
  b.viewer("f");
  return b.build();
}

const MEMBERS = ["A_f", "A_w", "A_s"];

function cfg(over: Partial<PrivacyConfig> = {}): PrivacyConfig {
  return {
    members: MEMBERS,
    persons: [{ personId: "x", managers: ["A_f"], visibility: { level: "users", allow: ["A_w"] } }],
    relations: [
      { relId: "m:f+x", managers: ["A_f"], visibility: { level: "users", allow: ["A_w"] } },
      { relId: "pc:x>h:biological", managers: ["A_f"], visibility: { level: "users", allow: ["A_w"] } },
    ],
    ...over,
  };
}

const ids = (v: { input: { persons: { id: string }[] } }) => v.input.persons.map((p) => p.id).sort();

describe("公開設定:父の離婚歴を息子にだけ非公開(ケースA)", () => {
  const input = family();

  it("父の画面:前妻・離婚歴・現在の家族がすべて見える", () => {
    const v = applyPrivacy(input, cfg(), "A_f");
    assert.deepEqual(ids(v), ["f", "h", "s", "w", "x"]);
    assert.equal(v.input.marriages.length, 2);
  });

  it("妻の画面:許可された前妻・婚姻履歴が見える", () => {
    const v = applyPrivacy(input, cfg(), "A_w");
    assert.deepEqual(ids(v), ["f", "h", "s", "w", "x"]);
    assert.ok(v.input.marriages.some((m) => m.status === "divorced"));
  });

  it("息子の画面:前妻・離婚した婚姻線・離婚履歴が一切出ない", () => {
    const v = applyPrivacy(input, cfg(), "A_s");
    assert.ok(!ids(v).includes("x"));
    assert.ok(v.input.marriages.every((m) => m.status === "married"));
    assert.ok(v.input.parentChild.every((r) => r.parentId !== "x" && r.childId !== "x"));
    const json = JSON.stringify(v);
    assert.ok(!json.includes("前妻"), "非公開人物の名前が出力に含まれない");
    assert.ok(!json.includes("divorced"));
  });

  it("息子の画面の人数は、見える人物だけで数える(非公開の人数を示さない)", () => {
    const v = applyPrivacy(input, cfg(), "A_s");
    assert.equal(v.visiblePersons, v.input.persons.length);
    // 前妻だけ非公開。前妻との子 h は別の設定なので、設定がなければ「家系図参加者」には見える。
    assert.equal(v.visiblePersons, 4);
  });

  it("息子の画面のレイアウトは、前妻が最初から存在しない家系図と同じ(空白で存在を推測されない)", () => {
    const seen = applyPrivacy(family(), cfg(), "A_s");
    const L = layoutFamilyTree(seen.input);
    assert.ok(isClean(verifyLayout(seen.input, L)));
    const b = new TreeBuilder();
    b.person("f", "父", { gender: "male", accountId: "A_f" });
    b.person("w", "妻", { gender: "female", accountId: "A_w" });
    b.person("s", "息子", { accountId: "A_s" });
    b.person("h", "異母姉");
    b.marry("f", "w").child(["f", "w"], "s");
    b.viewer("f");
    const ref = layoutFamilyTree(b.build());
    const pos = (l: typeof L) => l.nodes.map((n) => `${n.id}:${n.x},${n.y}`).sort();
    // h は前妻との関係が見えないため親のいない人物として扱われる。前妻の分の空きは作られない。
    assert.ok(L.nodes.every((n) => n.id !== "x"));
    assert.equal(L.nodes.length, ref.nodes.length);
    assert.ok(pos(L).length === pos(ref).length);
  });

  it("元の入力データは変更されない(記録の改ざん・削除なし)", () => {
    const input2 = family();
    const before = JSON.stringify(input2);
    applyPrivacy(input2, cfg(), "A_s");
    assert.equal(JSON.stringify(input2), before);
  });
});

describe("公開設定:人物と関係は独立", () => {
  const input = family();

  it("前妻の人物は見えるが、婚姻関係だけ非公開:婚姻線は出ない", () => {
    const c = cfg({ persons: [] });
    const v = applyPrivacy(input, c, "A_s");
    assert.ok(ids(v).includes("x"));
    assert.ok(!v.input.marriages.some((m) => m.status === "divorced"));
    const L = layoutFamilyTree(v.input);
    assert.ok(!L.edges.some((e) => e.style === "divorced" || e.id.includes("f+x")));
  });

  it("前妻の人物だけ非公開(婚姻の設定が公開でも、人物がいないので線は出ない)", () => {
    const c = cfg({ relations: [{ relId: "m:f+x", managers: ["A_f"], visibility: { level: "tree" } }] });
    const v = applyPrivacy(input, c, "A_s");
    assert.ok(!ids(v).includes("x"));
    assert.ok(!v.input.marriages.some((m) => m.a === "x" || m.b === "x"));
  });

  it("離婚・死別などのセンシティブな婚姻は、設定がなければ管理者のみ(初期は限定公開)", () => {
    const c: PrivacyConfig = { members: MEMBERS, persons: [], relations: [] };
    const sMine = applyPrivacy(input, c, "A_s");
    assert.ok(!sMine.input.marriages.some((m) => m.status === "divorced"));
    assert.ok(sMine.input.marriages.some((m) => m.status === "married"));
  });

  it("家系図の参加者ではないアカウントには何も見えない", () => {
    const v = applyPrivacy(input, cfg(), "A_outsider");
    assert.equal(v.input.persons.length, 0);
    assert.equal(v.visiblePersons, 0);
  });
});

describe("公開設定:項目単位・公開申請制", () => {
  it("氏名だけ非公開でも、他の許可された項目は表示できる", () => {
    const b = new TreeBuilder();
    b.person("p", "山田太郎", { accountId: "A_p", birthYear: 1950, maidenName: "鈴木" });
    b.person("q", "家族", { accountId: "A_q" });
    b.marry("p", "q");
    const c: PrivacyConfig = {
      members: ["A_p", "A_q"],
      persons: [{ personId: "p", managers: ["A_p"], visibility: { level: "tree" }, fields: { name: { level: "owner" }, maidenName: { level: "owner" } } }],
      relations: [],
    };
    const v = applyPrivacy(b.build(), c, "A_q");
    const p = v.input.persons.find((x) => x.id === "p");
    assert.equal(p?.birthYear, 1950);
    assert.equal(p?.maidenName, undefined);
    assert.ok(!JSON.stringify(v).includes("山田太郎"));
    assert.deepEqual(v.maskedFields.get("p")?.sort(), ["maidenName", "name"]);
    // 管理者本人には全項目が見える
    const own = applyPrivacy(b.build(), c, "A_p");
    assert.equal(own.input.persons.find((x) => x.id === "p")?.name, "山田太郎");
  });

  it("公開申請制:承認されたアカウントだけが見られる", () => {
    const input = family();
    const base = cfg({
      persons: [{ personId: "x", managers: ["A_f"], visibility: { level: "request", allow: [] } }],
    });
    assert.ok(!ids(applyPrivacy(input, base, "A_w")).includes("x"));
    const approved = cfg({
      persons: [{ personId: "x", managers: ["A_f"], visibility: { level: "request", allow: ["A_w"] } }],
    });
    assert.ok(ids(applyPrivacy(input, approved, "A_w")).includes("x"));
    assert.ok(!ids(applyPrivacy(input, approved, "A_s")).includes("x"));
  });

  it("公開権限を取り消すと、次の取得から見えなくなる", () => {
    const input = family();
    const granted = cfg();
    assert.ok(ids(applyPrivacy(input, granted, "A_w")).includes("x"));
    const revoked = cfg({ persons: [{ personId: "x", managers: ["A_f"], visibility: { level: "users", allow: [] } }] });
    assert.ok(!ids(applyPrivacy(input, revoked, "A_w")).includes("x"));
  });
});

describe("推測による露出の警告(ケースB)", () => {
  it("非公開の婚姻でも、共通の子が見えるなら警告する", () => {
    const input = family();
    const c = cfg({
      persons: [],
      relations: [{ relId: "m:f+x", managers: ["A_f"], visibility: { level: "owner" } }],
    });
    const w = inferenceWarnings(input, c, "A_s");
    assert.ok(w.some((x) => x.code === "hidden_marriage_inferable" && x.relId === "m:f+x"));
  });

  it("子も非公開にすれば警告は出ない", () => {
    const input = family();
    const c = cfg({
      persons: [
        { personId: "x", managers: ["A_f"], visibility: { level: "owner" } },
        { personId: "h", managers: ["A_f"], visibility: { level: "owner" } },
      ],
    });
    assert.deepEqual(inferenceWarnings(input, c, "A_s"), []);
  });
});
