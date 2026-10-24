"use client";

import { useActionState } from "react";
import { adminUpdateAccount } from "@/app/actions/adminAccounts";

type Initial = {
  name: string;
  birthDate: string;
  gender: string;
  address: string;
  phone: string;
  contactEmail: string;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-green-400";
const labelClass = "block text-xs font-semibold text-ink/60";

// 運営が、各アカウントの登録情報(名前・生年月日・性別・住所・電話番号・連絡用メール)を編集する。
export function AdminAccountForm({
  userId,
  initial,
}: {
  userId: string;
  initial: Initial;
}) {
  const [state, formAction, pending] = useActionState(
    adminUpdateAccount.bind(null, userId),
    undefined
  );

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="name" className={labelClass}>名前</label>
        <input id="name" name="name" defaultValue={initial.name} required className={inputClass} />
      </div>
      <div>
        <label htmlFor="birth_date" className={labelClass}>生年月日</label>
        <input id="birth_date" name="birth_date" type="date" defaultValue={initial.birthDate} className={inputClass} />
      </div>
      <div>
        <label htmlFor="gender" className={labelClass}>性別</label>
        <select id="gender" name="gender" defaultValue={initial.gender} className={inputClass}>
          <option value="">未設定</option>
          <option value="male">男性</option>
          <option value="female">女性</option>
          <option value="other">その他</option>
          <option value="no_answer">回答しない</option>
        </select>
      </div>
      <div>
        <label htmlFor="phone" className={labelClass}>電話番号</label>
        <input id="phone" name="phone" type="tel" defaultValue={initial.phone} className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="address" className={labelClass}>住所</label>
        <textarea id="address" name="address" rows={2} defaultValue={initial.address} className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="contact_email" className={labelClass}>連絡用メールアドレス</label>
        <input id="contact_email" name="contact_email" type="email" defaultValue={initial.contactEmail} className={inputClass} />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-green-700 px-5 py-2 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-60"
        >
          {pending ? "保存中…" : "保存する"}
        </button>
        {state?.error && <span role="alert" className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span role="status" className="text-sm text-green-700">保存しました</span>}
      </div>
    </form>
  );
}
