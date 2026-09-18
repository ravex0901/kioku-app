export function ProgressBar({
  ratio,
  colorClassName = "bg-green-500",
}: {
  ratio: number;
  colorClassName?: string;
}) {
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));

  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/5">
      <div
        className={`h-full rounded-full ${colorClassName} transition-all`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
