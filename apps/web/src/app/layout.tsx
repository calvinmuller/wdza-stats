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
      <body>{children}</body>
    </html>
  );
}
