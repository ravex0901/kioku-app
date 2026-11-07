import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_K, MIN_K, centerOn, clampPan, fitView, pinch, zoomAt } from "../viewport";

describe("表示位置の計算(拡大縮小・移動)", () => {
  it("全体表示:大きな図は画面に収まり、中央に置かれる", () => {
    const v = fitView({ w: 8000, h: 1200 }, { w: 390, h: 700 });
    assert.ok(v.k < 0.1 + 1e-9 || v.k >= MIN_K);
    assert.ok(8000 * v.k <= 390 && 1200 * v.k <= 700);
    assert.ok(Math.abs(v.x + (8000 * v.k) / 2 - 195) < 1e-6);
  });
  it("全体表示:小さな図は拡大しすぎない", () => {
    assert.equal(fitView({ w: 300, h: 200 }, { w: 1200, h: 800 }).k, 1);
  });
  it("拡大縮小は、指で触れた点を動かさない", () => {
    const v = { x: 10, y: 20, k: 1 };
    const px = 200, py = 150;
    const before = [(px - v.x) / v.k, (py - v.y) / v.k];
    const z = zoomAt(v, 1.7, px, py);
    const after = [(px - z.x) / z.k, (py - z.y) / z.k];
    assert.ok(Math.abs(before[0] - after[0]) < 1e-9 && Math.abs(before[1] - after[1]) < 1e-9);
  });
  it("倍率には上限・下限がある", () => {
    let v = { x: 0, y: 0, k: 1 };
    for (let i = 0; i < 50; i++) v = zoomAt(v, 2, 0, 0);
    assert.equal(v.k, MAX_K);
    for (let i = 0; i < 100; i++) v = zoomAt(v, 0.5, 0, 0);
    assert.equal(v.k, MIN_K);
  });
  it("人物へジャンプ:その人物が画面の中央に来る", () => {
    const v = centerOn({ x: 0, y: 0, k: 1 }, { x: 1000, y: 300, w: 116, h: 150 }, { w: 400, h: 600 }, 1);
    assert.equal(1058 * v.k + v.x, 200);
    assert.equal(375 * v.k + v.y, 300);
  });
  it("ドラッグしても図が画面の外に消えてしまわない", () => {
    const v = clampPan({ x: -99999, y: 99999, k: 1 }, { w: 1000, h: 800 }, { w: 400, h: 600 });
    assert.ok(v.x + 1000 >= 80 && v.y <= 600 - 80);
  });
  it("2本指の拡大(ピンチ):指を広げると拡大、移動も反映", () => {
    const z = pinch([100, 100], [200, 100], [50, 100], [250, 100], { x: 0, y: 0, k: 1 });
    assert.ok(Math.abs(z.k - 2) < 1e-9);
    const mid = [(150 - z.x) / z.k, (100 - z.y) / z.k];
    assert.ok(Math.abs(mid[0] - 150) < 1e-6);
  });
});
