// AI推定価格帯(日本語の自由記述文字列)から、売却候補を抽出するための簡易パーサー
// (請求項4「一定条件以上の推定価値を持つ遺品を売却候補として抽出する」に対応)
//
// 注記(正直な開示): 外部市場データ連携アダプタ・信頼度スコアリングを備えた
// 本格的な査定システムは未実装。ここでは、AIが生成した価格帯テキストから
// 最大金額をおおまかに抽出し、一定額以上のものを「売却候補」として抽出する
// 簡易ルールのみを実装している。

export function estimateMaxYen(text: string | null | undefined): number | null {
  if (!text) return null;

  const values: number[] = [];

  // 「3万円」「1.5万円」のような表記
  for (const m of text.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*万/g)) {
    values.push(Math.round(parseFloat(m[1]) * 10000));
  }
  // 「3,000円」「5000円」のような表記
  for (const m of text.matchAll(/([0-9][0-9,]{2,})\s*円/g)) {
    values.push(parseInt(m[1].replace(/,/g, ""), 10));
  }

  if (values.length === 0) return null;
  return Math.max(...values);
}

// 売却候補として抽出する閾値(円)。マスタ値として今後調整可能。
export const SELL_CANDIDATE_THRESHOLD_YEN = 5000;

export function isSellCandidate(estimatedPriceRange: string | null | undefined): boolean {
  const max = estimateMaxYen(estimatedPriceRange);
  return max !== null && max >= SELL_CANDIDATE_THRESHOLD_YEN;
}
