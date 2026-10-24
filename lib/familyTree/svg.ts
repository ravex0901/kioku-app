import type { EdgeStyle, LayoutEdge, LayoutNode, LayoutResult } from "./types";

// 家系図をSVG文字列に描画する(画面表示・画像出力・テストで同じ描画を使う)。
// 人物カードには data-person-id、線には data-edge-id を付けるので、
// 画面側はイベント委譲でタップを受け取れる。

export const TREE_COLORS = {
  ink: "#1f2a24",
  inkSoft: "#5b6b62",
  line: "#5f8a72",
  lineStrong: "#2f6b4f",
  gold: "#b8923b",
  danger: "#a24a3a",
  card: "#ffffff",
  cardBorder: "#cfe3d5",
  bg: "#fbf8f1",
  band: "#f2f6f1",
  selectedRing: "#b8923b",
  hitRing: "#e0a526",
  deceased: "#6b6f6c",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clip(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}

const AVATAR_FILL = ["#dcefe0", "#f1e6c8", "#d6ece4", "#f3e3c4", "#d3e8e5", "#e3efc9"];
const AVATAR_TEXT = ["#2f6b4f", "#7a5a12", "#1f6b57", "#8a5a10", "#1f5f63", "#4c6a14"];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return h % AVATAR_FILL.length;
}

type EdgeStroke = { color: string; width: number; dash?: string };
function strokeFor(style: EdgeStyle): EdgeStroke {
  switch (style) {
    case "marriage":
      return { color: TREE_COLORS.lineStrong, width: 2 };
    case "divorced":
      return { color: TREE_COLORS.deceased, width: 2 };
    case "widowed":
      return { color: TREE_COLORS.deceased, width: 2 };
    case "common_law":
      return { color: TREE_COLORS.lineStrong, width: 2, dash: "5 4" };
    case "coparent":
      return { color: TREE_COLORS.line, width: 1.6, dash: "2 4" };
    case "biological":
      return { color: TREE_COLORS.line, width: 2 };
    case "legal":
      return { color: TREE_COLORS.lineStrong, width: 1.4 };
    case "adoptive":
      return { color: TREE_COLORS.gold, width: 2, dash: "7 5" };
    case "special_adoptive":
      return { color: TREE_COLORS.gold, width: 3, dash: "7 5" };
    case "step":
      return { color: TREE_COLORS.inkSoft, width: 1.6, dash: "2 5" };
    case "sibling_unknown_parent":
      return { color: TREE_COLORS.inkSoft, width: 1.6, dash: "2 4" };
  }
}

function edgeSvg(e: LayoutEdge): string {
  const st = strokeFor(e.style);
  const d = e.segments.map((s) => `M${s.x1} ${s.y1}L${s.x2} ${s.y2}`).join("");
  let out = `<path data-edge-id="${esc(e.id)}" d="${d}" fill="none" stroke="${st.color}" stroke-width="${st.width}" stroke-linecap="round" stroke-linejoin="round"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""}/>`;
  if (e.mark) {
    const { x, y } = e.mark;
    if (e.mark.type === "slash") {
      out += `<path d="M${x - 5} ${y + 8}L${x - 1} ${y - 8}M${x + 1} ${y + 8}L${x + 5} ${y - 8}" stroke="${TREE_COLORS.danger}" stroke-width="2" stroke-linecap="round"/>`;
    } else {
      out += `<path d="M${x - 5} ${y - 5}L${x + 5} ${y + 5}M${x + 5} ${y - 5}L${x - 5} ${y + 5}" stroke="${TREE_COLORS.deceased}" stroke-width="2" stroke-linecap="round"/>`;
    }
  }
  return out;
}

function lifespan(n: LayoutNode): string {
  const { birthYear, deathYear } = n.person;
  if (birthYear && deathYear) return `${birthYear}–${deathYear}`;
  if (birthYear) return `${birthYear}–`;
  if (deathYear) return `–${deathYear}`;
  return "";
}

