import {
  CATEGORY_OPTIONS,
  dispositionBadgeStyle,
  dispositionLabel,
  labelFor,
} from "@/lib/constants";
import type { FamilyItemsResult } from "@/app/actions/familyItems";

/**
 * ご家族の持ち物を、読み取り専用で一覧表示する。
 * 持ち主が「持ち物の記録を、つながっているご家族にも見せる」にチェックを入れている場合だけ表示される。
 */
export function FamilyItemsView({
  ownerName,
  result,
}: {
  ownerName: string;
  result: FamilyItemsResult;
}) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-bold text-ink">
        {ownerName}さんの持ち物
      </h2>
      {!result.ok ? (
        <p className="text-sm text-red-600">{result.error}</p>
      ) : !result.canView ? (
        <p className="rounded-xl border border-black/5 bg-white/70 px-4 py-3 text-sm text-ink/60">
          {ownerName}さんは、持ち物の記録をご家族に公開していません。
          {ownerName}さんが設定画面で「持ち物の記録を、つながっているご家族にも見せる」にチェックを入れると、ここに表示されます。
        </p>
      ) : result.items.length === 0 ? (
        <p className="text-sm text-ink/50">まだ持ち物が登録されていません。</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {result.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-green-100 bg-white/70 shadow-sm"
            >
              <div className="aspect-square w-full bg-green-50">
                {item.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photoUrl}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-green-300">
                    写真なし
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <span className="truncate text-sm font-medium text-ink">
                  {item.name}
                </span>
                <span className="truncate text-xs text-ink/50">
                  {labelFor(CATEGORY_OPTIONS, item.categoryMajor)}
                </span>
                <span
                  className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${dispositionBadgeStyle(
                    item.disposition
                  )}`}
                >
                  {dispositionLabel(item.disposition)}
                </span>
                {item.memo && (
                  <p className="line-clamp-3 text-xs text-ink/60">{item.memo}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
