"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FAMILY_RELATION_OPTIONS, labelFor } from "@/lib/constants";
import { VoiceSettings } from "@/components/VoiceSettings";
import type {
  FamilyMember,
  FamilyRelation,
  HandoverSettings,
  Will,
} from "@/lib/types";

export function SettingsClient({
  userId,
  displayName,
  purpose,
  initialFamily,
  initialWill,
  initialHandover,
}: {
  userId: string;
  displayName: string;
  purpose: string | null;
  initialFamily: FamilyMember[];
  initialWill: Will | null;
  initialHandover: HandoverSettings | null;
}) {
  const [family, setFamily] = useState(initialFamily);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<FamilyRelation>("eldest_son");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [inactiveDays, setInactiveDays] = useState(
    String(initialHandover?.inactive_days ?? 36500)
  );
  const [approverId, setApproverId] = useState(
    initialHandover?.approver_family_member_id ?? ""
  );
  const [handover, setHandover] = useState(initialHandover);
  const [savingHandover, setSavingHandover] = useState(false);
  const [handoverSaved, setHandoverSaved] = useState(false);

  const [willMessage, setWillMessage] = useState(initialWill?.message ?? "");
  const [willVideoUrl, setWillVideoUrl] = useState(
    initialWill?.video_url ?? ""
  );
  const [savingWill, setSavingWill] = useState(false);
  const [willSaved, setWillSaved] = useState(false);
  const [willError, setWillError] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(
    null
  );

  // 動画は非公開バケットに保存し、家族への共有リンクからも長期間閲覧できるよう
  // 有効期限の長い署名付きURLを発行してvideo_urlに保存する(アップロード時点で発行)。
  const VIDEO_SIGNED_URL_EXPIRES_IN = 60 * 60 * 24 * 365 * 10; // 10年
  const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 200MB

  async function handleVideoFileChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      setVideoUploadError(
        "動画ファイルが大きすぎます(200MBまで)。別のファイルをお選びください。"
      );
      return;
    }

    setVideoUploadError(null);
    setVideoUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "mp4";
      const path = `${userId}/will-video-${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("item-media")
        .upload(path, file);

      if (uploadError) {
        setVideoUploadError(
          "動画のアップロードに失敗しました。もう一度お試しください。"
        );
        return;
      }

      const { data: signedData, error: signError } = await supabase.storage
        .from("item-media")
        .createSignedUrl(path, VIDEO_SIGNED_URL_EXPIRES_IN);

      if (signError || !signedData) {
        setVideoUploadError(
          "動画のアップロードに失敗しました。もう一度お試しください。"
        );
        return;
      }

      setWillVideoUrl(signedData.signedUrl);
    } catch {
      setVideoUploadError(
        "動画のアップロードに失敗しました。もう一度お試しください。"
      );
    } finally {
      setVideoUploading(false);
    }
  }

  // 法的な遺言事項(財産分业など)。本人の想い・メッスージとは明確に分けて保持する(請求項8対応)。
  const [legalWillNote, setLegalWillNote] = useState(
    initialWill?.legal_will_note ?? ""
  );
  const [legalDisclaimerAcknowledged, setLegalDisclaimerAcknowledged] =
    useState(!!initialWill?.legal_disclaimer_acknowledged_at);

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

  async function handleSaveHandover() {
    setSavingHandover(true);
    setHandoverSaved(false);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("handover_settings")
      .upsert(
        {
          user_id: userId,
          inactive_days: Number(inactiveDays),
          approver_family_member_id: approverId || null,
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();
    setSavingHandover(false);
    if (!error && data) {
      setHandover(data);
      setHandoverSaved(true);
    }
  }

  async function handleSaveWill() {
    setWillSaved(false);
    setWillError(null);

    const trimmedLegalNote = legalWillNote.trim();
    if (trimmedLegalNote && !legalDisclaimerAcknowledged) {
      setWillError(
        "法的な遺言事項を保存するには、下の注意事項を確認のうえチェックを入れてください。"
      );
      return;
    }

    setSavingWill(true);
    const supabase = createClient();
    const { error } = await supabase.from("wills").upsert(
      {
        user_id: userId,
        message: willMessage.trim() || null,
        video_url: willVideoUrl.trim() || null,
        legal_will_note: trimmedLegalNote || null,
        legal_disclaimer_acknowledged_at:
          trimmedLegalNote && legalDisclaimerAcknowledged
            ? new Date().toISOString()
            : null,
      },
      { onConflict: "user_id" }
    );
    setSavingWill(false);
    if (!error) {
      setWillSaved(true);
    } else {
      setWillError("保存に失敗しました。もう一度お試しください。");
    }
  }

  const [copied, setCopied] = useState(false);
  const sharePath = handover ? `/handover/${handover.share_token}` : null;

  async function handleCopyShareLink() {
    if (!sharePath) return;
    const fullUrl = `${window.location.origin}${sharePath}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使用できない場合は何もしない
    }
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
        <h2 className="mb-1 text-xs font-semibold tracking-[0.15em] text-gold">
          もしもの時(意思伝達・引き継ぎ設定)
        </h2>
        <p className="mb-4 text-xs text-ink/50">
          ここに書いた遺言書・遺言動画は、下記の条件を満たしたときだけご家族に開示されます。ふだんは本人以外に見られません。
        </p>

        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-black/5 bg-white/70 p-4">
          <p className="text-sm font-semibold text-ink/80">
            ① ご家族への想い・メッセージ(本人の意思)
          </p>
          <p className="text-[11px] text-ink/40">
            財産分与などの法的な取り決めではなく、ご家族に伝えたい気持ちや感謝の言葉など、私的なメッセージを書く欄です。
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">
              ご家族へのメッセージ
            </label>
            <textarea
              value={willMessage}
              onChange={(e) => setWillMessage(e.target.value)}
              rows={4}
              placeholder="ご家族に伝えたい想い・感謝の気持ちなどを自由にお書きください。"
              className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">
              メッセージ動画(任意)
            </label>
            {willVideoUrl ? (
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={willVideoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-green-600 px-4 py-2 text-xs font-semibold text-green-700 transition hover:bg-green-50"
                >
                  動画を確認する
                </a>
                <label className="cursor-pointer text-xs font-medium text-ink/50 underline">
                  動画を変更する
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoFileChange}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setWillVideoUrl("")}
                  className="text-xs font-medium text-red-600 underline"
                >
                  削除する
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoFileChange}
                disabled={videoUploading}
                className="text-sm text-ink/70 file:mr-4 file:rounded-full file:border-0 file:bg-green-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-green-700 hover:file:bg-green-200 disabled:opacity-60"
              />
            )}
            {videoUploading && (
              <p className="text-xs text-ink/50">動画をアップロード中です…</p>
            )}
            {videoUploadError && (
              <p className="text-xs text-red-600">{videoUploadError}</p>
            )}
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/40 p-4">
          <p className="text-sm font-semibold text-ink/80">
            ② 法的な遺言事項に関する記録(財産の分け方など)
          </p>
          <div className="rounded-lg border border-red-200 bg-white/80 p-3">
            <p className="text-[11px] leading-relaxed text-red-700">
              ※これは正式な遺言書ではありません。民法で定める方式(自筆証書遺言・公正証書遺言など选
              </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">
              資産の分け方などにいてのメア
            </label>
            <textarea
              value={legalWillNote}
              onChange={(e) => setLegalWillNote(e.target.value)}
              rows={4}
              placeholder="資産の分け方の希望など、法的な遺言事項に関する記録を曏く場合はこちらに入力してください(正式な遺言書の代わりにはなりません)。"
              className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-ink/70">
            <input
              type="checkbox"
              checked={legalDisclaimerAcknowledged}
              onChange={(e) =>
                setLegalDisclaimerAcknowledged(e.target.checked)
              }
              className="mt-0.5 h-4 w-4 accent-red-600"
            />
            上記の注意事項(正式な遺言書ではないこと)を理解しました。
          </label>
          {willError && <p className="text-xs text-red-600">{willError}</p>}
          {willSaved && (
            <p className="text-xs text-green-700">保存しました。</p>
          )}
          <button
            type="button"
            onClick={handleSaveWill}
            disabled={savingWill}
            className="self-start rounded-full bg-green-700 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-60"
          >
            {savingWill ? "保存中…" : "意思伝達情報を保存する"}
          </button>
        </div>

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
              <option value="36500">なし(自動開示しない)</option>
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
                <>
                  <option value="">承認者を選択してください</option>
                  {family.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
          {handoverSaved && (
            <p className="text-xs text-green-700">設定を保存しました。</p>
          )}
          <button
            type="button"
            onClick={handleSaveHandover}
            disabled={family.length === 0 || savingHandover}
            className="rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-40"
          >
            {savingHandover ? "保存中…" : "この内容で設定する"}
          </button>

          {handover && sharePath && (
            <div className="mt-2 rounded-xl border border-black/10 bg-white/70 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-ink/70">
                  ご家族に共有するリンク
                </p>
                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className="shrink-0 rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-medium text-ink/70 transition hover:bg-black-5"
                >
                  {copied ? "コピーしました" : "コピー"}
                </button>
              </div>
              <p className="break-all text-xs text-ink/50">{sharePath}</p>
              <p className="mt-1.5 text-[11px] text-ink/40">
                {`本人が${handover.inactive_days}日間アプリを利用しなかった場合`}
                {handover.approver_family_member_id
                  ? "、承認者の承認をもって内容が開示されます。"
                  : "に、自動的に内容が開示されます。"}
            </p>
          </div>
         )}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm sm:p-6">
        <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-ink/40">
          AIの読み上げ音声
        </h2>
        <VoiceSettings />
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
            契約・情報のしおオ(デジタル情報)
          </Link>
        </div>
      </section>
    </div>
  );
}


