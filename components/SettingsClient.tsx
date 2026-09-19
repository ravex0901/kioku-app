"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FAMILY_RELATION_OPTIONS, labelFor } from "@/lib/constants";
import type { FamilyMember, FamilyRelation } from "@/lib/types";

export function SettingsClient({
  userId,
  displayName,
  purpose,
  initialFamily,
}: {
  userId: string;
  displayName: string;
  purpose: string | null;
  initialFamily: FamilyMember[];
}) {
  const [family, setFamily] = useState(initialFamily);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<FamilyRelation>("eldest_son");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [inactiveDays, setInactiveDays] = useState("14");
  const [approverId, setApproverId] = useState("");

  async function handleInvite() {
    const trimmed = name.trim();
    if (!trimmed) {
      setInviteError("お名前を入力してください。");
      return;
    }
    setInviting(true);
    setInviteError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("family_members")
      .insert({
        user_id: userId,
        name: trimmed,
        relation,
      })
      .select()
      .single();
    setInviting(false);

    if (error || !data) {
      setInviteError("招待に失敗しました。もう一度お試しください。");
      return;
    }
    setFamily((prev) => [data, ...prev]);
    setName("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-700 text-sm font-bold text-white">
          {displayName.slice(0, 1)}
        </span>
        <div>
          <p className="font-semibold text-ink">{displayName}</p>
          <p className="text-xs text-ink/60">
            {purpose || "生前整理を考えている"}
          </p>
        </div>
      </div>

      <section
        id="family"
        className="scroll-mt-20 rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm sm:p-6"
      >
        <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-gold">
          家族
        </h2>
        {family.length === 0 ? (
          <p className="mb-4 text-sm text-ink/60">
            まだ家族が招待されていません。
          </p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2">
            {family.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between rounded-xl border border-green-100 bg-white px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-ink">{member.name}</span>
                <span className="text-xs text-ink/50">
                  {labelFor(FAMILY_RELATION_OPTIONS, member.relation)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">お名前</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例:田中 一郎"
              className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">続柄</label>
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value as FamilyRelation)}
              className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            >
              {FAMILY_RELATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {inviteError && (
            <p className="text-sm text-red-600">{inviteError}</p>
          )}
          <button
            type="button"
            onClick={handleInvite}
            disabled={inviting}
            className="rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-60"
          >
            {inviting ? "招待中…" : "家族を招待する"}
          </button>
        </div>
      </section>

      <section
        id="handover"
        className="scroll-mt-20 rounded-[1.75rem] border border-gold/40 bg-gold/10 p-5 shadow-sm sm:p-6"
      >
        <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-gold">
          もしもの時(引き継ぎ設定)
          <span className="ml-1.5 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-ink/50">
            コンセプト機能
          </span>
        </h2>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">
              非アクティブと判定するまでの日数
            </label>
            <select
              value={inactiveDays}
              onChange={(e) => setInactiveDays(e.target.value)}
              className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            >
              <option value="7">7日</option>
              <option value="14">14日</option>
              <option value="30">30日</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">
              確認・開示の承認者
            </label>
            <select
              value={approverId}
              onChange={(e) => setApproverId(e.target.value)}
              disabled={family.length === 0}
              className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 disabled:bg-black/5 disabled:text-ink/40"
            >
              {family.length === 0 ? (
                <option value="">先に家族を招待してください</option>
              ) : (
                family.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <button
            type="button"
            disabled={family.length === 0}
            className="rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-40"
          >
            この内容で設定する
          </button>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm sm:p-6">
        <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-ink/40">
          その他の管理
        </h2>
        <div className="flex flex-col gap-2">
          <Link
            href="/locations"
            className="rounded-xl border border-green-100 bg-white px-4 py-3 text-sm font-medium text-ink transition hover:bg-black/[0.02]"
          >
            場所を管理する
          </Link>
          <Link
            href="/digital"
            className="rounded-xl border border-green-100 bg-white px-4 py-3 text-sm font-medium text-ink transition hover:bg-black/[0.02]"
          >
            契約・情報のしおり(デジタル情報)
          </Link>
        </div>
      </section>
    </div>
  );
}
