// 家系図エンジンの型定義。
//
// 設計方針(家系図の再設計):
// - 「人物」「親子」「婚姻」「兄弟姉妹」「世代の目安」は別々のデータとして持つ。
//   線(接続線)は必ずここの関係データから生成し、配置された位置から線を推測することはしない。
// - 保存する親族関係と、画面上の座標は完全に分離する。座標は毎回レイアウトエンジンが計算する。
// - 血縁(biological)・法的(legal)・養子(adoptive / special_adoptive)・連れ子(step)を区別する。
// - 関係が不明な場合は線を引かない(未接続として別枠で表示する)。

export type Gender = "male" | "female" | "unknown";

export type TreePerson = {
  /** 家系図上で人物を一意に識別するID。アカウントがある人は `a:<userId>`、ない人は `m:<家族メンバー行ID>`。 */
  id: string;
  name: string;
  /** ひもづいたアカウント(ある場合のみ)。同一人物かどうかの判定は、名前ではなく必ずこのIDで行う。 */
  accountId?: string;
  isSelf?: boolean;
  isDeceased?: boolean;
  gender?: Gender;
  birthYear?: number;
  deathYear?: number;
  /** 旧姓(あれば表示する) */
  maidenName?: string;
  photoUrl?: string;
  /** 閲覧者から見た続柄(「父」「兄」など)。表示用。 */
  relationLabel?: string;
  /** タップしたときに開くリンク(日記など)。権限がない場合は付けない。 */
  href?: string;
  /** 兄弟姉妹の並び順の指定(小さいほど左=年長)。未指定なら生年→続柄→登録順。 */
  birthOrder?: number;
  /** 続柄ラベルから分かる兄弟内の順序(older=-1 / younger=+1 / 長子=-2 ...)。birthOrderがない時の補助。 */
  labelRank?: number;
  /** 登録順(安定した並びのため)。 */
  createdAt?: number;
};

export type ParentKind =
  | "biological" // 実の親子
  | "legal" // 法的な親子(戸籍上)
  | "adoptive" // 普通養子縁組
  | "special_adoptive" // 特別養子縁組
  | "step"; // 継親子(連れ子の相手)

export type ParentChildRel = {
  id: string;
  parentId: string;
  childId: string;
  kind: ParentKind;
  /** 小さいほど信頼する(矛盾した時に残す方)。明示的な登録 < 続柄ラベル由来。 */
  priority: number;
};

export type MarriageStatus = "married" | "divorced" | "widowed" | "common_law";

export type MarriageRel = {
  id: string;
  a: string;
  b: string;
  status: MarriageStatus;
  /** 同じ人の複数の婚姻の順序(小さいほど前)。 */
  order?: number;
  priority: number;
};

export type SiblingRel = {
  id: string;
  a: string;
  b: string;
  /** 親が分かっていない兄弟姉妹の関係。親が分かれば親子関係から描くので、この線は使わない。 */
  kind?: "full" | "half" | "unknown";
  priority: number;
};

/** 世代の目安。gen(to) - gen(from) = delta。線は引かず、行(世代)を揃えるためだけに使う。 */
export type GenerationHint = {
  id: string;
  from: string;
  to: string;
  delta: number;
  priority: number;
};

export type TreeInput = {
  viewerId?: string;
  persons: TreePerson[];
  parentChild: ParentChildRel[];
  marriages: MarriageRel[];
  siblings: SiblingRel[];
  hints: GenerationHint[];
};

export type IssueCode =
  | "parent_cycle"
  | "generation_conflict"
  | "relation_label_conflict"
  | "too_many_parents"
  | "self_relation"
  | "unknown_person"
  | "duplicate_relation"
  | "duplicate_person"
  | "marriage_generation_gap"
  | "sibling_parent_mismatch";

export type TreeIssue = {
  code: IssueCode;
  severity: "error" | "warning";
  /** 画面に出す日本語の説明。 */
  message: string;
  personIds: string[];
  relIds: string[];
};

// ============ レイアウト結果 ============

export type LayoutNode = {
  id: string;
  person: TreePerson;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 行(世代)番号。0が最上段。 */
  row: number;
  /** どの枠(つながっている家族のまとまり)に属するか。 */
  bandIndex: number;
};

export type Segment = { x1: number; y1: number; x2: number; y2: number };

export type EdgeStyle =
  | "marriage" // 婚姻中:二重線
  | "divorced" // 離婚:一重線+斜線
  | "widowed" // 死別:一重線+印
  | "common_law" // 事実婚:点線
  | "coparent" // 婚姻の記録がない親同士
  | "biological" // 実親子:実線
  | "legal" // 法的親子:実線(細)
  | "adoptive" // 養子縁組:破線
  | "special_adoptive" // 特別養子:破線(太)
  | "step" // 継親子:点線
  | "sibling_unknown_parent"; // 親が不明な兄弟姉妹

export type LayoutEdge = {
  id: string;
  kind: "marriage" | "parentChild" | "sibling";
  style: EdgeStyle;
  /** 元になった関係データのID(線は必ず関係データから作る)。 */
  relIds: string[];
  /** 線の出発側の人物(親・夫婦の片方)。 */
  fromIds: string[];
  /** 線の到着側の人物(子など)。 */
  toIds: string[];
  /** 直交(水平・垂直)の線分の集まり。 */
  segments: Segment[];
  /** 描画用の印(離婚の斜線など)の位置。 */
  mark?: { x: number; y: number; type: "slash" | "cross" };
  bandIndex: number;
};

export type LayoutBand = {
  index: number;
  title: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LayoutResult = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  bands: LayoutBand[];
  width: number;
  height: number;
  issues: TreeIssue[];
  /** 採用された関係(矛盾で除外されたものを除く)。検証・表示用。 */
  accepted: Pick<TreeInput, "parentChild" | "marriages" | "siblings">;
};

export type LayoutOptions = {
  cardW?: number;
  cardH?: number;
  /** 前回のレイアウト(人物ID→x)。あれば並び順を保って、無関係な人物の位置を動かしにくくする。 */
  previousX?: Record<string, number>;
};
