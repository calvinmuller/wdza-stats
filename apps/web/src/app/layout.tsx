import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { Barlow_Condensed } from "next/font/google";
import { NavLinks } from "@/components/nav-links";
import { PlayerSignIn } from "@/components/player-sign-in";
import { ServerPicker } from "@/components/server-picker";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const GA_MEASUREMENT_ID = "G-BNZZV19NZB";
const DONATE_URL = "https://www.paypal.com/ncp/payment/TDMRPS6W7HB6E";

const heading = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-heading",
});

export const metadata = {
  title: "WDZA Stats",
  description: "Live status and leaderboards for the WDZA Wardogs server.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={heading.variable}>
      <body className="flex min-h-screen flex-col bg-zinc-950 text-zinc-200">
        <ThemeProvider>
          <header className="border-b border-white/10 bg-zinc-900/60">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4 sm:px-6">
              <Link href="/" className="flex items-center gap-3">
                <Image
                  src="/logo.png"
                  alt="WDZA Wardogs"
                  width={40}
                  height={40}
                  className="rounded-md"
                  priority
                />
                <span className="font-display text-2xl tracking-wide text-zinc-50">
                  WDZA <span className="text-brand-gold-500">Stats</span>
                </span>
              </Link>
              <NavLinks />
              <div className="ml-auto flex items-center gap-2">
                <ServerPicker />
                <PlayerSignIn />
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
            {children}
          </main>

          <footer className="sticky bottom-0 z-20 border-t border-white/10 bg-zinc-950/90 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-xs text-zinc-500 sm:px-6">
              <span className="hidden sm:inline">
                WDZA Wardogs &middot; stats update automatically from the live server
              </span>
              <div className="ml-auto flex items-center gap-2">
                <a
                  href={DONATE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-brand-gold-500/40 px-3 py-1 font-medium text-brand-gold-500 transition-colors hover:bg-brand-gold-500/10"
                >
                  Donate
                </a>
                <ThemeToggle />
              </div>
            </div>
          </footer>
        </ThemeProvider>

        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
