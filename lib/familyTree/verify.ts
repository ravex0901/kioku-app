import type { LayoutEdge, LayoutNode, LayoutResult, Segment, TreeInput } from "./types";

// レイアウト結果を検証する関数群(自動テスト・開発時の確認用)。

export type VerifyReport = {
  overlaps: string[];
  missingPersons: string[];
  duplicatePersons: string[];
  rowMismatch: string[];
  linesThroughCards: string[];
  edgesWithoutRelation: string[];
  missingEdges: string[];
  partnersNotAdjacent: string[];
  endpointErrors: string[];
  crossings: number;
  crossingPairs: [string, string][];
};

const EPS = 0.01;

function rectsOverlap(a: LayoutNode, b: LayoutNode, pad = 0): boolean {
  return (
    a.x < b.x + b.w + pad - EPS &&
    b.x < a.x + a.w + pad - EPS &&
    a.y < b.y + b.h - EPS &&
    b.y < a.y + a.h - EPS
  );
}

/** 線分(水平/垂直)がカードの内部を通るか(縁に接するだけなら通っていない)。 */
function segmentHitsRect(s: Segment, n: LayoutNode): boolean {
  const x1 = Math.min(s.x1, s.x2);
  const x2 = Math.max(s.x1, s.x2);
  const y1 = Math.min(s.y1, s.y2);
  const y2 = Math.max(s.y1, s.y2);
  // 矩形の内部(縁を除く)との交差
  return x2 > n.x + EPS && x1 < n.x + n.w - EPS && y2 > n.y + EPS && y1 < n.y + n.h - EPS;
}

function segmentsCross(a: Segment, b: Segment): boolean {
  const aH = Math.abs(a.y1 - a.y2) < EPS;
  const bH = Math.abs(b.y1 - b.y2) < EPS;
  const aV = Math.abs(a.x1 - a.x2) < EPS;
  const bV = Math.abs(b.x1 - b.x2) < EPS;
  if ((aH && bV) || (aV && bH)) {
    const h = aH ? a : b;
    const v = aH ? b : a;
    const hx1 = Math.min(h.x1, h.x2);
    const hx2 = Math.max(h.x1, h.x2);
    const vy1 = Math.min(v.y1, v.y2);
    const vy2 = Math.max(v.y1, v.y2);
    // 端点どうしの接触(T字・L字の接続)は交差に数えない。内部どうしの交差のみ。
    return v.x1 > hx1 + EPS && v.x1 < hx2 - EPS && h.y1 > vy1 + EPS && h.y1 < vy2 - EPS;
  }
  return false;
}

/** 重なる線(同じ向きで一部が重なる)も「交差」とみなす。 */
function segmentsOverlapCollinear(a: Segment, b: Segment): boolean {
  const aH = Math.abs(a.y1 - a.y2) < EPS;
  const bH = Math.abs(b.y1 - b.y2) < EPS;
  if (aH && bH && Math.abs(a.y1 - b.y1) < EPS) {
    const lo = Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2));
    const hi = Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2));
    return hi - lo > EPS;
  }
  const aV = Math.abs(a.x1 - a.x2) < EPS;
  const bV = Math.abs(b.x1 - b.x2) < EPS;
  if (aV && bV && Math.abs(a.x1 - b.x1) < EPS) {
    const lo = Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2));
    const hi = Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2));
    return hi - lo > EPS;
  }
  return false;
}

/** 夫婦の婚姻線と、その夫婦の子への幹線は、同じ点から出るので交差に数えない。 */
function isOwnBundle(a: LayoutEdge, b: LayoutEdge): boolean {
  // 同じ親(夫婦)から出る実子の線と養子の線は、同じ幹から枝分かれする(幹が重なるのは正常)
  if (
    a.kind === "parentChild" &&
    b.kind === "parentChild" &&
    a.fromIds.length === b.fromIds.length &&
    a.fromIds.every((id) => b.fromIds.includes(id))
  ) {
    return true;
  }
  const [m, p] = a.kind === "marriage" ? [a, b] : b.kind === "marriage" ? [b, a] : [null, null];
  if (!m || !p || p.kind !== "parentChild") return false;
  const both = [...m.fromIds, ...m.toIds];
  return both.every((id) => p.fromIds.includes(id));
}

export function countCrossings(edges: LayoutEdge[]): { count: number; pairs: [string, string][] } {
  const pairs: [string, string][] = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i];
      const b = edges[j];
      if (a.bandIndex !== b.bandIndex) continue;
      // 婚姻線と、その夫婦の子への幹線は、同じ点から出るので除外する
      let hit = false;
      for (const sa of a.segments) {
        for (const sb of b.segments) {
          if (segmentsCross(sa, sb) || segmentsOverlapCollinear(sa, sb)) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      if (hit && !isOwnBundle(a, b)) {
        pairs.push([a.id, b.id]);
      }
    }
  }
  return { count: pairs.length, pairs };
}

