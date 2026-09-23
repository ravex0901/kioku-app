"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { HandoverRecipient } from "@/lib/types";

// 動画は非公開バケットに保存し、共有相手専用リンクからも長期間閲覧できるよう
// 有効期限の長い署名付きURLを発行してvideo_urlに保存する(アップロード時点で発行)。
const VIDEO_SIGNED_URL_EXPIRES_IN = 60 * 60 * 24 * 365 * 10; // 10年
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 200MB

// 共有相手1人分の、その人専用の遺言動画・遺言書・共有リンクを編集するカード。
// 「共有を複数人でき、共有者一人一人に遺言動画と遺言書が設定できる」要望に対応。
export function RecipientWillEditor({
  userId,
  recipient,
  onDeleted,
}: {
  userId: string;
  recipient: HandoverRecipient;
  onDeleted: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState(recipient.message ?? "");
  const [videoUrl, setVideoUrl] = useState(recipient.video_url ?? "");
  const [legalNote, setLegalNote] = useState(recipient.legal_will_note ?? "");
  const [legalAck, setLegalAck] = useState(
    !!recipient.legal_disclaimer_acknowledged_at
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      const path = `${userId}/will-video-${recipient.id}-${crypto.randomUUID()}.${ext}`;

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

      setVideoUrl(signedData.signedUrl);
    } catch {
      setVideoUploadError(
        "動画のアップロードに失敗しました。もう一度お試しください。"
      );
    } finally {
      setVideoUploading(false);
    }
  }

  async function handleSave() {
    setSaved(false);
    setError(null);

    const trimmedLegalNote = legalNote.trim();
    if (trimmedLegalNote && !legalAck) {
      setError(
        "法的な遺言事項を保存するには、下の注意事項を確認のうえチェックを入れてください。"
      );
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("handover_recipients")
      .update({
        message: message.trim() || null,
        video_url: videoUrl.trim() || null,
        legal_will_note: trimmedLegalNote || null,
        legal_disclaimer_acknowledged_at:
          trimmedLegalNote && legalAck ? new Date().toISOString() : null,
      })
      .eq("id", recipient.id)
      .eq("user_id", userId);
    setSaving(false);

    if (updateError) {
      setError("保存に失敗しました。もう一度お試しください。");
      return;
    }
    setSaved(true);
  }

  async function handleDelete() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`${recipient.name}さんへの共有を削除しますか?`)
    ) {
      return;
    }
    setDeleting(true);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("handover_recipients")
      .delete()
      .eq("id", recipient.id)
      .eq("user_id", userId);
    setDeleting(false);
    if (!deleteError) {
      onDeleted(recipient.id);
    }
  }

  async function handleCopyShareLink() {
    const fullUrl = `${window.location.origin}/handover/${recipient.share_token}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使用できない場合は何もしない
    }
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white/80 p-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left"
        >
          <p className="text-sm font-semibold text-ink">{recipient.name}</p>
          <p className="text-[11px] text-ink/40">
            {expanded ? "閉じる" : "遺言動画・遺言書を編集する"}
          </p>
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 text-xs font-medium text-red-600 underline disabled:opacity-60"
        >
          {deleting ? "削除中…" : "削除"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 flex flex-col gap-3 border-t border-black/5 pt-3">
          <p className="text-[11px] text-ink/40">
            ここに入力した内容は{recipient.name}さん専用のリンクからのみ開示されます。未入力の項目は、共通の意思伝達情報(上の①②)が代わりに使われます。
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">
              {recipient.name}さんへのメッセージ
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="この方だけに伝えたい想い・感謝の気持ちなどを自由にお書きください。"
              className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">
              メッセージ動画(任意)
            </label>
            {videoUrl ? (
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={videoUrl}
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
                  onClick={() => setVideoUrl("")}
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

          <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50/40 p-3">
            <p className="text-xs font-semibold text-ink/80">
              法的な遺言事項に関する記録(この方向け・任意)
            </p>
            <textarea
              value={legalNote}
              onChange={(e) => setLegalNote(e.target.value)}
              rows={3}
              placeholder="この方に関わる資産の分け方の希望などを記録する場合はこちらに入力してください(正式な遺言書の代わりにはなりません)。"
              className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
            <label className="flex items-start gap-2 text-[11px] text-ink/70">
              <input
                type="checkbox"
                checked={legalAck}
                onChange={(e) => setLegalAck(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-red-600"
              />
              正式な遺言書ではないことを理解しました。
            </label>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          {saved && <p className="text-xs text-green-700">保存しました。</p>}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="self-start rounded-full bg-green-700 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-60"
          >
            {saving ? "保存中…" : "この方向けの内容を保存する"}
          </button>

          <div className="rounded-xl border border-black/10 bg-white/70 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink/70">
                {recipient.name}さん専用の共有リンク
              </p>
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="shrink-0 rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-medium text-ink/70 transition hover:bg-black/5"
              >
                {copied ? "コピーしました" : "コピー"}
              </button>
            </div>
            <p className="break-all text-xs text-ink/50">{`/handover/${recipient.share_token}`}</p>
          </div>
        </div>
      )}
    </div>
  );
}

