"use client";

import { useState, useTransition } from "react";
import { submitFamilyDeathReport } from "@/app/actions/deathCertificate";
import type { FamilyDeathReportTarget } from "@/app/actions/deathCertificate";

const STATUS_LABEL: Record<string, string> = {
  pending: "提出済み(運営が確認中です)",
  approved: "承認済み",
  rejected: "却下されました(再提出できます)",
};

export function FamilyDeathReportClient({
  targets,
  initialOwnerId,
}: {
  targets: FamilyDeathReportTarget[];
  initialOwnerId: string | null;
}) {
  if (targets.length === 0) {
    return (
      <p className="rounded-2xl border border-green-100 bg-white/70 p-5 text-sm text-ink/60">
        アカウントでつながっているご家族がいません。家族の招待やアカウントIDでの申請で、つながると提出できるようになります。
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {targets.map((t) => (
        <TargetCard
          key={t.ownerId}
          target={t}
          highlight={t.ownerId === initialOwnerId}
        />
      ))}
    </div>
  );
}

function TargetCard({
  target,
  highlight,
}: {
  target: FamilyDeathReportTarget;
  highlight: boolean;
}) {
  const [status, setStatus] = useState(target.status);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await submitFamilyDeathReport(target.ownerId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
      setStatus("pending");
    });
  }

  const canSubmit = status !== "pending" && status !== "approved";

  return (
    <section
      className={`rounded-[1.75rem] border bg-white/80 p-5 shadow-sm ${
        highlight ? "border-gold/60" : "border-green-100"
      }`}
    >
      <h2 className="font-serif-jp text-xl font-bold text-ink">
        {target.name} さん
      </h2>
      {status && (
        <p className="mt-1 text-sm text-ink/60">{STATUS_LABEL[status]}</p>
      )}
      {status === "approved" && (
        <a
          href={"/family/legacy/" + target.ownerId}
          className="mt-3 inline-flex min-h-[50px] items-center justify-center rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800"
        >
          「もしもの時」の内容を見る
        </a>
      )}
      {done && (
        <p
          role="status"
          className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-800"
        >
          提出しました。運営が確認するまでお待ちください。
        </p>
      )}
      {canSubmit && !done && (
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
          <input
            type="file"
            name="image"
            accept="image/*"
            required
            className="text-sm"
          />
          <label className="flex items-start gap-2 text-sm text-ink/70">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1"
            />
            <span>
              {target.name}さんが亡くなられたことを示す、正しい書類を提出します。
            </span>
          </label>
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || !confirmed}
            className="rounded-full bg-green-700 px-6 py-3 text-base font-bold text-white transition hover:bg-green-800 disabled:opacity-50"
          >
            {pending ? "提出中…" : "提出する"}
          </button>
        </form>
      )}
    </section>
  );
}