export function verifyLayout(input: TreeInput, layout: LayoutResult): VerifyReport {
  const report: VerifyReport = {
    overlaps: [],
    missingPersons: [],
    duplicatePersons: [],
    rowMismatch: [],
    linesThroughCards: [],
    edgesWithoutRelation: [],
    missingEdges: [],
    partnersNotAdjacent: [],
    endpointErrors: [],
    crossings: 0,
    crossingPairs: [],
  };

  const nodeById = new Map<string, LayoutNode>();
  for (const n of layout.nodes) {
    if (nodeById.has(n.id)) report.duplicatePersons.push(n.id);
    nodeById.set(n.id, n);
  }
  for (const p of input.persons) {
    if (!nodeById.has(p.id)) report.missingPersons.push(p.id);
  }

  // カードの重なり
  for (let i = 0; i < layout.nodes.length; i++) {
    for (let j = i + 1; j < layout.nodes.length; j++) {
      if (rectsOverlap(layout.nodes[i], layout.nodes[j])) {
        report.overlaps.push(`${layout.nodes[i].id} × ${layout.nodes[j].id}`);
      }
    }
  }

  // 同じ世代=同じ高さ(枠の中で)
  const yByRow = new Map<string, number>();
  for (const n of layout.nodes) {
    const key = `${n.bandIndex}:${n.row}`;
    const y = yByRow.get(key);
    if (y === undefined) yByRow.set(key, n.y);
    else if (Math.abs(y - n.y) > EPS) report.rowMismatch.push(n.id);
  }

  // 線がカードを貫通しない
  for (const e of layout.edges) {
    for (const s of e.segments) {
      for (const n of layout.nodes) {
        if (segmentHitsRect(s, n)) report.linesThroughCards.push(`${e.id} → ${n.id}`);
      }
    }
  }

  // 線は必ず関係データから:採用された関係のIDを集める
  const relIds = new Set<string>();
  for (const r of layout.accepted.parentChild) relIds.add(r.id);
  for (const r of layout.accepted.marriages) relIds.add(r.id);
  for (const r of layout.accepted.siblings) relIds.add(r.id);
  const usedRel = new Set<string>();
  for (const e of layout.edges) {
    if (e.relIds.length === 0 && e.style !== "coparent") report.edgesWithoutRelation.push(e.id);
    for (const rid of e.relIds) {
      if (!relIds.has(rid)) report.edgesWithoutRelation.push(`${e.id}:${rid}`);
      usedRel.add(rid);
    }
  }
  // 採用された親子・婚姻は、必ず線がある(兄弟は、親が分かる場合は線が不要)
  for (const r of layout.accepted.parentChild) if (!usedRel.has(r.id)) report.missingEdges.push(r.id);
  for (const r of layout.accepted.marriages) {
    const a = nodeById.get(r.a);
    const b = nodeById.get(r.b);
    if (a && b && a.bandIndex === b.bandIndex && !usedRel.has(r.id)) report.missingEdges.push(r.id);
  }

  // 婚姻中の夫婦は隣り合う(間に別のカードがない)
  for (const e of layout.edges) {
    if (e.kind !== "marriage") continue;
    const a = nodeById.get(e.fromIds[0]);
    const b = nodeById.get(e.toIds[0]);
    if (!a || !b) continue;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    const between = layout.nodes.some(
      (n) => n.y === a.y && n.id !== a.id && n.id !== b.id && n.x > lo && n.x < hi
    );
    // 弧(隣り合わない)でない通常の線は、間に誰もいないことが必須
    const isArc = e.segments.length === 3;
    if (between && !isArc) report.partnersNotAdjacent.push(e.id);
  }

  // 親子の線の端点が、正しいカードに着いている
  for (const e of layout.edges) {
    if (e.kind !== "parentChild") continue;
    for (const childId of e.toIds) {
      const c = nodeById.get(childId);
      if (!c) continue;
      const hit = e.segments.some(
        (s) =>
          Math.abs(s.x1 - s.x2) < EPS &&
          Math.abs(Math.max(s.y1, s.y2) - c.y) < EPS &&
          s.x1 >= c.x - EPS &&
          s.x1 <= c.x + c.w + EPS
      );
      if (!hit) report.endpointErrors.push(`${e.id} → child ${childId}`);
    }
    // 出発点は、親のカード(夫婦の間を含む)の範囲の下に
    const parents = e.fromIds.map((id) => nodeById.get(id)).filter(Boolean) as LayoutNode[];
    if (parents.length > 0) {
      const lo = Math.min(...parents.map((p) => p.x));
      const hi = Math.max(...parents.map((p) => p.x + p.w));
      const top = e.segments[0];
      if (top && (top.x1 < lo - EPS || top.x1 > hi + EPS)) {
        report.endpointErrors.push(`${e.id} start outside parents`);
      }
    }
  }

  const cr = countCrossings(layout.edges);
  report.crossings = cr.count;
  report.crossingPairs = cr.pairs;
  return report;
}

export function isClean(r: VerifyReport, allowCrossings = 0): boolean {
  return (
    r.overlaps.length === 0 &&
    r.missingPersons.length === 0 &&
    r.duplicatePersons.length === 0 &&
    r.rowMismatch.length === 0 &&
    r.linesThroughCards.length === 0 &&
    r.edgesWithoutRelation.length === 0 &&
    r.missingEdges.length === 0 &&
    r.partnersNotAdjacent.length === 0 &&
    r.endpointErrors.length === 0 &&
    r.crossings <= allowCrossings
  );
}
