"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; adminOnly: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Players", adminOnly: false },
  { href: "/admin/kick-votes", label: "Kick Votes", adminOnly: false },
  { href: "/admin/xp", label: "XP & Levels", adminOnly: true },
  { href: "/admin/challenges", label: "Challenges", adminOnly: true },
  { href: "/admin/achievements", label: "Achievements", adminOnly: true },
  { href: "/admin/notifications", label: "Notifications", adminOnly: true },
  { href: "/admin/server-token", label: "Server Token", adminOnly: true },
  { href: "/admin/staff", label: "Staff", adminOnly: true },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Admin sections" className="flex flex-wrap gap-1 border-b border-white/10 text-sm font-medium">
      {NAV_ITEMS.filter((item) => isAdmin || !item.adminOnly).map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 transition-colors ${
              active
                ? "border-brand-gold-500 text-brand-gold-500"
                : "border-transparent text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
