// 家系図の表示位置(拡大縮小・移動)の計算。画面部品から切り離した純粋な関数。

export type View = { x: number; y: number; k: number }; // 画面座標 = 図の座標 * k + (x, y)
export type Size = { w: number; h: number };

export const MIN_K = 0.01;
export const MAX_K = 2.5;

export function clampK(k: number): number {
  return Math.min(MAX_K, Math.max(MIN_K, k));
}

/** 図全体が画面に収まるように。小さい図は拡大しすぎず、中央に置く。 */
export function fitView(content: Size, box: Size, pad = 24, maxK = 1): View {
  if (content.w <= 0 || content.h <= 0 || box.w <= 0 || box.h <= 0) return { x: 0, y: 0, k: 1 };
  const k = clampK(Math.min((box.w - pad * 2) / content.w, (box.h - pad * 2) / content.h, maxK));
  return { k, x: (box.w - content.w * k) / 2, y: (box.h - content.h * k) / 2 };
}

/** 指定した画面上の点(px,py)を動かさずに拡大縮小する。 */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const k = clampK(v.k * factor);
  const f = k / v.k;
  return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
}

/** 図の中の矩形を画面の中央に持ってくる(人物へジャンプ)。k を渡せば倍率も指定。 */
export function centerOn(v: View, rect: { x: number; y: number; w: number; h: number }, box: Size, k?: number): View {
  const nk = clampK(k ?? v.k);
  return { k: nk, x: box.w / 2 - (rect.x + rect.w / 2) * nk, y: box.h / 2 - (rect.y + rect.h / 2) * nk };
}

/** 図が画面から完全に外れないよう、少なくとも一部が見える範囲に収める。 */
export function clampPan(v: View, content: Size, box: Size, margin = 80): View {
  const cw = content.w * v.k;
  const ch = content.h * v.k;
  const x = Math.min(box.w - margin, Math.max(margin - cw, v.x));
  const y = Math.min(box.h - margin, Math.max(margin - ch, v.y));
  return { ...v, x, y };
}

export function pinch(a0: [number, number], b0: [number, number], a1: [number, number], b1: [number, number], v: View): View {
  const d0 = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]) || 1;
  const d1 = Math.hypot(a1[0] - b1[0], a1[1] - b1[1]) || 1;
  const m0: [number, number] = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
  const m1: [number, number] = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
  const z = zoomAt(v, d1 / d0, m0[0], m0[1]);
  return { ...z, x: z.x + (m1[0] - m0[0]), y: z.y + (m1[1] - m0[1]) };
}
