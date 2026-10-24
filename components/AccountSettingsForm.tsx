"use client";

import { useActionState } from "react";
import { saveAccountSettings } from "@/app/actions/profile";

type Initial = {
  name: string;
  birthDate: string;
  gender: string;
  address: string;
  phone: string;
  contactEmail: string;
};

const inputClass =
  "mt-1 w-full rounded-xl border border-green-200 bg-white px-4 py-3 text-base text-ink outline-none focus:border-green-500";
const labelClass = "block text-sm font-semibold text-ink";

const GENDER_OPTIONS = [
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
  { value: "other", label: "その他" },
  { value: "no_answer", label: "回答しない" },
];

export function AccountSettingsForm({
  initial,
}: {
  initial: Initial;
}) {
  const [state, formAction, pending] = useActionState(
    saveAccountSettings,
    undefined
  );

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-3xl border border-green-100 bg-white/80 p-5 sm:p-7"
    >
      <div>
        <label htmlFor="name" className={labelClass}>
          名前 <span className="text-red-600">必須</span>
        </label>
        <input
          id="name"
          name="name"
          defaultValue={initial.name}
          required
          autoComplete="name"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="birth_date" className={labelClass}>
          生年月日 <span className="text-red-600">必須</span>
        </label>
        <input
          id="birth_date"
          name="birth_date"
          type="date"
          defaultValue={initial.birthDate}
          required
          readOnly={Boolean(initial.birthDate)}
          autoComplete="bday"
          className={
            initial.birthDate
              ? inputClass + " cursor-not-allowed bg-ink/5 text-ink/60"
              : inputClass
          }
        />
        {initial.birthDate && (
          <p className="mt-1 text-xs text-ink/50">
            生年月日は変更できません。変更する場合はカスタマーセンターにご連絡ください。
          </p>
        )}
      </div>

      <fieldset>
        <legend className={labelClass}>
          性別 <span className="text-red-600">必須</span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {GENDER_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-green-200 bg-white px-4 py-2 text-sm has-[:checked]:border-green-600 has-[:checked]:bg-green-50"
            >
              <input
                type="radio"
                name="gender"
                value={o.value}
                defaultChecked={initial.gender === o.value}
                required
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="address" className={labelClass}>
          住所 <span className="text-red-600">必須</span>
        </label>
        <textarea
          id="address"
          name="address"
          defaultValue={initial.address}
          required
          rows={2}
          autoComplete="street-address"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="phone" className={labelClass}>
          電話番号 <span className="text-ink/40">任意</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={initial.phone}
          autoComplete="tel"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="contact_email" className={labelClass}>
          メールアドレス <span className="text-ink/40">任意</span>
        </label>
        <input
          id="contact_email"
          name="contact_email"
          type="email"
          defaultValue={initial.contactEmail}
          autoComplete="email"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-ink/50">
          連絡用のメールアドレスです。登録時のメールアドレスを入れてあります。ログイン用のメールアドレスは変わりません。
        </p>
      </div>

      {state?.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">
          保存しました。
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-green-700 px-6 py-3 text-base font-bold text-white transition hover:bg-green-800 disabled:opacity-60"
      >
        {pending ? "保存中…" : "保存する"}
      </button>
    </form>
  );
}
