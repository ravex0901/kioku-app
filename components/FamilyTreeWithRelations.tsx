"use client";

import { useMemo, useState, useTransition } from "react";
import { FamilyTreeView } from "@/components/FamilyTreeView";
import { familyRelationLabel } from "@/lib/constants";
import {
  buildTreeInput,
  type AccountNode,
  type ExplicitRelRow,
  type FamilyRow,
  type PersonRef,
} from "@/lib/familyTree/fromRows";
import type { MarriageStatus } from "@/lib/familyTree/types";
import {
  addFamilyRelationship,
  addFormerSpouse,
  deleteFamilyRelationship,
  type RelationshipInput,
} from "@/app/actions/familyRelationships";

// 家系図+「ご家族のつながり」欄。
// むずかしい選び方をせず、質問に答えてボタンを押すだけで登録できる:
//   1. 配偶者ごとに「結婚している/離婚した/亡くなった」
//   2. お子さんごとに「もう一人の親はどなた?」
// 登録した内容は、その場で家系図に反映される(家系図は画面側で作り直す)。
// データベースの準備(family_relationships テーブル)がまだのときは「お試し」で動き、何も保存しない。

export type PersonOption = {
  key: string;
  ref: PersonRef;
  name: string;
  /** ご本人から見た続柄(ご本人は undefined) */
  relation?: string;
  label: string;
};

type Props = {
  viewerId: string;
  viewerName: string;
  viewerDeceased?: boolean;
  rows: FamilyRow[];
  accounts: AccountNode[];
  /** ご本人が登録した家族のうち、アカウントのない人 */
  memberRows: FamilyRow[];
  people: PersonOption[];
  /** アカウントのない家族のうち、家系図にいつも出す方(招待リンクのない方:前の配偶者・残した方) */
  alwaysShowMemberIds?: string[];
  saved: ExplicitRelRow[];
  /** 保存できるか(テーブルがあるか) */
  available: boolean;
  editHref?: string;
};

const SPOUSE_BUTTONS: { value: MarriageStatus; label: string }[] = [
  { value: "married", label: "結婚している" },
  { value: "divorced", label: "離婚した" },
  { value: "widowed", label: "亡くなった" },
];

const CHILD_RELATIONS = new Set(["son", "daughter", "eldest_son", "eldest_daughter"]);
const SPOUSE_RELATIONS = new Set(["spouse", "ex_spouse"]);

const refKey = (r: PersonRef) => (r.accountId ? `a:${r.accountId}` : `m:${r.memberId}`);

let draftSeq = 0;
const draftId = (prefix: string) => `draft-${prefix}-${Date.now()}-${++draftSeq}`;

