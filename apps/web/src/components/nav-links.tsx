"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { serverPath } from "@/lib/server-path";

const NAV_LINKS = [
  { path: "", label: "Live" },
  { path: "/leaderboard", label: "Leaderboard" },
  { path: "/weapons", label: "Weapons" },
  { path: "/rankings", label: "Rankings" },
  { path: "/players", label: "Players" },
  { path: "/matches", label: "Matches" },
  { path: "/stats", label: "Stats" },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

// The sections of the Server being looked at. Outside /servers/{slug} (admin,
// the KickVote pages) the links are the old top-level paths, which send a
// visitor to the default Server.
export function NavLinks() {
  const pathname = usePathname();
  const serverSlug = useParams<{ server?: string }>()?.server;
  const base = serverSlug ? serverPath(serverSlug) : "";

  return (
    <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
      {NAV_LINKS.map((link) => {
        const href = `${base}${link.path}` || "/";
        const active = isActive(pathname, href, link.path === "");
        return (
          <Link
            key={link.path}
            href={href}
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
