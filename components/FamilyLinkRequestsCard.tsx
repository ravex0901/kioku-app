"use client";

import { useState } from "react";
import { familyRelationLabel } from "@/lib/constants";
import {
  approveFamilyLinkRequest,
  declineFamilyLinkRequest,
} from "@/app/actions/familyLinkRequests";
import type { PendingFamilyLinkRequest } from "@/lib/types";

// ホーム画面の先頭で、「アカウントIDでつなぐ」から届いた、まだ返事をしていない
// 家族連携の申請を表示し、「許可」を押すまでは家系図に一切反映されないようにする。
export function FamilyLinkRequestsCard({
  initialRequests,
}: {
  initialRequests: PendingFamilyLinkRequest[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0) return null;

  async function handleApprove(id: string) {
    setRespondingId(id);
    setError(null);
    const result = await approveFamilyLinkRequest(id);
    setRespondingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRequests((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleDecline(id: string) {
    setRespondingId(id);
    setError(null);
    const result = await declineFamilyLinkRequest(id);
    setRespondingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRequests((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="flex flex-col gap-3 rounded-[1.75rem] border border-gold/40 bg-gold/10 p-5 shadow-sm sm:p-6">
      <h2 className="text-sm font-bold text-ink">ご家族からのつながり申請</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-col gap-3">
        {requests.map((req) => (
          <div
            key={req.id}
            className="flex flex-col gap-2 rounded-2xl border border-black/5 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm text-ink">
              <span className="font-semibold">{req.fromName}</span>
              さんが、あなたを「{familyRelationLabel(req.relationOfToUser)}」として家族に追加しました。つながりますか?
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => handleApprove(req.id)}
                disabled={respondingId === req.id}
                className="rounded-full bg-green-700 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-60"
              >
                {respondingId === req.id ? "処理中…" : "許可する"}
              </button>
              <button
                type="button"
                onClick={() => handleDecline(req.id)}
                disabled={respondingId === req.id}
                className="rounded-full border border-black/10 px-4 py-2 text-sm text-ink/60 transition hover:bg-black/5 disabled:opacity-60"
              >
                今はしない
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
