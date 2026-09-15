"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Live" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/rankings", label: "Rankings" },
  { href: "/players", label: "Players" },
  { href: "/matches", label: "Matches" },
  { href: "/stats", label: "Stats" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
      {NAV_LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "text-brand-gold-500"
                : "text-zinc-400 transition-colors hover:text-brand-gold-500"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
