"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FAMILY_RELATION_OPTIONS, familyRelationLabel, familyRelationOptionsFor } from "@/lib/constants";
import { requestFamilyLink } from "@/app/actions/familyLinkRequests";
import { RienDialog } from "@/components/RienDialog";
import { detachFromFamilyTree } from "@/app/actions/familyUnlink";
import {
  setFamilyShareSettings,
  setFamilyItemsDirectShare,
  markFamilyMemberDeceased,
  setFamilyLegacyShare,
  type FamilyShareSettings,
} from "@/app/actions/familyNetwork";
import type { FamilyMember, FamilyRelation } from "@/lib/types";

// 家族の欄(招待・アカウントIDで申請・続柄の修正・紐づけの解除・故人の設定・共有の設定)。
// 2026-11-11 から、設定画面ではなく家系図の画面(/family-tree)の図の下に置く。
// 家族を足したり直したりしたら、画面を読み直して家系図にもすぐ反映する。

export function FamilySection({
  userId,
  accountCode,
  initialFamily,
  initialFamilyShareSettings,
  initialDeceasedStatus,
  initialLegacyShareStatus,
  linkedGenders = {},
  initialBlockedIds = [],
  directIds = [],
}: {
  userId: string;
  accountCode: string | null;
  initialFamily: FamilyMember[];
  initialFamilyShareSettings?: FamilyShareSettings;
  initialDeceasedStatus?: Record<string, boolean>;
  initialLegacyShareStatus?: Record<string, boolean>;
  /** アカウントでつながっている相手の性別(続柄の選択肢を、相手の性別に合うものだけにする) */
  linkedGenders?: Record<string, string>;
  /** 離縁して、お互いに写真・日記などが見えない相手 */
  initialBlockedIds?: string[];
  /** 直接つながっている相手(故人の「間接のご家族にも共有する」を変えられる) */
  directIds?: string[];
}) {
  const router = useRouter();
  const [family, setFamily] = useState(initialFamily);

  // 間接の家族(孫・甥姪など2ホップ以上先)にも、自分の日記・持ち物を共有するか。
  const [shareJournalWithNetwork, setShareJournalWithNetwork] = useState(
    initialFamilyShareSettings?.shareJournalWithNetwork ?? false
  );
  const [shareItemsWithNetwork, setShareItemsWithNetwork] = useState(
    initialFamilyShareSettings?.shareItemsWithNetwork ?? false
  );
  // つながっているご家族(直接の家族)に、自分の持ち物を見せるか。
  const [shareItemsWithDirect, setShareItemsWithDirect] = useState(
    initialFamilyShareSettings?.shareItemsWithDirect ?? false
  );
  const [savingDirectShare, setSavingDirectShare] = useState(false);
  const [directShareSaved, setDirectShareSaved] = useState(false);

  async function handleSaveDirectShare(next: boolean) {
    const previous = shareItemsWithDirect;
    setShareItemsWithDirect(next);
    setSavingDirectShare(true);
    setDirectShareSaved(false);
    const result = await setFamilyItemsDirectShare(next);
    setSavingDirectShare(false);
    if (result.ok) {
      setDirectShareSaved(true);
      setTimeout(() => setDirectShareSaved(false), 2000);
    } else {
      setShareItemsWithDirect(previous);
    }
  }

  const [savingNetworkShare, setSavingNetworkShare] = useState(false);
  const [networkShareSaved, setNetworkShareSaved] = useState(false);

  async function handleSaveNetworkShare(
    nextJournal: boolean,
    nextItems: boolean
  ) {
    setShareJournalWithNetwork(nextJournal);
    setShareItemsWithNetwork(nextItems);
    setSavingNetworkShare(true);
    setNetworkShareSaved(false);
    const result = await setFamilyShareSettings(nextJournal, nextItems);
    setSavingNetworkShare(false);
    if (result.ok) {
      setNetworkShareSaved(true);
      setTimeout(() => setNetworkShareSaved(false), 2000);
    }
  }

  // つながっている家族のうち、アカウントと紐付いている相手の「故人」フラグと、
  // (故人の場合の)間接の家族への共有可否。直接つながっている家族なら誰でも変更できる。
  const [deceasedStatus, setDeceasedStatus] = useState<Record<string, boolean>>(
    initialDeceasedStatus ?? {}
  );
  const [legacyShareStatus, setLegacyShareStatus] = useState<
    Record<string, boolean>
  >(initialLegacyShareStatus ?? {});
  const [savingDeceasedId, setSavingDeceasedId] = useState<string | null>(
    null
  );
  // 「離縁」:家系図には残し、相手(と相手だけにつながっている方)とお互いの写真・日記などを見えなくする
  const [rienTarget, setRienTarget] = useState<FamilyMember | null>(null);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set(initialBlockedIds));
  // 家系図から復縁したときなど、サーバーから届く一覧が変わったら合わせる
  const blockedKey = initialBlockedIds.join(",");
  useEffect(() => {
    setBlockedIds(new Set(blockedKey ? blockedKey.split(",") : []));
  }, [blockedKey]);
  function handleRienDone(linkedUserId: string) {
    setBlockedIds((prev) => new Set([...prev, linkedUserId]));
    router.refresh();
  }
  // 離縁した方は家族欄に出さない(家系図には残り、そこから復縁できる)
  const listed = family.filter((m) => !m.linked_user_id || !blockedIds.has(m.linked_user_id));

  // 家系図から自分を切り離す(家族欄をすべて消す。取り消せない)
  const [detachStep, setDetachStep] = useState<0 | 1>(0);
  const [detachAgree, setDetachAgree] = useState(false);
  const [detaching, setDetaching] = useState(false);
  const [detachError, setDetachError] = useState<string | null>(null);
  async function handleDetach() {
    setDetaching(true);
    setDetachError(null);
    const r = await detachFromFamilyTree();
    setDetaching(false);
    if (!r.ok) {
      setDetachError(r.error);
      return;
    }
    setFamily([]);
    setBlockedIds(new Set());
    setDetachStep(0);
    setDetachAgree(false);
    router.refresh();
  }

  async function handleToggleDeceased(linkedUserId: string, next: boolean) {
    setSavingDeceasedId(linkedUserId);
    const result = await markFamilyMemberDeceased(linkedUserId, next);
    setSavingDeceasedId(null);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    setDeceasedStatus((prev) => ({ ...prev, [linkedUserId]: next }));
    router.refresh();
    if (!next) {
      setLegacyShareStatus((prev) => ({ ...prev, [linkedUserId]: false }));
    }
  }

  async function handleToggleLegacyShare(
    deceasedUserId: string,
    next: boolean
  ) {
    setSavingDeceasedId(deceasedUserId);
    const result = await setFamilyLegacyShare(deceasedUserId, next);
    setSavingDeceasedId(null);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    setLegacyShareStatus((prev) => ({ ...prev, [deceasedUserId]: next }));
  }
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<FamilyRelation>("son");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // 自分のアカウントIDをコピーするためのUI状態。
  const [accountCodeCopied, setAccountCodeCopied] = useState(false);
  async function handleCopyAccountCode() {
    if (!accountCode) return;
    try {
      await navigator.clipboard.writeText(accountCode);
      setAccountCodeCopied(true);
      setTimeout(() => setAccountCodeCopied(false), 2000);
    } catch {
      // クリップボードが使用できない場合は何もしない
    }
  }

  // 相手のアカウントIDを指定して、招待リンクを使わずに
  // 既存アカウントとその場で紐付ける機能。メールアドレスは使わない。
  const [linkAccountCode, setLinkAccountCode] = useState("");
  const [linkRelation, setLinkRelation] = useState<FamilyRelation>("father");
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);

  async function handleLinkByAccountId() {
    const trimmed = linkAccountCode.trim().toUpperCase();
    if (!trimmed) {
      setLinkError("相手のアカウントIDを入力してください。");
      return;
    }
    setLinking(true);
    setLinkError(null);
    setLinkSuccess(null);
    const result = await requestFamilyLink(trimmed, linkRelation);
    setLinking(false);
    if (!result.ok) {
      setLinkError(result.error);
      return;
    }
    setLinkSuccess(
      result.alreadyRequested
        ? `${result.targetName}さんへの申請はすでに届いています。相手が許可するとつながります。`
        : `${result.targetName}さんに申請を送りました。相手が許可すると、家族としてつながります。`
    );
    setLinkAccountCode("");
  }

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
    router.refresh();
  }

  // 続柄を後から修正する(例:メールアドレスでつないだ直後は「その他」に
  // なっている相手の続柄を、本来の関係に直す)。
  async function handleUpdateRelation(
    memberId: string,
    newRelation: FamilyRelation
  ) {
    setFamily((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, relation: newRelation } : m))
    );
    const supabase = createClient();
    await supabase
      .from("family_members")
      .update({ relation: newRelation })
      .eq("id", memberId)
      .eq("user_id", userId);
    router.refresh();
  }

  // 家族招待リンク(ご家族がご自身のアカウントで紐付けるためのリンク)のコピー
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  async function handleCopyInviteLink(member: FamilyMember) {
    if (!member.invite_token) return;
    const fullUrl = `${window.location.origin}/invite/${member.invite_token}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedInviteId(member.id);
      setTimeout(() => setCopiedInviteId(null), 2000);
    } catch {
      // クリップボードが使用できない場合は何もしない
    }
  }

  return (
    <>
      {rienTarget && (
        <RienDialog member={rienTarget} onClose={() => setRienTarget(null)} onDone={handleRienDone} />
      )}
      <section
        id="family"
        className="scroll-mt-20 rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm sm:p-6"
      >
        <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-gold">
          家族
        </h2>
        {listed.length === 0 ? (
          <p className="mb-4 text-sm text-ink/60">
            まだ家族が招待されていません。
          </p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2">
            {listed.map((member) => (
              <li
                key={member.id}
                className="flex flex-col gap-2 rounded-xl border border-green-100 bg-white px-4 py-2.5 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{member.name}</span>
                  <select
                    value={member.relation}
                    onChange={(e) =>
                      handleUpdateRelation(
                        member.id,
                        e.target.value as FamilyRelation
                      )
                    }
                    className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs text-ink/70 outline-none focus:border-green-400"
                  >
                    {!familyRelationOptionsFor(
                      member.linked_user_id ? linkedGenders[member.linked_user_id] : null
                    ).some((opt) => opt.value === member.relation) && (
                      <option value={member.relation}>
                        {familyRelationLabel(member.relation)}
                      </option>
                    )}
                    {familyRelationOptionsFor(
                      member.linked_user_id ? linkedGenders[member.linked_user_id] : null
                    ).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {member.linked_user_id ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700">
                        ✓ ご本人のアカウントとつながり済み
                      </span>
                      <button
                        type="button"
                        onClick={() => setRienTarget(member)}
                        className="rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-medium text-ink/50 transition hover:bg-black/5"
                      >
                        離縁
                      </button>
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-ink/60">
                      <input
                        type="checkbox"
                        checked={Boolean(deceasedStatus[member.linked_user_id])}
                        disabled={savingDeceasedId === member.linked_user_id}
                        onChange={(e) =>
                          handleToggleDeceased(
                            member.linked_user_id as string,
                            e.target.checked
                          )
                        }
                        className="h-4 w-4 rounded border-black/20"
                      />
                      故人として設定する
                    </label>
                    {deceasedStatus[member.linked_user_id] && !directIds.includes(member.linked_user_id) && (
                      <p className="rounded-lg bg-black/5 px-2.5 py-2 text-[11px] text-ink/60">
                        孫など間接のご家族への共有は、この方と直接つながっているご家族だけが設定できます(いまは
                        {legacyShareStatus[member.linked_user_id] ? "共有しています" : "共有していません"})。
                      </p>
                    )}
                    {deceasedStatus[member.linked_user_id] && directIds.includes(member.linked_user_id) && (
                      <label className="flex items-start gap-2 rounded-lg bg-black/5 px-2.5 py-2 text-[11px] text-ink/60">
                        <input
                          type="checkbox"
                          checked={Boolean(
                            legacyShareStatus[member.linked_user_id]
                          )}
                          disabled={savingDeceasedId === member.linked_user_id}
                          onChange={(e) =>
                            handleToggleLegacyShare(
                              member.linked_user_id as string,
                              e.target.checked
                            )
                          }
                          className="mt-0.5 h-4 w-4 rounded border-black/20"
                        />
                        孫など間接のご家族にも、この方の日記・持ち物を家族の思い出として共有する
                      </label>
                    )}
                  </>
                ) : member.invite_token ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-black/10 bg-white/70 px-2.5 py-1.5">
                    <span className="truncate text-[11px] text-ink/50">
                      {`/invite/${member.invite_token}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyInviteLink(member)}
                      className="shrink-0 rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-medium text-ink/70 transition hover:bg-black/5"
                    >
                      {copiedInviteId === member.id ? "コピーしました" : "招待リンクをコピー"}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mb-3 text-xs text-ink/50">
          招待リンクをご家族に送ると、ご家族がご自身のアカウントでサインアップ(またはログイン)してつながれます。アカウントを作らない場合でも、「もしもの時」の共有リンクはこれまで通り使えます。
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-lg font-medium text-ink/80">お名前</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例:田中 一郎"
              className="min-h-[50px] rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-lg font-medium text-ink/80">続柄</label>
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value as FamilyRelation)}
              className="min-h-[50px] rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
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
            className="inline-flex min-h-[50px] items-center justify-center rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-60"
          >
            {inviting ? "招待中…" : "家族を招待する"}
          </button>
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-ink/40">
          <span className="h-px flex-1 bg-black/10" />
          または
          <span className="h-px flex-1 bg-black/10" />
        </div>

        <p className="mb-3 text-xs text-ink/50">
          ご家族がすでにこのアプリのアカウントをお持ちの場合は、招待リンクを使わず、「アカウントID」を指定してその場で申請できます(メールアドレスを伝える必要はありません)。申請を送っただけではまだつながらず、相手がホーム画面で「許可」を押してはじめて、家族としてつながります。
        </p>

        <div className="mb-4 rounded-xl border border-green-100 bg-green-50/60 px-4 py-3">
          <p className="mb-1 text-xs font-medium text-ink/60">
            あなたのアカウントID(家族に伝えてつないでもらいましょう)
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-lg font-bold tracking-widest text-green-800">
              {accountCode ?? "発行準備中…"}
            </span>
            {accountCode && (
              <button
                type="button"
                onClick={handleCopyAccountCode}
                className="shrink-0 rounded-full border border-green-700 px-3 py-1.5 text-xs font-medium text-green-700 transition hover:bg-green-100"
              >
                {accountCodeCopied ? "コピーしました" : "コピー"}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-lg font-medium text-ink/80">
              相手のアカウントID
            </label>
            <input
              value={linkAccountCode}
              onChange={(e) => setLinkAccountCode(e.target.value)}
              placeholder="例:AB3KX9Q2"
              className="min-h-[50px] rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm uppercase outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-lg font-medium text-ink/80">
              あなたから見て、その方の続柄
            </label>
            <select
              value={linkRelation}
              onChange={(e) => setLinkRelation(e.target.value as FamilyRelation)}
              className="min-h-[50px] rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            >
              {FAMILY_RELATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {linkError && <p className="text-sm text-red-600">{linkError}</p>}
          {linkSuccess && (
            <p className="text-sm text-green-700">{linkSuccess}</p>
          )}
          <button
            type="button"
            onClick={handleLinkByAccountId}
            disabled={linking}
            className="inline-flex min-h-[50px] items-center justify-center rounded-full border border-green-700 px-5 py-2.5 text-sm font-semibold text-green-700 shadow-sm transition hover:bg-green-50 disabled:opacity-60"
          >
            {linking ? "送信しています…" : "アカウントIDで申請する"}
          </button>
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-ink/40">
          <span className="h-px flex-1 bg-black/10" />
          つながっているご家族への共有
          <span className="h-px flex-1 bg-black/10" />
        </div>

        <p className="mb-3 text-xs text-ink/50">
          チェックを入れると、アカウントでつながっているご家族が、ご家族の「AIと日記」の画面であなたの持ち物の記録(写真・名前・分類など)を見られるようになります。初期設定ではOFFです。
        </p>
        <div className="flex flex-col gap-3 rounded-xl border border-black/5 bg-white/70 p-4">
          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              checked={shareItemsWithDirect}
              disabled={savingDirectShare}
              onChange={(e) => handleSaveDirectShare(e.target.checked)}
              className="h-4 w-4 rounded border-black/20"
            />
            持ち物の記録を、つながっているご家族にも見せる
          </label>
          {directShareSaved && (
            <p className="text-xs text-green-700">設定を保存しました。</p>
          )}
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-ink/40">
          <span className="h-px flex-1 bg-black/10" />
          間接のご家族への共有
          <span className="h-px flex-1 bg-black/10" />
        </div>

        <p className="mb-3 text-xs text-ink/50">
          ご家族がさらにご親戚とつながっている場合、お名前と続柄(世代差)は「間接のご家族」として自動的に表示されます。日記や持ち物まで見られるようにするかは、下記でご自身が選べます(初期設定ではOFFです)。
        </p>
        <div className="flex flex-col gap-3 rounded-xl border border-black/5 bg-white/70 p-4">
          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              checked={shareJournalWithNetwork}
              disabled={savingNetworkShare}
              onChange={(e) =>
                handleSaveNetworkShare(e.target.checked, shareItemsWithNetwork)
              }
              className="h-4 w-4 rounded border-black/20"
            />
            「AIと日記」を間接のご家族にも共有する
          </label>
          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              checked={shareItemsWithNetwork}
              disabled={savingNetworkShare}
              onChange={(e) =>
                handleSaveNetworkShare(shareJournalWithNetwork, e.target.checked)
              }
              className="h-4 w-4 rounded border-black/20"
            />
            持ち物の記録を間接のご家族にも共有する
          </label>
          {networkShareSaved && (
            <p className="text-xs text-green-700">設定を保存しました。</p>
          )}
        </div>

        <div className="mt-8 rounded-xl border border-red-200 bg-red-50/60 p-4">
          <h3 className="text-sm font-bold text-red-800">家系図から自分を切り離す(紐づけ解除)</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink/70">
            ご家族とのつながりをすべて解除し、家族欄を空にします。名前だけで登録したご家族や招待リンクも消えます。
          </p>
          {detachStep === 0 && (
            <button
              type="button"
              onClick={() => setDetachStep(1)}
              className="mt-3 inline-flex min-h-[48px] items-center justify-center rounded-full border border-red-600 px-5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              紐づけ解除
            </button>
          )}
          {detachStep >= 1 && (
            <div className="mt-3 flex flex-col gap-3 rounded-lg bg-white p-3 text-sm text-ink/80">
              <p className="font-semibold text-ink">解除すると、次のようになります。元に戻せません。</p>
              <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
                <li>あなたの家族欄が空になり、家系図にはあなただけが残ります</li>
                <li>ご家族の家族欄・家系図からも、あなたが消えます</li>
                <li>ご家族と、お互いの写真・日記・持ち物などが見えなくなります</li>
                <li>タイムカプセルの宛先・「もしもの時」の承認者や引き継ぎ先に指定したご家族の指定も外れます</li>
              </ul>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={detachAgree}
                  onChange={(e) => setDetachAgree(e.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded border-black/20"
                />
                上の内容を確認しました
              </label>
              {detachError && <p className="text-sm text-red-600">{detachError}</p>}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={detaching}
                  onClick={() => {
                    setDetachStep(0);
                    setDetachAgree(false);
                  }}
                  className="min-h-[48px] rounded-full border border-black/15 bg-white text-sm text-ink"
                >
                  やめる
                </button>
                <button
                  type="button"
                  disabled={!detachAgree || detaching}
                  onClick={handleDetach}
                  className="min-h-[48px] rounded-full bg-red-600 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {detaching ? "解除しています…" : "すべて解除する"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
