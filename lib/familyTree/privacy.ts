import type { MarriageRel, ParentChildRel, SiblingRel, TreeInput, TreePerson } from "./types";

// 家系図の公開設定(プライバシー)。
//
// 方針:
// - 「親族関係の記録」と「誰が見られるか」は分ける。ここでは記録を一切変更せず、
//   閲覧者ごとに「見える分だけ」を取り出した TreeInput を作る(元データは壊さない)。
// - 見えない人物・関係は描画エンジンへの入力から完全に除外する。
//   そのため空白・欠番・「非公開の方」などの痕跡は残らず、人数からも推測されない。
// - 人物の閲覧権限と、関係(婚姻・離婚・養子など)の閲覧権限は独立している。
//   人物が見えても、その人の婚姻歴・離婚歴が見えるとは限らない。
// - DB側(RLS / 関数)でも同じ判定をする。この関数は表示側の二重の安全網と、仕様のテスト用。

export type VisibilityLevel =
  | "tree" // 1: 家系図参加者に公開
  | "users" // 2: 指定ユーザーのみ
  | "owner" // 3: 自分(管理者)のみ
  | "request"; // 4: 公開申請制(承認された人だけ)

export type Visibility = {
  level: VisibilityLevel;
  /** level=users のとき閲覧できるアカウント。level=request のとき承認済みのアカウント。 */
  allow?: string[];
};

export type PersonField =
  | "name"
  | "maidenName"
  | "photo"
  | "birth"
  | "death"
  | "address"
  | "contact"
  | "memo"
  | "documents"
  | "relations";

export type PersonPrivacy = {
  personId: string;
  /** 人物の登録・管理権限をもつアカウント(登録者・本人)。常に閲覧できる。 */
  managers: string[];
  visibility: Visibility;
  /** 項目ごとの上書き。無指定の項目は人物全体の公開設定に従う。 */
  fields?: Partial<Record<PersonField, Visibility>>;
};

export type RelationPrivacy = {
  /** 関係ID(ParentChildRel / MarriageRel / SiblingRel の id) */
  relId: string;
  managers: string[];
  visibility: Visibility;
};

export type PrivacyConfig = {
  /** 家系図の参加者(承認済みの共同家系図メンバー)のアカウントID */
  members: string[];
  persons: PersonPrivacy[];
  relations: RelationPrivacy[];
  /**
   * 設定がない人物・関係の既定値。
   * 人物は既定で「家系図参加者」、婚姻・離婚などセンシティブな関係は「管理者のみ」で作る。
   */
  defaults?: { person?: Visibility; relation?: Visibility; sensitiveRelation?: Visibility };
};

export const DEFAULT_PERSON_VISIBILITY: Visibility = { level: "tree" };
export const DEFAULT_RELATION_VISIBILITY: Visibility = { level: "tree" };
export const DEFAULT_SENSITIVE_RELATION_VISIBILITY: Visibility = { level: "owner" };

export function canSee(viewer: string, v: Visibility, managers: string[], members: Set<string>): boolean {
  if (managers.includes(viewer)) return true;
  switch (v.level) {
    case "tree":
      return members.has(viewer);
    case "users":
      return (v.allow ?? []).includes(viewer);
    case "request":
      return (v.allow ?? []).includes(viewer);
    case "owner":
      return false;
  }
}

export type PrivacyView = {
  input: TreeInput;
  /** 閲覧者本人に見える人数(統計用)。非公開の人数は一切含まない。 */
  visiblePersons: number;
  /** 見せない項目(名前など)を伏せた人物の id */
  maskedFields: Map<string, PersonField[]>;
};

function isSensitiveMarriage(m: MarriageRel): boolean {
  return m.status === "divorced" || m.status === "widowed" || m.status === "common_law";
}

/**
 * 閲覧者から見える家系図入力だけを作る。入力は変更しない。
 */
