import Link from "next/link";

export function ItemRegisterTabs({ active }: { active: "single" | "bulk" }) {
  const tabs = [
    { key: "single", href: "/items/new", label: "1件ずつ登録する" },
    { key: "bulk", href: "/items/new/bulk", label: "まとめて登録する" },
  ] as const;

  return (
    <div className="mb-6 flex gap-2 border-b border-green-100">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
            active === tab.key
              ? "border-green-600 text-green-700"
              : "border-transparent text-ink/50 hover:text-ink/80"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
