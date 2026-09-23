import Image from "next/image";
import Link from "next/link";
import { Barlow_Condensed } from "next/font/google";
import { NavLinks } from "@/components/nav-links";
import { PlayerSignIn } from "@/components/player-sign-in";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

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
                <PlayerSignIn />
                <ThemeToggle />
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
            {children}
          </main>

          <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-zinc-500 sm:px-6">
            WDZA Wardogs &middot; stats update automatically from the live server
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
