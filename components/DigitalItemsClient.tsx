"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { askAboutDigitalItems, type ReferencedDigitalItem } from "@/app/actions/digital";
import {
  DIGITAL_ITEM_STATUS_OPTIONS,
  DIGITAL_ITEM_TYPE_OPTIONS,
  DIGITAL_ITEM_TITLE_HINTS,
  labelFor,
} from "@/lib/constants";
import { checkForPlaintextSecret, SECRET_GUARD_MESSAGE } from "@/lib/secretGuard";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { DigitalItem, DigitalItemStatus, DigitalItemType } from "@/lib/types";

const TYPE_STYLE: Record<DigitalItemType, { bg: string; text: string }> = {
  subscription: { bg: "bg-sky-100", text: "text-sky-700" },
  account: { bg: "bg-green-100", text: "text-green-700" },
  data_storage: { bg: "bg-amber-100", text: "text-amber-700" },
  finance: { bg: "bg-gold/25", text: "text-green-800" },
  insurance: { bg: "bg-orange-100", text: "text-orange-700" },
  contract: { bg: "bg-black/5", text: "text-ink/70" },
  access_info: { bg: "bg-red-50", text: "text-red-600" },
  other: { bg: "bg-black/5", text: "text-ink/60" },
};

const STATUS_STYLE: Record<DigitalItemStatus, string> = {
  not_started: "bg-black/5 text-ink/60",
  in_progress: "bg-sky-100 text-sky-700",
  done: "bg-green-100 text-green-700",
};

function TypeIcon({ type }: { type: DigitalItemType }) {
  switch (type) {
    case "subscription":
      return (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth={1.7} />
          <path d="M3 10h18" stroke="currentColor" strokeWidth={1.7} />
        </svg>
      );
    case "finance":
    case "account":
      return (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M4 9.5 12 5l8 4.5V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5Z"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
          <path d="M9 19v-5h6v5" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
        </svg>
      );
    case "insurance":
      return (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
        </svg>
      );
    case "access_info":
      return (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <circle cx="8" cy="15" r="3.2" stroke="currentColor" strokeWidth={1.7} />
          <path d="m10.3 12.7 8.2-8.2M16 6l2 2M18.5 3.5l2 2" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
        </svg>
      );
    case "data_storage":
      return (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <ellipse cx="12" cy="6" rx="8" ry="3" stroke="currentColor" strokeWidth={1.7} />
          <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" stroke="currentColor" strokeWidth={1.7} />
          <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" stroke="currentColor" strokeWidth={1.7} />
        </svg>
      );
    case "contract":
    case "other":
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
          <path d="M9 12h6M9 16h6" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
        </svg>
      );
  }
}

