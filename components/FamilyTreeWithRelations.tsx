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
import type { MarriageStatus, ParentKind } from "@/lib/familyTree/types";
import { addFamilyRelationship, deleteFamilyRelationship } from "@/app/actions/familyRelationships";

// 家系図+「離婚・再婚・親子のつながり」を登録する欄。
// 登録した関係は、その場で家系図に反映される(家系図は画面側で作り直す)。
// データベースの準備(family_relationships テーブル)がまだのときは「お試し」で動き、保存はしない。

export type PersonOption = {
  key: string;
  ref: PersonRef;
  label: string;
};

type Props = {
  viewerId: string;
  viewerName: string;
  viewerDeceased?: boolean;
  rows: FamilyRow[];
  accounts: AccountNode[];
  /** 本人が登録した家族のうち、アカウントのない人(関係を登録したときだけ家系図に出す) */
  memberRows: FamilyRow[];
  people: PersonOption[];
  saved: ExplicitRelRow[];
  /** 保存できるか(テーブルがあるか) */
  available: boolean;
  editHref?: string;
};

const MARRIAGE_OPTIONS: { value: MarriageStatus; label: string }[] = [
  { value: "married", label: "結婚している" },
  { value: "divorced", label: "離婚した" },
  { value: "widowed", label: "死別した" },
  { value: "common_law", label: "事実婚" },
];

const PARENT_OPTIONS: { value: ParentKind; label: string }[] = [
  { value: "biological", label: "実の親子" },
  { value: "adoptive", label: "養子(普通養子)" },
  { value: "special_adoptive", label: "養子(特別養子)" },
  { value: "step", label: "連れ子(継親子)" },
];

const ORDER_OPTIONS = [
  { value: "", label: "わからない" },
  { value: "1", label: "1回目の結婚" },
  { value: "2", label: "2回目の結婚" },
  { value: "3", label: "3回目の結婚" },
  { value: "4", label: "4回目の結婚" },
];

const selectCls =
  "min-h-[50px] w-full rounded-lg border border-black/10 bg-white px-4 py-2.5 text-base outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100";

const refKey = (r: PersonRef) => (r.accountId ? `a:${r.accountId}` : `m:${r.memberId}`);