export function FamilyTreeWithRelations({
  viewerId,
  viewerName,
  viewerDeceased,
  rows,
  accounts,
  memberRows: initialMemberRows,
  people: initialPeople,
  alwaysShowMemberIds,
  saved: initialSaved,
  available,
  editHref,
}: Props) {
  const [saved, setSaved] = useState<ExplicitRelRow[]>(initialSaved);
  const [memberRows, setMemberRows] = useState<FamilyRow[]>(initialMemberRows);
  const [people, setPeople] = useState<PersonOption[]>(initialPeople);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const selfKey = `a:${viewerId}`;
  const selfRef: PersonRef = { accountId: viewerId };

  // ---- 家系図(登録内容をその場で反映) ----
  const input = useMemo(() => {
    const used = new Set<string>();
    for (const e of saved) {
      if (e.a.memberId) used.add(e.a.memberId);
      if (e.b.memberId) used.add(e.b.memberId);
    }
    const have = new Set(rows.map((r) => r.id));
    const always = new Set(alwaysShowMemberIds ?? []);
    // アカウントのない家族は、「元配偶者」・家系図に残すために登録した方・つながりを登録した方だけ家系図に出す
    // (招待リンクを送って、まだ参加していない方は出さない)
    const extra = memberRows.filter(
      (r) => !have.has(r.id) && (used.has(r.id) || always.has(r.id) || r.relation === "ex_spouse")
    );
    try {
      return buildTreeInput({
        viewerId,
        viewerName,
        viewerDeceased,
        rows: [...rows, ...extra],
        accounts,
        explicit: saved,
        relationLabel: familyRelationLabel,
      });
    } catch (e) {
      console.error("buildTreeInput failed", e);
      return null;
    }
  }, [saved, rows, memberRows, alwaysShowMemberIds, accounts, viewerId, viewerName, viewerDeceased]);

  // ---- 配偶者・お子さん ----
  const marriageWith = (key: string) =>
    saved.find(
      (e) =>
        e.type === "marriage" &&
        ((refKey(e.a) === selfKey && refKey(e.b) === key) || (refKey(e.b) === selfKey && refKey(e.a) === key))
    );

  const spouses = people.filter(
    (p) => p.key !== selfKey && (SPOUSE_RELATIONS.has(p.relation ?? "") || Boolean(marriageWith(p.key)))
  );
  const children = people.filter((p) => p.key !== selfKey && CHILD_RELATIONS.has(p.relation ?? ""));

  const spouseStatus = (p: PersonOption): MarriageStatus => {
    const e = marriageWith(p.key);
    if (e?.marriageStatus) return e.marriageStatus;
    return p.relation === "ex_spouse" ? "divorced" : "married";
  };

  const otherParentOf = (child: PersonOption) =>
    saved.find(
      (e) =>
        e.type === "parent_child" &&
        refKey(e.b) === child.key &&
        refKey(e.a) !== selfKey &&
        spouses.some((s) => s.key === refKey(e.a))
    );

  // ---- 保存(お試しのときは画面の中だけで反映) ----
  async function replace(old: ExplicitRelRow | undefined, next: RelationshipInput | null): Promise<boolean> {
    if (!available) {
      setSaved((list) => {
        const rest = old ? list.filter((x) => x.id !== old.id) : list;
        if (!next) return rest;
        const row: ExplicitRelRow =
          next.type === "marriage"
            ? { id: draftId("r"), type: "marriage", a: next.a, b: next.b, marriageStatus: next.marriageStatus }
            : { id: draftId("r"), type: "parent_child", a: next.parent, b: next.child, parentKind: next.parentKind };
        return [...rest, row];
      });
      return true;
    }
    if (old) {
      const res = await deleteFamilyRelationship(old.id);
      if (!res.ok) {
        setMessage({ kind: "error", text: res.error });
        return false;
      }
      setSaved((list) => list.filter((x) => x.id !== old.id));
    }
    if (next) {
      const res = await addFamilyRelationship(next);
      if (!res.ok) {
        setMessage({ kind: "error", text: res.error });
        return false;
      }
      const row: ExplicitRelRow =
        next.type === "marriage"
          ? { id: res.id, type: "marriage", a: next.a, b: next.b, marriageStatus: next.marriageStatus }
          : { id: res.id, type: "parent_child", a: next.parent, b: next.child, parentKind: next.parentKind };
      setSaved((list) => [...list, row]);
    }
    return true;
  }

  const done = (text: string) =>
    setMessage({ kind: "ok", text: available ? `${text}家系図に反映しました。` : `${text}お試しで家系図に反映しました(保存はされていません)。` });

  function chooseSpouseStatus(p: PersonOption, status: MarriageStatus) {
    setMessage(null);
    if (spouseStatus(p) === status) return;
    const old = marriageWith(p.key);
    // 続柄どおりの状態に戻すときは、登録を消すだけでよい
    const defaultStatus: MarriageStatus = p.relation === "ex_spouse" ? "divorced" : "married";
    const next: RelationshipInput | null =
      status === defaultStatus && SPOUSE_RELATIONS.has(p.relation ?? "")
        ? null
        : { type: "marriage", a: selfRef, b: p.ref, marriageStatus: status };
    startTransition(async () => {
      if (await replace(old, next)) done(`${p.name}さんを「${SPOUSE_BUTTONS.find((b) => b.value === status)?.label}」にして、`);
    });
  }

  function chooseOtherParent(child: PersonOption, parent: PersonOption | null) {
    setMessage(null);
    const old = otherParentOf(child);
    if ((old ? refKey(old.a) : null) === (parent?.key ?? null)) return;
    const next: RelationshipInput | null = parent
      ? { type: "parent_child", parent: parent.ref, child: child.ref, parentKind: "biological" }
      : null;
    startTransition(async () => {
      if (await replace(old, next)) {
        done(parent ? `${child.name}さんのもう一人の親を${parent.name}さんにして、` : `${child.name}さんのもう一人の親を「わからない」にして、`);
      }
    });
  }

  function addEx() {
    setMessage(null);
    const name = newName.trim();
    if (!name) {
      setMessage({ kind: "error", text: "お名前を入れてください。" });
      return;
    }
    const register = (member: { id: string; name: string; created_at: string }) => {
      setMemberRows((list) => [
        ...list,
        { id: member.id, ownerId: viewerId, name: member.name, relation: "ex_spouse", linkedUserId: null, createdAt: member.created_at },
      ]);
      setPeople((list) => [
        ...list,
        {
          key: `m:${member.id}`,
          ref: { memberId: member.id },
          name: member.name,
          relation: "ex_spouse",
          label: `${member.name}(元配偶者)`,
        },
      ]);
      setNewName("");
      setAdding(false);
    };
    if (!available) {
      register({ id: draftId("m"), name, created_at: new Date().toISOString() });
      done(`${name}さんを前の配偶者として追加し、`);
      return;
    }
    startTransition(async () => {
      const res = await addFormerSpouse(name);
      if (!res.ok) {
        setMessage({ kind: "error", text: res.error });
        return;
      }
      register(res.member);
      done(`${res.member.name}さんを前の配偶者として追加し、`);
    });
  }

  const pill = (active: boolean) =>
    `min-h-[52px] rounded-xl border-2 px-4 text-base font-semibold transition disabled:opacity-60 ${
      active ? "border-green-700 bg-green-700 text-white" : "border-black/10 bg-white text-ink hover:border-green-400"
    }`;

  return (
    <div className="flex flex-col gap-8">
      {input ? (
        <FamilyTreeView input={input} editHref={editHref} />
      ) : (
        <p className="rounded-2xl bg-card p-5 text-base text-ink/70">家系図を作れませんでした。</p>
      )}

      <section className="rounded-[1.75rem] border border-divider bg-card p-5 shadow-sm sm:p-7">
        <h2 className="font-serif-jp text-2xl font-bold text-ink">ご家族のつながりを教えてください</h2>
        <p className="mt-2 text-base leading-relaxed text-ink/70">
          あてはまるボタンを押すだけで、家系図に反映されます。わからないところは、そのままで大丈夫です。
        </p>

        {!available && (
          <div className="mt-4 rounded-xl border border-gold/50 bg-gold/10 p-4">
            <p className="text-base font-semibold text-ink">いまは「お試し」です</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/80">
              押した内容は家系図にすぐ反映されますが、保存はされません(ページを開き直すと元に戻ります)。
            </p>
          </div>
        )}

        {/* 1. 配偶者 */}
        <div className="mt-6">
          <h3 className="text-xl font-bold text-ink">① 配偶者</h3>
          {spouses.length === 0 && (
            <p className="mt-2 text-base text-ink/70">配偶者はまだ登録されていません。</p>
          )}
          <ul className="mt-3 flex flex-col gap-4">
            {spouses.map((p) => {
              const st = spouseStatus(p);
              return (
                <li key={p.key} className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-lg font-semibold text-ink">{p.name}さん</p>
                  <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label={`${p.name}さんとの関係`}>
                    {SPOUSE_BUTTONS.map((b) => (
                      <button
                        key={b.value}
                        type="button"
                        aria-pressed={st === b.value}
                        disabled={pending}
                        onClick={() => chooseSpouseStatus(p, b.value)}
                        className={pill(st === b.value)}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          {adding ? (
            <div className="mt-4 rounded-2xl border-2 border-dashed border-green-700/40 bg-white p-4">
              <label className="flex flex-col gap-2">
                <span className="text-base font-semibold text-ink">前の配偶者のお名前</span>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) addEx();
                  }}
                  maxLength={50}
                  placeholder="例:山田 花子"
                  className="min-h-[52px] rounded-lg border border-black/10 bg-white px-4 text-lg outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
                  autoFocus
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setNewName("");
                  }}
                  className="min-h-[52px] rounded-full border border-black/15 bg-white text-base text-ink"
                >
                  やめる
                </button>
                <button
                  type="button"
                  onClick={addEx}
                  disabled={pending}
                  className="min-h-[52px] rounded-full bg-green-700 text-base font-semibold text-white disabled:opacity-60"
                >
                  追加する
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setMessage(null);
              }}
              className="mt-4 min-h-[52px] w-full rounded-full border-2 border-green-700/50 bg-white text-base font-semibold text-green-800 hover:bg-green-50"
            >
              ＋ 前の配偶者(離婚した方)を追加する
            </button>
          )}
        </div>

        {/* 2. お子さん */}
        <div className="mt-8">
          <h3 className="text-xl font-bold text-ink">② お子さん</h3>
          {children.length === 0 ? (
            <p className="mt-2 text-base text-ink/70">
              お子さんはまだ登録されていません。「設定」の家族のところから登録できます。
            </p>
          ) : spouses.length === 0 ? (
            <p className="mt-2 text-base text-ink/70">
              配偶者を登録すると、お子さんがどなたとのお子さんかを選べるようになります。
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-4">
              {children.map((c) => {
                const cur = otherParentOf(c);
                const curKey = cur ? refKey(cur.a) : null;
                return (
                  <li key={c.key} className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-lg font-semibold text-ink">
                      {c.name}さんの、もう一人の親は?
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {spouses.map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          aria-pressed={curKey === s.key}
                          disabled={pending}
                          onClick={() => chooseOtherParent(c, s)}
                          className={pill(curKey === s.key)}
                        >
                          {s.name}さん
                        </button>
                      ))}
                      <button
                        type="button"
                        aria-pressed={curKey === null}
                        disabled={pending}
                        onClick={() => chooseOtherParent(c, null)}
                        className={pill(curKey === null)}
                      >
                        わからない
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`mt-5 rounded-xl px-4 py-3 text-base ${
              message.kind === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"
            }`}
          >
            {message.text}
          </p>
        )}

        <p className="mt-6 text-sm leading-relaxed text-ink/60">
          ここで登録した内容は、ご本人だけが見られます。ご家族の画面には表示されません。
        </p>
      </section>
    </div>
  );
}
