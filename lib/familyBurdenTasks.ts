import type { CategoryMajor, Disposition, DigitalItemStatus, DigitalItemType, ItemStatus } from "@/lib/types";

// 家族負担・残作業量の判定エンジン(請求項6対応)
// 「遺品・契約ごとに必要タスクを生成し、未完了タスクを集計する。
//   査定、家族確認、売却、整理、搬送、名義変更、契約解除等の作業カテゴリを管理する。
//   各タスクに想定工数を持たせ、カテゴリ別件数・推定残時間・進捗率を表示する。
//   想定工数はマスタ値とし、実績から後で改善可能な設計とする」に対応
//
// ルールベースで、登録済みの遺品・デジタル情報の現在の状態から
// 「残っている作業」をタスクとして機械的に導出する。

export type TaskCategory =
  | "appraisal"
  | "family_confirm"
  | "sell"
  | "discard"
  | "transport"
  | "name_change"
  | "contract_cancel";

export const TASK_CATEGORY_LABEL: Record<TaskCategory, string> = {
  appraisal: "査定",
  family_confirm: "家族確認",
  sell: "売却",
  discard: "整理",
  transport: "搬送・搬出",
  name_change: "名義変更",
  contract_cancel: "契約解除",
};

// 想定工数マスタ(時間)。実績データが蓄積された後、ここを調整することで改善できる設計。
// discard/transportは品物の大きさによって作業時間が大きく変わるため、
// ここでの値は使われず、代わりに itemSizeHours() のサイズ別工数を使う。
export const TASK_HOUR_MASTER: Record<TaskCategory, number> = {
  appraisal: 0.5,
  family_confirm: 0.25,
  sell: 1,
  discard: 0.5,
  transport: 1,
  name_change: 0.75,
  contract_cancel: 0.5,
};

// 家具・家電など、運び出し・搬出に手間がかかる「大型」品目のジャンル。
// それ以外は「小物」として扱う。
const LARGE_ITEM_CATEGORIES: CategoryMajor[] = ["furniture", "appliance"];

// 品目の大きさに応じた作業時間(時間単位)。小物=5分、大型=15分。
function itemSizeHours(categoryMajor: CategoryMajor | null | undefined): number {
  if (categoryMajor && LARGE_ITEM_CATEGORIES.includes(categoryMajor)) {
    return 15 / 60;
  }
  return 5 / 60;
}

// 品目の大きさによって作業時間が変わるタスクカテゴリ(処分・搬送)かどうか。
function isSizeSensitiveCategory(category: TaskCategory): boolean {
  return category === "discard" || category === "transport";
}

function taskHours(
  category: TaskCategory,
  categoryMajor: CategoryMajor | null | undefined
): number {
  if (isSizeSensitiveCategory(category)) {
    return itemSizeHours(categoryMajor);
  }
  return TASK_HOUR_MASTER[category];
}

export type BurdenTask = {
  category: TaskCategory;
  refId: string;
  refLabel: string;
  hours: number;
};

function itemTaskCategory(
  status: ItemStatus,
  disposition: Disposition | string | null
): TaskCategory | null {
  switch (status) {
    case "photo_registered":
    case "appraisal_pending":
      return "appraisal";
    case "appraisal_done":
      return "family_confirm";
    case "family_confirmed":
      // "organize"が現在の値。"sell"/"discard"は旧5択時代のデータとの互換のため引き続き判定する。
      if (disposition === "sell") return "sell";
      if (disposition === "organize" || disposition === "discard") return "discard";
      return "transport";
    case "policy_recorded":
      return "transport";
    case "transport_scheduled":
      return "transport";
    case "completed":
    default:
      return null;
  }
}

function digitalTaskCategory(
  itemType: DigitalItemType,
  status: DigitalItemStatus
): TaskCategory | null {
  if (status === "done") return null;
  if (itemType === "finance" || itemType === "insurance") return "name_change";
  return "contract_cancel";
}

export function buildFamilyBurdenTasks(
  items: { id: string; name: string; status: ItemStatus | null; disposition: Disposition | null; category_major?: CategoryMajor | null }[],
  digitalItems: { id: string; title: string; item_type: DigitalItemType; status: DigitalItemStatus | null }[]
): BurdenTask[] {
  const tasks: BurdenTask[] = [];

  for (const item of items) {
    const category = itemTaskCategory(item.status ?? "photo_registered", item.disposition);
    if (category) {
      tasks.push({
        category,
        refId: item.id,
        refLabel: item.name,
        hours: taskHours(category, item.category_major),
      });
    }
  }

  for (const digital of digitalItems) {
    const category = digitalTaskCategory(digital.item_type, digital.status ?? "not_started");
    if (category) {
      tasks.push({
        category,
        refId: digital.id,
        refLabel: digital.title,
        hours: TASK_HOUR_MASTER[category],
      });
    }
  }

  return tasks;
}

export type BurdenSummary = {
  category: TaskCategory;
  label: string;
  count: number;
  hours: number;
};

export function summarizeBurdenTasks(tasks: BurdenTask[]): BurdenSummary[] {
  const countMap = new Map<TaskCategory, number>();
  const hoursMap = new Map<TaskCategory, number>();
  for (const t of tasks) {
    countMap.set(t.category, (countMap.get(t.category) ?? 0) + 1);
    hoursMap.set(t.category, (hoursMap.get(t.category) ?? 0) + t.hours);
  }
  return (Object.keys(TASK_CATEGORY_LABEL) as TaskCategory[])
    .map((category) => ({
      category,
      label: TASK_CATEGORY_LABEL[category],
      count: countMap.get(category) ?? 0,
      hours: Math.round((hoursMap.get(category) ?? 0) * 100) / 100,
    }))
    .filter((s) => s.count > 0);
}
