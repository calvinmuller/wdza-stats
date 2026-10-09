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

// Pages that span every Server, so their links never take a Server's base.
const UNSCOPED_LINKS = [
  { href: "/bans", label: "Bans" },
  { href: "/whitelist", label: "Whitelist" },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

// The sections of the Server being looked at. Outside /servers/{slug} (the
// home page, a player's overview, admin, the KickVote pages) the links are
// the old top-level paths, which send a visitor to the default Server - all
// but Live, since "/" is no longer a Server's dashboard (docs/adr/0012).
// Bans and the Whitelist follow on every page.
export function NavLinks() {
  const pathname = usePathname();
  const serverSlug = useParams<{ server?: string }>()?.server;
  const base = serverSlug ? serverPath(serverSlug) : "";
  const serverLinks = serverSlug ? NAV_LINKS : NAV_LINKS.filter((link) => link.path !== "");
  const links = [
    ...serverLinks.map((link) => ({ href: `${base}${link.path}`, label: link.label, exact: link.path === "" })),
    ...UNSCOPED_LINKS.map((link) => ({ ...link, exact: false })),
  ];

  return (
    <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
      {links.map(({ href, label, exact }) => {
        const active = isActive(pathname, href, exact);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "text-brand-gold-500"
                : "text-zinc-400 transition-colors hover:text-brand-gold-500"
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
