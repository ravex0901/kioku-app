import type { ConversationDayGroup } from "@/app/actions/conversationLog";
import type { JournalEntry } from "@/lib/types";

function formatJstDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/**
 * 家系図から紐付け済みの家族アカウントをタップしたときに表示する、
 * その相手の「AIと日記」の読み取り専用ビュー。
 * 自分で回答することはできず、これまでの記録を見るだけの画面。
 */
export function FamilyJournalViewClient({
  ownerName,
  history,
  audioMap,
  conversationLogs,
}: {
  ownerName: string;
  history: JournalEntry[];
  audioMap: Record<string, string>;
  conversationLogs: ConversationDayGroup[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="mb-3 text-lg font-bold text-ink">
          {ownerName}さんのこれまでの記録
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-ink/50">
            まだ記録がありません。{ownerName}さんが質問に答えると、ここに表示されます。
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {history.map((h) => (
              <div
                key={h.id}
                className="rounded-2xl border border-green-100 bg-white/70 p-5 shadow-sm"
              >
                <p className="text-xs text-ink/40">
                  {new Date(h.answered_at ?? h.created_at).toLocaleDateString(
                    "ja-JP"
                  )}
                </p>
                <p className="mt-1 font-serif-jp text-sm font-bold text-ink">
                  {h.question}
                </p>
                {h.answer_text && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink/80">
                    {h.answer_text}
                  </p>
                )}
                {h.answer_audio_path && audioMap[h.answer_audio_path] && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <audio
                    src={audioMap[h.answer_audio_path]}
                    controls
                    className="mt-2 w-full"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {conversationLogs.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink">
            {ownerName}さんとAIの会話の記録
          </h2>
          <div className="flex flex-col gap-4">
            {conversationLogs.map((group) => (
              <div
                key={group.date}
                className="rounded-2xl border border-black/5 bg-black/[0.02] p-5"
              >
                <p className="mb-2 text-xs font-semibold text-ink/50">
                  {formatJstDateLabel(group.date)}
                </p>
                <div className="flex flex-col gap-3">
                  {group.entries.map((entry) => (
                    <div key={entry.id} className="text-sm">
                      <p className="text-ink/60">{entry.question}</p>
                      <p className="mt-0.5 text-ink/90">{entry.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
