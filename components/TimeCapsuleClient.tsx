"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  createTimeCapsule,
  submitMarriageCertificate,
} from "@/app/actions/timeCapsule";
import type {
  FamilyMember,
  ReceivedTimeCapsule,
  TimeCapsule,
  TimeCapsuleUnlockConditionType,
} from "@/lib/types";

const MAX_MS = 120000; // 最大2分

const UNLOCK_CONDITION_OPTIONS: {
  value: TimeCapsuleUnlockConditionType;
  label: string;
  hint: string;
}[] = [
  {
    value: "date",
    label: "日付を指定する",
    hint: "指定した日が来たら開封できます。",
  },
  {
    value: "adulthood",
    label: "成人になったら",
    hint: "宛先の方が18歳になった時点で開封できます(宛先の方の生年月日の登録が必要です)。",
  },
  {
    value: "marriage",
    label: "結婚したら",
        hint: "宛先の方が婚姻届(または婚姻届受理証明書・戸籍謄本・戸籍抄本等)の画像を提出し、AIが確認できた時点で開封できます。",
  },
  {
    value: "same_age_as_sender",
    label: "送った本人と同じ歳になったら",
    hint: "宛先の方が、あなたがこのタイムカプセルを送った時と同じ年齢になった時点で開封できます(あなた自身の生年月日の登録が必要です)。",
  },
];

