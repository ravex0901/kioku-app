import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { focusInput, searchPersons, summarizeRelatives } from "../focus";
import { layoutFamilyTree } from "../layout";
import { isClean, verifyLayout } from "../verify";
import { SCENARIOS } from "./scenarios";

const t02 = SCENARIOS.find((s) => s.key === "t02")!.input;

describe("表示範囲(世代別表示・直系・近親)", () => {
  it("直系のみ:祖先・子孫と配偶者だけ(叔父・弟は除く)", () => {
    const r = focusInput(t02, { scope: "lineage", centerId: "me", generationsUp: null, generationsDown: null });
    const ids = new Set(r.input.persons.map((p) => p.id));
    for (const id of ["me", "f", "m", "gf", "gm", "cw", "gc1", "gc2"]) assert.ok(ids.has(id), id);
    assert.ok(!ids.has("u") && !ids.has("br") && !ids.has("uw"));
    assert.equal(r.shown + r.hidden, t02.persons.length);
  });

  it("世代制限:上1世代・下0世代なら、本人の世代と親の世代だけ", () => {
    const r = focusInput(t02, { scope: "all", centerId: "me", generationsUp: 1, generationsDown: 0 });
    const ids = new Set(r.input.persons.map((p) => p.id));
    assert.ok(ids.has("f") && ids.has("me") && ids.has("br") && ids.has("u"));
    assert.ok(!ids.has("gf") && !ids.has("gc1"));
  });

  it("絞り込み後も正しくレイアウトできる(線が欠けたり、重なったりしない)", () => {
    for (const scope of ["all", "lineage", "close"] as const) {
      const r = focusInput(t02, { scope, centerId: "me", generationsUp: null, generationsDown: 1 });
      const L = layoutFamilyTree(r.input);
      assert.ok(isClean(verifyLayout(r.input, L)), scope);
    }
  });

  it("元のデータは変更されない", () => {
    const before = JSON.stringify(t02);
    focusInput(t02, { scope: "close", centerId: "me", generationsUp: 0, generationsDown: 0 });
    assert.equal(JSON.stringify(t02), before);
  });
});

describe("人物検索・詳細", () => {
  it("ひらがな・カタカナ・全角半角の違いを吸収して検索できる", () => {
    const persons = [
      { id: "1", name: "やまだ たろう" },
      { id: "2", name: "ヤマダ ハナコ" },
      { id: "3", name: "Smith" },
    ];
    assert.deepEqual(searchPersons(persons, "タロウ").map((p) => p.id), ["1"]);
    assert.deepEqual(searchPersons(persons, "やまだ").map((p) => p.id), ["1", "2"]);
    assert.deepEqual(searchPersons(persons, "ＳＭＩＴＨ").map((p) => p.id), ["3"]);
    assert.deepEqual(searchPersons(persons, "  "), []);
  });

  it("人物の詳細:親・配偶者・子・兄弟姉妹が、関係データから正しく出る", () => {
    const s = summarizeRelatives(t02, "me");
    assert.deepEqual(s.parents.map((p) => p.id).sort(), ["f", "m"]);
    assert.deepEqual(s.spouses.map((x) => x.person.id), ["cw"]);
    assert.deepEqual(s.children.map((p) => p.id).sort(), ["gc1", "gc2"]);
    assert.deepEqual(s.siblings.map((p) => p.id), ["br"]);
  });
});
