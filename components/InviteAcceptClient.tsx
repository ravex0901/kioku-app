"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { signupAndAcceptInvite } from "@/app/actions/auth";
import { acceptFamilyInvite } from "@/app/actions/familyInvite";
import { FAMILY_RELATION_OPTIONS } from "@/lib/constants";
import type { FamilyRelation } from "@/lib/types";
import type { InviteInfo } from "@/app/actions/familyInvite";

export function InviteAcceptClient({
  token,
  info,
  isLoggedIn,
}: {
  token: string;
  info: InviteInfo;
  isLoggedIn: boolean;
}) {
  if (!info.found) {
    return (
      <p className="rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-600">
        このリンクは無効です。URLをご確認ください。
      </p>
    );
  }

  if (info.alreadyLinked) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          このリンクはすでに使用されています。アカウントをお持ちの場合はログインしてください。
        </p>
        <Link
          href="/login"
          className="rounded-full bg-green-700 px-6 py-3 text-center font-semibold text-white transition hover:bg-green-800"
        >
          ログインする
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-center text-sm text-ink/70">
        <span className="font-bold text-ink">{info.inviterName || "ご本人"}</span>
        さんから、ご家族として招待されています。
        <br />
        ご自身のアカウントでつながると、家系図・タイムカプセル・AI日記などを一緒に使えるようになります。
      </p>

      {isLoggedIn ? (
        <LoggedInAccept token={token} inviterName={info.inviterName} />
      ) : (
        <NewAccountAccept token={token} />
      )}
    </div>
  );
}

function LoggedInAccept({
  token,
  inviterName,
}: {
  token: string;
  inviterName: string;
}) {
  const [relation, setRelation] = useState<FamilyRelation>("other");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptFamilyInvite(token, relation);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
      window.location.href = "/family-tree";
    });
  }

  if (done) {
    return (
      <p className="rounded-lg bg-green-50 px-4 py-3 text-center text-sm text-green-700">
        {inviterName || "ご本人"}さんとつながりました。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="myRelation" className="text-sm font-medium text-ink/80">
          {inviterName || "招待した方"}から見て、あなたの続柄
        </label>
        <select
          id="myRelation"
          value={relation}
          onChange={(e) => setRelation(e.target.value as FamilyRelation)}
          className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
        >
          {FAMILY_RELATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}
      <button
        type="button"
        onClick={handleAccept}
        disabled={pending}
        className="rounded-full bg-green-700 px-6 py-3 font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
      >
        {pending ? "つないでいます…" : "招待を受け入れてつながる"}
      </button>
    </div>
  );
}

function NewAccountAccept({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    signupAndAcceptInvite,
    undefined
  );
  const [relation, setRelation] = useState<FamilyRelation>("other");

  return (
    <>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="myRelation" value={relation} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium text-ink/80">
            お名前
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-ink/80">
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-ink/80">
            パスワード
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="passwordConfirm"
            className="text-sm font-medium text-ink/80"
          >
            パスワード(確認)
          </label>
          <input
            id="passwordConfirm"
            name="passwordConfirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="birthDate" className="text-sm font-medium text-ink/80">
            生年月日(任意)
          </label>
          <input
            id="birthDate"
            name="birthDate"
            type="date"
            autoComplete="bday"
            className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
          />
          <p className="text-xs text-ink/40">
            タイムカプセルの「成人になったら」などの開封条件の判定に使われます。
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="myRelationSelect" className="text-sm font-medium text-ink/80">
            招待した方から見て、あなたの続柄
          </label>
          <select
            id="myRelationSelect"
            value={relation}
            onChange={(e) => setRelation(e.target.value as FamilyRelation)}
            className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
          >
            {FAMILY_RELATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {state?.error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-full bg-green-700 px-6 py-3 font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
        >
          {pending ? "登録中…" : "アカウントを作ってつながる"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink/60">
        すでにアカウントをお持ちの方は{" "}
        <Link
          href={`/login?next=/invite/${token}`}
          className="font-medium text-green-700 underline underline-offset-2"
        >
          ログイン
        </Link>
      </p>
    </>
  );
}
