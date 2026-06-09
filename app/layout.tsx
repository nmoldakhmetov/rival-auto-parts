import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rival Auto Parts — B2B портал",
  description: "Закрытый оптовый портал автозапчастей",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
