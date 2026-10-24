"use client";

import { useState, useTransition } from "react";
import type { AdminActionState } from "@/app/actions/adminAccounts";

// 運営用の承認ボタン。確認ダイアログのあとにサーバーアクションを実行し、結果を表示する。
export function AdminApproveButton({
  label,
  confirmMessage,
  doneLabel = "承認しました",
  action,
  tone = "approve",
}: {
  label: string;
  confirmMessage: string;
  doneLabel?: string;
  action: () => Promise<AdminActionState>;
  tone?: "approve" | "revoke";
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function handleClick() {
    if (!window.confirm(confirmMessage)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        setMessage({ ok: false, text: result.error });
      } else {
        setMessage({ ok: true, text: doneLabel });
      }
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={`rounded-full px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60 ${
          tone === "revoke" ? "bg-red-600 hover:bg-red-700" : "bg-green-700 hover:bg-green-800"
        }`}
      >
        {pending ? "処理中…" : label}
      </button>
      {message && (
        <span className={`text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}>
          {message.text}
        </span>
      )}
    </span>
  );
}
