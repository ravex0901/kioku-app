import type {
  CategoryMajor,
  Disposition,
  DispositionTag,
  LocationType,
} from "@/lib/types";

export const CATEGORY_OPTIONS: { value: CategoryMajor; label: string }[] = [
  { value: "furniture", label: "家具" },
  { value: "appliance", label: "家電" },
  { value: "clothing", label: "衣類" },
  { value: "tableware", label: "食器" },
  { value: "books", label: "書籍" },
  { value: "jewelry", label: "貴金属" },
  { value: "asset", label: "資産" },
  { value: "subscription", label: "サブスク" },
  { value: "insurance", label: "保険" },
  { value: "other", label: "その他" },
];

// 資産・サブスク・保険は現物の「もの」ではないため、
// 品名/メモの入力欄でどんな情報を書けばよいかをガイドする文言。
export const CATEGORY_MEMO_HINTS: Partial<Record<CategoryMajor, string>> = {
  asset: "例:○○銀行 普通預金、△△証券のNISA口座、概算評価額など",
  subscription:
    "例:月額○○円、契約プラン、更新日・解約方法、契約者名義など",
  insurance:
    "例:保険会社名、保険の種類、証券番号、満期日、受取人など",
};

export const CATEGORY_NAME_HINTS: Partial<Record<CategoryMajor, string>> = {
  asset: "例:○○銀行 普通預金、NISA口座 など",
  subscription: "例:Netflix、〇〇新聞、△△ジムの会費 など",
  insurance: "例:〇〇生命 終身保険、△△火災保険 など",
};

export const DISPOSITION_OPTIONS: { value: Disposition; label: string }[] = [
  { value: "keep", label: "残しておきたい" },
  { value: "keepsake", label: "形見・記念として残す" },
  { value: "sell", label: "売却・買取を検討したい" },
  { value: "discard", label: "手放す・処分を検討したい" },
  { value: "undecided", label: "まだ決めていない" },
];

export const DISPOSITION_TAG_OPTIONS: {
  value: DispositionTag;
  label: string;
}[] = [
  { value: "heirloom", label: "形見" },
  { value: "inherited", label: "先祖から受け継いだ" },
  { value: "memory", label: "思い出がある" },
  { value: "other", label: "その他" },
];

export const LOCATION_TYPE_OPTIONS: { value: LocationType; label: string }[] =
  [
    { value: "building", label: "建物" },
    { value: "floor", label: "階" },
    { value: "room", label: "部屋" },
    { value: "storage", label: "収納" },
  ];

export const PURPOSE_OPTIONS: {
  value: string;
  label: string;
  description: string;
}[] = [
  {
    value: "estate_planning",
    label: "生前整理をしたい",
    description: "ご自身の持ち物を、ゆっくり見直していきたい方に。",
  },
  {
    value: "relocation",
    label: "施設入居・住み替えの準備をしたい",
    description: "新しい暮らしに向けて、持ち物を整理したい方に。",
  },
  {
    value: "bereavement",
    label: "家族の遺品整理をしたい",
    description: "ご家族の思い出の品と向き合いたい方に。",
  },
];

export const DISPOSITION_BADGE_STYLE: Record<Disposition, string> = {
  keep: "bg-green-100 text-green-700",
  keepsake: "bg-gold/25 text-green-800",
  sell: "bg-sky-100 text-sky-700",
  discard: "bg-orange-100 text-orange-700",
  undecided: "bg-black/5 text-ink/60",
};

export function labelFor<T extends string>(
  options: { value: T; label: string }[],
  value: T | null | undefined
): string {
  return options.find((o) => o.value === value)?.label ?? "未設定";
}
export const CONDITION_LABELS: Record<"good" | "used" | "needs_repair", string> = {
  good: "良好",
  used: "使用感あり",
  needs_repair: "要修理",
};
