import type { CategoryMajor, Disposition, DigitalItemStatus, DigitalItemType, ItemStatus } from "@/lib/types";

// 家族負担・残作業量の判定エンジン(請求項6対応)
// 「遺品・契約ごとに必要タスクを生成し、未完了タスクを集計する。
//   査定、家族確認、売却、処分、搬送、名義変更、契約解除等の作業カテゴリを管理する。
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
  discard: "処分",
  transport: "搬送・搬出",
  name_change: "名義変更",
  contract_cancel: "契約解除",
};

// 想定工数マスタ(時間)。実績データが蓄積された後、ここを調整することで改善できる設計。
export const TASK_HOUR_MASTER: Record<TaskCategory, number> = {
  appraisal: 0.5,
  family_confirm: 0.25,
  sell: 1,
  discard: 0.5,
  transport: 1,
  name_change: 0.75,
  contract_cancel: 0.5,
};

export type BurdenTask = {
  category: TaskCategory;
  refId: string;
  refLabel: string;
};

function itemTaskCategory(
  status: ItemStatus,
  disposition: Disposition | null
): TaskCategory | null {
  switch (status) {
    case "photo_registered":
    case "appraisal_pending":
      return "appraisal";
    case "appraisal_done":
      return "family_confirm";
    case "family_confirmed":
      if (disposition === "sell") return "sell";
      if (disposition === "discard") return "discard";
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
      tasks.push({ category, refId: item.id, refLabel: item.name });
    }
  }

  for (const digital of digitalItems) {
    const category = digitalTaskCategory(digital.item_type, digital.status ?? "not_started");
    if (category) {
      tasks.push({ category, refId: digital.id, refLabel: digital.title });
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
  const map = new Map<TaskCategory, number>();
  for (const t of tasks) {
    map.set(t.category, (map.get(t.category) ?? 0) + 1);
  }
  return (Object.keys(TASK_CATEGORY_LABEL) as TaskCategory[])
    .map((category) => ({
      category,
      label: TASK_CATEGORY_LABEL[category],
      count: map.get(category) ?? 0,
      hours: (map.get(category) ?? 0) * TASK_HOUR_MASTER[category],
    }))
    .filter((s) => s.count > 0);
}
