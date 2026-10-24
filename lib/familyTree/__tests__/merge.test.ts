import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutFamilyTree } from "../layout";
import { accountGroups, mergeAll, type AccountLink, type Contribution } from "../merge";
import { applyPrivacy } from "../privacy";
import type { TreePerson } from "../types";
import { isClean, verifyLayout } from "../verify";

/** n人の連なった親子(1人目が先祖)を持つ寄与データ */
function contrib(accountId: string, prefix: string, n: number, extra: Partial<Contribution> = {}): Contribution {
  const persons: TreePerson[] = [];
  const parentChild = [];
  for (let i = 0; i < n; i++) {
    persons.push({ id: `${prefix}${i}`, name: `${prefix}さん${i}`, createdAt: i + 1 });
    if (i > 0)
      parentChild.push({ id: `pc${prefix}${i}`, parentId: `${prefix}${i - 1}`, childId: `${prefix}${i}`, kind: "biological" as const, priority: 10 });
  }
  return { accountId, persons, parentChild, marriages: [], siblings: [], ...extra };
}
const link = (a: string, b: string, status: AccountLink["status"] = "approved"): AccountLink => ({ a, b, status });

describe("自動統合:人数", () => {
  it("A=7人 B=3人 → 連携で10人", () => {
    const t = mergeAll([contrib("A", "a", 7), contrib("B", "b", 3)], [link("A", "B")]);
    assert.equal(t.length, 1);
    assert.equal(t[0].counts.unique, 10);
    assert.equal(t[0].counts.registered, 10);
  });
  it("A=5 B=5 → 10人", () => {
    const t = mergeAll([contrib("A", "a", 5), contrib("B", "b", 5)], [link("A", "B")]);
    assert.equal(t[0].input.persons.length, 10);
  });
  it("A=20 B=30 C=10 → 60人、レイアウトも破綻しない", () => {
    const t = mergeAll([contrib("A", "a", 20), contrib("B", "b", 30), contrib("C", "c", 10)], [link("A", "B"), link("B", "C")]);
    assert.equal(t[0].counts.unique, 60);
    const L = layoutFamilyTree(t[0].input);
    assert.ok(isClean(verifyLayout(t[0].input, L)));
  });
  it("連携がなければ統合されない(別々の家系図のまま)", () => {
    const t = mergeAll([contrib("A", "a", 3), contrib("B", "b", 3)], []);
    assert.equal(t.length, 2);
  });
  it("連携しただけでは、親子・夫婦などの関係は作られない", () => {
    const t = mergeAll([contrib("A", "a", 1), contrib("B", "b", 1)], [link("A", "B")]);
    assert.equal(t[0].input.parentChild.length + t[0].input.marriages.length + t[0].input.siblings.length, 0);
  });
});

describe("自動統合:連鎖", () => {
  const contribs = ["A", "B", "C", "D", "E"].map((x) => contrib(x, x.toLowerCase(), 2));
  it("AB・CD・AC → A,B,C,Dが一つ。Eは別", () => {
    const g = accountGroups(["A", "B", "C", "D", "E"], [link("A", "B"), link("C", "D"), link("A", "C")]);
    assert.deepEqual(g, [["A", "B", "C", "D"], ["E"]]);
  });
  it("その後 B-E → 全員一つ", () => {
    const t = mergeAll(contribs, [link("A", "B"), link("C", "D"), link("A", "C"), link("B", "E")]);
    assert.equal(t.length, 1);
    assert.equal(t[0].counts.unique, 10);
  });
  it("申請中・解除済みの連携は統合に使わない", () => {
    const t = mergeAll(contribs, [link("A", "B", "pending"), link("C", "D", "revoked")]);
    assert.equal(t.length, 5);
  });
  it("連携の登録順・申請の順序によらず同じ結果(同時申請)", () => {
    const ls = [link("A", "B"), link("C", "D"), link("A", "C"), link("B", "E")];
    const a = mergeAll(contribs, ls);
    const b = mergeAll([...contribs].reverse(), [...ls].reverse());
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });
});

