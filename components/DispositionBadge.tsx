import { dispositionBadgeStyle, dispositionLabel } from "@/lib/constants";
import type { Disposition } from "@/lib/types";

export function DispositionBadge({
  disposition,
}: {
  disposition: Disposition | null;
}) {
  if (!disposition) {
    return (
      <span className="inline-flex items-center rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-medium text-ink/50">
        未設定
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${dispositionBadgeStyle(disposition)}`}
    >
      {dispositionLabel(disposition)}
    </span>
  );
}