function nodeSvg(n: LayoutNode, opts: RenderOptions): string {
  const p = n.person;
  const cx = n.x + n.w / 2;
  const ci = hashName(p.name);
  const selected = opts.selectedId === n.id;
  const hit = opts.highlightIds?.has(n.id);
  const initial = [...p.name.trim()][0] ?? "?";
  const label = clip(p.name, 8);
  const sub = p.relationLabel ? clip(p.relationLabel, 9) : "";
  const years = lifespan(n);
  const clickable = !!p.href || opts.interactive;
  const ring = selected
    ? `<rect x="${n.x - 4}" y="${n.y - 4}" width="${n.w + 8}" height="${n.h + 8}" rx="18" fill="none" stroke="${TREE_COLORS.selectedRing}" stroke-width="3"/>`
    : hit
      ? `<rect x="${n.x - 4}" y="${n.y - 4}" width="${n.w + 8}" height="${n.h + 8}" rx="18" fill="none" stroke="${TREE_COLORS.hitRing}" stroke-width="3" stroke-dasharray="6 4"/>`
      : "";
  const avatarFill = p.isSelf ? TREE_COLORS.lineStrong : AVATAR_FILL[ci];
  const avatarText = p.isSelf ? "#fbf8f1" : AVATAR_TEXT[ci];
  const avatar = p.photoUrl
    ? `<clipPath id="clip-${esc(n.id)}"><circle cx="${cx}" cy="${n.y + 36}" r="26"/></clipPath><image href="${esc(p.photoUrl)}" x="${cx - 26}" y="${n.y + 10}" width="52" height="52" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-${esc(n.id)})"/>`
    : `<circle cx="${cx}" cy="${n.y + 36}" r="26" fill="${avatarFill}"/><text x="${cx}" y="${n.y + 45}" text-anchor="middle" font-size="24" font-weight="700" fill="${avatarText}" font-family="'Noto Serif JP','Hiragino Mincho ProN','Yu Mincho',serif">${esc(initial)}</text>`;
  const deceased = p.isDeceased
    ? `<circle cx="${n.x + n.w - 14}" cy="${n.y + 14}" r="10" fill="${TREE_COLORS.deceased}"/><text x="${n.x + n.w - 14}" y="${n.y + 18}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">故</text>`
    : "";
  const maiden = p.maidenName
    ? `<text x="${cx}" y="${n.y + 110}" text-anchor="middle" font-size="10" fill="${TREE_COLORS.inkSoft}">旧姓 ${esc(clip(p.maidenName, 6))}</text>`
    : years
      ? `<text x="${cx}" y="${n.y + 110}" text-anchor="middle" font-size="10" fill="${TREE_COLORS.inkSoft}">${esc(years)}</text>`
      : "";
  const chip = sub
    ? `<rect x="${cx - 40}" y="${n.y + 117}" width="80" height="20" rx="10" fill="#eef3ee"/><text x="${cx}" y="${n.y + 131}" text-anchor="middle" font-size="11" fill="${TREE_COLORS.inkSoft}">${esc(sub)}</text>`
    : "";
  const linkMark = p.href
    ? `<text x="${cx}" y="${n.y + n.h - 4}" text-anchor="middle" font-size="9" fill="${TREE_COLORS.lineStrong}">日記を見る ›</text>`
    : "";
  return `<g data-person-id="${esc(n.id)}"${clickable ? ' style="cursor:pointer"' : ""} role="button" aria-label="${esc(p.name)}">${ring}<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="16" fill="${TREE_COLORS.card}" stroke="${p.isSelf ? TREE_COLORS.lineStrong : TREE_COLORS.cardBorder}" stroke-width="${p.isSelf ? 2.5 : 1.5}"/>${avatar}${deceased}<text x="${cx}" y="${n.y + 84}" text-anchor="middle" font-size="14" font-weight="700" fill="${p.isDeceased ? TREE_COLORS.deceased : TREE_COLORS.ink}" font-family="'Noto Serif JP','Hiragino Mincho ProN','Yu Mincho',serif">${esc(label)}</text>${maiden}${chip}${linkMark}</g>`;
}

export type RenderOptions = {
  selectedId?: string | null;
  highlightIds?: Set<string>;
  interactive?: boolean;
  /** 画像出力用:背景を塗り、凡例などの余白を足す */
  background?: boolean;
  /** 世代ラベル(祖父母の世代 など)を左に出す */
  rowLabels?: Map<number, string>;
};

export function renderTreeSvg(layout: LayoutResult, opts: RenderOptions = {}): string {
  const w = Math.max(layout.width, 200);
  const h = Math.max(layout.height, 200);
  const bands = layout.bands
    .map((b) =>
      b.title
        ? `<rect x="${b.x - 12}" y="${b.y}" width="${b.w + 24}" height="${b.h + 12}" rx="22" fill="${TREE_COLORS.band}"/><text x="${b.x + 4}" y="${b.y + 26}" font-size="14" font-weight="700" fill="${TREE_COLORS.inkSoft}">${esc(b.title)}</text>`
        : ""
    )
    .join("");
  const edges = layout.edges.map(edgeSvg).join("");
  const nodes = layout.nodes.map((n) => nodeSvg(n, opts)).join("");
  const bg = opts.background ? `<rect width="${w}" height="${h}" fill="${TREE_COLORS.bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="'Noto Sans JP','Hiragino Sans','Yu Gothic',sans-serif">${bg}${bands}<g class="tree-edges">${edges}</g><g class="tree-nodes">${nodes}</g></svg>`;
}

/** 凡例(線の見方)のデータ。画面の凡例と画像出力で共通に使う。 */
export const LEGEND_ITEMS: { style: EdgeStyle; label: string }[] = [
  { style: "marriage", label: "婚姻中の夫婦" },
  { style: "divorced", label: "離婚" },
  { style: "widowed", label: "死別" },
  { style: "common_law", label: "事実婚" },
  { style: "biological", label: "実の親子" },
  { style: "legal", label: "法的な親子(戸籍上)" },
  { style: "adoptive", label: "養子縁組" },
  { style: "special_adoptive", label: "特別養子縁組" },
  { style: "step", label: "継親子(連れ子)" },
  { style: "coparent", label: "婚姻の記録がない親同士" },
  { style: "sibling_unknown_parent", label: "兄弟姉妹(親は未登録)" },
];

export function legendSwatchSvg(style: EdgeStyle): string {
  const st = strokeFor(style);
  let inner: string;
  if (style === "marriage") {
    inner = `<path d="M2 7H38M2 13H38" stroke="${st.color}" stroke-width="2" stroke-linecap="round"/>`;
  } else {
    inner = `<path d="M2 10H38" stroke="${st.color}" stroke-width="${st.width}" stroke-linecap="round"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""}/>`;
    if (style === "divorced") {
      inner += `<path d="M17 17L21 3M21 17L25 3" stroke="${TREE_COLORS.danger}" stroke-width="2" stroke-linecap="round"/>`;
    }
    if (style === "widowed") {
      inner += `<path d="M15 5L25 15M25 5L15 15" stroke="${TREE_COLORS.deceased}" stroke-width="2" stroke-linecap="round"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20" width="40" height="20">${inner}</svg>`;
}
