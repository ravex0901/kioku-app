"use client";

import { useState } from "react";

const BRACKETS = [
  { limit: 1000, rate: 0.1, deduction: 0 },
  { limit: 3000, rate: 0.15, deduction: 50 },
  { limit: 5000, rate: 0.2, deduction: 200 },
  { limit: 10000, rate: 0.3, deduction: 700 },
  { limit: 20000, rate: 0.4, deduction: 1700 },
  { limit: 30000, rate: 0.45, deduction: 2700 },
  { limit: 60000, rate: 0.5, deduction: 4200 },
  { limit: Infinity, rate: 0.55, deduction: 7200 },
];

function calcTax(totalMan: number, heirs: number) {
  const safeHeirs = Math.max(1, Math.floor(heirs) || 1);
  const deduction = 3000 + 600 * safeHeirs;
  const taxableTotal = Math.max(0, totalMan - deduction);
  const perHeir = taxableTotal / safeHeirs;
  const bracket = BRACKETS.find((b) => perHeir <= b.limit) ?? BRACKETS[BRACKETS.length - 1];
  const taxPerHeir = Math.max(0, perHeir * bracket.rate - bracket.deduction);
  const totalTax = Math.round(taxPerHeir * safeHeirs);
  return { deduction, taxableTotal: Math.round(taxableTotal), totalTax };
}

export function InheritanceTaxCalculator() {
  const [assets, setAssets] = useState("");
  const [heirs, setHeirs] = useState("");
  const [result, setResult] = useState<ReturnType<typeof calcTax> | null>(
    null
  );

  function handleCalc() {
    const assetsNum = Number(assets);
    const heirsNum = Number(heirs);
    if (!assetsNum || !heirsNum) return;
    setResult(calcTax(assetsNum, heirsNum));
  }

  return (
    <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm sm:p-6">
      <h2 className="mb-3 text-base font-bold text-ink">相続税シミュレーション</h2>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink/80">
            資産の合計額(万円)
          </label>
          <input
            type="number"
            value={assets}
            onChange={(e) => setAssets(e.target.value)}
            placeholder="例:6000"
            className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink/80">
            法定相続人の人数
          </label>
          <input
            type="number"
            value={heirs}
            onChange={(e) => setHeirs(e.target.value)}
            placeholder="例:2"
            className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
          />
        </div>
        <button
          type="button"
          onClick={handleCalc}
          className="rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800"
        >
          計算する
        </button>
        {result && (
          <div className="flex flex-col gap-1.5 rounded-xl bg-green-50 px-4 py-3 text-sm text-ink">
            <p>基礎控除:{result.deduction.toLocaleString()}万円</p>
            <p>課税遺産総額:{result.taxableTotal.toLocaleString()}万円</p>
            <p className="font-bold text-green-800">
              相続税の総額(目安):{result.totalTax.toLocaleString()}万円
            </p>
          </div>
        )}
        <p className="text-xs text-ink/40">
          ※概算の目安です。実際の税額は税理士にご確認ください。
        </p>
      </div>
    </div>
  );
}