export function FamilyTreeWithRelations({
  viewerId,
  viewerName,
  viewerDeceased,
  rows,
  accounts,
  memberRows,
  people,
  saved: initialSaved,
  available,
  editHref,
}: Props) {
  const [saved, setSaved] = useState<ExplicitRelRow[]>(initialSaved);
  const [drafts, setDrafts] = useState<ExplicitRelRow[]>([]);
  const [mode, setMode] = useState<"marriage" | "parent_child">("marriage");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const selfKey = `a:${viewerId}`;
  // 夫婦
  const [mA, setMA] = useState(selfKey);
  const [mB, setMB] = useState("");
  const [mStatus, setMStatus] = useState<MarriageStatus>("divorced");
  const [mOrder, setMOrder] = useState("");
  // 親子
  const [pChild, setPChild] = useState("");
  const [pParent, setPParent] = useState("");
  const [pKind, setPKind] = useState<ParentKind>("biological");

  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people]);
  const nameOf = (r: PersonRef) => byKey.get(refKey(r))?.label ?? "(登録が見つからない人)";

  const all = useMemo(() => [...saved, ...drafts], [saved, drafts]);

  const input = useMemo(() => {
    // 関係に出てくる、アカウントのない家族だけを家系図に加える
    const used = new Set<string>();
    for (const e of all) {
      if (e.a.memberId) used.add(e.a.memberId);
      if (e.b.memberId) used.add(e.b.memberId);
    }
    const have = new Set(rows.map((r) => r.id));
    const extra = memberRows.filter((r) => used.has(r.id) && !have.has(r.id));
    try {
      return buildTreeInput({
        viewerId,
        viewerName,
        viewerDeceased,
        rows: [...rows, ...extra],
        accounts,
        explicit: all,
        relationLabel: familyRelationLabel,
      });
    } catch (e) {
      console.error("buildTreeInput failed", e);
      return null;
    }
  }, [all, rows, memberRows, accounts, viewerId, viewerName, viewerDeceased]);

  function describe(e: ExplicitRelRow): string {
    if (e.type === "marriage") {
      const st = MARRIAGE_OPTIONS.find((o) => o.value === e.marriageStatus)?.label ?? "夫婦";
      const ord = e.marriageOrder ? `(${e.marriageOrder}回目の結婚)` : "";
      return `${nameOf(e.a)} と ${nameOf(e.b)}:${st}${ord}`;
    }
    const kind = PARENT_OPTIONS.find((o) => o.value === e.parentKind)?.label ?? "親子";
    return `${nameOf(e.b)} の親は ${nameOf(e.a)}(${kind})`;
  }

  function add() {
    setMessage(null);
    let row: ExplicitRelRow;
    if (mode === "marriage") {
      const a = byKey.get(mA);
      const b = byKey.get(mB);
      if (!a || !b) return setMessage({ kind: "error", text: "2人とも選んでください。" });
      if (a.key === b.key) return setMessage({ kind: "error", text: "同じ人どうしは登録できません。" });
      row = {
        id: "",
        type: "marriage",
        a: a.ref,
        b: b.ref,
        marriageStatus: mStatus,
        marriageOrder: mOrder ? Number(mOrder) : null,
      };
    } else {
      const child = byKey.get(pChild);
      const parent = byKey.get(pParent);
      if (!child || !parent) return setMessage({ kind: "error", text: "子どもと親を選んでください。" });
      if (child.key === parent.key) return setMessage({ kind: "error", text: "同じ人どうしは登録できません。" });
      row = { id: "", type: "parent_child", a: parent.ref, b: child.ref, parentKind: pKind };
    }

    if (!available) {
      setDrafts((d) => [...d, { ...row, id: `draft-${Date.now()}` }]);
      setMessage({ kind: "ok", text: "お試しで家系図に反映しました(保存はされていません)。" });
      return;
    }

    startTransition(async () => {
      const res = await addFamilyRelationship(
        row.type === "marriage"
          ? {
              type: "marriage",
              a: row.a,
              b: row.b,
              marriageStatus: row.marriageStatus as MarriageStatus,
              marriageOrder: row.marriageOrder ?? null,
            }
          : { type: "parent_child", parent: row.a, child: row.b, parentKind: row.parentKind as ParentKind }
      );
      if (!res.ok) {
        setMessage({ kind: "error", text: res.error });
        return;
      }
      setSaved((s) => [...s, { ...row, id: res.id }]);
      setMessage({ kind: "ok", text: "保存して、家系図に反映しました。" });
    });
  }

  function remove(e: ExplicitRelRow) {
    setMessage(null);
    if (e.id.startsWith("draft-")) {
      setDrafts((d) => d.filter((x) => x.id !== e.id));
      return;
    }
    if (!window.confirm(`「${describe(e)}」を削除しますか?`)) return;
    startTransition(async () => {
      const res = await deleteFamilyRelationship(e.id);
      if (!res.ok) {
        setMessage({ kind: "error", text: res.error });
        return;
      }
      setSaved((s) => s.filter((x) => x.id !== e.id));
    });
  }

  const others = people.filter((p) => p.key !== selfKey);

  return (
    <div className="flex flex-col gap-8">
      {input ? (
        <FamilyTreeView input={input} editHref={editHref} />
      ) : (
        <p className="rounded-2xl bg-card p-5 text-base text-ink/70">家系図を作れませんでした。</p>
      )}

      <section className="rounded-[1.75rem] border border-divider bg-card p-5 shadow-sm sm:p-7">
        <h2 className="font-serif-jp text-2xl font-bold text-ink">離婚・再婚・親子のつながり</h2>
        <p className="mt-2 text-base leading-relaxed text-ink/70">
          離婚した方や再婚した方、「どの方との間のお子さんか」を登録すると、家系図に正しく線が引かれます。
          離婚は一本線に斜線、結婚中は二重線で表示されます。
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink/60">
          ここに登録した内容は、ご本人だけが見られます。ご家族の画面には表示されません。
        </p>

        {!available && (
          <div className="mt-4 rounded-xl border border-gold/50 bg-gold/10 p-4 text-base leading-relaxed text-ink">
            <p className="font-semibold">いまは「お試し」です</p>
            <p className="mt-1 text-sm text-ink/80">
              ここで追加した関係は、家系図にすぐ反映されますが、保存はされません(ページを開き直すと消えます)。
              保存できるようにするには、データベースの準備が必要です。
            </p>
          </div>
        )}

        <div className="mt-5 flex gap-2" role="tablist" aria-label="登録する関係の種類">
          {(
            [
              ["marriage", "夫婦の関係"],
              ["parent_child", "親子の関係"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                setMessage(null);
              }}
              className={`min-h-[48px] flex-1 rounded-full px-4 text-base font-semibold transition ${
                mode === value ? "bg-green-700 text-white" : "border border-green-700/40 bg-white text-green-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {people.length < 2 ? (
          <p className="mt-5 text-base text-ink/70">
            まず「設定」からご家族を登録してください。登録した方を、ここで選べるようになります。
          </p>
        ) : mode === "marriage" ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-base font-semibold text-ink">1人目</span>
              <select className={selectCls} value={mA} onChange={(e) => setMA(e.target.value)}>
                {people.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-base font-semibold text-ink">2人目(お相手)</span>
              <select className={selectCls} value={mB} onChange={(e) => setMB(e.target.value)}>
                <option value="">選んでください</option>
                {people
                  .filter((p) => p.key !== mA)
                  .map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
              </select>
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-base font-semibold text-ink">いまの状態</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {MARRIAGE_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className={`flex min-h-[48px] cursor-pointer items-center justify-center rounded-lg border px-3 text-base ${
                      mStatus === o.value
                        ? "border-green-700 bg-green-50 font-semibold text-green-800"
                        : "border-black/10 bg-white text-ink"
                    }`}
                  >
                    <input
                      type="radio"
                      name="marriage-status"
                      className="sr-only"
                      checked={mStatus === o.value}
                      onChange={() => setMStatus(o.value)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-base font-semibold text-ink">何回目の結婚か(わかれば)</span>
              <select className={selectCls} value={mOrder} onChange={(e) => setMOrder(e.target.value)}>
                {ORDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="text-sm text-ink/60">前の結婚の方が左、いまの結婚の方が右に並びます。</span>
            </label>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-base font-semibold text-ink">お子さん</span>
              <select className={selectCls} value={pChild} onChange={(e) => setPChild(e.target.value)}>
                <option value="">選んでください</option>
                {others.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-base font-semibold text-ink">その方の親</span>
              <select className={selectCls} value={pParent} onChange={(e) => setPParent(e.target.value)}>
                <option value="">選んでください</option>
                {people
                  .filter((p) => p.key !== pChild)
                  .map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-base font-semibold text-ink">親子の種類</span>
              <select className={selectCls} value={pKind} onChange={(e) => setPKind(e.target.value as ParentKind)}>
                {PARENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="text-sm text-ink/60">
                ご本人の「息子」「娘」として登録済みの方は、ご本人が親として自動で入っています。
                もう一人の親(前の配偶者など)だけを登録すると、お二人の線の下に入ります。
              </span>
            </label>
          </div>
        )}

        {people.length >= 2 && (
          <button
            type="button"
            onClick={add}
            disabled={pending}
            className="mt-5 min-h-[52px] w-full rounded-full bg-green-700 px-6 text-lg font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-60"
          >
            {pending ? "保存しています…" : available ? "登録する" : "お試しで家系図に反映する"}
          </button>
        )}

        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`mt-3 text-base ${message.kind === "error" ? "text-red-600" : "text-green-800"}`}
          >
            {message.text}
          </p>
        )}

        {all.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-ink">登録した関係</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {all.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-3 rounded-xl border border-black/5 bg-white px-4 py-3 text-base text-ink"
                >
                  <span className="min-w-0 flex-1 break-words">
                    {describe(e)}
                    {e.id.startsWith("draft-") && (
                      <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-xs text-ink/70">お試し</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(e)}
                    disabled={pending}
                    className="min-h-[44px] shrink-0 rounded-full border border-red-300 px-4 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
