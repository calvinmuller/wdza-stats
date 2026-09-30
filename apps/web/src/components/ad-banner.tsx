"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Banner } from "@/lib/banners";

// The creatives carry their own colours (white text on the rectangle, navy
// text on the wordmark), so each sits on a fixed backing rather than a themed
// zinc one - arbitrary hex values, since `white` and the zinc scale flip in
// light mode (see globals.css).
const IMAGE_CLASS: Record<Banner["placement"], string> = {
  header: "h-5 w-auto",
  sidebar: "h-auto w-full rounded-lg bg-[#070b24]",
  content: "h-auto w-full rounded-lg",
};

/**
 * One sponsor Banner. Renders nothing in the admin area, and removes itself
 * when its image can't load, so a visitor blocking ads sees no empty frame.
 */
export function AdBanner({ banner, className = "" }: { banner: Banner | null; className?: string }) {
  const pathname = usePathname() ?? "";
  const imageRef = useRef<HTMLImageElement>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  // An image that failed before hydration never fires onError on this
  // component, so check the already-settled state once on mount too.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setIsBlocked(true);
  }, []);

  if (!banner || isBlocked || pathname.startsWith("/admin")) return null;

  const isHeader = banner.placement === "header";

  return (
    // `ad-banner` styles nothing: it is there for ad blockers' cosmetic filters.
    <aside aria-label="Sponsor" className={`ad-banner ${className}`}>
      <a
        href={banner.href}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className={
          isHeader
            ? "flex items-center gap-2 rounded-md bg-[#ffffff] px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[#52525b]"
            : "block"
        }
      >
        {isHeader && <span>Sponsored by</span>}
        {/* Not next/image: its optimizer would re-serve the file from this
            site's own hostname, where a DNS ad blocker can't tell it apart
            from the page (docs/adr/0009). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={banner.src}
          alt={banner.alt}
          width={banner.width}
          height={banner.height}
          loading={isHeader ? "eager" : "lazy"}
          onError={() => setIsBlocked(true)}
          className={IMAGE_CLASS[banner.placement]}
        />
      </a>
      {!isHeader && <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-zinc-500">Sponsored</p>}
    </aside>
  );
}
