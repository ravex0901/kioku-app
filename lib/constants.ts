import type {
  CategoryMajor,
  DigitalItemStatus,
  DigitalItemType,
  Disposition,
  DispositionTag,
  FamilyRelation,
  ItemStatus,
  LocationType,
  ServiceType,
} from "@/lib/types";

export const CATEGORY_OPTIONS: { value: CategoryMajor; label: string }[] = [
  { value: "furniture", label: "家具" },
  { value: "appliance", label: "家電" },
  { value: "clothing", label: "衣類" },
  { value: "tableware", label: "食器" },
  { value: "books", label: "書籍" },
  { value: "jewelry", label: "貴金属" },
  { value: "watch", label: "時計" },
  { value: "asset", label: "資産" },
  { value: "subscription", label: "サブスク" },
  { value: "insurance", label: "保険" },
  { value: "other", label: "その他" },
];

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

export const DIGITAL_ITEM_TYPE_OPTIONS: {
  value: DigitalItemType;
  label: string;
}[] = [
  { value: "subscription", label: "サブスク" },
  { value: "account", label: "アカウント" },
  { value: "data_storage", label: "データ保管場所" },
  { value: "finance", label: "金融" },
  { value: "insurance", label: "保険" },
  { value: "contract", label: "契約" },
  { value: "access_info", label: "アクセス情報" },
  { value: "other", label: "その他" },
];

export const DIGITAL_ITEM_TITLE_HINTS: Partial<
  Record<DigitalItemType, string>
> = {
  subscription: "例:Net◯◯、〇〇新聞",
  account: "例:〇〇銀行 普通預金、icloud",
  data_storage: "例:iCloud写真、外付けHDD",
  finance: "例:〇〇証券 NISA口座",
  insurance: "例:がん保険、〇〇火災保険",
  contract: "例:〇〇マンション賃貸契約",
  access_info: "例:実家の鍵の保管場所",
  other: "例:その他残しておきたい情報",
};

export const DISPOSITION_OPTIONS: { value: Disposition; label: string }[] = [
  { value: "keep", label: "残す" },
  { value: "organize", label: "整理する" },
  { value: "unsure", label: "わからない" },
];

const LEGACY_DISPOSITION_LABEL: Record<string, string> = {
  keepsake: "残す",
  sell: "整理する",
  discard: "整理する",
  undecided: "わからない",
};

export const LEGACY_DISPOSITION_VALUES: Record<Disposition, string[]> = {
  keep: ["keepsake"],
  organize: ["sell", "discard"],
  unsure: ["undecided"],
};

const LEGACY_DISPOSITION_BADGE_STYLE: Record<string, string> = {
  keepsake: "bg-green-100 text-green-700",
  sell: "bg-orange-100 text-orange-700",
  discard: "bg-orange-100 text-orange-700",
  undecided: "bg-black/5 text-ink/60",
};

export function dispositionLabel(value: string | null | undefined): string {
  if (!value) return "未設定";
  const found = DISPOSITION_OPTIONS.find((o) => o.value === value);
  if (found) return found.label;
  return LEGACY_DISPOSITION_LABEL[value] ?? "未設定";
}

export function isKeepDisposition(value: string | null | undefined): boolean {
  return value === "keep" || value === "keepsake";
}

export function dispositionBadgeStyle(value: string | null | undefined): string {
  if (!value) return "bg-black/5 text-ink/60";
  return (
    DISPOSITION_BADGE_STYLE[value as Disposition] ??
    LEGACY_DISPOSITION_BADGE_STYLE[value] ??
    "bg-black/5 text-ink/60"
  );
}

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

