import type { CategoryMajor, DigitalItemType } from "@/lib/types";

// 相続手続き判定エンジン(特許請求項:
// 「AI処理により、登録された遺品情報に関連する相続に必要な手続き、
//   期限及び不足書類を判定し、これらを含む相続レポートを生成する」に対応)
//
// 重要な設計方針:
// 一般的な相続質問に答えるチャット型AIではなく、
// 「登録済みの遺品・デジタル情報」→「必要な手続き・期限・必要書類」
// を機械的に導出するルールベースの判定エンジンとして実装している。
// (会話ではなく、登録データそのものを判定材料にする)

export type ProcedureRule = {
  key: string;
  title: string;
  deadline: string;
  documents: string[];
};

export type ProcedureItem = ProcedureRule & {
  // どの登録情報がきっかけでこの手続きが判定されたか
  reasons: string[];
};

const commonMovables: ProcedureRule = {
  key: "movables_division",
  title: "家財・生活用品の遺品整理(形見分け・処分)",
  deadline: "法定期限なし(賃貸物件の場合は明け渡し期限に注意)",
  documents: ["遺産分割協議書(高価品が含まれる場合)"],
};

// 常に判定される基本手続き(相続開始後に共通して必要となるもの)
export const BASE_PROCEDURES: ProcedureRule[] = [
  {
    key: "death_notice",
    title: "死亡届の提出・火葬許可申請",
    deadline: "死亡の事実を知った日から7日以内",
    documents: ["死亡診断書(死体検案書)", "届出人の印鑑", "本人確認書類"],
  },
  {
    key: "renounce_or_limited",
    title: "相続放棄・限定承認の検討",
    deadline: "相続開始を知った時から3ヶ月以内",
    documents: ["被相続人の戸籍謄本(出生〜死亡)", "相続人の戸籍謄本"],
  },
  {
    key: "quasi_final_tax_return",
    title: "準確定申告(被相続人の所得税)",
    deadline: "相続開始を知った日の翌日から4ヶ月以内",
    documents: ["被相続人の源泉徴収票・確定申告書控え", "各種控除証明書"],
  },
  {
    key: "inheritance_tax_return",
    title: "相続税の申告・納付",
    deadline: "相続開始を知った日の翌日から10ヶ月以内",
    documents: [
      "遺産分割協議書",
      "相続人全員の印鑑証明書",
      "相続財産の評価資料一式",
    ],
  },
];

// 遺品(items)の category_major に応じて追加判定される手続き
export const CATEGORY_PROCEDURE_MAP: Partial<
  Record<CategoryMajor, ProcedureRule>
> = {
  asset: {
    key: "bank_account_closure",
    title: "金融機関口座の解約・名義変更",
    deadline: "法定期限なし(凍結前の早期着手を推奨)",
    documents: [
      "被相続人の戸籍謄本(出生〜死亡)",
      "相続人全員の戸籍謄本",
      "遺産分割協議書",
      "相続人の印鑑証明書",
      "通帳・キャッシュカード・証券口座情報",
    ],
  },
  insurance: {
    key: "insurance_claim",
    title: "生命保険金・保険契約の請求手続き",
    deadline: "保険金請求権の時効(3年)に注意",
    documents: ["保険証券", "死亡診断書の写し", "受取人の本人確認書類"],
  },
  subscription: {
    key: "subscription_cancel",
    title: "サブスクリプション・会費の解約",
    deadline: "速やかに(日割り課金の停止のため)",
    documents: ["契約者情報・会員番号・支払い方法"],
  },
  furniture: commonMovables,
  appliance: commonMovables,
  clothing: commonMovables,
  tableware: commonMovables,
  books: commonMovables,
  jewelry: {
    key: "valuables_division",
    title: "貴金属・高価品の査定と遺産分割",
    deadline: "法定期限なし(協議は早めが望ましい)",
    documents: ["査定書(必要な場合)", "遺産分割協議書"],
  },
};

// デジタル情報(digital_items)の item_type に応じて追加判定される手続き
export const DIGITAL_PROCEDURE_MAP: Partial<
  Record<DigitalItemType, ProcedureRule>
> = {
  subscription: CATEGORY_PROCEDURE_MAP.subscription!,
  finance: CATEGORY_PROCEDURE_MAP.asset!,
  insurance: CATEGORY_PROCEDURE_MAP.insurance!,
  account: {
    key: "digital_account_close",
    title: "デジタルアカウントの閉鎖・追悼設定",
    deadline: "法定期限なし(不正利用防止のため早期対応を推奨)",
    documents: ["ログイン情報・アカウント一覧", "各サービス所定の本人確認書類"],
  },
  data_storage: {
    key: "digital_data_handover",
    title: "デジタルデータの引き継ぎ・削除",
    deadline: "法定期限なし",
    documents: ["保管場所・アクセス方法の一覧"],
  },
  contract: {
    key: "contract_cancel",
    title: "各種契約の解約・承継連絡",
    deadline: "速やかに(違約金・自動更新に注意)",
    documents: ["契約書控え", "契約者情報"],
  },
  access_info: {
    key: "access_info_handover",
    title: "鍵・重要情報の保管場所の引き継ぎ",
    deadline: "法定期限なし",
    documents: ["保管場所リスト"],
  },
};

const CATEGORY_LABEL: Record<CategoryMajor, string> = {
  furniture: "家具",
  appliance: "家電",
  clothing: "衣類",
  tableware: "食器",
  books: "書籍",
  jewelry: "貴金属",
  asset: "資産",
  subscription: "サブスク",
  insurance: "保険",
  other: "その他",
};

const DIGITAL_LABEL: Record<DigitalItemType, string> = {
  subscription: "サブスク",
  account: "アカウント",
  data_storage: "データ保管場所",
  finance: "金融",
  insurance: "保険",
  contract: "契約",
  access_info: "アクセス情報",
  other: "その他",
};

export function buildInheritanceChecklist(
  items: { category_major: CategoryMajor | null }[],
  digitalItems: { item_type: DigitalItemType }[]
): ProcedureItem[] {
  const map = new Map<string, ProcedureItem>();

  for (const rule of BASE_PROCEDURES) {
    map.set(rule.key, { ...rule, reasons: ["すべての相続手続きに共通"] });
  }

  for (const item of items) {
    if (!item.category_major) continue;
    const rule = CATEGORY_PROCEDURE_MAP[item.category_major];
    if (!rule) continue;
    const reason = `登録済みの「${CATEGORY_LABEL[item.category_major]}」に基づく`;
    const existing = map.get(rule.key);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    } else {
      map.set(rule.key, { ...rule, reasons: [reason] });
    }
  }

  for (const digital of digitalItems) {
    const rule = DIGITAL_PROCEDURE_MAP[digital.item_type];
    if (!rule) continue;
    const reason = `登録済みのデジタル情報「${DIGITAL_LABEL[digital.item_type]}」に基づく`;
    const existing = map.get(rule.key);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    } else {
      map.set(rule.key, { ...rule, reasons: [reason] });
    }
  }

  return Array.from(map.values());
}
