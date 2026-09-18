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
    href: "/locations",
    label: "場所",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.5}
          strokeLinejoin="round"
        />
        <circle
          cx="12"
          cy="9.5"
          r="2.25"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.5}
        />
      </svg>
    ),
  },
  {
    href: "/progress",
    label: "進捗",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <circle
          cx="12"
          cy="12"
          r="8"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.5}
        />
        <path
          d="M12 7v5l3.5 2"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-green-100 bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-end justify-between px-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 sm:px-8">
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
              className={`flex flex-col items-center gap-1 px-2 py-1 text-[11px] transition ${
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
