// 新規登録フォーム(通常登録・家族招待からの登録)で共通の、
// 生年月日(必須)・性別(必須)・電話番号(任意)の入力欄。
const inputClass =
  "min-h-[50px] rounded-lg border border-black/10 bg-white px-4 py-2.5 text-ink outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100";

const GENDER_OPTIONS = [
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
  { value: "other", label: "その他" },
  { value: "no_answer", label: "回答しない" },
];

export function SignupExtraFields() {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="birthDate" className="text-lg font-medium text-ink/80">
          生年月日
        </label>
        <input
          id="birthDate"
          name="birthDate"
          type="date"
          required
          autoComplete="bday"
          className={inputClass}
        />
        <p className="text-xs text-ink/40">
          タイムカプセルの「成人になったら」などの開封条件の判定に使われます。
        </p>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-lg font-medium text-ink/80">性別</legend>
        <div className="flex flex-wrap gap-2">
          {GENDER_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-ink has-[:checked]:border-green-600 has-[:checked]:bg-green-50"
            >
              <input type="radio" name="gender" value={o.value} required />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className="text-lg font-medium text-ink/80">
          電話番号(任意)
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          className={inputClass}
        />
      </div>
    </>
  );
}