describe("自動統合:重複人物", () => {
  it("同じID(同じアカウントの本人)は一人にまとめる。元のIDは履歴に残す", () => {
    const A = contrib("A", "a", 2);
    const B = contrib("B", "b", 2);
    A.persons.push({ id: "a:U", name: "共通の祖母", accountId: "U", createdAt: 9 });
    B.persons.push({ id: "m:b-granny", name: "祖母", accountId: "U", birthYear: 1930, createdAt: 9 });
    const t = mergeAll([A, B], [link("A", "B")])[0];
    assert.equal(t.counts.registered, 6);
    assert.equal(t.counts.unique, 5);
    const m = t.merges.find((x) => x.sourceIds.includes("a:U"));
    assert.deepEqual(m?.sourceIds.sort(), ["a:U", "m:b-granny"]);
    assert.equal(m?.reason, "same_account");
    // 空欄は補い、既存の値は上書きしない
    const p = t.input.persons.find((x) => x.id === m?.canonicalId);
    assert.equal(p?.birthYear, 1930);
    assert.equal(p?.name, m?.canonicalId === "a:U" ? "共通の祖母" : "祖母");
  });
  it("同姓同名・同じ生年でも自動統合しない。候補として提示するだけ", () => {
    const A = contrib("A", "a", 1);
    const B = contrib("B", "b", 1);
    A.persons.push({ id: "m:1", name: "山田太郎", birthYear: 1950 });
    B.persons.push({ id: "m:2", name: "山田 太郎", birthYear: 1950 });
    const t = mergeAll([A, B], [link("A", "B")])[0];
    assert.equal(t.counts.unique, 4);
    assert.deepEqual(t.candidates.map((c) => [c.personA, c.personB]), [["m:1", "m:2"]]);
    assert.deepEqual(t.merges, []);
  });
  it("別々のアカウントの本人同士は、同姓同名でも候補にもしない", () => {
    const A = contrib("A", "a", 0);
    const B = contrib("B", "b", 0);
    A.persons.push({ id: "a:A", name: "山田太郎", accountId: "A" });
    B.persons.push({ id: "a:B", name: "山田太郎", accountId: "B" });
    const t = mergeAll([A, B], [link("A", "B")])[0];
    assert.equal(t.candidates.length, 0);
    assert.equal(t.counts.unique, 2);
  });
  it("明示的な承認があれば統合し、取り消せる(取り消すと別人に戻る)", () => {
    const A = contrib("A", "a", 1);
    const B = contrib("B", "b", 1);
    A.persons.push({ id: "m:1", name: "山田太郎" });
    B.persons.push({ id: "m:2", name: "山田太郎" });
    const on = mergeAll([A, B], [link("A", "B")], [{ personA: "m:1", personB: "m:2", confirmedBy: "A" }])[0];
    assert.equal(on.counts.unique, 3);
    assert.equal(on.merges[0].reason, "confirmed");
    const off = mergeAll([A, B], [link("A", "B")], [{ personA: "m:1", personB: "m:2", confirmedBy: "A", revoked: true }])[0];
    assert.equal(off.counts.unique, 4);
  });
  it("重複する関係は一つにまとまり、線が二重にならない", () => {
    const rel = (id: string) => ({ id, parentId: "p", childId: "c", kind: "biological" as const, priority: 10 });
    const base = (acc: string, relId: string): Contribution => ({
      accountId: acc,
      persons: [{ id: "p", name: "親" }, { id: "c", name: "子" }],
      parentChild: [rel(relId)],
      marriages: [],
      siblings: [],
    });
    const t = mergeAll([base("A", "x1"), base("B", "x2")], [link("A", "B")])[0];
    assert.equal(t.input.parentChild.length, 1);
    assert.equal(t.counts.unique, 2);
  });
});

describe("自動統合:連携解除と再連携・非公開との組み合わせ", () => {
  it("連携を解除しても各アカウントの元データは残り、再連携で元に戻る", () => {
    const cs = [contrib("A", "a", 4), contrib("B", "b", 3)];
    const before = JSON.stringify(cs);
    const linked = mergeAll(cs, [link("A", "B")]);
    const unlinked = mergeAll(cs, [link("A", "B", "revoked")]);
    const relinked = mergeAll(cs, [link("A", "B")]);
    assert.equal(JSON.stringify(cs), before);
    assert.equal(unlinked.length, 2);
    assert.deepEqual(unlinked.map((t) => t.counts.unique).sort(), [3, 4]);
    assert.equal(JSON.stringify(linked), JSON.stringify(relinked));
  });
  it("BがEと連携しても、Eは既存の非公開情報を見られない", () => {
    const A = contrib("A", "a", 3);
    A.persons[1].accountId = undefined;
    const t = mergeAll([A, contrib("B", "b", 1), contrib("E", "e", 1)], [link("A", "B"), link("B", "E")])[0];
    const v = applyPrivacy(
      t.input,
      {
        members: ["A", "B", "E"],
        persons: [{ personId: "a1", managers: ["A"], visibility: { level: "users", allow: ["B"] } }],
        relations: [],
      },
      "E"
    );
    assert.ok(!v.input.persons.some((p) => p.id === "a1"));
    assert.ok(v.input.persons.some((p) => p.id === "a0"));
    assert.ok(v.input.persons.some((p) => p.id === "e0"));
  });
  it("閲覧可能な人数は、権限のある分だけ(内部10人でも7人なら7人)", () => {
    const t = mergeAll([contrib("A", "a", 7), contrib("B", "b", 3)], [link("A", "B")])[0];
    const v = applyPrivacy(
      t.input,
      {
        members: ["A", "B", "S"],
        persons: ["b0", "b1", "b2"].map((id) => ({ personId: id, managers: ["B"], visibility: { level: "users" as const, allow: ["B"] } })),
        relations: [],
      },
      "S"
    );
    assert.equal(t.counts.unique, 10);
    assert.equal(v.visiblePersons, 7);
  });
});