function conditionLabel(type: TimeCapsuleUnlockConditionType) {
  return UNLOCK_CONDITION_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

function minOpenDate() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function TimeCapsuleClient({
  locked,
  unlocked,
  audioMap,
  linkedFamilyMembers = [],
  received = [],
  receivedAudioMap = {},
}: {
  locked: TimeCapsule[];
  unlocked: TimeCapsule[];
  audioMap: Record<string, string>;
  linkedFamilyMembers?: FamilyMember[];
  received?: ReceivedTimeCapsule[];
  receivedAudioMap?: Record<string, string>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientFamilyMemberId, setRecipientFamilyMemberId] = useState("");
  const [unlockConditionType, setUnlockConditionType] =
    useState<TimeCapsuleUnlockConditionType>("date");
  const [messageText, setMessageText] = useState("");
  const [openAt, setOpenAt] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [openedIds, setOpenedIds] = useState<Set<string>>(new Set());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const blobRef = useRef<Blob | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  async function startRecording() {
    setError(null);
    setPreviewUrl(null);
    blobRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        blobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_MS) stopRecording();
      }, 200);
    } catch {
      setError(
        "マイクにアクセスできませんでした。ブラウザの権限設定をご確認ください。"
      );
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function discardRecording() {
    blobRef.current = null;
    setPreviewUrl(null);
  }

  function resetForm() {
    setTitle("");
    setRecipientName("");
    setRecipientFamilyMemberId("");
    setUnlockConditionType("date");
    setMessageText("");
    setOpenAt("");
    discardRecording();
  }

  async function handleSubmit() {
    if (!title.trim()) {
      setError("タイトルを入力してください。");
      return;
    }
    if (unlockConditionType === "date" && !openAt) {
      setError("開封日を指定してください。");
      return;
    }
    if (unlockConditionType !== "date" && !recipientFamilyMemberId) {
      setError(
        "年齢や結婚を条件にする場合は、紐付け済みの家族アカウント宛てに送る必要があります。"
      );
      return;
    }
    if (!messageText.trim() && !blobRef.current) {
      setError("テキストか声のどちらかでメッセージを残してください。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("recipientName", recipientName.trim());
      formData.append("recipientFamilyMemberId", recipientFamilyMemberId);
      formData.append("unlockConditionType", unlockConditionType);
      formData.append("messageText", messageText.trim());
      formData.append("openAt", openAt);
      if (blobRef.current) {
        formData.append("audio", blobRef.current, "message.webm");
      }
      const result = await createTimeCapsule(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setDone(true);
        resetForm();
      }
    } catch {
      setError("保存に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleOpen(id: string) {
    setOpenedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-6 shadow-sm">
        {!showForm && !done ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-green-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-green-800"
          >
            新しいタイムカプセルを残す
          </button>
        ) : done ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <p className="text-sm font-semibold text-green-700">
              タイムカプセルを残しました。指定した日まで大切に保管されます。
            </p>
            <button
              type="button"
              onClick={() => setDone(false)}
              className="text-xs text-ink/50 underline underline-offset-2"
            >
              閉じる
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold tracking-widest text-green-700/70">
              新しいタイムカプセル
            </p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タイトル(例: 20歳になったあなたへ)"
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
            <input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="宛先(例: 孫のゆうたへ)・省略可"
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />

            {linkedFamilyMembers.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink/60">
                  宛先の家族アカウント(成人・結婚などの条件を使う場合は必須)
                </label>
                <select
                  value={recipientFamilyMemberId}
                  onChange={(e) => setRecipientFamilyMemberId(e.target.value)}
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
                >
                  <option value="">指定しない(日付のみで開封)</option>
                  {linkedFamilyMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-ink/60">
                開封の条件
              </label>
              <select
                value={unlockConditionType}
                onChange={(e) =>
                  setUnlockConditionType(
                    e.target.value as TimeCapsuleUnlockConditionType
                  )
                }
                disabled={linkedFamilyMembers.length === 0}
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 disabled:opacity-50"
              >
                {UNLOCK_CONDITION_OPTIONS.map((o) => (
                  <option
                    key={o.value}
                    value={o.value}
                    disabled={o.value !== "date" && linkedFamilyMembers.length === 0}
                  >
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-ink/50">
                {
                  UNLOCK_CONDITION_OPTIONS.find(
                    (o) => o.value === unlockConditionType
                  )?.hint
                }
              </p>
            </div>

            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={4}
              placeholder="残したいメッセージを書いてみましょう…"
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />

            <div className="flex flex-wrap items-center gap-2">
              {!recording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={submitting}
                  className="rounded-full bg-green-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-800 disabled:opacity-50"
                >
                  声で残す
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
                >
                  録音を止める({Math.floor(elapsedMs / 1000)}秒)
                </button>
              )}
              {previewUrl && (
                <button
                  type="button"
                  onClick={discardRecording}
                  disabled={submitting}
                  className="rounded-full border border-black/10 px-4 py-2 text-xs text-ink/60 transition hover:bg-black/5"
                >
                  録音をやり直す
                </button>
              )}
            </div>

            {previewUrl && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio src={previewUrl} controls className="w-full" />
            )}

            {unlockConditionType === "date" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink/60">
                  開封日
                </label>
                <input
                  type="date"
                  value={openAt}
                  min={minOpenDate()}
                  onChange={(e) => setOpenAt(e.target.value)}
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
                />
              </div>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-full bg-green-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:opacity-50"
              >
                {submitting ? "保存中…" : "封をする"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                  setError(null);
                }}
                disabled={submitting}
                className="rounded-full border border-black/10 px-4 py-2 text-xs text-ink/60 transition hover:bg-black/5"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>

      {received.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink">
            家族から受け取ったタイムカプセル
          </h2>
          <div className="flex flex-col gap-4">
            {received.map((c) => (
              <ReceivedCapsuleCard
                key={c.id}
                capsule={c}
                audioUrl={
                  c.unlocked && c.messageAudioPath
                    ? receivedAudioMap[c.messageAudioPath]
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}

      {unlocked.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink">開封できるもの</h2>
          <div className="flex flex-col gap-4">
            {unlocked.map((c) => {
              const isOpen = openedIds.has(c.id);
              return (
                <div
                  key={c.id}
                  className="rounded-2xl border border-gold/40 bg-white/70 p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-ink/40">
                        開封日 {formatDate(c.open_at)}
                      </p>
                      <p className="mt-1 font-serif-jp text-base font-bold text-ink">
                        {c.title}
                      </p>
                      {c.recipient_name && (
                        <p className="text-xs text-ink/50">
                          宛先: {c.recipient_name}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleOpen(c.id)}
                      className="shrink-0 rounded-full bg-gold/20 px-4 py-2 text-xs font-semibold text-green-800 transition hover:bg-gold/30"
                    >
                      {isOpen ? "閉じる" : "開封する"}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="mt-3 border-t border-black/5 pt-3">
                      {c.message_text && (
                        <p className="whitespace-pre-wrap text-sm text-ink/80">
                          {c.message_text}
                        </p>
                      )}
                      {c.message_audio_path &&
                        audioMap[c.message_audio_path] && (
                          // eslint-disable-next-line jsx-a11y/media-has-caption
                          <audio
                            src={audioMap[c.message_audio_path]}
                            controls
                            className="mt-2 w-full"
                          />
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-bold text-ink">ロック中</h2>
        {locked.length === 0 ? (
          <p className="text-sm text-ink/50">
            ロック中のタイムカプセルはありません。
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {locked.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-4 rounded-2xl border border-black/5 bg-black/[0.02] p-5"
              >
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink/40"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                    <rect
                      x="5"
                      y="10.5"
                      width="14"
                      height="9"
                      rx="1.6"
                      stroke="currentColor"
                      strokeWidth={1.6}
                    />
                    <path
                      d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
                      stroke="currentColor"
                      strokeWidth={1.6}
                    />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif-jp text-sm font-bold text-ink">
                    {c.title}
                  </p>
                  <p className="text-xs text-ink/50">
                    {formatDate(c.open_at)}に開封できます(あと
                    {daysUntil(c.open_at)}日)
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReceivedCapsuleCard({
  capsule,
  audioUrl,
}: {
  capsule: ReceivedTimeCapsule;
  audioUrl?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<
    { verified: boolean; reason: string } | null
  >(null);

  if (capsule.unlocked) {
    return (
      <div className="rounded-2xl border border-gold/40 bg-white/70 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-ink/40">
              {conditionLabel(capsule.unlockConditionType)}・差出人:{" "}
              {capsule.senderName}
            </p>
            <p className="mt-1 font-serif-jp text-base font-bold text-ink">
              {capsule.title}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="shrink-0 rounded-full bg-gold/20 px-4 py-2 text-xs font-semibold text-green-800 transition hover:bg-gold/30"
          >
            {isOpen ? "閉じる" : "開封する"}
          </button>
        </div>
        {isOpen && (
          <div className="mt-3 border-t border-black/5 pt-3">
            {capsule.messageText && (
              <p className="whitespace-pre-wrap text-sm text-ink/80">
                {capsule.messageText}
              </p>
            )}
            {audioUrl && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio src={audioUrl} controls className="mt-2 w-full" />
            )}
          </div>
        )}
      </div>
    );
  }

  async function handleSubmitCertificate() {
    if (!file) {
      setError("画像を選択してください。");
      return;
    }
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("image", file);
      const result = await submitMarriageCertificate(capsule.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setVerifyResult({ verified: result.verified, reason: result.reason });
      if (result.verified) {
        // AIが婚姻届と確認できた場合は自動開封されるため、画面を更新して反映する。
        window.location.reload();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-black/[0.02] p-5">
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-ink/40"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <rect
              x="5"
              y="10.5"
              width="14"
              height="9"
              rx="1.6"
              stroke="currentColor"
              strokeWidth={1.6}
            />
            <path
              d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
              stroke="currentColor"
              strokeWidth={1.6}
            />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif-jp text-sm font-bold text-ink">
            {capsule.title}
          </p>
          <p className="text-xs text-ink/50">
            差出人: {capsule.senderName} ・ 条件:{" "}
            {conditionLabel(capsule.unlockConditionType)}
          </p>
        </div>
      </div>

      {capsule.unlockConditionType === "marriage" && (
        <div className="rounded-xl border border-black/10 bg-white/70 p-3">
          {capsule.marriageSubmitted && !verifyResult ? (
            <p className="text-xs text-ink/60">
              婚姻届(または婚姻届受理証明書・戸籍謄本・戸籍抄本)の画像を提出済みです。確認結果をお待ちください。
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-ink/60">
                結婚されたら、婚姻届・婚姻届受理証明書・戸籍謄本(戸籍全部事項証明書)・戸籍抄本(戸籍個人事項証明書)のいずれかの画像を提出してください。AIが内容を確認し、問題がなければその場で開封されます。
              </p>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mb-2 block w-full text-xs"
              />
              {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
              {verifyResult && !verifyResult.verified && (
                <p className="mb-2 text-xs text-red-600">
                  AIが結婚を証明する書類として確認できませんでした: {verifyResult.reason}
                  。別の画像で再度お試しください。
                </p>
              )}
              <button
                type="button"
                onClick={handleSubmitCertificate}
                disabled={pending}
                className="rounded-full bg-green-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
              >
                {pending ? "確認中…" : "画像を提出する"}
              </button>
            </>
          )}
        </div>
      )}

      {capsule.unlockConditionType !== "marriage" && (
        <p className="text-xs text-ink/50">
          {conditionLabel(capsule.unlockConditionType)}の条件を満たすと、自動的に開封できるようになります。
        </p>
      )}
    </div>
  );
}
