"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { focusInput, searchPersons, summarizeRelatives, type FocusScope } from "@/lib/familyTree/focus";
import { layoutFamilyTree } from "@/lib/familyTree/layout";
import { LEGEND_ITEMS, legendSwatchSvg, renderTreeSvg } from "@/lib/familyTree/svg";
import type { TreeInput } from "@/lib/familyTree/types";
import { centerOn, clampPan, fitView, pinch, zoomAt, type View } from "@/lib/familyTree/viewport";

// 日本式の縦型家系図の表示部品。
// 拡大縮小(ボタン・ホイール・2本指)、ドラッグ移動、全体表示、本人へ移動、人物検索、
// 世代・範囲の絞り込み、人物タップの詳細、凡例、全画面、画像・PDF出力。
// 見える人物・関係だけが input に入っている前提(権限の絞り込みは呼び出し側で済ませる)。

type Props = {
  input: TreeInput;
  /** 家族を追加・編集する画面へのリンク */
  editHref?: string;
  /** 前回の配置(更新時に関係のない人物を動かさないため) */
  onLayoutDone?: (positions: Record<string, number>) => void;
  previousX?: Record<string, number>;
};

const SCOPES: { value: FocusScope; label: string }[] = [
  { value: "all", label: "全員" },
  { value: "lineage", label: "直系だけ" },
  { value: "close", label: "近い親族だけ" },
];

const GEN_OPTIONS: { value: string; label: string; up: number | null; down: number | null }[] = [
  { value: "all", label: "すべての世代", up: null, down: null },
  { value: "up1", label: "ご両親の世代まで", up: 1, down: 1 },
  { value: "up2", label: "祖父母の世代まで", up: 2, down: 2 },
  { value: "me", label: "ご自身の世代だけ", up: 0, down: 0 },
];

