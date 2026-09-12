import Link from "next/link";
import "./globals.css";

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
    <html lang="en">
      <body>
        <nav className="site-nav">
          <Link href="/">Live</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/players">Players</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
