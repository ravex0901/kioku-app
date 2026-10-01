"use client";

import { useState } from "react";
import { saveMedicalInfo } from "@/app/actions/medical";
import type { MedicalInfo } from "@/lib/types";

/**
 * 医療情報の登録フォーム。かかりつけ医・持病・今飲んでいる薬を記録しておく。
 * もしもの時や救急の場面で、家族や周りの人がすぐに確認できるようにする。
 */
export function MedicalInfoForm({ initialInfo }: { initialInfo: MedicalInfo | null }) {
  const [doctorName, setDoctorName] = useState(initialInfo?.doctor_name ?? "");
  const [hospitalName, setHospitalName] = useState(initialInfo?.hospital_name ?? "");
  const [doctorPhone, setDoctorPhone] = useState(initialInfo?.doctor_phone ?? "");
  const [conditions, setConditions] = useState(initialInfo?.conditions ?? "");
  const [medications, setMedications] = useState(initialInfo?.medications ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = await saveMedicalInfo(formData);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-[1.75rem] border border-green-100 bg-white/70 p-6 shadow-sm"
    >
      <div>
        <h2 className="text-sm font-bold text-ink">かかりつけ医</h2>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink/60">病院名</span>
            <input
              type="text"
              name="hospitalName"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
              placeholder="例：〇〇総合病院"
              className="rounded-xl border border-green-100 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink/60">先生のお名前</span>
            <input
              type="text"
              name="doctorName"
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
              placeholder="例：〇〇先生"
              className="rounded-xl border border-green-100 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink/60">電話番号</span>
            <input
              type="tel"
              name="doctorPhone"
              value={doctorPhone}
              onChange={(e) => setDoctorPhone(e.target.value)}
              placeholder="例：03-0000-0000"
              className="rounded-xl border border-green-100 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-green-400"
            />
          </label>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-ink">持病</h2>
        <p className="mt-1 text-xs text-ink/50">
          1行に1つずつ書いてください(例：高血圧、糖尿病)
        </p>
        <textarea
          name="conditions"
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          rows={4}
          placeholder={"例：\n高血圧\n糖尿病"}
          className="mt-2 w-full rounded-xl border border-green-100 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-green-400"
        />
      </div>

      <div>
        <h2 className="text-sm font-bold text-ink">今飲んでいる薬</h2>
        <p className="mt-1 text-xs text-ink/50">
          1行に1つずつ書いてください(例：アムロジピン 朝1錡)
        </p>
        <textarea
          name="medications"
          value={medications}
          onChange={(e) => setMedications(e.target.value)}
          rows={4}
          placeholder={"例：\nアムロジピン 朝1錡\nメトホルミン 朝晩 1錡ずつ"}
          className="mt-2 w-full rounded-xl border border-green-100 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-green-400"
        />
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">{error}</p>
      )}
      {saved && (
        <p className="rounded-xl bg-green-50 px-4 py-3 text-xs text-green-700">
          保存しました。
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="self-start rounded-full bg-green-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:opacity-50"
      >
        {saving ? "保存中…" : "保存する"}
      </button>
    </form>
  );
}