export function FamilyTreeView({ input, editHref, previousX, onLayoutDone }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 360, h: 520 });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [scope, setScope] = useState<FocusScope>("all");
  const [gen, setGen] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fitted = useRef(false);

  const centerId = input.viewerId ?? input.persons[0]?.id ?? "";
  const g = GEN_OPTIONS.find((o) => o.value === gen) ?? GEN_OPTIONS[0];

  const focus = useMemo(
    () => focusInput(input, { scope, centerId, generationsUp: g.up, generationsDown: g.down }),
    [input, scope, centerId, g.up, g.down]
  );
  const layout = useMemo(() => layoutFamilyTree(focus.input, { previousX }), [focus.input, previousX]);

  useEffect(() => {
    onLayoutDone?.(Object.fromEntries(layout.nodes.map((n) => [n.id, n.x])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const hits = useMemo(() => new Set(searchPersons(focus.input.persons, query).map((p) => p.id)), [focus.input.persons, query]);
  const svg = useMemo(
    () =>
      renderTreeSvg(layout, {
        selectedId: selected,
        highlightIds: query.trim() ? hits : undefined,
        interactive: true,
      }),
    [layout, selected, hits, query]
  );

  // 画面の大きさを追う
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [fullscreen]);

  const content = useMemo(() => ({ w: layout.width, h: layout.height }), [layout]);

  const fit = useCallback(() => setView(fitView(content, box)), [content, box]);
  const goSelf = useCallback(() => {
    const n = layout.nodes.find((x) => x.id === centerId);
    if (n) setView((v) => centerOn(v, n, box, Math.min(1, Math.max(v.k, 0.6))));
  }, [layout, centerId, box]);

  // 初回と、表示範囲・絞り込みを変えたときは、見やすいように本人を中心に合わせる
  useEffect(() => {
    if (box.w < 50) return;
    const n = layout.nodes.find((x) => x.id === centerId);
    const full = fitView(content, box);
    if (!fitted.current) {
      fitted.current = true;
      // 人数が少なければ全体、多ければ本人を中心に読みやすい倍率で開く
      setView(layout.nodes.length <= 12 || !n ? full : centerOn(full, n, box, Math.max(full.k, 0.6)));
    } else {
      setView(full);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, box.w < 50]);

  // ---- 操作(ドラッグ・ピンチ・ホイール・タップ) ----
  const pointers = useRef(new Map<number, [number, number]>());
  const moved = useRef(0);
  const last = useRef<[number, number] | null>(null);
  const downPerson = useRef<string | null>(null);

  function rel(e: { clientX: number; clientY: number }): [number, number] {
    const r = boxRef.current?.getBoundingClientRect();
    return [e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0)];
  }
  function onPointerDown(e: React.PointerEvent) {
    // ポインターを捕まえると pointerup の対象が枠自体になるため、押した時点で人物を記録しておく
    // ボタン(拡大・縮小など)の上では、ドラッグ処理を始めない(押した操作が横取りされるのを防ぐ)
    if ((e.target as Element).closest?.("button")) {
      downPerson.current = null;
      return;
    }
    downPerson.current = (e.target as Element).closest?.("[data-person-id]")?.getAttribute("data-person-id") ?? null;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      // 捕まえられない場合でも、そのまま動く
    }
    pointers.current.set(e.pointerId, rel(e));
    moved.current = 0;
    last.current = rel(e);
  }
  function onPointerMove(e: React.PointerEvent) {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const now = rel(e);
    if (pointers.current.size === 2) {
      const [id1, id2] = [...pointers.current.keys()];
      const a0 = pointers.current.get(id1) as [number, number];
      const b0 = pointers.current.get(id2) as [number, number];
      pointers.current.set(e.pointerId, now);
      const a1 = pointers.current.get(id1) as [number, number];
      const b1 = pointers.current.get(id2) as [number, number];
      moved.current += 10;
      setView((v) => pinch(a0, b0, a1, b1, v));
      return;
    }
    pointers.current.set(e.pointerId, now);
    const dx = now[0] - p[0];
    const dy = now[1] - p[1];
    moved.current += Math.abs(dx) + Math.abs(dy);
    if (moved.current > 6) setView((v) => clampPan({ ...v, x: v.x + dx, y: v.y + dy }, content, box));
  }
  function onPointerUp(e: React.PointerEvent) {
    const wasTap = moved.current <= 6 && pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (!wasTap) return;
    setSelected(downPerson.current);
  }
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setView((v) => zoomAt(v, factor, e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBtn = (f: number) => setView((v) => zoomAt(v, f, box.w / 2, box.h / 2));

  // ---- 検索 ----
  function jumpTo(id: string) {
    const n = layout.nodes.find((x) => x.id === id);
    if (!n) return;
    setSelected(id);
    setView((v) => centerOn(v, n, box, Math.max(v.k, 0.7)));
  }
  const hitList = useMemo(() => focus.input.persons.filter((p) => hits.has(p.id)).slice(0, 6), [focus.input.persons, hits]);

  // ---- 全画面 ----
  async function toggleFullscreen() {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      // 全画面にできない端末では、画面いっぱいの表示にする
      setFullscreen((f) => !f);
    }
  }
  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // ---- 画像・PDF出力 ----
  function exportSvgString(): string {
    return renderTreeSvg(layout, { background: true });
  }
  async function exportPng() {
    setBusy("png");
    try {
      const s = exportSvgString();
      const scale = Math.min(2, 8000 / Math.max(layout.width, layout.height, 1));
      const img = new Image();
      const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml;charset=utf-8" }));
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("img"));
        img.src = url;
      });
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(layout.width * scale));
      c.height = Math.max(1, Math.round(layout.height * scale));
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/png"));
      if (!blob) throw new Error("blob");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `kakeizu-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
      alert("画像の書き出しに失敗しました。人数が多い場合は、表示範囲を絞ってからお試しください。");
    } finally {
      setBusy(null);
    }
  }
  function exportPdf() {
    // ブラウザの印刷機能で「PDFに保存」できる。凡例つきの印刷用ページを開く。
    const legend = LEGEND_ITEMS.map(
      (it) => `<div style="display:flex;align-items:center;gap:8px;font-size:12px">${legendSwatchSvg(it.style)}<span>${it.label}</span></div>`
    ).join("");
    const w = window.open("", "_blank");
    if (!w) {
      alert("ポップアップがブロックされました。許可してからもう一度お試しください。");
      return;
    }
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>家系図</title><style>@page{size:A3 landscape;margin:10mm}body{margin:0;font-family:sans-serif}svg{width:100%;height:auto}.lg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:12px}</style></head><body>${exportSvgString()}<div class="lg">${legend}</div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`
    );
    w.document.close();
  }

  // ---- 詳細 ----
  const sel = selected ? layout.nodes.find((n) => n.id === selected)?.person : undefined;
  const summary = selected ? summarizeRelatives(focus.input, selected) : null;

  const btnBase =
    "inline-flex min-h-[44px] items-center justify-center rounded-full border border-black/10 px-4 text-sm font-semibold transition disabled:opacity-50";
  const btn = `${btnBase} bg-white text-ink hover:bg-black/5`;
  const btnPrimary = `${btnBase} border-transparent bg-green-700 text-white hover:bg-green-800`;

  return (
    <div ref={wrapRef} className={`flex flex-col gap-3 ${fullscreen ? "bg-cream p-3" : ""}`} data-testid="tree-root">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前で探す"
          aria-label="人物を検索"
          className="min-h-[44px] w-full min-w-0 rounded-full border border-black/10 bg-white px-4 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        />
        <select value={scope} onChange={(e) => setScope(e.target.value as FocusScope)} aria-label="表示する範囲" className={btn}>
          {SCOPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={gen} onChange={(e) => setGen(e.target.value)} aria-label="表示する世代" className={btn}>
          {GEN_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {query.trim() && (
        <div className="flex flex-wrap gap-2" aria-live="polite">
          {hitList.length === 0 ? (
            <span className="text-sm text-ink/50">見つかりませんでした。</span>
          ) : (
            hitList.map((p) => (
              <button key={p.id} type="button" onClick={() => jumpTo(p.id)} className={btn}>
                {p.name}
                {p.relationLabel ? `(${p.relationLabel})` : ""}
              </button>
            ))
          )}
        </div>
      )}

      <div
        ref={boxRef}
        data-testid="tree-canvas"
        className={`relative w-full touch-none select-none overflow-hidden rounded-[1.5rem] border border-green-100 bg-[#fbf8f1] ${fullscreen ? "h-[calc(100vh-170px)]" : "h-[62vh] min-h-[360px]"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      >
        {focus.input.persons.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-ink/50">
            まだ家系図に表示できるご家族がいません。
          </p>
        ) : (
          <div
            data-testid="tree-content"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0", width: layout.width, height: layout.height }}
            // 描画用SVG(人名はエスケープ済み)
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}

        <div className="absolute bottom-3 right-3 flex flex-col gap-2">
          <button type="button" onClick={() => zoomBtn(1.3)} aria-label="拡大" className={`${btn} !px-0 w-11 text-lg`}>
            ＋
          </button>
          <button type="button" onClick={() => zoomBtn(1 / 1.3)} aria-label="縮小" className={`${btn} !px-0 w-11 text-lg`}>
            －
          </button>
        </div>
        <div className="absolute left-3 top-3 rounded-full bg-white/80 px-3 py-1 text-xs text-ink/60" data-testid="tree-count">
          {focus.shown}人を表示
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={fit} className={btn}>
          全体を見る
        </button>
        <button type="button" onClick={goSelf} className={btn}>
          ご自身へ移動
        </button>
        <button type="button" onClick={() => setShowLegend((v) => !v)} className={btn} aria-expanded={showLegend}>
          線の見方
        </button>
        <button type="button" onClick={toggleFullscreen} className={btn}>
          {fullscreen ? "全画面を終える" : "全画面"}
        </button>
        <button type="button" onClick={exportPng} disabled={busy === "png"} className={btn}>
          画像で保存
        </button>
        <button type="button" onClick={exportPdf} className={btn}>
          PDFで保存
        </button>
        {editHref && (
          <a href={editHref} className={btnPrimary}>
            家族を追加・編集
          </a>
        )}
      </div>

      {showLegend && (
        <div className="grid grid-cols-1 gap-2 rounded-2xl border border-green-100 bg-white/70 p-4 sm:grid-cols-2" data-testid="tree-legend">
          {LEGEND_ITEMS.map((it) => (
            <div key={it.style} className="flex items-center gap-3 text-sm text-ink/80">
              <span dangerouslySetInnerHTML={{ __html: legendSwatchSvg(it.style) }} />
              {it.label}
            </div>
          ))}
          <p className="col-span-full text-xs text-ink/50">
            線は、登録された関係から引いています。関係が分からない方の間には線を引きません。
          </p>
        </div>
      )}

      {layout.issues.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <button type="button" className="font-semibold underline" onClick={() => setShowIssues((v) => !v)} aria-expanded={showIssues}>
            登録内容に食い違いがあります({layout.issues.length}件)
          </button>
          {showIssues && (
            <ul className="mt-2 list-disc pl-5">
              {layout.issues.map((i, idx) => (
                <li key={idx}>{i.message}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs">食い違いのある関係は線にせず、登録はそのまま残しています。ご確認のうえ、家族の続柄を見直してください。</p>
        </div>
      )}

      {sel && summary && (
        <div role="dialog" aria-label="人物の詳細" data-testid="tree-detail" className="rounded-2xl border border-green-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-serif-jp text-xl font-bold text-ink">{sel.name}</p>
              <p className="text-sm text-ink/60">
                {[sel.relationLabel, sel.maidenName ? `旧姓 ${sel.maidenName}` : "", sel.birthYear ? `${sel.birthYear}年生まれ` : "", sel.isDeceased ? "故人" : ""]
                  .filter(Boolean)
                  .join(" ・ ")}
              </p>
            </div>
            <button type="button" onClick={() => setSelected(null)} aria-label="閉じる" className={`${btn} !px-0 w-11`}>
              ×
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-y-1 text-sm text-ink/80">
            {summary.parents.length > 0 && (<><dt className="text-ink/50">親</dt><dd>{summary.parents.map((p) => p.name).join("、")}</dd></>)}
            {summary.spouses.length > 0 && (<><dt className="text-ink/50">配偶者</dt><dd>{summary.spouses.map((s) => `${s.person.name}(${s.status})`).join("、")}</dd></>)}
            {summary.children.length > 0 && (<><dt className="text-ink/50">子</dt><dd>{summary.children.map((p) => p.name).join("、")}</dd></>)}
            {summary.siblings.length > 0 && (<><dt className="text-ink/50">兄弟姉妹</dt><dd>{summary.siblings.map((p) => p.name).join("、")}</dd></>)}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            {sel.href && (
              <a href={sel.href} className={btn}>
                日記を見る
              </a>
            )}
            {editHref && (
              <a href={editHref} className={btn}>
                家族の情報を編集
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
