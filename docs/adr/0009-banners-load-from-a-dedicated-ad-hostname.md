# Banners load from a dedicated ad hostname

Visitors who block ads must be able to block our sponsor Banners the way they block any other ad. A DNS blocker such as Pi-hole only sees hostnames, so an image served from the site's own hostname can never be blocked without blocking the site. Banner images are therefore loaded from `ADS_ORIGIN`, a second hostname (e.g. `ads.<domain>`) pointing at the same web service, under an `/ads/` path, as a plain `<img>`. A Banner whose image fails to load removes itself, so a blocked Banner leaves no empty frame.

## Considered Options
- Serve from the site's own hostname only — rejected: browser extensions can still block the `/ads/` path, but Pi-hole cannot.
- `next/image` — rejected: its optimizer re-serves the file from `/_next/image` on the site's own hostname, which undoes the separate hostname.
- A third-party ad network — rejected: the point is one directly-arranged sponsor, without third-party tracking.

## Consequences
- With `ADS_ORIGIN` unset (local development), Banners load from the site's own `/ads/` path and only browser ad blockers can block them.
- The ad hostname is not on any public blocklist by default; a Pi-hole user blocks it themselves, or has it caught by a regex list matching `ads.` hostnames.
- The whole site also answers on the ad hostname, since it is the same service.
