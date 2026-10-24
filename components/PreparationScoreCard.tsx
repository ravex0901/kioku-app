// 「準備の進み具合」カード(ダッシュボードと同じ計算・見た目)。
// ご家族向けの「もしもの時」画面で使う。

function ScoreRing({ percent }: { percent: number }) {
  const size = 88;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        style={{ stroke: "rgba(58,51,43,0.08)" }}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ stroke: "#4e7d5b" }}
      />
      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="20"
        fontWeight="700"
        fill="#3a332b"
      >
        {clamped}
      </text>
    </svg>
  );
}

function ScoreBar({ label, percent }: { label: string; percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-ink/60">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
        <div
          className="h-full rounded-full bg-green-500 transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-xs text-ink/60">
        {clamped}%
      </span>
    </div>
  );
}

export function PreparationScoreCard({
  total,
  located,
  dispositionDecided,
  digitalCount,
  hasMessage,
  hasVideo,
}: {
  total: number;
  located: number;
  dispositionDecided: number;
  digitalCount: number;
  hasMessage: boolean;
  hasVideo: boolean;
}) {
  const locatedPercent = total > 0 ? Math.round((located / total) * 100) : 0;
  const dispositionPercent =
    total > 0 ? Math.round((dispositionDecided / total) * 100) : 0;
  const digitalPercent = digitalCount > 0 ? 100 : 0;
  const endingNotePercent = hasMessage ? 100 : 0;
  const willVideoPercent = hasVideo ? 100 : 0;
  const overallScore = Math.round(
    (locatedPercent +
      dispositionPercent +
      digitalPercent +
      endingNotePercent +
      willVideoPercent) /
      5
  );

  return (
    <div className="rounded-[1.75rem] border border-green-100 bg-white/70 p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-4">
        <ScoreRing percent={overallScore} />
        <p className="text-sm text-ink/60">準備の進み具合(100点満点)</p>
      </div>
      <div className="mt-5 flex flex-col gap-2.5">
        <ScoreBar label="保管場所" percent={locatedPercent} />
        <ScoreBar label="仕分けの方針" percent={dispositionPercent} />
        <ScoreBar label="デジタルの情報" percent={digitalPercent} />
        <ScoreBar label="エンディングノート" percent={endingNotePercent} />
        <ScoreBar label="遺言のビデオ" percent={willVideoPercent} />
      </div>
    </div>
  );
}