function DigitalItemRow({
  item,
  onUpdated,
  onDeleted,
}: {
  item: DigitalItem;
  onUpdated: (item: DigitalItem) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [itemType, setItemType] = useState<DigitalItemType>(item.item_type);
  const [title, setTitle] = useState(item.title);
  const [memo, setMemo] = useState(item.memo ?? "");
  const [contactPerson, setContactPerson] = useState(item.contact_person ?? "");
  const [relatedDocuments, setRelatedDocuments] = useState(item.related_documents ?? "");
  const [status, setStatus] = useState<DigitalItemStatus>(item.status ?? "not_started");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const style = TYPE_STYLE[item.item_type] ?? TYPE_STYLE.other;

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("タイトルを入力してください。");
      return;
    }
    const guard = checkForPlaintextSecret(memo, relatedDocuments, contactPerson);
    if (guard.blocked) {
      setError(SECRET_GUARD_MESSAGE);
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("digital_items")
      .update({
        item_type: itemType,
        title: trimmed,
        memo: memo.trim() || null,
        contact_person: contactPerson.trim() || null,
        related_documents: relatedDocuments.trim() || null,
        status,
      })
      .eq("id", item.id)
      .eq("user_id", item.user_id)
      .select()
      .single();
    setSubmitting(false);

    if (updateError || !data) {
      setError("更新に失敗しました。もう一度お試しください。");
      return;
    }
    onUpdated(data);
    setEditing(false);
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("digital_items")
      .delete()
      .eq("id", item.id)
      .eq("user_id", item.user_id);

    if (deleteError) {
      setDeleting(false);
      setError("削除に失敗しました。もう一度お試しください。");
      return;
    }
    onDeleted(item.id);
  }

  if (editing) {
    return (
      <li className="rounded-[1.5rem] border border-green-200 bg-green-50/60 p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">種別</label>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value as DigitalItemType)}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            >
              {DIGITAL_ITEM_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">タイトル</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">一言メモ</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">手続担当者</label>
            <input
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="例:長男が対応"
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">関連書類</label>
            <input
              value={relatedDocuments}
              onChange={(e) => setRelatedDocuments(e.target.value)}
              placeholder="例:契約書は自宅の書類ファイルに保管"
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">状態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as DigitalItemStatus)}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            >
              {DIGITAL_ITEM_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
            >
              {submitting ? "保存中…" : "保存する"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setItemType(item.item_type);
                setTitle(item.title);
                setMemo(item.memo ?? "");
                setContactPerson(item.contact_person ?? "");
                setRelatedDocuments(item.related_documents ?? "");
                setStatus(item.status ?? "not_started");
                setError(null);
              }}
              className="rounded-full px-4 py-2 text-sm font-medium text-ink/60 hover:bg-black/5"
            >
              キャンセル
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-[1.5rem] border border-green-100 bg-white/70 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.bg} ${style.text}`}
          >
            <TypeIcon type={item.item_type} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${style.bg} ${style.text}`}
              >
                {labelFor(DIGITAL_ITEM_TYPE_OPTIONS, item.item_type)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  STATUS_STYLE[item.status ?? "not_started"]
                }`}
              >
                {labelFor(DIGITAL_ITEM_STATUS_OPTIONS, item.status ?? "not_started")}
              </span>
            </div>
            <p className="mt-0.5 font-medium text-ink">{item.title}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="編集する"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink/50 transition hover:bg-black/5 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="m4 20 .9-3.6L16.4 5A1.5 1.5 0 0 1 18.5 5l.5.5a1.5 1.5 0 0 1 0 2.1L7.6 19.1 4 20Z"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
            aria-label="削除する"
            className="flex h-8 w-8 items-center justify-center rounded-full text-red-500 transition hover:bg-red-50 disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 .7 12.1A1 1 0 0 0 8.7 20h6.6a1 1 0 0 0 1-.9L17 7"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      {item.memo && (
        <p className="whitespace-pre-wrap rounded-xl bg-black/[0.03] px-3 py-2 text-sm text-ink/70">
          {item.memo}
        </p>
      )}
      {(item.contact_person || item.related_documents) && (
        <div className="flex flex-col gap-1 text-xs text-ink/60">
          {item.contact_person && <p>手続担当者: {item.contact_person}</p>}
          {item.related_documents && <p>関連書類: {item.related_documents}</p>}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ConfirmDialog
        open={confirmOpen}
        title="この項目を削除しますか?"
        description={`「${item.title}」を削除します。この操作は取り消せません。`}
        onConfirm={() => {
          setConfirmOpen(false);
          handleDelete();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </li>
  );
}
export function DigitalItemsClient({
  userId,
  initialItems,
}: {
  userId: string;
  initialItems: DigitalItem[];
}) {
  const [items, setItems] = useState(initialItems);

  // 新しく残すフォーム
  const [itemType, setItemType] = useState<DigitalItemType>("subscription");
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [relatedDocuments, setRelatedDocuments] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 探す
  const [keyword, setKeyword] = useState("");
  const [filterType, setFilterType] = useState<DigitalItemType | "">("");

  // AIに聞く
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [referencedItems, setReferencedItems] = useState<ReferencedDigitalItem[]>([]);
  const [askError, setAskError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setFormError("タイトルを入力してください。");
      return;
    }
    const guard = checkForPlaintextSecret(memo, relatedDocuments, contactPerson);
    if (guard.blocked) {
      setFormError(SECRET_GUARD_MESSAGE);
      return;
    }
    setSaving(true);
    setFormError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("digital_items")
      .insert({
        user_id: userId,
        item_type: itemType,
        title: trimmed,
        memo: memo.trim() || null,
        contact_person: contactPerson.trim() || null,
        related_documents: relatedDocuments.trim() || null,
      })
      .select()
      .single();
    setSaving(false);

    if (error || !data) {
      setFormError(
        "保存に失敗しました。時間をおいて再度お試しください。"
      );
      return;
    }

    setItems((prev) => [data, ...prev]);
    setTitle("");
    setMemo("");
    setContactPerson("");
    setRelatedDocuments("");
  }

  async function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed) return;
    setAsking(true);
    setAskError(null);
    setAnswer(null);
    setReferencedItems([]);
    try {
      const result = await askAboutDigitalItems(trimmed);
      if (result.ok) {
        setAnswer(result.answer);
        setReferencedItems(result.referencedItems);
      } else {
        setAskError(result.error);
      }
    } catch {
      setAskError("回答の取得に失敗しました。もう一度お試しください。");
    } finally {
      setAsking(false);
    }
  }

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filterType && item.item_type !== filterType) return false;
      if (!keyword.trim()) return true;
      const k = keyword.trim().toLowerCase();
      return (
        item.title.toLowerCase().includes(k) ||
        (item.memo ?? "").toLowerCase().includes(k)
      );
    });
  }, [items, keyword, filterType]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-3 rounded-[1.5rem] border border-gold/40 bg-gold/10 p-4 text-sm text-ink/80">
        <span aria-hidden className="mt-0.5 shrink-0 text-gold">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path
              d="M12 3 2 20h20L12 3Z"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
            <path d="M12 10v4M12 17h0" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        </span>
        <p>
          <span className="font-semibold">パスワードは保存しないでください。</span>
          <br />
          パスワードや暗証番号そのものは入れず、家族が判断できる短いメモだけを残します。それらしい内容は自動的に保存をブロックします。
        </p>
      </div>

      <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-ink">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-green-700">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
          新しく残す
        </h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">種別</label>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value as DigitalItemType)}
              className="rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            >
              {DIGITAL_ITEM_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">
              タイトル<span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={DIGITAL_ITEM_TITLE_HINTS[itemType] ?? "例:Net◯◯"}
              className="rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">一言メモ</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              placeholder="例:解約は家族で判断、写真はクラウドに保存など"
              className="rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">手続担当者(任意)</label>
            <input
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="例:長男が対応"
              className="rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink/80">関連書類(任意)</label>
            <input
              value={relatedDocuments}
              onChange={(e) => setRelatedDocuments(e.target.value)}
              placeholder="例:契約書は自宅の書類ファイルに保管"
              className="rounded-lg border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-60"
          >
            {saving ? "保存中…" : "保存する"}
          </button>
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm sm:p-6">
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-ink">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-full bg-green-50 text-green-700"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <rect x="4" y="5" width="16" height="12" rx="2.5" stroke="currentColor" strokeWidth={1.6} />
              <circle cx="9" cy="9.5" r="1" fill="currentColor" />
              <circle cx="15" cy="9.5" r="1" fill="currentColor" />
              <path d="M12 20v-3" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
            </svg>
          </span>
          AIに聞く
        </h2>
        <p className="mb-3 text-xs text-ink/60">
          登録済みのデジタル情報について質問できます。例:サブスク何がある?保険の連絡先は?iCloud写真はどこ?
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAsk();
              }
            }}
            placeholder="例:サブスク何がある? iCloud写真はどこ?"
            className="flex-1 rounded-full border border-green-100 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400"
          />
          <button
            type="button"
            onClick={handleAsk}
            disabled={asking || !question.trim()}
            className="shrink-0 rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:opacity-40"
          >
            {asking ? "考え中…" : "聞く"}
          </button>
        </div>
        {asking && (
          <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-xs text-green-700">
            登録済みのデジタル情報を確認して考えています…
          </p>
        )}
        {!asking && answer && (
          <div className="mt-3 rounded-xl bg-green-50 px-4 py-3">
            <p className="whitespace-pre-wrap text-sm text-green-800">{answer}</p>
            {referencedItems.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-green-100 pt-3">
                <span className="text-[11px] text-green-700/70">根拠にした登録情報:</span>
                {referencedItems.map((item) => (
                  <span
                    key={item.id}
                    className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-green-800 shadow-sm"
                  >
                    {item.title}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {!asking && askError && (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">
            {askError}
          </p>
        )}
      </div>

      <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm sm:p-6">
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-ink">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-green-700">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth={1.7} />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
          </svg>
          探す
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="タイトル、メモで探索"
            className="flex-1 rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as DigitalItemType | "")}
            className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
          >
            <option value="">すべて</option>
            {DIGITAL_ITEM_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[1.75rem] border border-dashed border-green-200 bg-white/50 p-10 text-center">
          <p className="text-sm text-ink/60">
            {items.length === 0
              ? "まだ何も残されていません。上のフォームから残してみましょう。"
              : "条件に一致する情報が見つかりませんでした。"}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((item) => (
            <DigitalItemRow
              key={item.id}
              item={item}
              onUpdated={(updated) =>
                setItems((prev) =>
                  prev.map((i) => (i.id === updated.id ? updated : i))
                )
              }
              onDeleted={(id) =>
                setItems((prev) => prev.filter((i) => i.id !== id))
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