export const SERVICE_TYPE_OPTIONS: {
  value: ServiceType;
  label: string;
  description: string;
}[] = [
  {
    value: "all_in_one",
    label: "丸投げ依頼(全部おまかせ)",
    description:
      "サービス選びに迷ったら、まずはこちら。状況をお伺いしたうえで最適な組み合わせをご提案します。",
  },
  {
    value: "buyback",
    label: "出張買取",
    description: "ご自宅までお伺いし、価値のあるものを査定・買取します。",
  },
  {
    value: "junk_removal",
    label: "不用品回収",
    description: "手放すと決めたものを、まとめて回収します。",
  },
  {
    value: "estate_cleanup",
    label: "遺品整理",
    description: "ご家族が亡くなった後のお片付けをお手伝いします。",
  },
  {
    value: "pre_death_cleanup",
    label: "生前整理",
    description: "ご自身の持ち物を、元気なうちから整理するお手伝いをします。",
  },
  {
    value: "appraisal",
    label: "査定を依頼する",
    description:
      "AIによる概算金額をもとに、当社スタッフが実際に品物を確認して本査定を行います。",
  },
];

export const FAMILY_RELATION_OPTIONS: {
  value: FamilyRelation;
  label: string;
}[] = [
  { value: "father", label: "父親" },
  { value: "mother", label: "母親" },
  { value: "grandfather", label: "祖父" },
  { value: "grandmother", label: "祖母" },
  { value: "uncle", label: "伯父・叔父" },
  { value: "aunt", label: "伯母・叔母" },
  { value: "older_brother", label: "兄" },
  { value: "older_sister", label: "姉" },
  { value: "younger_brother", label: "弟" },
  { value: "younger_sister", label: "妹" },
  { value: "spouse", label: "配偶者" },
  { value: "son", label: "息子" },
  { value: "daughter", label: "娘" },
  { value: "grandson", label: "孫息子" },
  { value: "granddaughter", label: "孫娘" },
  { value: "other", label: "その他" },
];

const LEGACY_FAMILY_RELATION_LABEL: Record<string, string> = {
  eldest_son: "長男",
  eldest_daughter: "長女",
};

export function familyRelationLabel(value: string | null | undefined): string {
  if (!value) return "未設定";
  const found = FAMILY_RELATION_OPTIONS.find((o) => o.value === value);
  if (found) return found.label;
  return LEGACY_FAMILY_RELATION_LABEL[value] ?? "その他";
}

export const FAMILY_RELATION_GENERATION: Record<string, number> = {
  grandfather: -2,
  grandmother: -2,
  father: -1,
  mother: -1,
  uncle: -1,
  aunt: -1,
  older_brother: 0,
  older_sister: 0,
  younger_brother: 0,
  younger_sister: 0,
  spouse: 0,
  son: 1,
  daughter: 1,
  eldest_son: 1,
  eldest_daughter: 1,
  grandson: 2,
  granddaughter: 2,
};

export function familyGenerationDelta(relation: string): number {
  return FAMILY_RELATION_GENERATION[relation] ?? 0;
}

export const DISPOSITION_BADGE_STYLE: Record<Disposition, string> = {
  keep: "bg-green-100 text-green-700",
  organize: "bg-orange-100 text-orange-700",
  unsure: "bg-black/5 text-ink/60",
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

export const ITEM_STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
  { value: "photo_registered", label: "写真登録" },
  { value: "appraisal_pending", label: "査定待ち" },
  { value: "appraisal_done", label: "査定完了" },
  { value: "family_confirmed", label: "家族確認" },
  { value: "policy_recorded", label: "方針記録済み" },
  { value: "transport_scheduled", label: "搬送予定・搬出" },
  { value: "completed", label: "完了" },
];

export const ITEM_STATUS_BADGE_STYLE: Record<ItemStatus, string> = {
  photo_registered: "bg-black/5 text-ink/60",
  appraisal_pending: "bg-sky-100 text-sky-700",
  appraisal_done: "bg-sky-100 text-sky-800",
  family_confirmed: "bg-gold/25 text-green-800",
  policy_recorded: "bg-orange-100 text-orange-700",
  transport_scheduled: "bg-orange-100 text-orange-800",
  completed: "bg-green-100 text-green-700",
};

export const DIGITAL_ITEM_STATUS_OPTIONS: {
  value: DigitalItemStatus;
  label: string;
}[] = [
  { value: "not_started", label: "未着手" },
  { value: "in_progress", label: "対応中" },
  { value: "done", label: "完了" },
];

export const VOICE_CHECKIN_SLOT_LABELS: Record<"lunch" | "evening" | "night", string> = {
  lunch: "お昼",
  evening: "夕方",
  night: "夜",
};
