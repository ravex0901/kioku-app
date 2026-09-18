import { DISPOSITION_BADGE_STYLE, DISPOSITION_OPTIONS, labelFor } from "@/lib/constants";
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
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${DISPOSITION_BADGE_STYLE[disposition]}`}
    >
      {labelFor(DISPOSITION_OPTIONS, disposition)}
    </span>
  );
}