export function applyPrivacy(input: TreeInput, cfg: PrivacyConfig, viewerAccountId: string): PrivacyView {
  const members = new Set(cfg.members);
  const personDefault = cfg.defaults?.person ?? DEFAULT_PERSON_VISIBILITY;
  const relDefault = cfg.defaults?.relation ?? DEFAULT_RELATION_VISIBILITY;
  const sensitiveDefault = cfg.defaults?.sensitiveRelation ?? DEFAULT_SENSITIVE_RELATION_VISIBILITY;

  const pCfg = new Map(cfg.persons.map((p) => [p.personId, p]));
  const rCfg = new Map(cfg.relations.map((r) => [r.relId, r]));

  const personVisible = (p: TreePerson): boolean => {
    // 自分自身(ひもづいたアカウント)は常に見える。
    if (p.accountId === viewerAccountId) return true;
    const c = pCfg.get(p.id);
    if (!c) return canSee(viewerAccountId, personDefault, [], members);
    return canSee(viewerAccountId, c.visibility, c.managers, members);
  };

  const relVisible = (relId: string, sensitive: boolean): boolean => {
    const c = rCfg.get(relId);
    if (!c) return canSee(viewerAccountId, sensitive ? sensitiveDefault : relDefault, [], members);
    return canSee(viewerAccountId, c.visibility, c.managers, members);
  };

  const visiblePersons = input.persons.filter(personVisible);
  const ids = new Set(visiblePersons.map((p) => p.id));

  const masked = new Map<string, PersonField[]>();
  const persons: TreePerson[] = visiblePersons.map((p) => {
    const c = pCfg.get(p.id);
    const isMgr = p.accountId === viewerAccountId || (c?.managers.includes(viewerAccountId) ?? false);
    if (!c?.fields || isMgr) return { ...p };
    const hide: PersonField[] = [];
    const out: TreePerson = { ...p };
    const ok = (f: PersonField) => {
      const v = c.fields?.[f];
      return !v || canSee(viewerAccountId, v, c.managers, members);
    };
    if (!ok("name")) {
      out.name = "お名前は非公開です";
      hide.push("name");
    }
    if (!ok("maidenName")) {
      delete out.maidenName;
      hide.push("maidenName");
    }
    if (!ok("photo")) {
      delete out.photoUrl;
      hide.push("photo");
    }
    if (!ok("birth")) {
      delete out.birthYear;
      hide.push("birth");
    }
    if (!ok("death")) {
      delete out.deathYear;
      hide.push("death");
    }
    // 親族関係の項目が非公開なら、続柄の表示(ラベル)も伏せる。
    if (!ok("relations")) {
      delete out.relationLabel;
      hide.push("relations");
    }
    if (hide.length) masked.set(p.id, hide);
    return out;
  });

  const bothVisible = (a: string, b: string) => ids.has(a) && ids.has(b);

  const parentChild: ParentChildRel[] = input.parentChild.filter(
    (r) => bothVisible(r.parentId, r.childId) && relVisible(r.id, r.kind !== "biological" && r.kind !== "legal")
  );
  const marriages: MarriageRel[] = input.marriages.filter(
    (m) => bothVisible(m.a, m.b) && relVisible(m.id, isSensitiveMarriage(m))
  );
  const siblings: SiblingRel[] = input.siblings.filter(
    (s) => bothVisible(s.a, s.b) && relVisible(s.id, s.kind === "half")
  );
  // 世代の目安(hints)は、見える人物同士のものだけ使う。見えない人物経由の世代情報は使わない。
  const hints = input.hints.filter((h) => bothVisible(h.from, h.to));

  // 見えない関係に由来する続柄ラベルは付けない(例:非公開の婚姻による「義母」など)。
  // 続柄は呼び出し側で「見える関係」から再計算できるよう、ここでは残さず安全側に倒す。
  const visibleRelIds = new Set([...parentChild.map((r) => r.id), ...marriages.map((m) => m.id), ...siblings.map((s) => s.id)]);
  void visibleRelIds;

  return {
    input: { viewerId: input.viewerId, persons, parentChild, marriages, siblings, hints },
    visiblePersons: persons.length,
    maskedFields: masked,
  };
}

export type InferenceWarning = {
  code: "hidden_marriage_inferable" | "hidden_person_inferable" | "hidden_adoption_inferable";
  /** 設定している人(管理者)にだけ表示する警告文 */
  message: string;
  relId?: string;
  viewer: string;
};

/**
 * 公開設定の変更前に出す警告。非公開にしても、公開されている情報同士から推測される可能性を知らせる。
 * 例:非公開の婚姻でも、その二人が共に見える子の親なら「二人は夫婦だった」と推測される。
 */
export function inferenceWarnings(input: TreeInput, cfg: PrivacyConfig, viewerAccountId: string): InferenceWarning[] {
  const view = applyPrivacy(input, cfg, viewerAccountId);
  const ids = new Set(view.input.persons.map((p) => p.id));
  const shownMarriage = new Set(view.input.marriages.map((m) => m.id));
  const parentsOf = new Map<string, Set<string>>();
  for (const r of view.input.parentChild) {
    if (!parentsOf.has(r.childId)) parentsOf.set(r.childId, new Set());
    parentsOf.get(r.childId)?.add(r.parentId);
  }
  const out: InferenceWarning[] = [];
  for (const m of input.marriages) {
    if (shownMarriage.has(m.id) || !ids.has(m.a) || !ids.has(m.b)) continue;
    for (const ps of parentsOf.values()) {
      if (ps.has(m.a) && ps.has(m.b)) {
        out.push({
          code: "hidden_marriage_inferable",
          viewer: viewerAccountId,
          relId: m.id,
          message:
            "この婚姻は非公開ですが、お二人が共通のお子さんの親として表示されるため、ご夫婦だったことが推測される可能性があります。",
        });
        break;
      }
    }
  }
  for (const r of input.parentChild) {
    if (r.kind === "biological" || r.kind === "legal") continue;
    if (view.input.parentChild.some((x) => x.id === r.id)) continue;
    if (ids.has(r.parentId) && ids.has(r.childId)) {
      out.push({
        code: "hidden_adoption_inferable",
        viewer: viewerAccountId,
        relId: r.id,
        message: "養子縁組は非公開ですが、続柄や年齢差から関係が推測される可能性があります。",
      });
    }
  }
  return out;
}
