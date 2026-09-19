"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/home",
    label: "ホーム",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M4 11.5 12 4l8 7.5"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/items",
    label: "見る・探す",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <circle
          cx="11"
          cy="11"
          r="6.5"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.5}
        />
        <path
          d="m20 20-3.5-3.5"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.5}
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/items/new",
    label: "記録",
    isAction: true,
    icon: (_active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path
          d="M12 5v14M5 12h14"
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/request",
    label: "ご依頼",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <rect
          x="4"
          y="8"
          width="16"
          height="12"
          rx="2"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.5}
          strokeLinejoin="round"
        />
        <path
          d="M9 8V6a3 3 0 0 1 6 0v2"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.5}
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "設定",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <circle
          cx="12"
          cy="12"
          r="2.75"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.5}
        />
        <path
          d="M12 3.5v2.2M12 18.3v2.2M4.9 6.1l1.6 1.6M17.5 16.3l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 17.9l1.6-1.6M17.5 7.7l1.6-1.6"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.5}
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-green-100 bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-end px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 sm:px-8">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/home" &&
              item.href !== "/items/new" &&
              pathname.startsWith(item.href));

          if (item.isAction) {
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-green-700 text-cream shadow-md transition hover:bg-green-800"
              >
                {item.icon(false)}
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 px-1 py-1 text-[11px] transition ${
                active ? "text-green-700" : "text-ink/45 hover:text-ink/70"
              }`}
            >
              {item.icon(active)}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
